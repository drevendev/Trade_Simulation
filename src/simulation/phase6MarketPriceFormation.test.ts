/**
 * Phase-6 canonical-input fail-closed regressions (REQ-MARKET-002 / Issue #249).
 *
 * Handoff/04 section 9 reprices a live LocalMarket/good from its carried price and
 * persistent MarketExpectationState. These tests pin that producer boundary so missing
 * canonical state cannot silently become market:1, price 10, or a zero expectation.
 */

import { describe, expect, it } from "vitest";
import type {
  CohortId,
  GoodId,
  MarketId,
  ProductionUnitId,
  RegionId,
} from "../domain/id";
import { createDefaultSimulationConfig } from "../config/simulationConfig";
import { baselineDefinitionPack } from "../config/fixtures/baselineDefinitionPack";
import { baselineScenario } from "../config/fixtures/baselineScenario";
import type { MarketIntent } from "./marketIntent";
import { createMarketIntentId } from "./marketIntent";
import {
  createPhase6Handler,
  marketPriceKey,
  type Phase6PriceConfig,
} from "./phase6MarketPriceFormation";
import { executeTick } from "./tickOrchestrator";
import { buildInitialWorld, type WorldState } from "./worldState";

const FOOD = "good:food" as GoodId;

interface Counterparties {
  readonly regionId: RegionId;
  readonly sellerUnitId: ProductionUnitId;
  readonly buyerCohortId: CohortId;
}

function buildWorld(): WorldState {
  return buildInitialWorld(
    baselineScenario,
    baselineDefinitionPack,
    createDefaultSimulationConfig(),
    42,
  );
}

function counterparties(world: WorldState): Counterparties {
  for (const region of world.regions.values()) {
    const market = Array.from(world.markets.values()).find(
      (candidate) =>
        candidate.seed.regionKey === region.seed.key &&
        candidate.priceByGood.has(FOOD) &&
        candidate.expectationsByGood.has(FOOD),
    );
    if (market === undefined) continue;

    const seller = Array.from(world.productionUnits.values()).find(
      (unit) => unit.seed.regionKey === region.seed.key,
    );
    const buyer = Array.from(world.cohorts.values()).find(
      (cohort) => cohort.seed.regionKey === region.seed.key,
    );
    if (seller === undefined || buyer === undefined) continue;

    return {
      regionId: region.regionId,
      sellerUnitId: seller.productionUnitId,
      buyerCohortId: buyer.cohortId,
    };
  }
  throw new Error("baseline scenario has no Region with a live food market and counterparties");
}

function liveMarketId(world: WorldState, regionId: RegionId): MarketId {
  const region = world.regions.get(regionId);
  if (region === undefined) {
    throw new Error(`missing test Region ${regionId}`);
  }

  const markets = Array.from(world.markets.values()).filter(
    (market) => market.seed.regionKey === region.seed.key,
  );
  if (markets.length !== 1) {
    throw new Error(`expected exactly one LocalMarket for ${regionId}, found ${markets.length}`);
  }
  return markets[0]!.marketId;
}

function intents(actors: Counterparties): MarketIntent[] {
  return [
    {
      id: createMarketIntentId("mi:issue-249-seller"),
      actor: { type: "PRODUCTION_UNIT" as const, productionUnitId: actors.sellerUnitId },
      regionId: actors.regionId,
      goodId: FOOD,
      side: "SELL" as const,
      purpose: "INVENTORY_REBALANCE" as const,
      desiredQuantity: 2,
      minimumReserveQuantity: 0,
      inventoryBucket: "OUTPUT" as const,
      sourcePlanId: "plan:issue-249-supply",
    },
    {
      id: createMarketIntentId("mi:issue-249-buyer"),
      actor: { type: "COHORT" as const, cohortId: actors.buyerCohortId },
      regionId: actors.regionId,
      goodId: FOOD,
      side: "BUY" as const,
      purpose: "CONSUMPTION" as const,
      desiredQuantity: 1,
      maxSpend: 100,
      sourcePlanId: "plan:issue-249-demand",
    },
  ];
}

