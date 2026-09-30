"""The linked Issue must carry its label axes before a review run is spent on it.

`AGENTS.md` states the rule: *"Before an Issue may be claimed it carries exactly one
`priority:*`, exactly one `type:*`, and at least one `area:*`."* Until now the only thing
enforcing it was the ACCEPTOR, and `ACCEPTOR_RUNBOOK.md` section 2 said why it stayed
there: the gate *could* be checked, and no run had yet failed it.

A run has now failed it. Issue #448 carried `priority:high`, `type:bug` and
`status:needs-review` and no `area:*` label at all; it was claimed, implemented, and
carried to PR #459, where an ACCEPTOR run found the missing axis at review time and
refused the pull request. That refusal was correct and it was the most expensive place to
make it: one AUTHOR run, one ACCEPTOR run and a rework round, to report a missing label.
So the gate moves here, into the required `policy-guard` check, where a missing label
costs a re-run instead.

What this refuses, and nothing else: an Issue the pull request links whose labels do not
satisfy the three axes. It names the Issue, the axis, and the labels actually present, so
the fix is one `gh issue edit` and not an investigation.

Which Issues a pull request links is taken from two witnesses, and every Issue either one
names is checked, once. The first is the body: a closing keyword followed by `#N`, by
`<owner>/<name>#N` or by the Issue's URL, outside quoted text. The second is GitHub's own
answer, the pull request's `closingIssuesReferences` — the only place a link made in the
sidebar alone appears at all. Until #519 the body was the only witness, and every link it
could not see failed *open*: GitHub linked the Issue, the guard resolved nothing, and a
required gate reported green over an Issue nobody read. If GitHub's answer cannot be read,
the body alone decides and the log carries a warning saying why. That is exactly what the
guard did before, so failing to read the second witness adds no new way for this to fail.

What it deliberately does not do:

* **It does not refuse a pull request that links no Issue.** That gate is the ACCEPTOR's,
  stated once in section 2 alongside Issue completeness; a second, differently-worded
  refusal of the same rule would make one failure report as two unrelated defects. A
  pull request with nothing linked passes here and is judged there.
* **It does not apply the missing label.** Auto-labelling decides the work's area on the
  author's behalf and destroys the signal the axis exists to carry. It refuses and names.
* **It does not read a link out of quoted text.** A closing keyword inside a code span,
  a fenced block or an HTML comment does not link an Issue on GitHub, so it does not link
  one here either. A handoff has to be able to write down what a link looks like.
* **It does not gate another repository's Issue.** A qualified form or a URL may name an
  Issue elsewhere, and GitHub will close it, but its labels answer to that repository's
  contract rather than this one, and `gh issue view N` here would read a different Issue
  altogether. Both witnesses drop it.
* **It does not read `status:*`.** That axis is the loop's own bookkeeping, it changes
  several times over an Issue's life, and it is not one of the three the contract names.
  It is not counted toward any axis and its presence never changes the result.

Machine-generated pull requests are exempt by construction: they have no author, no
handoff and no Issue, and `machine_pr_guard` already decides what they may touch. The
exemption is decided from the head branch before either witness is consulted, so it costs
no call to the forge.

Exit code 0 means every linked Issue carries its axes, 1 means at least one does not.
"""

from __future__ import annotations

import argparse
import json
import pathlib
import re
import subprocess
import sys

# Same directory. This module is run as `python scripts/issue_label_guard.py`, so that
# directory is already first on the path; the tests put it there explicitly.
import machine_pr_guard

# GitHub's own closing keywords, which are what actually link an Issue to a pull request.
# A bare `#123` is a reference, not a link: it neither closes the Issue nor tells this
# guard which Issue the work belongs to, and treating one as a link would let an
# incidental mention of a badly labelled Issue refuse an unrelated pull request.
CLOSING_KEYWORDS = ("close", "closes", "closed", "fix", "fixes", "fixed", "resolve", "resolves", "resolved")

