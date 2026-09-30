"""What the forge does to an Issue's `status:*` labels, and what it never does.

#770 wires the closed-Issue rule of #121 and #130 to the closure that breaks it and
repairs the Issues it missed; #214 adds the open-Issue half. Each rule is proved by the
case that must act and by a negative control that must not, over an in-memory forge that
answers exactly the `gh` calls the script makes and fails the test on any other call.
That is how "never adds a label, never closes or reopens anything" is proved rather than
assumed: there is no call through which it could.

Text assertions on the workflow rather than a YAML parse, like the other workflow tests:
this runs in the policy-guard job with nothing but the standard library.
"""

import ast
import contextlib
import io
import itertools
import json
import os
import pathlib
import re
import subprocess
import sys
import tempfile
import unittest
import urllib.parse
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

import cleanup_closed_issues  # noqa: E402
import issue_status  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts" / "issue_status.py"
WORKFLOW = ROOT / ".github" / "workflows" / "issue-status.yml"

REPO = "owner/repo"
BASE = datetime(2026, 9, 6, 11, 0, 0, tzinfo=timezone.utc)

# The axes the rule must never touch (#770 non-goals).
OTHER_AXES = ["priority:normal", "type:bug", "area:tooling", "policy", "qa"]


class FakeForge:
    """Issues in memory, reachable only through the `gh` calls issue_status.py makes.

    `apply` and `take_off` are the world acting - a person, a role - and record label
    events the way GitHub does, one second apart unless told they came in one request.
    The `gh` side answers a read of an Issue, a read of its events, the closed-Issue
    listing (two items to a page, so pagination is exercised) and the removal of one
    label; anything else raises inside the script under test.
    """

    PAGE = 2

    def __init__(self):
        self.issues = {}
        self.calls = []
        self.clock = 0
        self.next_id = 30_000_000_000
        self.refused = {}  # label name -> stderr of a removal that fails
        self.lag = {}  # Issue -> newest events its history has not caught up with yet
        self.after_listing = None  # runs once, right after the listing is answered

    # -- the world

    def add(self, number, *, state="open", labels=(), pull_request=False, actor="setup"):
        self.issues[number] = {"state": state, "labels": [], "events": [], "pull_request": pull_request}
        for name in labels:
            self.apply(number, name, actor=actor)
        return self

    def _record(self, number, kind, name, actor, same_second):
        if not same_second:
            self.clock += 1
        self.next_id += 1
        self.issues[number]["events"].append({
            "id": self.next_id,
            "event": kind,
            "created_at": (BASE + timedelta(seconds=self.clock)).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "label": {"name": name, "color": "ededed"} if name else None,
            "actor": {"login": actor},
        })

    def apply(self, number, name, *, actor="someone", same_second=False):
        labels = self.issues[number]["labels"]
        if name in labels:
            return False  # GitHub records nothing for a label that is already there
        labels.append(name)
        self._record(number, "labeled", name, actor, same_second)
        return True

    def take_off(self, number, name, *, actor="someone"):
        self.issues[number]["labels"].remove(name)
        self._record(number, "unlabeled", name, actor, False)

    def set_state(self, number, state, *, actor="someone"):
        self.issues[number]["state"] = state
        self._record(number, "closed" if state == "closed" else "reopened", None, actor, False)

    def labels(self, number):
        return list(self.issues[number]["labels"])

    def status(self, number):
        return [name for name in self.labels(number) if cleanup_closed_issues.is_status_label(name)]

    @property
    def removals(self):
        return [call for call in self.calls if call[:3] == ["api", "--method", "DELETE"]]

    # -- gh

    def __call__(self, args):
        self.calls.append(list(args))
        if len(args) == 2 and args[0] == "api":
            return self._issue(args[1])
        if len(args) == 4 and args[:3] == ["api", "--paginate", "--slurp"]:
            return self._listing(args[3])
        if len(args) == 4 and args[:3] == ["api", "--method", "DELETE"]:
            return self._remove(args[3])
        raise AssertionError("issue_status made a call it must never make: gh %s" % " ".join(args))

    @staticmethod
    def _answer(payload=None, code=0, stderr=""):
        stdout = "" if payload is None else json.dumps(payload)
        return subprocess.CompletedProcess(["gh"], code, stdout, stderr)

    def _as_listed(self, number):
        issue = self.issues[number]
        body = {
            "number": number,
            "state": issue["state"],
            "labels": [{"name": name, "color": "ededed"} for name in issue["labels"]],
        }
        if issue["pull_request"]:
            body["pull_request"] = {"url": "https://example.invalid/pulls/%d" % number}
        return body

    def _paged(self, items):
        return [items[i:i + self.PAGE] for i in range(0, len(items), self.PAGE)] or [[]]

    def _issue(self, path):
        match = re.fullmatch(r"repos/%s/issues/(\d+)" % re.escape(REPO), path)
        if not match:
            raise AssertionError("unexpected read: %s" % path)
        number = int(match.group(1))
        if number not in self.issues:
            return self._answer({"message": "Not Found"}, 1, "gh: Not Found (HTTP 404)")
        return self._answer(self._as_listed(number))

    def _listing(self, path):
        events = re.fullmatch(r"repos/%s/issues/(\d+)/events\?per_page=100" % re.escape(REPO), path)
        if events:
            number = int(events.group(1))
            history = self.issues[number]["events"]
            behind = self.lag.get(number, 0)
            return self._answer(self._paged(history[:len(history) - behind]))
        if path == "repos/%s/issues?state=closed&per_page=100" % REPO:
            closed = [self._as_listed(n) for n in sorted(self.issues) if self.issues[n]["state"] == "closed"]
            answer = self._answer(self._paged(closed))
            hook, self.after_listing = self.after_listing, None
            if hook:
                hook()
            return answer
        raise AssertionError("unexpected listing: %s" % path)

    def _remove(self, path):
        match = re.fullmatch(r"repos/%s/issues/(\d+)/labels/([^/?#]+)" % re.escape(REPO), path)
        if not match:
            raise AssertionError("unexpected removal: %s" % path)
        number, name = int(match.group(1)), urllib.parse.unquote(match.group(2))
        if name in self.refused:
            return self._answer({"message": "Server Error"}, 1, self.refused[name])
        if name not in self.issues[number]["labels"]:
            return self._answer({"message": "Label does not exist"}, 1, "gh: Label does not exist (HTTP 404)")
        self.take_off(number, name, actor="github-actions[bot]")
        return self._answer(self._as_listed(number)["labels"])


