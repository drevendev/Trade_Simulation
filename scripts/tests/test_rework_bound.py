"""What the forge does at the rework bound, and everything it never does (#771).

The operator's decision on #771 is to mark, not to close: at the `rework_limit`-th
refusal by the active scheme's `verdict_owner`, one label and one comment, once. Each
rule is proved by the case that must act and by a negative control that must not, over
an in-memory forge that answers exactly the `gh` calls the script makes and fails the
test on any other call. That is how "never closes anything, never removes a label, never
touches another pull request" is proved rather than assumed: there is no call through
which it could.

Text assertions on the workflow rather than a YAML parse, like the other workflow tests:
this runs in the policy-guard job with nothing but the standard library.
"""

import contextlib
import io
import json
import os
import pathlib
import re
import subprocess
import sys
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

import machine_pr_guard  # noqa: E402
import record_pull_request as rpr  # noqa: E402
import rework_bound  # noqa: E402
import schemes  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts" / "rework_bound.py"
WORKFLOW = ROOT / ".github" / "workflows" / "rework-bound.yml"

REPO = "owner/repo"
BASE = datetime(2026, 9, 21, 15, 0, 0, tzinfo=timezone.utc)
JUDGE = "judge-account"
BOUND = rework_bound.Bound("scheme/T", JUDGE, 3)

REFUSE = "## Verdict: REQUEST_CHANGES\n\nJudging head `%s`." % ("b" * 40)
ACCEPT = "## Verdict: ACCEPT\n\nJudging head `%s`." % ("c" * 40)
FINDING = "## SLOPSTER QA: FINDING\n\nThe settlement drops a unit."


def at(minutes):
    return (BASE + timedelta(minutes=minutes)).strftime("%Y-%m-%dT%H:%M:%SZ")


class FakeForge:
    """Pull requests in memory, reachable only through the `gh` calls rework_bound.py makes.

    It answers a read of a pull request, of its comments and of its formal reviews (two
    to a page, so pagination is exercised), and two writes: adding a label and posting a
    comment, the latter as the workflow's own identity. Anything else - a close, a label
    removal, an edit, a call about another repository - raises inside the script.
    """

    PAGE = 2

    def __init__(self):
        self.pulls = {}
        self.calls = []
        self.next_id = 5_000_000_000
        self.refused = {}  # "labels" or "comments" -> stderr of a write that fails
        self.unreadable = {}  # a path -> stderr of a read that fails
        self.clock = 10_000

    # -- the world

    def add(self, number, *, ref="zen/issue-627-thing", state="open", merged=False, sha="a" * 40):
        self.pulls[number] = {
            "pull": {
                "number": number,
                "state": state,
                "merged_at": at(500) if merged else None,
                "head": {"ref": ref, "sha": sha},
                "base": {"ref": "master"},
                "html_url": "https://github.example/%s/pull/%d" % (REPO, number),
            },
            "comments": [],
            "reviews": [],
            "labels": [],
        }
        return self

    def _id(self):
        self.next_id += 1
        return self.next_id

    def comment(self, number, login, body, minutes):
        ident = self._id()
        self.pulls[number]["comments"].append({
            "id": ident,
            "user": {"login": login},
            "body": body,
            "created_at": at(minutes),
            "html_url": "https://github.example/%s/pull/%d#issuecomment-%d" % (REPO, number, ident),
        })
        return self

    def review(self, number, login, state, minutes, body=""):
        ident = self._id()
        self.pulls[number]["reviews"].append({
            "id": ident,
            "user": {"login": login},
            "state": state,
            "body": body,
            "submitted_at": at(minutes),
            "html_url": "https://github.example/%s/pull/%d#pullrequestreview-%d" % (REPO, number, ident),
        })
        return self

    def refusals(self, number, minutes, login=JUDGE):
        for minute in minutes:
            self.comment(number, login, REFUSE, minute)
        return self

    def marks(self, number):
        return [c for c in self.pulls[number]["comments"] if c["body"].startswith(rework_bound.HEADING)]

    @property
    def writes(self):
        return [call for call in self.calls if call[:3] == ["api", "--method", "POST"]]

    # -- gh

    def __call__(self, args):
        self.calls.append(list(args))
        if len(args) == 2 and args[0] == "api":
            return self._read(args[1])
        if len(args) == 4 and args[:3] == ["api", "--paginate", "--slurp"]:
            return self._read(args[3])
        if len(args) == 6 and args[:3] == ["api", "--method", "POST"] and args[4] == "-f":
            return self._write(args[3], args[5])
        raise AssertionError("rework_bound made a call it must never make: gh %s" % " ".join(args))

    @staticmethod
    def _answer(payload=None, code=0, stderr=""):
        stdout = "" if payload is None else json.dumps(payload)
        return subprocess.CompletedProcess(["gh"], code, stdout, stderr)

    def _paged(self, items):
        return [items[i:i + self.PAGE] for i in range(0, len(items), self.PAGE)] or [[]]

    def _read(self, path):
        if path in self.unreadable:
            return self._answer(None, 1, self.unreadable[path])
        prefix = re.escape("repos/%s/" % REPO)
        match = re.fullmatch(prefix + r"pulls/(\d+)", path)
        if match:
            return self._answer(self.pulls[int(match.group(1))]["pull"])
        match = re.fullmatch(prefix + r"issues/(\d+)/comments\?per_page=100", path)
        if match:
            return self._answer(self._paged(self.pulls[int(match.group(1))]["comments"]))
        match = re.fullmatch(prefix + r"pulls/(\d+)/reviews\?per_page=100", path)
        if match:
            return self._answer(self._paged(self.pulls[int(match.group(1))]["reviews"]))
        raise AssertionError("unexpected read: %s" % path)

    def _write(self, path, field):
        match = re.fullmatch(re.escape("repos/%s/" % REPO) + r"issues/(\d+)/(labels|comments)", path)
        if not match:
            raise AssertionError("unexpected write: %s" % path)
        number, what = int(match.group(1)), match.group(2)
        if what in self.refused:
            return self._answer({"message": "Server Error"}, 1, self.refused[what])
        key, value = field.split("=", 1)
        pull = self.pulls[number]
        if what == "labels":
            if key != "labels[]":
                raise AssertionError("unexpected label field: %s" % key)
            if value not in pull["labels"]:
                pull["labels"].append(value)
            return self._answer([{"name": name} for name in pull["labels"]])
        if key != "body":
            raise AssertionError("unexpected comment field: %s" % key)
        self.clock += 1
        self.comment(number, rework_bound.SELF, value, self.clock)
        return self._answer(pull["comments"][-1])


