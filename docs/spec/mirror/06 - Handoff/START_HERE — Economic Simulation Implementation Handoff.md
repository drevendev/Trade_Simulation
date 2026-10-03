# Economic Simulation — Implementation Handoff

Status: FINAL HANDOFF PACKAGE — implementation-ready for Codex/Claude.  
Implementation base: https\://github.com/drevendev/trade\_simulation

Purpose  
This folder is the self-contained implementation package. A coding agent should be able to implement the target simulation end-to-end without reopening product/economic design or reconstructing Drive history.

Canonical reading order  
00 — MASTER\_IMPLEMENTATION\_INDEX  
01 — CORE\_SCHEMA\_AND\_LIFECYCLES  
02 — IMPLEMENTATION\_CONTRACT\_CONSISTENCY\_REVIEW\_01  
03 — CANONICAL\_CONFIG\_AND\_WORLD\_GENERATION  
04 — MARKETS\_TRADE\_FX\_CONTRACTS  
05 — PRODUCTION\_CAPITAL\_LABOR\_CONTRACTS  
06 — POPULATION\_DEMOGRAPHY\_CLANS\_CONTRACTS  
07 — STATE\_FISCAL\_LAWS\_CONTRACTS  
08 — MONETARY\_CURRENCY\_CONTRACTS  
09 — EXPANSION\_SETTLEMENT\_CONTRACTS  
10 — EVENTS\_SHOCKS\_CONTRACTS  
11 — REPOSITORY\_MIGRATION\_AND\_MILESTONE\_GATES  
12 — ACCEPTANCE\_BENCHMARK\_PERFORMANCE\_SUITE  
13 — VISUALIZATION\_AND\_EXPLAINABILITY  
90 — USER\_DRAFT\_SYNTHESIS\_AND\_TRACEABILITY  
91 — REPOSITORY\_AUDIT\_BASELINE  
99 — PROJECT\_MANIFEST

Authority and conflicts  
Start with 00\. It defines precedence and canonical normalizations. When documents disagree, follow its conflict order. Never average formulas, merge superseded schemas, or invent a third mechanic. If a material choice is still missing, treat it as a specification defect and stop that milestone.

## Canonical product boundary

The target is a deterministic autonomous simulation with no player-controlled economy. Core v1 includes multiple States and currencies, endogenous local markets, production chains, labor and wages, population cohorts and demography, Clans, fiscal policy and laws, sovereign debt, monetary authorities and finite FX, regional/international trade, migration, settlement/state formation, bounded shocks and a GitHub Pages observatory.

The model is intentionally mesoscopic. Population is represented by cohorts; firms by ProductionUnits; Clans are social/ownership/political actors rather than containers replacing every household, firm and market. Goods, money, population, debt, inventories, capital and physical resources use explicit stock/flow accounting.

## Hard v1 exclusions

Do not add commercial banks/private credit, individuals, fractional firm equity markets, private securities, speculative FX/order books, dynamic currencies/redenomination, endogenous monetary-union accession, multi-hop route optimization, land/property/housing markets, warfare, dozens of goods, persistent worker-employer matching matrices, a second household shopping loop, arbitrary macro-stat modifiers, or unbounded transaction history unless a later explicit design change is approved.

Tick and causality  
The canonical engine has sixteen phases numbered 0–15. Phase 15 contains invariant close and snapshot/read-model generation; earlier accidental references to “Phase 16” mean Phase-15 close and must not create a seventeenth phase.

