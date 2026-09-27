import { describe, expect, it } from "vitest";

import { baselineDefinitionPack } from "../config/fixtures/baselineDefinitionPack";
import { baselineScenario } from "../config/fixtures/baselineScenario";
import type { NeedCategoryDefinition } from "../config/definitionPack";
import { createDefaultSimulationConfig } from "../config/simulationConfig";
import type { GoodId, MarketId } from "../domain/id";
import { executeM4ClosedEconomyTick, type M4ClosedEconomyOptions } from "./m4ClosedEconomyOrchestrator";
import { buildInitialWorld, type WorldState } from "./worldState";

const m4NeedCategories: Readonly<Record<string, NeedCategoryDefinition>> = {
  ESSENTIAL_FOOD: {
    id: "ESSENTIAL_FOOD",
    perCapitaTarget: 1,
    priority: 4,
    substitutionGoods: [
      { goodId: "good:food" as any, basePreference: 1, qualityFactor: 1 },
      { goodId: "good:grain" as any, basePreference: 0.5, qualityFactor: 1 },
    ],
    priceSensitivity: 1,
    inventoryCarryoverTicks: 1,
  },
  BASIC_GOODS: {
    id: "BASIC_GOODS",
    perCapitaTarget: 0.1,
    priority: 3,
    substitutionGoods: [{ goodId: "good:wood" as any, basePreference: 1, qualityFactor: 1 }],
    priceSensitivity: 1,
    inventoryCarryoverTicks: 2,
  },
  SERVICES: {
    id: "SERVICES",
    perCapitaTarget: 0.1,
    priority: 2,
    substitutionGoods: [{ goodId: "good:tools" as any, basePreference: 1, qualityFactor: 1 }],
    priceSensitivity: 1,
    inventoryCarryoverTicks: 1,
  },
  COMFORT: {
    id: "COMFORT",
    perCapitaTarget: 0.1,
    priority: 1,
    substitutionGoods: [{ goodId: "good:cloth" as any, basePreference: 1, qualityFactor: 1 }],
    priceSensitivity: 1,
    inventoryCarryoverTicks: 2,
  },
};

function baselineWorld(): WorldState {
  return buildInitialWorld(
    baselineScenario,
    { ...baselineDefinitionPack, needCategories: m4NeedCategories },
    createDefaultSimulationConfig(),
    42,
  );
}

function oneRegionWorld(preferredRegionKey?: string): WorldState {
  const world = baselineWorld();
  const region = [...world.regions.values()]
    .sort((left, right) => String(left.regionId).localeCompare(String(right.regionId)))
    .find((candidate) =>
      (preferredRegionKey === undefined || candidate.seed.key === preferredRegionKey) &&
      [...world.markets.values()].some((market) => market.seed.regionKey === candidate.seed.key) &&
      [...world.productionUnits.values()].some((unit) => unit.seed.regionKey === candidate.seed.key) &&
      [...world.cohorts.values()].some((cohort) => cohort.seed.regionKey === candidate.seed.key),
    );
  expect(region).toBeDefined();
  const regionKey = region!.seed.key;
  const regions = new Map([[region!.regionId, region!]]);
  const markets = new Map(
    [...world.markets.entries()].filter(([, market]) => market.seed.regionKey === regionKey),
  );
  const productionUnits = new Map(
    [...world.productionUnits.entries()].filter(([, unit]) => unit.seed.regionKey === regionKey),
  );
  const cohorts = new Map(
    [...world.cohorts.entries()].filter(([, cohort]) => cohort.seed.regionKey === regionKey),
  );
  return { ...world, regions, markets, productionUnits, cohorts };
}

function options(world: WorldState): M4ClosedEconomyOptions {
  const market = world.simulationConfig.markets;
  expect(market.shortageSignalWeight).toBeDefined();
  expect(market.inventorySignalWeight).toBeDefined();
  expect(market.basePriceAdjustmentSpeed).toBeDefined();
  expect(market.maxAbsoluteLogPriceMovePerTick).toBeDefined();
  expect(market.targetInventoryCoverageTicks).toBeDefined();
  return {
    taxPolicy: {
      getConsumptionTaxRate: () => 0,
      getCollectionEfficiency: () => 1,
    },
    wageTaxPolicy: {
      assessWageIncomeTax: () => 0,
      getCollectionEfficiency: () => 1,
    },
    priceConfig: {
      shortageSignalWeight: market.shortageSignalWeight!,
      inventorySignalWeight: market.inventorySignalWeight!,
      basePriceAdjustmentSpeed: market.basePriceAdjustmentSpeed!,
      maxAbsoluteLogPriceMovePerTick: market.maxAbsoluteLogPriceMovePerTick!,
      targetInventoryCoverageTicks: market.targetInventoryCoverageTicks!,
      minimumPrice: 0.01,
      maximumPrice: 1_000_000,
    },
    collectMarketTelemetry: true,
  };
}

