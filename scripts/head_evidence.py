"""Say on the pull request what the forge measured on its head, and what moved that head.

#765. A verdict and a handoff name "the exact head", and a loop branch that is merely
behind is merged with its base by the forge (`update_branches.py`). So every time
`master` moved — twelve mirror syncs in four days, while the specification was being
indexed — every open pull request got a new head, and the handoff and the verdict that
named the old one stopped counting. #661 changed head nine times between 2026-09-25 and
2026-09-29 without its own diff changing by a line, was green on all four required
checks throughout, and was refused for a stale handoff.

The same refusal had a second cause: the verdict owner reads the forge through a
provider that did not return the check runs of that head, and `unknown` is not `green`.
What it can read is the pull request's comments.

So the forge says both things where they can be read. For the head of an open loop pull
request on which all four required checks are green, this writes one comment:

* the four checks, each with the link it was measured at;
* the chain of heads behind it on which the pull request's own diff was the same, back
  to the head at which that diff last changed. A merge of the base leaves such a head
  behind, and so does a regeneration of the coverage table. A handoff or a verdict that
  names any head of that chain stands for this one (`AGENTS.md`).

**The pull request's own diff** is the lines it removes and the lines it adds, per file,
against the merge base with its base branch — positions dropped, because a line added
above by the base moves a hunk without changing it, and the generated coverage table
excluded, because it is regenerated from the registry on every base merge and is
presentation only. Two heads with the same diff identity would land the same change.
A base merge that had to resolve a conflict inside the pull request's own lines changes
what is removed or added, so its identity differs and nothing is carried across it.

This reads commits as data — `git diff`, never a checkout — and executes nothing from
the branch. It measures and reports; it never judges. A head that is not green gets no
comment: the red check is already the message.

Exit code is 0 whatever was found. The outcome is written for the workflow to act on,
and a measurement that could not be made is a warning, not a failed run.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
from typing import Callable, NamedTuple, Optional

import machine_pr_guard
import mergeability
import update_branches

HEADING = "## Head evidence"
# The three jobs of ci.yml and the one commit status, which together are the required
# checks of the protected branch. `scripts/tests/test_head_evidence.py` ties these names
# to the workflow and to `mergeability.CONTEXT`, so a rename cannot leave this reporting
# on checks that no longer exist.
JOBS = ("build-and-test", "typescript", "policy-guard")
STATUS = mergeability.CONTEXT
GENERATED = "docs/spec/IMPLEMENTATION_STATUS.md"
MACHINE_LOGIN = "zendev-machine[bot]"
# A chain longer than this is reported up to the bound and no further. Nine base merges
# in four days was the worst observed; fifty is a guard against a walk that never ends,
# not a limit anyone should meet.
MAX_CHAIN = 50

SHA = re.compile(r"^[0-9a-f]{40}$")
HUNK = re.compile(r"^@@ .*? @@.*$", re.MULTILINE)
INDEX = re.compile(r"^index [0-9a-f]+\.\.[0-9a-f]+.*\n", re.MULTILINE)


# ----------------------------------------------------------------------- diff identity


def normalize(diff: str) -> str:
    """The diff with everything positional removed. Pure.

    Hunk headers carry line numbers and `index` lines carry blob names; both change when
    the base changes elsewhere in the file, and neither is part of what the pull request
    removes or adds.
    """
    return HUNK.sub("@@", INDEX.sub("", diff.replace("\r\n", "\n")))


def identity(diff: str) -> str:
    """Sixteen hex digits naming the pull request's own diff. Pure."""
    return hashlib.sha256(normalize(diff).encode("utf-8", "surrogateescape")).hexdigest()[:16]


# ----------------------------------------------------------------------------- chain


class Commit(NamedTuple):
    """What the chain walk needs to know about one commit."""

    sha: str
    parents: tuple
    # Whether the second parent is reachable from the base branch: the side of a merge
    # that brought the base in. False for a commit with fewer than two parents.
    merges_base: bool
    # Whether the commit itself is the base branch's. The walk never steps onto one.
    on_base: bool
    identity: str