Global rules that must remain true:  
\- one authoritative owner per stock;  
\- one realized transfer per settlement path;  
\- ordinary transactions transfer money but do not create/destroy it;  
\- every cross-currency payment uses the same finite settleFx liquidity pool;  
\- wage tax is withheld at payroll, transaction taxes/tariffs settle with transactions, residual business/profit tax settles later without double charging;  
\- policy and jurisdiction decisions are non-retroactive and queue N+1 effects through PendingTransitions;  
\- installedCapital is authoritative capacity stock;  
\- LocalMarket.status is the sole market lifecycle field;  
\- Population current employment is a tick flow, not a duplicated persistent employment stock;  
\- discovery changes resource knowledge, not physical stock;  
\- Events affect permitted physical/biological inputs and never directly assign prices, GDP, CPI, unemployment, policy rate, migration counts, jurisdiction or money;  
\- visualization/read models never mutate canonical state or consume economic RNG.  
\- browser run identity is canonical, not an implementation choice: scenarioHash, configHash and definitionPackHash are SHA-256 over normalized canonical JSON, and runIdentity is SHA-256 over { scenarioId, scenarioHash, seed, configHash, definitionPackHash, engineBuildId }; unordered keyed collections are sorted by stable key/id while genuinely ordered arrays preserve order.  
\- share/deep-link URLs are navigation hints only: they may restore view/entity/tick/filter state only after schema/run compatibility and retained-history checks; they never create, override or prove runIdentity, and direct-open/refresh must work under the repository GitHub Pages base path without server rewrites.  
\- retained tick availability is explicit, not inferred from min/max bounds: HistoryRetentionMetadata.aggregateTickRanges and detailedTickRanges are authoritative membership projections over retained observations; earliest/latest fields are convenience bounds only, and the ranges never own snapshots or recreate evicted history.

Repository execution order  
Implement through M0–M12 from document 11, not as a rewrite:  
M0 baseline lock/scaffolding.  
M1 canonical primitives/config/world genesis.  
M2 tick/ledger spine.  
M3 local markets.  
M4 production/labor/population closed economy.  
M5 transport/trade/FX.  
M6 fiscal/laws/clans/debt.  
M7 monetary/currency.  
M8 demography/migration/expansion/succession.  
M9 events/shocks.  
M10 whole-system acceptance/performance.  
M11 browser/GitHub Pages observatory.  
M12 legacy removal/release candidate.

A failed milestone gate blocks later promotion. Preserve the current build/tests and migrate by responsibility. The existing repository remains the implementation base; do not replace working infrastructure merely because the canonical domain model is richer.

Acceptance authority  
Document 12 is release-blocking. Accounting, determinism and causality failures are defects even if macro charts look plausible. Use P0/P1 for fast development, P2 baseline-multistate-v1 as the canonical product benchmark, and P3 for stress/performance. Numeric browser and Worker budgets in that document are requirements for M10/M11.

User-draft traceability  
Document 90 explicitly covers all four user drafts (original filenames preserved for traceability): Кланы. Цепочки производства (Clans — Production Chains); Кланы. Особенности кланов (Clans — Clan Traits); Кланы и места их обитания (Clans and Their Habitats); Алгоритмы торговли (Trade Algorithms). It classifies the ideas as KEEP/REWORK/DROP and explains why. Retained intent is represented in the implementation contracts: Clans remain important meso-agents; production chains and scarce regional resources remain; local/international trade and endogenous prices remain; population needs/health/demography remain; taxes/state policy remain. Rejected complexity includes individual persons, infinite rescue/global markets, negative physical inventories disguised as futures, rigid class-order purchasing, magic bonuses and overlapping incompatible market/population models.

Coding-agent decision boundary  
Codex/Claude may choose ordinary engineering details such as file/class decomposition, pure-function boundaries, equivalent internal data structures, caches that are non-authoritative/reconstructable, test-helper layout and UI component composition.

Codex/Claude must not change specified economic formulas/defaults, stock ownership, tick causality, tax timing, FX semantics, monetary creation/destruction, demographic accounting, state succession, event write boundaries, milestone order, acceptance thresholds or the v1 exclusions above.

Final audit result  
PASS. The handoff package contains implementation-grade contracts for every required domain, canonical schema/config/default ownership, deterministic tick order, accounting/invariants/tests, repository migration and M0–M12 gates, acceptance/benchmark/performance requirements, GitHub Pages visualization specification, repository baseline context and explicit traceability of all four user drafts.

No unresolved ambiguity found in the final audit requires a coding agent to make a material economic or product-design decision. Remaining choices are normal implementation details inside the decision boundary above.

Implementation should begin with 00, then 01–03, then follow the active M0–M12 milestone and read the subsystem contract for that milestone.

Runtime boundary clarification — 2026-09-03  
M0 freezes the existing .NET 9 legacy baseline. Starting with M1, the canonical simulation engine is implemented in TypeScript as the browser-capable runtime. The C\# simulation remains a reference/golden oracle during migration; do not build each new canonical subsystem in C\# and then port it again. M11 adds Worker/read-model/UI hosting around the same TypeScript engine rather than performing a second engine rewrite. See 00 and 11 for the authoritative resolution.  