function reverseMap<K, V>(source: ReadonlyMap<K, V>): ReadonlyMap<K, V> {
  return new Map([...source.entries()].reverse());
}

function normalizedOutcome(world: WorldState, result: ReturnType<typeof executeM4ClosedEconomyTick>): string {
  const sortedEntries = <K extends string>(values: ReadonlyMap<K, number>) =>
    [...values.entries()].sort(([left], [right]) => String(left).localeCompare(String(right)));
  return JSON.stringify({
    phaseTrace: result.phaseTrace,
    transactions: result.context.transactions.map((transaction) => ({
      id: transaction.transactionId,
      type: transaction.type,
      phase: transaction.phase,
      amount: transaction.amount,
    })),
    phase4: (result.context.phase4MarketAllocations ?? []).map((allocation) => ({
      id: allocation.id,
      q: allocation.quantity,
      buyer: allocation.buyerIntentId,
      seller: allocation.sellerIntentId,
    })),
    main: result.context.marketAllocations.map((allocation) => ({
      id: allocation.id,
      q: allocation.quantity,
      buyer: allocation.buyerIntentId,
      seller: allocation.sellerIntentId,
    })),
    units: [...world.productionUnits.values()]
      .sort((left, right) => String(left.productionUnitId).localeCompare(String(right.productionUnitId)))
      .map((unit) => ({
        id: unit.productionUnitId,
        status: unit.status,
        wageOffer: unit.wageOffer,
        capital: unit.installedCapital,
        wallet: sortedEntries(unit.wallet),
        input: sortedEntries(unit.inputInventory),
        output: sortedEntries(unit.outputInventory),
        investment: sortedEntries(unit.investmentInventory),
      })),
    cohorts: [...world.cohorts.values()]
      .sort((left, right) => String(left.cohortId).localeCompare(String(right.cohortId)))
      .map((cohort) => ({
        id: cohort.cohortId,
        wallet: sortedEntries(cohort.wallet),
        inventory: sortedEntries(cohort.householdInventory),
      })),
    markets: [...world.markets.values()]
      .sort((left, right) => String(left.marketId).localeCompare(String(right.marketId)))
      .map((market) => ({
        id: market.marketId as MarketId,
        prices: sortedEntries(market.priceByGood),
      })),
  });
}