def follow(forge, number, action, applied=None, **kwargs):
    return issue_status.follow(REPO, number, action, applied, gh=forge, **kwargs)


def run_main(argv, forge, *, summary=True):
    """`main` as the workflow calls it: (exit code, stdout, step summary or None)."""
    out = io.StringIO()
    with tempfile.TemporaryDirectory() as scratch:
        path = pathlib.Path(scratch) / "summary.md"
        with patch.object(issue_status, "_gh", forge), \
                patch.object(issue_status, "PAUSE_SECONDS", 0), \
                patch.dict(os.environ, {}), \
                contextlib.redirect_stdout(out):
            # Never the real one: this suite runs inside a workflow step that has one.
            os.environ.pop("GITHUB_STEP_SUMMARY", None)
            if summary:
                os.environ["GITHUB_STEP_SUMMARY"] = str(path)
            code = issue_status.main(argv)
        written = path.read_text(encoding="utf-8") if path.exists() else None
    return code, out.getvalue(), written


class DefinitionTests(unittest.TestCase):
    def test_the_rule_uses_the_cleanup_scripts_definition(self):
        # #770 scope and #214: "reuse the classification in cleanup_closed_issues.py
        # rather than writing a second definition of what a status:* label is".
        self.assertIs(issue_status.is_status_label, cleanup_closed_issues.is_status_label)

    def test_the_prefix_is_spelled_nowhere_in_the_new_script(self):
        tree = ast.parse(SCRIPT.read_text(encoding="utf-8"))
        spelled = [
            node.value for node in ast.walk(tree)
            if isinstance(node, ast.Constant) and isinstance(node.value, str)
            and node.value.startswith("status:")
        ]
        self.assertEqual(spelled, [], "a second definition of the status axis")
        self.assertNotIn("STATUS_PREFIX", SCRIPT.read_text(encoding="utf-8"))

    def test_the_old_filters_and_the_new_rule_agree(self):
        names = ["status:ready", "priority:normal", "status-marker", "stat:x", "status:blocked", "qa"]
        labels = [{"name": name} for name in names]
        self.assertEqual(issue_status.status_labels(names), cleanup_closed_issues.get_status_labels(labels))
        self.assertEqual(
            [name for name in names if name not in issue_status.status_labels(names)],
            cleanup_closed_issues.filter_status_labels(labels),
        )

    def test_the_definition_refuses_what_is_not_a_name(self):
        for value in (None, "", "Status:ready", " status:ready", 7):
            with self.subTest(value=value):
                self.assertFalse(cleanup_closed_issues.is_status_label(value))


