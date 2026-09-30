# A pull request from outside the loop

From `scheme/8` no model runs at all. The researcher (EndlessZen) writes the code under
the `drevendev` account, SLOPSTER reviews it under `andy-zen-dev` and owns the verdict,
and the operator merges. The active scheme declares both model roles without a model,
and the dispatcher starts neither `zendev-author.yml` nor `zendev-acceptor.yml`. What
stays is everything that costs no tokens: branch protection with its four required
checks, the `mergeability` status and the branch sweep, the specification mirror, and
both ledgers. The gates below are mechanical — they neither know nor care who pushed
the branch. This page is what an author outside the loop needs in order to get a pull
request accepted, in the order the gates read it. Sections 6 and 7 of
[AUTHOR_RUNBOOK.md](AUTHOR_RUNBOOK.md) remain the long form.

## Before the branch

- **Work from an Issue.** The pull request closes exactly one (`Closes #N` in the
  body), and that Issue carries exactly one `priority:*`, exactly one `type:*` and at
  least one `area:*` label; `issue-label-guard`, inside the required `policy-guard`
  check, refuses the pull request otherwise. Claim it with a comment (role, intended
  scope, branch name) and move it to `status:in-progress`.
- **Product or policy, never both.** Workflows, `scripts/`, `docs/zendev/` and
  `AGENTS.md` are control plane; `policy_guard` refuses a diff that mixes them with
  product code, and a product Issue is not `policy`.
- **Branch name: `zen/issue-<N>-<slug>`.** `zen/**` is the class the forge recognizes
  as an outside author's, and it is maintained for you: when `master` moves, the forge
  merges it into a `zen/**` branch that has merely fallen behind — a draft included —
  and resolves a conflict confined to the two ledger files by requirement identifier.
  It never deletes your branch. A conflict in any other file is yours, and the red
  `mergeability` status says which case it is; branch protection does not merge while
  it is red. `zen-edit`, below, works on `zen/**` only.
- **Read the slice, not the specification.** Registry, changelog, then the one document
  the Issue names. `docs/spec/mirror/**` is machine-owned and never edited by hand; a
  wrong specification is a dated entry in `docs/spec/FEEDBACK_TO_RESEARCHER.md` or
  `docs/spec/OPEN_QUESTIONS.md` inside the same pull request.

## In the pull request

The body follows [the pull request template](../../.github/PULL_REQUEST_TEMPLATE.md)
completely. Three parts of it are read by machines:

- `Closes #N` — the linked Issue.
- *Changed artifacts* names **every** path the diff touches, spelled exactly as
  `git diff --name-only origin/master...HEAD` prints it. `scope_guard` fails
  `policy-guard` on a path the body does not mention; editing the body re-runs the
  check without a commit.
- *Tested revision* — the head commit you actually verified.

The ledger travels inside the pull request. One row per requirement identifier in
`docs/spec/implementation_status.csv` — `REQ_ID,STATUS,ISSUE,PR,MERGE_COMMIT,EVIDENCE`,
`MERGE_COMMIT` left empty, `EVIDENCE` quoted whenever it holds a comma — then
`python scripts/implementation_status.py` to regenerate the table and
`python scripts/implementation_status.py --check` to prove it. `PR` is this pull
request's own number: open the pull request first if you need it, then add the row on
the same branch. Naming any other open pull request is refused by `status_lint`.

