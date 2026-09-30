"""Record a closed pull request in the private ledger: what it was, who wrote it, how it
was judged, and how long each step took.

The run ledger (``runs/``) says what each model run cost. It cannot say how fast and how
well requirements land once the AUTHOR is not a model run: under scheme/7 the researcher
writes the code as a person would, and no run records anything about a pull request it
did not open. So the unit of measurement moves from the run to the pull request, which
every author produces, and this writes one record per closed pull request — ``pulls/``
beside ``runs/``, same ledger, same identity, same scheme stamp.

Speed is read off the timestamps: opened, first verdict, merged or closed. Quality is
read off the verdicts: how many refusals by the verdict owner before it merged, whether
the first verdict accepted it, whether the forge closed it at the rework bound or as
unreachable, and how many QA findings the external voice left on it. Size and scope are
the diff and the Issue and requirement identifiers the body names. None of it is an
opinion about the code; every field is a fact GitHub already holds, copied at the one
moment it stops changing.

Written from ``master``'s definition on ``pull_request_target: closed`` (pr-ledger.yml),
so the pull request's own code never runs with the ledger credential in the
environment. A record is never the reason a pull request fails to close: every delivery
failure is a warning and exit 0, like the run recorder. The record's path is the closing
time and the number, so recording the same pull request twice — a backfill after a live
run, a repair by hand — is refused by the ledger rather than duplicated.
"""

from __future__ import annotations

import argparse
import base64
import datetime as dt
import json
import os
import pathlib
import re
import subprocess
import sys
import urllib.error
import urllib.request

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import machine_pr_guard  # noqa: E402
import schemes  # noqa: E402

API = "https://api.github.com"
KIND = "pull_request"

REQUIREMENT = re.compile(r"\bREQ-[A-Z]+-\d{3}\b")
CLOSES = re.compile(r"\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#(\d+)", re.IGNORECASE)
# The verdict owner's comment: `## Verdict: ACCEPT`, `## ACCEPTOR Verdict: REQUEST_CHANGES`,
# with or without a trailing head reference. The shape select_review_target.py reads.
VERDICT = re.compile(
    r"^\s*(?:#{1,4}\s*|\*\*)\s*(?:ACCEPTOR\s+)?VERDICT\s*[:\-—]\s*(ACCEPT|REQUEST_CHANGES)\b",
    re.IGNORECASE | re.MULTILINE,
)
QA_FINDING = re.compile(r"\bQA:\s*FINDING\b", re.IGNORECASE)
# The forge's own closing comments (rework_limit.py, stale_pull_requests.py).
REWORK_BOUND = re.compile(r"^\s*#{1,4}\s*Rework bound reached", re.IGNORECASE | re.MULTILINE)
UNREACHABLE = re.compile(r"^\s*#{1,4}\s*Closed as unreachable", re.IGNORECASE | re.MULTILINE)

STATE_OF = {
    "ACCEPT": "APPROVED",
    "APPROVED": "APPROVED",
    "REQUEST_CHANGES": "CHANGES_REQUESTED",
    "CHANGES_REQUESTED": "CHANGES_REQUESTED",
}
# Two entries this close together with the same state are one verdict seen twice: a
# formal review and the comment that explains it.
SAME_VERDICT = dt.timedelta(minutes=3)
# What the ledger keeps of a verdict. `owner_verdicts` also carries the review or comment
# each one was read from, under `item`; the record does not.
RECORDED = ("at", "state", "source")


def normalize_login(login) -> str:
    """`app/name`, `name[bot]` and `name` are one identity; compared case-insensitively."""
    login = (login or "").strip()
    if login.startswith("app/"):
        login = login[len("app/"):]
    if login.endswith("[bot]"):
        login = login[: -len("[bot]")]
    return login.lower()


def parse_time(value):
    if not value:
        return None
    return dt.datetime.fromisoformat(str(value).replace("Z", "+00:00"))


def minutes_between(start, end):
    """Whole-minute precision is enough for a measure read per day; one decimal keeps
    a ten-minute review from rounding to zero."""
    a, b = parse_time(start), parse_time(end)
    if a is None or b is None:
        return None
    return round((b - a).total_seconds() / 60, 1)


def _login_of(entry) -> str:
    return normalize_login((entry.get("user") or {}).get("login"))


