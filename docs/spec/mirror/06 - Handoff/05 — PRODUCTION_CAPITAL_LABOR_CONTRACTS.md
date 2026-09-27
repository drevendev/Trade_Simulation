PRODUCTION, CAPITAL AND LABOR CONTRACTS — Economic Simulation

Status: implementation-grade subsystem contract v1. Authoritative together with CORE\_SCHEMA\_AND\_LIFECYCLES and MARKETS\_TRADE\_FX\_CONTRACTS. This document converts the mature PRODUCTION\_AND\_CAPITAL design and the labor boundary in POPULATION\_AND\_DEMOGRAPHY into exact runtime contracts for ProductionUnit planning, labor allocation, wage settlement, Leontief production, inventories, real investment, depreciation and ProductionUnit lifecycle. It does not redefine household consumption/demography, market clearing, fiscal policy formation or clan politics.

1\. Implementation objective

Core v1 must make production economically real without becoming a firm-management simulator. Output may increase only when an eligible ProductionUnit has physical capacity, usable labor and the required inputs/resources. Cash is a financing constraint, not a production factor: cash can buy inputs, labor and investment goods, but cannot become output or capacity directly.

Repository migration boundary: current Pop combines population, producer, wallet and inventory, and Produce() computes Count × ProductionPower × cityModifier × noise. Preserve the transparency of a small explicit production function, but split those responsibilities into PopulationCohort labor supply, ProductionUnit ownership/cash/inventories, RecipeDefinition coefficients, regional physical factors and explicit transactions. Routine production noise is removed from core v1; bounded EVENTS provide shocks.

User-draft disposition carried into this contract: KEEP production chains, local resource differences, clan ownership/economic identity, investment and territorial specialization; REWORK chains into RecipeDefinitions and clan production into Clan-owned ProductionUnits; REWORK generic advantages into explicit deposits/infrastructure/capacity; DROP duplicate clan/pop production engines, free resource creation/repair, order-dependent actor consumption and universal tier ladders.

2\. Canonical units and meanings

One tick \= one month.

Production quantity: abstract good-units from GoodDefinition.  
Labor: worker-equivalent persons for one tick. One labor unit means one fully allocated worker-equivalent for the month.  
Wage: region settlement-currency units per worker-equivalent per tick, gross of employee wage-income tax.  
Recipe batch: dimensionless production run. Recipe inputs/labor/output are coefficients per batch.  
Installed capital: abstract physical capital units belonging to one ProductionUnit.  
Nameplate capacity: batches per tick at condition=1 and infrastructureFactor=1.  
Condition: bounded \[0,1\] operational integrity multiplier.  
Rates: fractions per tick unless explicitly annualized and converted.

No quantity, wage, cash, capacity, condition, coefficient or derived plan may be NaN/Infinity.

3\. Additive persistent ProductionUnit fields

CORE\_SCHEMA ProductionUnitState is extended with:

interface ProductionSignalState {  
  utilizationEma: number;             // \[0,1\]  
  sellThroughEma: number;             // \[0,1\]  
  marginSignalEma: number;            // bounded normalized signal, recommended \[-1,1\]  
  outputSalesEma: number;              // output-good units/tick  
  inputUseEma: Record\<GoodId, number\>; // good-units/tick  
  consecutiveNonviableReviews: number;  
  consecutiveViableReviews: number;  
}

ProductionUnitState \+= {  
  investmentInventory: Inventory;  
  signals: ProductionSignalState;  
  lastLifecycleReviewTick: number;  
}

investmentInventory is canonical physical stock reserved for capital formation/startup. It must not simultaneously appear in inputInventory or outputInventory.

Nameplate batch capacity per tick is derived from the authoritative installedCapital stock and the current recipe:

capacity \= installedCapital × recipe.batchesPerCapitalUnit

Preferred implementation exposes deriveNameplateCapacity(unit, recipe) and does not serialize capacity in canonical state. If a performance cache is retained, it is non-authoritative, recomputed after every capital mutation and validated at serialization boundaries.

condition is separate from depreciation: depreciation shrinks installedCapital; condition captures damage/operational impairment and can recover only through an explicit repair mechanism if one is later added. Core v1 has no routine free repair. EVENTS may reduce condition or capital explicitly.

4\. RecipeDefinition contract

DefinitionRegistry.recipes must expose at least:

interface RecipeDefinition {  
  id: string;  
  outputGoodId: GoodId;  
  outputPerBatch: number;                  // \> 0  
  inputsPerBatch: Record\<GoodId, number\>;  // each \> 0  
  laborCategory: string;                   // usually one broad GENERAL category in baseline scenarios  
  laborPerBatch: number;                   // \>= 0  
  batchesPerCapitalUnit: number;           // \> 0  
  investmentGoodsPerCapitalUnit: Record\<GoodId, number\>; // at least one good for capital-forming recipes  
  minimumStartupCapital: number;           // \>= 0  
  infrastructureCategory?: string;  
  minimumInfrastructureFactor?: number;    // \[0,1\]  
  extractionResourceId?: string;  
  extractedResourcePerBatch?: number;      // \> 0 when extractionResourceId exists  
  baseThroughputFactor: number;             // \> 0, normally 1  
  depreciationRatePerTick: number;          // \[0,1)  
}

Recipe definitions are immutable during a run. Recipe changes require scenario/schema migration, not live mutation.

Fixed-proportion inputs are deliberate. Core v1 does not optimize input substitution inside a recipe. If two technologies can produce the same good, represent them as two recipes/ProductionUnits and let profitability/investment selection determine the mix.

5\. Effective capacity

For ACTIVE unit u:

nameplateBatches \= deriveNameplateCapacity(u, recipe)  
conditionFactor \= clamp(u.condition, 0, 1\)  
infrastructureFactor \= deriveInfrastructureFactor(world, u.regionId, recipe.infrastructureCategory)  
resourceAccessFactor \= deriveResourceAccessFactor(world, u.regionId, recipe)  
healthLaborProductivityFactor \= optional bounded Population-derived factor, default 1 and recommended range \[0.8,1.05\]

effectiveCapacityBatches \= nameplateBatches  
  × recipe.baseThroughputFactor  
  × conditionFactor  
  × infrastructureFactor  
  × resourceAccessFactor  
  × healthLaborProductivityFactor

All factors must have explicit physical/institutional provenance and configured bounds. Do not multiply arbitrary clan/state/event bonuses here. Events act by changing canonical damage/capacity/resource/infrastructure inputs.

For PLANNED, MOTHBALLED and CLOSING units normal effective production capacity is zero.

6\. Phase-2 ProductionPlan

