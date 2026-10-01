/**
 * Deterministic local clearing primitive and MarketAllocation construction (REQ-MARKET-003).
 *
 * Implements deterministic proportional local clearing with stable residual correction
 * and two-pointer concrete matching to produce MarketAllocation bundles for each matched lot.
 *
 * See sections 7, 10 and 11 of docs/spec/mirror/06 - Handoff/04 — MARKETS_TRADE_FX_CONTRACTS.md
 */

import type {
  CurrencyId,
  GoodId,
  MarketId,
  RegionId,
  StateId,
} from "../domain/id";
import { actorRefKey, type ActorRef } from "../domain/genesisLedger";
import { assertFiniteCanonicalNumber } from "../domain/numeric";
import { stableOrderBy } from "../domain/ordering";
import type { MarketIntent, MarketIntentId } from "./marketIntent";

/** Opaque market allocation ID (ma:...) */
export type MarketAllocationId = string & { readonly __brand: "MarketAllocationId" };

export function createMarketAllocationId(value: string): MarketAllocationId {
  if (!value.startsWith("ma:")) {
    throw new Error(`MarketAllocationId must start with "ma:", got ${value}`);
  }
  return value as MarketAllocationId;
}

/**
 * Ephemeral allocation of goods and money for one matched lot in a local market clearing.
 * Becomes persistent truth only after settlement executes all transaction mutations.
 * Inventory endpoint rule: settlement debits sellerInventoryBucket and credits buyerInventoryBucket.
 */
export interface MarketAllocation {
  readonly id: MarketAllocationId;
  readonly marketId: MarketId;
  readonly regionId: RegionId;
  readonly goodId: GoodId;
  readonly pass: "PRE_PRODUCTION" | "MAIN";
  readonly sellerIntentId: MarketIntentId;
  readonly buyerIntentId: MarketIntentId;
  readonly seller: ActorRef;
  readonly buyer: ActorRef;
  readonly quantity: number;
  readonly sellerNetUnitPrice: number;
  readonly buyerGrossUnitPrice: number;
  readonly marketCurrencyId: CurrencyId;
  readonly consumptionTaxAmount: number;
  readonly destinationStateId: StateId | null;
  readonly sellerInventoryBucket: "GENERAL" | "INPUT" | "OUTPUT" | "INVESTMENT";
  readonly buyerInventoryBucket: "GENERAL" | "INPUT" | "OUTPUT" | "INVESTMENT";
}

/**
 * Input to deterministic local clearing: aggregated demand and supply for one market/good/pass.
 */
export interface LocalClearingInput {
  readonly marketId: MarketId;
  readonly regionId: RegionId;
  readonly goodId: GoodId;
  readonly pass: "PRE_PRODUCTION" | "MAIN";
  readonly marketCurrencyId: CurrencyId;
  readonly buyerIntents: ReadonlyArray<MarketIntent>;
  readonly sellerIntents: ReadonlyArray<MarketIntent>;
  readonly computeEffectiveDemand: (intent: MarketIntent, marketPrice: number) => number;
  readonly computeSellableQuantity: (intent: MarketIntent, commitmentLedger: Map<string, number>) => number;
  readonly computeGrossUnitPrice: (intent: MarketIntent, sellerNetPrice: number) => number;
  readonly getTaxationInfo: (buyer: ActorRef, regionId: RegionId, good: GoodId) => {
    destinationStateId: StateId | null;
    assessedTaxRate: number;
    collectionEfficiency: number;
  };
}

/**
 * Compute canonical sellable quantity for a SELL intent.
 * sellable_i = min(desiredQuantity, max(0, owned - reserve - alreadyCommitted))
 *
 * Note: This function does NOT include commitmentLedger handling for now;
 * that belongs in Phase-4/Phase-8 orchestration. This is the core formula.
 */
export function computeSellableQuantity(
  intent: MarketIntent,
  ownedQuantity: number,
  minimumReserveQuantity: number = 0,
  alreadyCommitted: number = 0,
): number {
  if (intent.side !== "SELL") {
    throw new Error("computeSellableQuantity only applies to SELL intents");
  }

  const reserve = minimumReserveQuantity;
  const available = Math.max(0, ownedQuantity - reserve - alreadyCommitted);
  return Math.min(intent.desiredQuantity, available);
}