def owner_verdicts(reviews, comments, owner):
    """The verdict owner's verdicts in time order, reviews and verdict comments merged
    and de-duplicated, each with the review or comment it was read from. Pure.

    A formal review and a verdict comment are two ways the same identity says the same
    thing, and on some pull requests it says it both ways for one head. Both are read;
    the second of two identical states inside `SAME_VERDICT` is dropped. Anyone else's
    review — the researcher's, an operator's — is evidence, not a verdict, exactly as the
    loop treats it.

    This is the one reading of a verdict. The ledger records what it returns
    (`verdicts`), and the rework bound counts and links its refusals
    (`rework_bound.py`); two readings would put two refusal counts on one pull request.
    """
    owner = normalize_login(owner)
    found = []
    for review in reviews or []:
        state = (review.get("state") or "").upper()
        if state not in ("APPROVED", "CHANGES_REQUESTED") or _login_of(review) != owner:
            continue
        found.append({
            "at": review.get("submitted_at"),
            "state": state,
            "source": "review",
            "item": review,
        })
    for comment in comments or []:
        if _login_of(comment) != owner:
            continue
        match = VERDICT.search(comment.get("body") or "")
        if not match:
            continue
        found.append({
            "at": comment.get("created_at"),
            "state": STATE_OF[match.group(1).upper()],
            "source": "comment",
            "item": comment,
        })
    floor = dt.datetime.min.replace(tzinfo=dt.timezone.utc)
    found.sort(key=lambda entry: parse_time(entry["at"]) or floor)
    kept = []
    for entry in found:
        if kept and kept[-1]["state"] == entry["state"]:
            gap = (parse_time(entry["at"]) or floor) - (parse_time(kept[-1]["at"]) or floor)
            if gap <= SAME_VERDICT:
                continue
        kept.append(entry)
    return kept


def verdicts(reviews, comments, owner):
    """The verdict owner's verdicts as the ledger records them: when, which state, and
    through which channel. Pure."""
    return [{key: entry[key] for key in RECORDED} for entry in owner_verdicts(reviews, comments, owner)]


def closed_reason(pull, comments):
    """Why a pull request closed without merging. Pure.

    `rework_bound` and `unreachable` are the forge's two closers, recognised by the
    headings their comments carry; anything else — an author closing their own, a
    duplicate superseded by hand — is `other`. A merged pull request has no reason.
    """
    if pull.get("merged_at"):
        return None
    for comment in reversed(comments or []):
        body = comment.get("body") or ""
        if REWORK_BOUND.search(body):
            return "rework_bound"
        if UNREACHABLE.search(body):
            return "unreachable"
    return "other"


def summarize(pull, reviews, comments, *, verdict_owner, qa_login, scheme, now, run_url=None):
    """One ledger record from what GitHub holds about a closed pull request. Pure."""
    body = pull.get("body") or ""
    title = pull.get("title") or ""
    head_ref = (pull.get("head") or {}).get("ref") or ""
    author = (pull.get("user") or {}).get("login") or ""
    machine = machine_pr_guard.classify(head_ref)
    judged = verdicts(reviews, comments, verdict_owner)
    first = judged[0] if judged else None
    qa = normalize_login(qa_login) if qa_login else ""
    findings = sum(
        1 for comment in comments or []
        if qa and _login_of(comment) == qa and QA_FINDING.search(comment.get("body") or "")
    )
    own = normalize_login(author)
    created_at = pull.get("created_at")
    merged_at = pull.get("merged_at")
    closed_at = pull.get("closed_at")
    return {
        "recorded_at": now.isoformat(timespec="seconds"),
        "kind": KIND,
        "number": pull.get("number"),
        "title": title,
        "author": author,
        "author_kind": "app" if (pull.get("user") or {}).get("type") == "Bot" else "user",
        "head_ref": head_ref,
        "base_ref": (pull.get("base") or {}).get("ref"),
        "machine_class": machine.branch if machine else None,
        "draft": bool(pull.get("draft")),
        "created_at": created_at,
        "closed_at": closed_at,
        "merged_at": merged_at,
        "merged": bool(merged_at),
        "merge_commit": pull.get("merge_commit_sha") if merged_at else None,
        "closed_reason": closed_reason(pull, comments),
        "additions": pull.get("additions"),
        "deletions": pull.get("deletions"),
        "changed_files": pull.get("changed_files"),
        "commits": pull.get("commits"),
        "issues": sorted({int(number) for number in CLOSES.findall(body)}),
        "requirements": sorted(set(REQUIREMENT.findall(title + "\n" + body))),
        "verdict_owner": normalize_login(verdict_owner),
        "verdicts": judged,
        "refusals": sum(1 for entry in judged if entry["state"] == "CHANGES_REQUESTED"),
        "accepted_first_time": (first["state"] == "APPROVED") if first else None,
        "first_verdict_at": first["at"] if first else None,
        "minutes_to_first_verdict": minutes_between(created_at, first["at"]) if first else None,
        "minutes_open": minutes_between(created_at, merged_at or closed_at),
        "qa_findings": findings,
        "author_comments": sum(1 for comment in comments or [] if _login_of(comment) == own),
        "scheme": scheme,
        "run_url": run_url,
    }