def follow(forge, number, bound=BOUND, **kwargs):
    return rework_bound.follow(REPO, number, bound, gh=forge, **kwargs)


def descriptor(owner, limit, scheme_id="scheme/T"):
    return {"active": scheme_id, "schemes": [
        {"id": "scheme/old", "verdict_owner": "someone-before", "rework_limit": 9},
        {"id": scheme_id, "verdict_owner": owner, "rework_limit": limit},
    ]}


def run_main(argv, forge, *, document=None):
    """`main` as the workflow calls it, with the forge and optionally the descriptor
    replaced: (exit code, stdout)."""
    out = io.StringIO()
    with tempfile.TemporaryDirectory() as scratch, \
            patch.object(rework_bound, "_gh", forge), \
            patch.dict(os.environ, {}), \
            contextlib.redirect_stdout(out):
        os.environ.pop("ZENDEV_SCHEMES_FILE", None)
        if document is not None:
            path = pathlib.Path(scratch) / "schemes.json"
            path.write_text(json.dumps(document), encoding="utf-8")
            os.environ["ZENDEV_SCHEMES_FILE"] = str(path)
        code = rework_bound.main(argv)
    return code, out.getvalue()


# ------------------------------------------------------------------------------ the bound


class BoundTests(unittest.TestCase):
    def test_the_third_refusal_marks_the_pull_request_with_one_label_and_one_comment(self):
        forge = FakeForge().add(628).refusals(628, [21, 81, 139])
        outcome = follow(forge, 628)
        self.assertEqual(outcome.action, rework_bound.MARKED)
        self.assertEqual(forge.pulls[628]["labels"], [rework_bound.LABEL])
        self.assertEqual(len(forge.marks(628)), 1)
        self.assertEqual(forge.marks(628)[0]["user"]["login"], rework_bound.SELF)
        self.assertEqual(len(forge.writes), 2)
        self.assertEqual(len(outcome.refusals), 3)

    def test_one_below_the_bound_writes_nothing(self):
        forge = FakeForge().add(628).refusals(628, [21, 81])
        outcome = follow(forge, 628)
        self.assertEqual(outcome.action, rework_bound.NOTHING)
        self.assertIn("below the bound", outcome.reason)
        self.assertEqual(forge.writes, [])
        self.assertEqual(forge.pulls[628]["labels"], [])

    def test_a_refusal_from_another_account_is_not_counted(self):
        # The researcher's, the operator's, a formal review from either, and a login that
        # merely resembles the owner's: evidence, none of them a round.
        forge = FakeForge().add(628).refusals(628, [21, 81])
        forge.comment(628, "drevendev", REFUSE, 100)
        forge.review(628, "drevendev", "CHANGES_REQUESTED", 110)
        forge.comment(628, JUDGE + "-2", REFUSE, 120)
        outcome = follow(forge, 628)
        self.assertEqual(outcome.action, rework_bound.NOTHING)
        self.assertEqual(len(outcome.refusals), 2)
        self.assertEqual(forge.writes, [])

    def test_an_accept_is_not_a_refusal(self):
        forge = FakeForge().add(628).refusals(628, [21, 81])
        forge.comment(628, JUDGE, ACCEPT, 100)
        self.assertEqual(follow(forge, 628).action, rework_bound.NOTHING)
        self.assertEqual(forge.writes, [])
        # A refusal after the acceptance is still the third on this pull request, as the
        # ledger counts it.
        forge.refusals(628, [150])
        outcome = follow(forge, 628)
        self.assertEqual(outcome.action, rework_bound.MARKED)
        self.assertEqual([entry["at"] for entry in outcome.refusals], [at(21), at(81), at(150)])

    def test_a_finding_or_a_sentence_about_a_refusal_is_not_one(self):
        forge = FakeForge().add(628).refusals(628, [21, 81])
        forge.comment(628, JUDGE, FINDING, 90)
        forge.comment(628, JUDGE, "The earlier ## Verdict: REQUEST_CHANGES still stands.", 95)
        self.assertEqual(follow(forge, 628).action, rework_bound.NOTHING)
        self.assertEqual(forge.writes, [])

    def test_the_owner_s_formal_refusals_count_and_are_linked(self):
        forge = FakeForge().add(628).refusals(628, [21, 81])
        forge.review(628, JUDGE, "CHANGES_REQUESTED", 139)
        outcome = follow(forge, 628)
        self.assertEqual(outcome.action, rework_bound.MARKED)
        review_url = forge.pulls[628]["reviews"][0]["html_url"]
        self.assertIn("formal review: %s" % review_url, outcome.body)