When your row makes every registry row of a milestone read `IMPLEMENTED`, README changes
in the same pull request: take the milestone out of *Not implemented yet* and record it
the way the previous milestone is recorded under *Current state* and *Known scope
boundaries*. `src/diagnostics/readme-conformance.test.ts` fires on exactly that merge
ref — a landed milestone still described as open fails `typescript` — because the
machine that fills the merge commits afterwards may write the two ledger files and
nothing else (Issue #680). Releasing is still the tagger's, and still waits for the
commits.

Before pushing: `npm run typecheck`, `npm test`, `npm run build`, and
`python -m unittest discover -s scripts/tests` whenever anything under `scripts/`
changed. Never cut a tag or a release; the tagger is mechanical and releases a milestone
only when every one of its rows reads `IMPLEMENTED` and carries its merge commit.

## Editing a file you cannot check out

The contents API writes whole files. For a small file that is fine; for a large one it
loses whatever you did not mean to touch, and the repair costs more than the change —
#550 spent six refusals on one import and one line. So do not resubmit a large file to
change a few lines of it. Commit an **edit file** instead, and the forge applies it.

Create `.zen/edits/<anything>.edit` on your `zen/**` branch (the pull request must
already be open; a draft is fine):

    ### FILE: src/config/simulationConfig.ts
    <<<<<<< FIND
        population: {
    =======
        population: createDefaultPopulationConfig(),
    >>>>>>> REPLACE

- `FIND` is matched character for character, indentation included, and must occur
  **exactly once** in the file. Too short to be unique? Add the lines around it, in
  both halves.
- Blocks apply in order; one edit file may hold several blocks and several
  `### FILE:` sections, and one push may carry several edit files.
- All or nothing: one block that does not apply, and nothing is changed.
- Existing text files only — create and delete through the contents API as before —
  and never `.github/`, `scripts/`, `docs/zendev/`, `AGENTS.md`, `docs/spec/mirror/` or
  `.zen/`.
- To delete lines, put them in `FIND` together with a neighbouring line and repeat only
  the neighbour in `REPLACE`.

Within a minute `zen-edit` — `master`'s definition, acting as `zendev-machine[bot]` —
pushes one commit to your branch with the edits applied and the edit file removed, and
says so in a comment on the pull request. A refusal names the edit file, the block and
the reason, and changes nothing. The checks then run on the machine's commit: **that
head, not the one you pushed, is the one to verify and to ask a verdict on.** The head
that still carries the edit file shows a red `policy-guard`, because it has a path the
body does not name; it is superseded, not a finding.

## What happens next

- The four required checks run on the head revision: `build-and-test`, `typescript`,
  `policy-guard`, `mergeability`. All four must be green; `pending` is not green.
- **SLOPSTER judges** the head and owns the verdict, as `AGENTS.md` says: a comment
  starting `## Verdict: ACCEPT` or `## Verdict: REQUEST_CHANGES` that names the exact
  head it judged. It never posts a formal review — a formal refusal from an account
  without write access would hold the merge until someone with authority cleared it —
  and it never labels or merges. Its QA findings stay what they were,
  `## SLOPSTER QA: FINDING` comments; a finding that blocks acceptance comes with a
  `## Verdict: REQUEST_CHANGES`. Answer a refusal by pushing to the same branch; a
  verdict says nothing about a head that carries new content.
- **A base merge is not a push of yours.** When `master` moves, or your pull request
  is opened or pushed already behind it (#769), the forge merges it into your branch,
  and once the checks of the new head are in it posts a
  `## Head evidence` comment: the head, the four required checks with their links, and
  the chain of heads back to the one at which your diff last changed. A handoff
  or a verdict naming any head of that chain stands for it, as `AGENTS.md` says. Do not
  merge `master` yourself, and do not hand off again because the head moved: #661
  changed head nine times in four days with its diff unchanged, and was refused for a
  stale handoff.
- **A clean head** — nothing to find — gets `## Verdict: ACCEPT` on that head. That
  comment, together with the four checks green on the same head, is the whole of what
  the operator needs.
- **The operator merges** an accepted pull request (squash, as every merge here), and
  closes the Issue through `Closes #N`. Nothing merges by itself.
- **At the rework bound the pull request becomes yours to review.** When the verdict
  owner has refused one pull request `rework_limit` times (three under scheme/8), the
  forge adds `status:needs-decision` to it and says so once, in a
  `## Rework bound reached` comment linking the refusals. From there the operator
  does not decide it — you do, as the specification's owner, in one
  `## Researcher review:` comment that names the head and chooses one of:
  - **CONTINUE** — the open findings are inside the requirement; rework goes on;
  - **NARROW** — the findings you list are outside this requirement: file each as
    its own Issue, link them, and the verdict owner judges what remains against the
    narrowed scope;
  - **CLOSE** — close the pull request and return its Issue to `status:ready`, with
    a summary of what the refusals established.

  The verdict stays the verdict owner's: a merge still needs its
  `## Verdict: ACCEPT` and the four required checks green. Nothing closes a pull
  request by itself, and the unreachable rule (24 idle hours) is not enforced under
  this scheme.

## What is measured

Every closed pull request is written to the private ledger (`pulls/` in
`zen-telemetry`) by `pr-ledger.yml`: who opened it and when, when it was first judged
and when it merged or closed, how many refusals it took — SLOPSTER's `## Verdict:` comments
are the verdicts now — its size, the Issue and the requirement
identifiers it names, its QA findings, and the scheme it landed under. That is how the
speed and quality of this scheme compare with the autonomous author's days: same gates,
a different author and a different judge, and no token cost on either side.