TickContext.productionPlans is concretized as:

interface ProductionPlan {  
  planId: string;  
  unitId: ProductionUnitId;  
  tick: number;  
  recipeId: string;  
  effectiveCapacityBatches: number;  
  targetUtilization: number;  
  plannedBatches: number;  
  plannedOutputQuantity: number;  
  desiredInputQuantity: Record\<GoodId, number\>;  
  openingUsableInputQuantity: Record\<GoodId, number\>;  
  plannedInputPurchaseQuantity: Record\<GoodId, number\>;  
  procurementCashEnvelope: number;  
  grossWageCashEnvelope: number;  
  operatingLiquidityBuffer: number;  
  laborDemandPlanId: string;  
  investmentIntentIds: MarketIntentId\[\];  
  inputIntentIds: MarketIntentId\[\];  
  outputSellIntentId?: MarketIntentId;  
}

Phase-2 plans read only Phase-1 effective policy/jurisdiction plus prior-close prices/stocks/signals. They may not assume Phase-7 same-tick imports, same-tick sales revenue, Phase-10 owner distributions or future subsidies.

7\. Adaptive utilization rule

Production does not blindly run at 100% capacity. Use a bounded adaptive target based on recent realized evidence.

inventoryTargetOutput \= max(recipe.outputPerBatch, u.signals.outputSalesEma × outputCoverageTicks)  
outputInventoryGap \= clamp((inventoryTargetOutput \- u.outputInventory\[outputGood\]) / max(inventoryTargetOutput, quantityEpsilon), \-1, 1\)

rawUtilization \= baseTargetUtilization  
  \+ marginResponse × u.signals.marginSignalEma  
  \+ sellThroughResponse × (u.signals.sellThroughEma \- targetSellThrough)  
  \+ inventoryResponse × outputInventoryGap

targetUtilization \= clamp(rawUtilization, minTargetUtilization, maxTargetUtilization)  
plannedBatches \= effectiveCapacityBatches × targetUtilization  
plannedOutputQuantity \= plannedBatches × recipe.outputPerBatch

Recommended starting defaults, all configurable:  
baseTargetUtilization \= 0.70  
minTargetUtilization \= 0.10  
maxTargetUtilization \= 1.00  
targetSellThrough \= 0.80  
marginResponse \= 0.15  
sellThroughResponse \= 0.20  
inventoryResponse \= 0.25  
outputCoverageTicks \= 0.5 to 1.0

If the unit has no valid prior signals, initialize utilization near baseTargetUtilization and EMAs from scenario-neutral values. Do not use perfect future demand.

8\. Margin signal

Use a planning signal, not a full accounting optimizer.

expectedOutputPrice \= prior-close local net seller price for output good  
expectedInputCashCostPerBatch \= Σ\_g recipe.inputsPerBatch\[g\] × prior-close local gross buyer price appropriate to INPUT purpose  
expectedGrossWageCostPerBatch \= recipe.laborPerBatch × effectiveGrossWageOffer(u)  
expectedVariableCostPerBatch \= expectedInputCashCostPerBatch \+ expectedGrossWageCostPerBatch \+ other explicitly modeled variable charges  
expectedRevenuePerBatch \= recipe.outputPerBatch × expectedOutputPrice

marginSignalRaw \= (expectedRevenuePerBatch \- expectedVariableCostPerBatch) / max(expectedRevenuePerBatch, moneyEpsilon)  
marginSignal \= clamp(marginSignalRaw, \-1, 1\)

At Phase 15:  
u.signals.marginSignalEma \= ema(old, realized/planning margin signal, productionSignalAlpha)

Capital depreciation is not used to decide whether an additional batch is physically possible; it is accounted separately for profit tax/investment signals.

9\. Input targets and procurement intents

For each recipe input g:  
plannedUse\_g \= plannedBatches × recipe.inputsPerBatch\[g\]  
safetyUse\_g \= u.signals.inputUseEma\[g\] × inputSafetyCoverageTicks  
targetClosingInput\_g \= max(plannedUse\_g, safetyUse\_g) × inputCoverageTicks  
desiredInputPosition\_g \= plannedUse\_g \+ targetClosingInput\_g  
openingUsable\_g \= u.inputInventory\[g\]  
plannedPurchase\_g \= max(0, desiredInputPosition\_g \- openingUsable\_g)

Recommended inputCoverageTicks \= 0.5–1.5; inputSafetyCoverageTicks \<= 1.0. Keep buffers small so shortages matter.

Each planned purchase becomes the canonical MarketIntent:  
actor \= ProductionUnit  
regionId \= unit.regionId  
goodId \= g  
side \= BUY  
purpose \= INPUT  
desiredQuantity \= plannedPurchase\_g  
maxSpend \= its allocated share of procurementCashEnvelope  
sourcePlanId \= ProductionPlan.planId  
inventoryBucket \= INPUT

No Production subsystem purchase function exists. Phase 4 market settlement is the only local input purchase path. Imports allocated later in Phase 7 cannot feed this tick’s Phase-5 production.

10\. Working-capital envelope

Normal operating currency is Region.settlementCurrencyId. Foreign balances in a ProductionUnit wallet are not silently converted.

openingHomeCash \= u.wallet\[region.settlementCurrencyId\]  
mandatoryKnownCash \= due mandatory charges that must settle before discretionary owner distributions  
operatingLiquidityBuffer \= max(minOperatingCash, liquidityBufferShare × openingHomeCash)

First reserve payroll:  
rawLaborDemand \= plannedBatches × recipe.laborPerBatch  
legalGrossWageOffer \= max(u.wageOffer, effectiveMinimumWageFloor(region,state))  
maxAffordableLaborByOpeningCash \= max(0, openingHomeCash \- mandatoryKnownCash \- operatingLiquidityBuffer) / max(legalGrossWageOffer, moneyEpsilon)  
affordableLaborDemand \= min(rawLaborDemand, maxAffordableLaborByOpeningCash)  
grossWageCashEnvelope \= affordableLaborDemand × legalGrossWageOffer

Then procurement:  
availableForInputs \= max(0, openingHomeCash \- mandatoryKnownCash \- operatingLiquidityBuffer \- grossWageCashEnvelope)  
desiredInputCost \= Σ plannedPurchase\_g × expectedGrossInputPrice\_g  
procurementCashEnvelope \= min(availableForInputs, desiredInputCost)