class Chain(NamedTuple):
    """The head, and the heads behind it on which the diff was the same.

    `heads` runs from the head at which the diff last changed to the head reported on.
    One element means the head itself carries the content. `bounded` is set when the
    walk stopped at `MAX_CHAIN` rather than at a change.
    """

    heads: tuple
    bounded: bool

    @property
    def origin(self) -> str:
        return self.heads[0]

    @property
    def carried(self) -> bool:
        return len(self.heads) > 1


def is_base_merge(commit: Commit) -> bool:
    """A merge of the base into the branch: two parents, the second from the base. Pure."""
    return len(commit.parents) == 2 and commit.merges_base


def walk(head: str, read: Callable[[str], Commit], bound: int = MAX_CHAIN) -> Chain:
    """Follow first parents back from `head` while the diff stays the same. Pure over `read`.

    The first parent of a head is the head before it: a merge of the base has the branch
    as its first parent, and an ordinary commit has only one. The walk stops where the
    identity differs — that head is where the content last changed — and never steps
    onto the base branch, so a pull request whose own diff is empty does not walk into
    the base's history looking for a change.

    What kind of commit a head is decides nothing here; the diff does. The first version
    followed merges of the base only, and on #661 it stopped at `22feb2aa`, an ordinary
    commit that regenerated the coverage table and changed nothing else.
    """
    heads = [head]
    current = read(head)
    while current.parents:
        if len(heads) > bound:
            return Chain(tuple(reversed(heads)), True)
        previous = read(current.parents[0])
        if previous.on_base or previous.identity != current.identity:
            break
        heads.append(previous.sha)
        current = previous
    return Chain(tuple(reversed(heads)), False)


# ---------------------------------------------------------------------------- checks


class Row(NamedTuple):
    name: str
    measured: str
    evidence: str


def green(check_runs, statuses):
    """(rows, reason). Rows when all four required checks are green, else why not. Pure.

    The latest run of a job decides: a job re-run after a failure is measured by its
    re-run. Statuses arrive newest first from the forge and are sorted here anyway, so
    the answer does not depend on the order they were handed over in.
    """
    rows = []
    for name in JOBS:
        mine = [run for run in check_runs if run.get("name") == name]
        if not mine:
            return None, f"`{name}` has not run on this head"
        latest = max(mine, key=lambda run: (run.get("started_at") or "", run.get("id") or 0))
        if latest.get("status") != "completed":
            return None, f"`{name}` is still running"
        if latest.get("conclusion") != "success":
            return None, f"`{name}` concluded `{latest.get('conclusion')}`"
        rows.append(Row(name, latest.get("completed_at") or "", latest.get("html_url") or ""))
    mine = [status for status in statuses if status.get("context") == STATUS]
    if not mine:
        return None, f"`{STATUS}` has not been written on this head"
    latest = max(mine, key=lambda status: (status.get("created_at") or "", status.get("id") or 0))
    if latest.get("state") != "success":
        return None, f"`{STATUS}` is `{latest.get('state')}`"
    rows.append(Row(STATUS, latest.get("created_at") or "", latest.get("description") or ""))
    return rows, ""


# ------------------------------------------------------------------------- selection


def reportable(pull, sha: str):
    """(bool, reason). Whether this pull request's head is one the forge reports on. Pure.

    The classes `update_branches` maintains, for the same reason: those are the branches
    whose heads the forge itself moves.
    """
    head = pull.get("head") or {}
    base = pull.get("base") or {}
    ref = head.get("ref") or ""
    if pull.get("state", "open") != "open":
        return False, "not open"
    if head.get("sha") != sha:
        return False, "this is no longer its head"
    head_repo = (head.get("repo") or {}).get("full_name")
    if not head_repo or head_repo != (base.get("repo") or {}).get("full_name"):
        return False, "head is not in this repository"
    if machine_pr_guard.classify(ref) is not None:
        return False, "machine class: judged by its gates alone"
    if not ref.startswith(update_branches.MAINTAINED_PREFIXES):
        return False, "not a loop branch"
    return True, ""


