/**
 * Canonical M4 one-region closed-economy composition (REQ-PRODUCTION-008).
 *
 * This file does not define new economic formulas. It composes the M4 planners and
 * transitions already owned by REQ-PRODUCTION-001..007 / REQ-POPULATION-001..003 with
 * the M3 local-market primitive. Phase 7 is intentionally inert: trade/shipments/FX are M5.
 */

import { createDefaultSimulationConfig } from "../config/simulationConfig";
import type { GoodId, MarketId, ProductionUnitId, RegionId, StateId } from "../domain/id";
import { stableOrderBy } from "../domain/ordering";
import { addLedgerRecord } from "./ledger";
import {
  computeLocalClearing,
  computeEffectiveDemand,
  computeSellableQuantity,
  type LocalClearingInput,
  type MarketAllocation,
} from "./marketClearing";
import type { MarketIntent } from "./marketIntent";
import { executeMarketSettlement, type TaxPolicyProvider } from "./marketSettlement";
import {
  applyMarketSettlementTransition,
  executeAllocation,
} from "./marketSettlementTransition";
import { applyMarketStateTransition } from "./marketStateTransition";
import {
  createCanonicalPhase2ProductionPlanningHandler,
} from "./productionPlanning";
import { createPhase2LaborSupplyPlanningHandler } from "./laborSupplyPlanning";
import { createPhase2HouseholdConsumptionPlanningHandler } from "./householdConsumptionPlanning";
import { createPhase3LaborAllocationHandler } from "./laborAllocation";
import {
  applyWageSettlementTransition,
  createPhase5WageSettlementHandler,
  type WageTaxPolicyProvider,
} from "./wageSettlement";
import {
  applyProductionExecutionTransition,
  createPhase5ProductionExecutionHandler,
} from "./productionExecution";
import {
  createPhase6Handler,
  type Phase6PriceConfig,
} from "./phase6MarketPriceFormation";
import { createPhase8Handler } from "./phase8MainMarketClearing";
import {
  applyHouseholdConsumptionTransition,
  planHouseholdConsumptionPhase9,
} from "./householdConsumptionExecution";
import {
  applyCapitalFormationTransition,
  createPhase12CapitalFormationHandler,
} from "./capitalFormation";
import {
  applyProductionUnitLifecycleReviewTransition,
  applyProductionUnitLifecycleTransitionsAtPhase1,
  createPhase14ProductionUnitLifecycleHandler,
} from "./productionUnitLifecycle";
import {
  applyWageOfferStateTransition,
  createPhase15WageOfferUpdateHandler,
} from "./wageOfferUpdate";
import {
  composePhaseHandlers,
  type PhaseHandler,
  type TickContext,
} from "./tickOrchestrator";
import {
  executeStatefulTick,
  type PhaseWorldTransitionObserver,
  type StatefulTickExecutionResult,
} from "./statefulTickOrchestrator";
import type { RegionState, WorldState } from "./worldState";
import "./m4ClosedEconomyContext";

export interface M4ClosedEconomyOptions {
  /** Explicit read-only M4 scenario policy. Mutable fiscal policy remains M6. */
  readonly taxPolicy: TaxPolicyProvider;
  /** Explicit read-only M4 wage-tax scenario policy. Mutable fiscal policy remains M6. */
  readonly wageTaxPolicy: WageTaxPolicyProvider;
  /** M3 Phase-6 formula inputs. Price clamps remain explicit scenario/test inputs. */
  readonly priceConfig: Phase6PriceConfig;
  readonly collectMarketTelemetry?: boolean;
}

function requireSingleRegion(world: WorldState): RegionState {
  if (world.regions.size !== 1) {
    throw new Error(
      `REQ-PRODUCTION-008 M4 closed-economy runner requires exactly one live Region, got ${world.regions.size}`,
    );
  }
  return [...world.regions.values()][0]!;
}

function requireSingleLocalMarket(world: WorldState, region: RegionState) {
  const markets = stableOrderBy(
    [...world.markets.values()].filter((market) => market.seed.regionKey === region.seed.key),
    (market) => String(market.marketId),
  );
  if (markets.length !== 1) {
    throw new Error(
      `REQ-PRODUCTION-008 requires exactly one local market for Region ${String(region.regionId)}, got ${markets.length}`,
    );
  }
  return markets[0]!;
}