def scheme_in_force(document, when):
    """The descriptor of the scheme in force at `when` — the latest whose `in_force_from`
    is at or before it — or None when no scheme was. Pure.

    A live record closes under the active scheme and the two agree. A backfill does
    not: the pull request landed under whatever scheme was in force then. The
    descriptor's own `in_force_from` is the boundary, exactly as the tags say.
    """
    moment = parse_time(when)
    if moment is None:
        return None
    chosen = None
    for scheme in (document or {}).get("schemes", []):
        start = parse_time(scheme.get("in_force_from"))
        if start is None or start > moment:
            continue
        if chosen is None or start >= parse_time(chosen.get("in_force_from")):
            chosen = scheme
    return chosen


def scheme_at(document, when):
    """`{id, digest}` of the scheme in force at `when`, or None. Pure.

    Stamping a backfilled pull request with today's scheme would file a Sonnet day under
    an Opus scheme.
    """
    chosen = scheme_in_force(document, when)
    if chosen is None:
        return None
    return {"id": chosen["id"], "digest": schemes.digest(chosen)}


def owner_for(document, when, *, explicit=None, active=None) -> str:
    """Whose verdicts count for a pull request that closed at `when`. Pure.

    The verdict owner is part of a scheme, so it has to come from the same descriptor as
    the stamp. Read once from the active scheme, as this used to be, a backfill run
    under scheme/8 would judge every earlier pull request by SLOPSTER's verdicts — of
    which there are none — and rewrite its refusals and first-verdict acceptance to
    "never judged" while still stamping it scheme/6 (#545). An explicit owner is a
    deliberate override and wins; the active scheme is only the fallback for a closing
    time no scheme covers.
    """
    if explicit:
        return explicit
    in_force = scheme_in_force(document, when) or {}
    return in_force.get("verdict_owner") or (active or {}).get("verdict_owner") or ""


def record_path(record) -> str:
    """`pulls/<year>/<month>/<closed>-<number>.json`: the closing time, not the recording
    time, so a live record and a backfill of the same pull request name one path."""
    closed = parse_time(record.get("merged_at") or record.get("closed_at"))
    if closed is None:
        closed = parse_time(record["recorded_at"])
    closed = closed.astimezone(dt.timezone.utc)
    return (
        f"pulls/{closed.year:04d}/{closed.month:02d}/"
        f"{closed.strftime('%Y%m%dT%H%M%SZ')}-{record['number']}.json"
    )


def closed_since(pulls, since) -> list:
    """The closed pull requests whose closing time is at or after `since`. Pure."""
    threshold = parse_time(since)
    chosen = []
    for pull in pulls or []:
        closed = parse_time(pull.get("closed_at"))
        if closed is not None and closed >= threshold:
            chosen.append(pull)
    return sorted(chosen, key=lambda pull: parse_time(pull["closed_at"]))


def _gh(args):
    # UTF-8 explicitly, not by locale; see the note in machine_pr_guard.py.
    return subprocess.run(
        ["gh", *args], check=True, capture_output=True, text=True, encoding="utf-8"
    ).stdout


def read_pull(repo: str, number: int):
    return json.loads(_gh(["api", f"repos/{repo}/pulls/{number}"]))


def read_reviews(repo: str, number: int):
    return json.loads(_gh(["api", "--paginate", "--slurp", f"repos/{repo}/pulls/{number}/reviews?per_page=100"]))


def read_comments(repo: str, number: int):
    return json.loads(_gh(["api", "--paginate", "--slurp", f"repos/{repo}/issues/{number}/comments?per_page=100"]))


def read_closed(repo: str):
    return json.loads(_gh([
        "api", "--paginate", "--slurp",
        f"repos/{repo}/pulls?state=closed&sort=updated&direction=desc&per_page=100",
    ]))


def _flatten(pages):
    """`--slurp` returns one list per page; a single page comes back as one list."""
    if pages and isinstance(pages[0], list):
        return [item for page in pages for item in page]
    return pages