# ------------------------------------------------------------------------------ once


class OnceTests(unittest.TestCase):
    def test_a_marked_pull_request_is_left_alone_at_the_fourth_and_fifth_refusal(self):
        forge = FakeForge().add(628).refusals(628, [21, 81, 139])
        follow(forge, 628)
        for minute in (200, 260):
            forge.refusals(628, [minute])
            before = len(forge.writes)
            outcome = follow(forge, 628)
            self.assertEqual(outcome.action, rework_bound.NOTHING)
            self.assertIn("already marked", outcome.reason)
            self.assertEqual(len(forge.writes), before)
        self.assertEqual(len(forge.marks(628)), 1)
        self.assertEqual(forge.pulls[628]["labels"], [rework_bound.LABEL])

    def test_a_mark_already_present_is_enough_even_at_five_refusals(self):
        forge = FakeForge().add(628).refusals(628, [21, 81, 139, 200, 260])
        forge.comment(628, rework_bound.SELF, rework_bound.HEADING + "\n\nMarked earlier.", 150)
        outcome = follow(forge, 628)
        self.assertEqual(outcome.action, rework_bound.NOTHING)
        self.assertEqual(len(outcome.refusals), 5)
        self.assertEqual(forge.writes, [])

    def test_the_heading_from_another_account_does_not_stand_in_for_the_mark(self):
        forge = FakeForge().add(628).refusals(628, [21, 81, 139])
        forge.comment(628, "drevendev", rework_bound.HEADING + "\n\n(quoted)", 140)
        forge.comment(628, JUDGE, rework_bound.HEADING, 141)
        self.assertEqual(follow(forge, 628).action, rework_bound.MARKED)
        self.assertEqual(len([c for c in forge.marks(628) if c["user"]["login"] == rework_bound.SELF]), 1)

    def test_a_label_a_person_already_applied_is_not_a_mark(self):
        forge = FakeForge().add(628).refusals(628, [21, 81, 139])
        forge.pulls[628]["labels"].append(rework_bound.LABEL)
        self.assertEqual(follow(forge, 628).action, rework_bound.MARKED)
        self.assertEqual(forge.pulls[628]["labels"], [rework_bound.LABEL])
        self.assertEqual(len(forge.marks(628)), 1)