def already_said(comments, sha: str, author: str = MACHINE_LOGIN) -> bool:
    """Whether the forge has reported on this head before. Pure.

    Only the forge's own comments count: a comment shaped like this one from anyone else
    is that account's claim, and must not silence the measurement.
    """
    for comment in comments:
        body = comment.get("body") or ""
        login = (comment.get("user") or {}).get("login")
        if login == author and body.startswith(HEADING) and sha in body:
            return True
    return False


# ---------------------------------------------------------------------------- render


def short(sha: str) -> str:
    return sha[:8]


def render(
    sha: str, rows, chain: Chain, files: int, diff_id: str, base_ref: str, merged_base: bool
) -> str:
    """The comment. Pure, and made only of what was measured.

    `merged_base` is whether the head itself is a merge of the base; it chooses a
    sentence and nothing else.
    """
    lines = [
        f"{HEADING}: `{sha}`",
        "",
        "Measured by the forge on this exact head. Nothing here is a judgement.",
        "",
        "**Required checks — all four green**",
        "",
        "| Check | Outcome | Measured | Evidence |",
        "| --- | --- | --- | --- |",
    ]
    lines += [f"| `{row.name}` | passed | {row.measured} | {row.evidence} |" for row in rows]
    noun = "file" if files == 1 else "files"
    lines += ["", "**What moved the head**", ""]
    if chain.carried:
        path = " → ".join(f"`{short(head)}`" for head in chain.heads)
        since = "at least since" if chain.bounded else "at"
        what = (
            f"This head is a merge of `{base_ref}` into the branch"
            if merged_base
            else "This head is a commit on the branch"
        )
        lines += [
            f"{what}, and the pull request's own diff did not change with it: the same lines "
            f"removed and added in the same {files} {noun} (diff identity `{diff_id}`, the "
            f"generated coverage table excluded). The diff last changed {since} "
            f"`{short(chain.origin)}`; every head after it carries the same diff:",
            "",
            path,
            "",
            f"A handoff or a verdict that names any head of this chain stands for `{short(sha)}`.",
        ]
    else:
        lines += [
            f"This head carries content of its own: the pull request's diff ({files} {noun}, diff "
            f"identity `{diff_id}`) is not the one its parent had. A handoff or a verdict that "
            "names an earlier head does not cover it.",
        ]
    return "\n".join(lines) + "\n"


# ------------------------------------------------------------------------------ git


def _git(args, cwd="."):
    # UTF-8 explicitly, not by locale: see the note in machine_pr_guard.py. Bytes that are
    # not UTF-8 survive as surrogates, so a binary patch still hashes to itself.
    return subprocess.run(
        ["git", *args], cwd=cwd, capture_output=True, text=True, encoding="utf-8", errors="surrogateescape"
    )


def own_diff(sha: str, base: str, cwd=".") -> tuple:
    """(diff text, number of files) of `sha` against its merge base with `base`."""
    found = _git(["merge-base", sha, base], cwd)
    if found.returncode:
        raise RuntimeError(f"no merge base between {short(sha)} and {base}")
    fork = found.stdout.strip()
    scope = ["--", ".", f":(exclude){GENERATED}"]
    flags = ["--no-color", "--no-ext-diff", "--no-textconv", "--no-renames"]
    diff = _git(["diff", *flags, "--binary", "-U0", fork, sha, *scope], cwd)
    names = _git(["diff", *flags, "--name-only", fork, sha, *scope], cwd)
    if diff.returncode or names.returncode:
        raise RuntimeError(f"could not read the diff of {short(sha)}")
    return diff.stdout, len([name for name in names.stdout.splitlines() if name.strip()])