class ClosedIssueTests(unittest.TestCase):
    """#121, #130 and #770 criterion 1: a closed Issue carries no `status:*` label."""

    def test_closing_an_issue_removes_every_status_label(self):
        forge = FakeForge().add(765, labels=["status:in-progress", "status:ready"] + OTHER_AXES)
        forge.set_state(765, "closed")
        outcome = follow(forge, 765, "closed")
        self.assertEqual(outcome.removed, ["status:in-progress", "status:ready"])
        self.assertEqual(forge.labels(765), OTHER_AXES)

    def test_what_comes_off_is_exactly_what_the_cleanup_script_names(self):
        labels = ["status:blocked"] + OTHER_AXES + ["status:needs-review"]
        decision = issue_status.decide("closed", "closed", labels)
        self.assertEqual(
            decision.remove,
            cleanup_closed_issues.get_status_labels([{"name": name} for name in labels]),
        )

    def test_a_closed_issue_without_a_status_label_is_only_read(self):
        forge = FakeForge().add(5, state="closed", labels=OTHER_AXES)
        follow(forge, 5, "closed")
        self.assertEqual(forge.calls, [["api", "repos/%s/issues/5" % REPO]])
        self.assertEqual(forge.labels(5), OTHER_AXES)

    def test_an_issue_reopened_before_its_run_keeps_its_labels(self):
        # The event said closed; by the time the run reads it, it is open again.
        forge = FakeForge().add(6, labels=["status:in-progress"] + OTHER_AXES)
        outcome = follow(forge, 6, "closed")
        self.assertEqual(forge.removals, [])
        self.assertIn("reopened", outcome.decision.reason)
        self.assertEqual(forge.status(6), ["status:in-progress"])

    def test_a_status_label_applied_to_a_closed_issue_comes_off(self):
        forge = FakeForge().add(7, state="closed", labels=OTHER_AXES)
        forge.apply(7, "status:ready")
        outcome = follow(forge, 7, "labeled", "status:ready")
        self.assertEqual(outcome.removed, ["status:ready"])
        self.assertEqual(forge.labels(7), OTHER_AXES)

    def test_a_closed_issue_is_decided_by_the_closed_rule_not_the_open_one(self):
        # #214 criterion 4, as a negative control: the open rule would keep the label
        # applied last. On a closed Issue it does not - every status label comes off,
        # exactly the set cleanup_closed_issues.py names.
        forge = FakeForge().add(8, labels=["status:ready"] + OTHER_AXES)
        forge.set_state(8, "closed")
        forge.apply(8, "status:in-progress")
        before = [{"name": name} for name in forge.labels(8)]
        outcome = follow(forge, 8, "labeled", "status:in-progress")
        self.assertIsNone(outcome.decision.keep)
        self.assertEqual(outcome.removed, cleanup_closed_issues.get_status_labels(before))
        self.assertEqual(forge.status(8), [])


class OpenIssueTests(unittest.TestCase):
    """#214 and #770 criterion 2: an open Issue carries one status label, the latest."""

    def test_the_label_just_applied_replaces_the_one_before_it(self):
        forge = FakeForge().add(160, labels=OTHER_AXES)
        forge.apply(160, "status:ready")
        forge.apply(160, "status:in-progress", actor="zendev-author[bot]")
        outcome = follow(forge, 160, "labeled", "status:in-progress")
        self.assertEqual(outcome.removed, ["status:ready"])
        self.assertEqual(outcome.decision.keep, "status:in-progress")
        self.assertEqual(forge.labels(160), OTHER_AXES + ["status:in-progress"])

    def test_one_status_label_is_left_alone(self):
        # Negative control: nothing to decide, so nothing is removed.
        forge = FakeForge().add(9, labels=OTHER_AXES)
        forge.apply(9, "status:in-progress")
        before = forge.labels(9)
        follow(forge, 9, "labeled", "status:in-progress")
        self.assertEqual(forge.removals, [])
        self.assertEqual(forge.labels(9), before)

    def test_an_issue_with_no_status_label_is_left_alone_and_given_none(self):
        # Negative control: the event applied status:ready, and by the time the run
        # starts somebody has taken it off again. Absence is a real state; the run does
        # not put the label back, and removes nothing.
        forge = FakeForge().add(10, labels=OTHER_AXES)
        forge.apply(10, "status:ready")
        forge.take_off(10, "status:ready")
        outcome = follow(forge, 10, "labeled", "status:ready")
        self.assertEqual(forge.removals, [])
        self.assertEqual(forge.labels(10), OTHER_AXES)
        self.assertIn("none is added", outcome.decision.reason)

    def test_a_label_off_the_status_axis_decides_nothing(self):
        # Negative control, even over an Issue that carries two status labels: the rule
        # answers status-label events only (the workflow does not even start a job).
        forge = FakeForge().add(11, labels=["status:ready", "status:in-progress"] + OTHER_AXES)
        outcome = follow(forge, 11, "labeled", "area:tooling")
        self.assertEqual(forge.removals, [])
        self.assertIn("not a status label", outcome.decision.reason)

    def test_no_other_axis_is_ever_removed(self):
        labels = ["status:ready"] + OTHER_AXES + ["status:blocked", "status:in-progress"]
        history = [issue_status.LabelEvent(name, "2026-09-06T11:00:%02dZ" % i, i, "x")
                   for i, name in enumerate(labels)]
        for action, state, applied in itertools.product(
            ("closed", "labeled", "reopened"), ("open", "closed"),
            (None, "status:in-progress", "status:ready", "area:tooling", "policy"),
        ):
            with self.subTest(action=action, state=state, applied=applied):
                decision = issue_status.decide(action, state, labels, applied, history)
                self.assertTrue(set(decision.remove) <= {"status:ready", "status:blocked", "status:in-progress"})

    def test_a_pull_request_is_never_touched(self):
        forge = FakeForge().add(12, labels=["status:ready", "status:in-progress"], pull_request=True)
        follow(forge, 12, "labeled", "status:in-progress")
        forge.set_state(12, "closed")
        follow(forge, 12, "closed")
        self.assertEqual(forge.removals, [])
        self.assertEqual(forge.status(12), ["status:ready", "status:in-progress"])

    def test_a_dry_run_decides_and_removes_nothing(self):
        forge = FakeForge().add(13, labels=["status:ready", "status:in-progress"] + OTHER_AXES)
        outcome = follow(forge, 13, "labeled", "status:in-progress", dry_run=True)
        self.assertEqual(outcome.decision.remove, ["status:ready"])
        self.assertEqual(outcome.removed, [])
        self.assertEqual(forge.removals, [])
        self.assertEqual(forge.status(13), ["status:ready", "status:in-progress"])