Allocate procurementCashEnvelope across input intents by criticality:  
coverage\_g \= openingUsable\_g / max(plannedUse\_g, quantityEpsilon)  
criticality\_g \= clamp(1 / max(coverage\_g, 0.25), 1, maxInputCriticality)  
weight\_g \= plannedPurchase\_g × expectedGrossInputPrice\_g × criticality\_g  
intentMaxSpend\_g \= procurementCashEnvelope × weight\_g / Σ weights

The market budget-commitment ledger then enforces these maxSpend values. Unused Phase-4 budget does not automatically create additional labor or investment in the current tick.

11\. LaborSupplyPlan

Population owns labor supply. Production consumes it.

interface LaborSupplyPlan {  
  planId: string;  
  cohortId: CohortId;  
  regionId: RegionId;  
  laborCategory: string;  
  availableWorkerEquivalents: number;  
}

Only WORKING-age cohorts may submit normal labor. Baseline:

potentialWorkers \= cohort.population × workingEligibility × participationRate  
availableWorkerEquivalents \= clamp(potentialWorkers, 0, cohort.population)

participationRate is owned by the Population contract and is a configured, slow-moving value derived from health, law and bounded opportunity signals. Production code consumes LaborSupplyPlan and must not duplicate that calculation.

12\. LaborDemandPlan

interface LaborDemandPlan {  
  planId: string;  
  productionPlanId: string;  
  unitId: ProductionUnitId;  
  regionId: RegionId;  
  laborCategory: string;  
  requestedWorkerEquivalents: number;  
  grossWageOffer: number;  
  grossPayrollCap: number;  
}

requestedWorkerEquivalents \= affordableLaborDemand from Section 10\.  
grossPayrollCap \= grossWageCashEnvelope.

A unit with status other than ACTIVE requests zero normal labor. No labor demand may be financed by expected same-tick sales.

13\. Phase-3 regional labor allocation

TickContext.laborAllocations is concretized as:

interface LaborAllocation {  
  allocationId: string;  
  tick: number;  
  regionId: RegionId;  
  laborCategory: string;  
  cohortId: CohortId;  
  unitId: ProductionUnitId;  
  workerEquivalents: number;  
  grossWagePerWorker: number;  
  grossWageObligation: number;  
}

For each region × laborCategory:  
requested \= Σ unit requestedWorkerEquivalents  
available \= Σ cohort availableWorkerEquivalents  
matched \= min(requested, available)

Employer rationing is proportional to requested labor with a bounded wage-attractiveness weight:  
regionalReferenceWage \= supply-weighted cohort wageSignal or scenario starting wage when absent  
wageWeight\_u \= clamp((grossWageOffer\_u / max(regionalReferenceWage,moneyEpsilon))^laborWageAttractivenessElasticity, minWageWeight, maxWageWeight)  
weightedDemand\_u \= requested\_u × wageWeight\_u

Allocate matched labor with capped proportional water-filling so unit allocation never exceeds requested\_u. Stable residual correction order: unitId.

Allocate the resulting jobs across compatible cohorts proportional to availableWorkerEquivalents. Use a stable two-pointer matcher over cohort allocations and employer allocations rather than materializing all cohort×unit pairs. Stable order: cohortId, then unitId.

Core v1 baseline uses one GENERAL labor category unless a scenario demonstrably needs 2–3 broad categories. Do not create professions per recipe.

Employment persistence from the mature population design is deferred from core-v1 matching because employer-linked historical allocation would require another persistent matrix. The economic inertia is already provided by sticky wages, capacity and planning. If benchmark results show implausible complete monthly churn, v1.5 may add a compact previous-share cache; do not add it preemptively.

14\. Wage offer update

Wages are sticky and respond to regional labor tightness; they are not solved by a Walrasian auction.

For region r/category k at Phase 15:  
tightness \= clamp(log((requestedLabor \+ laborEpsilon) / (availableLabor \+ laborEpsilon)), \-maxTightnessSignal, \+maxTightnessSignal)  
regionalWageGrowth \= clamp(wageAdjustmentSpeed × tightness, \-maxLogWageStep, \+maxLogWageStep)

For ACTIVE unit u:  
vacancyRate\_u \= max(0, requested\_u \- allocated\_u) / max(requested\_u, laborEpsilon)  
unitPressure \= regionalWageGrowth \+ unitVacancyResponse × vacancyRate\_u  
nextOffer \= u.wageOffer × exp(clamp(unitPressure, \-maxLogWageStep, \+maxLogWageStep))  
u.wageOffer \= max(nextOffer, effectiveMinimumWageFloor for next tick)

Recommended defaults:  
wageAdjustmentSpeed \= 0.10  
maxLogWageStep \= ln(1.05)  
unitVacancyResponse \= 0.02  
laborWageAttractivenessElasticity \= 0.5  
minWageWeight \= 0.75  
maxWageWeight \= 1.5

All are scenario config. Wage changes calculated in Phase 15 affect N+1 only.

15\. Wage settlement and withholding

Phase 3 fixes gross wage obligations. Phase 5 pays them atomically after the allocated labor has been accepted for production. The ProductionUnit already reserved enough home-currency cash, so ordinary settlement cannot overdraw it.

M4 staging boundary: wage withholding must not instantiate the M6 fiscal-policy subsystem. Until M6, the one-region M4 scenario supplies the wage-tax inputs, collection efficiency and minimum-wage floor through deterministic read-only policy queries backed by explicit fixture/scenario values. These are scenario inputs, not hidden defaults, and the M4 boundary owns no treasury planning, transfers, debt, policy review or mutable fiscal-policy behavior. M6 later backs the same query semantics from canonical FiscalPolicyState without changing Phase-5 wage settlement. An uncontrolled Region collects zero State wage tax; no State minimum-wage floor is assumed unless an explicit applicable rule is supplied.

For allocation a:  
gross \= a.grossWageObligation  
stateId \= effective controller of a.regionId at Phase 1  
assessedTax \= applicableWageIncomeTax(cohort, gross, state policy)  
collectedTax \= assessedTax × collectionEfficiency(stateId)  
net \= gross \- collectedTax

Atomic bundle:  
1\) ProductionUnit wallet\[homeCurrency\] \-= gross  
2\) PopulationCohort wallet\[homeCurrency\] \+= net  
3\) State treasury\[homeCurrency\] \+= collectedTax, if controlled

Emit:  
WAGE\_PAYMENT: employer \-\> cohort, moneyAmount \= net, taxBaseAmount/gross amount available in linked metadata/telemetry.  
WAGE\_TAX\_WITHHELD: employer on behalf of cohort \-\> State, moneyAmount \= collectedTax, originatingTransactionId \= WAGE\_PAYMENT transaction or same bundleId.

Required identity:  
employer gross debit \= cohort net receipt \+ State collected wage-tax receipt.

