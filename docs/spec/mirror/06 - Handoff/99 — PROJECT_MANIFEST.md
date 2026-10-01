# Economic Simulation — Project Manifest

Mission  
Transform https\://github.com/drevendev/trade\_simulation into a deep but implementable autonomous economic simulation with no player agency. The simulation must run deterministically/reproducibly in-browser and be understandable through a polished GitHub Pages visualization.

Core product principles  
1\. Simulation first, game second: no player-controlled economy. Interesting outcomes emerge from interacting agents and institutions.  
2\. Stock-flow consistency where practical: goods, money, population, debt and inventories must have explicit sources/sinks; avoid unexplained magic values.  
3\. Markets are endogenous: prices, shortages, surpluses, trade routes and specialization arise from supply/demand, inventories, expectations and transaction costs.  
4\. States have meaningful fiscal and monetary policy: taxes, spending, transfers, debt, money issuance / central banking rules, rates or equivalent monetary levers, inflation pressure and currency/FX where the model supports it.  
5\. Population matters: births, deaths, migration, prosperity, consumption, employment and class/strata transitions must feed back into production and politics.  
6\. Clans remain a major meso-level actor from the user drafts: population-bearing social/economic blocs with traits, values, loyalties, wealth/influence and occupational or ownership patterns. Simplify where needed; do not reproduce every draft mechanic literally.  
7\. Territorial expansion and state formation matter: regions/resources, settlement, migration/colonization, borders and trade accessibility.  
8\. Laws and institutions alter incentives rather than acting as arbitrary buffs. Examples: tax systems, trade policy, slavery/serfdom/free labor, property rules, welfare, monetary regime.  
9\. Random events are secondary shocks, not the main engine: disasters, harvest failures, epidemics, discoveries etc. must propagate through the normal economic model.  
10\. Explainability is mandatory: every important metric shown in UI should be traceable to agents/flows and understandable from tooltips, charts or drilldowns.  
11\. Implementation simplicity matters. Prefer a small number of composable equations and agent rules over academic completeness. Codex/Claude must be able to implement from the spec folder without inventing missing systems.

Required domains  
\- simulation clock and deterministic seeded RNG  
\- world/regions/resources/transport costs  
\- population, households or population cohorts, needs and demography  
\- clans and clan behavior  
\- labor allocation/employment/wages  
\- firms or production units, recipes, productivity, capital/infrastructure and inventories  
\- local markets and interregional/international trade  
\- prices, shortage/surplus, expectations and market clearing mechanism  
\- state budgets, taxes, spending, transfers, public procurement and debt  
\- monetary system, money creation/destruction, inflation/deflation pressure, policy regime and currency/FX if multi-currency is retained  
\- laws/policies and institutional effects  
\- growth, investment, expansion/settlement  
\- disasters and bounded stochastic shocks  
\- statistics, accounting identities, diagnostics and invariant checks  
\- GitHub Pages visualization: timeline controls, map/regions, state dashboards, market dashboards, population/clan views, Sankey/flows where useful, prices/quantities, fiscal/monetary charts, event log and causal explanations  
\- performance budget suitable for static-hosted browser execution  
\- automated tests and deterministic benchmark scenarios

Target handoff  
The final Drive folder must become an implementation-ready specification package for Codex/Claude. It must include architecture, domain model, data schemas, formulas, algorithms/pseudocode, tick order, constants/configuration strategy, UI information architecture, visualization requirements, migration plan from the existing repository, milestones, tests, invariants, acceptance criteria and a master implementation sequence.

Working modes  
REPO\_AUDIT — inspect current repository architecture, code paths, tests, limitations and reusable parts.  
SOURCE\_AUDIT — extract useful ideas, contradictions and simplification opportunities from user drafts.  
RESEARCH — study open-source simulations, agent-based computational economics, market mechanisms, demography, fiscal/monetary models and visualization practices.  
MODEL\_ARCHITECTURE — define the smallest coherent stock-flow/agent architecture and tick order.  
MARKETS — prices, orders, inventories, trade, transport, shortages, expectations and specialization.  
PRODUCTION — resources, recipes, labor, productivity, capital/infrastructure, investment and depreciation.  
POPULATION — needs, wealth/income, births/deaths, migration, labor supply, prosperity/classes.  
CLANS — traits, values, influence, ownership/occupation, political preference and behavior without uncontrolled complexity.  
STATE\_FISCAL — taxes, spending, transfers, public procurement, debt and laws.  
MONETARY — currency, money supply, banking/credit if justified, inflation and monetary-policy rules.  
EXPANSION — regions, settlement, migration, colonization and resource constraints.  
EVENTS — disasters and other bounded exogenous shocks.  
VISUALIZATION — GitHub Pages information architecture, charts, map and explainability.  
SPEC\_WRITING — convert mature designs into implementation-grade documents.  
CONSISTENCY\_REVIEW — find contradictions, missing accounting flows, unstable feedback loops and hidden complexity.  
SIMPLICITY\_REVIEW — remove systems whose value does not justify implementation cost; preserve emergent behavior.  
IMPLEMENTATION\_PLANNING — sequence work into Codex/Claude-sized phases with tests and migrations.  
HANDOFF\_AUDIT — verify the spec folder is self-contained and implementation-ready.  
REPORT — concise status for the user.