class TimelineTests(unittest.TestCase):
    """#214 criterion 1: the later label stays, proved over synthetic label timelines.

    A run is decided from the Issue's own history, so the order in which the runs of one
    Issue start - which GitHub does not guarantee - cannot change which label survives.
    """

    def assert_survivor(self, build, events, expected):
        for order in itertools.permutations(events):
            with self.subTest(order=order):
                forge, number = build()
                for applied in order:
                    follow(forge, number, "labeled", applied)
                self.assertEqual(forge.status(number), expected)
                self.assertTrue(set(OTHER_AXES) <= set(forge.labels(number)))

    def test_the_label_applied_last_survives_whatever_order_the_runs_go_in(self):
        # Three labels a second apart and no run starting until all three are on: a slow
        # queue, which is exactly when the order of runs stops being guaranteed.
        steps = ["status:needs-triage", "status:ready", "status:in-progress"]

        def build():
            forge = FakeForge().add(20, labels=OTHER_AXES)
            for name in steps:
                forge.apply(20, name)
            return forge, 20

        self.assert_survivor(build, steps, ["status:in-progress"])

    def test_each_run_straight_after_its_event_ends_the_same_way(self):
        forge = FakeForge().add(21, labels=OTHER_AXES)
        for name in ("status:needs-triage", "status:ready", "status:in-progress"):
            forge.apply(21, name)
            follow(forge, 21, "labeled", name)
        self.assertEqual(forge.status(21), ["status:in-progress"])

    def test_the_200_timeline_keeps_the_claim_that_came_last(self):
        # #200 on 2026-09-06: rework_limit.py returned the Issue to the queue at 11:33:47Z
        # (status:in-progress off, status:ready on), and at 11:44:02Z the AUTHOR claimed
        # it again without taking status:ready off. status:in-progress was applied
        # before status:ready *and* after it: it counts from when it was put back.
        def build():
            forge = FakeForge().add(200, labels=OTHER_AXES)
            forge.apply(200, "status:in-progress", actor="zendev-acceptor[bot]")
            forge.take_off(200, "status:in-progress", actor="github-actions[bot]")
            forge.apply(200, "status:ready", actor="github-actions[bot]")
            forge.apply(200, "status:in-progress", actor="zendev-author[bot]")
            return forge, 200

        # As it would really run: status:ready came from GITHUB_TOKEN, which starts no
        # workflow, so the AUTHOR's label is the only event.
        forge, number = build()
        outcome = follow(forge, number, "labeled", "status:in-progress")
        self.assertEqual(outcome.removed, ["status:ready"])
        self.assertEqual(outcome.kept_by.actor, "zendev-author[bot]")
        # And if a person had applied status:ready, so that both events ran, in any order.
        self.assert_survivor(build, ["status:ready", "status:in-progress"], ["status:in-progress"])

    def test_two_labels_applied_in_one_request_leave_exactly_one(self):
        def build():
            forge = FakeForge().add(22, labels=OTHER_AXES)
            forge.apply(22, "status:ready")
            forge.apply(22, "status:blocked", same_second=True)
            return forge, 22

        # Same second; the event id orders them, and every run agrees on it.
        self.assert_survivor(build, ["status:ready", "status:blocked"], ["status:blocked"])

    def test_a_run_whose_label_is_gone_still_keeps_the_one_applied_last(self):
        # status:in-progress was applied and taken off again before its run started. The
        # Issue still carries two status labels, and the run settles them all the same.
        forge = FakeForge().add(23, labels=OTHER_AXES)
        for name in ("status:blocked", "status:ready", "status:in-progress"):
            forge.apply(23, name)
        forge.take_off(23, "status:in-progress")
        follow(forge, 23, "labeled", "status:in-progress")
        self.assertEqual(forge.status(23), ["status:ready"])

    def test_a_history_that_has_not_caught_up_keeps_the_label_just_applied(self):
        forge = FakeForge().add(24, labels=OTHER_AXES)
        forge.apply(24, "status:ready")
        forge.apply(24, "status:in-progress")
        forge.lag[24] = 1  # the event that started the run is not in the history yet
        follow(forge, 24, "labeled", "status:in-progress")
        self.assertEqual(forge.status(24), ["status:in-progress"])

    def test_a_history_that_names_neither_label_removes_nothing(self):
        # Negative control: two status labels and nothing to say which came last. The
        # run does not guess.
        forge = FakeForge().add(25, labels=["status:ready", "status:blocked"] + OTHER_AXES)
        forge.lag[25] = len(forge.issues[25]["events"])
        outcome = follow(forge, 25, "labeled", "status:in-progress")
        self.assertEqual(forge.removals, [])
        self.assertIn("does not say", outcome.decision.reason)

    def test_only_applications_count_as_history(self):
        history = issue_status.read_history(REPO, 26, FakeForge().add(26, labels=["status:ready"]))
        self.assertEqual([event.name for event in history], ["status:ready"])
        forge = FakeForge().add(27, labels=["status:ready"])
        forge.take_off(27, "status:ready")
        forge.set_state(27, "closed")
        self.assertEqual(len(issue_status.read_history(REPO, 27, forge)), 1)