function priceConfig(world: WorldState): Phase6PriceConfig {
  const markets = world.simulationConfig.markets;
  return {
    shortageSignalWeight: markets.shortageSignalWeight,
    inventorySignalWeight: markets.inventorySignalWeight,
    basePriceAdjustmentSpeed: markets.basePriceAdjustmentSpeed,
    maxAbsoluteLogPriceMovePerTick: markets.maxAbsoluteLogPriceMovePerTick,
    targetInventoryCoverageTicks: markets.targetInventoryCoverageTicks,
    minimumPrice: markets.minimumPrice,
    maximumPrice: markets.maximumPrice,
  };
}

describe("Phase-6 canonical LocalMarket inputs (REQ-MARKET-002, Issue #249)", () => {
  it("reprices from the live LocalMarket carried price and persistent expectation state", () => {
    const world = buildWorld();
    const actors = counterparties(world);
    const marketId = liveMarketId(world, actors.regionId);

    const result = executeTick(
      world,
      1,
      world.pendingTransitions,
      createPhase6Handler({
        getFixtureIntents: () => intents(actors),
        getFixtureMarketIds: () => new Map([[actors.regionId, marketId]]),
        priceConfig: priceConfig(world),
      }),
    );

    const price = result.context.marketPrices.get(marketPriceKey(marketId, FOOD));
    expect(price).toBeDefined();
    expect(price).toBeGreaterThan(0);
    expect(Number.isFinite(price)).toBe(true);
  });

  it("rejects an intent whose Region is absent instead of inventing a market", () => {
    const world = buildWorld();
    const actors = counterparties(world);
    const missingRegion = "region:missing-phase6" as RegionId;
    const malformed = intents(actors).map((intent) => ({
      ...intent,
      regionId: missingRegion,
    }));

    expect(() =>
      executeTick(
        world,
        1,
        world.pendingTransitions,
        createPhase6Handler({
          getFixtureIntents: () => malformed,
          priceConfig: priceConfig(world),
        }),
      ),
    ).toThrow(/references missing Region/);
  });

  it("rejects a fixture market that belongs to another Region", () => {
    const world = buildWorld();
    const actors = counterparties(world);
    const region = world.regions.get(actors.regionId)!;
    const wrongMarket = Array.from(world.markets.values()).find(
      (market) => market.seed.regionKey !== region.seed.key,
    )!.marketId;

    expect(() =>
      executeTick(
        world,
        1,
        world.pendingTransitions,
        createPhase6Handler({
          getFixtureIntents: () => intents(actors),
          getFixtureMarketIds: () => new Map([[actors.regionId, wrongMarket]]),
          priceConfig: priceConfig(world),
        }),
      ),
    ).toThrow(/does not belong to Region/);
  });

  it("rejects a missing carried price instead of substituting numeric 10", () => {
    const world = buildWorld();
    const actors = counterparties(world);
    const marketId = liveMarketId(world, actors.regionId);
    const market = world.markets.get(marketId)!;
    const prices = new Map(market.priceByGood);
    prices.delete(FOOD);
    const malformedWorld: WorldState = {
      ...world,
      markets: new Map(world.markets).set(marketId, { ...market, priceByGood: prices }),
    };

    expect(() =>
      executeTick(
        malformedWorld,
        1,
        malformedWorld.pendingTransitions,
        createPhase6Handler({
          getFixtureIntents: () => intents(actors),
          getFixtureMarketIds: () => new Map([[actors.regionId, marketId]]),
          priceConfig: priceConfig(malformedWorld),
        }),
      ),
    ).toThrow(/requires a finite positive carried price/);
  });

  it("rejects a missing persistent expectation instead of rebootstrapping to zero", () => {
    const world = buildWorld();
    const actors = counterparties(world);
    const marketId = liveMarketId(world, actors.regionId);
    const market = world.markets.get(marketId)!;
    const expectations = new Map(market.expectationsByGood);
    expectations.delete(FOOD);
    const malformedWorld: WorldState = {
      ...world,
      markets: new Map(world.markets).set(marketId, {
        ...market,
        expectationsByGood: expectations,
      }),
    };

    expect(() =>
      executeTick(
        malformedWorld,
        1,
        malformedWorld.pendingTransitions,
        createPhase6Handler({
          getFixtureIntents: () => intents(actors),
          getFixtureMarketIds: () => new Map([[actors.regionId, marketId]]),
          priceConfig: priceConfig(malformedWorld),
        }),
      ),
    ).toThrow(/requires persistent MarketExpectationState/);
  });
});