function readIntentInventory(world: WorldState, intent: MarketIntent): number {
  const goodId = intent.goodId;
  const bucket = intent.inventoryBucket ?? "GENERAL";
  switch (intent.actor.type) {
    case "PRODUCTION_UNIT": {
      const unit = world.productionUnits.get(intent.actor.productionUnitId);
      if (unit === undefined) {
        throw new Error(`MarketIntent ${String(intent.id)} references missing ProductionUnit`);
      }
      if (bucket === "INPUT") return unit.inputInventory.get(goodId) ?? 0;
      if (bucket === "OUTPUT") return unit.outputInventory.get(goodId) ?? 0;
      if (bucket === "INVESTMENT") return unit.investmentInventory.get(goodId) ?? 0;
      throw new Error(`ProductionUnit MarketIntent ${String(intent.id)} must name an explicit inventory bucket`);
    }
    case "COHORT": {
      const cohort = world.cohorts.get(intent.actor.cohortId);
      if (cohort === undefined) throw new Error(`MarketIntent ${String(intent.id)} references missing Cohort`);
      if (bucket !== "GENERAL") throw new Error(`Cohort MarketIntent ${String(intent.id)} must use GENERAL inventory`);
      return cohort.householdInventory.get(goodId) ?? 0;
    }
    case "STATE": {
      const state = world.states.get(intent.actor.stateId);
      if (state === undefined) throw new Error(`MarketIntent ${String(intent.id)} references missing State`);
      if (bucket !== "GENERAL") throw new Error(`State MarketIntent ${String(intent.id)} must use GENERAL inventory`);
      return state.publicInventory.get(goodId) ?? 0;
    }
    case "CLAN":
      throw new Error(`MarketIntent ${String(intent.id)} cannot sell goods from a Clan without physical inventory`);
    case "MONETARY_AUTHORITY":
      throw new Error(`MarketIntent ${String(intent.id)} cannot use a MonetaryAuthority as a goods actor`);
  }
}

function taxFacts(
  region: RegionState,
  goodId: GoodId,
  taxPolicy: TaxPolicyProvider,
): { destinationStateId: StateId | null; assessedTaxRate: number; collectionEfficiency: number } {
  const destinationStateId = region.controllerStateId;
  if (destinationStateId === null) {
    return { destinationStateId: null, assessedTaxRate: 0, collectionEfficiency: 0 };
  }
  const assessedTaxRate = taxPolicy.getConsumptionTaxRate(destinationStateId, goodId);
  const collectionEfficiency = taxPolicy.getCollectionEfficiency(destinationStateId);
  if (!Number.isFinite(assessedTaxRate) || assessedTaxRate < 0 || assessedTaxRate > 1) {
    throw new Error(`M4 consumption-tax rate for ${String(goodId)} must be finite in [0,1]`);
  }
  if (!Number.isFinite(collectionEfficiency) || collectionEfficiency < 0 || collectionEfficiency > 1) {
    throw new Error(`M4 consumption-tax collection efficiency must be finite in [0,1]`);
  }
  return { destinationStateId, assessedTaxRate, collectionEfficiency };
}

