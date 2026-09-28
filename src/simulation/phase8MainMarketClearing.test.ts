/**
 * Phase-8 consumption-tax policy input (Issue #481, REQ-MARKET-004).
 *
 * Handoff/04 section 2 fixes the M3 tax boundary as two side-effect-free reads:
 *
 *   assessedTaxPerUnit  = sellerNetUnitPrice x statutoryConsumptionTaxRate
 *   collectedTaxPerUnit = assessedTaxPerUnit x collectionEfficiency
 *   buyerGrossUnitPrice = sellerNetUnitPrice + collectedTaxPerUnit
 *
 * and requires M3 fixtures to *inject* an immutable provider with explicit finite values,
 * "not new canonical defaults". Phase 8 used to pin `taxRate = 0.1` and
 * `collectionEfficiency: 1.0` in its own body, so a scenario could not state either value;
 * `computeGrossUnitPrice` also multiplied by `(1 + rate)` instead of
 * `(1 + rate x collectionEfficiency)`, which is invisible only while the efficiency is 1.
 *
 * These tests fail against that implementation: the canonical fixture below uses
 * `0 < collectionEfficiency < 1` (MTFX-T4), which the old handler could neither accept nor
 * price correctly.
 */

import { describe, it, expect } from "vitest";
import type {
  CohortId,
  CurrencyId,
  GoodId,
  MarketId,
  ProductionUnitId,
  RegionId,
  StateId,
} from "../domain/id";
import type { RegionState, WorldState } from "./worldState";
import { buildInitialWorld } from "./worldState";
import { createDefaultSimulationConfig } from "../config/simulationConfig";
import { baselineScenario } from "../config/fixtures/baselineScenario";
import { baselineDefinitionPack } from "../config/fixtures/baselineDefinitionPack";
import { executeTick } from "./tickOrchestrator";
import { createPhase8Handler } from "./phase8MainMarketClearing";
import { applyMarketSettlementTransition } from "./marketSettlementTransition";
import type { TaxPolicyProvider } from "./marketSettlement";
import type { MarketIntent } from "./marketIntent";
import { createMarketIntentId } from "./marketIntent";

/** The one good every baseline ProductionUnit carries in its OUTPUT inventory. */
const FOOD = "good:food" as GoodId;

/**
 * The scenario acceptance criterion 3 of Issue #481 names, and the MTFX-T4 fixture:
 * a 20% statutory rate collected at 40%, so assessed and collected tax differ.
 */
const TAX_RATE = 0.2;
const COLLECTION_EFFICIENCY = 0.4;

const fixtureTaxPolicy: TaxPolicyProvider = {
  getConsumptionTaxRate: () => TAX_RATE,
  getCollectionEfficiency: () => COLLECTION_EFFICIENCY,
};

/**
 * Seller-net price this fixture clears at.
 *
 * Phase 8 reads the price from `context.marketPrices` (Phase 6 this tick), else from
 * `world.markets`, else 10. These tests run Phase 8 alone and point the region at a market
 * ID the baseline world does not carry, so the price is exactly 10 with no Phase-6 handler
 * to configure -- the clean seller-net number the acceptance criterion states.
 */
const SELLER_NET_PRICE = 10;
const UNSEEDED_MARKET = "mk:issue-481-tax-policy" as MarketId;

interface Counterparties {
  readonly regionId: RegionId;
  readonly stateId: StateId;
  readonly currencyId: CurrencyId;
  readonly sellerUnitId: ProductionUnitId;
  readonly buyerCohortId: CohortId;
}

/**
 * Pick a controlled region with a food-selling ProductionUnit and a funded Cohort, so the
 * allocation names real stock endpoints and settlement can actually run (R235).
 */
function counterparties(world: WorldState): Counterparties {
  for (const region of world.regions.values()) {
    if (region.controllerStateId === null) continue;
    const regionKey = region.seed.key;
    const currencyId = region.settlementCurrencyId;

    const seller = Array.from(world.productionUnits.values()).find(
      (unit) => unit.seed.regionKey === regionKey && (unit.outputInventory.get(FOOD) ?? 0) > 0,
    );
    const buyer = Array.from(world.cohorts.values()).find(
      (cohort) => cohort.seed.regionKey === regionKey && (cohort.wallet.get(currencyId) ?? 0) > 0,
    );
    if (seller === undefined || buyer === undefined) continue;

    return {
      regionId: region.regionId,
      stateId: region.controllerStateId,
      currencyId,
      sellerUnitId: seller.productionUnitId,
      buyerCohortId: buyer.cohortId,
    };
  }
  throw new Error("baseline scenario carries no controlled region with a seller and a funded buyer");
}