describe("REQ-PRODUCTION-008 canonical M4 closed-economy orchestration", () => {
  it("threads one Region through phases 0..15 and persists M4 transitions in causal order", () => {
    const opening = oneRegionWorld();
    const openingProductionTick = opening.lastProductionExecutionTransitionTick;
    const openingWageTick = opening.lastWageSettlementTransitionTick;
    const openingHouseholdTick = opening.lastHouseholdConsumptionTransitionTick;
    const openingCapitalTick = opening.lastCapitalFormationTransitionTick;

    const result = executeM4ClosedEconomyTick(opening, 0, options(opening));

    expect(result.phaseBoundaryError).toBeUndefined();
    expect(result.reconciliationErrors).toBeNull();
    expect(result.phaseTrace).toEqual([...Array(16).keys()]);
    expect(result.world).not.toBe(opening);
    expect(result.world.lastProductionExecutionTransitionTick).toBe(0);
    expect(result.world.lastWageSettlementTransitionTick).toBe(0);
    expect(result.world.lastHouseholdConsumptionTransitionTick).toBe(0);
    expect(result.world.lastCapitalFormationTransitionTick).toBe(0);
    expect(result.context.productionPlans?.length).toBe(opening.productionUnits.size);
    expect(result.context.laborAllocations).toBeDefined();
    expect(result.context.householdConsumptionExecutions).toBeDefined();
    expect(result.context.capitalFormationExecutions).toBeDefined();
    expect(result.context.productionUnitLifecycleReviews).toBeDefined();
    expect((result.context.phase4MarketAllocations ?? []).every((allocation) => allocation.pass === "PRE_PRODUCTION")).toBe(true);
    expect(result.context.marketAllocations.every((allocation) => allocation.pass === "MAIN")).toBe(true);
    expect(result.context.transactions.some((transaction) => transaction.phase === 7)).toBe(false);

    // The caller-owned opening state is unchanged; all settlement/persistence is explicit.
    expect(opening.lastProductionExecutionTransitionTick).toBe(openingProductionTick);
    expect(opening.lastWageSettlementTransitionTick).toBe(openingWageTick);
    expect(opening.lastHouseholdConsumptionTransitionTick).toBe(openingHouseholdTick);
    expect(opening.lastCapitalFormationTransitionTick).toBe(openingCapitalTick);
  });

  it("makes Phase-4 procurement and Phase-5 wages/output authoritative before the Phase-8 main market", () => {
    const openingBase = oneRegionWorld("region:b2-urban");
    const sourceWorld = baselineWorld();
    const region = [...openingBase.regions.values()][0]!;
    const currencyId = region.settlementCurrencyId;
    const iron = "good:iron" as GoodId;
    const wood = "good:wood" as GoodId;
    const tools = "good:tools" as GoodId;

    const buyer = [...openingBase.productionUnits.values()].find(
      (unit) => unit.seed.recipeId === "recipe:tools-craft" && unit.status === "ACTIVE",
    );
    const liquidationSeller = [...sourceWorld.productionUnits.values()].find(
      (unit) => unit.seed.recipeId === "recipe:iron-mine" && unit.status === "ACTIVE",
    );
    expect(buyer).toBeDefined();
    expect(liquidationSeller).toBeDefined();

    const buyerWallet = new Map(buyer!.wallet);
    buyerWallet.set(currencyId, 100_000);
    const buyerInputs = new Map(buyer!.inputInventory);
    buyerInputs.set(iron, 0);
    buyerInputs.set(wood, 10_000);
    const buyerOutputs = new Map(buyer!.outputInventory);
    buyerOutputs.set(tools, 0);
    const fundedBuyer = {
      ...buyer!,
      wallet: buyerWallet,
      inputInventory: buyerInputs,
      outputInventory: buyerOutputs,
      installedCapital: 1,
      condition: 1,
      status: "ACTIVE" as const,
      signals: {
        ...buyer!.signals,
        utilizationEma: 0,
        sellThroughEma: 0,
        marginSignalEma: 0,
        outputSalesEma: 0,
        inputUseEma: {},
      },
    };

    // A CLOSING unit exposes residual INPUT stock in Phase 2. Relocating this test-only
    // seller into the same Region creates a real PRE_PRODUCTION counterparty without
    // inventing a second market path or same-tick production supply.
    const sellerInput = new Map<GoodId, number>([[iron, 1_000]]);
    const localClosingSeller = {
      ...liquidationSeller!,
      seed: { ...liquidationSeller!.seed, regionKey: region.seed.key },
      status: "CLOSING" as const,
      wallet: new Map([[currencyId, 0]]),
      inputInventory: sellerInput,
      outputInventory: new Map<GoodId, number>(),
      investmentInventory: new Map<GoodId, number>(),
      installedCapital: 0,
    };

    const productionUnits = new Map(openingBase.productionUnits);
    productionUnits.clear();
    productionUnits.set(fundedBuyer.productionUnitId, fundedBuyer);
    productionUnits.set(localClosingSeller.productionUnitId, localClosingSeller);
    const opening: WorldState = { ...openingBase, productionUnits };

    const result = executeM4ClosedEconomyTick(opening, 1, options(opening));
    expect(result.phaseBoundaryError).toBeUndefined();
    expect(result.reconciliationErrors).toBeNull();

    const inputIntent = (result.context.productionMarketIntents ?? []).find(
      (intent) =>
        intent.actor.type === "PRODUCTION_UNIT" &&
        intent.actor.productionUnitId === fundedBuyer.productionUnitId &&
        intent.side === "BUY" &&
        intent.purpose === "INPUT" &&
        intent.goodId === iron,
    );
    expect(inputIntent).toBeDefined();
    const procurement = (result.context.phase4MarketAllocations ?? []).find(
      (allocation) => allocation.buyerIntentId === inputIntent!.id,
    );
    expect(procurement?.pass).toBe("PRE_PRODUCTION");
    expect(procurement!.quantity).toBeGreaterThan(0);

    const execution = (result.context.productionExecutions ?? []).find(
      (candidate) => candidate.unitId === fundedBuyer.productionUnitId,
    );
    expect(execution).toBeDefined();
    expect(execution!.realizedBatches).toBeGreaterThan(0);
    expect(execution!.inputConsumedByGood[iron]).toBeGreaterThan(0);
    expect(buyerInputs.get(iron)).toBe(0);

    const outputIntent = (result.context.productionOutputIntents ?? []).find(
      (intent) =>
        intent.actor.type === "PRODUCTION_UNIT" &&
        intent.actor.productionUnitId === fundedBuyer.productionUnitId &&
        intent.goodId === tools,
    );
    expect(outputIntent).toBeDefined();
    expect(outputIntent!.desiredQuantity).toBeGreaterThan(0);
    const outputSale = result.context.marketAllocations.find(
      (allocation) => allocation.sellerIntentId === outputIntent!.id,
    );
    expect(outputSale?.pass).toBe("MAIN");
    expect(outputSale!.quantity).toBeGreaterThan(0);

    const buyerWages = (result.context.wageSettlements ?? []).filter(
      (settlement) => settlement.unitId === fundedBuyer.productionUnitId && settlement.netWage > 0,
    );
    expect(buyerWages.length).toBeGreaterThan(0);
    const wageRecipientIds = new Set(buyerWages.map((settlement) => settlement.cohortId));
    const householdIntentById = new Map(
      (result.context.householdMarketIntents ?? []).map((intent) => [intent.id, intent] as const),
    );
    const wageRecipientPurchase = result.context.marketAllocations.find((allocation) => {
      const intent = householdIntentById.get(allocation.buyerIntentId);
      return intent?.actor.type === "COHORT" && wageRecipientIds.has(intent.actor.cohortId);
    });
    expect(wageRecipientPurchase?.quantity).toBeGreaterThan(0);

    // Phase 7 has no handler or state transition in M4. Late market stock can only affect
    // later phases/next ticks; the Phase-5 execution above is already fixed before MAIN.
    expect(result.context.transactions.some((transaction) => transaction.phase === 7)).toBe(false);
    expect(result.world.lastWageSettlementTransitionTick).toBe(1);
    expect(result.world.lastProductionExecutionTransitionTick).toBe(1);

    const closedSignals = result.world.productionUnits.get(fundedBuyer.productionUnitId)!.signals;
    expect(closedSignals.utilizationEma).toBeGreaterThan(0);
    expect(closedSignals.sellThroughEma).toBeGreaterThan(0);
    expect(closedSignals.outputSalesEma).toBeGreaterThan(0);
    expect(closedSignals.inputUseEma[iron]).toBeGreaterThan(0);

    const nextTick = executeM4ClosedEconomyTick(result.world, 2, options(result.world));
    const nextPlan = nextTick.context.productionPlans!.find(
      (plan) => plan.unitId === fundedBuyer.productionUnitId,
    )!;
    const staleUnits = new Map(result.world.productionUnits);
    staleUnits.set(fundedBuyer.productionUnitId, {
      ...result.world.productionUnits.get(fundedBuyer.productionUnitId)!,
      signals: fundedBuyer.signals,
    });
    const staleWorld: WorldState = { ...result.world, productionUnits: staleUnits };
    const staleTick = executeM4ClosedEconomyTick(staleWorld, 2, options(staleWorld));
    const stalePlan = staleTick.context.productionPlans!.find(
      (plan) => plan.unitId === fundedBuyer.productionUnitId,
    )!;
    expect(nextPlan.targetUtilization).not.toBe(stalePlan.targetUtilization);
  });

  it("uses neutral sell-through and ordinary EMA decay for an ACTIVE unit with no production flow", () => {
    const openingBase = oneRegionWorld("region:b2-urban");
    const zeroFlow = [...openingBase.productionUnits.values()].find(
      (unit) => unit.seed.recipeId === "recipe:tools-craft" && unit.status === "ACTIVE",
    );
    expect(zeroFlow).toBeDefined();
    const silentUnit = {
      ...zeroFlow!,
      installedCapital: 0,
      outputInventory: new Map<GoodId, number>(),
      signals: {
        ...zeroFlow!.signals,
        utilizationEma: 0.8,
        sellThroughEma: 0.6,
        marginSignalEma: 0.4,
        outputSalesEma: 8,
        inputUseEma: {},
      },
    };
    const opening: WorldState = {
      ...openingBase,
      productionUnits: new Map([[silentUnit.productionUnitId, silentUnit]]),
    };

    const result = executeM4ClosedEconomyTick(opening, 1, options(opening));
    const signals = result.world.productionUnits.get(silentUnit.productionUnitId)!.signals;
    expect((result.context.productionExecutions ?? []).find(
      (execution) => execution.unitId === silentUnit.productionUnitId,
    )!.realizedBatches).toBe(0);
    expect((result.context.productionOutputIntents ?? []).find(
      (intent) => intent.actor.type === "PRODUCTION_UNIT" && intent.actor.productionUnitId === silentUnit.productionUnitId,
    )!.desiredQuantity).toBe(0);
    expect(signals.utilizationEma).toBeCloseTo(0.6);
    expect(signals.sellThroughEma).toBeCloseTo(0.6);
    expect(signals.marginSignalEma).toBeCloseTo(0.3);
    expect(signals.outputSalesEma).toBeCloseTo(6);
  });

  it("uses the Phase-1 effective jurisdiction for the Phase-15 minimum-wage floor", () => {
    const openingBase = oneRegionWorld();
    const region = [...openingBase.regions.values()][0]!;
    expect(region.controllerStateId).not.toBeNull();

    const targetStateId = [...openingBase.states.keys()]
      .sort((left, right) => String(left).localeCompare(String(right)))
      .find((stateId) => stateId !== region.controllerStateId);
    expect(targetStateId).toBeDefined();
    const targetState = openingBase.states.get(targetStateId!)!;

    const activeUnit = [...openingBase.productionUnits.values()]
      .sort((left, right) => String(left.productionUnitId).localeCompare(String(right.productionUnitId)))
      .find((unit) => unit.status === "ACTIVE");
    expect(activeUnit).toBeDefined();
    const recipe = openingBase.definitionRegistry.recipes[activeUnit!.seed.recipeId];
    expect(recipe).toBeDefined();

    const targetFloor = Math.max(activeUnit!.wageOffer + 5, 25);
    const existingPolicy = targetState.seed.policy.m4ProductionPlanning;
    const targetPolicy = {
      minimumWageFloorByRegionKey: {
        ...(existingPolicy?.minimumWageFloorByRegionKey ?? {}),
        [region.seed.key]: {
          ...(existingPolicy?.minimumWageFloorByRegionKey[region.seed.key] ?? {}),
          [recipe!.laborCategory]: targetFloor,
        },
      },
      mandatoryKnownCashByProductionUnitKey:
        existingPolicy?.mandatoryKnownCashByProductionUnitKey ?? {},
      lifecycleOwnershipAllowed: true,
      lifecycleProductionAllowed: true,
    };
    const states = new Map(openingBase.states);
    states.set(targetStateId!, {
      ...targetState,
      seed: {
        ...targetState.seed,
        policy: {
          ...targetState.seed.policy,
          m4ProductionPlanning: targetPolicy,
        },
      },
    });

    const opening: WorldState = {
      ...openingBase,
      states,
      pendingTransitions: {
        ...openingBase.pendingTransitions,
        jurisdictionChanges: [
          ...openingBase.pendingTransitions.jurisdictionChanges,
          {
            regionId: region.regionId,
            nextControllerStateId: targetStateId!,
            activateTick: 5,
          },
        ],
      },
    };

    const result = executeM4ClosedEconomyTick(opening, 5, options(opening));
    expect(result.phaseBoundaryError).toBeUndefined();
    expect(result.context.effectiveJurisdictionByRegion.get(region.regionId)).toBe(targetStateId);
    expect(result.world.regions.get(region.regionId)!.controllerStateId).toBe(targetStateId);

    const update = (result.context.wageOfferUpdates ?? []).find(
      (candidate) => candidate.unitId === activeUnit!.productionUnitId,
    );
    expect(update).toBeDefined();
    expect(update!.effectiveMinimumWageFloor).toBe(targetFloor);
    expect(update!.nextOffer).toBeGreaterThanOrEqual(targetFloor);
  });

  it("is stable under irrelevant live-map insertion-order changes", () => {
    const opening = oneRegionWorld();
    const reordered: WorldState = {
      ...opening,
      regions: reverseMap(opening.regions),
      states: reverseMap(opening.states),
      currencies: reverseMap(opening.currencies),
      clans: reverseMap(opening.clans),
      cohorts: reverseMap(opening.cohorts),
      productionUnits: reverseMap(opening.productionUnits),
      markets: reverseMap(opening.markets),
    };

    const left = executeM4ClosedEconomyTick(opening, 0, options(opening));
    const right = executeM4ClosedEconomyTick(reordered, 0, options(reordered));

    expect(normalizedOutcome(left.world, left)).toBe(normalizedOutcome(right.world, right));
  });
});
