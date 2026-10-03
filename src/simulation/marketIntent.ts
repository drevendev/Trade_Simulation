/**
 * Ephemeral MarketIntent contract and budget commitment ledger (REQ-MARKET-001).
 *
 * Implements the M3 local MarketIntent contract with explicit inventory endpoints
 * and deterministic planner budget commitments, enabling bounded local market
 * procurement for ProductionUnit and State actors.
 *
 * See sections 5 and 6 of docs/spec/mirror/06 - Handoff/04 — MARKETS_TRADE_FX_CONTRACTS.md
 */

import type {
  CurrencyId,
  GoodId,
  MarketId,
  ProductionUnitId,
  RegionId,
  StateId,
} from "../domain/id";
import { actorRefKey, type ActorRef } from "../domain/genesisLedger";
import { assertFiniteCanonicalNumber } from "../domain/numeric";

/** Opaque market intent ID (mi:...) */
export type MarketIntentId = string & { readonly __brand: "MarketIntentId" };

export function createMarketIntentId(value: string): MarketIntentId {
  if (!value.startsWith("mi:")) {
    throw new Error(`MarketIntentId must start with "mi:", got ${value}`);
  }
  return value as MarketIntentId;
}

/**
 * Ephemeral intent to buy or sell goods at a local market.
 * Created by planners in Phase 2, executed in Phase 4 (pre-production) or Phase 8 (main).
 * Does not persist after clearing; replaced each tick.
 */
export interface MarketIntent {
  readonly id: MarketIntentId;
  readonly actor: ActorRef;
  readonly regionId: RegionId;
  readonly goodId: GoodId;
  readonly side: "BUY" | "SELL";
  readonly purpose: "CONSUMPTION" | "INPUT" | "INVESTMENT" | "PUBLIC_PROCUREMENT" | "INVENTORY_REBALANCE";
  readonly desiredQuantity: number;
  readonly maxSpend?: number; // BUY only, in region settlement currency
  readonly minimumReserveQuantity?: number; // SELL only, default 0
  readonly priorityClass?: string;
  readonly sourcePlanId: string;
  readonly inventoryBucket?: "GENERAL" | "INPUT" | "OUTPUT" | "INVESTMENT";
}

/**
 * Validates a MarketIntent against all specification constraints.
 * Throws descriptive error if any constraint is violated.
 *
 * Constraints checked:
 * - desiredQuantity >= 0 and finite
 * - BUY requires maxSpend >= 0 and finite
 * - SELL requires minimumReserveQuantity >= 0 and finite
 * - unsupported actor kinds and Clan goods sellers are rejected here
 * - live actor existence, ownership and balances are verified at settlement
 * - inventoryBucket resolves correctly for ProductionUnit vs other actors
 * - all numeric fields are finite and in valid range
 */
export function validateMarketIntent(intent: MarketIntent): void {
  if (!intent.id || !intent.id.startsWith("mi:")) {
    throw new Error("MarketIntent must have valid id starting with 'mi:'");
  }

  if (!intent.actor) {
    throw new Error("MarketIntent must have actor");
  }

  if (!intent.regionId) {
    throw new Error("MarketIntent must have regionId");
  }

  if (!intent.goodId) {
    throw new Error("MarketIntent must have goodId");
  }

  if (intent.side !== "BUY" && intent.side !== "SELL") {
    throw new Error(`MarketIntent side must be BUY or SELL, got ${intent.side}`);
  }

  const validPurposes = ["CONSUMPTION", "INPUT", "INVESTMENT", "PUBLIC_PROCUREMENT", "INVENTORY_REBALANCE"];
  if (!validPurposes.includes(intent.purpose)) {
    throw new Error(`MarketIntent purpose must be one of ${validPurposes.join(", ")}, got ${intent.purpose}`);
  }

  // Validate desiredQuantity
  if (typeof intent.desiredQuantity !== "number") {
    throw new Error("MarketIntent desiredQuantity must be a number");
  }
  if (intent.desiredQuantity < 0) {
    throw new Error(`MarketIntent desiredQuantity must be >= 0, got ${intent.desiredQuantity}`);
  }
  assertFiniteCanonicalNumber(intent.desiredQuantity, "MarketIntent desiredQuantity");

  // BUY-specific validation
  if (intent.side === "BUY") {
    if (typeof intent.maxSpend !== "number") {
      throw new Error("BUY intent must have maxSpend as a number");
    }
    if (intent.maxSpend < 0) {
      throw new Error(`BUY intent maxSpend must be >= 0, got ${intent.maxSpend}`);
    }
    assertFiniteCanonicalNumber(intent.maxSpend, "BUY intent maxSpend");
  } else if (typeof intent.maxSpend !== "undefined") {
    throw new Error("SELL intent must not have maxSpend");
  }

  // SELL-specific validation
  if (intent.side === "SELL") {
    const minimumReserveQuantity = intent.minimumReserveQuantity ?? 0;
    if (typeof minimumReserveQuantity !== "number") {
      throw new Error("SELL intent minimumReserveQuantity must be a number");
    }
    if (minimumReserveQuantity < 0) {
      throw new Error(`SELL intent minimumReserveQuantity must be >= 0, got ${minimumReserveQuantity}`);
    }
    assertFiniteCanonicalNumber(minimumReserveQuantity, "SELL intent minimumReserveQuantity");
  }

  // ActorRef also serves genesis accounting; not every owner is a market actor.
  if (intent.actor.type === "MONETARY_AUTHORITY") {
    throw new Error("MonetaryAuthority is not a MarketIntent actor (HANDOFF-REPAIR-016)");
  }
  if (intent.actor.type === "CLAN") {
    throw new Error("Clan MarketIntent has no physical goods inventory");
  }

  // Inventory bucket validation
  if (intent.inventoryBucket) {
    const validBuckets = ["GENERAL", "INPUT", "OUTPUT", "INVESTMENT"];
    if (!validBuckets.includes(intent.inventoryBucket)) {
      throw new Error(`inventoryBucket must be one of ${validBuckets.join(", ")}, got ${intent.inventoryBucket}`);
    }
  }

  // State and Cohort each own one generic goods stock, not a unit's physical buckets.
  if (
    (intent.actor.type === "STATE" || intent.actor.type === "COHORT") &&
    intent.inventoryBucket !== undefined && intent.inventoryBucket !== "GENERAL"
  ) {
    throw new Error(`${intent.actor.type} MarketIntent must use GENERAL inventory bucket`);
  }

  // ProductionUnit inventory bucket rules
  if (intent.actor.type === "PRODUCTION_UNIT") {
    if (intent.side === "BUY" && intent.purpose === "INPUT") {
      if (intent.inventoryBucket !== "INPUT") {
        throw new Error(
          `ProductionUnit BUY/INPUT must use INPUT bucket, got ${intent.inventoryBucket}`,
        );
      }
    } else if (intent.side === "BUY" && intent.purpose === "INVESTMENT") {
      if (intent.inventoryBucket !== "INVESTMENT") {
        throw new Error(
          `ProductionUnit BUY/INVESTMENT must use INVESTMENT bucket, got ${intent.inventoryBucket}`,
        );
      }
    } else {
      if (
        intent.inventoryBucket !== "INPUT" &&
        intent.inventoryBucket !== "OUTPUT" &&
        intent.inventoryBucket !== "INVESTMENT"
      ) {
        throw new Error(
          `ProductionUnit ${intent.side} must use INPUT, OUTPUT, or INVESTMENT bucket, got ${intent.inventoryBucket}`,
        );
      }
    }
  }
}