/** One BUY intent for `desiredQuantity` units under `maxSpend`, against one ample SELL. */
function buildIntents(
  actors: Counterparties,
  desiredQuantity: number,
  maxSpend: number,
): MarketIntent[] {
  return [
    {
      id: createMarketIntentId("mi:issue-481-seller"),
      actor: { type: "PRODUCTION_UNIT" as const, productionUnitId: actors.sellerUnitId },
      regionId: actors.regionId,
      goodId: FOOD,
      side: "SELL" as const,
      purpose: "INVENTORY_REBALANCE" as const,
      desiredQuantity: 10,
      minimumReserveQuantity: 0,
      inventoryBucket: "OUTPUT" as const,
      sourcePlanId: "plan:issue-481-supply",
    },
    {
      id: createMarketIntentId("mi:issue-481-buyer"),
      actor: { type: "COHORT" as const, cohortId: actors.buyerCohortId },
      regionId: actors.regionId,
      goodId: FOOD,
      side: "BUY" as const,
      purpose: "CONSUMPTION" as const,
      desiredQuantity,
      maxSpend,
      sourcePlanId: "plan:issue-481-demand",
    },
  ];
}

function buildStateBuyerIntents(
  actors: Counterparties,
  purpose: MarketIntent["purpose"],
  maxSpend: number,
): MarketIntent[] {
  return [
    {
      id: createMarketIntentId("mi:self-procurement-seller"),
      actor: { type: "PRODUCTION_UNIT" as const, productionUnitId: actors.sellerUnitId },
      regionId: actors.regionId,
      goodId: FOOD,
      side: "SELL" as const,
      purpose: "INVENTORY_REBALANCE" as const,
      desiredQuantity: 10,
      minimumReserveQuantity: 0,
      inventoryBucket: "OUTPUT" as const,
      sourcePlanId: "plan:self-procurement-supply",
    },
    {
      id: createMarketIntentId("mi:self-procurement-buyer"),
      actor: { type: "STATE" as const, stateId: actors.stateId },
      regionId: actors.regionId,
      goodId: FOOD,
      side: "BUY" as const,
      purpose,
      desiredQuantity: 1,
      maxSpend,
      sourcePlanId: "plan:self-procurement-demand",
    },
  ];
}

function buildWorld(): WorldState {
  return buildInitialWorld(baselineScenario, baselineDefinitionPack, createDefaultSimulationConfig(), 42);
}