/**
 * Compute canonical effective demand for a BUY intent.
 * effectiveDemand_j = min(desiredQuantity, maxSpend / max(grossUnitPrice, moneyEpsilon))
 *
 * Price must not be zero or negative (except explicit free-scenario fixtures).
 */
export function computeEffectiveDemand(
  intent: MarketIntent,
  grossUnitPrice: number,
  moneyEpsilon: number = 1e-8,
): number {
  if (intent.side !== "BUY") {
    throw new Error("computeEffectiveDemand only applies to BUY intents");
  }
  if (typeof intent.maxSpend !== "number") {
    throw new Error("BUY intent must have maxSpend");
  }

  const effectivePrice = Math.max(grossUnitPrice, moneyEpsilon);
  return Math.min(intent.desiredQuantity, intent.maxSpend / effectivePrice);
}

/**
 * Deterministic proportional local clearing for one region + good + pass.
 *
 * Steps:
 * 1. Compute Q = min(Σ sellable, Σ effectiveDemand)
 * 2. Provisional allocations: sellerFill_i = Q × sellable_i / Σ sellable
 * 3. Stable residual correction to handle floating-point rounding
 * 4. Two-pointer concrete matching to produce atomic transaction bundles
 *
 * Seller fills and buyer fills must sum to the same cleared quantity within epsilon.
 * No fill exceeds sellable stock, reserve, effective demand or maxSpend.
 * Residual correction and concrete matching are stable-ID ordered.
 * Shuffled intent insertion produces identical normalized allocations.
 */
export function computeLocalClearing(
  input: LocalClearingInput,
  commitmentLedger: Map<string, number>,
  marketPrice: number,
  quantityEpsilon: number = 1e-8,
  allocationIdCounter: { value: number },
): MarketAllocation[] {
  // Validate inputs
  const buyerIntents = input.buyerIntents;
  const sellerIntents = input.sellerIntents;

  if (buyerIntents.length === 0 || sellerIntents.length === 0) {
    return [];
  }

  // Compute effective demand and sellable quantities
  const buyerData = buyerIntents.map((intent) => {
    const grossPrice = input.computeGrossUnitPrice(intent, marketPrice);
    const effectiveDemand = input.computeEffectiveDemand(intent, grossPrice);
    assertFiniteCanonicalNumber(effectiveDemand, `effectiveDemand for buyer ${intent.id}`);
    return { intent, effectiveDemand, grossPrice };
  });

  const sellerData = sellerIntents.map((intent) => {
    const sellable = input.computeSellableQuantity(intent, commitmentLedger);
    assertFiniteCanonicalNumber(sellable, `sellable for seller ${intent.id}`);
    return { intent, sellable };
  });

  // Compute total demand and supply
  const totalDemand = buyerData.reduce((sum, d) => sum + d.effectiveDemand, 0);
  const totalSupply = sellerData.reduce((sum, s) => sum + s.sellable, 0);

  if (totalDemand <= quantityEpsilon || totalSupply <= quantityEpsilon) {
    return [];
  }

  // Compute cleared quantity: Q = min(Σ sellable, Σ effectiveDemand)
  const clearedQuantity = Math.min(totalDemand, totalSupply);

  // Provisional seller allocations: sellerFill_i = Q × sellable_i / Σ sellable
  const provisionalSellerAllocations = sellerData.map((data) => ({
    ...data,
    provisionalFill: (clearedQuantity * data.sellable) / totalSupply,
  }));

  // Provisional buyer allocations: buyerFill_j = Q × effectiveDemand_j / Σ effectiveDemand
  const provisionalBuyerAllocations = buyerData.map((data) => ({
    ...data,
    provisionalFill: (clearedQuantity * data.effectiveDemand) / totalDemand,
  }));

  // Residual correction: use stable ID order (actor ID then intent ID)
  const correctedSellerAllocations = applyResidualCorrection(
    provisionalSellerAllocations,
    clearedQuantity,
    quantityEpsilon,
    (entry) => entry.sellable,
  );
  const correctedBuyerAllocations = applyResidualCorrection(
    provisionalBuyerAllocations,
    clearedQuantity,
    quantityEpsilon,
    (entry) => entry.effectiveDemand,
  );

  // Two-pointer concrete matching
  const allocations = twoPointerMatcher(
    input,
    correctedSellerAllocations,
    correctedBuyerAllocations,
    marketPrice,
    allocationIdCounter,
  );

  return allocations;
}

