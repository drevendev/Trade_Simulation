import { describe, expect, it } from "vitest";

import { baselineDefinitionPack } from "../config/fixtures/baselineDefinitionPack";
import { baselineScenario } from "../config/fixtures/baselineScenario";
import type { NeedCategoryDefinition } from "../config/definitionPack";
import { createDefaultSimulationConfig } from "../config/simulationConfig";
import type { StateId } from "../domain/id";
import {
  executeM4ClosedEconomyTick,
  type M4ClosedEconomyOptions,
} from "./m4ClosedEconomyOrchestrator";
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
    substitutionGoods: [{ goodId: "good:tools" as any, basePreference: 1, qualityFactor: 1 }],
    priceSensitivity: 1,
    inventoryCarryoverTicks: 2,
  },
  COMFORT: {
    id: "COMFORT",
    perCapitaTarget: 0.1,
    priority: 2,
    substitutionGoods: [{ goodId: "good:furniture" as any, basePreference: 1, qualityFactor: 1 }],
    priceSensitivity: 1,
    inventoryCarryoverTicks: 2,
  },
  LUXURY: {
    id: "LUXURY",
    perCapitaTarget: 0.1,
    priority: 1,
    substitutionGoods: [{ goodId: "good:cloth" as any, basePreference: 1, qualityFactor: 1 }],
    priceSensitivity: 1,
    inventoryCarryoverTicks: 2,
  },
};

function oneRegionWorld(): WorldState {
  const world = buildInitialWorld(
    baselineScenario,
    { ...baselineDefinitionPack, needCategories: m4NeedCategories },
    createDefaultSimulationConfig(),
    42,
  );
  const region = [...world.regions.values()]
    .sort((left, right) => String(left.regionId).localeCompare(String(right.regionId)))
    .find((candidate) =>
      [...world.markets.values()].some((market) => market.seed.regionKey === candidate.seed.key) &&
      [...world.productionUnits.values()].some((unit) => unit.seed.regionKey === candidate.seed.key) &&
      [...world.cohorts.values()].some((cohort) => cohort.seed.regionKey === candidate.seed.key),
    );
  expect(region).toBeDefined();
  const regionKey = region!.seed.key;
  return {
    ...world,
    regions: new Map([[region!.regionId, region!]]),
    markets: new Map(
      [...world.markets.entries()].filter(([, market]) => market.seed.regionKey === regionKey),
    ),
    productionUnits: new Map(
      [...world.productionUnits.entries()].filter(([, unit]) => unit.seed.regionKey === regionKey),
    ),
    cohorts: new Map(
      [...world.cohorts.entries()].filter(([, cohort]) => cohort.seed.regionKey === regionKey),
    ),
  };
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
  };
}

describe("REQ-CORE-005 M4 Phase-1 jurisdiction integration", () => {
  it("threads one due authority change into both TickContext and persistent Region state", () => {
    const openingBase = oneRegionWorld();
    const region = [...openingBase.regions.values()][0]!;
    const target = [...openingBase.states.keys()]
      .sort((left, right) => String(left).localeCompare(String(right)))
      .find((stateId) => stateId !== region.controllerStateId) as StateId | undefined;
    expect(target).toBeDefined();

    const opening: WorldState = {
      ...openingBase,
      pendingTransitions: {
        ...openingBase.pendingTransitions,
        jurisdictionChanges: [
          {
            regionId: region.regionId,
            nextControllerStateId: target!,
            activateTick: 1,
          },
        ],
      },
    };

    const result = executeM4ClosedEconomyTick(opening, 1, options(opening));

    expect(result.phaseBoundaryError).toBeUndefined();
    expect(result.reconciliationErrors).toBeNull();
    expect(result.context.effectiveJurisdictionByRegion.get(region.regionId)).toBe(target);
    expect(result.world.regions.get(region.regionId)!.controllerStateId).toBe(target);
    expect(result.world.pendingTransitions.jurisdictionChanges).toEqual([]);

    expect(opening.regions.get(region.regionId)!.controllerStateId).toBe(region.controllerStateId);
    expect(opening.pendingTransitions.jurisdictionChanges).toHaveLength(1);
  });
});