# A keyword links an Issue named in any of the three ways GitHub accepts: `#N`,
# `<owner>/<name>#N`, and the Issue's full URL. The guard read the first alone until #519,
# so a body that closed its Issue by URL linked it on GitHub and nothing here — the gate
# green over an Issue it never inspected. The qualified forms can name *another*
# repository, whose Issue is not this contract's to gate, so the pattern captures the
# repository each one spells and `linked_issues` keeps the link only when that is the
# repository the guard runs for. The short form spells none and always means this one.
LINK = re.compile(
    r"\b(?:%s)\b\s*:?\s+(?:"
    r"#(?P<number>\d+)"
    r"|(?P<slug>[\w.-]+/[\w.-]+)#(?P<slug_number>\d+)"
    r"|https?://github\.com/(?P<url_repo>[\w.-]+/[\w.-]+)/issues/(?P<url_number>\d+)"
    r")" % "|".join(CLOSING_KEYWORDS),
    re.IGNORECASE,
)

# GitHub does not link a closing keyword it finds inside a code span, a fenced block or
# an HTML comment, and neither does this. The first pull request to carry this guard
# refused itself on exactly that: its handoff documented a live run against a body
# reading `Closes #999999`, in backticks, and the guard went and asked the forge about
# Issue 999999. A handoff must be able to quote a link without creating one — otherwise
# the record of what a guard does cannot be written down without tripping it.
HTML_COMMENT = re.compile(r"<!--.*?-->", re.DOTALL)
# The closing fence is the same character as the opening one, repeated *at least* as many
# times (GFM 4.5), which is why the two fence characters are two alternatives rather than
# one backreference: `\1` alone matches only an exactly-equal closer. Requiring equality
# made this guard fail open, and that is the dangerous direction — a body closing ``` with
# ```` left the opener unmatched, the `|\Z` fallback ate the rest of the body, and the real
# `Closes #N` below it vanished before `LINK` ever ran. Reported against PR #518.
#
# The two alternatives differ in one more place, and only one of them may be relaxed: a
# *backtick* fence's info string may not contain a backtick (GFM 4.5, example 115), while a
# tilde fence's may contain anything, backticks included (example 118). Accepting `[^\n]*`
# on the backtick side read `` ``` aa ``` `` as an opener — which GitHub does not — and the
# same `|\Z` fallback then swallowed the body below it, hiding a real link again. That is
# the identical fail-open direction as the defect above, reached through a different door:
# GitHub links the `Closes #N`, the guard never resolves the Issue, and its labels go
# unchecked. `[^`\n]*` is the whole repair, and it is deliberately not mirrored onto the
# tilde side, where it would refuse openers GFM allows. Reported as Issue #521.
#
# A fence — opening or closing — may be indented *no more than three spaces* (GFM 4.5); at
# four it is an indented code line instead and opens nothing (example 104). `[ \t]*` here
# accepted any indentation at all, which is the same fail-open direction a third time: a
# four-space ``` line was taken as an opener, an ordinary unindented ``` further down
# "closed" it, and the real `Closes #N` between them was stripped before `LINK` ran.
# GitHub links that keyword; the guard resolved nothing and the axis gate reported green
# over an Issue it never inspected. Reported as Issue #523.
#
# `{0,3}` counts *spaces* and no tabs, which is the whole of the tab rule rather than an
# omission of it: indentation is measured in columns against four-column tab stops, so a
# tab appearing anywhere in columns 0-3 advances to column 4 and already exceeds the
# allowance. There is no leading tab a fence may carry, so there is none to spell.
#
# Trailing whitespace after a closer stays `[ \t]*`: GFM restricts what may *precede* a
# fence, and permits spaces or tabs after it.
#
# What this parser does not model, on purpose: GFM's *indented* code block (4.4) — a run
# of lines indented four or more columns that does not continue a paragraph — and a fence
# indented relative to a list item's content column, where GFM measures the 0-3 allowance
# above from that column rather than from the margin, so a fence four or six spaces in
# under a list item is still a fence and GitHub renders its contents inert. In both, a
# closing keyword GitHub renders as code is read here as a live link. Issues #525 and #526.
#
# The consequence is over-linking and only that: the guard may inspect an Issue GitHub
# does not link. That fails *closed* — at worst a refusal that names the Issue, and
# reformatting the body, a fence at the margin or the keyword in backticks, is the whole
# repair — which is the opposite direction from the three defects above, each of which let
# a required gate report green over an Issue it never inspected. It is accepted because the alternative
# risks exactly those: modelling list context with regular expressions is the same kind of
# approximation that produced all three, and a pattern taught to recognize a fence four
# spaces in will, on some body nobody anticipated, recognize one GitHub does not — after
# which the `|\Z` fallback removes the rest of the body, real links included. And since
# #519 the body is no longer the only witness: GitHub's own list of the Issues it links is
# read as well, so a link this parser misses is still inspected, while a link it invents
# stays visible in the refusal that names it.
FENCED_CODE = re.compile(
    r"^ {0,3}(?:(`{3,})[^`\n]*\n.*?(?:^ {0,3}\1`*[ \t]*$|\Z)"
    r"|(~{3,})[^\n]*\n.*?(?:^ {0,3}\2~*[ \t]*$|\Z))",
    re.DOTALL | re.MULTILINE,
)
# A code span may not contain a blank line, so an unclosed backtick swallows a
# paragraph at most rather than the rest of the body.
INLINE_CODE = re.compile(r"(`+)(?:(?!\1)[^\n]|\n(?!\s*\n))+?\1")


