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
  readonly getTaxationInfo: (buyer: MarketIntent, regionId: RegionId, good: GoodId) => {
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
  // Canonicalize before callbacks and floating-point reductions, not only before
  // residual correction: addition order is observable for mixed-magnitude stocks.
  const intentKey = (intent: MarketIntent): string => `${actorRefKey(intent.actor)}|${intent.id}`;
  const buyerIntents = stableOrderBy(input.buyerIntents, intentKey);
  const sellerIntents = stableOrderBy(input.sellerIntents, intentKey);

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
    provisionalFill: clearedQuantity === totalSupply
      ? data.sellable
      : (clearedQuantity * data.sellable) / totalSupply,
  }));

  // Provisional buyer allocations: buyerFill_j = Q × effectiveDemand_j / Σ effectiveDemand
  const provisionalBuyerAllocations = buyerData.map((data) => ({
    ...data,
    provisionalFill: clearedQuantity === totalDemand
      ? data.effectiveDemand
      : (clearedQuantity * data.effectiveDemand) / totalDemand,
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

  // Build the concrete match plan without observable effects first. Mixed-magnitude
  // binary64 subtraction can make the sequentially emitted plan miss Q by one ULP
  // even when both corrected marginal totals are canonical. A guarded half-epsilon
  // stabilization may repair that plan, but callbacks and allocation IDs are consumed
  // only once after the final plan has been selected.
  const matchPlan = selectStableMatchPlan(
    correctedSellerAllocations,
    correctedBuyerAllocations,
    clearedQuantity,
    quantityEpsilon,
    clearedQuantity === totalSupply,
    clearedQuantity === totalDemand,
  );

  return materializeMatchPlan(
    input,
    matchPlan,
    marketPrice,
    allocationIdCounter,
  );
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

interface PlannedMatch {
  readonly seller: MarketIntent;
  readonly buyer: MarketIntent;
  readonly quantity: number;
}

interface CorrectedIntentFill {
  readonly intent: MarketIntent;
  readonly correctedFill: number;
}

/**
 * Pure two-pointer planning. No taxation callback and no allocation ID consumption is
 * allowed here: candidate plans are speculative until selectStableMatchPlan commits to one.
 */
function buildMatchPlan(
  sellerAllocations: ReadonlyArray<CorrectedIntentFill>,
  buyerAllocations: ReadonlyArray<CorrectedIntentFill>,
): PlannedMatch[] {
  const plan: PlannedMatch[] = [];

  let sellerIdx = 0;
  let buyerIdx = 0;
  let sellerRemaining = sellerAllocations[0]?.correctedFill ?? 0;
  let buyerRemaining = buyerAllocations[0]?.correctedFill ?? 0;

  while (sellerIdx < sellerAllocations.length && buyerIdx < buyerAllocations.length) {
    const sellerData = sellerAllocations[sellerIdx]!;
    const buyerData = buyerAllocations[buyerIdx]!;
    const matched = Math.min(sellerRemaining, buyerRemaining);

    // Epsilon is an aggregate reconciliation tolerance, not a minimum tradable lot.
    // Every positive micro-lot remains real cleared quantity.
    if (matched > 0) {
      plan.push({
        seller: sellerData.intent,
        buyer: buyerData.intent,
        quantity: matched,
      });
    }

    sellerRemaining -= matched;
    buyerRemaining -= matched;

    // Exact subtraction makes at least one side zero for each match. Advance only on
    // actual exhaustion so a positive sub-epsilon remainder is never silently dropped.
    if (sellerRemaining <= 0) {
      sellerIdx++;
      sellerRemaining = sellerAllocations[sellerIdx]?.correctedFill ?? 0;
    }
    if (buyerRemaining <= 0) {
      buyerIdx++;
      buyerRemaining = buyerAllocations[buyerIdx]?.correctedFill ?? 0;
    }
  }

  return plan;
}

function planQuantity(plan: ReadonlyArray<PlannedMatch>): number {
  return plan.reduce((sum, match) => sum + match.quantity, 0);
}

function planMarginals(
  plan: ReadonlyArray<PlannedMatch>,
  side: "SELL" | "BUY",
): Map<string, number> {
  const result = new Map<string, number>();
  for (const match of plan) {
    const intent = side === "SELL" ? match.seller : match.buyer;
    result.set(intent.id, (result.get(intent.id) ?? 0) + match.quantity);
  }
  return result;
}

function trialPreservesMarginals(
  plan: ReadonlyArray<PlannedMatch>,
  originalSellers: ReadonlyArray<CorrectedIntentFill>,
  originalBuyers: ReadonlyArray<CorrectedIntentFill>,
  trialSellers: ReadonlyArray<CorrectedIntentFill>,
  trialBuyers: ReadonlyArray<CorrectedIntentFill>,
  quantityEpsilon: number,
): boolean {
  const sellerActual = planMarginals(plan, "SELL");
  const buyerActual = planMarginals(plan, "BUY");

  const sideIsSafe = (
    actual: ReadonlyMap<string, number>,
    original: ReadonlyArray<CorrectedIntentFill>,
    trial: ReadonlyArray<CorrectedIntentFill>,
  ): boolean => {
    const trialById = new Map(trial.map((entry) => [entry.intent.id, entry.correctedFill]));
    for (const entry of original) {
      const realized = actual.get(entry.intent.id) ?? 0;
      const trialTarget = trialById.get(entry.intent.id);
      if (trialTarget === undefined) return false;

      // A stabilization may under-fill by at most epsilon but may never borrow from
      // an original per-intent capacity, even by a sub-epsilon amount.
      if (realized > entry.correctedFill) return false;
      if (entry.correctedFill - realized > quantityEpsilon) return false;

      // The materialized plan must also remain within epsilon of the trial target.
      // Subtraction is deliberate: target + epsilon can round outward by an ULP at
      // large magnitudes and hide a real overrun.
      if (realized - trialTarget > quantityEpsilon) return false;
      if (trialTarget - realized > quantityEpsilon) return false;

      // Positive canonical fills, including micro-lots, must not disappear.
      if (entry.correctedFill > 0 && !(realized > 0)) return false;
    }
    return true;
  };

  return sideIsSafe(sellerActual, originalSellers, trialSellers)
    && sideIsSafe(buyerActual, originalBuyers, trialBuyers);
}

/**
 * Repair only the rare one-ULP sequential aggregation miss where exactly one side is
 * saturated. The trial reduces one non-micro saturated marginal by epsilon/2, but it is
 * accepted only if the canonical saturated-side reduction remains bit-identical, the
 * actually emitted plan improves to <= epsilon, every original/trial marginal stays safe,
 * and no positive fill disappears. Otherwise the original canonical plan is retained.
 */
function selectStableMatchPlan(
  sellerAllocations: ReadonlyArray<CorrectedIntentFill>,
  buyerAllocations: ReadonlyArray<CorrectedIntentFill>,
  clearedQuantity: number,
  quantityEpsilon: number,
  sellerSaturated: boolean,
  buyerSaturated: boolean,
): PlannedMatch[] {
  const baseline = buildMatchPlan(sellerAllocations, buyerAllocations);
  const baselineResidual = Math.abs(clearedQuantity - planQuantity(baseline));
  if (baselineResidual <= quantityEpsilon) {
    return baseline;
  }

  // A bounded adjustment is only justified when one and only one marginal side is
  // canonically saturated. Balanced-both-sides and proportionally scaled cases fall back.
  if (sellerSaturated === buyerSaturated) {
    return baseline;
  }

  const saturated = sellerSaturated ? sellerAllocations : buyerAllocations;
  const canonicalSaturatedTotal = saturated.reduce((sum, entry) => sum + entry.correctedFill, 0);
  const halfEpsilon = quantityEpsilon / 2;

  for (let candidateIndex = 0; candidateIndex < saturated.length; candidateIndex++) {
    const candidate = saturated[candidateIndex]!;
    if (!(candidate.correctedFill > quantityEpsilon)) continue;

    const trialSellers = sellerAllocations.map((entry, index) =>
      sellerSaturated && index === candidateIndex
        ? { ...entry, correctedFill: entry.correctedFill - halfEpsilon }
        : entry,
    );
    const trialBuyers = buyerAllocations.map((entry, index) =>
      buyerSaturated && index === candidateIndex
        ? { ...entry, correctedFill: entry.correctedFill - halfEpsilon }
        : entry,
    );

    const trialSaturated = sellerSaturated ? trialSellers : trialBuyers;
    const trialSaturatedTotal = trialSaturated.reduce(
      (sum, entry) => sum + entry.correctedFill,
      0,
    );

    // If the canonical saturated total itself changes, the trial is not merely a
    // representability stabilization and must not be used.
    if (trialSaturatedTotal !== canonicalSaturatedTotal) continue;

    const trial = buildMatchPlan(trialSellers, trialBuyers);
    const trialResidual = Math.abs(clearedQuantity - planQuantity(trial));
    if (!(trialResidual < baselineResidual) || trialResidual > quantityEpsilon) continue;

    if (!trialPreservesMarginals(
      trial,
      sellerAllocations,
      buyerAllocations,
      trialSellers,
      trialBuyers,
      quantityEpsilon,
    )) {
      continue;
    }

    return trial;
  }

  return baseline;
}

/**
 * Materialize exactly one already-selected plan. This is the only stage allowed to invoke
 * taxation callbacks or consume allocation IDs, so rejected numerical trials cannot leak
 * externally observable effects.
 */
function materializeMatchPlan(
  input: LocalClearingInput,
  plan: ReadonlyArray<PlannedMatch>,
  marketPrice: number,
  allocationIdCounter: { value: number },
): MarketAllocation[] {
  const allocations: MarketAllocation[] = [];

  for (const match of plan) {
    const taxInfo = input.getTaxationInfo(
      match.buyer,
      match.buyer.regionId,
      input.goodId,
    );

    const collectedTaxPerUnit =
      marketPrice * taxInfo.assessedTaxRate * taxInfo.collectionEfficiency;
    const grossUnitPrice = marketPrice + collectedTaxPerUnit;

    allocationIdCounter.value++;
    allocations.push({
      id: createMarketAllocationId(
        `ma:${input.marketId}/${input.goodId}/${input.pass}/${allocationIdCounter.value}`,
      ),
      marketId: input.marketId,
      regionId: input.regionId,
      goodId: input.goodId,
      pass: input.pass,
      sellerIntentId: match.seller.id,
      buyerIntentId: match.buyer.id,
      seller: match.seller.actor,
      buyer: match.buyer.actor,
      quantity: match.quantity,
      sellerNetUnitPrice: marketPrice,
      buyerGrossUnitPrice: grossUnitPrice,
      marketCurrencyId: input.marketCurrencyId,
      consumptionTaxAmount: match.quantity * collectedTaxPerUnit,
      destinationStateId: taxInfo.destinationStateId,
      sellerInventoryBucket: (match.seller.inventoryBucket ?? "GENERAL") as
        | "GENERAL"
        | "INPUT"
        | "OUTPUT"
        | "INVESTMENT",
      buyerInventoryBucket: (match.buyer.inventoryBucket ?? "GENERAL") as
        | "GENERAL"
        | "INPUT"
        | "OUTPUT"
        | "INVESTMENT",
    });
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