# ------------------------------------------------------------------------------ scope


class ScopeTests(unittest.TestCase):
    def test_a_machine_pull_request_is_read_no_further_than_its_head_branch(self):
        for cls in machine_pr_guard.MACHINE_CLASSES:
            with self.subTest(branch=cls.branch):
                forge = FakeForge().add(900, ref=cls.branch).refusals(900, [21, 81, 139])
                outcome = follow(forge, 900)
                self.assertEqual(outcome.action, rework_bound.NOTHING)
                self.assertIn("machine class", outcome.reason)
                self.assertEqual(forge.calls, [["api", "repos/%s/pulls/900" % REPO]])

    def test_a_pull_request_that_is_not_open_has_nothing_left_to_decide(self):
        for merged in (True, False):
            with self.subTest(merged=merged):
                forge = FakeForge().add(628, state="closed", merged=merged).refusals(628, [21, 81, 139])
                outcome = follow(forge, 628)
                self.assertEqual(outcome.action, rework_bound.NOTHING)
                self.assertEqual(forge.calls, [["api", "repos/%s/pulls/628" % REPO]])

    def test_no_other_pull_request_is_touched(self):
        forge = FakeForge().add(628).refusals(628, [21, 81, 139]).add(629).refusals(629, [30, 90, 150])
        follow(forge, 628)
        for call in forge.calls:
            path = next(part for part in call if part.startswith("repos/"))
            self.assertRegex(path, r"/(?:pulls|issues)/628(?:/|$)")
        self.assertEqual(forge.pulls[629]["labels"], [])
        self.assertEqual(forge.marks(629), [])

    def test_the_only_writes_are_one_label_and_one_comment_in_that_order(self):
        forge = FakeForge().add(628).refusals(628, [21, 81, 139])
        follow(forge, 628)
        self.assertEqual(
            [call[3] for call in forge.writes],
            ["repos/%s/issues/628/labels" % REPO, "repos/%s/issues/628/comments" % REPO],
        )
        self.assertEqual(forge.writes[0][5], "labels[]=%s" % rework_bound.LABEL)
        self.assertTrue(all(call[:3] == ["api", "--method", "POST"] for call in forge.writes))

    def test_every_page_of_comments_is_read(self):
        forge = FakeForge().add(628)
        for minute in range(0, 40, 2):
            forge.comment(628, "drevendev", "Handoff for head `%d`." % minute, minute)
        forge.refusals(628, [100, 160, 220])  # past the first page of two
        self.assertEqual(follow(forge, 628).action, rework_bound.MARKED)


# ------------------------------------------------------------------------------ descriptor