The uncollected assessed portion, if collectionEfficiency \< 1, remains with the cohort by increasing net accordingly; it is not destroyed. No separate payroll/social-security tax exists in core v1.

Current-tick net wages are available for household Phase-8 purchases. Phase 10 must not tax these wages a second time.

16\. Phase-5 realized production

For each ACTIVE unit, use actual post-Phase-4 inventory and actual Phase-3 labor allocation.

inputBoundBatches \= min over inputs g of u.inputInventory\[g\] / recipe.inputsPerBatch\[g\]  
laborBoundBatches \= allocatedLabor\_u / max(recipe.laborPerBatch, laborEpsilon), with \+Infinity when laborPerBatch=0  
capitalBoundBatches \= productionPlan.effectiveCapacityBatches  
resourceBoundBatches \= derive finite extraction bound; \+Infinity for non-extraction recipe

realizedBatches \= max(0, min(plannedBatches, inputBoundBatches, laborBoundBatches, capitalBoundBatches, resourceBoundBatches))

For each input g:  
actualInputUse\_g \= realizedBatches × recipe.inputsPerBatch\[g\]  
u.inputInventory\[g\] \-= actualInputUse\_g

If extraction recipe:  
actualExtraction \= realizedBatches × recipe.extractedResourcePerBatch  
resourceDeposit.remainingQuantity \-= actualExtraction

outputProduced \= realizedBatches × recipe.outputPerBatch  
u.outputInventory\[recipe.outputGoodId\] \+= outputProduced

Production does not refund unused labor after Phase 3: workers allocated for the month are paid their fixed gross wage obligation even if an unexpected input bottleneck reduces realized batches. This gives shortages a real cost and avoids retroactive labor rematching. Planners should adapt next tick.

No random manufacturing multiplier is applied in normal core v1.

17\. Output sale intent

After Phase-5 production and before Phase-6 price formation, ProductionUnit exposes a SELL intent through the canonical market stack.

targetOutputReserve \= u.signals.outputSalesEma × outputCoverageTicks  
sellableOutput \= max(0, u.outputInventory\[outputGood\] \- targetOutputReserve)

MarketIntent:  
actor \= ProductionUnit  
regionId \= unit.regionId  
goodId \= outputGood  
side \= SELL  
purpose \= INVENTORY\_REBALANCE  
// purpose may later gain OUTPUT\_SALE alias, but no separate clearing path is needed  
desiredQuantity \= sellableOutput  
minimumReserveQuantity \= targetOutputReserve  
sourcePlanId \= ProductionPlan.planId  
inventoryBucket \= OUTPUT

All local sales, exports, taxes, FX and shipment ownership use MARKETS\_TRADE\_FX\_CONTRACTS unchanged. The Production subsystem never credits sale revenue itself.  
Phase-4 carried OUTPUT is PRE\_PRODUCTION-only; Phase 5 recomputes the later MAIN offer from the stock that remains.

18\. Production telemetry and realized operating result

Per unit per tick record at least:  
plannedBatches, realizedBatches, utilization \= realizedBatches/max(effectiveCapacityBatches,epsilon), inputUse by good, unmetInputPlan by good, laborRequested, laborAllocated, grossWages, net household wages, wageTax, outputProduced, outputSoldLocal, outputExported, endingOutputInventory, cashRevenue, inputCashCost, transportFeesPaid, investmentCashSpend, depreciationUnits, eventCapitalLoss, taxableProfitBase when later fiscal code computes it.

Cash operating surplus before profit tax/dividends:  
cashOperatingSurplus \= cashRevenue \- inputCashCost \- grossWageCashCost \- explicitOperatingFees

Standardized fiscal profit base is owned by the fiscal contract and may subtract allowed depreciation. Do not treat owner funding, grants, borrowing proceeds or inventory revaluation as operating revenue.

At Phase 15 update:  
sellThrough \= soldOutput / max(outputOffered, quantityEpsilon), using 1 when neither offered nor sold only if configured; recommended neutral initialization instead.  
utilizationEma \= EMA(realized utilization)  
sellThroughEma \= EMA(realized sell-through)  
outputSalesEma \= EMA(local \+ export sold quantity)  
inputUseEma\[g\] \= EMA(actualInputUse\_g)  
marginSignalEma \= EMA(realized/planning normalized margin signal)

19\. Investment planning

M4 implementation normalization (HANDOFF-REPAIR-M4-004): investment review cadence defaults to every 3 ticks. A normal capacity-investment review is due only when tick \> 0 and tick % investmentReviewCadenceTicks \== 0; investmentReviewCadenceTicks must be an integer \>= 1\. Tick 0 is genesis and emits no ordinary capacity-expansion intents. REQ-PRODUCTION-002 implements ordinary Phase-2 investment-intent planning for ACTIVE units only. Eligible MOTHBALLED expansion is activated later by REQ-PRODUCTION-007 once reactivation eligibility is implemented; PLANNED units use startup funding rules instead.

Positive investment pressure is intentionally small:  
demandPressure \= clamp((u.signals.utilizationEma \- investmentUtilizationThreshold) / max(1-investmentUtilizationThreshold,epsilon), \-1, 1\)  
marginPressure \= max(0, u.signals.marginSignalEma \- minimumInvestmentMargin)  
salesPressure \= max(0, u.signals.sellThroughEma \- targetSellThrough)  
positivePressure \= clamp((demandPressure \+ marginPressure \+ salesPressure) / 3, 0, 1\)  
Core-v1 investment-pressure weights are fixed and equal: wUtil \= wMargin \= wSales \= 1/3. They are formula constants, not SimulationConfig fields; changing them requires a specification/version change.

homeCash \= u.wallet\[region.settlementCurrencyId\]  
desiredNextTickInputEnvelopeEstimate \= desiredInputCost from Section 10, computed only from opening inventories, the current Phase-2 plan and prior-close gross INPUT prices  
workingCapitalTarget \= mandatoryKnownCash \+ grossWageCashEnvelope \+ desiredNextTickInputEnvelopeEstimate \+ operatingLiquidityBuffer  
investableCash \= max(0, homeCash \- workingCapitalTarget)  
investmentBudget \= investableCash × clamp(investmentPropensity × positivePressure, 0, maxInvestmentShareOfExcessCash)

