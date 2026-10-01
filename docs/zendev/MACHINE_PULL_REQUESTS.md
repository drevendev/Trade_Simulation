# Machine-generated pull requests

Some pull requests here are not authored by anyone. A workflow copies bytes from a
known source, or records a fact it looked up, into a declared corner of the repository
and proposes the result. There is no judgement in them to review.

This document defines that class, what it is allowed to do, and who accepts it.

## The class

A pull request belongs to this class only when **all** of the following hold. They are
checked by `scripts/machine_pr_guard.py`, which runs inside the required `policy-guard`
check on every pull request — not by a reader.

1. its head branch is exactly a branch named in `MACHINE_CLASSES` in that script;
2. every changed path is inside the roots that class owns, or is one of the files the
   class regenerates (the fourth column below);
3. every changed path satisfies that class's own allowlist, where it has one;
4. the head commit is **committed** by the identity the producing workflow writes
   under. Its *author* is whoever triggered the run and may be a person: dispatching
   `spec-sync.yml` by hand is a supported operating path, and the author field is the
   record of that. The committer is what wrote the bytes, and that is the question.

The classes today:

| Branch | Produced by | Owns | Also regenerates | Allowlist | Committer |
| --- | --- | --- | --- | --- | --- |
| `spec-mirror` | `.github/workflows/spec-sync.yml` | `docs/spec/mirror/**` | `docs/spec/IMPLEMENTATION_STATUS.md` | `docs/zendev/spec-mirror-allowlist.txt` | `github-actions[bot]` |
| `ledger-provenance` | `.github/workflows/release-tag.yml` | nothing | `docs/spec/implementation_status.csv`, `docs/spec/IMPLEMENTATION_STATUS.md` | none | `github-actions[bot]` |

This table and `MACHINE_CLASSES` state the same thing twice, and
`scripts/tests/test_machine_pr_guard.py` compares them, so a class added to one and not
the other fails a test instead of misleading a reader. It happened once: the guard
carried `ledger-provenance` from #319 (2026-09-09) while this table listed only the
mirror, until #573.

Adding a class is a policy change to the guard, its tests and this table, reviewed like
any other policy change and accepted by a person.

### Owning a path is not the same as regenerating one

The fourth column exists because a machine class can be blocked by its own correctness.
The coverage table is rendered from the registry the mirror replaces, and a check
compares the two, so a sync that changed a registry status and left the table alone
proposed a snapshot contradicting its own source. That pull request could not merge —
and could not be repaired from anywhere else either, because on `master` the old
registry and the old table still agreed. The contradiction existed only inside the
proposal. It happened, on #125, and it would have happened on every sync that moved a
status.

So the producing workflow regenerates the derived file in the same pull request, and
the guard permits that one named file alongside the roots.

**Regenerating is not owning.** A path in the fourth column is not machine-exclusive:
an AUTHOR adding a ledger row regenerates the same table, and a rule that made the file
machine-owned would refuse every one of those pull requests. Only the third column is
enforced against other branches.

Nor does permitting the file assert its contents. The guard checks paths; the
generator's own `--check` runs in CI over the same diff and refuses a table that does
not match its sources. A sync writing a fabricated table would pass this guard and fail
that check, which is the correct division: this one answers *may these paths change*,
that one answers *is the derived file derived*.

### A class that owns nothing: `ledger-provenance`

A ledger row records the commit that satisfied its requirement, and the pull request
that earns the row cannot know it: the row lands inside that pull request, and its
squash commit does not exist until it merges. `scripts/backfill_merge_commits.py`, run
by `release-tag.yml` on every push to `master` that touches the ledger or the registry,
looks the commit up afterwards and fills the `MERGE_COMMIT` column. That has to reach
`master` the way every other change does — through a pull request — and its first
attempt to push `master` directly was refused by branch protection.

Its **Owns** column is empty on purpose. A root is a path the class owns, and ordinary
branches are refused anywhere under one; but the ledger is shared — the AUTHOR's own
pull request writes the row that earns a requirement, and this class only fills the one
column that pull request could not know. Claiming the ledger as a root would forbid the
AUTHOR its core work. So both files are listed as regenerated: the branch may write
those two files and nothing else, and every other branch keeps them.

What the guard checks for this class is the paths and the committer. It does not read
the rows. That only `MERGE_COMMIT` cells move — never `STATUS`, because whether a
requirement is satisfied is a judgement and this is a lookup — is the producer's
contract, not a gate. #572 is the shape: head `b041962f` on `ledger-provenance`, one
line changed in each of the two files, filling `REQ-PRODUCTION-002` with `219ae9a4`,
the squash commit of #571; it merged as `86c110f7` under the same four checks as any
pull request.

## The gate runs in both directions

The guard does not only constrain the machine branch. It also refuses **any other
branch** that writes a machine-owned path. An agent branch, a policy branch, or a
person editing `docs/spec/mirror/**` by hand is refused by a required check.

