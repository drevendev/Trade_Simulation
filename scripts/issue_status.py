"""The status axis of an Issue is a true answer, and the forge keeps it one.

A `status:*` label answers one question - what state is this Issue in - and it is worth
something only while the answer is true. Two rules keep it true, and until now both were
left to whoever touched the Issue last:

* **A closed Issue carries no `status:*` label** (#121). `cleanup_closed_issues.py` has
  said so since #130, and no workflow ever ran it: 88 closed Issues still carried a
  status label when #770 was filed, #765 among them with `status:in-progress`.
* **An open Issue carries at most one: the one applied last** (#214). The AUTHOR runbook
  tells its role to replace the old label rather than add one beside it, and a model with
  no memory does not always do it. #160 sat in `status:ready` and `status:in-progress`
  for fifteen hours; #200 did the same ten minutes after `rework_limit.py` had set it
  straight. Each time an operator rebuilt the state from the timeline.

`.github/workflows/issue-status.yml` runs this on the events that break either rule:

* `event --action closed`: every `status:*` label comes off the Issue.
* `event --action labeled` with a `status:*` label: on an open Issue the status label
  applied last stays and every other one comes off; on a closed Issue every one comes
  off, the one just applied included.
* `repair`: every closed Issue that still carries a status label, listed (`--mode
  dry-run`, the default) or repaired (`--mode apply`). The catch-up for the weeks nothing
  ran, and for whatever a missed event leaves behind.

## Decided from the Issue, not from the event

A run starts seconds after its event - minutes, on a slow queue - and the Issue may have
moved in between. So a run reads the Issue as it is when the run starts, and on an open
Issue it reads which status label was applied last from the Issue's own label history,
not from the event that happened to start it. Every run of one Issue therefore reaches
the same answer whatever order the runs go in: of two labels applied a second apart the
later one stays even when the earlier one's run starts last, and a label taken off and
put back counts from when it was put back, which is the shape of #200. The label the
event applied matters only when the history has not caught up with it yet. An Issue
reopened before its closure's run starts keeps its labels: its status is live again.

## What it never does

It removes `status:*` labels and nothing else. It never adds a label - absence is a real
state before triage, and inventing a status would be worse than the ambiguity this
fixes - never touches `priority:*`, `type:*`, `area:*`, `policy` or `qa`, never closes or
reopens anything, and never touches a pull request, which the REST API lists among the
Issues and which is dropped wherever it appears.

What each run removed, who applied the label it kept, and why it removed nothing when it
did not, go to the run's step summary: a role that keeps mislabelling is visible rather
than silently corrected (#214).
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
import urllib.parse
from typing import NamedTuple, Optional

# Same directory: `python scripts/issue_status.py` puts it first on the path, and the
# tests put it there explicitly. The one definition of a status label (#121, #130), so
# that the closed rule and the open rule can never disagree about which labels are theirs.
from cleanup_closed_issues import is_status_label

CLOSED = "closed"
LABELED = "labeled"

DRY_RUN = "dry-run"
APPLY = "apply"

# GitHub asks an integration that makes many mutating requests to leave a second between
# them, and answers a burst with a secondary rate limit. The repair removes about ninety
# labels, once; an event run removes one or two and never waits.
PAUSE_SECONDS = 1.0


class LabelEvent(NamedTuple):
    """One application of a label, from the Issue's history."""

    name: str
    at: str  # `created_at`, ISO 8601 UTC as the API writes it, so it sorts as text
    id: int  # the event's id, which orders two applications within one second
    actor: str


class Decision(NamedTuple):
    remove: list  # status labels to take off, in the order the Issue lists them
    keep: Optional[str]  # the status label that stays, when the rule chose one
    reason: str  # one line for the step summary


# ------------------------------------------------------------------------------ rules


def status_labels(names) -> list:
    """The names on the status axis, in the order given. Pure."""
    return [name for name in names if is_status_label(name)]