No investment is created by the budget. It only funds MarketIntent BUY with purpose=INVESTMENT for the recipe’s investment goods. Same canonical market/trade/FX rules apply.  
INPUT and INVESTMENT budget commitments are distinct, non-reusable envelopes. MarketIntent.sourcePlanId remains ProductionPlan.planId; the budget ledger must use a separate deterministic investment commitment key so investment maxSpend cannot consume or masquerade as the INPUT procurement envelope. Sum INVESTMENT maxSpend \<= investmentBudget, and because investmentBudget is derived only after the Section-10 mandatory/payroll/input/liquidity reserves, combined Phase-2 commitments cannot rely on same-tick sales, Phase-7 imports, later owner distributions, future subsidies or implicit credit.

Recommended starting defaults:  
investmentReviewCadenceTicks \= 3  
investmentUtilizationThreshold \= 0.75  
minimumInvestmentMargin \= 0.05  
investmentPropensity \= 0.35  
maxInvestmentShareOfExcessCash \= 0.50

20\. Investment-goods target and intents

Choose desired additional installed capital from bounded pressure:  
maxDesiredCapitalAddition \= u.installedCapital × maxCapitalGrowthPerReview  
capitalAdditionTarget \= maxDesiredCapitalAddition × positivePressure

For each investment good g:  
required\_g \= capitalAdditionTarget × recipe.investmentGoodsPerCapitalUnit\[g\]  
onHand\_g \= u.investmentInventory\[g\]  
desiredPurchase\_g \= max(0, required\_g \- onHand\_g)  
For every desiredPurchase\_g \> quantityEpsilon, the prior-close gross buyer price for INVESTMENT must exist, be finite and \> 0; otherwise planning fails fast. Iterate investment goods in stable goodId order. Planning creates only intents and plan IDs; it does not mutate investmentInventory or installedCapital.

Allocate investmentBudget across required goods by required cash share, using prior-close gross buyer prices. Submit canonical MarketIntent BUY purpose=INVESTMENT with inventoryBucket=INVESTMENT. Market settlement transfers purchased goods into investmentInventory, not inputInventory. The same bucket is copied into any delayed TradeShipment so imported investment goods arrive in investmentInventory rather than a generic ProductionUnit stock.  
M4 ownership boundary: REQ-PRODUCTION-002 owns this Phase-2 investment-intent construction and cash-envelope evidence. REQ-PRODUCTION-006 consumes the resulting investmentInventory and owns Phase-12 capital formation/depreciation. Section 17 output SELL intents are created only after Phase-5 output exists and therefore are owned by REQ-PRODUCTION-005; ProductionPlan.outputSellIntentId remains unset during Phase 2 and may be attached by that later slice.  
Required planning regressions for this slice: off-cadence produces no INVESTMENT intents; due-cadence planning is deterministic; mandatory cash, payroll, desired-input reserve and liquidity buffer are protected before investment; summed INVESTMENT maxSpend is within investmentBudget and the canonical budget ledger; same-tick sales/imports/later distributions/future subsidies cannot finance investment; missing or invalid required price evidence fails fast; insertion-order changes do not change plans/IDs; planning alone mutates no inventory or capital.

maxCapitalGrowthPerReview recommended 0.20–0.35. This cap prevents exponential browser/economy explosions and makes investment visually legible.

21\. Phase-12 capital formation

Private capital appears only by consuming actual investment goods.

possibleCapitalFromGoods \= min over required investment goods g of investmentInventory\[g\] / recipe.investmentGoodsPerCapitalUnit\[g\]  
executionCap \= maxCapitalBuildPerTick or \+Infinity if not separately configured  
capitalBuilt \= max(0, min(possibleCapitalFromGoods, executionCap))

For each investment good g:  
consumedInvestmentGood\_g \= capitalBuilt × recipe.investmentGoodsPerCapitalUnit\[g\]  
investmentInventory\[g\] \-= consumedInvestmentGood\_g

Then:  
installedCapital\_preDep \= installedCapital \+ capitalBuilt  
depreciationUnits \= installedCapital\_preDep × recipe.depreciationRatePerTick  
installedCapital\_next \= max(0, installedCapital\_preDep \- depreciationUnits)  
derivedNameplateCapacity\_next \= installedCapital\_next × recipe.batchesPerCapitalUnit

New capacity is available only next tick because Phase 12 occurs after current production.

Depreciation is a physical capital reduction with no cash recipient and no money destruction. Fiscal allowed-depreciation charge may use depreciationUnits × configured capital valuation convention but must not mutate capital a second time.

22\. Startup / PLANNED ProductionUnit contract

Candidate evaluation occurs only on Production lifecycle review ticks in Phase 14\. A candidate may be created only when:  
\- region is eligible/settled enough and recipe legal/physically feasible;  
\- owner is a live Clan or State allowed to own that unit;  
\- expected bounded viability score exceeds startup threshold;  
\- owner makes an explicit cash transfer into the new ProductionUnit wallet or an already-settled grant provides cash;  
\- no money, goods or capital are created by unit creation.

New unit starts status=PLANNED, installedCapital=0 unless scenario initialization explicitly seeds existing capital, derived nameplate capacity=0, condition=1, inventories empty, and normal neutral signals.

A PLANNED unit submits INVESTMENT intents for startup goods using its own wallet. It does not hire or produce.

Activation condition checked at Phase 14:  
startupCapitalReady \= installedCapital \>= recipe.minimumStartupCapital  
minimumInfrastructureReady \= infrastructureFactor \>= recipe.minimumInfrastructureFactor  
operatingCashReady \= homeCash \>= configuredStartupOperatingCashFloor

If all true, queue/commit status ACTIVE for next tick. Do not activate mid-tick after Phase-12 build and retroactively produce.

23\. Owner funding

Owner funding is a cash transfer only:  
Clan/State treasury\[fundingCurrency\] \-= amount  
ProductionUnit wallet\[fundingCurrency\] \+= amount

If funding currency differs from region settlement currency, any needed conversion uses the single canonical FX primitive before/within the explicit owner-transfer bundle according to MARKETS\_TRADE\_FX\_CONTRACTS. Production never calls a hidden converter.

Owner funding creates neither equity shares nor debt claims in core v1; ownership is already exactly one Clan or State. There is no private-credit liability.

24\. Dividends / owner distributions

Normal distributions occur in Phase 10 after realized operating flows and applicable business-profit tax are known.

homeCash \= unit wallet in region settlement currency  
retainedLiquidityTarget \= next operating liquidity buffer \+ expected gross payroll \+ expected input procurement \+ configured investment reserve  
postTaxDistributableCash \= max(0, homeCash \- retainedLiquidityTarget \- unpaid mandatory obligations)

dividend \= postTaxDistributableCash × dividendPayoutRate

Clamp by available home cash. Transfer ProductionUnit \-\> owner treasury exactly. State-owned units use identical logic except fiscal spec may exempt them from State paying itself profit tax.

