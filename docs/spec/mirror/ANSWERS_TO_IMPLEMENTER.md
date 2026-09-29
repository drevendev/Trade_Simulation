# ANSWERS\_TO\_IMPLEMENTER

Append-only researcher/QA responses to the implementation team.

## 2026-09-03 — Initial implementation handshake

To the Claude implementation team:

I accept the file-based, stateless-agent workflow. The product/economic contracts remain specification authority; implementation feedback is evidence and may trigger the smallest corrective spec change when justified. The three repository feedback files are now mandatory inputs for each QA/research run, and semantic requirement changes must be recorded instead of silently edited.

### A. Public mirror allowlist

Mirror exactly these paths relative to the Economic Simulation specification root:

\- REQUIREMENTS\_REGISTRY.csv  
\- SPEC\_INDEX.md  
\- EXECUTION\_ORDER.md  
\- SPEC\_CHANGELOG.md  
\- ANSWERS\_TO\_IMPLEMENTER.md  
\- 06 \- Handoff/\*\*

06 \- Handoff currently contains the implementation package:  
\- START\_HERE — Economic Simulation Implementation Handoff  
\- 00 — MASTER\_IMPLEMENTATION\_INDEX  
\- 01 — CORE\_SCHEMA\_AND\_LIFECYCLES  
\- 02 — IMPLEMENTATION\_CONTRACT\_CONSISTENCY\_REVIEW\_01  
\- 03 — CANONICAL\_CONFIG\_AND\_WORLD\_GENERATION  
\- 04 — MARKETS\_TRADE\_FX\_CONTRACTS  
\- 05 — PRODUCTION\_CAPITAL\_LABOR\_CONTRACTS  
\- 06 — POPULATION\_DEMOGRAPHY\_CLANS\_CONTRACTS  
\- 07 — STATE\_FISCAL\_LAWS\_CONTRACTS  
\- 08 — MONETARY\_CURRENCY\_CONTRACTS  
\- 09 — EXPANSION\_SETTLEMENT\_CONTRACTS  
\- 10 — EVENTS\_SHOCKS\_CONTRACTS  
\- 11 — REPOSITORY\_MIGRATION\_AND\_MILESTONE\_GATES  
\- 12 — ACCEPTANCE\_BENCHMARK\_PERFORMANCE\_SUITE  
\- 13 — VISUALIZATION\_AND\_EXPLAINABILITY  
\- 90 — USER\_DRAFT\_SYNTHESIS\_AND\_TRACEABILITY  
\- 91 — REPOSITORY\_AUDIT\_BASELINE  
\- 99 — PROJECT\_MANIFEST

Do not mirror:  
\- 00 \- Control/\*\*, including STATE\_AND\_QUEUE and the duplicate working PROJECT\_MANIFEST. Handoff/99 is the public implementation copy.  
\- 01 \- Inputs/\*\* (raw user drafts).  
\- 02 \- Research/\*\*.  
\- 03 \- Economic Model/\*\*.  
\- 04 \- Visualization/\*\* canonical working copies.  
\- 05 \- Implementation Specs/\*\* canonical working copies.  
\- 90 \- Reports/\*\*.  
\- Any future file not explicitly added to the allowlist in SPEC\_CHANGELOG.

Reason: 06 \- Handoff is deliberately self-contained and normalized. Mirroring working copies, research and reports would create duplicate authorities and increase drift risk.

I reviewed the proposed allowlist. I found no credentials, service-account material, personal notes, private operational data, or content that should remain non-public. The allowlisted package is intended for implementation and may be published in the public repository. Do not infer this permission for excluded paths.

### B. Source format and mirror export

The current Drive source is primarily native Google Docs. REQUIREMENTS\_REGISTRY.csv is a native Google Sheet created specifically so it can be exported deterministically as CSV. The four text control files are native Google Docs named with .md and should be exported as Markdown by the mirror. Handoff documents should also be exported to stable .md filenames. The repository copy is the implementation mirror; Drive remains specification authority.

### C. Requirement IDs and navigation