class DescriptorTests(unittest.TestCase):
    def test_the_bound_is_the_active_scheme_s(self):
        document = schemes.load(ROOT / "docs" / "zendev" / "schemes.json")
        active = schemes.active(document)
        bound, why = rework_bound.bound_of(document)
        self.assertEqual(why, "")
        self.assertEqual(bound, rework_bound.Bound(active["id"], active["verdict_owner"], active["rework_limit"]))

    def test_a_synthetic_descriptor_changes_the_outcome(self):
        # Two refusals from each of two accounts. The repository's own descriptor counts
        # the one it names and stays below its bound; a descriptor naming the other
        # account with a bound of two marks, and says so in its own terms.
        real = rework_bound.bound_of(schemes.load(ROOT / "docs" / "zendev" / "schemes.json"))[0]

        def world():
            forge = FakeForge().add(628)
            forge.refusals(628, [21, 81], login=real.owner)
            forge.refusals(628, [30, 90], login="another-judge")
            return forge

        forge = world()
        code, out = run_main(["--repo", REPO, "--pull", "628"], forge)
        self.assertEqual((code, forge.writes), (0, []))
        self.assertIn("2 refusal(s) by `%s`" % real.owner, out)

        forge = world()
        code, out = run_main(["--repo", REPO, "--pull", "628"], forge,
                             document=descriptor("another-judge", 2, "scheme/99"))
        self.assertEqual(code, 0)
        self.assertEqual(len(forge.writes), 2)
        mark = forge.marks(628)[0]["body"]
        self.assertIn("`another-judge`, the verdict owner under scheme/99", mark)
        self.assertIn("2 times; the bound is 2", mark)
        self.assertNotIn(real.owner, mark)

    def test_main_reads_the_repository_descriptor_by_default(self):
        real = rework_bound.bound_of(schemes.load(ROOT / "docs" / "zendev" / "schemes.json"))[0]
        forge = FakeForge().add(628).refusals(628, range(21, 21 + 60 * real.limit, 60), login=real.owner)
        code, out = run_main(["--repo", REPO, "--pull", "628"], forge)
        self.assertEqual(code, 0)
        self.assertIn("marked", out)
        self.assertIn("under %s" % real.scheme, forge.marks(628)[0]["body"])

    def test_an_unusable_descriptor_reads_nothing_and_warns(self):
        cases = {
            "no rework_limit": {"active": "s", "schemes": [{"id": "s", "verdict_owner": JUDGE}]},
            "a zero bound": descriptor(JUDGE, 0),
            "a boolean bound": descriptor(JUDGE, True),
            "a text bound": descriptor(JUDGE, "3"),
            "no verdict owner": descriptor("", 3),
            "an active scheme that does not exist": {"active": "gone", "schemes": []},
            "not a descriptor": ["scheme/8"],
        }
        for name, document in cases.items():
            with self.subTest(case=name):
                forge = FakeForge().add(628).refusals(628, [21, 81, 139])
                code, out = run_main(["--repo", REPO, "--pull", "628"], forge, document=document)
                self.assertEqual(code, 0)
                self.assertIn("::warning::rework-bound:", out)
                self.assertEqual(forge.calls, [])

    def test_a_descriptor_that_cannot_be_parsed_is_a_warning(self):
        forge = FakeForge().add(628)
        with tempfile.TemporaryDirectory() as scratch:
            path = pathlib.Path(scratch) / "schemes.json"
            path.write_text("{ not json", encoding="utf-8")
            out = io.StringIO()
            with patch.object(rework_bound, "_gh", forge), \
                    patch.dict(os.environ, {"ZENDEV_SCHEMES_FILE": str(path)}), \
                    contextlib.redirect_stdout(out):
                code = rework_bound.main(["--repo", REPO, "--pull", "628"])
        self.assertEqual(code, 0)
        self.assertIn("::warning::rework-bound:", out.getvalue())
        self.assertEqual(forge.calls, [])


# ------------------------------------------------------------------------------ the ledger's reading