Recommended dividendPayoutRate \= 0.25–0.50. No dividend from foreign-currency balances unless an explicit FX/owner-transfer operation is made.

25\. Mothballing, reactivation and closing

Lifecycle review cadence defaults to every 3 ticks and occurs in Phase 14\.

Define viability observations from bounded realized signals, not a perfect forecast.

nonviable \=  
  u.signals.marginSignalEma \< mothballMarginThreshold  
  AND u.signals.utilizationEma \< mothballUtilizationThreshold

On each review:  
if nonviable: consecutiveNonviableReviews \+= 1 else reset to 0\.

ACTIVE \-\> MOTHBALLED when consecutiveNonviableReviews \>= mothballAfterReviews.  
Recommended starting values: mothballMarginThreshold=-0.10, mothballUtilizationThreshold=0.25, mothballAfterReviews=2.

MOTHBALLED units do not hire, procure normal inputs or produce. They retain wallet/inventories/capital and may sell excess output/inventory through normal market intents if configured for liquidation.

viableForReactivation \= expected margin signal \> reactivateMarginThreshold AND infrastructure/legal eligibility restored AND installedCapital \>= minimumStartupCapital AND operating cash floor met.  
MOTHBALLED \-\> ACTIVE after consecutiveViableReviews \>= reactivateAfterReviews, recommended 2\.

MOTHBALLED \-\> CLOSING when prolonged nonviability exceeds closeAfterReviews or installedCapital falls below configured irrecoverable fraction and owner will not recapitalize. Recommended closeAfterReviews \>= 6 lifecycle reviews.

CLOSING:  
\- no hiring, production or new investment;  
\- cancel future discretionary plans;  
\- sell transferable inventories through ordinary SELL intents;  
\- investment/input inventory may be liquidated as goods;  
\- installed capital may be scrapped only via explicit capital-scrap rule if enabled, producing at most a configured fraction of defined salvage goods; default core v1 permits zero-value physical retirement after a long closing grace only if logged as CAPITAL\_RETIREMENT destruction;  
\- remaining cash transfers to owner only after obligations and stocks are resolved.

Registry removal remains governed by CORE\_SCHEMA: all unit-owned canonical stocks are zero within tolerance and no shipment/reference points to the unit.

26\. Extraction and finite resources

Extraction uses the same recipe engine. ResourceDeposit is neither a market inventory nor free recurring production.

resourceBoundBatches \= remainingDeposit / recipe.extractedResourcePerBatch

realized extraction reduces deposit exactly once during Phase 5\. Resource discovery only changes eligibility/knowledge; it does not add quantity. Depleted deposit caps realizedBatches at zero regardless of labor/input/cash.

If an extraction recipe has no material inputs, labor and capital can still bind it. If it also has zero labor, capital/deposit still bind it; completely unconstrained recipes are invalid.

27\. Infrastructure interface

deriveInfrastructureFactor reads Region.infrastructure and recipe.infrastructureCategory. Suggested generic shape:

if no required category: factor=1  
else coverage \= availableInfrastructureCapacity / max(requiredInfrastructurePerNameplateCapacity,epsilon)  
factor \= clamp(coverage, minimumOperationalInfrastructureFactor, 1\)

The public-infrastructure stock schema is defined by the fiscal and expansion implementation contracts. Production consumes only the resulting bounded factor and may not mutate public infrastructure.

28\. Tax and law interfaces

Production consumes pure queries from effective Phase-1 law/state. During M4, any query whose full institutional owner is scheduled for M6 must be supplied as an explicit deterministic read-only fixture/scenario input; M4 must not construct mutable FiscalPolicyState, fiscal planning, debt, transfers or policy dynamics merely to answer these queries:  
\- effectiveMinimumWageFloor(regionId, laborCategory)  
\- applicableWageIncomeTax(cohortId, grossWage)  
\- applicableBusinessProfitTax(unitId, standardizedTaxBase)  
\- ownershipAllowed(owner, regionId, recipeId)  
\- productionAllowed(regionId, recipeId)

Policy changes decided later in tick N cannot alter N production or wage obligations.

Minimum wage affects gross wage offers/demand affordability; it never directly changes productivity. Subsidies/grants are cash transfers only. State-owned units obey the same physical formulas as Clan-owned units.

29\. Explicit TickContext additions

TickContext \+= {  
  productionPlans: Record\<ProductionUnitId, ProductionPlan\>;  
  laborSupplyPlans: LaborSupplyPlan\[\];  
  laborDemandPlans: LaborDemandPlan\[\];  
  laborAllocations: LaborAllocation\[\];  
  productionTelemetry: ProductionTickTelemetry;  
}

Planning records are ephemeral and excluded from canonical replay checkpoints unless debug fixtures request them. Persistent state after settlement is ProductionUnit/Cohort/Region stocks plus transactions and small EMAs.

30\. Recommended deterministic module APIs

ProductionPlanner.buildPlans(world, ctx)  
ProductionPlanner.buildInputIntents(world, ctx, plan)  
LaborPlanner.buildCohortSupply(world, ctx)  
LaborAllocator.allocate(world, ctx)  
WageSettlement.execute(world, ctx, allocation)  
ProductionExecutor.execute(world, ctx, productionPlan)  
ProductionSales.buildSellIntents(world, ctx)  
InvestmentPlanner.buildIntents(world, ctx)  
CapitalFormation.execute(world, ctx)  
ProductionLifecycle.review(world, ctx)  
ProductionSignals.closeTick(world, ctx)

Planning/allocation functions should be pure where practical. Canonical stock mutation belongs in explicit settlement/execution functions.

31\. Stable ordering

Production planning: unitId.  
Input intents: unitId \-\> goodId.  
Labor groups: regionId \-\> laborCategory.  
Employer residual correction: unitId.  
Cohort residual correction/matching: cohortId \-\> unitId.  
Production execution: unitId.  
Investment conversion: unitId \-\> goodId.  
Lifecycle review: unitId.

Never use dictionary insertion order or mutable RNG call order.

32\. Expected economic failure versus invariant failure

Expected economic outcomes, not exceptions:  
\- insufficient input supply \-\> partial/no Phase-4 fill and lower realized batches;  
\- insufficient labor \-\> partial employment and lower output;  
\- insufficient unit cash \-\> labor/procurement/investment plan is capped;  
\- depleted resource \-\> zero extraction despite demand;  
\- poor infrastructure/damage \-\> bounded capacity impairment;  
\- weak sales/margin \-\> lower utilization, mothballing or closure;  
\- investment goods shortage \-\> investmentInventory accumulates partially and capacity waits;  
\- owner refuses/cannot fund startup \-\> PLANNED unit remains unready or eventually closes.