def last_applications(history) -> dict:
    """The latest application of each label name in a history. Pure."""
    latest = {}
    for event in history:
        known = latest.get(event.name)
        if known is None or (event.at, event.id) > (known.at, known.id):
            latest[event.name] = event
    return latest


def applied_last(present, history, applied=None) -> Optional[str]:
    """Which of `present` was applied most recently, or None if nothing can say. Pure.

    The Issue's history decides. A label the history does not show yet, but which the
    event that started this run just applied, ranks above everything the history does
    show: a history that has not caught up with this event holds nothing later than it.
    A label with no application in the history and no event behind it ranks below
    everything, and when that is all there is, None comes back and nothing is removed.
    """
    latest = last_applications(history)

    def rank(name):
        if name in latest:
            return (1, latest[name].at, latest[name].id)
        if applied is not None and name == applied:
            return (2, "", 0)
        return (0, "", 0)

    best = max(present, key=rank, default=None)
    if best is None or rank(best)[0] == 0:
        return None
    return best


def decide(action, state, labels, applied=None, history=(), is_pull_request=False) -> Decision:
    """Which `status:*` labels come off one Issue after one event. Pure.

    `state` and `labels` are the Issue as it is when the run starts, not as the event
    described it. `applied` is the label a `labeled` event applied. `history` is the
    Issue's label applications (`LabelEvent`), read only for a `labeled` event.
    """
    if is_pull_request:
        return Decision([], None, "a pull request; the status axis is kept on Issues only")
    present = status_labels(labels)

    if action == CLOSED:
        if state != CLOSED:
            return Decision([], None, "reopened by the time this run read it; its status is live again")
        return _clear(present, "closed")

    if action != LABELED:
        return Decision([], None, "%s events are not this rule's" % _code(action))
    if not applied:
        return Decision([], None, "the event names no label, so there is nothing to decide")
    if not is_status_label(applied):
        return Decision([], None, "%s is not a status label" % _code(applied))
    if state == CLOSED:
        return _clear(present, "closed when %s was applied" % _code(applied))
    if not present:
        return Decision([], None, "carries no status label, and none is added")
    if len(present) == 1:
        return Decision([], present[0], "carries one status label, %s" % _code(present[0]))

    keep = applied_last(present, history, applied)
    if keep is None:
        return Decision(
            [], None,
            "the label history does not say which of %s was applied last, so none is removed"
            % _codes(present),
        )
    return Decision(
        [name for name in present if name != keep],
        keep,
        "%s was applied last; an open Issue carries one status label" % _code(keep),
    )


def _clear(present, why) -> Decision:
    if not present:
        return Decision([], None, "%s, and carries no status label" % why)
    return Decision(list(present), None, "%s; a closed Issue carries no status label" % why)


def carrying_status(items) -> list:
    """`(number, status labels)` of each closed Issue in a listing that still has one. Pure.

    The REST listing holds pull requests among the Issues; they are dropped, and so is
    anything open, whatever the query asked for.
    """
    found = []
    for item in items:
        if "pull_request" in item or item.get("state") != CLOSED:
            continue
        present = status_labels(label.get("name") for label in item.get("labels") or [])
        if present:
            found.append((int(item["number"]), present))
    return sorted(found)


# ------------------------------------------------------------------------------ forge


def _gh(args):
    # UTF-8 explicitly, not by locale: see the note in machine_pr_guard.py.
    return subprocess.run(["gh", *args], capture_output=True, text=True, encoding="utf-8")


class ForgeError(RuntimeError):
    """A gh call failed with something other than an answer."""


def _failure(result) -> str:
    """The one line of a failed gh call worth printing: the HTTP status, if any."""
    for line in (result.stderr or "").splitlines():
        if "(HTTP " in line or line.startswith("gh: "):
            return line.strip()
    return "gh exit %s" % result.returncode