/**
 * Apply stable residual correction to provisional allocations.
 * Correction order is persistent actor ID then intent ID.
 * This ensures floating-point rounding errors do not create/destroy quantity.
 */
function applyResidualCorrection<T extends { intent: MarketIntent; provisionalFill: number }>(
  data: T[],
  targetTotal: number,
  quantityEpsilon: number,
  capacityOf: (entry: T) => number,
): (T & { correctedFill: number })[] {
  // Sort by canonical persistent actor key first, then intent ID.
  // Reusing actorRefKey keeps COHORT and MONETARY_AUTHORITY ordering aligned with
  // the rest of the stock/settlement model and makes the ActorRef union exhaustive.
  const sorted = stableOrderBy(data, (d) => `${actorRefKey(d.intent.actor)}|${d.intent.id}`);

  // Start with provisionalFill for all.
  const corrected = sorted.map((d) => ({
    ...d,
    correctedFill: d.provisionalFill,
  }));

  // Compute total and residual error.
  const currentTotal = corrected.reduce((sum, d) => sum + d.correctedFill, 0);
  const residualError = targetTotal - currentTotal;

  // Reconcile only significant floating residuals, in stable order, without
  // ever moving a fill above its canonical sellable/effective-demand capacity
  // or below zero.
  if (Math.abs(residualError) > quantityEpsilon) {
    let remaining = residualError;
    for (let i = 0; i < corrected.length && Math.abs(remaining) > quantityEpsilon; i++) {
      const curr = corrected[i]!;
      const capacity = capacityOf(curr);
      assertFiniteCanonicalNumber(capacity, `residual-correction capacity for ${curr.intent.id}`);
      if (capacity < 0) {
        throw new Error(`Residual-correction capacity must be >= 0 for ${curr.intent.id}, got ${capacity}`);
      }

      const toAdd =
        remaining > 0
          ? Math.min(remaining, Math.max(0, capacity - curr.correctedFill))
          : Math.max(remaining, -curr.correctedFill);

      curr.correctedFill += toAdd;
      remaining -= toAdd;
    }

    if (Math.abs(remaining) > quantityEpsilon) {
      throw new Error(
        `Residual correction could not reconcile target total within epsilon: remaining=${remaining}`,
      );
    }
  }

  return corrected;
}

/**
 * Two-pointer concrete matching: produce atomic transaction bundles.
 * Sellers and buyers sorted by stable key, then matched with O(B + S) complexity.
 * Each matched lot q produces one MarketAllocation.
 */