Invariant/programmer failures:  
\- negative wallet/inventory/deposit/capital beyond epsilon;  
\- production output without matching realized recipe batches;  
\- input consumption not matching batch coefficients;  
\- wages exceed Phase-3 obligation or payroll reserve;  
\- worker allocated twice/above cohort supply;  
\- derived nameplate capacity does not match installedCapital × recipe.batchesPerCapitalUnit, or a cache is mutated independently;  
\- unit bypasses MarketIntent for ordinary input/investment purchases or sales;  
\- same investment good counted in two inventories;  
\- same-tick imported input used in Phase 5 contrary to arrival rules;  
\- lifecycle removal with residual stock/reference.

33\. Accounting and physical invariants

PCL-I1 For each produced good: output increase from production \== Σ realizedBatches × recipe.outputPerBatch.  
PCL-I2 For each intermediate input: unit input decrease \== Σ realizedBatches × recipe.inputsPerBatch, excluding separately logged spoilage/destruction.  
PCL-I3 Extraction decrease \== Σ realizedBatches × extractedResourcePerBatch.  
PCL-I4 realizedBatches \<= plannedBatches and every physical/labor/capital/resource bound within tolerance.  
PCL-I5 No ProductionUnit ordinary purchase/sale bypasses canonical market/trade settlement.  
PCL-I6 Sum labor allocated from a cohort \<= its availableWorkerEquivalents.  
PCL-I7 Sum labor allocated to a unit \<= its requestedWorkerEquivalents.  
PCL-I8 No labor allocation references non-WORKING/ineligible supply.  
PCL-I9 Employer gross wage debit \== cohort net wage \+ State collected wage tax for every wage bundle.  
PCL-I10 Gross payroll settled by a unit \<= its Phase-3 gross payroll cap and available home-currency cash.  
PCL-I11 Input procurement settled \<= MarketIntent maxSpend and does not consume same-tick Phase-7 imports.  
PCL-I12 Investment goods bought are real inventory until consumed; cash spend alone never increases capital.  
PCL-I13 Capital increase \== capitalBuilt from consumed investment recipe goods.  
PCL-I14 Capital decrease outside explicit event/retirement \== configured depreciation exactly once per tick.  
PCL-I15 derived nameplate capacity \== installedCapital × batchesPerCapitalUnit within tolerance; any cache is non-authoritative.  
PCL-I16 Phase-12 capital formed cannot affect Phase-5 output of the same tick.  
PCL-I17 State- and Clan-owned identical units with identical state/inputs/labor produce identically.  
PCL-I18 MOTHBALLED/CLOSING/PLANNED units produce zero normal output.  
PCL-I19 ProductionUnit creation/owner funding conserves money and creates no goods/capital.  
PCL-I20 Dividend is an equal ProductionUnit debit/owner credit and cannot overdraw required retained liquidity.  
PCL-I21 Unit removal occurs only after all owned canonical stocks/references are resolved.  
PCL-I22 Same semantic world state/config/version yields identical plans, allocations, production, IDs and lifecycle results independent of registry insertion order.

34\. Required unit/integration tests

PCL-T1 One-input recipe with ample labor/capital produces exact Leontief output and consumes exact input.  
PCL-T2 Two-input recipe is capped by the scarcer input; unused other input remains inventory.  
PCL-T3 Labor shortage caps realized batches while all allocated workers receive their fixed Phase-3 wage obligation.  
PCL-T4 Payroll affordability caps labor demand before allocation; unit wallet never becomes negative.  
PCL-T5 Minimum wage raises gross offer/payroll requirement and can reduce affordable labor demand without a direct productivity bonus.  
PCL-T6 Wage withholding conserves cash and Phase-10 does not double-tax the same wage transaction.  
PCL-T7 Proportional labor allocation is insertion-order invariant and no cohort/unit bound is exceeded.  
PCL-T8 Higher wage offer gains only bounded attractiveness advantage; it cannot exceed requested labor.  
PCL-T9 Tight labor market raises next-tick wage offers within max step; slack lowers them within max step.  
PCL-T10 Phase-4 input shortage reduces Phase-5 output; a Phase-7 import cannot retroactively fix it.  
PCL-T11 Prior-tick shipment delivered in Phase 1 can be used in current Phase-4 procurement/Phase-5 production when owned by the unit.  
PCL-T12 Output enters unit inventory first and sale revenue appears only through canonical market/trade transaction.  
PCL-T13 Export sale uses the same ProductionUnit output inventory and does not create a second export stock.  
PCL-T14 Investment purchase changes investmentInventory but not installedCapital immediately.  
PCL-T15 Phase-12 conversion consumes exact investment goods and increases installedCapital once; derived nameplate capacity changes exactly with it.  
PCL-T16 Depreciation reduces installedCapital exactly once, reduces derived nameplate capacity accordingly, and creates no cash flow.  
PCL-T17 Event damage to condition lowers effective capacity without deleting unrelated cash/inventory.  
PCL-T18 Finite deposit depletion caps extraction and never produces negative deposit quantity.  
PCL-T19 Unprofitable/underutilized ACTIVE unit requires configured consecutive review failures before MOTHBALLED.  
PCL-T20 MOTHBALLED unit can reactivate only after configured viable reviews and readiness gates.  
PCL-T21 PLANNED startup cannot activate from owner cash alone; required real investment capital must exist.  
PCL-T22 Owner injection is cash-conserving and does not change capacity in the transfer transaction.  
PCL-T23 State-owned and Clan-owned fixture produces identical physical output under identical physical/economic conditions.  
PCL-T24 CLOSING unit with residual shipment/inventory cannot be removed.  
PCL-T25 600-tick multi-region chain benchmark reconciles goods, labor, wages, capital, deposits and unit cash with no phantom production/capital.  
PCL-T26 Same seed/config with reordered registries yields identical production/labor/capital snapshot sequence.

35\. Golden scenarios

A. Simple food economy. One farm recipe, abundant deposit/input, one labor market. Output converges around demand; wage and price adjustment are bounded; no free stocks appear.

B. Input bottleneck chain. Raw material \-\> intermediate \-\> final good. Intermediate shortage propagates one tick at a time through actual inventories and prices rather than an instantaneous global solver.

C. Labor boom. New profitable capacity raises labor demand, wage offers and employment; labor scarcity limits output and attracts later migration through Population, not through a production bonus.

D. Capital deepening. Sustained high utilization/profit funds real capital-good purchases. Capacity rises only after Phase-12 conversion; capital-good shortage slows expansion.