def _read(gh, args, what):
    result = gh(args)
    if result.returncode:
        raise ForgeError("could not %s: %s" % (what, _failure(result)))
    try:
        return json.loads(result.stdout)
    except json.JSONDecodeError as error:
        raise ForgeError("could not %s: unreadable answer (%s)" % (what, error)) from error


def _pages(slurped) -> list:
    """`--paginate --slurp` answers one list per page; one flat list, whatever the count."""
    items = []
    for page in slurped or []:
        if isinstance(page, list):
            items.extend(page)
        else:
            items.append(page)
    return items


def read_issue(repo, number, gh=None) -> dict:
    """The Issue as it is now: state, label names, and whether it is a pull request."""
    issue = _read(gh or _gh, ["api", "repos/%s/issues/%d" % (repo, number)], "read #%d" % number)
    return {
        "state": issue.get("state"),
        "labels": [label.get("name") for label in issue.get("labels") or []],
        "is_pull_request": "pull_request" in issue,
    }


def read_history(repo, number, gh=None) -> list:
    """Every application of a label to the Issue, as `LabelEvent`s, oldest first."""
    events = _pages(
        _read(
            gh or _gh,
            ["api", "--paginate", "--slurp", "repos/%s/issues/%d/events?per_page=100" % (repo, number)],
            "read the label history of #%d" % number,
        )
    )
    history = []
    for event in events:
        name = (event.get("label") or {}).get("name")
        if event.get("event") != LABELED or not name:
            continue
        history.append(
            LabelEvent(name, event.get("created_at") or "", int(event.get("id") or 0),
                       (event.get("actor") or {}).get("login") or "")
        )
    return history


def remove_label(repo, number, name, gh=None) -> bool:
    """Take one label off one Issue: True if this call removed it, False if already gone.

    The name is percent-encoded into the path: it is text anyone with triage access
    chose, and a `/`, `?` or `#` in it must not become part of the URL's structure.
    """
    path = "repos/%s/issues/%d/labels/%s" % (repo, number, urllib.parse.quote(name, safe=""))
    result = (gh or _gh)(["api", "--method", "DELETE", path])
    if not result.returncode:
        return True
    if "(HTTP 404)" in (result.stderr or ""):
        # Already off: a person, a role or an earlier run got there first. The rule holds
        # either way, and removing a label is idempotent by intent.
        return False
    raise ForgeError("could not remove %s from #%d: %s" % (_code(name), number, _failure(result)))


def list_closed_issues(repo, gh=None) -> list:
    return _pages(
        _read(
            gh or _gh,
            ["api", "--paginate", "--slurp", "repos/%s/issues?state=closed&per_page=100" % repo],
            "list the closed Issues",
        )
    )


# ------------------------------------------------------------------------------ runs


class Outcome(NamedTuple):
    number: int
    action: str
    applied: Optional[str]
    state: Optional[str]
    decision: Decision
    kept_by: Optional[LabelEvent]  # the application behind the label that stays
    removed: list
    already_gone: list
    failed: list  # (label, message)
    dry_run: bool


def follow(repo, number, action, applied=None, *, dry_run=False, gh=None) -> Outcome:
    """Apply the rule to one Issue after one `issues` event."""
    gh = gh or _gh
    issue = read_issue(repo, number, gh)
    history = read_history(repo, number, gh) if action == LABELED else []
    decision = decide(action, issue["state"], issue["labels"], applied, history, issue["is_pull_request"])
    removed, gone, failed = [], [], []
    if not dry_run:
        for name in decision.remove:
            try:
                (removed if remove_label(repo, number, name, gh) else gone).append(name)
            except ForgeError as error:
                failed.append((name, str(error)))
    kept_by = last_applications(history).get(decision.keep) if decision.remove else None
    return Outcome(number, action, applied, issue["state"], decision, kept_by,
                   removed, gone, failed, dry_run)


class Repaired(NamedTuple):
    number: int
    listed: list  # the status labels the listing showed
    removed: list
    already_gone: list
    failed: list  # (label or None, message)
    note: str  # why nothing was removed, when nothing was


