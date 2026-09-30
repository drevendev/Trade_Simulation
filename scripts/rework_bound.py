"""Mark a pull request at the rework bound, once, and hand its review to the researcher.

The rework bound lived in the ACCEPTOR's workflow: `rework_limit.py` closed a pull
request at its third refusal. scheme/8 runs no ACCEPTOR, and from 2026-09-15 nothing
counted. #628 took six `## Verdict: REQUEST_CHANGES` on 2026-09-21, the first three
inside two hours, and nothing surfaced it until a status session counted by hand
(#771).

The operator decided on #771 to mark, not to close. When the verdict owner has refused
one pull request as often as the bound allows, the forge adds `status:needs-decision`
to it and says so once, in a `## Rework bound reached` comment linking every refusal.
From there the researcher reviews that pull request as the specification's owner, in
one `## Researcher review:` comment choosing CONTINUE, NARROW or CLOSE
(docs/zendev/ENDLESSZEN_AUTHOR.md). The verdict stays the verdict owner's.

## Whose refusals, how many, read how

Both numbers are the active scheme's, `verdict_owner` and `rework_limit` in
docs/zendev/schemes.json read through `schemes.py`: a scheme that moves either moves
the mark with it, and nothing here names an account or a count. A refusal is what the
pull-request ledger counts as one, read by the same function
(`record_pull_request.owner_verdicts`): the owner's `## Verdict: REQUEST_CHANGES`
comments and formal refusals, merged and de-duplicated. Anyone else's refusal is
evidence, not a round, and an ACCEPT is not a refusal. A second reading would drift,
and the mark and the ledger would disagree about which pull requests reached the bound.

## What it never does

It adds one label to the pull request it was started for and posts one comment there,
and nothing else: it never closes anything, never removes a label and never touches
another pull request. A machine pull request (`machine_pr_guard.classify`) is judged
by its gates alone and is read no further than its head branch; one that is no longer
open has nothing left to decide. The mark is made once: a pull request that already
carries a `## Rework bound reached` comment from this workflow's own identity is left
alone however many refusals follow, and the same heading from any other account does
not stand in for it.

Exit code 0 when there was nothing to do or the mark was made, 1 only when a write to
the forge failed. A read that fails is a warning and changes nothing.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from typing import NamedTuple

# Same directory: `python scripts/rework_bound.py` puts it first on the path, and the
# tests put it there explicitly.
import machine_pr_guard
import record_pull_request
import schemes

HEADING = "## Rework bound reached"
REVIEW_HEADING = "## Researcher review:"
LABEL = "status:needs-decision"
# The identity of every comment made with GITHUB_TOKEN. rework-bound.yml acts with that
# token and no other (scripts/tests/test_rework_bound.py holds it to that), so this is
# the author of every mark this script has made.
SELF = "github-actions[bot]"
REFUSAL = "CHANGES_REQUESTED"
GUIDE = "docs/zendev/ENDLESSZEN_AUTHOR.md"

NOTHING = "nothing to do"
WOULD_MARK = "would mark"
MARKED = "marked"


class Bound(NamedTuple):
    scheme: str
    owner: str
    limit: int


class Decision(NamedTuple):
    mark: bool
    reason: str
    refusals: list  # the owner's refusals, as `record_pull_request.owner_verdicts` reads them


class Outcome(NamedTuple):
    number: int
    action: str  # NOTHING, WOULD_MARK or MARKED
    reason: str
    refusals: list
    body: str  # the comment posted, or the one a dry run would post


# ------------------------------------------------------------------------------ rules


def bound_of(document):
    """`(Bound, "")` from the active scheme, or `(None, why)` when it gives none. Pure."""
    scheme = schemes.active(document) if isinstance(document, dict) else None
    if not scheme:
        return None, "the descriptor names no active scheme that exists"
    owner = str(scheme.get("verdict_owner") or "").strip()
    limit = scheme.get("rework_limit")
    if not owner:
        return None, f"{scheme.get('id')} names no verdict owner"
    if isinstance(limit, bool) or not isinstance(limit, int) or limit < 1:
        return None, f"{scheme.get('id')} names no usable rework bound (rework_limit: {limit!r})"
    return Bound(str(scheme.get("id")), owner, limit), ""


def left_alone(pull) -> str:
    """Why this pull request is not the rule's to mark, or "" when it is. Pure."""
    machine = machine_pr_guard.classify((pull.get("head") or {}).get("ref") or "")
    if machine is not None:
        return f"machine class `{machine.branch}`: judged by its gates alone"
    if pull.get("state") != "open":
        return "%s: nothing left to decide" % ("merged" if pull.get("merged_at") else "not open")
    return ""