class RepairTests(unittest.TestCase):
    """#770 criterion 3: the dispatched repair leaves no closed Issue with a status label."""

    def forge(self):
        forge = FakeForge()
        forge.add(1, state="closed", labels=["status:in-progress"] + OTHER_AXES)
        forge.add(2, state="closed", labels=OTHER_AXES)  # nothing to repair
        forge.add(3, state="closed", labels=["status:ready", "status:blocked"])
        forge.add(4, state="closed", labels=["status:needs-review"], pull_request=True)
        forge.add(5, labels=["status:in-progress"] + OTHER_AXES)  # open: not the repair's
        forge.add(6, state="closed", labels=["status:needs-decision", "qa"])
        forge.add(7, state="closed", labels=["status:ready"])
        return forge

    def test_the_listing_keeps_closed_issues_with_a_status_label_only(self):
        items = [
            {"number": 1, "state": "closed", "labels": [{"name": "status:ready"}, {"name": "qa"}]},
            {"number": 2, "state": "closed", "labels": [{"name": "status:ready"}], "pull_request": {}},
            {"number": 3, "state": "closed", "labels": [{"name": "area:tooling"}]},
            {"number": 4, "state": "open", "labels": [{"name": "status:ready"}]},
            {"number": 5, "state": "closed", "labels": []},
        ]
        self.assertEqual(issue_status.carrying_status(items), [(1, ["status:ready"])])

    def test_the_listing_reads_every_page(self):
        found, _ = issue_status.repair(REPO, gh=self.forge())
        self.assertEqual([number for number, _ in found], [1, 3, 6, 7])  # three pages of two

    def test_a_dry_run_lists_and_removes_nothing(self):
        forge = self.forge()
        before = {number: forge.labels(number) for number in forge.issues}
        found, results = issue_status.repair(REPO, gh=forge)
        self.assertEqual(found, [(1, ["status:in-progress"]), (3, ["status:ready", "status:blocked"]),
                                 (6, ["status:needs-decision"]), (7, ["status:ready"])])
        self.assertEqual(results, [])
        self.assertEqual(forge.removals, [])
        self.assertEqual(len(forge.calls), 1, "a dry run makes the listing and nothing else")
        self.assertEqual({number: forge.labels(number) for number in forge.issues}, before)

    def test_applying_leaves_no_closed_issue_with_a_status_label(self):
        forge = self.forge()
        found, results = issue_status.repair(REPO, apply=True, gh=forge, pause=lambda _: None)
        self.assertEqual(sum(len(result.removed) for result in results), 5)
        self.assertEqual(issue_status.repair(REPO, gh=forge)[0], [])
        # The open Issue and the pull request keep theirs; no other axis moved anywhere.
        self.assertEqual(forge.status(5), ["status:in-progress"])
        self.assertEqual(forge.status(4), ["status:needs-review"])
        self.assertEqual(forge.labels(1), OTHER_AXES)
        self.assertEqual(forge.labels(6), ["qa"])

    def test_applying_pauses_between_removals_and_only_between(self):
        pauses = []
        issue_status.repair(REPO, apply=True, gh=self.forge(), pause=pauses.append)
        self.assertEqual(pauses, [issue_status.PAUSE_SECONDS] * 4)  # five removals

    def test_an_issue_reopened_after_the_listing_is_left_alone(self):
        forge = self.forge()
        forge.after_listing = lambda: forge.set_state(3, "open")
        _, results = issue_status.repair(REPO, apply=True, gh=forge, pause=lambda _: None)
        reopened = next(result for result in results if result.number == 3)
        self.assertEqual(reopened.removed, [])
        self.assertIn("reopened", reopened.note)
        self.assertEqual(forge.status(3), ["status:ready", "status:blocked"])

    def test_a_failed_removal_is_reported_and_the_rest_go_on(self):
        forge = self.forge()
        forge.refused["status:blocked"] = "gh: Server Error (HTTP 500)"
        _, results = issue_status.repair(REPO, apply=True, gh=forge, pause=lambda _: None)
        failed = [(result.number, name) for result in results for name, _ in result.failed]
        self.assertEqual(failed, [(3, "status:blocked")])
        self.assertEqual(forge.status(3), ["status:blocked"])
        self.assertEqual(forge.status(7), [])


