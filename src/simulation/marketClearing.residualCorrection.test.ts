import { describe, expect, it } from "vitest";
import type { ClanId, CohortId, CurrencyId, GoodId, MarketId, RegionId, StateId } from "../domain/id";
import { computeLocalClearing, type LocalClearingInput } from "./marketClearing";
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

describe("REQ-MARKET-003 residual correction", () => {
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