class LedgerReadingTests(unittest.TestCase):
    """The count is the pull-request ledger's own, by construction and by measurement."""

    FIXTURES = {
        "a review and its comment inside three minutes": [
            ("review", JUDGE, "CHANGES_REQUESTED", 30), ("comment", JUDGE, REFUSE, 31),
            ("comment", JUDGE, REFUSE, 90), ("comment", JUDGE, REFUSE, 150),
        ],
        "two comments two minutes apart": [
            ("comment", JUDGE, REFUSE, 30), ("comment", JUDGE, REFUSE, 32), ("comment", JUDGE, REFUSE, 90),
        ],
        "an acceptance between two refusals": [
            ("comment", JUDGE, REFUSE, 30), ("comment", JUDGE, ACCEPT, 31), ("comment", JUDGE, REFUSE, 32),
            ("comment", JUDGE, REFUSE, 40),
        ],
        "other accounts and bare reviews": [
            ("review", "drevendev", "CHANGES_REQUESTED", 10), ("review", JUDGE, "COMMENTED", 20),
            ("comment", "app/" + JUDGE, REFUSE, 30), ("review", JUDGE + "[bot]", "CHANGES_REQUESTED", 60),
            ("comment", JUDGE, REFUSE, 200),
        ],
    }

    def world(self, fixture):
        forge = FakeForge().add(628)
        for kind, login, what, minute in fixture:
            if kind == "review":
                forge.review(628, login, what, minute)
            else:
                forge.comment(628, login, what, minute)
        return forge

    def ledger_count(self, forge):
        pull = dict(forge.pulls[628]["pull"], created_at=at(0), closed_at=at(900), merged_at=at(900))
        record = rpr.summarize(pull, forge.pulls[628]["reviews"], forge.pulls[628]["comments"],
                               verdict_owner=JUDGE, qa_login="", scheme=None, now=BASE)
        return record["refusals"]

    def test_the_count_is_the_ledger_s_count(self):
        for name, fixture in self.FIXTURES.items():
            with self.subTest(fixture=name):
                forge = self.world(fixture)
                counted = rework_bound.refusals(forge.pulls[628]["reviews"], forge.pulls[628]["comments"], JUDGE)
                self.assertEqual(len(counted), self.ledger_count(forge))

    def test_one_verdict_seen_twice_is_one_refusal_and_keeps_the_pull_request_below_the_bound(self):
        forge = self.world(self.FIXTURES["two comments two minutes apart"])
        outcome = follow(forge, 628)
        self.assertEqual(len(outcome.refusals), 2)
        self.assertEqual(outcome.action, rework_bound.NOTHING)

    def test_a_review_and_its_comment_are_linked_once_by_the_one_kept(self):
        forge = self.world(self.FIXTURES["a review and its comment inside three minutes"])
        outcome = follow(forge, 628)
        self.assertEqual(outcome.action, rework_bound.MARKED)
        self.assertIn(forge.pulls[628]["reviews"][0]["html_url"], outcome.body)
        self.assertNotIn(forge.pulls[628]["comments"][0]["html_url"], outcome.body)

    def test_the_ledger_record_keeps_its_shape(self):
        forge = self.world(self.FIXTURES["a review and its comment inside three minutes"])
        found = rpr.verdicts(forge.pulls[628]["reviews"], forge.pulls[628]["comments"], JUDGE)
        self.assertTrue(found)
        self.assertTrue(all(list(entry) == ["at", "state", "source"] for entry in found))
        full = rpr.owner_verdicts(forge.pulls[628]["reviews"], forge.pulls[628]["comments"], JUDGE)
        self.assertEqual([{k: e[k] for k in rpr.RECORDED} for e in full], found)


# ------------------------------------------------------------------------------ the comment


class CommentTests(unittest.TestCase):
    def mark(self):
        forge = FakeForge().add(628, sha="d" * 40).refusals(628, [21, 81, 139])
        return forge, follow(forge, 628).body

    def test_it_names_the_count_the_bound_the_owner_and_every_refusal(self):
        forge, body = self.mark()
        self.assertTrue(body.startswith(rework_bound.HEADING + "\n"))
        self.assertIn("`%s`, the verdict owner under scheme/T" % JUDGE, body)
        self.assertIn("3 times; the bound is 3", body)
        self.assertIn("`%s`" % rework_bound.LABEL, body)
        self.assertIn("at head `%s`" % ("d" * 40), body)
        for index, comment in enumerate(forge.pulls[628]["comments"][:3], 1):
            self.assertIn("%d. %s, comment: %s" % (index, comment["created_at"], comment["html_url"]), body)

    def test_it_hands_the_review_to_the_researcher_and_keeps_the_verdict_where_it_was(self):
        _, body = self.mark()
        flat = " ".join(body.split())
        self.assertIn("the researcher reviews this pull request as the specification's owner", flat)
        self.assertIn("one `%s` comment that names the head" % rework_bound.REVIEW_HEADING, flat)
        for choice in ("**CONTINUE**", "**NARROW**", "**CLOSE**"):
            self.assertIn(choice, body)
        self.assertIn("returns to `status:ready`", flat)
        self.assertIn("The verdict stays the verdict owner's", flat)
        self.assertIn("`## Verdict: ACCEPT` and the four required checks green", flat)
        self.assertIn("`%s`" % rework_bound.GUIDE, body)
        self.assertTrue((ROOT / rework_bound.GUIDE).is_file())

    def test_the_mark_is_never_read_as_a_verdict_even_from_the_owner_s_account(self):
        _, body = self.mark()
        shaped = [{"user": {"login": JUDGE}, "created_at": at(300), "body": body}]
        self.assertEqual(rpr.verdicts([], shaped, JUDGE), [])
        self.assertNotRegex(body, r"(?im)^\s*(?:#{1,4}\s*|\*\*)\s*(?:ACCEPTOR\s+)?Verdict")

    def test_the_mark_cannot_pass_the_gate_that_starts_the_job(self):
        _, body = self.mark()
        self.assertFalse(body.lower().startswith("## verdict: request_changes"))

    def test_a_single_refusal_is_said_once(self):
        forge = FakeForge().add(628).refusals(628, [21])
        outcome = follow(forge, 628, rework_bound.Bound("scheme/T", JUDGE, 1))
        self.assertIn("has refused this pull request once; the bound is 1", outcome.body)