def strip_code(text):
    """The body with code spans, fenced blocks and HTML comments removed. Pure.

    Removed, not blanked to spaces: nothing downstream reads an offset, and the
    surrounding text keeps its own line structure because the fenced pattern is anchored
    to whole lines.
    """
    without = HTML_COMMENT.sub("", text or "")
    without = FENCED_CODE.sub("", without)
    return INLINE_CODE.sub("", without)

# The three axes the working contract names, and how many labels each admits.
# `status:*` is absent on purpose — see the module docstring.
AXES = (
    ("priority:", "exactly one", 1, 1),
    ("type:", "exactly one", 1, 1),
    ("area:", "at least one", 1, None),
)


def linked_issues(body, repo=None):
    """Issue numbers the body links with a closing keyword, in order, deduplicated. Pure.

    `repo` is the `owner/name` the guard runs for. A short `#N` always names it; a
    qualified form or a URL links only when the repository it spells is that one, compared
    without regard to case, as GitHub compares names. With no `repo` nothing says which
    repository is this one, and the qualified forms link nothing.
    """
    this = (repo or "").lower()
    seen = []
    for match in LINK.finditer(strip_code(body)):
        if match.group("number"):
            number = int(match.group("number"))
        elif (match.group("slug") or match.group("url_repo")).lower() == this:
            number = int(match.group("slug_number") or match.group("url_number"))
        else:
            continue
        if number not in seen:
            seen.append(number)
    return seen


def github_linked(answer, repo):
    """The Issues of `repo` that GitHub's own answer links, in order, deduplicated. Pure.

    `answer` is what `gh pr view --json closingIssuesReferences` prints, parsed. An Issue
    of another repository is dropped, exactly as a qualified form naming one is dropped
    from the body. An answer of any other shape raises `ValueError`, so a changed answer
    is reported as unreadable instead of being read as "links nothing" — which would
    silently remove the witness this exists to add.
    """
    references = answer.get("closingIssuesReferences") if isinstance(answer, dict) else None
    if not isinstance(references, list):
        raise ValueError("the answer carries no closingIssuesReferences list")
    this = (repo or "").lower()
    numbers = []
    for reference in references:
        try:
            owner = reference["repository"]["owner"]["login"]
            name = reference["repository"]["name"]
            number = reference["number"]
        except (KeyError, TypeError):
            raise ValueError("a closing reference names no repository or number") from None
        if not (isinstance(owner, str) and isinstance(name, str) and type(number) is int):
            raise ValueError("a closing reference is not shaped the way gh prints one")
        if ("%s/%s" % (owner, name)).lower() == this and number not in numbers:
            numbers.append(number)
    return numbers


def axis_violations(number, labels):
    """How the labels of one Issue fail the three axes. Pure.

    `labels` is the Issue's label names. Returns one human-readable violation per axis
    that is wrong, each naming the Issue, the axis and what is actually present.
    """
    names = sorted(labels)
    violations = []
    for prefix, requirement, low, high in AXES:
        present = [name for name in names if name.startswith(prefix)]
        if len(present) < low or (high is not None and len(present) > high):
            found = ", ".join("`%s`" % name for name in present) if present else "none"
            violations.append(
                "Issue #%d carries %s `%s*` label(s) (%s); the working contract requires "
                "%s. Labels on the Issue: %s."
                % (
                    number,
                    len(present),
                    prefix,
                    found,
                    requirement,
                    ", ".join("`%s`" % name for name in names) if names else "none",
                )
            )
    return violations


def warn_in_the_log(message):
    print("::warning::issue-label-guard: %s" % message)