class ForgeCallTests(unittest.TestCase):
    def test_a_label_name_is_encoded_into_one_path_segment(self):
        name = "status:needs review/2?x#y%"
        forge = FakeForge().add(30, labels=[name])
        self.assertTrue(issue_status.remove_label(REPO, 30, name, forge))
        segment = forge.removals[0][3].rsplit("/", 1)[1]
        for raw in (" ", "/", "?", "#"):
            self.assertNotIn(raw, segment)
        self.assertEqual(urllib.parse.unquote(segment), name)
        self.assertEqual(forge.labels(30), [])

    def test_a_label_already_off_is_not_a_failure(self):
        forge = FakeForge().add(31, labels=OTHER_AXES)
        self.assertFalse(issue_status.remove_label(REPO, 31, "status:ready", forge))

    def test_any_other_failed_removal_is_an_error(self):
        forge = FakeForge().add(32, labels=["status:ready"])
        forge.refused["status:ready"] = "gh: Resource not accessible by integration (HTTP 403)"
        with self.assertRaisesRegex(issue_status.ForgeError, "HTTP 403"):
            issue_status.remove_label(REPO, 32, "status:ready", forge)

    def test_an_unreadable_issue_is_an_error_not_an_empty_one(self):
        with self.assertRaisesRegex(issue_status.ForgeError, "HTTP 404"):
            issue_status.read_issue(REPO, 999, FakeForge())

    def test_the_only_calls_are_reads_and_label_removals(self):
        # Every call the fake would accept, across a closure, a relabel and a repair: one
        # Issue read, one history read, one listing, and DELETEs on `.../labels/<name>`.
        forge = RepairTests().forge()
        forge.apply(5, "status:ready")
        follow(forge, 5, "labeled", "status:ready")
        forge.set_state(5, "closed")
        follow(forge, 5, "closed")
        issue_status.repair(REPO, apply=True, gh=forge, pause=lambda _: None)
        for call in forge.calls:
            with self.subTest(call=call):
                method = call[call.index("--method") + 1] if "--method" in call else "GET"
                self.assertIn(method, ("GET", "DELETE"))
                if method == "DELETE":
                    self.assertRegex(call[-1], r"^repos/%s/issues/\d+/labels/[^/]+$" % re.escape(REPO))


class CommandLineTests(unittest.TestCase):
    """`main`, called with the arguments the workflow passes."""

    def test_the_event_command_takes_what_the_workflow_passes(self):
        forge = FakeForge().add(214, labels=OTHER_AXES)
        forge.apply(214, "status:ready")
        forge.apply(214, "status:in-progress", actor="zendev-author[bot]")
        code, out, summary = run_main(
            ["event", "--repo", REPO, "--issue", "214", "--action", "labeled",
             "--applied=status:in-progress", "--sender=zendev-author[bot]"], forge)
        self.assertEqual(code, 0)
        self.assertEqual(forge.status(214), ["status:in-progress"])
        for fragment in ("#214", "`status:ready`", "`status:in-progress`", "`zendev-author[bot]`"):
            self.assertIn(fragment, summary)
        self.assertIn("::notice title=Second status label::#214: zendev-author[bot] applied", out)

    def test_a_closure_arrives_with_an_empty_label(self):
        forge = FakeForge().add(765, labels=["status:in-progress"] + OTHER_AXES)
        forge.set_state(765, "closed")
        code, out, summary = run_main(
            ["event", "--repo", REPO, "--issue", "765", "--action", "closed",
             "--applied=", "--sender=drevendev"], forge)
        self.assertEqual(code, 0)
        self.assertEqual(forge.labels(765), OTHER_AXES)
        self.assertIn("Removed `status:in-progress`", summary)
        self.assertNotIn("::notice", out)  # a closure is the rule working, not a role's slip

    def test_a_label_name_starting_with_a_dash_stays_a_value(self):
        forge = FakeForge().add(40, labels=["status:ready"])
        code, _, summary = run_main(
            ["event", "--repo", REPO, "--issue", "40", "--action", "labeled", "--applied=--dry-run"], forge)
        self.assertEqual(code, 0)
        self.assertIn("is not a status label", summary)

    def test_without_a_step_summary_the_report_goes_to_stdout(self):
        forge = FakeForge().add(41, labels=["status:ready"])
        forge.set_state(41, "closed")
        code, out, summary = run_main(
            ["event", "--repo", REPO, "--issue", "41", "--action", "closed"], forge, summary=False)
        self.assertEqual(code, 0)
        self.assertIsNone(summary)
        self.assertIn("### Issue status: #41", out)
        self.assertIn("Removed `status:ready`", out)

    def test_the_repair_is_a_dry_run_unless_told_otherwise(self):
        forge = RepairTests().forge()
        code, out, summary = run_main(["repair", "--repo", REPO], forge)
        self.assertEqual(code, 0)
        self.assertEqual(forge.removals, [])
        self.assertIn("Issue status repair: dry-run", summary)
        self.assertIn("4 closed Issue(s)", summary)
        for number in (1, 3, 6, 7):
            self.assertIn("| #%d |" % number, summary)
        self.assertNotIn("| #4 |", summary)  # the pull request
        self.assertIn(summary.strip(), out)

    def test_the_repair_removes_only_when_told_to_apply(self):
        forge = RepairTests().forge()
        code, _, summary = run_main(["repair", "--repo", REPO, "--mode=apply"], forge)
        self.assertEqual(code, 0)
        self.assertEqual(len(forge.removals), 5)
        self.assertIn("Removed 5 label(s) from 4 Issue(s); 0 already gone; 0 failed.", summary)
        self.assertEqual(issue_status.repair(REPO, gh=forge)[0], [])

    def test_a_mode_that_is_not_dry_run_or_apply_is_refused(self):
        for mode in ("yes", "", "APPLY"):
            with self.subTest(mode=mode):
                forge = FakeForge()
                with contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit):
                    run_main(["repair", "--repo", REPO, "--mode=%s" % mode], forge)
                self.assertEqual(forge.calls, [])

    def test_a_failed_removal_fails_the_run(self):
        forge = RepairTests().forge()
        forge.refused["status:ready"] = "gh: Server Error (HTTP 502)"
        code, _, summary = run_main(["repair", "--repo", REPO, "--mode=apply"], forge)
        self.assertEqual(code, 1)
        self.assertIn("failed (`status:ready`)", summary)

    def test_an_unreadable_issue_fails_the_run_and_says_why(self):
        code, out, _ = run_main(
            ["event", "--repo", REPO, "--issue", "999", "--action", "closed"], FakeForge())
        self.assertEqual(code, 1)
        self.assertIn("::error::issue-status: could not read #999: gh: Not Found (HTTP 404)", out)