function phase4ProcurementHandler(options: M4ClosedEconomyOptions): PhaseHandler {
  return (world, context) => {
    if (context.phase !== 4) return context;
    const region = requireSingleRegion(world);
    const market = requireSingleLocalMarket(world, region);
    const intents = context.productionMarketIntents ?? [];
    const buyers = intents.filter(
      (intent) => intent.side === "BUY" && intent.purpose === "INPUT" && intent.regionId === region.regionId,
    );
    const sellers = intents.filter(
      (intent) => intent.side === "SELL" && intent.regionId === region.regionId,
    );
    const goods = stableOrderBy(
      [...new Set([...buyers.map((intent) => intent.goodId), ...sellers.map((intent) => intent.goodId)])],
      String,
    );
    const allocations: MarketAllocation[] = [];
    const allocationIdCounter = { value: 0 };
    const commitmentLedger = new Map<string, number>();
    const quantityEpsilon = world.simulationConfig.numeric.quantityEpsilon ?? 1e-9;

    for (const goodId of goods) {
      const goodBuyers = buyers.filter((intent) => intent.goodId === goodId);
      const goodSellers = sellers.filter((intent) => intent.goodId === goodId);
      if (goodBuyers.length === 0 || goodSellers.length === 0) continue;
      const price = market.priceByGood.get(goodId);
      if (price === undefined || !Number.isFinite(price) || price <= 0) {
        throw new Error(`Phase-4 prior-close price for ${String(goodId)} must be finite and > 0`);
      }
      const facts = taxFacts(region, goodId, options.taxPolicy);
      const grossFactor = 1 + facts.assessedTaxRate * facts.collectionEfficiency;
      const input: LocalClearingInput = {
        marketId: market.marketId,
        regionId: region.regionId,
        goodId,
        pass: "PRE_PRODUCTION",
        marketCurrencyId: region.settlementCurrencyId,
        buyerIntents: goodBuyers,
        sellerIntents: goodSellers,
        computeEffectiveDemand: (intent, grossUnitPrice) =>
          computeEffectiveDemand(intent, grossUnitPrice, quantityEpsilon),
        computeSellableQuantity: (intent, committed) => {
          const key = `${String(intent.actor.type)}:${String(intent.id)}`;
          const alreadyCommitted = committed.get(key) ?? 0;
          const sellable = computeSellableQuantity(
            intent,
            readIntentInventory(world, intent),
            intent.minimumReserveQuantity ?? 0,
            alreadyCommitted,
          );
          committed.set(key, alreadyCommitted + sellable);
          return sellable;
        },
        computeGrossUnitPrice: (_intent, sellerNetPrice) => sellerNetPrice * grossFactor,
        getTaxationInfo: () => facts,
      };
      allocations.push(
        ...computeLocalClearing(
          input,
          commitmentLedger,
          price,
          quantityEpsilon,
          allocationIdCounter,
        ),
      );
    }

    const transactionCounter = { value: 0 };
    const settlementTransactions = allocations.flatMap((allocation) => {
      const bundle = executeMarketSettlement(allocation, context.tick, 4, transactionCounter);
      return bundle.consumptionTaxTransaction === null || bundle.consumptionTaxTransaction === undefined
        ? [bundle.marketSaleTransaction]
        : [bundle.marketSaleTransaction, bundle.consumptionTaxTransaction];
    });

    return {
      ...context,
      phase4MarketAllocations: allocations,
      transactions: [...context.transactions, ...settlementTransactions],
    };
  };
}

function phase4FillByIntent(context: TickContext): {
  readonly quantity: ReadonlyMap<string, number>;
  readonly grossSpend: ReadonlyMap<string, number>;
} {
  const quantity = new Map<string, number>();
  const grossSpend = new Map<string, number>();
  for (const allocation of context.phase4MarketAllocations ?? []) {
    quantity.set(
      String(allocation.buyerIntentId),
      (quantity.get(String(allocation.buyerIntentId)) ?? 0) + allocation.quantity,
    );
    grossSpend.set(
      String(allocation.buyerIntentId),
      (grossSpend.get(String(allocation.buyerIntentId)) ?? 0) + allocation.quantity * allocation.buyerGrossUnitPrice,
    );
    quantity.set(
      String(allocation.sellerIntentId),
      (quantity.get(String(allocation.sellerIntentId)) ?? 0) + allocation.quantity,
    );
  }
  return { quantity, grossSpend };
}

/** Residual MAIN intents after Phase-4 fills. Phase-5 output offers arrive on the same list later. */
function mainMarketIntents(world: WorldState, context: TickContext): MarketIntent[] {
  const fills = phase4FillByIntent(context);
  const quantityEpsilon = world.simulationConfig.numeric.quantityEpsilon ?? 1e-9;
  const moneyEpsilon = world.simulationConfig.numeric.moneyEpsilon ?? 1e-9;
  const all = [...(context.productionMarketIntents ?? []), ...(context.householdMarketIntents ?? [])];
  const residual: MarketIntent[] = [];

  for (const intent of all) {
    const filled = fills.quantity.get(String(intent.id)) ?? 0;
    const desiredQuantity = Math.max(0, intent.desiredQuantity - filled);
    if (desiredQuantity <= quantityEpsilon) continue;
    if (intent.side === "BUY") {
      const maxSpend = Math.max(0, (intent.maxSpend ?? 0) - (fills.grossSpend.get(String(intent.id)) ?? 0));
      if (maxSpend <= moneyEpsilon) continue;
      residual.push({ ...intent, desiredQuantity, maxSpend });
    } else {
      residual.push({ ...intent, desiredQuantity });
    }
  }
  return residual;
}

function marketIdMap(world: WorldState): Map<string, MarketId> {
  const region = requireSingleRegion(world);
  const market = requireSingleLocalMarket(world, region);
  return new Map([[String(region.regionId), market.marketId]]);
}