Decision rules  
\- User drafts are authoritative for intent, not for exact mechanics. Improve them aggressively when a clearer model exists.  
\- Existing repository is the technical base; preserve working pieces unless replacement is justified.  
\- Prefer emergent macro outcomes over directly scripted GDP/inflation/population outcomes.  
\- Every mechanism must state inputs, outputs, units/scales, update timing, edge cases, tunable parameters and tests.  
\- Each new subsystem must identify computational complexity and expected browser performance impact.  
\- Implementation must show continuous visible progress: every M0–M12 allocates at least 5% of planned implementation units, rounded up with a minimum of one, to a directly visible GitHub Pages visualization/presentation change. Before M11 use a lightweight one-way Milestone Preview; do not pull the final SimulationOutput/Worker architecture forward merely to satisfy this cadence.  
\- Do not introduce banks, securities, detailed individual agents or dozens of goods merely for realism. Add them only if they materially improve target behavior and remain implementable.  
\- Multi-currency/FX is desirable because each state should have monetary policy, but planner may stage it after a simpler single-currency milestone if necessary.

Completion gate  
PROJECT\_STATUS may become COMPLETE only when: repository audit exists; all four drafts are incorporated or explicitly rejected with reasons; core model is internally coherent; market, production, population, clans, fiscal, monetary, expansion, laws/events and visualization have implementation specs; tick order and accounting/invariants are explicit; config/data schemas exist; migration plan from current repo exists; tests/benchmark scenarios exist; GitHub Pages UX is specified; a master Codex/Claude implementation plan exists; and a final handoff audit finds no critical ambiguity.

Implementation feedback channel  
At the beginning of every REVIEW/QA run, after reading PROJECT\_MANIFEST and STATE\_AND\_QUEUE, read the repository feedback channel when available:

Protocol amendment — 2026-09-05 (authoritative for REVIEW/QA and future milestone indexing):  
\- Read docs/spec/implementation\_status.csv as the implementation-evidence source, not the rendered IMPLEMENTATION\_STATUS.md. The ledger columns are REQ\_ID, STATUS, ISSUE, PR, MERGE\_COMMIT, EVIDENCE; STATUS may be IMPLEMENTED, PARTIAL, BLOCKED, DEFERRED or CONTESTED. A registry identifier absent from the ledger has no implementation evidence. The rendered Markdown is presentation only.  
\- When a new file enters the implementation package, record the addition in SPEC\_CHANGELOG and append an explicit request to ANSWERS\_TO\_IMPLEMENTER in the exact form “please add \<path\> to the mirror allowlist”. Until that repository-side allowlist change lands, the file’s absence from the mirror is expected and must not be diagnosed as synchronization failure.  
\- Any rename of a file listed in SPEC\_INDEX is a breaking navigation change. Announce the exact old→new filename in ANSWERS\_TO\_IMPLEMENTER and SPEC\_CHANGELOG before performing the rename. Exported filenames must exactly match the mirrored filenames.  
\- docs/spec/mirror/ is write-protected to the implementation side: only the synchronization workflow may write it. Google Drive remains the sole specification authority. If the mirror is wrong, implementation reports the discrepancy; neither agents nor people patch the mirror directly.  
\- Registry granularity rule: when indexing a future milestone, split acceptance into separate requirement rows where the enumerated artifacts are independently implementable and independently verifiable. Keep one row when the acceptance is genuinely atomic. Never renumber or reuse identifiers. Existing composite rows remain stable; retroactive splitting requires an explicit indexed/changelogged change with new IDs. PARTIAL is the correct intermediate evidence status for an existing composite row.

\- docs/spec/FEEDBACK\_TO\_RESEARCHER.md — implementation evidence about contradictions, missing formulas/units, unverifiable requirements and proposed minimal fixes.  
\- docs/spec/OPEN\_QUESTIONS.md — only implementation-blocking questions tied to requirement IDs.  
\- docs/spec/implementation\_status.csv — implementation coverage and proving tests; this is authoritative for what is actually implemented, not for what the specification requires.  
Treat repository feedback as evidence, not specification authority. Resolve questions and accepted corrections in Drive, record semantic changes in SPEC\_CHANGELOG.md, and append dated answers keyed by REQ\_ID/Q-ID to ANSWERS\_TO\_IMPLEMENTER.md. Never silently change requirement meaning. A coding implementation does not override a canonical contract merely because it exists in code.

Implementation navigation layer  
Stateless coding agents must be able to reach the active requirement in at most two document reads. Maintain REQUIREMENTS\_REGISTRY.csv, SPEC\_INDEX.md, EXECUTION\_ORDER.md and SPEC\_CHANGELOG.md at the specification root. Requirement IDs are permanent. Mature executable requirements are READY or FROZEN; retired requirements remain present as RETIRED. The frozen AREA vocabulary is: CORE, CONFIG, MARKET, PRODUCTION, POPULATION, CLAN, FISCAL, MONETARY, EXPANSION, EVENTS, VISUALIZATION, MIGRATION, ACCEPTANCE, PERFORMANCE, SCOPE.  
