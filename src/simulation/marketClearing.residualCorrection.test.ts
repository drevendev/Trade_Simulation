import { describe, expect, it } from "vitest";
import type { ClanId, CohortId, CurrencyId, GoodId, MarketId, RegionId, StateId } from "../domain/id";
import {
  computeLocalClearing,
  createMarketAllocationId,
  type LocalClearingInput,
} from "./marketClearing";
import { createMarketIntentId, type MarketIntent } from "./marketIntent";

const regionId = "r:residual" as RegionId;
const goodId = "good:residual" as GoodId;
const currencyId = "cur:residual" as CurrencyId;
const marketId = "m:residual" as MarketId;
const stateId = "s:residual" as StateId;

function input(buyers: MarketIntent[], sellers: MarketIntent[], demand: ReadonlyMap<string, number>, supply: ReadonlyMap<string, number>): LocalClearingInput {
  return {
    marketId, regionId, goodId, pass: "MAIN", marketCurrencyId: currencyId,
    buyerIntents: buyers, sellerIntents: sellers,
    computeEffectiveDemand: (intent) => demand.get(intent.id) ?? intent.desiredQuantity,
    computeSellableQuantity: (intent) => supply.get(intent.id) ?? intent.desiredQuantity,
    computeGrossUnitPrice: (_intent, price) => price,
    getTaxationInfo: () => ({ destinationStateId: stateId, assessedTaxRate: 0, collectionEfficiency: 1 }),
  };
}

function permutations<T>(items: readonly T[]): T[][] {
  if (items.length === 0) return [[]];
  return items.flatMap((item, index) => permutations(items.filter((_, i) => i !== index))
    .map((rest) => [item, ...rest]));
}