describe("Phase-8 consumption-tax policy input (REQ-MARKET-004, Issue #481)", () => {
  it("prices the buyer's gross at sellerNet x (1 + rate x collectionEfficiency), not (1 + rate)", () => {
    const world = buildWorld();
    const actors = counterparties(world);

    // maxSpend 10.9 sits between the two candidate gross prices on purpose. Under the
    // contract the unit costs 10.8 and is fully affordable; under the old hard-coded
    // 10%/100% path it cost 11 and only 10.9/11 ~= 0.9909 of it was affordable, and under
    // an efficiency-dropping gross formula at this fixture's own rate it would cost 12.
    const result = executeTick(
      world,
      1,
      world.pendingTransitions,
      createPhase8Handler({
        getFixtureIntents: () => buildIntents(actors, 1, 10.9),
        getFixtureMarketIds: () => new Map([[actors.regionId, UNSEEDED_MARKET]]),
        collectTelemetry: true,
        taxPolicy: fixtureTaxPolicy,
      }),
    );

    expect(result.reconciliationErrors).toBeNull();
    expect(result.context.marketAllocations).toHaveLength(1);
    const allocation = result.context.marketAllocations[0]!;

    expect(allocation.sellerNetUnitPrice).toBe(SELLER_NET_PRICE);
    expect(allocation.buyerGrossUnitPrice).toBeCloseTo(10.8, 10);
    // The whole unit clears: affordability is measured against 10.8, which 10.9 covers.
    expect(allocation.quantity).toBeCloseTo(1, 10);
    expect(allocation.consumptionTaxAmount).toBeCloseTo(0.8, 10);
    expect(allocation.destinationStateId).toBe(actors.stateId);

    // Effective demand is the full desired quantity, not the rationed 0.9909 the
    // 10%/100% path produced.
    const aggregates = Array.from(result.context.marketClearingAggregates.values());
    expect(aggregates).toHaveLength(1);
    expect(aggregates[0]!.effectiveDemandQuantity).toBeCloseTo(1, 10);
    expect(aggregates[0]!.clearedQuantity).toBeCloseTo(1, 10);

    // Telemetry reports the same gross price and the same collected tax as the allocation:
    // acceptance criterion 4's "these surfaces cannot disagree".
    expect(result.context.marketTelemetry).toHaveLength(1);
    const telemetry = result.context.marketTelemetry[0]!;
    expect(telemetry.sellerNetPrice).toBe(SELLER_NET_PRICE);
    expect(telemetry.householdGrossPrice).toBeCloseTo(10.8, 10);
    expect(telemetry.consumptionTaxCollected).toBeCloseTo(allocation.consumptionTaxAmount, 10);
  });

  it("exempts destination-State PUBLIC_PROCUREMENT before affordability while preserving household tax telemetry", () => {
    const world = buildWorld();
    const actors = counterparties(world);

    const result = executeTick(
      world,
      1,
      world.pendingTransitions,
      createPhase8Handler({
        getFixtureIntents: () =>
          buildStateBuyerIntents(actors, "PUBLIC_PROCUREMENT", 10.1),
        getFixtureMarketIds: () => new Map([[actors.regionId, UNSEEDED_MARKET]]),
        collectTelemetry: true,
        taxPolicy: fixtureTaxPolicy,
      }),
    );

    expect(result.context.marketAllocations).toHaveLength(1);
    const allocation = result.context.marketAllocations[0]!;
    expect(allocation.destinationStateId).toBe(actors.stateId);
    expect(allocation.sellerNetUnitPrice).toBe(SELLER_NET_PRICE);
    expect(allocation.buyerGrossUnitPrice).toBe(SELLER_NET_PRICE);
    expect(allocation.quantity).toBeCloseTo(1, 10);
    expect(allocation.consumptionTaxAmount).toBe(0);

    const aggregates = Array.from(result.context.marketClearingAggregates.values());
    expect(aggregates).toHaveLength(1);
    expect(aggregates[0]!.effectiveDemandQuantity).toBeCloseTo(1, 10);
    expect(aggregates[0]!.clearedQuantity).toBeCloseTo(1, 10);

    expect(result.context.marketTelemetry).toHaveLength(1);
    expect(result.context.marketTelemetry[0]!.householdGrossPrice).toBeCloseTo(10.8, 10);
    expect(result.context.marketTelemetry[0]!.consumptionTaxCollected).toBe(0);
  });

  it("does not exempt the same destination State when the BUY purpose is not PUBLIC_PROCUREMENT", () => {
    const world = buildWorld();
    const actors = counterparties(world);
    const expectedQuantity = 10.1 / 10.8;

    const result = executeTick(
      world,
      1,
      world.pendingTransitions,
      createPhase8Handler({
        getFixtureIntents: () =>
          buildStateBuyerIntents(actors, "INVESTMENT", 10.1),
        getFixtureMarketIds: () => new Map([[actors.regionId, UNSEEDED_MARKET]]),
        collectTelemetry: true,
        taxPolicy: fixtureTaxPolicy,
      }),
    );

    expect(result.context.marketAllocations).toHaveLength(1);
    const allocation = result.context.marketAllocations[0]!;
    expect(allocation.destinationStateId).toBe(actors.stateId);
    expect(allocation.buyerGrossUnitPrice).toBeCloseTo(10.8, 10);
    expect(allocation.quantity).toBeCloseTo(expectedQuantity, 10);
    expect(allocation.consumptionTaxAmount).toBeCloseTo(expectedQuantity * 0.8, 10);

    const aggregates = Array.from(result.context.marketClearingAggregates.values());
    expect(aggregates).toHaveLength(1);
    expect(aggregates[0]!.effectiveDemandQuantity).toBeCloseTo(expectedQuantity, 10);
    expect(aggregates[0]!.clearedQuantity).toBeCloseTo(expectedQuantity, 10);
  });

  it("settles only the collected tax, leaving assessed-but-uncollected tax with the buyer", () => {
    const world = buildWorld();
    const actors = counterparties(world);
    const { currencyId, stateId, sellerUnitId, buyerCohortId } = actors;

    const result = executeTick(
      world,
      1,
      world.pendingTransitions,
      createPhase8Handler({
        getFixtureIntents: () => buildIntents(actors, 1, 10.9),
        getFixtureMarketIds: () => new Map([[actors.regionId, UNSEEDED_MARKET]]),
        collectTelemetry: false,
        taxPolicy: fixtureTaxPolicy,
      }),
    );
    const allocation = result.context.marketAllocations[0]!;

    const before = {
      buyerWallet: world.cohorts.get(buyerCohortId)!.wallet.get(currencyId) ?? 0,
      sellerWallet: world.productionUnits.get(sellerUnitId)!.wallet.get(currencyId) ?? 0,
      treasury: world.states.get(stateId)!.treasury.get(currencyId) ?? 0,
    };

    const settled = applyMarketSettlementTransition(world, result.context);

    const buyerDebit = before.buyerWallet - (settled.cohorts.get(buyerCohortId)!.wallet.get(currencyId) ?? 0);
    const sellerCredit =
      (settled.productionUnits.get(sellerUnitId)!.wallet.get(currencyId) ?? 0) - before.sellerWallet;
    const treasuryCredit = (settled.states.get(stateId)!.treasury.get(currencyId) ?? 0) - before.treasury;

    // MTFX-I2: buyer gross debit == seller net receipt + collected tax.
    expect(buyerDebit).toBeCloseTo(10.8, 10);
    expect(sellerCredit).toBeCloseTo(10, 10);
    expect(treasuryCredit).toBeCloseTo(0.8, 10);
    expect(treasuryCredit).toBeCloseTo(allocation.consumptionTaxAmount, 10);

    // The assessed-but-uncollected remainder (10 x 0.2 x 0.6 = 1.2) is never debited:
    // it stays with the buyer and creates no treasury inflow.
    const assessed = SELLER_NET_PRICE * TAX_RATE * allocation.quantity;
    expect(assessed - treasuryCredit).toBeCloseTo(1.2, 10);
    expect(buyerDebit).toBeLessThan(SELLER_NET_PRICE * allocation.quantity + assessed);
  });

  it("collects zero State consumption tax in an uncontrolled Region", () => {
    const world = buildWorld();
    const actors = counterparties(world);

    // Baseline regions are all controlled, so the uncontrolled case is constructed by
    // dropping this region's controller -- the only difference from the tests above.
    const region = world.regions.get(actors.regionId)!;
    const uncontrolled: RegionState = { ...region, controllerStateId: null };
    const uncontrolledWorld: WorldState = {
      ...world,
      regions: new Map(world.regions).set(actors.regionId, uncontrolled),
    };

    const result = executeTick(
      uncontrolledWorld,
      1,
      uncontrolledWorld.pendingTransitions,
      createPhase8Handler({
        getFixtureIntents: () => buildIntents(actors, 1, 10.9),
        getFixtureMarketIds: () => new Map([[actors.regionId, UNSEEDED_MARKET]]),
        collectTelemetry: true,
        taxPolicy: fixtureTaxPolicy,
      }),
    );

    expect(result.context.marketAllocations).toHaveLength(1);
    const allocation = result.context.marketAllocations[0]!;
    expect(allocation.destinationStateId).toBeNull();
    expect(allocation.consumptionTaxAmount).toBe(0);
    // With no State to collect for, the buyer pays the seller-net price and nothing more.
    expect(allocation.buyerGrossUnitPrice).toBe(SELLER_NET_PRICE);
    expect(result.context.marketTelemetry[0]!.consumptionTaxCollected).toBe(0);
  });

  it("refuses to clear a fixture that supplies no tax policy", () => {
    // No fallback rate exists to fall back to: an M3 fixture that does not state its tax
    // policy is a defect, not a request for a canonical default.
    expect(() =>
      createPhase8Handler({
        getFixtureIntents: () => [],
        collectTelemetry: false,
      }),
    ).toThrow(/requires an explicit taxPolicy/);
  });

  it("rejects a tax-policy read outside the contract's [0,1] bounds", () => {
    const world = buildWorld();
    const actors = counterparties(world);

    const handler = createPhase8Handler({
      getFixtureIntents: () => buildIntents(actors, 1, 10.9),
      getFixtureMarketIds: () => new Map([[actors.regionId, UNSEEDED_MARKET]]),
      collectTelemetry: false,
      taxPolicy: { getConsumptionTaxRate: () => 0.2, getCollectionEfficiency: () => 1.4 },
    });

    expect(() => executeTick(world, 1, world.pendingTransitions, handler)).toThrow(
      /getCollectionEfficiency.*\[0, 1\]/,
    );
  });
});