def why_unreadable(error):
    """Why GitHub's answer could not be read, on one line, short enough for an annotation."""
    if isinstance(error, subprocess.CalledProcessError):
        detail = "gh exited %d: %s" % (error.returncode, error.stderr or "")
    else:
        detail = "%s: %s" % (type(error).__name__, error)
    return " ".join(detail.split())[:300]


def check(body, head_ref, labels_of, repo=None, closing_references=None, warn=warn_in_the_log):
    """Pure decision given its resolvers. Returns a list of human-readable violations.

    `labels_of` maps an Issue number to its label names, and `closing_references` returns
    GitHub's own answer about this pull request; they are the only parts of this that
    touch the forge, and they are injected so the decision above stays testable without a
    network. The Issues checked are the body's links followed by any GitHub adds, each
    once. When GitHub's answer cannot be read, `warn` is told why and the body alone
    decides — the guard's behaviour before #519. `closing_references=None` consults the
    body alone and warns about nothing.
    """
    if machine_pr_guard.classify(head_ref or "") is not None:
        return []
    linked = linked_issues(body, repo)
    if closing_references is not None:
        try:
            answer = github_linked(closing_references(), repo)
        except (subprocess.CalledProcessError, OSError, ValueError) as error:
            warn(
                "could not read the Issues GitHub links to this pull request (%s); "
                "the body's closing keywords alone decide which Issues are checked"
                % why_unreadable(error)
            )
            answer = []
        for number in answer:
            if number not in linked:
                linked.append(number)
    violations = []
    for number in linked:
        violations.extend(axis_violations(number, labels_of(number)))
    return violations


def _gh(args):
    # UTF-8 explicitly, not by locale: an Issue title or label may carry bytes a cp1252
    # console decodes into something else, and the reader then fails several frames away
    # from the cause. Same fix as status_lint.py and machine_pr_guard.py carry.
    return subprocess.run(
        ["gh", *args], check=True, capture_output=True, text=True, encoding="utf-8"
    ).stdout


def forge_labels(repo):
    """A resolver that asks the forge for one Issue's labels."""

    def labels_of(number):
        raw = _gh(
            ["issue", "view", str(number), "--repo", repo, "--json", "labels"]
        )
        return [label["name"] for label in json.loads(raw).get("labels") or []]

    return labels_of


def forge_closing_references(repo, pull):
    """A provider that asks the forge which Issues it links to one pull request."""

    def closing_references():
        return json.loads(
            _gh(["pr", "view", str(pull), "--repo", repo, "--json", "closingIssuesReferences"])
        )

    return closing_references


def read_body(path):
    if not path:
        return ""
    file = pathlib.Path(path)
    if not file.is_file():
        return ""
    return file.read_text(encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", required=True, help="owner/name")
    parser.add_argument("--pull", type=int, required=True, help="pull request number")
    parser.add_argument("--head-ref", required=True, help="head branch name")
    parser.add_argument(
        "--body-file", required=True, help="file holding the pull request body"
    )
    args = parser.parse_args()

    body = read_body(args.body_file)
    forge = forge_labels(args.repo)
    inspected = []

    def labels_of(number):
        # Recorded, so the success line below names exactly the Issues whose labels were
        # read. A list recomputed from the body would leave out what GitHub linked.
        inspected.append(number)
        return forge(number)

    try:
        violations = check(
            body,
            args.head_ref,
            labels_of,
            args.repo,
            forge_closing_references(args.repo, args.pull),
        )
    except subprocess.CalledProcessError as exc:
        # An unresolvable Issue is not a pass. Failing loudly here says the guard could
        # not decide, which is what happened; swallowing it would report a green gate
        # over an Issue nobody looked at.
        print(
            "::error::issue-label-guard: could not read a linked Issue from %s: %s"
            % (args.repo, (exc.stderr or "").strip()[:300])
        )
        return 1

    if not violations:
        machine = machine_pr_guard.classify(args.head_ref)
        if inspected:
            print(
                "issue-label-guard: %s carries its priority/type/area axes"
                % ", ".join("#%d" % n for n in inspected)
            )
        elif machine is not None:
            print(
                "issue-label-guard: `%s` is a machine pull request and links no Issue; "
                "machine-pr-guard decides it" % machine.branch
            )
        else:
            print(
                "issue-label-guard: found no linked Issue to check; whether a pull request "
                "may link none is the ACCEPTOR's gate, not this one"
            )
        return 0

    for violation in violations:
        print("::error::issue-label-guard: %s" % violation)
    return 1


if __name__ == "__main__":
    sys.exit(main())
