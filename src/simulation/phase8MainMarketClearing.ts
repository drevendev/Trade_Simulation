/**
 * Phase-8 handler: Residual local main-market clearing and settlement with telemetry.
 *
 * Phase-8 is "Residual local main-market clearing" per CORE_SCHEMA_AND_LIFECYCLES.md section 10.
 * For M3, this handler:
 * 1. Executes clearing for seeded market scenarios with fixture intents
 * 2. Collects deterministic market telemetry (REQ-MARKET-005) from actual clearing results
 * 3. Returns updated TickContext with telemetry and the realized allocations
 *
 * Telemetry is non-authoritative diagnostic output. collectTelemetry only gates whether
 * telemetry is built and appended to context.marketTelemetry: clearing itself (and the
 * resulting context.marketAllocations) executes identically either way, so enabled/disabled
 * runs produce identical canonical stocks, allocations, and replay hash.
 */

import type { MarketId, GoodId, RegionId, StateId } from "../domain/id";
import { stableOrderBy } from "../domain/ordering";
import type { WorldState } from "./worldState";
import type { TickContext, PhaseHandler } from "./tickOrchestrator";
import type { PendingTransitions } from "./worldState";
import type { MarketIntent } from "./marketIntent";
import { LocalMarketTelemetryBuilder } from "./marketTelemetry";
import { computeLocalClearing, type LocalClearingInput } from "./marketClearing";
import type { TaxPolicyProvider } from "./marketSettlement";
import { marketPriceKey } from "./phase6MarketPriceFormation";

/**
 * Resolve the two side-effect-free tax-policy reads Handoff/04 section 2 allows market
 * clearing to make, for one destination jurisdiction and good.
 *
 * An uncontrolled Region is decided here rather than delegated: section 2 pins both reads
 * to zero when `destinationStateId == null`, so a provider that would answer for an absent
 * State cannot reintroduce a treasury credit with nowhere to land.
 *
 * The bounds are the contract's own (`collectionEfficiency in [0,1]`, and the same range
 * for a statutory rate as `computeConsumptionTax` enforces at settlement). Rejecting here
 * means an out-of-range fixture fails at the boundary that read it, instead of surfacing
 * later as a settlement error about a number Phase 8 chose.
 */
const resolveTaxPolicy = (
  taxPolicy: TaxPolicyProvider,
  destinationStateId: StateId | null,
  goodId: GoodId,
): { assessedTaxRate: number; collectionEfficiency: number } => {
  if (destinationStateId === null) {
    return { assessedTaxRate: 0, collectionEfficiency: 0 };
  }

  const assessedTaxRate = taxPolicy.getConsumptionTaxRate(destinationStateId, goodId);
  const collectionEfficiency = taxPolicy.getCollectionEfficiency(destinationStateId);

  if (!Number.isFinite(assessedTaxRate) || assessedTaxRate < 0 || assessedTaxRate > 1) {
    throw new Error(
      `Phase-8 taxPolicy.getConsumptionTaxRate(${destinationStateId}, ${goodId}) must be a ` +
        `finite number in [0, 1], got ${assessedTaxRate}`,
    );
  }
  if (
    !Number.isFinite(collectionEfficiency) ||
    collectionEfficiency < 0 ||
    collectionEfficiency > 1
  ) {
    throw new Error(
      `Phase-8 taxPolicy.getCollectionEfficiency(${destinationStateId}) must be a finite ` +
        `number in [0, 1], got ${collectionEfficiency}`,
    );
  }

  return { assessedTaxRate, collectionEfficiency };
};