E. Depreciation trap. Investment stops while capital depreciates. Capacity/output decline gradually even with demand/cash.

F. Resource depletion. Extractive region initially booms, deposit declines, output becomes resource-bound, profitability/investment weaken and downstream trade adjusts.

G. Disaster damage. Event cuts condition/infrastructure. Output falls mechanically through effective capacity; recovery requires existing event/infrastructure rules, not a production-specific scripted rebound.

H. Mixed ownership. Identical State- and Clan-owned units obey identical recipes/labor/capital constraints; only funding, taxation and distributions differ.

36\. Complexity target

Let U \= ProductionUnits, C \= cohorts, G\_r \= recipe input count, A \= labor allocations.

Per tick target:  
\- production planning O(Σ\_u G\_r), normally O(U × small recipe width);  
\- labor supply O(C);  
\- regional/category aggregation O(U \+ C);  
\- stable labor allocation O((U+C) log(U+C)) worst-case sorting, near linear with deterministic indexes;  
\- wage settlement O(A), with A bounded by matched cohort/unit segments rather than C×U;  
\- production execution O(Σ\_u G\_r);  
\- investment planning/conversion only on cadence, O(Σ eligible investment-good counts);  
\- lifecycle review O(U) on cadence.

Never build a worker-by-job matrix. Never search all firms for every worker. Never solve a global input-output equilibrium each tick.

37\. Configuration surface

ProductionConfig must include at least:  
baseTargetUtilization, minTargetUtilization, maxTargetUtilization, marginResponse, sellThroughResponse, inventoryResponse, targetSellThrough, outputCoverageTicks, inputCoverageTicks, inputSafetyCoverageTicks, productionSignalAlpha, minOperatingCash, liquidityBufferShare, maxInputCriticality, investmentReviewCadenceTicks, investmentUtilizationThreshold, minimumInvestmentMargin, investmentPropensity, maxInvestmentShareOfExcessCash, maxCapitalGrowthPerReview, lifecycleReviewCadenceTicks, mothballMarginThreshold, mothballUtilizationThreshold, mothballAfterReviews, reactivateMarginThreshold, reactivateAfterReviews, closeAfterReviews, closingGraceReviews, quantity/capital tolerances.

LaborConfig must include at least:  
baselineParticipationRate or Population-owned reference, laborWageAttractivenessElasticity, minWageWeight, maxWageWeight, wageAdjustmentSpeed, maxLogWageStep, unitVacancyResponse, maxTightnessSignal, laborEpsilon, allowed labor categories.

Scenario RecipeDefinitions own recipe-specific coefficients and depreciation. State policy owns minimum wage/taxes/ownership gates. MarketConfig owns prices/clearing. Do not duplicate those values in ProductionConfig.

38\. Migration map from current repository

Preserve conceptually:  
\- Pop.Produce() transparency \-\> ProductionExecutor.execute with explicit visible formula and telemetry;  
\- Pop.Inventory \-\> split into cohort household Inventory and ProductionUnit input/output/investment inventories according to ownership;  
\- Pop.Money safety against overdraft \-\> Wallet preflight/no-negative invariant;  
\- City/local-market locality \-\> ProductionUnit.regionId \+ LocalMarket;  
\- SimulationConfig centralized tunables \-\> typed ProductionConfig/LaborConfig/RecipeDefinitions;  
\- Storage stock semantics \-\> sparse Inventory stock semantics.

Replace:  
\- PopType Farmer/Woodcutter/Crafter as simultaneous demographic+production identity \-\> PopulationCohort \+ Recipe-driven ProductionUnit;  
\- fixed ProductionPower \-\> installed capital \+ recipe throughput \+ bounded physical factors;  
\- Count directly multiplying output \-\> labor supplied by cohorts and explicitly allocated to units;  
\- cityModifier/noise as opaque multipliers \-\> named infrastructure/resource/condition/health factors and EVENTS;  
\- producer self-consumption/purchase sequence \-\> canonical MarketIntent/clearing;  
\- no capital stock \-\> investmentInventory \+ installedCapital \+ depreciation;  
\- implicit employerless income \-\> explicit gross wages and withholding transactions.

39\. Hard v1 exclusions

Do not add while implementing this spec: individual workers, occupations per recipe, education/skill trees, labor unions/collective bargaining, employer-specific contracts, wage arrears, private credit/working-capital loans, bankruptcy court, equity shares, mergers/acquisitions, monopolistic strategic pricing, production function substitution/CES, per-machine assets, detailed maintenance crews, free repair, random routine productivity noise, R\&D/technology tree, land/property rents, hidden firm FX conversion, inventory valuation accounting, depreciation tax schedules beyond one standardized rule.

40\. Acceptance gate

This unit is implementation-ready when Codex/Claude can implement Phase 2 production planning, Phase 3 labor allocation, Phase 5 wage settlement/production, ProductionUnit market intents, Phase 12 private capital formation and Phase 14 unit lifecycle without choosing new economic rules.

Required acceptance:  
\- RecipeDefinition and additive ProductionUnit fields are represented equivalently;  
\- production is Leontief/bottlenecked by explicit inputs, labor, capacity and resources;  
\- unit cash caps labor/procurement before settlement, never by overdraft;  
\- all ordinary input/investment purchases and output sales use canonical MarketIntent/settlement;  
\- labor is aggregate regional matching with no double allocation;  
\- wage offers are gross, sticky and N+1 adjusted;  
\- wage tax withholding is atomic and not double-settled;  
\- investment requires real purchased goods and only affects later capacity;  
\- capital depreciates explicitly;  
\- lifecycle uses canonical PLANNED/ACTIVE/MOTHBALLED/CLOSING states and consecutive-review thresholds;  
\- State/Clan ownership changes financing/distribution only, not physical production law;  
\- all PCL invariants/tests above pass;  
\- browser complexity stays mesoscopic.

41\. Dependency note

Population \+ Demography \+ Clans implementation is defined in 06 — POPULATION\_DEMOGRAPHY\_CLANS\_CONTRACTS. That contract consumes LaborSupplyPlan and wage receipts from this subsystem and must not introduce a second labor market.

Conclusion

Core-v1 production is intentionally compact: recipe coefficients, real inventories, one regional aggregate labor market, sticky gross wages, explicit cash envelopes, durable capital formed from bought goods, finite resources, bounded adaptive utilization and a slow lifecycle. This is enough to generate specialization, shortages, wage competition, investment booms, overcapacity, resource depletion, firm failure and supply-chain propagation while keeping every unit of goods, money, labor and capital traceable and implementable in a browser.