def refusals(reviews, comments, owner) -> list:
    """The verdict owner's refusals on one pull request, read as the ledger reads them. Pure."""
    judged = record_pull_request.owner_verdicts(reviews, comments, owner)
    return [entry for entry in judged if entry["state"] == REFUSAL]


def already_marked(comments, author: str = SELF) -> bool:
    """Whether this workflow's own identity has marked the pull request before. Pure.

    Only its own comments count: the heading from any other account is that account's
    text, and must not silence the forge.
    """
    for comment in comments or []:
        login = (comment.get("user") or {}).get("login")
        if login == author and (comment.get("body") or "").startswith(HEADING):
            return True
    return False


def decide(reviews, comments, bound: Bound) -> Decision:
    """Whether to mark one open, ordinary pull request now. Pure."""
    found = refusals(reviews, comments, bound.owner)
    counted = f"{len(found)} refusal(s) by `{bound.owner}`, bound {bound.limit} ({bound.scheme})"
    if len(found) < bound.limit:
        return Decision(False, f"{counted}: below the bound", found)
    if already_marked(comments):
        return Decision(False, f"{counted}: already marked", found)
    return Decision(True, f"{counted}: the bound is reached", found)


def render(pull, found, bound: Bound) -> str:
    """The comment. Pure, and made only of what was read."""
    head = (pull.get("head") or {}).get("sha") or "unknown"
    times = "once" if len(found) == 1 else f"{len(found)} times"
    lines = [
        HEADING,
        "",
        f"`{bound.owner}`, the verdict owner under {bound.scheme}, has refused this pull request "
        f"{times}; the bound is {bound.limit}. Both are that scheme's (`verdict_owner` and "
        f"`rework_limit` in `docs/zendev/schemes.json`). The forge has added `{LABEL}` and says "
        f"so this once, at head `{head}`.",
        "",
        "Refusals, read as the pull-request ledger reads them:",
        "",
    ]
    for index, entry in enumerate(found, 1):
        kind = "formal review" if entry["source"] == "review" else "comment"
        link = (entry.get("item") or {}).get("html_url")
        lines.append(f"{index}. {entry['at']}, {kind}" + (f": {link}" if link else ""))
    lines += [
        "",
        "From here the researcher reviews this pull request as the specification's owner, in "
        f"one `{REVIEW_HEADING}` comment that names the head and chooses one of:",
        "",
        "- **CONTINUE** — the open findings are inside the requirement; rework goes on;",
        "- **NARROW** — the findings the review lists are outside this requirement: each is "
        "filed as its own Issue and linked, and the verdict owner judges what remains against "
        "the narrowed scope;",
        "- **CLOSE** — the pull request is closed and its Issue returns to `status:ready`, with "
        "a summary of what the refusals established.",
        "",
        "The verdict stays the verdict owner's: a merge still needs its `## Verdict: ACCEPT` and "
        "the four required checks green. This comment is not a verdict and closes nothing; the "
        f"rule is `{GUIDE}`, *What happens next*.",
    ]
    return "\n".join(lines) + "\n"


# ------------------------------------------------------------------------------ forge


def _gh(args):
    # UTF-8 explicitly, not by locale: see the note in machine_pr_guard.py.
    return subprocess.run(["gh", *args], capture_output=True, text=True, encoding="utf-8")