# ------------------------------------------------------------------------------ command line


class CommandLineTests(unittest.TestCase):
    ARGS = ["--repo", REPO, "--pull", "628"]

    def test_a_dry_run_prints_the_comment_and_writes_nothing(self):
        forge = FakeForge().add(628).refusals(628, [21, 81, 139])
        code, out = run_main(self.ARGS + ["--dry-run"], forge, document=descriptor(JUDGE, 3))
        self.assertEqual(code, 0)
        self.assertIn("would mark", out)
        self.assertIn(rework_bound.HEADING, out)
        self.assertEqual(forge.writes, [])

    def test_nothing_to_do_exits_zero(self):
        forge = FakeForge().add(628).refusals(628, [21])
        code, out = run_main(self.ARGS, forge, document=descriptor(JUDGE, 3))
        self.assertEqual(code, 0)
        self.assertIn("#628: nothing to do: 1 refusal(s)", out)

    def test_a_failed_label_fails_the_run_and_posts_no_comment(self):
        forge = FakeForge().add(628).refusals(628, [21, 81, 139])
        forge.refused["labels"] = "gh: Resource not accessible by integration (HTTP 403)"
        code, out = run_main(self.ARGS, forge, document=descriptor(JUDGE, 3))
        self.assertEqual(code, 1)
        self.assertIn("::error::rework-bound:", out)
        self.assertIn("(HTTP 403)", out)
        self.assertEqual(forge.marks(628), [])
        self.assertEqual(len(forge.writes), 1)

    def test_a_failed_comment_fails_the_run_and_the_next_run_completes_the_mark(self):
        forge = FakeForge().add(628).refusals(628, [21, 81, 139])
        forge.refused["comments"] = "gh: Server Error (HTTP 502)"
        code, _ = run_main(self.ARGS, forge, document=descriptor(JUDGE, 3))
        self.assertEqual(code, 1)
        self.assertEqual((forge.pulls[628]["labels"], forge.marks(628)), ([rework_bound.LABEL], []))
        del forge.refused["comments"]
        code, _ = run_main(self.ARGS, forge, document=descriptor(JUDGE, 3))
        self.assertEqual(code, 0)
        self.assertEqual(len(forge.marks(628)), 1)
        self.assertEqual(forge.pulls[628]["labels"], [rework_bound.LABEL])

    def test_a_read_that_fails_is_a_warning_and_changes_nothing(self):
        for path in ("repos/%s/pulls/628" % REPO, "repos/%s/issues/628/comments?per_page=100" % REPO,
                     "repos/%s/pulls/628/reviews?per_page=100" % REPO):
            with self.subTest(path=path):
                forge = FakeForge().add(628).refusals(628, [21, 81, 139])
                forge.unreadable[path] = "gh: Not Found (HTTP 404)"
                code, out = run_main(self.ARGS, forge, document=descriptor(JUDGE, 3))
                self.assertEqual(code, 0)
                self.assertIn("::warning::rework-bound: could not read", out)
                self.assertEqual(forge.writes, [])

    def test_a_workflow_command_cannot_be_smuggled_through_an_error(self):
        forge = FakeForge().add(628).refusals(628, [21, 81, 139])
        forge.refused["labels"] = "gh: bad (HTTP 422)\n::error::forged"
        _, out = run_main(self.ARGS, forge, document=descriptor(JUDGE, 3))
        self.assertNotIn("\n::error::forged", out)


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


def comments_of(body):
    return "\n".join(row.strip().lstrip("#").strip() for row in body.splitlines() if row.lstrip().startswith("#"))