function twoPointerMatcher(
  input: LocalClearingInput,
  sellerAllocations: ReadonlyArray<{
    intent: MarketIntent;
    correctedFill: number;
  }>,
  buyerAllocations: ReadonlyArray<{
    intent: MarketIntent;
    grossPrice: number;
    correctedFill: number;
  }>,
  marketPrice: number,
  allocationIdCounter: { value: number },
): MarketAllocation[] {
  const allocations: MarketAllocation[] = [];

  let sellerIdx = 0;
  let buyerIdx = 0;
  let sellerRemaining = sellerAllocations[0]?.correctedFill ?? 0;
  let buyerRemaining = buyerAllocations[0]?.correctedFill ?? 0;

  while (sellerIdx < sellerAllocations.length && buyerIdx < buyerAllocations.length) {
    const sellerData = sellerAllocations[sellerIdx]!;
    const buyerData = buyerAllocations[buyerIdx]!;

    const matched = Math.min(sellerRemaining, buyerRemaining);
    if (matched > 0) {
      const seller = sellerData.intent;
      const buyer = buyerData.intent;

      // Get taxation info for this buyer in this destination region
      const taxInfo = input.getTaxationInfo(
        buyer.actor,
        buyer.regionId,
        input.goodId,
      );

      const collectedTaxPerUnit = marketPrice * taxInfo.assessedTaxRate * taxInfo.collectionEfficiency;
      const grossUnitPrice = marketPrice + collectedTaxPerUnit;

      allocationIdCounter.value++;
      const allocation: MarketAllocation = {
        id: createMarketAllocationId(`ma:${input.marketId}/${input.goodId}/${input.pass}/${allocationIdCounter.value}`),
        marketId: input.marketId,
        regionId: input.regionId,
        goodId: input.goodId,
        pass: input.pass,
        sellerIntentId: seller.id,
        buyerIntentId: buyer.id,
        seller: seller.actor,
        buyer: buyer.actor,
        quantity: matched,
        sellerNetUnitPrice: marketPrice,
        buyerGrossUnitPrice: grossUnitPrice,
        marketCurrencyId: input.marketCurrencyId,
        consumptionTaxAmount: matched * collectedTaxPerUnit,
        destinationStateId: taxInfo.destinationStateId,
        sellerInventoryBucket: (seller.inventoryBucket ?? "GENERAL") as
          | "GENERAL"
          | "INPUT"
          | "OUTPUT"
          | "INVESTMENT",
        buyerInventoryBucket: (buyer.inventoryBucket ?? "GENERAL") as
          | "GENERAL"
          | "INPUT"
          | "OUTPUT"
          | "INVESTMENT",
      };

      allocations.push(allocation);
    }

    sellerRemaining -= matched;
    buyerRemaining -= matched;

    // Epsilon belongs to aggregate reconciliation, not to individual lots.
    // A positive sub-epsilon fill is still real cleared quantity and must settle.
    // Subtracting the exact matched operand makes at least one remainder exactly zero,
    // so exact exhaustion advances the pointer without silently discarding micro-lots.
    if (sellerRemaining <= 0) {
      sellerIdx++;
      sellerRemaining = sellerAllocations[sellerIdx]?.correctedFill ?? 0;
    }
    if (buyerRemaining <= 0) {
      buyerIdx++;
      buyerRemaining = buyerAllocations[buyerIdx]?.correctedFill ?? 0;
    }
  }

  return allocations;
}

/**
 * Validate a MarketAllocation against specification constraints.
 * Throws descriptive error if any constraint is violated.
 */
export function validateMarketAllocation(allocation: MarketAllocation, quantityEpsilon: number = 1e-8): void {
  if (!allocation.id || !allocation.id.startsWith("ma:")) {
    throw new Error("MarketAllocation must have valid id starting with 'ma:'");
  }

  if (allocation.pass !== "PRE_PRODUCTION" && allocation.pass !== "MAIN") {
    throw new Error(`MarketAllocation pass must be PRE_PRODUCTION or MAIN, got ${allocation.pass}`);
  }

  if (allocation.quantity < 0) {
    throw new Error(`MarketAllocation quantity must be >= 0, got ${allocation.quantity}`);
  }
  assertFiniteCanonicalNumber(allocation.quantity, "MarketAllocation quantity");

  if (allocation.sellerNetUnitPrice < 0) {
    throw new Error(
      `MarketAllocation sellerNetUnitPrice must be >= 0, got ${allocation.sellerNetUnitPrice}`,
    );
  }
  assertFiniteCanonicalNumber(allocation.sellerNetUnitPrice, "MarketAllocation sellerNetUnitPrice");

  if (allocation.buyerGrossUnitPrice < 0) {
    throw new Error(
      `MarketAllocation buyerGrossUnitPrice must be >= 0, got ${allocation.buyerGrossUnitPrice}`,
    );
  }
  assertFiniteCanonicalNumber(allocation.buyerGrossUnitPrice, "MarketAllocation buyerGrossUnitPrice");

  if (allocation.consumptionTaxAmount < 0) {
    throw new Error(
      `MarketAllocation consumptionTaxAmount must be >= 0, got ${allocation.consumptionTaxAmount}`,
    );
  }
  assertFiniteCanonicalNumber(allocation.consumptionTaxAmount, "MarketAllocation consumptionTaxAmount");

  // Tax amount must not exceed gross payment
  const grossPayment = allocation.quantity * allocation.buyerGrossUnitPrice;
  if (allocation.consumptionTaxAmount > grossPayment + quantityEpsilon) {
    throw new Error(
      `MarketAllocation consumptionTaxAmount ${allocation.consumptionTaxAmount} exceeds gross payment ${grossPayment}`,
    );
  }
}