def repair(repo, *, apply=False, gh=None, pause=None):
    """Every closed Issue still carrying a status label: `(found, results)`.

    A dry run lists and returns no results; nothing is removed. Applying re-reads each
    Issue first and decides it exactly as its closure would have: an Issue reopened since
    the listing is left alone.
    """
    gh = gh or _gh
    pause = pause or time.sleep
    found = carrying_status(list_closed_issues(repo, gh))
    if not apply:
        return found, []

    results = []
    mutated = False
    for number, listed in found:
        try:
            issue = read_issue(repo, number, gh)
        except ForgeError as error:
            results.append(Repaired(number, listed, [], [], [(None, str(error))], ""))
            continue
        decision = decide(CLOSED, issue["state"], issue["labels"],
                          is_pull_request=issue["is_pull_request"])
        removed, gone, failed = [], [], []
        for name in decision.remove:
            if mutated:
                pause(PAUSE_SECONDS)
            mutated = True
            try:
                (removed if remove_label(repo, number, name, gh) else gone).append(name)
            except ForgeError as error:
                failed.append((name, str(error)))
        results.append(Repaired(number, listed, removed, gone, failed,
                                "" if decision.remove else decision.reason))
    return found, results


# ------------------------------------------------------------------------------ reports


def _code(text) -> str:
    """Text as inline code in Markdown, a table cell included, whatever it carries."""
    shown = str(text if text is not None else "").replace("`", "'").replace("|", "\\|")
    return "`%s`" % " ".join(shown.split())


def _codes(names) -> str:
    return ", ".join(_code(name) for name in names) or "none"


def _escape(data) -> str:
    """A workflow-command message: the three characters the runner would read as syntax."""
    return str(data).replace("%", "%25").replace("\r", "%0D").replace("\n", "%0A")


def event_summary(outcome, sender="") -> str:
    event = "`%s`" % outcome.action
    if outcome.applied:
        event += " %s" % _code(outcome.applied)
    if sender:
        event += " by %s" % _code(sender)
    lines = ["%s; the Issue is %s now." % (event, outcome.state or "unknown")]
    decision = outcome.decision

    if decision.remove and decision.keep:
        who = outcome.kept_by
        applied_by = " by %s at %s" % (_code(who.actor), who.at) if who and who.actor else ""
        lines.append("%s was applied%s beside %s." % (_code(decision.keep), applied_by, _codes(decision.remove)))

    if outcome.dry_run:
        if decision.remove:
            lines.append("Dry run: would remove %s. %s." % (_codes(decision.remove), _sentence(decision.reason)))
        else:
            lines.append("Dry run: nothing to remove. %s." % _sentence(decision.reason))
    elif decision.remove:
        if outcome.removed:
            lines.append("Removed %s. %s." % (_codes(outcome.removed), _sentence(decision.reason)))
        if outcome.already_gone:
            lines.append("Already gone: %s." % _codes(outcome.already_gone))
        for name, message in outcome.failed:
            lines.append("Failed to remove %s: %s" % (_code(name), message))
    else:
        lines.append("Nothing removed. %s." % _sentence(decision.reason))
    return "### Issue status: #%d\n\n%s\n" % (outcome.number, "\n\n".join(lines))


def notices(outcome, sender="") -> list:
    """The run page's own line when a second status label came off an open Issue (#214)."""
    if outcome.dry_run or not outcome.removed or not outcome.decision.keep:
        return []
    who = (outcome.kept_by.actor if outcome.kept_by and outcome.kept_by.actor else sender) or "someone"
    message = "#%d: %s applied %s beside %s; removed %s" % (
        outcome.number, who, outcome.decision.keep,
        ", ".join(outcome.decision.remove), ", ".join(outcome.removed))
    return ["::notice title=Second status label::%s" % _escape(message)]