function phase8SettlementEvidenceHandler(): PhaseHandler {
  return (_world, context) => {
    if (context.phase !== 8 || context.marketAllocations.length === 0) return context;
    const counter = { value: 0 };
    const transactions = context.marketAllocations.flatMap((allocation) => {
      const bundle = executeMarketSettlement(allocation, context.tick, 8, counter);
      return bundle.consumptionTaxTransaction === null || bundle.consumptionTaxTransaction === undefined
        ? [bundle.marketSaleTransaction]
        : [bundle.marketSaleTransaction, bundle.consumptionTaxTransaction];
    });
    return { ...context, transactions: [...context.transactions, ...transactions] };
  };
}

/** Phase-9 wrapper for the state-threaded runner: Phase-8 purchases are already authoritative. */
function phase9HouseholdHandler(): PhaseHandler {
  return (world, context) => {
    if (context.phase !== 9) return context;
    const result = planHouseholdConsumptionPhase9({
      world,
      tick: context.tick,
      marketAllocations: [],
      laborSupplyPlans: context.laborSupplyPlans ?? [],
      laborAllocations: context.laborAllocations ?? [],
      wageSettlements: context.wageSettlements ?? [],
      transactions: context.transactions,
    });
    let currentLedger = context.currentLedger;
    for (const loss of result.physicalLosses) currentLedger = addLedgerRecord(currentLedger, loss);
    return {
      ...context,
      householdConsumptionExecutions: result.executions,
      transactions: [...context.transactions, ...result.transactions],
      currentLedger,
    };
  };
}

function effectiveMinimumWageFloorByUnit(world: WorldState): ReadonlyMap<ProductionUnitId, number> {
  const result = new Map<ProductionUnitId, number>();
  for (const unit of stableOrderBy(world.productionUnits.values(), (candidate) => String(candidate.productionUnitId))) {
    // Phase 1 can activate a unit before Phase 15, so compute floors for the complete
    // one-region unit set rather than only actors that happened to be ACTIVE at tick open.
    const region = stableOrderBy(
      [...world.regions.values()].filter((candidate) => candidate.seed.key === unit.seed.regionKey),
      (candidate) => String(candidate.regionId),
    );
    if (region.length !== 1) {
      throw new Error(`ProductionUnit ${String(unit.productionUnitId)} region must resolve exactly once`);
    }
    const recipe = world.definitionRegistry.recipes[unit.seed.recipeId];
    if (recipe === undefined) throw new Error(`ProductionUnit ${String(unit.productionUnitId)} references missing recipe`);
    const controllerStateId = region[0]!.controllerStateId;
    if (controllerStateId === null) {
      result.set(unit.productionUnitId, 0);
      continue;
    }
    const state = world.states.get(controllerStateId);
    if (state === undefined) throw new Error(`Region controller State ${String(controllerStateId)} is missing`);
    const policy = state.seed.policy.m4ProductionPlanning;
    if (policy === undefined) {
      throw new Error(`Controlled M4 Region requires explicit m4ProductionPlanning policy`);
    }
    result.set(
      unit.productionUnitId,
      policy.minimumWageFloorByRegionKey[region[0]!.seed.key]?.[recipe.laborCategory] ?? 0,
    );
  }
  return result;
}

const clampSignal = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value));

const emaSignal = (previous: number, sample: number, alpha: number): number =>
  previous + alpha * (sample - previous);