def reader(base: str, cwd=".") -> Callable[[str], Commit]:
    """How `walk` reads a commit from the repository."""

    def read(sha: str) -> Commit:
        listed = _git(["rev-list", "--parents", "-n", "1", sha], cwd)
        if listed.returncode:
            raise RuntimeError(f"could not read commit {short(sha)}")
        full, *parents = listed.stdout.split()
        merges_base = (
            len(parents) == 2
            and _git(["merge-base", "--is-ancestor", parents[1], base], cwd).returncode == 0
        )
        on_base = _git(["merge-base", "--is-ancestor", full, base], cwd).returncode == 0
        diff, _ = own_diff(full, base, cwd)
        return Commit(full, tuple(parents), merges_base, on_base, identity(diff))

    return read


# ------------------------------------------------------------------------------ forge


def _gh(args):
    return subprocess.run(["gh", *args], capture_output=True, text=True, encoding="utf-8")


def _api(path: str):
    result = _gh(["api", "--paginate", "--slurp", path])
    if result.returncode:
        raise RuntimeError(
            f"could not read {path}: {update_branches.failure_detail(result.stderr, result.returncode)}"
        )
    pages = json.loads(result.stdout)
    merged = []
    for page in pages:
        if isinstance(page, list):
            merged.extend(page)
        else:
            merged.append(page)
    return merged


def pulls_with_head(repo: str, sha: str):
    return _api(f"repos/{repo}/commits/{sha}/pulls")


def check_runs(repo: str, sha: str):
    runs = []
    for page in _api(f"repos/{repo}/commits/{sha}/check-runs?per_page=100"):
        runs.extend(page.get("check_runs") or [])
    return runs


def statuses(repo: str, sha: str):
    return _api(f"repos/{repo}/commits/{sha}/statuses?per_page=100")


def comments(repo: str, number: int):
    return _api(f"repos/{repo}/issues/{number}/comments?per_page=100")


# ------------------------------------------------------------------------------- main


def emit(outcome: str, number: Optional[int] = None) -> None:
    """Hand the outcome to the workflow. Printed too, so a local run shows it."""
    print(f"head-evidence: {outcome}" + (f" for #{number}" if number else ""))
    target = os.environ.get("GITHUB_OUTPUT")
    if target:
        with open(target, "a", encoding="utf-8") as handle:
            handle.write(f"outcome={outcome}\n")
            if number:
                handle.write(f"number={number}\n")


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", required=True, help="owner/name")
    parser.add_argument("--sha", required=True, help="the head commit to report on")
    parser.add_argument("--report", required=True, help="where to write the comment")
    parser.add_argument("--remote", default="origin", help="the remote the base branch is read from")
    args = parser.parse_args(argv)

    sha = args.sha.strip().lower()
    if not SHA.match(sha):
        print("::warning::head-evidence: not a full commit SHA; nothing to report on")
        emit("silent")
        return 0

    try:
        candidates = pulls_with_head(args.repo, sha)
        chosen = None
        for pull in candidates:
            ok, reason = reportable(pull, sha)
            if ok:
                chosen = pull
                break
            print(f"head-evidence: #{pull.get('number')} left alone: {reason}")
        if chosen is None:
            emit("silent")
            return 0
        number = int(chosen["number"])

        rows, reason = green(check_runs(args.repo, sha), statuses(args.repo, sha))
        if rows is None:
            print(f"head-evidence: #{number} not green: {reason}")
            emit("silent", number)
            return 0
        if already_said(comments(args.repo, number), sha):
            emit("already", number)
            return 0

        base_ref = (chosen.get("base") or {}).get("ref") or ""
        base = f"{args.remote}/{base_ref}"
        read = reader(base)
        chain = walk(sha, read)
        diff, files = own_diff(sha, base)
        body = render(sha, rows, chain, files, identity(diff), base_ref, is_base_merge(read(sha)))
    except (RuntimeError, ValueError, KeyError, json.JSONDecodeError, OSError) as error:
        print(f"::warning::head-evidence: {error}")
        emit("silent")
        return 0

    with open(args.report, "w", encoding="utf-8", newline="\n") as handle:
        handle.write(body)
    emit("evidence", number)
    return 0


if __name__ == "__main__":
    sys.exit(main())