def put_record(repo: str, path: str, payload: str, token: str) -> None:
    body = json.dumps({
        "message": f"record: {path}",
        "content": base64.b64encode(payload.encode("utf-8")).decode("ascii"),
    }).encode("utf-8")
    request = urllib.request.Request(
        f"{API}/repos/{repo}/contents/{path}",
        data=body,
        method="PUT",
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "trade-simulation-telemetry",
        },
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        response.read()


def warn(message: str) -> None:
    print(f"::warning::record_pull_request: {message}")


def deliver(record, *, ledger_repo, out_dir, token) -> str:
    """Write the record where the caller asked: a directory, or the ledger."""
    payload = json.dumps(record, ensure_ascii=False, indent=2) + "\n"
    path = record_path(record)
    if out_dir:
        target = pathlib.Path(out_dir) / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(payload, encoding="utf-8")
        return f"wrote {target}"
    if not token:
        warn("TELEMETRY_TOKEN is not set; the pull request was not recorded to the ledger")
        return "not recorded"
    try:
        put_record(ledger_repo, path, payload, token)
    except urllib.error.HTTPError as exc:
        if exc.code == 422:
            return f"already recorded: {ledger_repo}/{path}"
        warn(f"ledger rejected the record: HTTP {exc.code}")
        return "not recorded"
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        warn(f"ledger unreachable: {exc}")
        return "not recorded"
    return f"wrote {ledger_repo}/{path}"


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--repo", required=True, help="owner/name")
    which = parser.add_mutually_exclusive_group(required=True)
    which.add_argument("--pull", type=int, help="one pull request number")
    which.add_argument("--closed-since", help="every pull request closed at or after this ISO time (backfill)")
    parser.add_argument("--ledger-repo", default=None, help="owner/zen-telemetry; defaults to the owner of --repo")
    parser.add_argument("--out-dir", default=None, help="write records under this directory instead of the ledger")
    parser.add_argument("--run-url", default=None)
    parser.add_argument("--verdict-owner", default=None,
                        help="override; defaults to the verdict_owner of the scheme in force when each pull request closed")
    parser.add_argument("--qa-login", default=os.environ.get("ZENDEV_QA_LOGIN", ""))
    args = parser.parse_args(argv)

    document = None
    try:
        document = schemes.load()
    except (OSError, ValueError):
        pass
    active = schemes.active(document) if document else None
    ledger_repo = args.ledger_repo or f"{args.repo.split('/')[0]}/zen-telemetry"
    token = os.environ.get("TELEMETRY_TOKEN", "")

    if args.pull:
        pulls = [read_pull(args.repo, args.pull)]
    else:
        # The list endpoint says which pull requests closed and when; it does not carry
        # the diff size (`additions`, `deletions`, `changed_files`, `commits`), which only
        # the single-pull-request endpoint returns. So the list is the selection and every
        # chosen pull request is read again in full, or a backfill records every size as
        # unknown — which the first backfill did.
        chosen = closed_since(_flatten(read_closed(args.repo)), args.closed_since)
        pulls = [read_pull(args.repo, pull["number"]) for pull in chosen]
    for pull in pulls:
        number = pull["number"]
        if not pull.get("closed_at"):
            warn(f"#{number} is still open; a record is written when it closes")
            continue
        # The scheme the pull request closed under, not the one active today: the two
        # differ exactly when this is a backfill. The stamp and the verdict owner come
        # from that one descriptor, or the record would contradict itself (#545).
        closed = pull.get("merged_at") or pull.get("closed_at")
        stamp = scheme_at(document, closed) or schemes.stamp()
        owner = owner_for(document, closed, explicit=args.verdict_owner, active=active)
        if not owner:
            warn(f"#{number}: no verdict owner in the scheme in force or the active one; "
                 "name one with --verdict-owner")
            continue
        record = summarize(
            pull,
            _flatten(read_reviews(args.repo, number)),
            _flatten(read_comments(args.repo, number)),
            verdict_owner=owner,
            qa_login=args.qa_login,
            scheme=stamp,
            now=dt.datetime.now(dt.timezone.utc),
            run_url=args.run_url,
        )
        print(json.dumps({key: record[key] for key in (
            "number", "author", "merged", "closed_reason", "refusals", "accepted_first_time",
            "minutes_to_first_verdict", "minutes_open", "requirements", "issues",
        )}, ensure_ascii=False))
        print(f"record_pull_request: #{number} {deliver(record, ledger_repo=ledger_repo, out_dir=args.out_dir, token=token)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