/** Persist the Handoff/05 Phase-15 realized production-signal close for tick N -> N+1. */
function applyProductionSignalCloseTransition(world: WorldState, context: TickContext): WorldState {
  const defaults = createDefaultSimulationConfig();
  const alpha = world.simulationConfig.production.productionSignalAlpha ?? defaults.production.productionSignalAlpha!;
  const quantityEpsilon = world.simulationConfig.numeric.quantityEpsilon ?? defaults.numeric.quantityEpsilon!;
  const moneyEpsilon = world.simulationConfig.numeric.moneyEpsilon ?? defaults.numeric.moneyEpsilon!;
  if (!Number.isFinite(alpha) || alpha < 0 || alpha > 1) {
    throw new Error(`ProductionConfig.productionSignalAlpha must be finite in [0,1], got ${String(alpha)}`);
  }
  if (!Number.isFinite(quantityEpsilon) || quantityEpsilon <= 0) {
    throw new Error(`SimulationConfig.numeric.quantityEpsilon must be finite and > 0, got ${String(quantityEpsilon)}`);
  }
  if (!Number.isFinite(moneyEpsilon) || moneyEpsilon <= 0) {
    throw new Error(`SimulationConfig.numeric.moneyEpsilon must be finite and > 0, got ${String(moneyEpsilon)}`);
  }

  const outputOfferByUnit = new Map<ProductionUnitId, number>();
  for (const intent of context.productionOutputIntents ?? []) {
    if (intent.actor.type !== "PRODUCTION_UNIT" || intent.inventoryBucket !== "OUTPUT") continue;
    outputOfferByUnit.set(
      intent.actor.productionUnitId,
      (outputOfferByUnit.get(intent.actor.productionUnitId) ?? 0) + intent.desiredQuantity,
    );
  }

  const outputSoldByUnit = new Map<ProductionUnitId, number>();
  const cashRevenueByUnit = new Map<ProductionUnitId, number>();
  for (const allocation of context.marketAllocations) {
    if (allocation.seller.type !== "PRODUCTION_UNIT" || allocation.sellerInventoryBucket !== "OUTPUT") continue;
    const unitId = allocation.seller.productionUnitId;
    outputSoldByUnit.set(unitId, (outputSoldByUnit.get(unitId) ?? 0) + allocation.quantity);
    cashRevenueByUnit.set(
      unitId,
      (cashRevenueByUnit.get(unitId) ?? 0) + allocation.quantity * allocation.sellerNetUnitPrice,
    );
  }

  const inputCashCostByUnit = new Map<ProductionUnitId, number>();
  for (const allocation of [...(context.phase4MarketAllocations ?? []), ...context.marketAllocations]) {
    if (allocation.buyer.type !== "PRODUCTION_UNIT" || allocation.buyerInventoryBucket !== "INPUT") continue;
    const unitId = allocation.buyer.productionUnitId;
    inputCashCostByUnit.set(
      unitId,
      (inputCashCostByUnit.get(unitId) ?? 0) + allocation.quantity * allocation.buyerGrossUnitPrice,
    );
  }

  const grossWageByUnit = new Map<ProductionUnitId, number>();
  for (const settlement of context.wageSettlements ?? []) {
    grossWageByUnit.set(
      settlement.unitId,
      (grossWageByUnit.get(settlement.unitId) ?? 0) + settlement.grossWage,
    );
  }

  const productionUnits = new Map(world.productionUnits);
  for (const execution of stableOrderBy(context.productionExecutions ?? [], (candidate) => String(candidate.unitId))) {
    const unit = productionUnits.get(execution.unitId);
    if (unit === undefined) {
      throw new Error(`Phase-15 production-signal close references missing ProductionUnit ${String(execution.unitId)}`);
    }
    if (unit.status !== "ACTIVE") continue;

    const utilization = clampSignal(
      execution.realizedBatches / Math.max(execution.capitalBoundBatches, quantityEpsilon),
      0,
      1,
    );
    const offeredOutput = outputOfferByUnit.get(execution.unitId) ?? 0;
    const soldOutput = outputSoldByUnit.get(execution.unitId) ?? 0;
    const sellThrough = offeredOutput > quantityEpsilon
      ? clampSignal(soldOutput / offeredOutput, 0, 1)
      : unit.signals.sellThroughEma;
    const cashRevenue = cashRevenueByUnit.get(execution.unitId) ?? 0;
    const inputCashCost = inputCashCostByUnit.get(execution.unitId) ?? 0;
    const grossWageCashCost = grossWageByUnit.get(execution.unitId) ?? 0;
    const marginSignal = cashRevenue <= moneyEpsilon && inputCashCost <= moneyEpsilon && grossWageCashCost <= moneyEpsilon
      ? 0
      : clampSignal(
        (cashRevenue - inputCashCost - grossWageCashCost) / Math.max(cashRevenue, moneyEpsilon),
        -1,
        1,
      );

    const inputUseKeys = stableOrderBy(
      [...new Set([
        ...Object.keys(unit.signals.inputUseEma),
        ...Object.keys(execution.inputConsumedByGood),
      ])] as GoodId[],
      String,
    );
    const inputUseEma: Record<string, number> = {};
    for (const goodId of inputUseKeys) {
      inputUseEma[goodId] = emaSignal(
        unit.signals.inputUseEma[goodId] ?? 0,
        execution.inputConsumedByGood[goodId] ?? 0,
        alpha,
      );
    }

    productionUnits.set(execution.unitId, {
      ...unit,
      signals: {
        ...unit.signals,
        utilizationEma: emaSignal(unit.signals.utilizationEma, utilization, alpha),
        sellThroughEma: emaSignal(unit.signals.sellThroughEma, sellThrough, alpha),
        outputSalesEma: emaSignal(unit.signals.outputSalesEma, soldOutput, alpha),
        inputUseEma: inputUseEma as Readonly<Record<GoodId, number>>,
        marginSignalEma: emaSignal(unit.signals.marginSignalEma, marginSignal, alpha),
      },
    });
  }

  return { ...world, productionUnits };
}