describe("REQ-MARKET-003 residual correction", () => {
  it.each(["BUY", "SELL"] as const)(
    "keeps mixed-magnitude saturated %s allocations identical across all 24 permutations",
    (side) => {
      const capacities = [128815828.07405503, 0.000003986101270010248, 765.5404474851422, 9.685900454960775e-11];
      const many: MarketIntent[] = capacities.map((quantity, index) => ({
        id: createMarketIntentId(`mi:permutation-${index}`),
        // Canonical actor order deliberately reverses the original accumulation order.
        actor: { type: "STATE" as const, stateId: `s:permutation-${3 - index}` as StateId },
        regionId, goodId, side,
        purpose: side === "BUY" ? "PUBLIC_PROCUREMENT" as const : "INVENTORY_REBALANCE" as const,
        desiredQuantity: quantity,
        ...(side === "BUY" ? { maxSpend: quantity } : {}),
        sourcePlanId: `plan:permutation-${index}`,
      }));
      const canonicalTotal = [...capacities].reverse().reduce((sum, value) => sum + value, 0);
      const opposite: MarketIntent = {
        id: createMarketIntentId("mi:permutation-opposite"),
        actor: { type: "STATE", stateId }, regionId, goodId,
        side: side === "BUY" ? "SELL" : "BUY",
        purpose: "INVENTORY_REBALANCE", desiredQuantity: canonicalTotal * 2,
        ...(side === "SELL" ? { maxSpend: canonicalTotal * 2 } : {}),
        sourcePlanId: "plan:permutation-opposite",
      };
      const run = (ordered: MarketIntent[]) => computeLocalClearing(
        input(side === "BUY" ? ordered : [opposite], side === "SELL" ? ordered : [opposite], new Map(), new Map()),
        new Map(), 1, 1e-8, { value: 0 },
      );
      const expected = run([...many].reverse());
      expect(expected.length).toBeGreaterThan(0);
      expect(Math.abs(expected.reduce((sum, allocation) => sum + allocation.quantity, 0) - canonicalTotal))
        .toBeLessThanOrEqual(1e-8);
      const allOrders = permutations(many);
      expect(allOrders).toHaveLength(24);
      for (const ordered of allOrders) {
        const originalOrder = ordered.map((intent) => intent.id);
        expect(run(ordered)).toEqual(expected);
        expect(ordered.map((intent) => intent.id)).toEqual(originalOrder);
      }
    },
  );
  it("keeps corrected seller fills within sellable capacity", () => {
    const a = 10_000_003.3;
    const b = 50_000_000.1;
    const total = a + b;
    const sellerA: MarketIntent = {
      id: createMarketIntentId("mi:seller-a"), actor: { type: "CLAN", clanId: "c:a" as ClanId },
      regionId, goodId, side: "SELL", purpose: "INVENTORY_REBALANCE", desiredQuantity: a, sourcePlanId: "plan:a",
    };
    const sellerB: MarketIntent = {
      id: createMarketIntentId("mi:seller-b"), actor: { type: "CLAN", clanId: "c:b" as ClanId },
      regionId, goodId, side: "SELL", purpose: "INVENTORY_REBALANCE", desiredQuantity: b, sourcePlanId: "plan:b",
    };
    const buyer: MarketIntent = {
      id: createMarketIntentId("mi:buyer"), actor: { type: "STATE", stateId },
      regionId, goodId, side: "BUY", purpose: "PUBLIC_PROCUREMENT", desiredQuantity: total, maxSpend: total, sourcePlanId: "plan:buyer",
    };
    const allocations = computeLocalClearing(
      input([buyer], [sellerA, sellerB], new Map([[buyer.id, total]]), new Map([[sellerA.id, a], [sellerB.id, b]])),
      new Map(), 1, 1e-8, { value: 0 },
    );
    const fill = (id: string) => allocations.filter(x => x.sellerIntentId === id).reduce((sum, x) => sum + x.quantity, 0);
    expect(fill(sellerA.id)).toBeLessThanOrEqual(a + 1e-8);
    expect(fill(sellerB.id)).toBeLessThanOrEqual(b + 1e-8);
  });

  it("settles positive micro-lots instead of dropping aggregate cleared quantity", () => {
    const micro = 9e-9;
    const total = micro * 2;
    const sellerA: MarketIntent = {
      id: createMarketIntentId("mi:micro-seller-a"), actor: { type: "CLAN", clanId: "c:micro-a" as ClanId },
      regionId, goodId, side: "SELL", purpose: "INVENTORY_REBALANCE", desiredQuantity: micro, sourcePlanId: "plan:micro-seller-a",
    };
    const sellerB: MarketIntent = {
      id: createMarketIntentId("mi:micro-seller-b"), actor: { type: "CLAN", clanId: "c:micro-b" as ClanId },
      regionId, goodId, side: "SELL", purpose: "INVENTORY_REBALANCE", desiredQuantity: micro, sourcePlanId: "plan:micro-seller-b",
    };
    const buyerA: MarketIntent = {
      id: createMarketIntentId("mi:micro-buyer-a"), actor: { type: "COHORT", cohortId: "cohort:micro-a" as CohortId },
      regionId, goodId, side: "BUY", purpose: "CONSUMPTION", desiredQuantity: micro, maxSpend: micro, sourcePlanId: "plan:micro-buyer-a",
    };
    const buyerB: MarketIntent = {
      id: createMarketIntentId("mi:micro-buyer-b"), actor: { type: "COHORT", cohortId: "cohort:micro-b" as CohortId },
      regionId, goodId, side: "BUY", purpose: "CONSUMPTION", desiredQuantity: micro, maxSpend: micro, sourcePlanId: "plan:micro-buyer-b",
    };

    const allocations = computeLocalClearing(
      input(
        [buyerB, buyerA],
        [sellerB, sellerA],
        new Map([[buyerA.id, micro], [buyerB.id, micro]]),
        new Map([[sellerA.id, micro], [sellerB.id, micro]]),
      ),
      new Map(),
      1,
      1e-8,
      { value: 0 },
    );

    expect(allocations).toHaveLength(2);
    expect(allocations.reduce((sum, allocation) => sum + allocation.quantity, 0)).toBeCloseTo(total, 16);
    expect(allocations.every((allocation) => allocation.quantity > 0)).toBe(true);
    expect(allocations.map((allocation) => [allocation.sellerIntentId, allocation.buyerIntentId])).toEqual([
      [sellerA.id, buyerA.id],
      [sellerB.id, buyerB.id],
    ]);
  });

  it("keeps speculative stabilization free of taxation and allocation-ID side effects", () => {
    const capacities = [
      128815828.07405503,
      0.000003986101270010248,
      765.5404474851422,
      9.685900454960775e-11,
    ];
    const buyers: MarketIntent[] = capacities.map((quantity, index) => ({
      id: createMarketIntentId(`mi:side-effect-buyer-${index}`),
      actor: { type: "STATE" as const, stateId: `s:side-effect-${3 - index}` as StateId },
      regionId,
      goodId,
      side: "BUY" as const,
      purpose: "PUBLIC_PROCUREMENT" as const,
      desiredQuantity: quantity,
      maxSpend: quantity,
      sourcePlanId: `plan:side-effect-${index}`,
    }));
    const canonicalTotal = [...capacities].reverse().reduce((sum, value) => sum + value, 0);
    const seller: MarketIntent = {
      id: createMarketIntentId("mi:side-effect-seller"),
      actor: { type: "STATE", stateId },
      regionId,
      goodId,
      side: "SELL",
      purpose: "INVENTORY_REBALANCE",
      desiredQuantity: canonicalTotal * 2,
      sourcePlanId: "plan:side-effect-seller",
    };

    let taxationCalls = 0;
    const baseInput = input(
      buyers,
      [seller],
      new Map(buyers.map((buyer) => [buyer.id, buyer.desiredQuantity])),
      new Map([[seller.id, seller.desiredQuantity]]),
    );
    const counter = { value: 40 };
    const allocations = computeLocalClearing(
      {
        ...baseInput,
        getTaxationInfo: (buyer) => {
          taxationCalls++;
          expect(buyer.side).toBe("BUY");
          return {
            destinationStateId: stateId,
            assessedTaxRate: 0,
            collectionEfficiency: 1,
          };
        },
      },
      new Map(),
      1,
      1e-8,
      counter,
    );

    expect(allocations).toHaveLength(4);
    expect(taxationCalls).toBe(allocations.length);
    expect(counter.value).toBe(44);
    expect(allocations.map((allocation) => allocation.id)).toEqual([
      createMarketAllocationId("ma:m:residual/good:residual/MAIN/41"),
      createMarketAllocationId("ma:m:residual/good:residual/MAIN/42"),
      createMarketAllocationId("ma:m:residual/good:residual/MAIN/43"),
      createMarketAllocationId("ma:m:residual/good:residual/MAIN/44"),
    ]);
    expect(
      Math.abs(
        allocations.reduce((sum, allocation) => sum + allocation.quantity, 0) - canonicalTotal,
      ),
    ).toBeLessThanOrEqual(1e-8);
    expect(
      allocations.some((allocation) => allocation.quantity === 9.685900454960775e-11),
    ).toBe(true);
  });

  it("uses canonical Cohort actor order before intent ID", () => {
    const firstCohort = "cohort:aaa" as CohortId;
    const laterCohort = "cohort:zzz" as CohortId;
    const firstDemand = 43_129_760.71999147;
    const laterDemand = 87_907_903.51801282;
    const totalDemand = firstDemand + laterDemand;
    const cleared = 131_037_248.10973163;
    const first: MarketIntent = {
      id: createMarketIntentId("mi:z-first-actor"), actor: { type: "COHORT", cohortId: firstCohort },
      regionId, goodId, side: "BUY", purpose: "CONSUMPTION", desiredQuantity: firstDemand, maxSpend: firstDemand, sourcePlanId: "plan:first",
    };
    const later: MarketIntent = {
      id: createMarketIntentId("mi:a-first-intent"), actor: { type: "COHORT", cohortId: laterCohort },
      regionId, goodId, side: "BUY", purpose: "CONSUMPTION", desiredQuantity: laterDemand, maxSpend: laterDemand, sourcePlanId: "plan:later",
    };
    const seller: MarketIntent = {
      id: createMarketIntentId("mi:seller"), actor: { type: "STATE", stateId },
      regionId, goodId, side: "SELL", purpose: "INVENTORY_REBALANCE", desiredQuantity: cleared, sourcePlanId: "plan:seller",
    };
    const allocations = computeLocalClearing(
      input([later, first], [seller], new Map([[first.id, firstDemand], [later.id, laterDemand]]), new Map([[seller.id, cleared]])),
      new Map(), 1, 1e-8, { value: 0 },
    );
    const provisional = cleared * firstDemand / totalDemand;
    const actual = allocations
      .filter(x => x.buyer.type === "COHORT" && x.buyer.cohortId === firstCohort)
      .reduce((sum, x) => sum + x.quantity, 0);
    expect(actual - provisional).toBeGreaterThan(1e-8);
  });
});