/**
 * Ephemeral budget commitment ledger keyed by actor + currency + planning envelope.
 * Tracks sum of maxSpend commitments to prevent overcommitment within an envelope.
 * Resets each tick; accounts for BUY commitments only.
 */
export interface BudgetCommitmentLedger {
  readonly commitmentsByEnvelope: ReadonlyMap<string, number>;
}

/** Envelope key format: `${actorRef}|${currencyId}|${envelope}` */
function buildEnvelopeKey(actor: ActorRef, currencyId: CurrencyId, envelope: string): string {
  return `${actorRefKey(actor)}|${currencyId}|${envelope}`;
}

/**
 * Creates an empty budget commitment ledger.
 */
export function createEmptyBudgetCommitmentLedger(): BudgetCommitmentLedger {
  return {
    commitmentsByEnvelope: new Map(),
  };
}

/**
 * Records a budget commitment for a BUY intent within a planning envelope.
 * Returns error string if commitment would exceed envelope total, null if OK.
 */
export function commitBudget(
  ledger: BudgetCommitmentLedger,
  actor: ActorRef,
  currencyId: CurrencyId,
  envelope: string,
  maxSpend: number,
  envelopeLimit: number,
): BudgetCommitmentLedger | string {
  const envelopeKey = buildEnvelopeKey(actor, currencyId, envelope);
  const currentCommitment = ledger.commitmentsByEnvelope.get(envelopeKey) ?? 0;
  const newCommitment = currentCommitment + maxSpend;

  if (newCommitment > envelopeLimit) {
    return `Budget commitment for ${maxSpend} in envelope ${envelope} would exceed limit ${envelopeLimit} (currently ${currentCommitment} committed)`;
  }

  return {
    commitmentsByEnvelope: new Map(ledger.commitmentsByEnvelope).set(envelopeKey, newCommitment),
  };
}

/**
 * Releases a partial or full commitment when an intent is rejected or partially filled.
 * Only released if envelope is marked reusable (M3+ feature; default non-reusable).
 */
export function releaseCommitment(
  ledger: BudgetCommitmentLedger,
  actor: ActorRef,
  currencyId: CurrencyId,
  envelope: string,
  releasedAmount: number,
  isReusable: boolean = false,
): BudgetCommitmentLedger {
  if (!isReusable || releasedAmount === 0) {
    return ledger;
  }

  const envelopeKey = buildEnvelopeKey(actor, currencyId, envelope);
  const currentCommitment = ledger.commitmentsByEnvelope.get(envelopeKey) ?? 0;
  const newCommitment = Math.max(0, currentCommitment - releasedAmount);

  const updated = new Map(ledger.commitmentsByEnvelope);
  if (newCommitment === 0) {
    updated.delete(envelopeKey);
  } else {
    updated.set(envelopeKey, newCommitment);
  }

  return {
    commitmentsByEnvelope: updated,
  };
}

/**
 * Gets current total commitment for an envelope.
 */
export function getEnvelopeCommitment(
  ledger: BudgetCommitmentLedger,
  actor: ActorRef,
  currencyId: CurrencyId,
  envelope: string,
): number {
  const envelopeKey = buildEnvelopeKey(actor, currencyId, envelope);
  return ledger.commitmentsByEnvelope.get(envelopeKey) ?? 0;
}