function phase1JurisdictionHandler(): PhaseHandler {
  return (world, context) => {
    if (context.phase !== 1) return context;
    const effectiveJurisdictionByRegion = new Map<RegionId, StateId | null>();
    for (const region of stableOrderBy(world.regions.values(), (candidate) => String(candidate.regionId))) {
      effectiveJurisdictionByRegion.set(region.regionId, region.controllerStateId);
    }
    return { ...context, effectiveJurisdictionByRegion };
  };
}

/**
 * Execute one authoritative M4 closed-economy tick. The returned WorldState is the only
 * persistent successor; `openingWorld` is never mutated.
 */
export function executeM4ClosedEconomyTick(
  openingWorld: WorldState,
  tick: number,
  options: M4ClosedEconomyOptions,
  observePhaseTransition?: PhaseWorldTransitionObserver,
): StatefulTickExecutionResult {
  requireSingleLocalMarket(openingWorld, requireSingleRegion(openingWorld));

  const phase6 = createPhase6Handler({
    getFixtureIntents: (world, context) => mainMarketIntents(world, context),
    getFixtureMarketIds: marketIdMap,
    priceConfig: options.priceConfig,
  });
  const phase8 = createPhase8Handler({
    getFixtureIntents: (world, context) => mainMarketIntents(world, context),
    getFixtureMarketIds: marketIdMap,
    ...(options.collectMarketTelemetry === undefined
      ? {}
      : { collectTelemetry: options.collectMarketTelemetry }),
    taxPolicy: options.taxPolicy,
  });
  const phase15 = createPhase15WageOfferUpdateHandler({
    effectiveMinimumWageFloorByUnit: effectiveMinimumWageFloorByUnit(openingWorld),
  });

  const handler = composePhaseHandlers(
    phase1JurisdictionHandler(),
    createCanonicalPhase2ProductionPlanningHandler(),
    createPhase2LaborSupplyPlanningHandler(),
    createPhase2HouseholdConsumptionPlanningHandler({ taxPolicy: options.taxPolicy }),
    createPhase3LaborAllocationHandler(),
    phase4ProcurementHandler(options),
    createPhase5WageSettlementHandler({ taxPolicy: options.wageTaxPolicy }),
    createPhase5ProductionExecutionHandler(),
    phase6,
    phase8,
    phase8SettlementEvidenceHandler(),
    phase9HouseholdHandler(),
    createPhase12CapitalFormationHandler(),
    createPhase14ProductionUnitLifecycleHandler(),
    phase15,
  );

  return executeStatefulTick(openingWorld, tick, handler, (phase, world, context) => {
    if (phase === 1) {
      return applyProductionUnitLifecycleTransitionsAtPhase1(world, tick);
    }
    if (phase === 4) {
      let next = world;
      for (const allocation of context.phase4MarketAllocations ?? []) {
        next = executeAllocation(next, context, allocation);
      }
      return next;
    }
    if (phase === 5) {
      const afterWages = applyWageSettlementTransition(
        world,
        context.wageSettlements ?? [],
        tick,
        context,
      );
      return applyProductionExecutionTransition(
        afterWages,
        context.productionExecutions ?? [],
        tick,
        {
          productionPlans: context.productionPlans ?? [],
          laborAllocations: context.laborAllocations ?? [],
        },
      );
    }
    if (phase === 8) {
      return applyMarketStateTransition(applyMarketSettlementTransition(world, context), context);
    }
    if (phase === 9) {
      return applyHouseholdConsumptionTransition(
        world,
        context.householdConsumptionExecutions ?? [],
        tick,
      );
    }
    if (phase === 12) {
      return applyCapitalFormationTransition(world, context.capitalFormationExecutions ?? [], tick);
    }
    if (phase === 14) {
      return applyProductionUnitLifecycleReviewTransition(
        world,
        context.productionUnitLifecycleReviews ?? [],
        tick,
      );
    }
    if (phase === 15) {
      return applyWageOfferStateTransition(applyProductionSignalCloseTransition(world, context), context);
    }
    return world;
  }, observePhaseTransition);
}