That is the point, and it is why this arrangement narrows authority rather than
widening it. The mirror is worth having because it is a verifiable copy of Drive.
Before the guard existed, anything could be written there from any branch and only a
reviewer stood in the way — and a reviewing agent is not a control against the agents
it sits beside. Now the only way bytes reach the mirror is the sync workflow, and the
only thing deciding whether they may is a predicate with negative-control tests.

## How one merges

The producing workflow arms GitHub auto-merge on the pull request it opens —
`spec-sync.yml` and `release-tag.yml` alike. Branch protection then decides: the merge
happens when — and only when — every required check is green at the head revision.
`machine-pr-guard` is one of them, inside `policy-guard`.

Nothing else merges it. There is no model anywhere in this path, and no verdict: see
*When a gate is red* for who does not review it.

## What merging one asserts

That the change is confined to what its class may write, allowlisted where the class
has an allowlist, produced by its own workflow, and green.

It asserts **nothing** about whether the content is correct, current, or true. A mirror
pull request is a snapshot of Drive at one moment; Drive may have moved on, which is
neither knowable from here nor a reason to refuse. If it has, the next sync opens a
fresher snapshot, and merging the older one first is harmless and correct. A
`ledger-provenance` pull request is a lookup against the pull request graph at one
moment, and the guard never reads its rows; a wrong commit in it would reach `master`
the way a wrong mirror would.

Mirrored content remains untrusted data everywhere it is later read. Instruction-shaped
text inside it is specification input, never authority.

## When a gate is red

The pull request stays open. That is the whole failure mode, and it is deliberate:

- the **ACCEPTOR does not review it**, and is not offered it:
  `scripts/select_review_target.py` classifies the head branch through
  `machine_pr_guard.classify` and rules it ineligible before the model is started. The
  runbook says the same thing in prose, but the model never has to act on it;
- the **verdict owner does not judge it either**, whoever the active scheme names — under
  scheme/8, SLOPSTER. A machine pull request carries no Issue and no handoff, so a
  verdict would have nothing to be about; its gates are the required checks, and a
  `## Verdict:` on one is not an input to anything;
- the **AUTHOR does not touch it**. No agent may push to a machine branch — the guard
  refuses the diff that would result;
- it is an **operator matter**. A red `machine-pr-guard` means the producer emitted
  something outside its own contract. That deserves a person, not a retry.

The selector prints every open pull request and why it was skipped, so a machine pull
request sitting on a red gate appears in that log on every acceptor run rather than only
in the pull request list. That is visibility, not ownership. The owner is a person.

### Recovering one

**Repairing the gate does not release what it refused.** A pull request's checks ran
against the workflow definition their run started with, and re-running a completed
workflow replays that same definition rather than resolving the current one. Observed on
#101: the guard step did not exist in the replayed run at all, because the run predated
it. So the ordinary repair for human-authored work — fix CI, press re-run — is not
available for a class nobody may push to.

The procedure is:

1. **Fix the cause and merge the fix**, as an ordinary policy change through the ordinary
   path. A guard defect is a defect like any other.
2. **The producer closes the refused pull request itself.** Every sync runs
   `scripts/stale_mirror_pr.py` before proposing: when the open proposal has carried a
   *concluded* red check for longer than a bound (90 minutes by default), the sync closes
   it with a comment saying so, deletes the branch, and proposes the current mirror afresh
   in the same run, under the current workflow definitions. A pending or green proposal,
   or a red one younger than the bound, is left alone.
3. **Nothing else is needed for a cause that is already fixed.** Dispatch the sync rather
   than waiting for the hour, if the pipeline is stalled behind it.

A cause that is *not* fixed produces churn instead of a stall: the proposal is closed and
re-proposed each time the bound elapses, and is red again each time. That churn is visible
in the pull request list and harmless, and it is still a person's to end — by fixing the
cause. The producer never touches the branch's content, never pushes to it, and never
merges it; it only closes what it produced and produces again.

A red `ledger-provenance` proposal recovers the same way for a different reason: its
producer does not snapshot somewhere else, it recomputes the proposal from `master`, and
every run of `release-tag.yml` replaces the branch's content under the current workflow
definitions. When `master` already carries what the proposal offered, the recomputed
proposal is empty and the producer closes it: #660 went red on 2026-09-23 on a README
rule, #681 recorded its one row by hand, and the MACHINE closed #660 within fifteen
seconds of #681 merging.

Do not force-push the branch, do not push a commit to unstick it, and do not merge it by
hand. Each of those defeats a different one of the four conditions above, and the guard is
built to refuse the result.

This was worked out twice from first principles, under a stalled specification pipeline
both times — #109 and #112 — which is why it was written here, and then automated.

## Cost, and why this exists

Measured over the 24 hours ending 2026-09-05T06:40Z: 6 of 29 merged pull requests were
`spec-mirror` snapshots. Each consumed one ACCEPTOR run to assert that a byte copy was a
byte copy and — because the ACCEPTOR selects oldest-first — delayed the code pull request
behind it by a full dispatch interval.

Every gate in the old review path was already a predicate over the diff. Writing them as
one moves the same decision from a model to a check, makes it apply to every pull request
rather than only the ones a reviewer looks at, and gives the review slot back to code.