class WorkflowTests(unittest.TestCase):
    def test_it_answers_a_created_comment_and_nothing_else(self):
        body = workflow()
        self.assertEqual(top_level(body, "on"), ["issue_comment:", "types: [created]"])

    def test_the_token_grants_pull_requests_write_and_nothing_else(self):
        # One top-level grant, no job widening it, and no other identity whose token the
        # grant would not bound.
        body = workflow()
        self.assertEqual(top_level(body, "permissions"), ["pull-requests: write"])
        self.assertEqual(len(re.findall(r"^\s*permissions:", body, re.MULTILINE)), 1)
        self.assertNotIn("create-github-app-token", body)
        self.assertNotIn("secrets.", body)
        self.assertNotIn("vars.", body)
        self.assertEqual(body.count("GH_TOKEN: ${{ github.token }}"), 1)
        self.assertEqual(len(re.findall(r"GH_TOKEN:", body)), 1)

    def test_the_mark_the_script_recognises_is_the_token_s_own(self):
        # The workflow acts as GITHUB_TOKEN, whose comments GitHub attributes to this login.
        self.assertIn("GH_TOKEN: ${{ github.token }}", workflow())
        self.assertEqual(rework_bound.SELF, "github-actions[bot]")

    def test_only_a_refusal_shaped_comment_on_a_pull_request_starts_the_job(self):
        body = workflow()
        self.assertIn(
            "    if: >-\n"
            "      github.event.issue.pull_request\n"
            "      && startsWith(github.event.comment.body, '## Verdict: REQUEST_CHANGES')\n",
            body,
        )
        self.assertEqual(len(re.findall(r"^\s*if:", body, re.MULTILINE)), 1)

    def test_the_gate_admits_the_form_the_script_counts(self):
        # The contract's refusal passes the gate and is counted; the mark passes neither.
        gate = re.search(r"startsWith\(github\.event\.comment\.body, '([^']+)'\)", workflow()).group(1)
        self.assertTrue(REFUSE.startswith(gate))
        self.assertEqual(rpr.VERDICT.search(gate).group(1), "REQUEST_CHANGES")
        self.assertFalse(rework_bound.HEADING.lower().startswith(gate.lower()))

    def test_no_expression_is_interpolated_into_a_shell_line(self):
        blocks = run_blocks(workflow())
        self.assertEqual(len(blocks), 1, "one step runs the script")
        self.assertNotIn("${{", blocks[0])

    def test_the_event_reaches_the_script_through_the_environment(self):
        body = workflow()
        self.assertIn("PR_NUMBER: ${{ github.event.issue.number }}", body)
        self.assertIn("REPOSITORY: ${{ github.repository }}", body)
        block = run_blocks(body)[0]
        self.assertIn('--pull "${PR_NUMBER}"', block)
        self.assertIn('--repo "${REPOSITORY}"', block)
        self.assertNotIn("github.event.comment.body }}", body, "the comment is read from the forge, not passed")

    def test_nothing_from_the_event_chooses_what_is_checked_out(self):
        body = workflow()
        self.assertEqual(body.count("uses: actions/checkout@"), 1)
        self.assertIsNone(re.search(r"^\s*ref:", body, re.MULTILINE))
        self.assertEqual(body.count("persist-credentials: false"), 1)

    def test_the_script_it_runs_is_the_checked_out_one(self):
        self.assertIn("python scripts/rework_bound.py", workflow())
        self.assertTrue(SCRIPT.is_file())

    def test_one_run_per_pull_request_at_a_time(self):
        body = workflow()
        self.assertIn("group: rework-bound-${{ github.event.issue.number }}", body)
        self.assertIn("cancel-in-progress: false", body)
        self.assertNotIn("cancel-in-progress: true", body)

    def test_why_it_cannot_trigger_itself_is_written_down(self):
        notes = " ".join(comments_of(workflow()).split())
        self.assertIn("GITHUB_TOKEN starts no workflow run", notes)
        self.assertIn("`## Rework bound reached`", notes)

    def test_the_permission_choice_is_reasoned_where_it_is_made(self):
        notes = " ".join(comments_of(workflow()).split())
        self.assertIn("`issues: write` would still need `pull-requests: read`", notes)

    def test_the_detectors_would_object(self):
        # Negative controls on the text checks themselves, so the assertions above cannot
        # pass by finding nothing to look at.
        widened = "permissions:\n  pull-requests: write\n  issues: write\n\njobs:\n"
        self.assertEqual(top_level(widened, "permissions"), ["pull-requests: write", "issues: write"])
        leaky = "steps:\n  - run: |\n      echo ${{ github.event.comment.body }}\n  - run: echo ${{ x }}\n"
        self.assertEqual(sum("${{" in block for block in run_blocks(leaky)), 2)
        self.assertIsNotNone(re.search(r"^\s*ref:", "      with:\n        ref: ${{ x }}\n", re.MULTILINE))


if __name__ == "__main__":
    unittest.main()