class ReportTests(unittest.TestCase):
    def test_an_open_issue_report_names_who_applied_the_label_it_kept(self):
        forge = FakeForge().add(50, labels=OTHER_AXES)
        forge.apply(50, "status:ready")
        forge.apply(50, "status:in-progress", actor="zendev-author[bot]")
        report = issue_status.event_summary(follow(forge, 50, "labeled", "status:in-progress"), "zendev-author[bot]")
        self.assertIn("`status:in-progress` was applied by `zendev-author[bot]` at 2026-09-06T11:00:", report)
        self.assertIn("beside `status:ready`", report)
        self.assertIn("Removed `status:ready`", report)

    def test_a_dry_run_report_says_what_it_would_remove(self):
        forge = FakeForge().add(51, labels=["status:ready", "status:blocked"])
        forge.set_state(51, "closed")
        report = issue_status.event_summary(follow(forge, 51, "closed", dry_run=True))
        self.assertIn("Dry run: would remove `status:ready`, `status:blocked`", report)
        self.assertEqual(issue_status.notices(follow(forge, 51, "closed", dry_run=True)), [])

    def test_nothing_removed_says_why(self):
        forge = FakeForge().add(52, labels=["status:ready"])
        report = issue_status.event_summary(follow(forge, 52, "labeled", "status:ready"))
        self.assertIn("Nothing removed. Carries one status label, `status:ready`.", report)

    def test_a_workflow_command_cannot_be_smuggled_through_a_label_name(self):
        # A notice carries label names; the runner reads `%`, CR and LF in its message as
        # syntax, so they are escaped and the notice stays one line of data.
        self.assertEqual(issue_status._escape("a%0A\r\n::error::x"), "a%250A%0D%0A::error::x")
        outcome = issue_status.Outcome(
            60, "labeled", "status:x\n::error::pwned", "open",
            issue_status.Decision(["status:y"], "status:x\n::error::pwned", "r"), None,
            ["status:y"], [], [], False)
        (line,) = issue_status.notices(outcome, "someone")
        self.assertNotIn("\n", line)
        self.assertTrue(line.startswith("::notice "))

    def test_a_label_name_cannot_break_the_markdown_it_is_shown_in(self):
        self.assertEqual(issue_status._code("a`b|c\nd"), "`a'b\\|c d`")

    def test_publish_appends_to_the_step_summary_and_prints(self):
        with tempfile.TemporaryDirectory() as scratch:
            path = pathlib.Path(scratch) / "summary.md"
            path.write_text("earlier step\n", encoding="utf-8")
            out = io.StringIO()
            with contextlib.redirect_stdout(out):
                issue_status.publish("### report\n", {"GITHUB_STEP_SUMMARY": str(path)})
            self.assertEqual(path.read_text(encoding="utf-8"), "earlier step\n### report\n\n")
        self.assertEqual(out.getvalue(), "### report\n")

    def test_publish_without_a_step_summary_only_prints(self):
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            issue_status.publish("### report\n", {})
        self.assertEqual(out.getvalue(), "### report\n")


# ------------------------------------------------------------------------------ workflow

RUN = re.compile(r"^(?P<indent>\s*)(?:- )?run:\s*(?P<rest>.*)$")