/**
 * Create a Phase-8 handler with optional telemetry collection.
 *
 * Args:
 * - getFixtureIntents: optional function to provide test fixture intents for clearing
 *   (in production, intents come from Phase-2/3 planning)
 * - getFixtureMarketIds: optional function to provide market IDs for telemetry
 *   (maps region to market; in production, derived from world state markets)
 * - collectTelemetry: whether to populate telemetry (default true)
 * - taxPolicy: the immutable read-only consumption-tax provider clearing consumes.
 *   Required whenever getFixtureIntents is supplied, because that is when clearing runs.
 *
 * Returns a PhaseHandler that can be injected into the orchestrator.
 *
 * M3 note: This establishes the integration boundary. Production intents and
 * multi-market clearing will be wired in later milestones.
 *
 * There is deliberately no fallback rate or collection efficiency. Handoff/04 section 2
 * requires M3 fixtures to *inject* explicit finite values and states that those values are
 * scenario inputs, not canonical defaults; a fallback here would be exactly such a default,
 * and until 2026-09-15 the pinned pair (10% / 100%) silently overrode whatever a scenario
 * meant to say. A fixture that clears without a policy is a defect, so it raises.
 */
export const createPhase8Handler = (options?: {
  getFixtureIntents?: (world: WorldState, context: TickContext) => MarketIntent[];
  getFixtureMarketIds?: (world: WorldState) => Map<string, MarketId>;
  collectTelemetry?: boolean;
  taxPolicy?: TaxPolicyProvider;
}): PhaseHandler => {
  const collectTelemetry = options?.collectTelemetry !== false;
  const getFixtureIntents = options?.getFixtureIntents;
  const getFixtureMarketIds = options?.getFixtureMarketIds;
  const taxPolicy = options?.taxPolicy;

  if (getFixtureIntents !== undefined && taxPolicy === undefined) {
    throw new Error(
      "createPhase8Handler: getFixtureIntents requires an explicit taxPolicy. M3 local-market " +
        "fixtures must inject an immutable tax-policy provider with explicit finite rate and " +
        "collectionEfficiency values (Handoff/04 section 2, REQ-MARKET-004).",
    );
  }

  return (
    world: WorldState,
    context: TickContext,
    pendingTransitions: PendingTransitions,
  ): TickContext => {
    // Only execute during Phase-8
    if (context.phase !== 8) {
      return context;
    }

    // M3 Phase-8: Clearing always executes when fixture intents are provided;
    // collectTelemetry only controls whether telemetry is additionally emitted,
    // so enabling/disabling telemetry cannot change which allocations are produced.
    // Production clearing uses actual Phase-2/3 intents in later milestones

    if (!getFixtureIntents || !taxPolicy) {
      return context;
    }

    const intents = getFixtureIntents(world, context);
    const fixtureMarketIds = getFixtureMarketIds?.(world);
    const quantityEpsilon = world.simulationConfig.numeric.quantityEpsilon ?? 1e-9;

    // Group intents by canonical live Region/LocalMarket/good/pass identity. A fixture may
    // name the intended live market explicitly, but it may not invent one: Handoff/04
    // binds local clearing to the LocalMarket owned by the intent Region.
    const intentsByMarketGoodPass = new Map<string, {
      buyers: MarketIntent[];
      sellers: MarketIntent[];
      marketId: MarketId;
      regionId: string;
      goodId: string;
    }>();

    for (const intent of intents) {
      const region = world.regions.get(intent.regionId as RegionId);
      if (region === undefined) {
        throw new Error(`Phase-8 intent ${intent.id} references missing Region ${intent.regionId}`);
      }

      const fixtureMarketId = fixtureMarketIds?.get(intent.regionId);
      let marketId: MarketId;
      if (fixtureMarketId !== undefined) {
        const fixtureMarket = world.markets.get(fixtureMarketId);
        if (fixtureMarket === undefined) {
          throw new Error(
            `Phase-8 fixture maps Region ${intent.regionId} to missing LocalMarket ${fixtureMarketId}`,
          );
        }
        if (fixtureMarket.seed.regionKey !== region.seed.key) {
          throw new Error(
            `Phase-8 LocalMarket ${fixtureMarketId} does not belong to Region ${intent.regionId}`,
          );
        }
        marketId = fixtureMarketId;
      } else {
        const matchingMarkets = stableOrderBy(
          Array.from(world.markets.values()).filter(
            (market) => market.seed.regionKey === region.seed.key,
          ),
          (market) => market.marketId,
        );
        if (matchingMarkets.length !== 1) {
          throw new Error(
            `Phase-8 Region ${intent.regionId} must resolve to exactly one live LocalMarket; found ${matchingMarkets.length}`,
          );
        }
        marketId = matchingMarkets[0]!.marketId;
      }

      const key = `${intent.regionId}|${marketId}|${intent.goodId}|MAIN`;

      if (!intentsByMarketGoodPass.has(key)) {
        intentsByMarketGoodPass.set(key, {
          buyers: [],
          sellers: [],
          marketId,
          regionId: intent.regionId,
          goodId: intent.goodId,
        });
      }

      const group = intentsByMarketGoodPass.get(key)!;
      if (intent.side === "BUY") {
        group.buyers.push(intent);
      } else {
        group.sellers.push(intent);
      }
    }

    // Process each market/good/pass combination through production clearing
    const newTelemetry: typeof context.marketTelemetry = [];
    const newAllocations: typeof context.marketAllocations = [];
    const newAggregates = new Map(context.marketClearingAggregates);
    const allocationIdCounter = { value: 0 };

    for (const [, group] of stableOrderBy(intentsByMarketGoodPass.entries(), ([key]) => key)) {
      if (group.buyers.length === 0 || group.sellers.length === 0) {
        continue;
      }

      // Use the price Phase 6 produced this tick when present (Handoff/04 section 9:
      // "Phase 7 trade and Phase 8 clearing use the resulting Phase-6 price"). Direct
      // Phase-8 fixtures may use the live carried LocalMarket price, but there is no
      // numeric fallback: missing canonical price evidence is a malformed fixture/state.
      const market = world.markets.get(group.marketId);
      if (market === undefined) {
        throw new Error(`Phase-8 LocalMarket ${group.marketId} disappeared before clearing`);
      }
      const phase6Price = context.marketPrices.get(
        marketPriceKey(group.marketId, group.goodId as GoodId),
      );
      const carriedPrice = market.priceByGood.get(group.goodId as GoodId);
      const marketPrice = phase6Price ?? carriedPrice;
      if (marketPrice === undefined || !Number.isFinite(marketPrice) || marketPrice <= 0) {
        throw new Error(
          `Phase-8 requires a finite positive canonical price for ${group.marketId}/${group.goodId}`,
        );
      }

      // Settlement facts belong to the region, not to this handler. An allocation is only
      // settleable onto authoritative stock if it names the currency the buyer and seller
      // actually hold and a treasury the collected tax can land in, so both are read from
      // the canonical RegionState rather than assumed (Issue #427 acceptance criterion 2).
      //
      // An uncontrolled Region collects zero State consumption tax (HANDOFF-REPAIR-006):
      // with no controller there is no treasury to credit, and charging the buyer anyway
      // would destroy money inside a transfer, which `executeAllocation` refuses outright.
      // The rate therefore follows the destination, and one policy read feeds both the
      // effective demand a buyer can afford and the gross price the allocation records.
      const region = world.regions.get(group.regionId as RegionId);
      if (region === undefined) {
        throw new Error(`Phase-8 Region ${group.regionId} disappeared before clearing`);
      }
      if (market.seed.regionKey !== region.seed.key) {
        throw new Error(
          `Phase-8 LocalMarket ${group.marketId} does not belong to Region ${group.regionId}`,
        );
      }
      const marketCurrencyId = region.settlementCurrencyId;
      if (!world.currencies.has(marketCurrencyId)) {
        throw new Error(
          `Phase-8 Region ${group.regionId} settlement currency ${marketCurrencyId} is missing from WorldState`,
        );
      }
      const destinationStateId = region.controllerStateId;
      const { assessedTaxRate, collectionEfficiency } = resolveTaxPolicy(
        taxPolicy,
        destinationStateId,
        group.goodId as GoodId,
      );

      // Handoff/04 section 2: buyerGrossUnitPrice = sellerNet + collectedTaxPerUnit, and
      // collectedTaxPerUnit = sellerNet x rate x collectionEfficiency. Only *collected* tax
      // is ever debited; assessed-but-uncollected tax stays with the buyer and is telemetry
      // only. Dropping the efficiency factor here would overcharge the buyer by exactly the
      // uncollected part and break MTFX-I2, which `preflightMarketSettlement` checks.
      const grossPriceFactor = 1 + assessedTaxRate * collectionEfficiency;

      // Create clearing input with production computations
      const clearingInput: LocalClearingInput = {
        marketId: group.marketId,
        regionId: group.regionId as RegionId,
        goodId: group.goodId as GoodId,
        pass: "MAIN",
        marketCurrencyId,
        buyerIntents: group.buyers,
        sellerIntents: group.sellers,
        computeEffectiveDemand: (intent, grossPrice) => {
          if (intent.side !== "BUY") return 0;
          // Effective demand: min of desired quantity and maxSpend / grossPrice
          const maxAffordable = (intent as any).maxSpend
            ? (intent as any).maxSpend / grossPrice
            : intent.desiredQuantity;
          return Math.min(intent.desiredQuantity, Math.max(0, maxAffordable));
        },
        computeSellableQuantity: (intent) => {
          if (intent.side !== "SELL") return 0;
          // For M3 fixtures, assume all desired quantity is available
          return intent.desiredQuantity;
        },
        computeGrossUnitPrice: (_intent, sellerNetPrice) => {
          // Apply collected consumption tax to get the household gross price
          return sellerNetPrice * grossPriceFactor;
        },
        getTaxationInfo: (_buyer, _regionId, _good) => {
          return {
            destinationStateId,
            assessedTaxRate,
            collectionEfficiency,
          };
        },
      };

      // Execute production clearing algorithm. This runs identically regardless
      // of collectTelemetry, so allocations never depend on the telemetry toggle.
      const allocations = computeLocalClearing(
        clearingInput,
        new Map(), // M3: no commitment ledger tracking yet
        marketPrice,
        quantityEpsilon,
        allocationIdCounter,
      );
      newAllocations.push(...allocations);

      // Realized MAIN-pass aggregates (effective demand, offered supply, cleared
      // quantity) are computed unconditionally -- never gated on collectTelemetry --
      // because the authoritative post-tick MarketExpectationState transition
      // (Handoff/04 section 9) must not depend on the non-authoritative telemetry
      // toggle (REQ-MARKET-005).
      const totalSellerOffered = group.sellers.reduce((sum, i) => sum + i.desiredQuantity, 0);
      const grossPrice = marketPrice * grossPriceFactor;
      let totalBuyerEffective = 0;
      for (const buyer of group.buyers) {
        const buyerMaxSpend = (buyer as any).maxSpend ?? (buyer.desiredQuantity * grossPrice);
        totalBuyerEffective += Math.min(buyer.desiredQuantity, buyerMaxSpend / grossPrice);
      }
      const totalCleared = allocations.reduce((sum, a) => sum + a.quantity, 0);

      newAggregates.set(marketPriceKey(group.marketId, group.goodId as GoodId), {
        effectiveDemandQuantity: totalBuyerEffective,
        offeredQuantity: totalSellerOffered,
        clearedQuantity: totalCleared,
      });

      if (!collectTelemetry) {
        continue;
      }

      // Build telemetry from production clearing results
      const builder = new LocalMarketTelemetryBuilder(
        group.marketId,
        group.regionId as RegionId,
        group.goodId as GoodId,
        "MAIN",
        quantityEpsilon,
      );

      const totalBuyerDesired = group.buyers.reduce((sum, i) => sum + i.desiredQuantity, 0);
      const totalTaxCollected = allocations.reduce((sum, a) => sum + a.consumptionTaxAmount, 0);

      builder.setClearingQuantities(
        totalBuyerDesired,
        totalBuyerEffective,
        totalSellerOffered,
        totalCleared,
      );

      builder.setPrices(marketPrice, grossPrice);
      builder.addConsumptionTax(totalTaxCollected);

      newTelemetry.push(builder.build());
    }

    return {
      ...context,
      marketTelemetry: [...context.marketTelemetry, ...newTelemetry],
      marketAllocations: [...context.marketAllocations, ...newAllocations],
      marketClearingAggregates: newAggregates,
    };
  };
};

/**
 * Default Phase-8 handler: no telemetry collection (M2 compatibility).
 */
export const defaultPhase8MainMarketClearingHandler: PhaseHandler =
  createPhase8Handler({ collectTelemetry: false });