def repair_summary(repo, found, results, apply) -> str:
    lines = [
        "### Issue status repair: %s" % (APPLY if apply else DRY_RUN),
        "",
        "%d closed Issue(s) in %s %s a status label (pull requests excluded)."
        % (len(found), _code(repo), "carried" if apply else "still carry"),
    ]
    if not found:
        return "\n".join(lines) + "\n"

    by_number = {result.number: result for result in results}
    lines += ["", "| Issue | Status labels | Result |", "| --- | --- | --- |"]
    for number, listed in found:
        if not apply:
            outcome = "would remove"
        else:
            outcome = _describe(by_number.get(number))
        lines.append("| #%d | %s | %s |" % (number, _codes(listed), outcome))

    if apply:
        removed = sum(len(result.removed) for result in results)
        touched = sum(1 for result in results if result.removed)
        gone = sum(len(result.already_gone) for result in results)
        failed = sum(len(result.failed) for result in results)
        lines += ["", "Removed %d label(s) from %d Issue(s); %d already gone; %d failed."
                  % (removed, touched, gone, failed)]
    else:
        lines += ["", "Dry run: nothing was removed. Dispatch again with `mode: apply` to remove them."]
    return "\n".join(lines) + "\n"


def _describe(result) -> str:
    if result is None:
        return "not reached"
    parts = []
    if result.removed:
        parts.append("removed %s" % _codes(result.removed))
    if result.already_gone:
        parts.append("already gone: %s" % _codes(result.already_gone))
    for name, message in result.failed:
        parts.append("failed%s: %s" % (" (%s)" % _code(name) if name else "", message.replace("|", "\\|")))
    if not parts:
        parts.append("nothing removed: %s" % result.note)
    return "; ".join(parts)


def _sentence(text) -> str:
    return text[:1].upper() + text[1:] if text else text


def publish(text, environ=None) -> None:
    """Print the report, and append it to the step summary when the run has one."""
    environ = os.environ if environ is None else environ
    sys.stdout.write(text)
    path = environ.get("GITHUB_STEP_SUMMARY")
    if path:
        with open(path, "a", encoding="utf-8") as summary:
            summary.write(text + "\n")


# ------------------------------------------------------------------------------ entry


def _parser():
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    commands = parser.add_subparsers(dest="command", required=True)

    event = commands.add_parser("event", help="apply the rule to one Issue after one issues event")
    event.add_argument("--repo", required=True, help="owner/name")
    event.add_argument("--issue", required=True, type=int, help="the Issue the event is about")
    event.add_argument("--action", required=True, help="the event's action: closed or labeled")
    event.add_argument("--applied", default="", help="the label a labeled event applied")
    event.add_argument("--sender", default="", help="who acted, for the summary only")
    event.add_argument("--dry-run", action="store_true", help="decide and report; remove nothing")

    fix = commands.add_parser("repair", help="every closed Issue that still carries a status label")
    fix.add_argument("--repo", required=True, help="owner/name")
    fix.add_argument("--mode", choices=(DRY_RUN, APPLY), default=DRY_RUN,
                     help="dry-run lists and removes nothing (the default); apply removes")
    return parser


def main(argv=None) -> int:
    args = _parser().parse_args(argv)

    if args.command == "event":
        try:
            outcome = follow(args.repo, args.issue, args.action, args.applied or None,
                             dry_run=args.dry_run)
        except ForgeError as error:
            print("::error::issue-status: %s" % _escape(error))
            return 1
        publish(event_summary(outcome, args.sender))
        for line in notices(outcome, args.sender):
            print(line)
        return 1 if outcome.failed else 0

    try:
        found, results = repair(args.repo, apply=args.mode == APPLY)
    except ForgeError as error:
        print("::error::issue-status: %s" % _escape(error))
        return 1
    publish(repair_summary(args.repo, found, results, args.mode == APPLY))
    return 1 if any(result.failed for result in results) else 0


if __name__ == "__main__":
    sys.exit(main())