I accept the permanent ID scheme \`REQ-\<AREA\>-\<NNN\>\` and the statuses DRAFT / REVIEW / READY / FROZEN / RETIRED.

Frozen AREA vocabulary:  
CORE, CONFIG, MARKET, PRODUCTION, POPULATION, CLAN, FISCAL, MONETARY, EXPANSION, EVENTS, VISUALIZATION, MIGRATION, ACCEPTANCE, PERFORMANCE, SCOPE.

IDs are never renumbered or reused. A removed requirement becomes RETIRED. A semantic change to a requirement must be recorded in SPEC\_CHANGELOG.md.

REQUIREMENTS\_REGISTRY.csv is now bootstrapped with the complete executable requirement set needed for M0-M2. This is intentional incremental indexing: AUTHOR may begin M0 immediately. Before promotion into M3, the registry will be extended with M3-specific rows; later milestone requirements are indexed before that milestone becomes executable. Do not block M0 on indexing future M3-M12 internals.

### D. Execution order

Yes, an implementation order already existed and is canonical: M0 through M12 in Handoff/11. EXECUTION\_ORDER.md now exposes it as the short stateless-agent navigation layer.

M0 baseline lock/scaffolding \-\> M1 canonical primitives/config/world genesis \-\> M2 tick/ledger spine \-\> M3 local markets \-\> M4 production/labor/population closed economy \-\> M5 transport/trade/FX \-\> M6 fiscal/laws/clans/debt \-\> M7 monetary/currency \-\> M8 demography/migration/expansion/succession \-\> M9 events/shocks \-\> M10 whole-system acceptance/performance \-\> M11 browser/GitHub Pages observatory \-\> M12 legacy removal/release candidate.

Only the earliest unblocked milestone may advance. A failed gate blocks promotion.

### E. Current project status/readiness

PROJECT\_STATUS: COMPLETE.  
CURRENT\_PHASE: COMPLETE handoff; implementation phase begins at M0.  
REVIEW\_STATUS: ACTIVE, now transitioning to code/runtime QA as implementation PRs appear.  
Specification/handoff readiness: approximately 98% for implementation. No known critical economic/product-design blocker exists. Remaining QA is primarily implementation-edge validation and code-vs-contract review, not prerequisite design work.

### F. Existing code versus new canonical work

Existing repository behavior that should be preserved or used as regression infrastructure where useful:  
\- .NET 9 solution/build/CLI plumbing;  
\- seeded legacy run capability;  
\- Storage/inventory concepts where semantics fit;  
\- local Market concept as a legacy reference, not as canonical settlement authority;  
\- focused unit-test structure;  
\- existing money/stock conservation tests;  
\- current repository/GitHub Pages/deployment plumbing where reusable.

Do not claim any canonical REQ\_ID IMPLEMENTED merely because similar legacy behavior exists. IMPLEMENTATION\_STATUS.md must map each requirement to merged code plus a proving test.

Most target-domain behavior is new canonical implementation: typed IDs/registries, WorldState/TickContext and 0-15 tick pipeline, explicit ledgers, canonical config/world genesis, cohorts/demography, ProductionUnits/capital/labor, clans, fiscal/debt, monetary authorities/currencies/finite FX, route-constrained shipments, expansion/succession, typed events/shocks, SimulationOutput/Worker/history semantics and the explanatory observatory.

### G. Repository feedback channel

At the start of each QA/research run I will read:  
\- docs/spec/FEEDBACK\_TO\_RESEARCHER.md  
\- docs/spec/OPEN\_QUESTIONS.md  
\- docs/spec/implementation\_status.csv

Current state on 2026-09-03: the channel is open; there are no substantive implementation feedback entries or open domain questions yet, and implementation coverage is 0/0 because the mirror/registry had not yet been synchronized. After this handshake, the registry gives the implementation side stable IDs to populate that table.

Answers to future blocking questions should be appended here with date \+ Q-ID \+ REQ\_ID. If I change requirement meaning, I will also update SPEC\_CHANGELOG.md and the canonical/handoff document in the same change set.

### H. Response to the four mirror questions

1\. TAKE: the five root files listed in section A and all of \`06 \- Handoff/\*\*\`.  
2\. DO NOT TAKE: all paths explicitly excluded in section A.  
3\. Folder revision: the project root contains research/history/working duplicates that are useful for QA but are intentionally excluded from public implementation mirroring. I found no accidental file inside the 06 \- Handoff allowlist that should be removed. The duplicate working copies outside Handoff should remain in Drive for QA, not be mirrored.  
4\. Publication confirmation: yes. I found nothing in the proposed allowlist that is prohibited or inappropriate to publish. This confirmation applies only to the explicit allowlist.

You may enable the mirror after exporting the Google Sheet as CSV and Google Docs as Markdown with stable paths. AUTHOR may begin M0 once the mirrored control files are visible in the repository.

### I. Important runtime clarification

I found one genuine ambiguity while reviewing your letter against the handoff: the repository is .NET 9, but the target must run autonomously on static GitHub Pages. Earlier documents mixed a TypeScript recommendation with C\#-centric migration folder examples. This is now resolved canonically.

M0 freezes and characterizes the existing C\#/.NET 9 baseline. Starting with M1, new canonical simulation behavior is implemented in TypeScript as the browser-capable engine. Keep C\# as a legacy/golden oracle while responsibilities migrate; do not implement canonical economics twice. M11 adds the Worker/SimulationOutput/observatory around that same TypeScript engine, not a second port. The master index, migration plan, START\_HERE, registry and changelog have been updated accordingly.

## 2026-09-03 — Mirror navigation normalization

To the Claude implementation team:

1\. Heading/ANCHOR export: accepted. Mirrored navigation must not depend on escaped literal Markdown markers. Google Docs paragraph styles are the source-side contract: document title \= Heading 1; implementation-addressable section headings \= Heading 2/Heading 3 as appropriate. Literal \`\#\`, \`\#\#\`, \`\#\#\#\` prefixes are not authoritative. The root control files are being normalized now, and every Handoff section referenced by REQUIREMENTS\_REGISTRY must have a real Heading style before that REQ\_ID becomes executable. This is a mirror/navigation repair only; no requirement meaning changes.

2\. FILE exact-name rule: use the exact mirrored filename, including extension. REQUIREMENTS\_REGISTRY FILE values are being normalized to \`.md\`; no importer-side implicit extension rule is part of the contract. SPEC\_INDEX uses exact mirror paths as well.

3\. Priority mapping: accepted exactly as proposed. P0 \-\> \`priority:high\`; P1 \-\> \`priority:normal\`. \`priority:critical\` is reserved by implementation operations for broken required checks, broken build, regressions, or equivalent stop-the-line failures. \`priority:low\` remains available for implementation housekeeping and does not correspond to an executable spec priority unless later introduced explicitly. Forge labels are workflow metadata and do not alter requirement PRIORITY.

4\. Toolchain ADR: accepted. There is no canonical requirement for a package manager or TypeScript test runner. npm, Vitest, and the current Node LTS are valid local engineering choices. Vite and TypeScript remain the specified browser/runtime direction. Record toolchain changes as ADRs; they do not require spec changes unless they affect observable contracts, determinism, browser support, performance gates, or GitHub Pages compatibility.

5\. Required TypeScript check: agreed. REQ-MIGRATION-003 already requires the canonical TypeScript scaffolding to build/test independently while legacy .NET remains green. It is correct to keep the schedule disabled until that required check is present; once it exists, AUTHOR may start M0 immediately.

6\. Registry timing: unchanged. M0-M2 are executable from the current registry. M3-specific requirements will be registered and changelogged before M3 promotion; implementation should not wait for M3 indexing to begin M0.

No economic mechanism changed in this normalization.

2026-09-03 — CODE\_RUNTIME\_QA\_02 — REQ-MIGRATION-002 baseline pin

PR \#18 correctly proves repeated-run determinism and is otherwise within M0 scope, but it does not yet freeze the legacy baseline. Both same-seed hashes are computed fresh inside the test, so a future deterministic legacy behavior change could alter both values and still pass. That defeats M0's purpose of recording a reproducible baseline/golden oracle.

Smallest correction: keep the current normalized snapshot utility and same-seed/different-seed tests, and add one checked-in expected SHA-256 for the representative 30-turn baseline using a fixed documented seed (seed 7 is acceptable if retained). The proving test must assert that the 30-turn run equals that exact expected digest. Update IMPLEMENTATION\_STATUS evidence after the corrective PR merges. This is a migration-evidence repair only; no legacy economic behavior or canonical economic mechanic should change.

Until that follow-up merges, treat REQ-MIGRATION-002 as not fully closed under the corrected acceptance. Do not discard the useful implementation from PR \#18.

## 2026-09-04 — CONSISTENCY/SIMPLICITY\_REVIEW — M0 mirror/status reconciliation

Cross-check result: Drive specification authority is internally consistent, but the repository-facing copies are stale. The authoritative Drive registry currently contains 21 requirements, including REQ-CORE-002, and REQ-MIGRATION-002 now requires a fixed documented 30-turn seed plus a checked-in expected normalized SHA-256. The repository mirror currently contains 20 requirement rows, omits REQ-CORE-002, and still carries the pre-repair REQ-MIGRATION-002 acceptance. IMPLEMENTATION\_STATUS.md separately says “2 of 19 requirements implemented” and marks REQ-MIGRATION-002 IMPLEMENTED using only the same-seed/different-seed tests from PR \#18.

Required reconciliation, without changing any economic mechanic: before the next AUTHOR requirement selection, refresh the allowlisted mirror from Drive and verify that the mirrored registry has 21 rows, includes REQ-CORE-002, and contains the pinned-digest acceptance for REQ-MIGRATION-002. Then reconcile IMPLEMENTATION\_STATUS.md against that refreshed registry. REQ-MIGRATION-001 may remain IMPLEMENTED on its existing build/test evidence. REQ-MIGRATION-002 must not remain IMPLEMENTED until a merged follow-up adds the fixed expected 30-turn SHA-256 assertion required by the current acceptance; preserve PR \#18 as partial evidence rather than discarding it. The coverage summary must be computed from the current mirrored registry rather than a hard-coded historical count.

This is a mirror/evidence consistency repair only. No requirement meaning was changed in this review and no SPEC\_CHANGELOG entry is needed beyond the already-recorded CODE\_RUNTIME\_QA\_02 semantic correction.

## 2026-09-04 — CODE\_RUNTIME\_QA\_03 — Issue \#27 evidence-state correction

## Issue \#27 correctly selects REQ-MIGRATION-003 as the next substantive M0 scaffolding unit, but its final acceptance bullet required the implementation pull request to record its own merge commit in IMPLEMENTATION\_STATUS.md. That is impossible before merge and contradicts the repository's already-established AUTHOR\_RUNBOOK reconciliation flow.

Smallest correction: in the implementation PR, add/update REQ-MIGRATION-003 as IN\_PROGRESS, name Issue \#27 and the proving tests, and leave Merged in as pending (or the repository's equivalent pre-merge marker). After the PR merges, the next bounded reconciliation step changes the row to IMPLEMENTED and records the actual merge commit. Only IMPLEMENTED is closing evidence. I posted this correction directly on Issue \#27 so the executable task contract is unambiguous before an AUTHOR run claims it.

No product/economic requirement, M0 scope, or acceptance test meaning changed. This is repository evidence-state/process repair only; SPEC\_CHANGELOG does not need a semantic-change row.

2026-09-05 — FRESH\_IMPLEMENTER\_HANDOFF\_REVIEW\_01  
Method: first-pass findings below were produced from REQUIREMENTS\_REGISTRY plus the self-contained 06 \- Handoff package before reading STATE\_AND\_QUEUE, prior QA history, working canonical copies or implementation rationale. These are findings only. Do not change requirement meaning from these notes; each repair must be decided in a separate bounded run.

HANDOFF-FRESH-001 — REQ-CONFIG-003, REQ-CORE-003 — M1 cohort seed schema is not self-consistent inside the handoff  
A fresh implementer following the M1 world-gen requirement can read Handoff/03 and find CohortSeed.stratum \= LOWER | MIDDLE | UPPER plus prosperityIndex, while Handoff/00 and Handoff/02 declare the mature persistent cohort model VULNERABLE | WORKING\_MIDDLE | AFFLUENT and prosperityEma-based state authoritative over the old aliases. The correct interpretation currently depends on remembering the precedence/normalization history rather than on the named world-gen slice being internally coherent. Risk: baseline genesis can serialize a stale cohort vocabulary and force an adapter or later migration that the requirement never asked for.  
Follow-up for a separate repair run: decide whether CohortSeed should use the mature vocabulary directly or define an explicit seed-to-runtime translation. Then patch the handoff and navigation/dependencies together. Do not guess during implementation.

HANDOFF-FRESH-002 — REQ-CORE-003, REQ-CONFIG-003, REQ-CONFIG-004 — direct FILE+ANCHOR navigation can expose superseded authoritative-looking state  
Handoff/01 still physically contains superseded fields such as RegionState.pendingControllerStateId, RegionState.marketStatus, the old PopulationCohort fields, and independently mutable ProductionUnit.capacity. Handoff/00 and Handoff/02 correctly override them, but the per-run AUTHOR protocol opens the exact FILE+ANCHOR and at most one directly listed dependency document. The READY registry rows that build registries/world genesis do not mechanically guarantee that the consistency-review override is the dependency slice the implementer will read. Risk: a stateless implementer can satisfy the named requirement while materializing state that the master later says must not exist.  
Follow-up for a separate repair run: either remove/mark the stale schema inline in Handoff/01 or make the relevant READY requirement navigation explicitly include the normalization source. Preserve the two-read navigation goal.

HANDOFF-FRESH-003 — REQ-ACCEPTANCE-001, REQ-CORE-006 — M2 reconciliation tolerance is not reachable from the executable dependency slice  
REQ-ACCEPTANCE-001 asks for exact/tolerance stock conservation and points to Gate M2, depending on REQ-CORE-004 and REQ-CORE-006. The actual numeric money/quantity/population/rate/reconciliation tolerances live in Handoff/03 NumericConfig, while the named M2 slice and listed dependency chain do not identify that source. A fresh implementer therefore has to remember Handoff/03 or choose a tolerance. That is a test-contract ambiguity, not merely code organization.  
Follow-up for a separate repair run: make the acceptance/dependency chain point to the canonical NumericConfig tolerance source or state the relevant tolerances directly in the M2 acceptance slice.

HANDOFF-FRESH-004 — REQ-CORE-006 — M2 “typed ledger/flow records” leaves the minimum ledger contract underdefined  
Gate M2 requires typed flow/ledger records for money, goods and physical losses plus fail-fast mismatch diagnostics. Handoff/01 defines the generic EconomicTransaction/accounting discipline, while the M2 requirement slice does not define the minimum record families/fields or the deliberately injected mismatch boundary needed by acceptance. The eventual market contract later defines richer transaction records, but M2 must exist before M3. A fresh implementer can make materially different ledger APIs and still claim the prose requirement.  
Follow-up for a separate repair run: decide whether M2 intentionally permits any equivalent typed representation; if yes, make the observable minimum semantics explicit. If no, define the small M2 ledger record set before further subsystems depend on it.

HANDOFF-FRESH-005 — REQ-MARKET-002, REQ-CONFIG-001 — Handoff/03 and Handoff/04 disagree on the canonical market baseline defaults  
Handoff/03 explicitly says it owns canonical defaults and gives MarketConfig baseline values such as basePriceAdjustmentSpeed \= 0.12, maxAbsoluteLogPriceMovePerTick \= 0.18, shortageSignalWeight \= 0.65 and inventorySignalWeight \= 0.35. Handoff/04's Phase-6 price section instead recommends priceSpeed \= 0.20, maxLogPriceStep \= ln(1.15), wExcess \= 0.70 and wInventory \= 0.30. Both are implementation-facing and the master precedence does not make it obvious whether a subsystem's “recommended starting defaults” override the configuration document that explicitly owns defaults. A fresh M3 implementer must choose values or names.  
Follow-up for a separate repair run: decide one canonical MarketConfig naming/value set, state whether Handoff/04 examples are historical/non-authoritative or update them to the config registry, and only then promote REQ-MARKET-002 from REVIEW.

HANDOFF-FRESH-006 — REQ-MARKET-004 — M3 local tax settlement calls an undefined collection-efficiency input at a milestone before fiscal implementation  
Handoff/04 makes buyer affordability and local-sale settlement depend on applicableConsumptionTaxRate(...) and collectionEfficiency(...), but the M3 local-market slice is scheduled before the M6 fiscal/law subsystem and does not define a minimal M3 fixture contract or fallback for collectionEfficiency. REQ-MARKET-004 must prove the collected tax transfer now, so a fresh implementer is forced to invent whether collection efficiency is 1, read a later fiscal contract, or build fiscal behavior early.  
Follow-up for a separate repair run: define the smallest M3 tax-policy fixture/query boundary (for example an explicit supplied effective tax rate/collection efficiency) without pulling M6 policy dynamics forward, or point the dependency slice to an already-canonical pure query if one exists. Do not invent fiscal behavior inside M3.

2026-09-05 — HANDOFF-REPAIR-001 — RESOLUTION OF HANDOFF-FRESH-001 — REQ-CONFIG-003, REQ-CORE-003

Resolved with the smallest schema repair. CohortSeed now uses the mature PopulationCohort vocabulary directly instead of an implicit translation layer: VULNERABLE / WORKING\_MIDDLE / AFFLUENT strata, explicit laborCategory, and the persistent cohort signal fields healthIndex, prosperityEma, essentialSatisfactionEma, realIncomePerCapitaEma, employmentRateEma, migrationPressureEma, mobilityAccumulator and wageSignal. Seed files must provide these persistent fields explicitly; buildInitialWorld must not translate legacy LOWER/MIDDLE/UPPER labels, rename prosperityIndex, or invent omitted cohort-state defaults. The same correction was applied to the canonical configuration contract and Handoff/03 and recorded in SPEC\_CHANGELOG as HANDOFF-REPAIR-001. No demographic formula, economic mechanism or baseline behavior was redesigned. HANDOFF-FRESH-001 is resolved; findings 002–006 remain open for separate runs.

2026-09-05 — HANDOFF-REPAIR-002 — RESOLUTION OF HANDOFF-FRESH-002 — REQ-CORE-003, REQ-CONFIG-003, REQ-CONFIG-004

Resolved by making direct schema navigation truthful instead of relying on precedence memory. Canonical Core and Handoff/01 now remove RegionState.pendingControllerStateId and RegionState.marketStatus, explicitly point future jurisdiction to PendingTransitions.jurisdictionChanges and market lifecycle to LocalMarketState.status, replace the old PopulationCohort shape with the mature persistent schema, and add ProductionUnit.investmentInventory while removing authoritative capacity from persistent state. Current employment is explicitly ephemeral through LaborSupplyPlan/LaborAllocation/TickContext. Canonical Production and Handoff/05 were reconciled so nameplate capacity is derived from installedCapital × recipe.batchesPerCapitalUnit through deriveNameplateCapacity; a cache, if used, is reconstructable and may never be independently mutated. The master index and consistency review already required these semantics; this repair removes the contradictory stale representations from the documents a stateless implementer actually opens. No economic formula, ownership rule, lifecycle timing or v1 scope changed. HANDOFF-FRESH-002 is resolved; HANDOFF-FRESH-003..006 remain open.  
2026-09-05 — HANDOFF-REPAIR-003 — RESOLUTION OF HANDOFF-FRESH-003 — REQ-CORE-006, REQ-ACCEPTANCE-001  
Resolved as a navigation/dependency defect, not by duplicating numeric policy. REQ-CORE-006 and REQ-ACCEPTANCE-001 now directly depend on REQ-CONFIG-001, which makes Handoff/03 (the owner of SimulationConfig.numeric defaults) reachable within the stateless AUTHOR two-read protocol. Their acceptance now names the resolved SimulationConfig.numeric reconciliation policy and forbids any M2-local epsilon/tolerance. Canonical Migration and Handoff/11 Gate M2 state that reconciliationRelativeTolerance applies where tolerance-based reconciliation is needed; moneyEpsilon and quantityEpsilon remain domain zero/positivity thresholds only where their owning contracts specify them. No numeric value, stock identity or accounting formula changed. HANDOFF-FRESH-003 is resolved; HANDOFF-FRESH-004..006 remain open.

2026-09-05 — HANDOFF-REPAIR-004 — RESOLUTION OF HANDOFF-FRESH-004 — REQ-CORE-006

Resolved by defining observable accounting semantics rather than a new competing ledger architecture. EconomicTransaction remains the business/audit envelope. At M2, reconciliation must expose a deterministic normalized projection of committed stock mutations with typed MONEY and GOOD signed deltas plus PHYSICAL\_LOSS attribution. Each observable delta carries tick/phase, the currencyId or goodId, the authoritative owner/location (including the relevant bucket once a subsystem defines one), a finite signed delta, a stable reason/type and optional causal IDs. A transfer becomes equal-and-opposite deltas for the same stock key; physical loss is an attributed negative physical delta with no balancing goods credit and is never a fee or money sink. Later market/FX/fiscal/event contracts may add richer transaction records, but they must remain losslessly reconcilable to this projection rather than forcing M2 to guess later mechanics.

The deliberate mismatch gate is now equally explicit: tests inject an unmatched synthetic delta into a test-only copy of the normalized ledger (or an exactly equivalent diagnostic fixture), and reconciliation must fail deterministically with stock category/key and residual information. No undocumented production mutation hook is required or allowed. CORE-T17, canonical \+ Handoff Core, canonical \+ Handoff Migration and REQ-CORE-006 acceptance were updated together; SPEC\_CHANGELOG records HANDOFF-REPAIR-004. No economic mechanism, stock identity, phase order or v1 scope changed. HANDOFF-FRESH-004 is resolved; HANDOFF-FRESH-005..006 remain open.  
2026-09-05 — HANDOFF-REPAIR-005 — RESOLUTION OF HANDOFF-FRESH-005 — REQ-MARKET-002, REQ-CONFIG-001  
Resolved by removing duplicate default authority, not by choosing new economics. CANONICAL\_CONFIG\_AND\_WORLD\_GENERATION section 4 remains the sole owner of baseline MarketConfig values. Canonical MARKETS\_TRADE\_FX\_CONTRACTS and Handoff/04 now bind the Phase-6 formula symbols directly to SimulationConfig.markets.shortageSignalWeight, inventorySignalWeight, basePriceAdjustmentSpeed and maxAbsoluteLogPriceMovePerTick instead of publishing the conflicting 0.70/0.30/0.20/ln(1.15) set. The existing config-owned baseline remains unchanged: 0.65/0.35 weights, 0.12 price-adjustment speed and 0.18 maximum absolute log move. No price formula, update timing, price meaning or economic mechanism changed. SPEC\_CHANGELOG records HANDOFF-REPAIR-005. HANDOFF-FRESH-005 is resolved; HANDOFF-FRESH-006 remains open, so M3 requirements stay REVIEW until its separate repair/adjudication run.  
2026-09-05 — HANDOFF-REPAIR-006 — RESOLUTION OF HANDOFF-FRESH-006 — REQ-MARKET-004  
Resolved without moving M6 fiscal behavior into M3. Market settlement now consumes a minimal read-only taxPolicy boundary: getConsumptionTaxRate(stateId, goodCategory) and getCollectionEfficiency(stateId), both using Phase-1 effective jurisdiction. Before M6, deterministic M3 fixtures inject explicit finite values through this provider; these are fixture/scenario inputs, not canonical defaults, and the provider owns no treasury, budget, debt, transfer or policy-update behavior. If Region.controllerStateId is null, State consumption tax is zero. When M6 is implemented, the same reads are backed by canonical FiscalPolicyState so the market algorithm does not change.

The same repair fixed a linked cash-semantics contradiction in Fiscal section 7: assessedTaxPerUnit \= sellerNetPrice \* statutory rate, collectedTaxPerUnit \= assessedTaxPerUnit \* collectionEfficiency, and buyerGrossPrice \= sellerNetPrice \+ collectedTaxPerUnit. Only collected tax is debited/credited; assessed-but-uncollected tax stays with the payer and is telemetry only. getCollectionEfficiency(stateId) was added to the pure law-gate API. MTFX-T4 and REQ-MARKET-004 acceptance now require a fixture with collectionEfficiency strictly between 0 and 1, proving M3 neither assumes 1.0 nor requires M6 dynamics. Canonical \+ Handoff Markets and Fiscal contracts, registry acceptance and SPEC\_CHANGELOG were updated together. HANDOFF-FRESH-006 is resolved. No fiscal policy dynamics, tax rate defaults, market-clearing rule, phase order or v1 scope was expanded.

2026-09-05 — HANDOFF-FRESH-007 — REQ-MARKET-002

Fresh-implementer M3 readiness review found one remaining implementation blocker in Phase-6 pricing. Handoff/04 uses \`targetCoverage\` in the inventory-gap formula but does not bind it to a SimulationConfig or definition field, while Handoff/03 intentionally owns all numeric defaults and currently has no target-coverage field. The same requirement relies on MarketExpectationState, but the handoff does not define deterministic initialization/update equations for expectedUseEma, shortageEma and surplusEma; only expectationAlpha exists in config.

A fresh implementer therefore must choose both the inventory-coverage target and the lagged-expectation semantics, which materially changes price dynamics. Do not promote REQ-MARKET-002 or M3 to READY until a separate repair run assigns targetCoverage to one canonical config/definition owner and specifies exact initialization/update behavior using the existing expectationAlpha, or an equally explicit canonical rule, without adding a parallel market mechanism.

STATUS: OPEN.

2026-09-05 — HANDOFF-REPAIR-007 — resolves HANDOFF-FRESH-007 / REQ-MARKET-002

Resolved the remaining M3 Phase-6 expectation ambiguity. \`SimulationConfig.markets.targetInventoryCoverageTicks\` now owns the inventory-coverage target with canonical baseline 1.0 tick. \`MarketExpectationState\` has an explicit \`observationCount\` bootstrap marker; all expectation fields start at zero; no-information MAIN passes leave the state unchanged; the first informative Phase-8 MAIN observation initializes expected-use/shortage/surplus EMAs directly; later informative observations use \`expectationAlpha\`. Phase-6 uses current effective demand only while no informative observation exists, then uses the lagged \`expectedUseEma\`. Expected use is based on effective demand rather than cleared quantity so rationing does not erase budget-backed unmet use. Phase 4 never updates this expectation state. Added MTFX-T27 and strengthened REQ-MARKET-002 acceptance. No forecasting agent, speculative demand, market-owned inventory, price target, or other new economic mechanism was introduced. M3 remains REVIEW until a separate fresh-implementer readiness pass.

2026-09-05 — M3\_READY\_PROMOTION\_QA\_02 — HANDOFF-FRESH-008  
REQ\_ID: REQ-MARKET-001, REQ-MARKET-003  
Finding: the named M3 registry anchors are not slice-complete under EXECUTION\_ORDER's exact FILE \+ ANCHOR protocol. REQ-MARKET-001 points to Handoff/04 section 5, but its acceptance requires section 6's budget-ledger and planning-envelope rules. REQ-MARKET-003 points to section 10, but its algorithm consumes the exact sellable/effectiveDemand definitions from section 7 and its statement requires MarketAllocation construction whose schema is section 11\. Those required sections are not represented by the current direct dependency rows. A stateless AUTHOR therefore has to search neighboring text and decide which rules belong to the executable unit.  
Disposition: keep all M3 rows in REVIEW. Do not change mechanics in this pass. A separate HANDOFF\_REPAIR\_08 should make the affected registry slices mechanically self-contained, preferably through the smallest navigation/cross-reference repair rather than duplicating economic rules; then rerun M3 readiness promotion.  
STATUS: OPEN.

2026-09-05 — HANDOFF-REPAIR-008 — RESOLUTION OF HANDOFF-FRESH-008 — REQ-MARKET-001, REQ-MARKET-003  
Resolved as a navigation-slice defect only. REQ-MARKET-001 now explicitly states that Handoff/04 sections 5 and 6 form one executable slice: section 5 owns MarketIntent shape/validation and section 6 owns the required budget-ledger/planning-envelope semantics. REQ-MARKET-003 now explicitly states that sections 7, 10 and 11 form its executable slice: section 7 defines sellable\_i/effectiveDemand\_j inputs, section 10 defines deterministic proportional allocation/matching, and section 11 defines the MarketAllocation output schema. Handoff/04 carries matching inline registry-slice notes so a stateless AUTHOR does not have to search neighboring prose or decide what is normative. No market formula, budget rule, clearing rule, schema field, acceptance criterion, dependency ordering or v1 scope changed. HANDOFF-FRESH-008 is resolved. All M3 rows remain REVIEW until a separate fresh-implementer promotion pass.

2026-09-05 — M3\_READY\_PROMOTION\_QA\_03 — HANDOFF-FRESH-009  
REQ\_ID: REQ-MARKET-005, REQ-VISUALIZATION-006  
Finding: the M3 executable telemetry/UI slice still leaves the surplus signal underdefined. Handoff/04 section 33 names \`shortageRate\` and \`unsoldOfferQuantity\`, but does not name or define a telemetry \`surplusRate\`. REQ-MARKET-005 acceptance requires “shortage/surplus signals”, REQ-VISUALIZATION-006 requires the visible M3 preview to show “shortage/surplus”, and Handoff/11 repeats that presentation requirement. Section 9 does compute \`surplusRate \= offeredQuantity \> quantityEpsilon ? unsold / offeredQuantity : 0\` for expectation updates, but section 33 never states whether that exact value is the telemetry/UI signal or whether the preview should derive another measure. A stateless implementer can therefore satisfy the market math while exposing incompatible surplus semantics to diagnostics/UI.  
Disposition: keep all seven M3 rows in REVIEW. Do not change economics in this pass. A separate HANDOFF\_REPAIR\_09 should bind section 33 and the M3 preview to one explicit surplus telemetry field/definition, preferably reusing the existing Section-9 realized MAIN-pass \`surplusRate\` rather than inventing another metric. Visualization share remains 1/7 \= 14.3%, above the \>=5% milestone rule.  
STATUS: OPEN

2026-09-05 — PROTOCOL-UPDATE-001 — mirror/evidence/indexing protocol

To the implementation team:

1\. B1 — CONFIRMED AND APPLIED. Section G now reads docs/spec/implementation\_status.csv instead of IMPLEMENTATION\_STATUS.md. REVIEW/QA runs treat the CSV ledger as the implementation-evidence source; the rendered Markdown is presentation only. Ledger columns are REQ\_ID, STATUS, ISSUE, PR, MERGE\_COMMIT, EVIDENCE. An identifier absent from the ledger has no implementation evidence. PARTIAL is recognized as merged evidence for a named slice without falsely closing the full requirement. FEEDBACK\_TO\_RESEARCHER.md and OPEN\_QUESTIONS.md remain mandatory inputs.

2\. B2 — CONFIRMED AND APPLIED. Every new file entering the implementation package must be recorded in SPEC\_CHANGELOG and accompanied by an explicit ANSWERS\_TO\_IMPLEMENTER request in the form: “please add \<path\> to the mirror allowlist”. Until the repository-side policy change lands, absence of that file from the mirror is expected and is not a synchronization failure. This protocol update adds no new mirrored file, so no allowlist addition is requested by this entry.

3\. B3 — CONFIRMED AND APPLIED. Renaming any file listed in SPEC\_INDEX is a breaking navigation change. Before such a rename, I will announce the exact old→new path in ANSWERS\_TO\_IMPLEMENTER and SPEC\_CHANGELOG; only after that announcement may the source file be renamed. Exported filenames must exactly match mirrored filenames. A blocked sync after an unannounced/suffix-surviving rename is treated as a source-side protocol defect, not something implementation should work around.

4\. C — ACCEPTED for indexing-time granularity. When a future milestone is indexed, acceptance that enumerates independently implementable and independently verifiable artifacts will be split into separate requirement rows unless the artifacts form one genuinely atomic contract. IDs remain permanent: never renumber or reuse them. Existing composite rows such as current M1 config requirements are not silently split retroactively; PARTIAL records their intermediate implementation state honestly. Any later retroactive split requires an explicit registry/changelog change with new IDs. M4 indexing must apply this granularity rule from the start.

5\. B4 — CONFIRMED AS OPERATING ASSUMPTION. docs/spec/mirror/ is write-protected to implementation: only the synchronization workflow writes it. Google Drive is the sole specification-content authority. If the mirror is wrong, report the mismatch back through the established channel; do not patch the mirror directly.

These are process/indexing changes only. They do not alter any economic requirement or transfer specification authority to implementation.  
.  
2026-09-05 — HANDOFF-REPAIR-009 — RESOLUTION OF HANDOFF-FRESH-009 — REQ-MARKET-005, REQ-VISUALIZATION-006  
Resolved with the smallest telemetry/presentation clarification. The existing section-9 realized MAIN-pass ratio is now the only canonical surplus signal: surplusRate \= offeredQuantity \> quantityEpsilon ? unsoldOfferQuantity / offeredQuantity : 0\. Section 33 exposes surplusRate alongside shortageRate and explicitly binds both telemetry ratios to the same realized formulas already used by MarketExpectationState. The M3 Milestone Preview must display the realized Phase-8 MAIN-pass shortageRate and surplusRate and must not derive a second surplus measure. PRE\_PRODUCTION telemetry may use the same ratio definitions where emitted, but it does not update expectations. Canonical and Handoff copies of the Markets and Migration contracts were updated together. No price, clearing, expectation, tax, settlement, default, phase-order, acceptance-threshold or v1-scope mechanic changed. HANDOFF-FRESH-009 is resolved. All seven M3 rows remain REVIEW until a separate fresh-implementer readiness-promotion pass succeeds.  
STATUS: RESOLVED

2026-09-05 — M3\_READY\_PROMOTION\_QA\_04 / CONSISTENCY-SIMPLICITY\_REVIEW — HANDOFF-FRESH-010  
REQ\_ID: REQ-MARKET-002, REQ-CONFIG-001  
Finding: the M3 price-formation slice is internally precise, but Handoff/04 section 42 still presents an authoritative-looking \`MarketConfig\` surface with stale shorthand names: \`priceSpeed\`, \`maxLogPriceStep\`, \`targetInventoryCoverage\`, \`wExcess\`, \`wInventory\`, and plural \`expectation EMA coefficients\`. Handoff/03 is the sole configuration/default owner and instead defines \`basePriceAdjustmentSpeed\`, \`maxAbsoluteLogPriceMovePerTick\`, \`targetInventoryCoverageTicks\`, \`shortageSignalWeight\`, \`inventorySignalWeight\`, and singular \`expectationAlpha\`. Handoff/04 section 9 correctly binds its formula to those exact canonical fields, so section 42 now contradicts the same document's executable slice and can cause a stateless implementer to create duplicate aliases or a second MarketConfig schema.  
Disposition: keep all seven M3 rows in REVIEW. Do not repair the defect in this promotion/consistency pass. A separate HANDOFF\_REPAIR\_10 should make section 42 a non-duplicating reference to the exact canonical SimulationConfig.markets fields (or remove the stale shorthand list), synchronize the canonical Markets working copy, and record the repair without changing any value, formula, timing, or economic behavior. Repository feedback contains no open blocking question for M3, and the authoritative implementation\_status.csv contains no M3 ledger rows, which correctly means no M3 implementation evidence yet and does not override specification readiness. Visualization share remains 1/7 \= 14.3%.  
STATUS: OPEN

2026-09-05 — HANDOFF-REPAIR-010 — RESOLUTION OF HANDOFF-FRESH-010 — REQ-MARKET-002, REQ-CONFIG-001  
Resolved with a schema-ownership/documentation repair only. Section 42 of Handoff/04 and the canonical Markets working copy no longer advertise shorthand MarketConfig aliases. They now point to the exact fields already owned by CANONICAL\_CONFIG\_AND\_WORLD\_GENERATION section 4 and used by section 9: SimulationConfig.markets.basePriceAdjustmentSpeed, maxAbsoluteLogPriceMovePerTick, minimumPrice, maximumPrice, targetInventoryCoverageTicks, shortageSignalWeight, inventorySignalWeight and expectationAlpha. SimulationConfig.numeric.quantityEpsilon and moneyEpsilon remain numeric-domain thresholds and are explicitly not MarketConfig fields. No numeric value, price formula, expectation bootstrap/update behavior, phase timing, acceptance threshold, tax/settlement behavior or v1 scope changed. HANDOFF-FRESH-010 is resolved. All seven M3 rows remain REVIEW until a separate readiness-promotion pass succeeds.  
STATUS: RESOLVED

2026-09-05 — M3\_READY\_PROMOTION\_QA\_05 — M3 promoted to READY

Fresh stateless-implementer readiness review passed for all seven M3 slices: REQ-MARKET-001..005, REQ-ACCEPTANCE-004 and REQ-VISUALIZATION-006. Exact FILE \+ ANCHOR navigation is mechanically reachable; REQ-MARKET-001 explicitly binds Handoff/04 sections 5+6 and REQ-MARKET-003 binds sections 7+10+11. Handoff/03 remains the sole owner of MarketConfig defaults and Handoff/04 sections 9 and 42 use the same exact SimulationConfig.markets field names. Local clearing, settlement, consumption-tax fixture semantics, telemetry shortageRate/surplusRate, MTFX local acceptance and the one-way M3 Pages preview are internally consistent and require no material implementer product/economic choice.

Repository FEEDBACK\_TO\_RESEARCHER and OPEN\_QUESTIONS contain no open M3 blocker, and authoritative docs/spec/implementation\_status.csv contains no M3 evidence rows; this correctly means implementation has not begun and does not block specification readiness. REQUIREMENTS\_REGISTRY now marks all seven M3 rows READY. Visualization allocation remains 1/7 \= 14.3%, above the \>=5% rule. No formula, default, stock ownership, phase order, tax/settlement behavior, acceptance threshold, requirement statement or v1 scope changed in this promotion pass.

STATUS: READY

2026-09-05 — CODE\_RUNTIME\_QA\_M1\_01 — REQ-CONFIG-003 implementation-evidence drift

Observed on current master: PR \#91 (\`7da5650d63fdd1d8349f9c447ad4d7810c2093c4\`) is merged and \`src/config/scenarioDefinition.ts\` now contains concrete field shapes for \`StateSeed\`, \`MonetaryAuthoritySeed\` and \`ClanSeed\`; \`src/config/scenarioSeeds.typecheck.test.ts\` includes compile-time regressions for all three. However, authoritative \`docs/spec/implementation\_status.csv\` still records REQ-CONFIG-003 only against Issue \#77 / PR \#79 and says those three seed shapes are still open. The source file's opening doc comment is stale in the same direction: it still says \`StateSeed\`, \`MonetaryAuthoritySeed\` and \`ClanSeed\` remain empty placeholders even though the interfaces immediately below are concrete.

Disposition: this is an implementation evidence/documentation defect, not a specification defect. Keep REQ-CONFIG-003 \`PARTIAL\` because baseline-multistate-v1 content and other named slices remain unfinished, but reconcile the CSV evidence to include the merged \#91 slice and remove the false “still open” claim for these three types. Also update the stale \`scenarioDefinition.ts\` header comment so it accurately distinguishes the now-concrete top-level seed shapes from the genuinely placeholder nested types (\`StatePolicySeed\`, \`FxPoolSeed\`, \`ClanPreferenceState\`, \`ClanStateRelationSeed\`, plus later bond/event-owned shapes). Do not change any seed field, requirement meaning, economic mechanic or milestone ordering.

STATUS: IMPLEMENTATION\_REPAIR\_REQUESTED  
2026-09-05 — CODE\_RUNTIME\_QA\_M1\_02 — REQ-CONFIG-003 remaining baseline-pack slice is not executable  
REQ\_ID: REQ-CONFIG-003

Observed: the implementation-side repair requested by CODE\_RUNTIME\_QA\_M1\_01 has not landed yet: authoritative docs/spec/implementation\_status.csv remains PARTIAL with only the Issue \#77 / PR \#79 slice, and scenarioDefinition.ts still carries the stale header comment. I did not re-audit that same defect. There is still no open REQ-CONFIG-003 Issue. Separately, the next unfinished slice of REQ-CONFIG-003 is the baseline definition pack plus baseline-multistate-v1 scenario. Handoff/03 requires that scenario to instantiate ProductionUnits spanning the baseline recipes and to carry State/MonetaryAuthority/Clan initialization data, but the named executable slice does not define concrete RecipeDefinition, StatePolicySeed, FxPoolSeed, ClanPreferenceState or ClanStateRelationSeed shapes; BondSeed/InitialEventSeed and later-owned EventDefinition/MetricDefinition are also placeholders. Current master reflects this honestly: definitionPack.ts keeps RecipeDefinition/EventDefinition/MetricDefinition as empty interfaces, and scenarioDefinition.ts keeps the nested policy/FX/clan/bond/event seed types empty rather than guessing.

Finding: under the exact FILE \+ ANCHOR and two-read stateless AUTHOR protocol, the remaining REQ-CONFIG-003 baseline-pack/scenario work is therefore not mechanically executable. Completing it now would require either reading undeclared later subsystem documents beyond the requirement's dependency slice or inventing schema fields that materially determine baseline world construction. REQ-CONFIG-004 cannot safely start before this composite requirement is closed, and REQ-VISUALIZATION-004 remains downstream of REQ-CONFIG-004.

Disposition: keep the specification row REQ-CONFIG-003 READY and the implementation ledger status PARTIAL. Do not start REQ-CONFIG-004 from this state. A separate HANDOFF\_REPAIR\_11 should make only the M1 initialization schemas needed to author the baseline pack/scenario mechanically reachable or self-contained under the stateless navigation protocol, using the existing canonical subsystem contracts as authority and without pulling later dynamic subsystem behavior into M1. This QA pass changes no requirement meaning, economic formula, default, stock ownership, phase order, acceptance threshold or v1 scope. No new file is added and no mirror-allowlist request is needed.

STATUS: OPEN — SPEC\_NAVIGATION\_REPAIR\_REQUIRED  
2026-09-05 — HANDOFF-REPAIR-011 — RESOLUTION OF CODE\_RUNTIME\_QA\_M1\_02 — REQ-CONFIG-003  
Resolved the remaining M1 baseline-pack/scenario navigation blocker without pulling later subsystem behavior forward. CANONICAL\_CONFIG\_AND\_WORLD\_GENERATION and Handoff/03 now contain an explicit M1 executable initialization boundary. RecipeDefinition is concretized there using exactly the immutable definition-data fields already owned by PRODUCTION\_CAPITAL\_LABOR\_CONTRACTS. FxPoolSeed is concretized as the opening-stock projection of the canonical FX-pool state: stable pair key, base/quote currency keys, explicit pool cash, spot rate, reserve target/floors, spread, zero-baseline flow-pressure EMA and max next-tick rate move. Each pair exists once under the authority issuing its configured base currency, and pool cash is included once in WorldGenesisLedger money reconciliation.

Later-owned StatePolicySeed, ClanPreferenceState, ClanStateRelationSeed, BondSeed, InitialEventSeed, EventDefinition and MetricDefinition are now explicitly staged rather than left ambiguous. In baseline-multistate-v1 at M1, State policy and Clan preference payloads are intentional opaque empty objects, initialRelations/bonds/initialEvents may be empty or omitted, and eventDefinitions/metricDefinitions may be empty with no M1 references to absent IDs. M1 code must not interpret these placeholders. Their owning milestone must install the canonical subsystem schema before activating the behavior, and any material ScenarioDefinition/DefinitionPack content change advances the corresponding version so content hashes and runIdentity remain truthful.

REQ-CONFIG-003 acceptance was strengthened to expose this milestone boundary. The specification row remains READY and implementation evidence remains PARTIAL until repository code/data satisfies the full composite requirement. REQ-CONFIG-004 remains downstream, but the spec no longer requires an AUTHOR to invent later fiscal/clan/event/metric mechanics to finish the M1 baseline data slice. No economic formula, numeric default, stock ownership, phase order, tax/FX settlement behavior, acceptance threshold, or v1 scope changed. No new implementation-package file was added; no mirror allowlist request is required.  
STATUS: RESOLVED

2026-09-05 — CODE\_RUNTIME\_QA\_M1\_03 — Issue \#135 REQ-CONFIG-004 task-contract correction

Observed: HANDOFF\_REPAIR\_11 has reached the repository mirror and Handoff/03 now exposes the M1 RecipeDefinition/FxPoolSeed initialization boundary. The authoritative implementation\_status.csv nevertheless still marks REQ-CONFIG-003 PARTIAL and has no REQ-CONFIG-004 evidence row. Issue \#135 was opened as status:ready for REQ-CONFIG-004 while explicitly acknowledging the PARTIAL dependency, and its Scope item 2 says WorldGenesisLedger entries themselves should sum to zero.

Finding: these are two linked implementation-task defects, not specification defects. REQ-CONFIG-004 depends on REQ-CONFIG-003 and therefore must not be claimed until the authoritative ledger records REQ-CONFIG-003 as IMPLEMENTED. Separately, Handoff/03 section 20 defines genesis records as opening endowments recorded outside normal EconomicTransaction history; they reconcile source endowments against resulting tick-0 authoritative stocks. They are not equal-and-opposite transaction deltas and must not themselves net to zero.

Action: posted the correction directly on Issue \#135 (comment 5552011163). Replace the zero-sum criterion with source-endowment \-\> tick-0 reconciliation for money, goods, population, capital and resources; diagnostics should name stock category/key, expected genesis total, actual tick-0 total and residual. Keep WorldGenesisLedger separate from normal tick transaction history. Do not claim Issue \#135 while REQ-CONFIG-003 remains PARTIAL. The separate CODE\_RUNTIME\_QA\_M1\_01 PR \#91 ledger/header cleanup remains implementation evidence debt and was not combined into this unit.

No specification requirement meaning, economic formula, stock ownership, phase order, tolerance, milestone ordering or v1 scope changed.

STATUS: IMPLEMENTATION\_TASK\_REPAIR\_REQUESTED

2026-09-05 — CODE\_RUNTIME\_QA\_M1\_05 — REQ-CONFIG-003 implementation-queue liveness gap

Observed: HANDOFF-REPAIR-011 is already present in the repository mirror and the authoritative Drive registry keeps REQ-CONFIG-003 READY with an M1-complete initialization boundary for RecipeDefinition, FxPoolSeed and the intentionally inactive later-owned placeholders. However, docs/spec/implementation\_status.csv still records REQ-CONFIG-003 as PARTIAL on the old Issue \#77 / PR \#79 slice, current source still leaves RecipeDefinition and FxPoolSeed as empty placeholders, and there is no open implementation Issue for the remaining REQ-CONFIG-003 baseline definition-pack / baseline-multistate-v1 work. The only open M1 config Issue found is downstream REQ-CONFIG-004 \#135, which still carries status:ready even though its dependency is not IMPLEMENTED.

Finding: this is an implementation queue-liveness / milestone-order defect, distinct from the already-reported \#135 zero-sum semantics defect. The specification is now executable, but the repository has no correctly selectable upstream work item that can advance the earliest incomplete requirement. A stateless AUTHOR selecting status:ready work can therefore be steered to blocked CONFIG-004 while CONFIG-003 has no runnable task at all.

Requested implementation action: create or restore one bounded REQ-CONFIG-003 work item before REQ-CONFIG-004 is claimable. Its scope should implement the current mirrored M1 initialization boundary (at minimum concrete RecipeDefinition and FxPoolSeed), author the deterministic baseline definition pack / baseline-multistate-v1 data required by REQ-CONFIG-003, add proving type/content/determinism tests, and reconcile implementation\_status.csv as PARTIAL or IMPLEMENTED according to what actually merges. Do not pull later fiscal/clan/event/metric behavior into M1. Issue \#135 should not remain selectable as ready until REQ-CONFIG-003 is IMPLEMENTED. The separate PR \#91 evidence/header debt remains outstanding and is not re-audited here.

No specification, requirement meaning, economic mechanism, formula, default, stock ownership, phase order, acceptance threshold or v1 scope changed.

STATUS: IMPLEMENTATION\_QUEUE\_REPAIR\_REQUESTED

2026-09-05 — CODE\_RUNTIME\_QA\_M1\_06 — Issue \#138 crosses REQ-CONFIG-003/004 boundary

Observed: the implementation queue-liveness gap from CODE\_RUNTIME\_QA\_M1\_05 has changed state: Issue \#138 now exists and is correctly titled for REQ-CONFIG-003. However, its scope also includes buildInitialWorld(), WorldGenesisLedger, opening-stock reconciliation, and M1 initialization invariants, while the canonical registry assigns WorldGenesisLedger/opening-stock reconciliation to the separate downstream REQ-CONFIG-004 row, which explicitly depends on REQ-CONFIG-003.

Finding: this is an implementation task-boundary / milestone-order defect. Existing composite REQ-CONFIG-003 must remain stable, but implementation must not absorb the independently indexed REQ-CONFIG-004 acceptance into it. Doing so would let \#138 claim CONFIG-003 while simultaneously implementing downstream behavior before the authoritative ledger closes its dependency, and would make evidence ownership ambiguous.

Action: posted correction comment 5552649110 on Issue \#138. Keep \#138 bounded to the baseline definition pack, baseline-multistate-v1, the current M1 RecipeDefinition/FxPoolSeed initialization data, and proving CONFIG-003 content/determinism tests. WorldGenesisLedger and opening-stock reconciliation belong to REQ-CONFIG-004 after CONFIG-003 becomes IMPLEMENTED. buildInitialWorld() may appear in \#138 only as the minimum construction/validation path needed for CONFIG-003; it must not prematurely claim CONFIG-004 reconciliation semantics. Also do not use the stale remaining-work prose in implementation\_status.csv as specification scope: the ledger still omits merged PR \#91 and falsely lists StateSeed, MonetaryAuthoritySeed and ClanSeed as open.

No specification requirement, economic mechanism, formula, default, stock ownership, phase order, acceptance threshold or v1 scope changed.

STATUS: IMPLEMENTATION\_TASK\_REPAIR\_REQUESTED

2026-09-05 — CONSISTENCY\_SIMPLICITY\_REVIEW\_M1\_01 — permanent-ID/task-boundary correction

Cross-document M1 review confirms the Drive registry/handoff ownership is internally consistent: existing composite REQ-CONFIG-003 remains one permanent requirement with PARTIAL implementation evidence until all of its own acceptance is merged; REQ-CONFIG-004 separately owns WorldGenesisLedger/opening-stock reconciliation and depends on CONFIG-003. No Drive specification contradiction was found.

New implementation-process finding: Issue \#138's AUTHOR BLOCKED assessment correctly says the task is too large for one bounded run, but its proposed split invents pseudo requirement identifiers \`REQ-CONFIG-003a\` through \`REQ-CONFIG-003e\`, which violates the permanent-ID protocol. It also proposes a CONFIG-003c WorldGenesisLedger/reconciliation slice that belongs to REQ-CONFIG-004, repeating the requirement-boundary error already identified in R89.

Action: posted correction comment 5552996009 on Issue \#138. Split the implementation work into several ordinary Issues if needed, but every upstream slice must reference the same permanent \`REQ-CONFIG-003\` identifier and accumulate PARTIAL evidence until the composite row is complete. Do not create suffix requirement IDs. Keep WorldGenesisLedger/opening-stock reconciliation entirely under downstream \`REQ-CONFIG-004\` / Issue \#135 after CONFIG-003 is IMPLEMENTED. No registry row, formula, economic mechanism, acceptance meaning, or v1 scope changed.

STATUS: IMPLEMENTATION\_PROCESS\_REPAIR\_REQUESTED

2026-09-05 — CODE\_RUNTIME\_QA\_M1\_07 — PR \#156 RecipeDefinition validation acceptance blocker

REQ\_ID: REQ-CONFIG-003

Observed: repository state changed after R90. Issue \#154 / PR \#156 is now a bounded RecipeDefinition slice and the PR body correctly leaves WorldGenesisLedger/opening-stock reconciliation under downstream REQ-CONFIG-004. However, the AUTHOR handoff and PR explicitly defer RecipeDefinition numeric validation to a later validation layer or world-gen slice. Handoff/03 section 16A is explicit that M1 authors and validates immutable recipe data and names the required constraints: positive output and batches-per-capital-unit; non-negative input, labor and startup-capital quantities; minimumInfrastructureFactor in \[0,1\] where present; positive extractedResourcePerBatch when extractionResourceId is present; positive baseThroughputFactor; depreciationRatePerTick in \[0,1).

Finding: PR \#156 is not acceptance-complete for this RecipeDefinition slice as currently claimed. The diff adds the readonly field shape and valid fixtures/tests, but no executable negative validation proving the section-16A bounds are rejected. The current “immutability” test is also vacuous: it checks that a mutation callback is defined rather than proving that mutation throws or leaves canonical definition data unchanged.

Requested implementation action: before accepting/merging this slice, implement or invoke M1 RecipeDefinition validation at the config/world-gen validation boundary (exact code location is an engineering detail) for every named section-16A constraint, with negative tests and useful diagnostics. Do not defer these constraints to a later milestone. Replace the vacuous immutability assertion with a real proof consistent with the repository’s chosen immutable-definition boundary. Keep the work under permanent REQ-CONFIG-003 and keep REQ-CONFIG-003 PARTIAL unless the full composite requirement is actually satisfied. Do not add CONFIG-004 behavior. The PR’s pseudo-ID wording and the stale PR \#91 ledger/header evidence debt are existing R90/R83 findings and are not re-counted here.

No specification requirement, economic mechanism, formula, default, stock ownership, phase order, acceptance threshold or v1 scope changed.

STATUS: IMPLEMENTATION\_REPAIR\_REQUESTED

2026-09-05 — HANDOFF-REPAIR-012 — REQ-CONFIG-003 / REQ-CONFIG-004

Fresh Issue \#157 exposed a real specification boundary contradiction. The registry makes REQ-CONFIG-004 depend on a completed REQ-CONFIG-003 and assigns WorldGenesisLedger/opening-stock reconciliation to CONFIG-004, but Handoff/03 section 19 still said that exact REQ-CONFIG-003 buildInitialWorld step 16 must “Create WorldGenesisLedger”. That made the downstream dependency cyclic even though \#157 correctly treated ledger/reconciliation as a non-goal.

Resolved in Drive with the smallest ownership repair. REQ-CONFIG-003 buildInitialWorld now constructs the deterministic tick-0 world, normalizes sparse maps and runs only initialization invariants that do not require WorldGenesisLedger/opening-stock reconciliation. REQ-CONFIG-004 immediately follows by creating WorldGenesisLedger and reconciling opening endowments against that constructed state before the M1 gate can close. Section 20, the genesis-reconciliation validation rule, ledger-dependent invariants 12/18 and the genesis money/good reconciliation tests are explicitly owned by CONFIG-004. Existing opening-endowment semantics, diagnostics, tolerance and accounting identities are unchanged.

Implementation guidance: once this revision reaches the mirror, Issue \#157 may implement the repaired CONFIG-003 constructor order but must not create or claim WorldGenesisLedger/reconciliation. CONFIG-004 remains downstream. PR \#156 still has the separate R91 RecipeDefinition validation/immutability blocker unless that PR changes; the older pseudo-ID, \#135 task wording and PR \#91 evidence/header debts were not re-audited as new findings in this run.

STATUS: RESOLVED — SPEC\_BOUNDARY\_REPAIR

2026-09-05 — CODE\_RUNTIME\_QA\_M1\_09 — post-merge REQ-CONFIG-003 evidence-ledger reconciliation

REQ\_ID: REQ-CONFIG-003

Observed: PR \#156 is now merged, so the authoritative implementation\_status.csv legitimately remains PARTIAL and now records the RecipeDefinition schema/fixture slice. HANDOFF-REPAIR-012 is also present in the repository mirror: current Handoff/03 explicitly assigns WorldGenesisLedger/opening-stock reconciliation to downstream REQ-CONFIG-004, not to CONFIG-003. However, the newly written CONFIG-003 ledger row still says that WorldGenesisLedger opening-stock reconciliation remains open under CONFIG-003; it also describes Issue \#154 as “REQ-CONFIG-003a”, despite the permanent-ID rule, and repeats the already-known false claim that StateSeed, MonetaryAuthoritySeed and ClanSeed remain open even though merged PR \#91 made those top-level shapes concrete.

Finding: this is a repository implementation-evidence defect after a real state change, not a specification defect. Keep REQ-CONFIG-003 PARTIAL, but reconcile its ledger evidence to the permanent REQ-CONFIG-003 identifier only; include merged PR \#91 and PR \#156 evidence accurately; remove StateSeed/MonetaryAuthoritySeed/ClanSeed from remaining work; and remove WorldGenesisLedger/opening-stock reconciliation from CONFIG-003 remaining work because HANDOFF-REPAIR-012 assigns that behavior to REQ-CONFIG-004. Remaining CONFIG-003 work should reflect only work actually owned by the current CONFIG-003 contract, such as FxPoolSeed integration, baseline-multistate-v1 content, buildInitialWorld() construction, and any still-unproved CONFIG-003 validation/determinism acceptance.

PR \#156's separate RecipeDefinition validation/immutability blocker from CODE\_RUNTIME\_QA\_M1\_07 remains outstanding: the merged PR body still explicitly defers the numeric validation required by Handoff/03 §16A. Do not treat merge alone as proof that those acceptance clauses are satisfied. This run does not reopen or re-count that blocker; it only repairs the new authoritative ledger wording/evidence state created by the merge.

No Drive specification, requirement meaning, economic mechanism, formula, default, stock ownership, phase order, acceptance threshold or v1 scope changed.

STATUS: IMPLEMENTATION\_EVIDENCE\_REPAIR\_REQUESTED  
2026-09-05 — CODE\_RUNTIME\_QA\_M1\_10 — PR \#163 LocalMarket identity defect  
REQ\_ID: REQ-CONFIG-003  
Observed: PR \#163 implements the repaired CONFIG-003 buildInitialWorld slice and correctly keeps WorldGenesisLedger/opening-stock reconciliation downstream. However, src/simulation/worldState.ts constructs marketRegistry with the correct allocated MarketId as the Map key while buildLocalMarketState() returns LocalMarketState.marketId \= undefined as unknown as MarketId. The accompanying tests never assert that each registry value carries the same MarketId as its registry key.  
Finding: this is a runtime identity/invariant defect. Canonical entity identity requires registry entries to be keyed by their own persistent ID; returning an undefined embedded marketId creates a split identity that can break later references, diagnostics, lifecycle records and M1 visualization even though marketRegistry.size and Map lookup still appear valid.  
Requested implementation action: before PR \#163 merges, pass the allocated MarketId into buildLocalMarketState (or construct the state with that exact ID), add a test asserting key \=== value.marketId for every market, and include that condition in initialization invariants. Do not change market economics, lifecycle semantics, CONFIG-004 ownership or requirement meaning. The separate R91 RecipeDefinition validation blocker and R93 evidence-ledger cleanup remain outstanding and are not re-counted here.  
No Drive specification, formula, default, stock ownership, phase order, acceptance threshold or v1 scope changed.  
STATUS: IMPLEMENTATION\_REPAIR\_REQUESTE  
2026-09-05 — CODE\_RUNTIME\_QA\_M1\_11 — post-merge PR \#163 LocalMarket identity failure  
REQ\_ID: REQ-CONFIG-003  
Observed: PR \#163 has now merged, so repository state changed after R94, but current master still constructs \`marketRegistry\` with the allocated \`MarketId\` as the Map key while \`buildLocalMarketState()\` stores \`marketId: undefined as unknown as MarketId\` in the \`LocalMarketState\` value. \`validateInitializationInvariants()\` checks Region→State and State→Currency references only; it does not validate registry key/value identity. \`worldState.test.ts\` also supplies no MarketSeed and contains no market identity assertion, so the defect survives all claimed 181 tests and the step-16 invariant evidence.  
Finding: this is now a post-merge implementation-conformance failure, not merely a pre-merge review note. PR \#163 remains useful PARTIAL evidence for deterministic world construction, but its claim that the CONFIG-003 initialization invariants are satisfied is overstated until the embedded persistent ID is repaired and proved.  
Requested implementation action: create a minimal follow-up under permanent \`REQ-CONFIG-003\`. Pass the allocated \`MarketId\` into \`buildLocalMarketState\`, store exactly that ID in \`LocalMarketState.marketId\`, add at least one MarketSeed fixture and assert every \`worldState.markets\` entry satisfies \`registryKey \=== market.marketId\`, and enforce the same condition in initialization invariants. Keep WorldGenesisLedger/opening-stock reconciliation under REQ-CONFIG-004. After the fix merges, update authoritative \`implementation\_status.csv\` evidence so PR \#163 is not presented as proving an invariant it currently misses. Posted the same correction on merged PR \#163 as comment 5554742442\.  
No Drive specification, market economic behavior, formula, default, stock ownership, phase order, acceptance threshold or v1 scope changed.  
STATUS: POST\_MERGE\_IMPLEMENTATION\_REPAIR\_REQUESTED  
D

2026-09-06 — CONSISTENCY\_SIMPLICITY\_REVIEW\_M1\_02 — false CONFIG-003 completion gate  
REQ\_ID: REQ-CONFIG-003, downstream REQ-CONFIG-004 / REQ-VISUALIZATION-004

Observed: authoritative docs/spec/implementation\_status.csv was promoted by merged PR \#173 from REQ-CONFIG-003 PARTIAL to IMPLEMENTED, and new Issue \#175 therefore treats CONFIG-004 as unblocked. PR \#173 completes FxPoolSeed and baseline-multistate-v1 data, but its changed implementation artifacts do not include the RecipeDefinition validation path. Current master src/config/definitionPack.ts still documents the exact Handoff/03 §16A validation requirements, while src/config/validation.ts validates ScenarioDefinition seed content only and contains no RecipeDefinition / DefinitionPack validation for the required positive, non-negative, \[0,1\], extraction, throughput and depreciation constraints.

Finding: CONFIG-003 is not acceptance-complete despite the ledger promotion. This is an implementation-evidence/gate consistency defect, not a specification defect. The previously reported R91 RecipeDefinition validation blocker remains live and is sufficient by itself to invalidate IMPLEMENTED. The R95 LocalMarket embedded-ID invariant remains a second known CONFIG-003 gate unless a separate proving follow-up has landed; PR \#173 itself does not repair that world-construction path.

Requested implementation action: reconcile authoritative implementation\_status.csv back from IMPLEMENTED to PARTIAL or CONTESTED according to repository evidence policy until the missing CONFIG-003 acceptance is merged and proved. Add executable RecipeDefinition validation for every Handoff/03 §16A bound with negative tests/useful diagnostics, then only re-promote after all remaining CONFIG-003 invariants are genuinely satisfied. Downstream REQ-CONFIG-004 and REQ-VISUALIZATION-004 must remain non-selectable while CONFIG-003 is not validly IMPLEMENTED. Posted the same gate correction on Issue \#175 as comment 5555061652\. Do not change CONFIG-004 ledger semantics, any economic formula/default, stock ownership, phase order, acceptance threshold or v1 scope.

STATUS: IMPLEMENTATION\_GATE\_REPAIR\_REQUESTED

2026-09-06 — CODE\_RUNTIME\_QA\_M1\_12 / HANDOFF-REPAIR-013 — PR \#177 genesis-record vocabulary  
REQ\_ID: REQ-CONFIG-004  
Observed: PR \#177 models seven GenesisRecord variants and adds \`FX\_POOL\_OPENING\`. The canonical section 20 interface still enumerated only MONEY\_ENDOWMENT, GOOD\_ENDOWMENT, POPULATION\_ENDOWMENT, CAPITAL\_ENDOWMENT, RESOURCE\_ENDOWMENT and BOND\_OPENING\_POSITION. At the same time, section 16A explicitly requires each FxPoolSeed cash side to be included once in WorldGenesisLedger money reconciliation, and section 20 requires actor/pool opening balances to reconcile to opening transaction money. The specification therefore required FX-pool opening stock to be represented but provided no record type for it.  
Finding and repair: this was a real representation contradiction exposed by implementation, not unauthorized feature expansion. Canonical Config and Handoff/03 now add \`FX\_POOL\_OPENING\` to GenesisRecord. One record represents one explicit FxPoolSeed cash side: \`currencyId\` is the side currency, \`amount\` is that side's opening cash, and \`sourceSeedKey\` identifies the owning FX-pool pair. It has no ActorRef because pool reserves are distinct from State/Clan wallets and must be counted exactly once. This matches PR \#177's representation on this point and introduces no new stock or FX behavior.  
Implementation guidance: retain the \`FX\_POOL\_OPENING\` variant and the separate-pool ownership semantics. Do not count the same pool cash again in an authority wallet. The upstream CONFIG-003 gate correction from CONSISTENCY\_SIMPLICITY\_REVIEW\_M1\_02 remains unresolved in authoritative implementation\_status.csv: RecipeDefinition validation and the LocalMarket embedded-ID invariant must still be repaired/re-proved before CONFIG-004 can validly advance from its dependency. This run does not waive that gate and does not re-count it as a new finding.  
No money quantity, reconciliation identity, FX rule, stock ownership, phase order, acceptance threshold or v1 scope changed.  
STATUS: RESOLVED — SPEC\_REPRESENTATION\_REPAIR

2026-09-06 — CODE\_RUNTIME\_QA\_M1\_13 / HANDOFF-REPAIR-014 — PR \#179 ProductionUnit genesis ownership  
REQ\_ID: REQ-CONFIG-004

Observed: current PR \#179 records each ProductionUnit opening wallet and input/output inventories as MONEY\_ENDOWMENT / GOOD\_ENDOWMENT with \`owner: { type: "Clan", clanId: "" as any }\`. Its own PR notes say ProductionUnit balances are attributed to the Clan owner. Canonical stock discipline, however, treats the ProductionUnit wallet and its typed inventories as stocks of the ProductionUnit itself; Clan/State ownership of the unit is an ownership relation, not relocation of those balances. The current GenesisRecord ActorRef vocabulary omitted ProductionUnit, which forced implementation toward a fabricated owner.

Finding and repair: this is a real specification-representation gap exposed by implementation. Canonical Config and Handoff/03 section 20 now state that MONEY\_ENDOWMENT, GOOD\_ENDOWMENT and CAPITAL\_ENDOWMENT identify the authoritative stock holder and ActorRef therefore includes \`ProductionUnit { productionUnitId }\`. ProductionUnit wallet/input/output/investment balances must be recorded against that ProductionUnit and never against its Clan/State owner. This preserves one-stock/one-owner and prevents double counting or false ownership in opening reconciliation.

Implementation guidance for PR \#179: extend ActorRef with ProductionUnitId; replace every fabricated Clan owner for ProductionUnit records with the actual productionUnitId already allocated in buildInitialWorld(); record input, output and investment inventories under that same ProductionUnit owner; likewise attribute installed capital through CAPITAL\_ENDOWMENT to the ProductionUnit when that record is emitted. Do not move these balances into Clan or State stocks. HANDOFF-REPAIR-013 remains valid for FX pools. The earlier CONFIG-003 RecipeDefinition-validation and LocalMarket embedded-ID gate debts remain outstanding and are not waived or re-counted by this run.

No stock amount, equity/public ownership relationship, production mechanic, reconciliation identity, phase order, acceptance threshold or v1 scope changed.  
STATUS: RESOLVED — SPEC\_REPRESENTATION\_REPAIR / IMPLEMENTATION\_REPAIR\_REQUIRED

2026-09-06 — CODE\_RUNTIME\_QA\_M1\_14 — PR \#179 reconciliation is validation-only

REQ\_ID: REQ-CONFIG-004

Observed: PR \#179's \`reconcileGenesisStocks()\` receives only \`WorldGenesisLedger\` plus config. It sums ledger records and succeeds whenever category totals are non-negative. It never reads the constructed tick-0 \`WorldState\` or an independently projected stock snapshot, so a missing or duplicated genesis record, or a mismatch between ledger entries and actual authoritative opening stocks, can still pass.

Finding: this is an implementation acceptance blocker, not a specification defect. Handoff/03 section 20 requires genesis source totals to reconcile to actual tick-0 authoritative stocks; section 24 invariants 12 and 18 require opening money and goods reconciliation to close. Non-negativity is useful validation but is not reconciliation, and \`residual \= total\` does not provide expected-versus-actual evidence.

Requested implementation action: keep REQ-CONFIG-004 PARTIAL. Make reconciliation compare expected totals from \`WorldGenesisLedger\` against actual tick-0 totals from authoritative stocks by currency, good, population, capital and resource category, within \`SimulationConfig.numeric.reconciliationRelativeTolerance\`, with diagnostics naming category/key/expected/actual/residual. Add negative tests that remove or duplicate one ledger record and/or perturb one actual opening stock and prove reconciliation fails. Posted the same blocker on PR \#179 as comment 5555926030\. This is separate from HANDOFF-REPAIR-014 ProductionUnit ActorRef ownership guidance; no specification or economic mechanism changes in this run.

STATUS: IMPLEMENTATION\_REPAIR\_REQUESTED

2026-09-06 — CODE\_RUNTIME\_QA\_M1\_15 — post-merge REQ-CONFIG-004 evidence-gate correction

REQ\_ID: REQ-CONFIG-004

Observed: PR \#179 is now merged as commit \`407cabeaa4ab7b91dc5d076168c6906df1c857c3\`, and authoritative \`docs/spec/implementation\_status.csv\` has promoted REQ-CONFIG-004 from PARTIAL to IMPLEMENTED. However, current \`master\` still contains the exact R99 blocker in \`src/simulation/genesisReconciliation.ts\`: \`reconcileGenesisStocks()\` receives only \`WorldGenesisLedger\` plus config, derives expected-looking totals solely from ledger records, and succeeds whenever those ledger totals are non-negative. It does not read \`WorldState\` or an independently projected tick-0 stock snapshot, so omitted/duplicated genesis records or divergent actual opening stocks can still pass.

Finding: the new IMPLEMENTED promotion is not supported by closing evidence. This is a post-merge implementation-evidence/gate defect, not a new specification defect and not a redesign of genesis accounting. PR \#179 remains useful merged partial evidence for the ledger schema/integration, but the canonical source-endowment → actual tick-0 reconciliation acceptance remains unproved on \`master\`.

Requested implementation action: downgrade authoritative REQ-CONFIG-004 to PARTIAL or CONTESTED until a follow-up merges the already-requested R99 repair: compare ledger-derived expected totals against independently projected actual tick-0 money by currency, goods by good, population, installed capital and physical resources within \`SimulationConfig.numeric.reconciliationRelativeTolerance\`; diagnostics must name category/key/expected/actual/residual; negative tests must prove omission/duplication of a ledger record and/or perturbation of an actual opening stock fails. Re-promote to IMPLEMENTED only after that evidence exists. Preserve \#179 as partial evidence rather than discarding it. Posted the same post-merge correction on PR \#179 as review 5123784641\.

The earlier CONFIG-003 RecipeDefinition-validation and LocalMarket embedded-ID gates remain separately unresolved in repository evidence and were not re-audited or re-counted in this bounded unit. No Drive specification, economic mechanism, stock amount, formula, phase order, acceptance threshold or v1 scope changed.

STATUS: POST\_MERGE\_IMPLEMENTATION\_EVIDENCE\_REPAIR\_REQUESTE  
2026-09-06 — CONSISTENCY\_SIMPLICITY\_REVIEW\_M1\_03 — M2 advanced through an invalid M1 gate  
REQ\_ID: REQ-CORE-004, REQ-CORE-005; upstream REQ-CONFIG-004  
Observed: authoritative docs/spec/implementation\_status.csv still marks REQ-CONFIG-004 IMPLEMENTED despite the unresolved post-merge reconciliation failure recorded in CODE\_RUNTIME\_QA\_M1\_15. The registry makes REQ-CORE-004 depend directly on REQ-CONFIG-004 and the handoff says a failed milestone gate blocks later promotion. Nevertheless Issue \#185 explicitly treated CONFIG-004 and the M1 prerequisite set as IMPLEMENTED, PR \#187 merged REQ-CORE-004, the ledger now records CORE-004 IMPLEMENTED, and Issue \#188 is already open to continue CORE-005 from that status.  
Finding: this is a distinct dependency-gate propagation defect, not a new genesis-accounting defect and not a reason to revert useful M2 code. Requirement-level implementation crossed from M1 into M2 because the evidence ledger supplied a false upstream closing state. Continuing CORE-005/006, M2 acceptance, or M2 visualization from this state would compound evidence that rests on an invalid prerequisite.  
Requested implementation action: preserve PR \#187 and its tests as useful merged CORE-004 evidence, but do not treat M2 as promotion-complete or select further M2 work while the M1 gate is unresolved. Mark Issue \#188 blocked/non-selectable and reconcile implementation\_status.csv so downstream selection cannot treat CORE-004 as an unqualified satisfied dependency until REQ-CONFIG-004 is validly IMPLEMENTED after real ledger-expected ↔ actual tick-0 reconciliation. If the ledger needs to represent this interim state, CONTESTED is preferable to an unqualified IMPLEMENTED claim while the required dependency/gate is invalid. Once upstream CONFIG-004 is repaired/re-proved, re-evaluate CORE-004 without discarding \#187 evidence, then resume CORE-005. Existing CONFIG-003 RecipeDefinition-validation and LocalMarket embedded-ID debts remain separate and are not re-counted here. Posted the same correction on Issue \#188 as comment 5556492237\.  
No specification requirement, economic mechanism, formula, stock ownership, phase order, acceptance threshold or v1 scope changed.  
STATUS: IMPLEMENTATION\_DEPENDENCY\_GATE\_REPAIR\_REQUESTED  
D

R102 — REQ-CORE-005 / PR \#190 — activation-boundary evidence is not yet sufficient

The current PR \#190 must not promote REQ-CORE-005 to IMPLEMENTED yet. The canonical acceptance is behavioral: tests must prove that an N+1 transition cannot take effect before its defined activation boundary. The current tests only construct transition values and assert arithmetic such as activateTick \> currentTick; no activation/filter/apply primitive is exercised. The deterministic-ordering test also does not order or activate transitions.

Minimal repair: keep REQ-CORE-005 PARTIAL, or do not add the implementation ledger row, until the bounded slice has a pure temporal activation gate that selects only transitions due for currentTick, retains future entries, and processes due entries in deterministic stable order. Add negative tests proving a transition queued at tick N leaves authoritative state unchanged before N+1, plus boundary tests at N+1. Do not add later economic policy, jurisdiction, or state-formation effects here.

Review evidence: PR \#190 review 5124060174 requests this change. The previously reported CONFIG-004/M1 gate remains independently unresolved; PR \#190 is useful partial code but does not make M2 selectable.

2026-09-06 — CODE\_RUNTIME\_QA\_M1\_17 — PR \#190 PARTIAL evidence correction contains one stale upstream-status claim  
REQ\_ID: REQ-CORE-005; upstream REQ-CONFIG-004

Observed: PR \#190 changed after R102. Head commit \`8d3134f1e215672c9e63dd58ecbf2e51f41d6992\` correctly changes the proposed REQ-CORE-005 implementation-evidence state from a false completion claim to \`PARTIAL\` and explicitly acknowledges that activation/filter/apply behavior and deterministic activation ordering are still missing. The code/tests remain unchanged on that behavioral acceptance gap, so this is an evidence-state correction rather than implementation completion.

Finding: the new PARTIAL ledger row contains one fresh evidence contradiction. It says upstream \`REQ-CONFIG-004\` is “marked CONTESTED per PR \#179 QA”, but neither current master nor PR \#190 changes the authoritative CONFIG-004 row from \`IMPLEMENTED\`. QA has disputed that completion state, but the ledger has not yet been corrected. Evidence prose must describe repository state, not the state it ought to have.

Requested implementation action: keep REQ-CORE-005 \`PARTIAL\`; correct the new evidence wording so it says CONFIG-004 completion is disputed/subject to the existing QA repair request unless and until a separate authoritative ledger change actually records a non-complete status. Do not fold the upstream CONFIG-004 repair into CORE-005 merely to make the sentence true. CORE-005 still requires the previously requested temporal activation gate and deterministic-order tests before promotion. Posted the same bounded follow-up on PR \#190 as review 5124222154\.

No specification requirement, economic mechanism, formula, stock ownership, phase order, acceptance threshold or v1 scope changed.  
STATUS: IMPLEMENTATION\_EVIDENCE\_TEXT\_REPAIR\_REQUESTED; CORE-005 PARTIAL IS CORRECT

2026-09-06 — CODE\_RUNTIME\_QA\_M1\_18 — PR \#193 MonetaryAuthority stock-location identity blocker  
REQ\_ID: REQ-CORE-006  
Observed: current PR \#193 introduces the M2 normalized MONEY / GOOD / PHYSICAL\_LOSS ledger projection. Its \`StockLocation\` declares \`ownerType: "MONETARY\_AUTHORITY"\`, but the shape has no \`monetaryAuthorityId\`; it only carries optional State, Clan, ProductionUnit and Region identifiers. The same interface says it must uniquely identify where a stock mutation occurs.  
Finding: this is a new implementation schema/identity blocker. The canonical baseline has multiple MonetaryAuthorities, so an authority-owned MONEY delta cannot identify which authoritative wallet changed; two different authorities collapse to the same owner kind. That fails REQ-CORE-006 acceptance requiring the authoritative owner/location on every normalized delta and weakens later causal/accounting diagnostics.  
Requested implementation action: keep REQ-CORE-006 unclosed. Add the concrete \`MonetaryAuthorityId\` to MONETARY\_AUTHORITY locations, preferably through a discriminated owner/location shape or an equivalent validated representation that requires the matching identifier for each owner kind. Add proof that two different authority locations remain distinct and that a MONETARY\_AUTHORITY location without its identifier is rejected or not constructible. Do not change monetary mechanics or broaden M2. Posted REQUEST\_CHANGES review 5124399790 on PR \#193 at head d4dc2cd7acfc35e09b503dfab33af0eb54992b02.  
The existing CONFIG-003 / CONFIG-004 and M1 dependency-gate debts remain separate and were not re-counted in this bounded unit. PR \#190 is now closed without merge, so it supplied no authoritative CORE-005 implementation evidence.  
No specification requirement, economic mechanism, formula, stock ownership rule, phase order, acceptance threshold or v1 scope changed.  
STATUS: IMPLEMENTATION\_REPAIR\_REQUESTED

2026-09-06 — CODE\_RUNTIME\_QA\_M1\_19 — PR \#193 PHYSICAL\_LOSS reconciliation blocker  
REQ\_ID: REQ-CORE-006  
Observed: PR \#193 still has the previously reported MonetaryAuthority StockLocation identity defect, and that head has not changed. Separately, its normalized accounting reconciler documents PHYSICAL\_LOSS as a one-sided negative physical-stock delta with no balancing goods credit, but then adds that delta to the ordinary GOOD residual and requires the total to be approximately zero. The accompanying test named \`accepts physical loss without balancing credit\` therefore expects a reconciliation failure with residual \-20.  
Finding: this is a distinct implementation accounting/conformance blocker. Handoff/01 M2 minimum accounting semantics and CORE-T17 explicitly permit an attributed PHYSICAL\_LOSS to be a negative physical delta with no balancing positive goods credit. A valid physical loss must not be classified as an unmatched transfer merely because it is one-sided.  
Requested implementation action: keep REQ-CORE-006 unclosed. Preserve PHYSICAL\_LOSS as explicit negative attribution, validate that its delta is finite and non-positive, and separate/recognize permitted attributed physical sinks when checking GOOD transfer reconciliation. Change the physical-loss acceptance test so a valid standalone attributed loss is accepted/reconciled; add a negative test rejecting a positive PHYSICAL\_LOSS; retain the synthetic unmatched ordinary GOOD-delta test as the deterministic mismatch proof with category/key/residual diagnostics. Do not add M3+ production/consumption mechanics or redesign the ledger. Posted REQUEST\_CHANGES review 5124500270 on PR \#193.  
The R104 MonetaryAuthority location-ID blocker and the older CONFIG-003/CONFIG-004 dependency-gate debts remain separately open and were not re-counted in this unit. No Drive specification, economic mechanism, formula, stock-ownership rule, phase order, acceptance threshold or v1 scope changed.  
STATUS: IMPLEMENTATION\_REPAIR\_REQUESTED  
2026-09-06 — CODE\_RUNTIME\_QA\_M1\_20 / HANDOFF-REPAIR-015 — PR \#205 RecipeDefinition zero-input bound  
REQ\_ID: REQ-CONFIG-003  
Observed: PR \#205 repairs the two known CONFIG-003 debts from Issue \#200, but its new validateRecipeDefinition() accepts a declared inputsPerBatch coefficient of exactly zero because it rejects only values \< 0\. Handoff/03 simultaneously said RecipeDefinition validation was unchanged from the owning Production contract while using the stale phrase “non-negative input quantities”; Production section 4 defines every declared inputsPerBatch coefficient as \> 0\. An empty input map remains valid for recipes with no material input.  
Finding and repair: this is a real cross-contract contradiction plus implementation acceptance blocker. Canonical Config and Handoff/03 now use the Production-owned meaning explicitly: every declared input coefficient is strictly positive; labor and startup capital remain non-negative. A zero declared input would be a meaningless named dependency and later creates a divide-by-zero/non-binding input bound. No production mechanic changed.  
Implementation guidance for PR \#205: change the declared-input validation from \< 0 to \<= 0 and add a negative/boundary test proving zero is rejected with useful RecipeDefinition diagnostics. Keep REQ-CONFIG-003 PARTIAL until the corrected validator and all Issue \#200 acceptance evidence are merged. This run does not broaden \#205 into unrelated DefinitionPack-reference cleanup.  
STATUS: SPEC\_CONSISTENCY\_REPAIRED / IMPLEMENTATION\_REPAIR\_REQUIRED

2026-09-06 — CODE\_RUNTIME\_QA\_M1\_21 — PR \#205 RecipeDefinition GoodId reference-validation blocker  
REQ\_ID: REQ-CONFIG-003  
Observed: PR \#205 head 1a6bc56a9ba685c371323ab9fc6ebc60eadc3323 correctly fixes the prior zero-input-coefficient defect and now rejects declared inputsPerBatch coefficients \<= 0\. However, validateDefinitionPack() constructs the set of DefinitionPack good IDs and passes it into validateRecipeDefinition(), but the validator never uses that set. A numerically valid recipe can therefore reference an unknown outputGoodId, an unknown inputsPerBatch key, or an unknown investmentGoodsPerCapitalUnit key and still pass validation.  
Finding: this is a distinct CONFIG-003 reference-integrity blocker, not a new specification defect. Handoff/03 world-gen validation requires reference validation before construction and explicitly requires unknown Good IDs to fail fast. The unused goodIds parameter also makes the incomplete implementation boundary mechanically visible.  
Requested implementation action: keep REQ-CONFIG-003 PARTIAL. Validate recipe outputGoodId and every GoodId key in inputsPerBatch and investmentGoodsPerCapitalUnit against definitionPack.goods, fail with diagnostics naming recipe/field/unknown ID, and add negative tests for missing output/input/investment GoodIds. Do not change recipe coefficients, production mechanics, economic behavior, defaults, phase order, or CONFIG-004 behavior. Submitted REQUEST\_CHANGES review 5124990579 on PR \#205 at the current head. The prior zero-coefficient repair is acknowledged as fixed and is not re-counted.  
STATUS: IMPLEMENTATION\_REPAIR\_REQUESTE

2026-09-06 — CODE\_RUNTIME\_QA\_M1\_22 — PR \#205 authoritative implementation ledger CSV is malformed  
REQ\_ID: REQ-CONFIG-003  
Observed: current PR \#205 head 38a4fd76af1bcd2dfa800f629c2eedce31ff15f6 now correctly validates RecipeDefinition outputGoodId, inputsPerBatch keys and investmentGoodsPerCapitalUnit keys against definitionPack.goods, so the R108 reference-integrity blocker is fixed and is not re-counted. However, the proposed authoritative docs/spec/implementation\_status.csv row for REQ-CONFIG-003 ends its EVIDENCE field with an extra quote after \`commit 9a5884c.\`. The doubled quote escapes a literal quote inside the quoted CSV field instead of closing it, leaving the field unterminated and causing the following REQ-CONFIG-004 record to be consumed or misparsed. The generated IMPLEMENTATION\_STATUS.md diff already shows the symptom: a malformed raw CONFIG-004 line and a separate NOT\_STARTED rendering.  
Finding: this is a distinct implementation-evidence integrity blocker. implementation\_status.csv is the authoritative evidence ledger, so REQ-CONFIG-003 must not be promoted through a syntactically invalid ledger even though the runtime repair itself now addresses R108.  
Requested implementation action: remove the extra quote, regenerate rendered IMPLEMENTATION\_STATUS.md from the valid ledger, and run/add the ledger parser/generation validation proving exactly six columns per record and exactly one REQ-CONFIG-004 row. Keep REQ-CONFIG-003 PARTIAL until a valid authoritative row is merged. Submitted REQUEST\_CHANGES review 5125109958 on PR \#205 at head 38a4fd76af1bcd2dfa800f629c2eedce31ff15f6. No specification, recipe semantics, economic mechanism, formula, default, stock ownership, phase order, acceptance threshold or v1 scope changed.  
STATUS: IMPLEMENTATION\_EVIDENCE\_REPAIR\_REQUESTED  
D

2026-09-06 — CODE\_RUNTIME\_QA\_M1\_23 — replacement PR \#215 regresses GoodId validation and prematurely promotes evidence  
REQ\_ID: REQ-CONFIG-003  
Observed: PR \#205 closed without merge. Replacement PR \#215 is open at head 2693d81645ef8888ea7cf44151002ec0d7658bb2, while authoritative master implementation\_status.csv correctly remains REQ-CONFIG-003 PARTIAL. On the replacement head, validateDefinitionPackContent() iterates recipes and calls validateRecipeDefinition(recipe), but does not validate recipe GoodId references against definitionPack.goods. As a result, an unknown outputGoodId, inputsPerBatch key, or investmentGoodsPerCapitalUnit key can still pass. This regresses the reference-integrity repair already requested in CODE\_RUNTIME\_QA\_M1\_21 and corrected on the later \#205 head.  
Finding: PR \#215 also proposes an authoritative implementation\_status.csv row that already marks REQ-CONFIG-003 IMPLEMENTED and states that five merged slices complete the requirement, including PR \#215, even though \#215 is still open and MERGE\_COMMIT is blank. IMPLEMENTED is closing evidence and must not be asserted before the proving pull request is actually merged.  
Requested implementation action: add fail-fast DefinitionPack GoodId reference validation for recipe outputGoodId, every inputsPerBatch key, and every investmentGoodsPerCapitalUnit key, with field-specific negative tests. Keep REQ-CONFIG-003 PARTIAL in the proposed ledger until the repair PR actually merges; only the merged change may promote the row to IMPLEMENTED and describe PR \#215 as merged evidence. No CONFIG-004/genesis reconciliation work belongs in this slice. Submitted REQUEST\_CHANGES review 5125235805 on PR \#215 at the current head.  
No Drive specification, recipe coefficient, production mechanic, economic formula, default, stock ownership, phase order, acceptance threshold, or v1 scope changed.  
STATUS: IMPLEMENTATION\_REPAIR\_REQUESTED

\#\# 2026-09-06 — R111 / CODE\_RUNTIME\_QA\_M1\_24 — PR \#215 Issue \#200 closure/evidence integrity

Reviewed the changed PR \#215 head \`4f51be899ccdcd737178597cc3235129e1eec606\`. The previous GoodId-reference blocker is repaired and the proposed REQ-CONFIG-003 ledger status is now PARTIAL rather than prematurely IMPLEMENTED.

Two acceptance/evidence defects remain on this head. First, PR \#215 still declares \`Closes \#200\` while Issue \#200 explicitly requires both the RecipeDefinition validation repair and the LocalMarket persistent-ID/invariant repair. The PR body and ledger explicitly leave the LocalMarket half as remaining QA debt. Merging as written would auto-close the only tracked CONFIG-003 repair issue while the requirement knowingly remains PARTIAL. Please either complete the LocalMarket half in this PR, or remove the auto-close and ensure a replacement ready repair issue exists before merge; the preferred bounded repair is to finish Issue \#200 as scoped.

Second, the proposed authoritative \`docs/spec/implementation\_status.csv\` still ends the REQ-CONFIG-003 evidence field with an extra quote (\`PR \#215 not yet merged.""\`). This malformed CSV record can consume/misparse the following CONFIG-004 row. Please remove the stray quote, regenerate the rendered status from the valid CSV, and run the repository status checker/parser proving exactly six columns per record and exactly one CONFIG-004 row.

Submitted REQUEST\_CHANGES review 5125384496 on PR \#215 for head \`4f51be899ccdcd737178597cc3235129e1eec606\`. Keep REQ-CONFIG-003 PARTIAL until the complete Issue \#200 repair is merged and proved. No CONFIG-004/genesis change or economic redesign is requested.

2026-09-06 — R112 / CODE\_RUNTIME\_QA\_M1\_25 — PR \#218 replacement-head GoodId/evidence regression  
REQ\_ID: REQ-CONFIG-003

Reviewed replacement PR \#218 at head \`401827fcf46b4a4d13c1c32ff93cef171a7b2e36\`. It correctly repairs the LocalMarket persistent-ID half of Issue \#200: the allocated MarketId is stored in LocalMarketState and initialization invariants check map key \=== market.marketId. The prior \#215 Issue-closure concern is therefore no longer the blocker.

New blocker on this replacement head: validateDefinitionPack() again validates only RecipeDefinition numeric bounds and never checks recipe GoodId references against definitionPack.goods. Its own positive fixture has goods: {} while referencing good-1/good-2/good-3 and is expected to pass. This regresses the GoodId reference-integrity repair previously reached on the later \#205/\#215 heads and violates CONFIG-003 fail-fast reference validation. Required minimal repair: validate outputGoodId, every inputsPerBatch key and every investmentGoodsPerCapitalUnit key against definitionPack.goods; add field-specific negative tests; make the positive fixture contain the referenced goods.

Evidence-state blocker on the same head: the proposed authoritative implementation\_status.csv sets REQ-CONFIG-003 \= IMPLEMENTED while PR \#218 is still open and MERGE\_COMMIT is blank. Keep the row PARTIAL until the proving repair actually merges; only post-merge reconciliation may promote it and record the real merge commit. Preserve the useful LocalMarket and numeric-bound repairs. No CONFIG-004 behavior or economic semantics change is requested.

Submitted REQUEST\_CHANGES review 5125539918 on PR \#218 at head \`401827fcf46b4a4d13c1c32ff93cef171a7b2e36\`.  
STATUS: IMPLEMENTATION\_REPAIR\_REQUESTED

2026-09-06 — R114 / CODE\_RUNTIME\_QA\_M1\_27 — PR \#218 current-head evidence-state integrity  
REQ\_ID: REQ-CONFIG-003

Reviewed PR \#218 at current head \`7a283b5922c243c201654f957ea3302d512f0f78\`. The previous GoodId-reference regression is fixed: RecipeDefinition validation now checks outputGoodId, inputsPerBatch keys, and investmentGoodsPerCapitalUnit keys against DefinitionPack.goods, while the LocalMarket key/value persistent-ID repair remains present.

The remaining blocker is authoritative implementation evidence. The proposed \`docs/spec/implementation\_status.csv\` still sets REQ-CONFIG-003 to \`IMPLEMENTED\` while PR \#218 is open and MERGE\_COMMIT is blank. Under the evidence protocol, IMPLEMENTED is closing evidence and cannot be asserted before merge. The row's evidence text is also stale relative to this head: it describes 11 RecipeDefinition tests / 235 TypeScript tests and does not name the three GoodId-reference tests, while the current PR reports 238 TypeScript tests.

Submitted REQUEST\_CHANGES review 5125872065 on the current head. Minimal repair: keep REQ-CONFIG-003 PARTIAL before merge, update the evidence text to name the current proving reference-validation tests and verified counts, then promote only after merge with the actual merge commit SHA. No specification, recipe semantics, economic mechanism, formula, default, stock ownership, phase order, acceptance threshold or v1 scope changed.

STATUS: IMPLEMENTATION\_EVIDENCE\_REPAIR\_REQUESTED

2026-09-06 — R115 / CONSISTENCY\_SIMPLICITY\_REVIEW\_M2\_02 — REQ-CORE-006 Issue \#192 remains selectable through open M1 gate

REQ\_ID: REQ-CORE-006; upstream REQ-CONFIG-003 / REQ-CONFIG-004 / REQ-VISUALIZATION-004

Observed: authoritative implementation\_status.csv correctly has REQ-CONFIG-003 \= PARTIAL and REQ-CONFIG-004 \= PARTIAL while repair PR \#218 / Issue \#200 and PR \#208 / Issue \#201 remain open. Issue \#188 / REQ-CORE-005 is now status:blocked, but Issue \#192 / REQ-CORE-006 is still status:ready and says its dependencies are satisfied from REQ-CORE-004 \+ REQ-CONFIG-001 alone.

Finding: this is a distinct implementation queue/evidence-gate defect. The registry makes REQ-CORE-004 depend on CONFIG-004 and the handoff says a failed milestone gate blocks later promotion. PR \#187 / CORE-004 is useful merged evidence, but it cannot make M2 selectable while M1 remains open. This is not a new accounting/runtime defect and does not invalidate useful M2 code already produced.

Action: posted correction comment 5560750275 on Issue \#192. Treat it as blocked/non-selectable until CONFIG-003 repair merges and is evidenced, CONFIG-004 repair merges and is evidenced after that dependency, and the remaining M1 gate requirement REQ-VISUALIZATION-004 is accepted. Preserve already-open M2 work; do not claim M2 executable from the local depends-on row alone. No requirement meaning or economic mechanism changed.

STATUS: IMPLEMENTATION\_DEPENDENCY\_GATE\_REPAIR\_REQUESTED

2026-09-06 — R116 / CODE\_RUNTIME\_QA\_M1\_28 — PR \#208 counts bond principal as money  
REQ\_ID: REQ-CONFIG-004

Observed: PR \#218 / Issue \#200 is now closed without merge, so this bounded unit followed the queued fallback to open PR \#208 / Issue \#201 at head 3e9898073c586b63e8fe57587881d20ce8d440f2. PR \#208 correctly changes genesis reconciliation from ledger-only non-negativity to ledger-expected versus actual tick-0 stock comparison. However, its expected-money switch groups BOND\_OPENING\_POSITION with MONEY\_ENDOWMENT and FX\_POOL\_OPENING and adds bond amount to expected money by currency.

Finding: this is an accounting-category blocker. Canonical Handoff/03 keeps opening money reconciliation and bond accounting separate: each currency's opening money diagnostic covers opening balances under the money-supply contract, while bond holdings have their own invariant that holdings sum to principal. A bond principal/position is a debt claim, not an additional currency stock. Because baseline M1 bonds are intentionally omitted/empty, the current baseline positive test does not exercise this branch, so the defect is dormant rather than proved safe.

Requested implementation action: exclude BOND\_OPENING\_POSITION from expected money totals. MONEY reconciliation should count actual money stocks only, including explicit FX-pool cash exactly once. If bond opening records remain in the genesis vocabulary, validate/reconcile bond principal and holdings separately at their owning contract boundary, but never add bond principal/notional to currency supply. Add a focused test with a nonzero bond-opening record and unchanged wallets proving the bond record does not change the MONEY residual; if bond-specific reconciliation is active here, prove that invariant separately. Keep REQ-CONFIG-004 PARTIAL until the corrected implementation merges. Submitted REQUEST\_CHANGES review 5126147596 on PR \#208.

No Drive specification, economic mechanism, debt semantics, money-creation rule, formula, default, stock ownership, phase order, acceptance threshold or v1 scope changed.  
STATUS: IMPLEMENTATION\_REPAIR\_REQUESTED

2026-09-06 — R117 / CODE\_RUNTIME\_QA\_M1\_29 — PR \#208 authoritative CSV row is not six-column-safe  
REQ\_ID: REQ-CONFIG-004

Reviewed PR \#208 at current head \`28d7a92c734921bf52ca0b6a1a3bcb7c7393e71d\`. The prior bond-as-money accounting blocker is repaired: \`BOND\_OPENING\_POSITION\` is excluded from money reconciliation and a nonzero-bond regression is added.

New blocker: the proposed authoritative \`docs/spec/implementation\_status.csv\` writes the REQ-CONFIG-004 EVIDENCE field without CSV quotes even though the evidence contains many commas. A standards-compliant CSV parser therefore splits the record into more than the required six columns (\`REQ\_ID, STATUS, ISSUE, PR, MERGE\_COMMIT, EVIDENCE\`). The rendered Markdown is already visibly truncated at the first pipe/comma-rich evidence fragment, but the defect is in the CSV authority itself, not in presentation.

Submitted REQUEST\_CHANGES review 5126300624 on PR \#208. Minimal repair: quote/escape the complete EVIDENCE field as valid CSV, regenerate the presentation Markdown from the corrected ledger, and prove every ledger record parses to exactly six columns with exactly one REQ-CONFIG-004 row. Keep REQ-CONFIG-004 PARTIAL until its CONFIG-003 dependency is actually IMPLEMENTED. No specification, accounting identity, economic mechanism, formula, default, stock ownership, phase order, acceptance threshold or v1 scope changed.

STATUS: IMPLEMENTATION\_EVIDENCE\_REPAIR\_REQUESTED

2026-09-06 — R118 / CODE\_RUNTIME\_QA\_M1\_30 — REQ-CONFIG-004 / PR \#208

Current head \`28d7a92c734921bf52ca0b6a1a3bcb7c7393e71d\` keeps the substantive genesis reconciliation and bond-position repair correct, but the proposed authoritative \`docs/spec/implementation\_status.csv\` still writes the REQ-CONFIG-004 EVIDENCE field without CSV quoting although it contains commas. This makes the row parse into more than the required six columns. Submitted REQUEST\_CHANGES review 5126460588 on the current head requesting the minimal evidence-only repair: quote/escape the full EVIDENCE field, regenerate \`IMPLEMENTATION\_STATUS.md\`, and prove parser-level six-column integrity plus one unique CONFIG-004 row. Keep REQ-CONFIG-004 PARTIAL until CONFIG-003 is IMPLEMENTED. No specification or economic mechanism changed.

2026-09-06 — R119 / CODE\_RUNTIME\_QA\_M1\_31 — PR \#223 replacement CONFIG-003 reference/evidence regression  
REQ\_ID: REQ-CONFIG-003  
PR \#208 remains unchanged at head \`28d7a92c734921bf52ca0b6a1a3bcb7c7393e71d\`, so this bounded unit followed the queued fallback to replacement PR \#223 / Issue \#200 at head \`de9b4c538d74f8c5469fb5e01055b0a1840bd9b3\`.

The LocalMarket persistent-ID repair and the numeric RecipeDefinition bounds are correct on this head. However, \`validateDefinitionPackRecipes()\` validates only numeric bounds and never checks \`recipe.outputGoodId\`, the keys of \`recipe.inputsPerBatch\`, or the keys of \`recipe.investmentGoodsPerCapitalUnit\` against \`definitionPack.goods\`. Handoff/03 sections 19 and 21 require reference validation before construction and fail-fast rejection of unknown Good IDs. Minimal repair: validate all three RecipeDefinition GoodId surfaces with field-specific diagnostics and negative tests.

The proposed authoritative \`docs/spec/implementation\_status.csv\` also sets REQ-CONFIG-003 \= IMPLEMENTED while PR \#223 is still open and MERGE\_COMMIT is blank. Its new comma-rich EVIDENCE field is unquoted, so it is not safe under the required six-column CSV contract. Keep REQ-CONFIG-003 PARTIAL until the proving repair actually merges; quote/escape the evidence field, validate the ledger with a real CSV parser, regenerate the rendered status, and only then promote post-merge with the actual merge SHA.

Submitted REQUEST\_CHANGES review 5126600156 on PR \#223 at head \`de9b4c538d74f8c5469fb5e01055b0a1840bd9b3\`. No Drive specification, recipe semantics, economic mechanism, formula, default, stock ownership, phase order, acceptance threshold, or v1 scope changed.  
STATUS: IMPLEMENTATION\_REPAIR\_REQUESTED  
2026-09-07 — R120 / CODE\_RUNTIME\_QA\_M1\_32 — PR \#223 current-head CSV integrity  
REQ\_ID: REQ-CONFIG-003  
Reviewed changed PR \#223 head \`e17e2c649f9c5c6f1963260a2bb4f0356445e995\`. The runtime repair now correctly covers LocalMarket key/value MarketId identity, RecipeDefinition numeric bounds, and GoodId reference validation.  
Remaining blocker: the proposed authoritative \`docs/spec/implementation\_status.csv\` keeps CONFIG-003 PARTIAL, which is the correct pre-merge state, but its EVIDENCE field still ends \`...when merged.""\`. The doubled quote escapes a literal quote but leaves the quoted CSV field without a closing quote, so the following CONFIG-004 record can be consumed or misparsed. The row also reports 244/244 TypeScript tests while the current PR body reports 247/247 and 26 RecipeDefinition tests.  
Submitted REQUEST\_CHANGES review 5126750394\. Minimal repair: make the CSV valid and six-column-safe, regenerate \`IMPLEMENTATION\_STATUS.md\`, prove with a real parser that every record has exactly six columns and that exactly one CONFIG-003 and one CONFIG-004 row exist, refresh the evidence counts, keep CONFIG-003 PARTIAL until merge, and only then promote with the real merge SHA.  
No Drive specification or economic behavior changed.  
STATUS: IMPLEMENTATION\_EVIDENCE\_REPAIR\_REQUESTED

2026-09-07 — R121 / CODE\_RUNTIME\_QA\_M1\_33 — PR \#223 approved after evidence repair  
REQ\_ID: REQ-CONFIG-003  
Reviewed changed PR \#223 head \`a1c6a1761edd710dd5a8a15ccc55bee8cfc93cb0\`. The previously reported runtime and evidence blockers are resolved on this head: LocalMarket stores the allocated persistent MarketId and initialization enforces registry key \=== market.marketId; RecipeDefinition validation covers the required numeric bounds and rejects unknown output/input/investment GoodId references; the proposed authoritative \`docs/spec/implementation\_status.csv\` keeps REQ-CONFIG-003 PARTIAL before merge, has a blank MERGE\_COMMIT, is validly quoted as a six-column record, and reports the current 247/247 TypeScript and 45/45 .NET evidence. The PR also reports \`python scripts/implementation\_status.py \--check\` green.  
Submitted APPROVE review 5126874677\. No remaining REQ-CONFIG-003 acceptance blocker was found in this bounded head review. Promote the authoritative row to IMPLEMENTED only after merge and record the actual merge SHA. No specification, recipe semantics, economic mechanism, formula, default, stock ownership, phase order, acceptance threshold, or v1 scope changed.  
STATUS: QA\_APPROVED\_PENDING\_MERG

2026-09-07 — R122 / CODE\_RUNTIME\_QA\_M1\_34 — REQ-VISUALIZATION-004 merged evidence row lacks merge SHA  
REQ\_ID: REQ-VISUALIZATION-004

PR \#223 remains open and unchanged at the previously approved head \`a1c6a1761edd710dd5a8a15ccc55bee8cfc93cb0\`; PR \#208 is likewise unchanged. Following the queued fallback, this bounded unit reviewed the M1 Preview acceptance/evidence state.

The M1 Preview implementation itself is merged and acceptance-valid on PR \#220: GitHub reports merge commit \`f199c8677e99256c4b9ca46d68772b80ef7aa1b3\`. However, authoritative \`docs/spec/implementation\_status.csv\` marks REQ-VISUALIZATION-004 \= IMPLEMENTED for Issue \#160 / PR \#220 while leaving MERGE\_COMMIT blank. Under the evidence protocol, IMPLEMENTED is closing evidence and should carry the actual merged commit rather than an empty merge field.

Created ready high-priority bug Issue \#236 with the smallest evidence-only repair: record the actual PR \#220 merge SHA in the unique six-column REQ-VISUALIZATION-004 ledger row, preserve the existing IMPLEMENTED status and proving M1 Preview evidence, regenerate presentation Markdown, and pass the repository status checker. No UI behavior, simulation behavior, specification, mirror content, or economic mechanism change is requested.

STATUS: IMPLEMENTATION\_EVIDENCE\_REPAIR\_REQUESTED  
E  
2026-09-07 — R123 / CODE\_RUNTIME\_QA\_M1\_35 — current PR \#223 head re-approved; pre-merge PARTIAL is canonical  
REQ\_ID: REQ-CONFIG-003  
PR \#223 remains open but advanced to head \`455cacd2c3b466944f7de6ea918fc723acb52911\`, which superseded/dismissed the earlier QA approval. Rechecked the current head: LocalMarket persistent-ID identity/invariant repair remains intact; RecipeDefinition numeric bounds and GoodId reference validation remain complete; the proposed authoritative \`docs/spec/implementation\_status.csv\` row remains validly quoted, \`PARTIAL\`, with blank \`MERGE\_COMMIT\`; CI and mergeability are green.  
A standing ACCEPTOR review asks this still-open PR to set REQ-CONFIG-003 to \`IMPLEMENTED\` before merge. That request conflicts with the canonical evidence protocol already recorded in Drive and the repository feedback channel: IMPLEMENTED is closing evidence and requires an actually merged proving PR; while the PR is open, PARTIAL with blank merge SHA is the truthful state. Do not regress the ledger to premature IMPLEMENTED merely to satisfy that review. After PR \#223 actually merges, promote CONFIG-003 to IMPLEMENTED with the real merge SHA and current proving evidence.  
Submitted APPROVE review 5127246998 against head \`455cacd2c3b466944f7de6ea918fc723acb52911\`.  
No specification, recipe semantics, economic mechanism, formula, default, stock ownership, phase order, acceptance threshold, or v1 scope changed.  
STATUS: QA\_APPROVED\_PENDING\_MERGE / IMPLEMENTATION\_PROCESS\_CONFLICT\_NOTED

2026-09-08 — VISUALIZATION\_CHART\_SELECTION\_LEGENDS\_QA\_01 — REQ-VISUALIZATION-001

Found one implementation-facing chart-selection ambiguity in the mature visualization contract. Several State core-chart bullets group metrics with incompatible dimensions — population stock with births/deaths/net-migration flows, CPI level with inflation/contribution rates, and employment with real wage. Without an explicit plotting rule, an implementer would have to invent whether to use a shared axis, dual axes, normalized indices or separate panels.

Resolved with the smallest presentation-contract clarification in both the canonical Visualization working copy and Handoff/13. A core-chart bullet is now explicitly a topic group, not permission to overlay unlike units. One multi-series plot is valid only when series share a compatible unit and time basis; otherwise use aligned small multiples on a shared time axis. Do not normalize unlike stocks/flows/rates/index/currency values into one index unless that normalized series has its own canonical MetricDefinition. Dual y-axes remain a last resort and must be unmistakably labeled. The existing legend, unit, tooltip, accessibility and chart-density requirements remain unchanged.

No economic mechanic, metric formula, accounting identity, phase order, acceptance threshold or v1 scope changed. No new implementation-package file was added, so no mirror-allowlist request is required.

STATUS: RESOLVED — VISUALIZATION\_CONTRACT\_CLARIFIE  
2026-09-08 — VISUALIZATION\_REPLAY\_STEP\_QA\_01 — REQ-VISUALIZATION-001  
Found and resolved one implementation-facing replay ambiguity. HistoryRetentionMetadata explicitly permits disjoint aggregateTickRanges, while the timeline contract required a ±1 tick control without defining behavior when the exact adjacent tick has been evicted/downsampled but a farther tick remains retained. Canonical Visualization and Handoff/13 now define ±1 as an exact T-1/T+1 action. If that exact aggregate tick is unavailable, the corresponding direction is disabled with a concise unavailable explanation; it must not silently jump across the retention gap. The existing scrubber remains the explicit way to choose another retained tick.  
Added visualization acceptance test 48 covering a retained T with an unavailable adjacent tick and a farther retained tick. The test requires the ±1 action to remain disabled rather than selecting the farther snapshot. This is consistent with the existing no-silent-substitution rules for compare baselines, deep links and retention invalidation.  
No economic mechanic, SimulationOutput ownership rule, retention range meaning, metric definition, phase order, acceptance budget or v1 scope changed. No new implementation-package file was added, so no mirror-allowlist request is required.  
STATUS: RESOLVED — VISUALIZATION\_REPLAY\_CONTRACT\_CLARIFIED  
2026-09-08 — R173 / CODE\_RUNTIME\_QA\_M1\_70 / HANDOFF-REPAIR-016 — PR \#324 MonetaryAuthority genesis-owner scope

Current PR \#324 head \`e1420d33e316572ac03825261ba84e9093488f91\` fixes the R172 starting-cash regression: MonetaryAuthority wallets are preserved and projected as owner-bound MONEY\_ENDOWMENT records, separately from FX\_POOL\_OPENING reserves. That direction matches one-stock/one-owner accounting.

The implementation exposed a real representation gap in Handoff/03 section 20: MonetaryAuthoritySeed.wallet is a canonical actor-owned money stock, but GenesisRecord.owner previously had no explicit MonetaryAuthority owner form. Drive authority is now repaired in canonical Config and Handoff/03: the genesis owner-reference vocabulary supports MonetaryAuthority { authorityId: MonetaryAuthorityId }; authority wallets reconcile by authority \+ currency; FX\_POOL\_OPENING remains ownerless and distinct from every actor wallet.

Important scope boundary: this is a genesis-accounting reference extension only. It does not authorize MonetaryAuthority as a MarketIntent, MarketAllocation, ordinary EconomicTransaction, or other actor role. Current PR \#324 widens the shared ActorRef imported by marketIntent.ts and marketClearing.ts and then adds unknown actor fallbacks. Please use a genesis-specific owner-reference type (for example GenesisOwnerRef) or equivalent narrowing so the M3 market/transaction actor surface remains unchanged and exhaustive while genesis reconciliation retains monetaryAuthorityId.

Also refresh the PR body/tested revision: it still describes the earlier wallet-clearing approach and stale revision even though the current head preserves authority wallets. Keep REQ-CONFIG-004 PARTIAL while \#324 is open; after merge, record the actual merge SHA and current proving evidence. No new implementation-package file was added, so no mirror allowlist request is needed.

STATUS: SPEC\_REPRESENTATION\_REPAIRED / IMPLEMENTATION\_REPAIR\_REQUIRED

2026-09-10 — OWNER-M3-REPRESENTATION-001 — mandatory M3 presentation package

Owner directive: representation is now a hard M3 completion surface, not optional polish. M3 has nine permanent requirements. REQ-VISUALIZATION-006, REQ-VISUALIZATION-007 and REQ-VISUALIZATION-008 are P0/READY specification rows and together account for 3/9 \= 33.3% of M3 requirement-sized work.

1\. REQ-VISUALIZATION-006 is strengthened. The M3 Pages deliverable must be a polished consolidated LocalMarket experience, not another text-only milestone card. Show a legible price/traded-quantity trend, at least one current-tick market-balance or settlement visual, canonical headline metrics (price, traded quantity, realized shortageRate/surplusRate, seller-net, buyer-gross, collected consumption tax), plain-English explanation, responsive/narrow behavior, units/labels/tooltips where applicable, accessible exact values and explicit loading/empty/error states. Preserve the one-way static boundary; do not mutate WorldState or pull the M11 Worker/SimulationOutput architecture forward.

2\. REQ-VISUALIZATION-007 is new and independently executable now. Refresh the repository root README and directly linked public project text so it accurately describes the canonical TypeScript runtime, current M3 capabilities, Pages experience, build/run/test commands and migration state. The retained C\# toy must be described as legacy/reference-oracle behavior, not the current target architecture.

3\. REQ-VISUALIZATION-008 is new and independently executable now. Publish at least two concise public explainers, linked from README or Pages: one covering local-market price formation/clearing/shortage-surplus, and one covering settlement/tax/reconciliation/telemetry and how to read the M3 visuals. Use simple canonical English; do not invent mechanics or marketing claims.

M3 may not close until all three rows are IMPLEMENTED with truthful evidence. REQ-VISUALIZATION-006 still respects its telemetry/acceptance dependencies; 007 and 008 do not need to wait for those repairs and should be scheduled actively alongside them. No new implementation-package file is introduced by this specification update, so no mirror allowlist addition is requested.  
2026-09-10 — R200 / REQ-VISUALIZATION-007 — response to repository registry feedback

The repository feedback on PR \#364 correctly reports what its current mirror can see, but the source-of-truth answer is unambiguous: \`REQ-VISUALIZATION-007\` exists and is a permanent P0/READY M3 requirement. It was added together with \`REQ-VISUALIZATION-008\` by \`OWNER-M3-REPRESENTATION-001\`; Drive \`REQUIREMENTS\_REGISTRY.csv\`, Handoff/11 and this file already carry that owner revision. Do not renumber, substitute, or retire the identifier merely because the repository mirror is behind.

The current repository mirror is one semantic Drive revision behind \`OWNER-M3-REPRESENTATION-001\`. Under the established synchronization protocol, one missing semantic revision is ordinary lag; the pipeline is diagnosed as stalled only when two or more authored semantic revisions are absent. Therefore this is not yet a stalled-sync report and no mirror-allowlist action is required: no new implementation-package file was added by the owner revision.

Implementation consequence: PR \#364 may remain mechanically blocked until the synchronized registry reaches the repository. Do not manufacture a pre-registry ledger workaround. Once the registry revision is visible, evidence for REQ-VISUALIZATION-007 must still follow the normal ledger protocol and reflect actual merged proof rather than using the stale mirror as specification authority.

No requirement meaning, economic mechanic, accounting identity, phase order, or v1 scope changed in this response  
2026-09-10 — R201 / M3-REPRESENTATION-ACCEPTANCE-001 — REQ-VISUALIZATION-007/008 registry acceptance repair  
PR \#365's machine-generated mirror head now contains OWNER-M3-REPRESENTATION-001 and both permanent representation rows, so the prior one-revision lag is actively synchronizing and is not stalled. While verifying that snapshot, QA found that the source Drive REQUIREMENTS\_REGISTRY itself had blank ACCEPTANCE cells for REQ-VISUALIZATION-007 and REQ-VISUALIZATION-008. This was a specification navigation/verification defect, not a mirror defect.  
Drive REQUIREMENTS\_REGISTRY now carries explicit closing criteria for both rows. REQ-VISUALIZATION-007 requires truthful current README/public docs, accurate canonical TypeScript/legacy C\#/Pages/milestone/build-test-run wording, and no premature completion claims. REQ-VISUALIZATION-008 requires two reachable public explainers covering the canonical local-market and settlement/tax/reconciliation/telemetry semantics with correct timing, units and economic-state-versus-telemetry boundaries.  
No new implementation-package file was added, so no mirror allowlist request is required. Do not patch PR \#365 or docs/spec/mirror manually; the next synchronization should carry M3-REPRESENTATION-ACCEPTANCE-001. Until then, absence of these two acceptance strings from the repository mirror is expected synchronization lag. No economic mechanic, accounting identity, phase order, milestone membership or v1 scope changed.  
2026-09-10 — R210 / CONSISTENCY\_SIMPLICITY\_REVIEW\_M3\_05 — MASTER-INDEX-M3-REPRESENTATION-001  
Cross-document M3 review found a precedence contradiction: Handoff/00 is the highest-precedence implementation index, but section 7 still stated only the baseline \>=5% Pages-preview rule and described M3 only as the goods-for-money loop. PROJECT\_MANIFEST, EXECUTION\_ORDER and Handoff/11 already carry OWNER-M3-REPRESENTATION-001: nine M3 rows, \>=30% representation, mandatory REQ-VISUALIZATION-006/007/008, with Pages \+ README/public text \+ two explainers.  
Resolved in Drive by updating Handoff/00 section 7 and its M3 execution line to match the owner override. M3 remains 3/9 \= 33.3% representation and cannot close until all nine M3 rows, including 006/007/008, are IMPLEMENTED. This is a precedence/navigation repair only; no market formula, accounting identity, phase order, runtime architecture, or v1 scope changed.  
No new implementation-package file was added, so no mirror allowlist change is requested. Let the normal synchronization workflow update docs/spec/mirror; do not patch the mirror directly.  
STATUS: RESOLVED — SPEC\_PRECEDENCE\_REPAIRED  
2026-09-10 — R215 / NAV-M4-001 — M4 pre-indexed  
M4 is now indexed in the authoritative Drive registry as fifteen permanent READY requirements: REQ-CONFIG-006..007, REQ-PRODUCTION-001..008, REQ-POPULATION-001..003, REQ-ACCEPTANCE-005 and REQ-VISUALIZATION-009. This is future-queue preparation only: milestone order still blocks M4 selection until all nine M3 rows are IMPLEMENTED.

The rows are intentionally narrower than a single composite M4 item. They separate configuration, ProductionUnit state/planning, household demand/labor supply, labor allocation/wages, wage settlement, production/extraction, consumption/spoilage, investment/capital, lifecycle, orchestrator integration, golden acceptance and Pages preview. M4 remains one-region/local-only and does not pull M5 trade/FX, M6 fiscal/Clan dynamics or M8 demography/migration forward.

REQ-VISUALIZATION-009 provides 1/15 \= 6.7% user-visible Pages work, satisfying the baseline \>=5% rule. No new implementation-package file was added, so no mirror allowlist request is required. Let normal synchronization carry REQUIREMENTS\_REGISTRY.csv, EXECUTION\_ORDER.md, SPEC\_CHANGELOG.md, ANSWERS\_TO\_IMPLEMENTER.md and Handoff/00; do not patch docs/spec/mirror directly.

STATUS: M4 INDEXED / READY-BUT-MILESTONE-BLOCKE

2026-09-10 — R216 / CONSISTENCY\_SIMPLICITY\_REVIEW\_M3\_M4\_01 — HANDOFF-REPAIR-M4-001  
M4 indexing exposed one executable-boundary contradiction. REQ-PRODUCTION-004 and Handoff/05 require Phase-5 wage withholding, collection efficiency and minimum-wage/legal reads, but the full fiscal/law subsystem is not implemented until M6. Without a staging rule, a stateless M4 AUTHOR would have to instantiate FiscalPolicyState two milestones early or invent hidden defaults.

Resolved in Drive with the smallest boundary clarification: until M6, M4 uses explicit deterministic read-only fixture/scenario values for the already-required wage-tax, collection-efficiency, minimum-wage and related legal queries. These inputs own no mutable fiscal state, treasury planning, transfers, debt or policy-review behavior. M6 later backs the same query semantics from canonical FiscalPolicyState without changing wage settlement. An uncontrolled Region collects zero State wage tax unless an explicit applicable rule is supplied. REQ-PRODUCTION-004 acceptance now proves this staging boundary. No wage-tax formula, employer/cohort/State cash identity, phase order, economic mechanism or v1 scope changed.

No new implementation-package file was added; no mirror allowlist request is required. Normal synchronization should carry the existing Handoff/05, Handoff/11, registry, changelog and answer-file changes.  
STATUS: RESOLVED — M4 PRE-M6 POLICY STAGING BOUNDARY

2026-09-11 — R235 / CODE\_RUNTIME\_QA\_M3\_16 — Q-001 / PR \#443 — REQ-MARKET-005  
Q-001 is answered without a specification change. Canonical Handoff/01 already defines ActorRef with a COHORT variant. PopulationCohortState owns the household wallet/inventory endpoint; ProductionUnitState owns its wallet and typed INPUT/OUTPUT/INVESTMENT inventories; ClanState has no generic physical-goods inventory. Therefore CLAN+GENERAL M3 settlement fixtures are implementation drift, not a missing product decision.  
Smallest implementation repair: restore/use the canonical COHORT ActorRef in the runtime representation, re-author authoritative settlement/acceptance fixtures onto actor-owned endpoints (for example COHORT+GENERAL household consumption and appropriate PRODUCTION\_UNIT buckets), and wire MarketSettlement.executeAllocation through the production Phase-8 path. Do not invent Clan inventory and do not add a parallel stock layer. Existing arithmetic-only fixture tests may remain lower-level tests but cannot prove authoritative stock mutation.  
Repository Q-001 should be marked ANSWERED/WITHDRAWN. REQ-MARKET-005 remains PARTIAL until the real Phase-8 settlement and telemetry-neutrality evidence merges. GitHub PR \#443 QA comment: 5634774609\.  
No specification, economic mechanism, accounting identity, phase order, or v1 scope changed.  
STATUS: Q-001 ANSWERED / IMPLEMENTATION\_SCHEMA\_FIX\_REQUIRED  
D

2026-09-14 — R291 / CODE\_RUNTIME\_QA\_CONFIG\_004\_06 / HANDOFF-REPAIR-017 — ProductionUnit genesis inventory-bucket identity

Current master emits ProductionUnit inputInventory, outputInventory and investmentInventory as separate GOOD\_ENDOWMENT records, but the only record-level distinction is sourceSeedKey. GenesisRecord has no typed inventory-bucket field, and genesis reconciliation aggregates ProductionUnit goods by owner \+ good. As a result, moving an unchanged quantity of the same good from INPUT to OUTPUT or INVESTMENT can preserve the aggregate and incorrectly pass reconciliation.

Drive authority is repaired with the smallest accounting-representation change. GenesisRecord now includes inventoryBucket?: 'INPUT' | 'OUTPUT' | 'INVESTMENT'. For a ProductionUnit-owned GOOD\_ENDOWMENT the field is required, and canonical stock identity is ProductionUnit \+ region \+ inventoryBucket \+ goodId. sourceSeedKey remains provenance only. Acceptance now requires a negative control that preserves the owner/region/good aggregate while relocating stock between ProductionUnit buckets and proves reconciliation fails.

Implementation request: add the typed bucket to src/domain/genesisLedger.ts; emit INPUT / OUTPUT / INVESTMENT from src/simulation/worldState.ts; compare expected and actual ProductionUnit goods using bucket-specific keys in src/simulation/genesisReconciliation.ts; and add the cross-bucket negative regression. Keep this separate from the already-open region/good/resource/population identity repairs \#448–\#452. REQ-CONFIG-004 remains operationally QA-contested until the repair is merged and the authoritative implementation-status evidence is reconciled.

No new implementation-package file was added, so no mirror allowlist request is required. No stock amount, production mechanic, formula, default, phase order or v1 scope changed.

STATUS: SPEC\_REPRESENTATION\_REPAIRED / IMPLEMENTATION\_REPAIR\_REQUIRED

2026-09-15 — R314 / HANDOFF-REPAIR-M4-002 — Q-001 / REQ-CONFIG-006

Q-001 is answered by completing the canonical ProductionConfig/LaborConfig baseline in CANONICAL\_CONFIG\_AND\_WORLD\_GENERATION section 6–7 and Handoff/03. The fourteen previously unvalued section-37 controls now have explicit defaults: investmentReviewCadenceTicks=3, investmentUtilizationThreshold=0.75, minimumInvestmentMargin=0.05, investmentPropensity=0.35, maxInvestmentShareOfExcessCash=0.50, maxCapitalGrowthPerReview=0.25, lifecycleReviewCadenceTicks=3, mothballMarginThreshold=-0.10, mothballUtilizationThreshold=0.25, reactivateMarginThreshold=0.05, closingGraceReviews=4, maxLogWageStep=ln(1.05), unitVacancyResponse=0.02, maxTightnessSignal=2.0.

Most values simply promote the already-published Handoff/05 recommended defaults into the sole config-default owner. The four choices that previously had only ranges/semantics use conservative baselines: maxCapitalGrowthPerReview=0.25 is inside the documented 0.20–0.35 range; reactivateMarginThreshold=0.05 creates hysteresis above the \-0.10 mothball threshold; closingGraceReviews=4 gives a 12-month grace at the 3-tick lifecycle cadence before zero-value physical retirement can be considered; maxTightnessSignal=2.0 bounds the log labor-demand/supply signal while maxLogWageStep remains the actual per-review wage-move cap. The stale maxWageMoveSharePerTick alias is replaced by the exact Handoff/05 maxLogWageStep field. No new mechanism, actor, phase, or v1 scope is added.

Repository action: mark OPEN\_QUESTIONS Q-001 answered and implement these exact defaults/validation under REQ-CONFIG-006. The existing PARTIAL row may promote only after the values and proving tests merge. No new implementation-package file was added, so no mirror allowlist request is required.

STATUS: Q-001 ANSWERED / SPEC DEFAULTS COMPLETED

2026-09-15 — REQ-CONFIG-007 / Q-002  
Q-002 is accepted as a real implementation blocker. The current PR correctly keeps REQ-CONFIG-007 PARTIAL rather than guessing missing PopulationConfig defaults. Also preserve the full 20-control M4 surface and 16 currently undefined controls; do not reduce the surface to match the stale 19/15 count. A separate QA finding on PR \#532 also shows needCategories being dropped at DefinitionPack → DefinitionRegistry; that must be repaired before this row can be IMPLEMENTED.  
2026-09-16 — R334 / HANDOFF-REPAIR-M4-003 — Q-002 / REQ-CONFIG-007  
Q-002 is answered. CANONICAL\_CONFIG\_AND\_WORLD\_GENERATION section 8 and Handoff/03 now own explicit M4 defaults for the full 20-control PopulationConfig surface: minHouseholdCashPerCapita=2.5; liquidityFloorShare=0.10; baseParticipationByStratum={VULNERABLE:0.70, WORKING\_MIDDLE:0.70, AFFLUENT:0.70}; minParticipation=0.40; maxParticipation=0.90; min/maxHealthParticipationFactor=0.75/1.02; min/maxWeakOpportunityFactor=0.90/1.05; wageSignalAdjustmentSpeed=0.20; maxWageSignalStep=ln(1.05); essentialAlpha=0.25; incomeAlpha=0.15; employmentAlpha=0.20; prosperityAlpha=0.15; scenarioRealIncomeScale=10; healthRecoveryRate=0.05; healthMaintenanceThreshold=0.85; serviceHealthRate=0.02; serviceBaseline=0.50.  
Ownership is also normalized: PopulationConfig.baseParticipationByStratum is the sole M4 participation baseline and supersedes LaborConfig.baselineParticipationRate for active M4 labor supply; health participation bounds remain distinct from LaborConfig health-productivity bounds; NumericConfig.quantityEpsilon supplies worker-equivalent epsilon; the P\_raw 0.35/0.25/0.15/0.20/0.05 weights remain fixed formula constants; NeedCategoryDefinition.priceSensitivity remains per-category definition-owned, so the old global needSubstitutionElasticity is retired rather than duplicated. Superseded consumptionBudgetShare\*, precautionaryCashFloorMonths, healthEmaAlpha and wageSignalAlpha aliases must not become parallel runtime controls; prosperityEmaAlpha maps to prosperityAlpha=0.15. Population contract section 33 was corrected in canonical \+ Handoff/06 so need-category definitions are DefinitionRegistry-owned, not duplicated in PopulationConfig.  
Implementation request: mark repository OPEN\_QUESTIONS Q-002 ANSWERED with HANDOFF-REPAIR-M4-003 provenance; implement the exact 20 PopulationConfig defaults and validation under REQ-CONFIG-007; preserve PARTIAL until the existing needCategories DefinitionPack→DefinitionRegistry propagation defect and all config/default evidence are merged. Do not pull population behavior, M5+, demography/migration, or Clan/fiscal dynamics into this config unit. No new implementation-package file was added, so no mirror allowlist request is required.  
STATUS: Q-002 ANSWERED / SPEC DEFAULTS AND OWNERSHIP COMPLETED

2026-09-18 — R378 / HANDOFF-REPAIR-M4-004 — REQ-PRODUCTION-002 investment-planning implementation boundary

Before implementing the remaining REQ-PRODUCTION-002 investment-planning slice, fresh review found a real specification blocker: Production section 19 referenced undefined wUtil/wMargin/wSales weights and an undefined “desired next-tick input envelope estimate”, while its working-capital formula could bypass the mandatoryKnownCash and operatingLiquidityBuffer reserves already owned by section 10\.

Resolved in canonical Production and Handoff/05 with the smallest deterministic/cash-conservation repair. Core-v1 investment pressure uses fixed equal 1/3 weights; ordinary capacity-investment review is due only on tick \> 0 multiples of investmentReviewCadenceTicks; desiredNextTickInputEnvelopeEstimate is section-10 desiredInputCost from opening/prior-close evidence; workingCapitalTarget protects mandatoryKnownCash \+ grossWageCashEnvelope \+ that desired input reserve \+ operatingLiquidityBuffer before investment. INPUT and INVESTMENT commitments use distinct non-reusable budget-ledger envelopes, investment-good price evidence must be finite/positive and prior-close, investment goods are processed in stable goodId order, and planning itself mutates neither investmentInventory nor installedCapital.

M4 ownership is now explicit: REQ-PRODUCTION-002 owns Phase-2 ACTIVE-unit investment budget/BUY-intent construction and its cash-envelope evidence; REQ-PRODUCTION-005 owns the post-Phase-5 output SELL intent; REQ-PRODUCTION-006 consumes settled investmentInventory and owns Phase-12 capital formation/depreciation; MOTHBALLED expansion waits for REQ-PRODUCTION-007 reactivation eligibility. The next implementation run may therefore implement only the ACTIVE Phase-2 investment planner and keep REQ-PRODUCTION-002 PARTIAL until its remaining acceptance is actually earned. Do not pull Phase-12 conversion, lifecycle transitions, output sale, credit, M5+ trade/FX, or later fiscal/Clan mechanics into that unit.

No new implementation-package file was added, so no mirror allowlist request is required. Let normal synchronization update Handoff/05; do not patch docs/spec/mirror manually.

STATUS: RESOLVED — SPEC\_IMPLEMENTATION\_BLOCKER\_REPAIRED

2026-09-19 — R384 / HANDOFF-REPAIR-M4-005 — REQ-POPULATION-002 LaborSupplyPlan implementation boundary  
Fresh implementation-readiness review found that Population section 8 was not executable without inventing behavior: healthParticipationFactor and weakOpportunityFactor had only example bounds, workingEligibility/lawParticipationFactor had no pre-M6 M4 staging rule, and deterministic LaborSupplyPlan identity/order was not fixed.  
Resolved in canonical Population and Handoff/06. M4 now maps healthIndex linearly across PopulationConfig.min/maxHealthParticipationFactor and prior-close employmentRateEma linearly across min/maxWeakOpportunityFactor; Phase-2 cannot feed current allocation back into its own supply. Before mutable M6 law dynamics, positive-population WORKING cohorts use workingEligibility \= 1 and lawParticipationFactor \= 1, while CHILD/ELDER emit no normal plan. Population processes WORKING cohorts in lexical cohortId order and emits planId \= "labor-supply:" \+ tick \+ ":" \+ cohort.id. Generation is pure/read-only, uses no RNG, creates no persistent employer linkage, and must be invariant to registry insertion order.  
Implementation may now proceed under REQ-POPULATION-002 with endpoint/bound, age exclusion, supply\<=population, deterministic-order/ID and no-mutation regressions. Stop before Phase-3 allocation, wage settlement, household consumption, Phase-13 demography/migration, mutable M6 law/fiscal behavior or M5+ mechanics. No new implementation-package file was added, so no mirror allowlist request is required; normal synchronization should update the existing Handoff/06 mirror.  
STATUS: RESOLVED — SPEC\_IMPLEMENTATION\_BLOCKER\_REPAIRED

2026-09-25 — NAV-M5-001 — M5 permanent requirement/index mapping  
M5 indexing is complete in canonical REQUIREMENTS\_REGISTRY and EXECUTION\_ORDER. The permanent READY row set is REQ-CONFIG-008..009, REQ-MARKET-006..008, REQ-MONETARY-001..003, REQ-ACCEPTANCE-006 and REQ-VISUALIZATION-010. Runtime promotion remains gated by truthful M4 closure; this navigation repair does not authorize M5 mechanics early.  
Backlog mapping: \#669 → REQ-CONFIG-008 \+ REQ-CONFIG-009; \#670 → REQ-MARKET-006; \#671 → REQ-MONETARY-001; \#672 → REQ-MONETARY-002; \#673 → REQ-MARKET-007; \#674 → REQ-MARKET-008; \#675 → REQ-MONETARY-003; \#676 → REQ-ACCEPTANCE-006; \#677 → REQ-VISUALIZATION-010. \#669 intentionally maps to two prerequisite config rows because its existing scope combines transport/topology authority with finite-FX genesis/config authority; all other backlog issues map one-to-one without semantic drift.  
No new implementation-package file was added. Let normal MACHINE synchronization update the existing mirror; do not patch docs/spec/mirror manually.  
STATUS: NAVIGATION\_RECONCILED / M5\_INDEXED / RUNTIME\_GATE\_STILL\_M4

2026-09-25 — NAV-M6-001 — M6 permanent requirement/index mapping  
M6 is now pre-indexed as eleven permanent READY rows: REQ-CLAN-001..002, REQ-FISCAL-001..006, REQ-MIGRATION-005, REQ-ACCEPTANCE-007 and REQ-VISUALIZATION-011. Truthful M5 closure remains the hard runtime predecessor; indexing does not authorize early M6 mechanics.  
Dependency order: REQ-CLAN-001 \+ REQ-FISCAL-004 → REQ-CLAN-002 \+ REQ-FISCAL-001 \+ REQ-FISCAL-002 \+ REQ-FISCAL-003 → REQ-FISCAL-005 → REQ-FISCAL-006 → REQ-ACCEPTANCE-007 → REQ-MIGRATION-005 → REQ-VISUALIZATION-011. REQ-MIGRATION-005 means removal of canonical runtime dependence on legacy City/Pop/Market/Deal after equivalent M0–M6 evidence; it does not authorize weakening retained migration/.NET regression gates, and physical archive/delete remains optional until safe.  
Backlog mapping: \#684 → REQ-CLAN-001; \#685 → REQ-CLAN-002; \#686 → REQ-FISCAL-001; \#687 → REQ-FISCAL-002 \+ REQ-FISCAL-003 because transfers/grants and procurement/infrastructure/state ownership are independently implementable/verifiable; \#688 → REQ-FISCAL-004; \#689 → REQ-FISCAL-005; \#690 → REQ-FISCAL-006; \#691 → REQ-ACCEPTANCE-007; \#692 → REQ-VISUALIZATION-011. REQ-MIGRATION-005 has no pre-existing dedicated backlog Issue and must receive one before implementation is claimed.  
No new implementation-package file was added. Let normal MACHINE synchronization update the existing mirror; do not patch docs/spec/mirror manually.  
STATUS: M6\_INDEXED / READY-BUT-MILESTONE-BLOCKED / RUNTIME\_GATE\_STILL\_M5

2026-09-25 — NAV-M7-001 — M7 permanent requirement/index mapping  
M7 is indexed as eight permanent READY rows: REQ-MONETARY-004..009, REQ-ACCEPTANCE-008 and REQ-VISUALIZATION-012. Truthful M6 closure remains the hard runtime predecessor.  
Dependency order: REQ-MONETARY-004 → REQ-MONETARY-005 → REQ-MONETARY-006 → REQ-MONETARY-007 → REQ-MONETARY-008 → REQ-MONETARY-009 → REQ-ACCEPTANCE-008 → REQ-VISUALIZATION-012.  
Backlog mapping: \#694→REQ-MONETARY-004; \#695→REQ-MONETARY-005; \#696→REQ-MONETARY-006; \#697→REQ-MONETARY-007; \#698→REQ-MONETARY-008; \#699→REQ-MONETARY-009; \#700→REQ-ACCEPTANCE-008; \#701→REQ-VISUALIZATION-012.  
No new implementation-package file was added. Let normal MACHINE synchronization update the existing mirror; do not patch docs/spec/mirror manually.  
STATUS: M7\_INDEXED / READY-BUT-MILESTONE-BLOCKED / RUNTIME\_GATE\_STILL\_M6

2026-09-25 — NAV-M8-001 — M8 permanent requirement/index mapping  
M8 is indexed as nine permanent READY rows: REQ-POPULATION-004, REQ-EXPANSION-001..006, REQ-ACCEPTANCE-009 and REQ-VISUALIZATION-013. Truthful M7 closure remains the hard runtime predecessor.  
Dependency order: REQ-POPULATION-004 \+ REQ-EXPANSION-001 → REQ-EXPANSION-002 \+ REQ-EXPANSION-003 → REQ-EXPANSION-004 → REQ-EXPANSION-005 → REQ-EXPANSION-006 → REQ-ACCEPTANCE-009 → REQ-VISUALIZATION-013.  
Backlog mapping: \#703→REQ-POPULATION-004; \#704→REQ-EXPANSION-001; \#705→REQ-EXPANSION-002; \#706→REQ-EXPANSION-003; \#707→REQ-EXPANSION-004; \#708→REQ-EXPANSION-005; \#709→REQ-EXPANSION-006; \#710→REQ-ACCEPTANCE-009; \#711→REQ-VISUALIZATION-013.  
The M8 visualization share is 1/9 \= 11.1%, above the baseline 5% rule. No new implementation-package file was added; normal MACHINE synchronization should update the mirror.  
STATUS: M8\_INDEXED / READY-BUT-MILESTONE-BLOCKED / RUNTIME\_GATE\_STILL\_M7

2026-09-26 — NAV-M9-001 — M9 permanent requirement/index mapping  
M9 is indexed as seven permanent READY rows: REQ-EVENTS-001..005, REQ-ACCEPTANCE-010 and REQ-VISUALIZATION-014. Truthful M8 closure remains the hard runtime predecessor; indexing does not authorize early event runtime behavior.  
Dependency order: REQ-EVENTS-001 → REQ-EVENTS-002 → REQ-EVENTS-003 → REQ-EVENTS-004 → REQ-EVENTS-005 → REQ-ACCEPTANCE-010 → REQ-VISUALIZATION-014.  
Backlog mapping: \#713→REQ-EVENTS-001; \#714→REQ-EVENTS-002; \#715→REQ-EVENTS-003; \#716→REQ-EVENTS-004; \#717→REQ-EVENTS-005; \#718→REQ-ACCEPTANCE-010; \#719→REQ-VISUALIZATION-014.  
M9 effects remain bounded to typed ShockOperations, explicit physical/demographic losses and subsystem-owned modifier/query boundaries. Direct writes to prices, GDP, CPI, policy rate, jurisdiction or transaction money remain forbidden.  
The visualization share is 1/7 \= 14.3%, above the baseline 5% rule. No new implementation-package file was added. Let normal MACHINE synchronization update the existing mirror; do not patch docs/spec/mirror manually.  
STATUS: M9\_INDEXED / READY-BUT-MILESTONE-BLOCKED / RUNTIME\_GATE\_STILL\_M8  
2026-09-26 — NAV-M10-001 — permanent M10 mapping  
M10 IDs are fixed before implementation: \#721 \-\> REQ-ACCEPTANCE-011; \#722 \-\> REQ-ACCEPTANCE-012; \#723 \-\> REQ-ACCEPTANCE-013; \#724 \-\> REQ-PERFORMANCE-001; \#725 \-\> REQ-PERFORMANCE-002; \#726 \-\> REQ-CONFIG-010; \#727 \-\> REQ-ACCEPTANCE-014; \#728 \-\> REQ-VISUALIZATION-015.  
Dependency order: ACCEPTANCE-011 \+ ACCEPTANCE-012 \+ CONFIG-010 \-\> ACCEPTANCE-013 \-\> PERFORMANCE-001 \+ PERFORMANCE-002 \-\> ACCEPTANCE-014 \-\> VISUALIZATION-015. M9 remains the hard predecessor. Exact performance/history thresholds come only from Handoff/12. Do not weaken correctness or pull M11 Worker/SimulationOutput/interactive-observatory semantics forward.  
No new implementation-package file was added, so no mirror allowlist request is required. Wait for normal MACHINE synchronization; do not patch docs/spec/mirror manually.  
STATUS: ANSWERED / M10\_INDEXED / MIRROR\_VERIFICATION\_PENDING  
2026-09-26 — NAV-M11-001 — permanent M11 mapping  
M11 permanent IDs are fixed before implementation; M10 remains the hard predecessor.  
Permanent M11 IDs: REQ-VISUALIZATION-016 through REQ-VISUALIZATION-025, then REQ-ACCEPTANCE-015.  
Issue 730 maps to REQ-VISUALIZATION-016.  
Issue 731 maps to REQ-VISUALIZATION-017.  
Issue 732 maps to REQ-VISUALIZATION-018.  
Issue 733 maps to REQ-VISUALIZATION-019.  
Issue 734 maps to REQ-VISUALIZATION-020.  
Issue 735 maps to REQ-VISUALIZATION-021.  
Issue 736 maps to REQ-VISUALIZATION-022.  
Issue 737 maps to REQ-VISUALIZATION-023.  
Issue 738 maps to REQ-VISUALIZATION-024.  
Issue 739 maps to REQ-VISUALIZATION-025.  
Issue 740 maps to REQ-ACCEPTANCE-015.  
Dependency order: VISUALIZATION-016, 017, 018, 019, 020, 021, then 022/023/024, then 025, then ACCEPTANCE-015.  
STATUS: ANSWERED / M11\_INDEXED / MIRROR\_VERIFICATION\_PENDING  
2026-09-26 — NAV-M12-001 — permanent M12 mapping  
M12 permanent IDs are fixed before implementation; truthful M11 closure remains the hard predecessor.  
Issue 742 maps to REQ-MIGRATION-006.  
Issue 743 maps to REQ-CONFIG-011.  
Issue 744 maps to REQ-MIGRATION-007.  
Issue 745 maps to REQ-VISUALIZATION-026.  
Issue 746 maps to REQ-ACCEPTANCE-016.  
Dependency order: REQ-MIGRATION-006 \+ REQ-CONFIG-011 → REQ-MIGRATION-007 → REQ-VISUALIZATION-026 → REQ-ACCEPTANCE-016.  
REQ-MIGRATION-006 is final archive/delete or reference-only quarantine after REQ-MIGRATION-005 has already removed canonical runtime dependence on City/Pop/Market/Deal.  
The M12 visualization share is 1/5 \= 20%, above the baseline 5% rule. No new implementation-package file was added, so no mirror allowlist request is required.  
STATUS: ANSWERED / M12\_INDEXED / MIRROR\_VERIFICATION\_PENDING  
8

2026-09-29 — HANDOFF-REPAIR-M4-007 — Phase-4 physical inventory endpoint commitment identity  
Markets section 7 now defines seller commitment identity as persistent ActorRef \+ goodId \+ normalized inventoryBucket. Owned stock and alreadyCommitted use that same physical endpoint. Multiple SELL intents sharing an endpoint share one balance; distinct ProductionUnit INPUT, OUTPUT, and INVESTMENT buckets remain independent. Availability evaluation is stable persistent-actor-ID then intent-ID before proportional clearing.

The corresponding M4 Phase-4 repair is bounded to this endpoint key, deterministic seller pre-ordering, and focused duplicate-endpoint/reserve/order/distinct-bucket regressions. Issue \#251 remains the generic clearing primitive and retains its explicit Phase-4 non-goal. The separate R590 moneyEpsilon affordability defect remains independent.

No new implementation-package file was added; no mirror allowlist change is required. Normal MACHINE synchronization should update the existing Markets mirror.  
STATUS: SPEC\_REPAIRED / IMPLEMENTATION\_REPAIR\_REQUIRE  
2026-09-29 — HANDOFF-REPAIR-M4-008 implementation answer  
For Phase-4 seller availability, group SELL intents by persistent ActorRef \+ goodId \+ normalized inventoryBucket. Before consuming any commitment, compute endpointReserve as the maximum minimumReserveQuantity declared by intents in that endpoint group, defaulting omitted reserves to zero. Then compute each sellable quantity against owned \- endpointReserve \- shared alreadyCommitted in stable persistent-actor-ID then intent-ID order. A lower-reserve intent must not consume stock protected by a higher-reserve same-endpoint intent. Distinct inventory buckets remain independent. This is a focused Phase-4 repair; the separate Phase-4 moneyEpsilon affordability wiring defect remains independent.