class ForgeError(RuntimeError):
    """A gh call failed with something other than an answer: a warning, for a read."""


class WriteError(ForgeError):
    """A write to the forge failed: the one failure that fails the run."""


def _failure(result) -> str:
    """The one line of a failed gh call worth printing: the HTTP status, if any."""
    for line in (result.stderr or "").splitlines():
        if "(HTTP " in line or line.startswith("gh: "):
            return line.strip()
    return f"gh exit {result.returncode}"


def _read(gh, path: str, what: str, paged: bool = False):
    result = gh(["api", "--paginate", "--slurp", path] if paged else ["api", path])
    if result.returncode:
        raise ForgeError(f"could not {what}: {_failure(result)}")
    try:
        answer = json.loads(result.stdout)
    except json.JSONDecodeError as error:
        raise ForgeError(f"could not {what}: unreadable answer ({error})") from error
    if not paged:
        return answer
    # `--slurp` answers one list per page; one flat list, whatever the count.
    return [item for page in answer or [] for item in (page if isinstance(page, list) else [page])]


def _write(gh, args, what: str) -> None:
    result = gh(["api", "--method", "POST", *args])
    if result.returncode:
        raise WriteError(f"could not {what}: {_failure(result)}")


def follow(repo: str, number: int, bound: Bound, *, dry_run: bool = False, gh=None) -> Outcome:
    """Apply the rule to one pull request after one refusal-shaped comment on it."""
    gh = gh or _gh
    pull = _read(gh, f"repos/{repo}/pulls/{number}", f"read #{number}")
    why = left_alone(pull)
    if why:
        return Outcome(number, NOTHING, why, [], "")
    comments = _read(gh, f"repos/{repo}/issues/{number}/comments?per_page=100",
                     f"read the comments of #{number}", paged=True)
    reviews = _read(gh, f"repos/{repo}/pulls/{number}/reviews?per_page=100",
                    f"read the reviews of #{number}", paged=True)
    decision = decide(reviews, comments, bound)
    if not decision.mark:
        return Outcome(number, NOTHING, decision.reason, decision.refusals, "")
    body = render(pull, decision.refusals, bound)
    if dry_run:
        return Outcome(number, WOULD_MARK, decision.reason, decision.refusals, body)
    # The label first: the comment is what says the mark was made, so it is written
    # last, and a run that fails between the two is completed by the next one.
    _write(gh, [f"repos/{repo}/issues/{number}/labels", "-f", f"labels[]={LABEL}"],
           f"add `{LABEL}` to #{number}")
    _write(gh, [f"repos/{repo}/issues/{number}/comments", "-f", f"body={body}"],
           f"comment on #{number}")
    return Outcome(number, MARKED, decision.reason, decision.refusals, body)


# ------------------------------------------------------------------------------ entry


def _escape(data) -> str:
    """A workflow-command message: the three characters the runner would read as syntax."""
    return str(data).replace("%", "%25").replace("\r", "%0D").replace("\n", "%0A")


def _warn(message: str) -> int:
    print(f"::warning::rework-bound: {_escape(message)}")
    return 0


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--repo", required=True, help="owner/name")
    parser.add_argument("--pull", required=True, type=int, help="the pull request the comment is on")
    parser.add_argument("--dry-run", action="store_true", help="decide and print the comment; write nothing")
    args = parser.parse_args(argv)

    try:
        document = schemes.load()
    except (OSError, ValueError) as error:
        return _warn(f"the scheme descriptor could not be read: {error}")
    bound, why = bound_of(document)
    if bound is None:
        return _warn(why)
    try:
        outcome = follow(args.repo, args.pull, bound, dry_run=args.dry_run)
    except WriteError as error:
        print(f"::error::rework-bound: {_escape(error)}")
        return 1
    except ForgeError as error:
        return _warn(str(error))
    print(f"rework-bound: #{outcome.number}: {outcome.action}: {outcome.reason}")
    if outcome.action == WOULD_MARK:
        print(outcome.body)
    return 0


if __name__ == "__main__":
    sys.exit(main())