def workflow():
    return WORKFLOW.read_text(encoding="utf-8")


def top_level(body, key):
    """The entries of one top-level mapping, comments dropped. Pure."""
    rows = body.splitlines()
    entries = []
    for row in rows[rows.index("%s:" % key) + 1:]:
        if row and not row[0].isspace() and not row.startswith("#"):
            break
        entry = row.split("#", 1)[0].strip()
        if entry:
            entries.append(entry)
    return entries


def run_blocks(body):
    """The shell text of every `run:` in a workflow. Pure."""
    rows = body.splitlines()
    blocks = []
    for i, row in enumerate(rows):
        match = RUN.match(row)
        if not match:
            continue
        rest = match.group("rest").strip()
        if rest not in ("|", "|-", ">", ">-"):
            blocks.append(rest)
            continue
        indent = len(match.group("indent"))
        lines = []
        for line in rows[i + 1:]:
            if line.strip() and len(line) - len(line.lstrip()) <= indent:
                break
            lines.append(line)
        blocks.append("\n".join(lines))
    return blocks


class WorkflowTests(unittest.TestCase):
    def test_the_token_grants_issues_write_and_nothing_else(self):
        # #770 criterion 4. One top-level grant, no job widening it, and no other
        # identity whose token the grant would not bound.
        body = workflow()
        self.assertEqual(top_level(body, "permissions"), ["issues: write"])
        self.assertEqual(len(re.findall(r"^\s*permissions:", body, re.MULTILINE)), 1)
        self.assertNotIn("create-github-app-token", body)
        self.assertNotIn("secrets.", body)
        self.assertEqual(body.count("GH_TOKEN: ${{ github.token }}"), 2)

    def test_it_answers_closure_labelling_and_a_dispatch(self):
        body = workflow()
        self.assertIn("  issues:\n    types: [closed, labeled]\n", body)
        self.assertIn("  workflow_dispatch:\n", body)

    def test_the_dispatch_is_a_dry_run_unless_apply_is_chosen(self):
        body = workflow()
        self.assertIn("options: [dry-run, apply]", body)
        self.assertIn("default: dry-run", body)
        self.assertIn("REPAIR_MODE: ${{ inputs.mode }}", body)
        self.assertIn('--mode="${REPAIR_MODE:-dry-run}"', body)

    def test_no_expression_is_interpolated_into_a_shell_line(self):
        blocks = run_blocks(workflow())
        self.assertEqual(len(blocks), 2, "one step per job runs the script")
        for block in blocks:
            with self.subTest(block=block):
                self.assertNotIn("${{", block)

    def test_the_label_and_the_issue_arrive_through_the_environment(self):
        body = workflow()
        self.assertIn("APPLIED_LABEL: ${{ github.event.label.name }}", body)
        self.assertIn("ISSUE_NUMBER: ${{ github.event.issue.number }}", body)
        event = next(block for block in run_blocks(body) if "issue_status.py event" in block)
        self.assertIn('--applied="${APPLIED_LABEL}"', event)
        self.assertIn('--issue "${ISSUE_NUMBER}"', event)

    def test_nothing_from_the_event_chooses_what_is_checked_out(self):
        body = workflow()
        self.assertEqual(body.count("uses: actions/checkout@"), 2)
        self.assertIsNone(re.search(r"^\s*ref:", body, re.MULTILINE))
        self.assertEqual(body.count("persist-credentials: false"), 2)

    def test_the_script_it_runs_is_the_checked_out_one(self):
        body = workflow()
        self.assertIn("python scripts/issue_status.py event", body)
        self.assertIn("python scripts/issue_status.py repair", body)
        self.assertTrue(SCRIPT.is_file())

    def test_only_a_status_label_starts_the_job(self):
        self.assertIn(
            "(github.event.action == 'labeled' && startsWith(github.event.label.name, 'status:'))",
            workflow(),
        )

    def test_one_run_per_issue_at_a_time(self):
        body = workflow()
        self.assertIn("group: issue-status-${{ github.event.issue.number }}", body)
        self.assertNotIn("cancel-in-progress: true", body)

    def test_why_it_cannot_trigger_itself_is_written_down(self):
        comments = "\n".join(row for row in workflow().splitlines() if row.lstrip().startswith("#"))
        self.assertIn("GITHUB_TOKEN", comments)
        self.assertIn("`unlabeled`", comments)
        self.assertNotIn("unlabeled]", workflow())

    def test_the_detectors_would_object(self):
        # Negative controls on the text checks themselves, so the assertions above cannot
        # pass by finding nothing to look at.
        widened = "permissions:\n  issues: write\n  contents: write\n\njobs:\n"
        self.assertEqual(top_level(widened, "permissions"), ["issues: write", "contents: write"])
        leaky = "steps:\n  - run: |\n      echo ${{ github.event.label.name }}\n  - run: echo ${{ x }}\n"
        self.assertEqual(sum("${{" in block for block in run_blocks(leaky)), 2)


if __name__ == "__main__":
    unittest.main()
