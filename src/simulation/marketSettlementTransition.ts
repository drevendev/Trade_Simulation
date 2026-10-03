/**
 * `MarketSettlement.executeAllocation(world, ctx, allocation)` — the explicit mutation
 * boundary for local market settlement (Issue #427, prerequisite of REQ-MARKET-005).
 *
 * Handoff/04 section 35 names this function as the place where mutation belongs:
 * "Pure planning/allocation functions should return plans/deltas. Mutation belongs in
 * explicit settlement/delivery functions." Section 11 says `MarketAllocation` is
 * ephemeral and that persistent truth after execution is actor stock + transaction ledger
 * + LocalMarket price/expectation state. `marketSettlement.ts` already produces the
 * transaction-ledger half; this module produces the actor-stock half, applying the six
 * steps of the section-10 atomic bundle to the live wallets and inventories that
 * `worldState.ts` now carries:
 *
 *   1) seller inventory[g] -= q;
 *   2) buyer inventory[g] += q;
 *   3) buyer wallet[marketCurrency] -= q * grossBuyerUnitPrice;
 *   4) seller wallet[marketCurrency] += q * sellerNetUnitPrice;
 *   5) destination State treasury += collected consumption tax, if any;
 *   6) ledger records MARKET_SALE and optional CONSUMPTION_TAX linked by bundleId.
 *
 * Step 6 stays with `executeMarketSettlement()`; this module owns steps 1-5 and the
 * section-10 rule that governs them: "No mutation is applied unless all debits and
 * inventory removals pass preflight validation."
 *
 * Endpoint resolution is strict. Section 5 requires the intent actor to own the relevant
 * wallet/inventory and requires `inventoryBucket` to resolve the exact physical endpoint;
 * section 11 adds that "a settlement path that writes to an unspecified generic
 * ProductionUnit inventory is invalid". So an actor/bucket pair with no canonical stock
 * endpoint is refused, never approximated: refusing is the behavior that keeps
 * one-stock/one-owner true, and silently inventing a container is the specific failure
 * both the researcher's 2026-09-11 note on this Issue and R235 warn against.
 */

import type { ClanId, CohortId, CurrencyId, GoodId, ProductionUnitId, StateId } from "../domain/id";
import type { ActorRef } from "../domain/genesisLedger";
import { actorRefKey } from "../domain/genesisLedger";
import type { MarketAllocation } from "./marketClearing";
import type { TickContext } from "./tickOrchestrator";
import { preflightMarketSettlement } from "./marketSettlement";
import type {
  LiveInventory,
  LiveWallet,
  WorldState,
} from "./worldState";

/** A resolved goods endpoint: which actor record, and which of its inventories. */
type GoodsEndpoint =
  | { readonly kind: "COHORT_HOUSEHOLD"; readonly cohortId: CohortId }
  | { readonly kind: "STATE_PUBLIC"; readonly stateId: StateId }
  | {
      readonly kind: "PRODUCTION_UNIT";
      readonly productionUnitId: ProductionUnitId;
      readonly bucket: "INPUT" | "OUTPUT" | "INVESTMENT";
    };

/** A resolved money endpoint. */
type WalletEndpoint =
  | { readonly kind: "COHORT"; readonly cohortId: CohortId }
  | { readonly kind: "CLAN"; readonly clanId: ClanId }
  | { readonly kind: "STATE"; readonly stateId: StateId }
  | { readonly kind: "PRODUCTION_UNIT"; readonly productionUnitId: ProductionUnitId };

/**
 * Thrown when settlement cannot proceed. Every throw happens before any `WorldState` is
 * rebuilt, so a refused allocation leaves the world byte-identical to its input.
 */
export class SettlementRefusedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SettlementRefusedError";
  }
}

function refuse(message: string): never {
  throw new SettlementRefusedError(message);
}

/**
 * Resolve which authoritative inventory an allocation side names.
 *
 * `GENERAL` is the bucket every actor other than a ProductionUnit uses (section 5: "Other
 * actors use GENERAL unless their canonical schema explicitly defines another bucket"), and
 * for a ProductionUnit it is exactly the unspecified generic inventory section 11 declares
 * invalid. A Clan is refused outright on either bucket: it owns a treasury and no physical
 * goods stock at all (Handoff/01 5.3/5.4/7), so there is nothing to debit or credit.
 */
function resolveGoodsEndpoint(
  actor: ActorRef,
  bucket: MarketAllocation["sellerInventoryBucket"],
  side: "seller" | "buyer",
): GoodsEndpoint {
  switch (actor.type) {
    case "COHORT":
      if (bucket !== "GENERAL") {
        refuse(
          `executeAllocation: ${side} cohort ${actor.cohortId} has one householdInventory and no ` +
            `"${bucket}" bucket. A Cohort holds a single authoritative household goods stock ` +
            `(Handoff/04 §11); only GENERAL resolves to it.`,
        );
      }
      return { kind: "COHORT_HOUSEHOLD", cohortId: actor.cohortId };

    case "STATE":
      if (bucket !== "GENERAL") {
        refuse(
          `executeAllocation: ${side} state ${actor.stateId} has one publicInventory and no ` +
            `"${bucket}" bucket. Only GENERAL resolves to a State's public goods stock.`,
        );
      }
      return { kind: "STATE_PUBLIC", stateId: actor.stateId };

    case "PRODUCTION_UNIT":
      if (bucket === "GENERAL") {
        refuse(
          `executeAllocation: ${side} production unit ${actor.productionUnitId} was given bucket ` +
            `"GENERAL". A ProductionUnit owns three distinct authoritative inventories ` +
            `(INPUT/OUTPUT/INVESTMENT); Handoff/04 §11 declares a settlement path that writes to an ` +
            `unspecified generic ProductionUnit inventory invalid, so settlement refuses rather ` +
            `than guessing which one was meant.`,
        );
      }
      return { kind: "PRODUCTION_UNIT", productionUnitId: actor.productionUnitId, bucket };

    case "CLAN":
      refuse(
        `executeAllocation: ${side} clan ${actor.clanId} owns no physical goods inventory. A Clan ` +
          `owns a treasury only and must not duplicate the household consumption inventory its ` +
          `cohorts hold (Handoff/01 §§5.3/5.4/7), so there is no canonical stock endpoint to ` +
          `debit or credit.`,
      );

    case "MONETARY_AUTHORITY":
      refuse(
        `executeAllocation: ${side} monetary authority ${actor.authorityId} is not a market actor. ` +
          `HANDOFF-REPAIR-016 scopes the MonetaryAuthority owner to genesis accounting and does ` +
          `not authorize it as a MarketIntent, MarketAllocation or EconomicTransaction actor.`,
      );
  }
}

/** Resolve which wallet an actor pays from or is paid into. Every actor but an authority has one. */
function resolveWalletEndpoint(actor: ActorRef, role: string): WalletEndpoint {
  switch (actor.type) {
    case "COHORT":
      return { kind: "COHORT", cohortId: actor.cohortId };
    case "CLAN":
      return { kind: "CLAN", clanId: actor.clanId };
    case "STATE":
      return { kind: "STATE", stateId: actor.stateId };
    case "PRODUCTION_UNIT":
      return { kind: "PRODUCTION_UNIT", productionUnitId: actor.productionUnitId };
    case "MONETARY_AUTHORITY":
      refuse(
        `executeAllocation: ${role} monetary authority ${actor.authorityId} holds no live market ` +
          `wallet. Authority cash is genesis accounting only (HANDOFF-REPAIR-016).`,
      );
  }
}

function readGoods(world: WorldState, endpoint: GoodsEndpoint): LiveInventory {
  switch (endpoint.kind) {
    case "COHORT_HOUSEHOLD":
      return requireCohort(world, endpoint.cohortId).householdInventory;
    case "STATE_PUBLIC":
      return requireState(world, endpoint.stateId).publicInventory;
    case "PRODUCTION_UNIT": {
      const unit = requireProductionUnit(world, endpoint.productionUnitId);
      if (endpoint.bucket === "INPUT") return unit.inputInventory;
      if (endpoint.bucket === "OUTPUT") return unit.outputInventory;
      return unit.investmentInventory;
    }
  }
}

/**
 * Read the canonical live goods inventory named by a market actor + bucket.
 *
 * Phase handlers use this seam when they need pre-clearing stock authority. It deliberately
 * reuses settlement's endpoint resolution so planning/clearing cannot grow a second convention
 * for where Cohort, State, or ProductionUnit goods physically live.
 */
export function readMarketActorInventory(
  world: WorldState,
  actor: ActorRef,
  bucket: MarketAllocation["sellerInventoryBucket"],
  role: "seller" | "buyer" = "seller",
): LiveInventory {
  return readGoods(world, resolveGoodsEndpoint(actor, bucket, role));
}

function readWallet(world: WorldState, endpoint: WalletEndpoint): LiveWallet {
  switch (endpoint.kind) {
    case "COHORT":
      return requireCohort(world, endpoint.cohortId).wallet;
    case "CLAN":
      return requireClan(world, endpoint.clanId).treasury;
    case "STATE":
      return requireState(world, endpoint.stateId).treasury;
    case "PRODUCTION_UNIT":
      return requireProductionUnit(world, endpoint.productionUnitId).wallet;
  }
}

function requireCohort(world: WorldState, cohortId: CohortId) {
  const cohort = world.cohorts.get(cohortId);
  if (!cohort) refuse(`executeAllocation: no CohortState for ${actorRefKey({ type: "COHORT", cohortId })}`);
  return cohort;
}

function requireClan(world: WorldState, clanId: ClanId) {
  const clan = world.clans.get(clanId);
  if (!clan) refuse(`executeAllocation: no ClanState for ${actorRefKey({ type: "CLAN", clanId })}`);
  return clan;
}

function requireState(world: WorldState, stateId: StateId) {
  const state = world.states.get(stateId);
  if (!state) refuse(`executeAllocation: no StateState for ${actorRefKey({ type: "STATE", stateId })}`);
  return state;
}

function requireProductionUnit(world: WorldState, productionUnitId: ProductionUnitId) {
  const unit = world.productionUnits.get(productionUnitId);
  if (!unit) {
    refuse(
      `executeAllocation: no ProductionUnitState for ` +
        `${actorRefKey({ type: "PRODUCTION_UNIT", productionUnitId })}`,
    );
  }
  return unit;
}

/** A pending signed change to one live stock, applied only after every check has passed. */
interface GoodsDelta {
  readonly endpoint: GoodsEndpoint;
  readonly goodId: GoodId;
  readonly delta: number;
}

interface MoneyDelta {
  readonly endpoint: WalletEndpoint;
  readonly currencyId: CurrencyId;
  readonly delta: number;
}

function applyGoodsDelta(world: WorldState, delta: GoodsDelta): WorldState {
  const endpoint = delta.endpoint;
  switch (endpoint.kind) {
    case "COHORT_HOUSEHOLD": {
      const cohort = requireCohort(world, endpoint.cohortId);
      const cohorts = new Map(world.cohorts);
      cohorts.set(endpoint.cohortId, {
        ...cohort,
        householdInventory: creditMap(cohort.householdInventory, delta.goodId, delta.delta),
      });
      return { ...world, cohorts };
    }
    case "STATE_PUBLIC": {
      const state = requireState(world, endpoint.stateId);
      const states = new Map(world.states);
      states.set(endpoint.stateId, {
        ...state,
        publicInventory: creditMap(state.publicInventory, delta.goodId, delta.delta),
      });
      return { ...world, states };
    }
    case "PRODUCTION_UNIT": {
      const unit = requireProductionUnit(world, endpoint.productionUnitId);
      const productionUnits = new Map(world.productionUnits);
      const field =
        endpoint.bucket === "INPUT"
          ? "inputInventory"
          : endpoint.bucket === "OUTPUT"
            ? "outputInventory"
            : "investmentInventory";
      productionUnits.set(endpoint.productionUnitId, {
        ...unit,
        [field]: creditMap(unit[field], delta.goodId, delta.delta),
      });
      return { ...world, productionUnits };
    }
  }
}

function applyMoneyDelta(world: WorldState, delta: MoneyDelta): WorldState {
  const endpoint = delta.endpoint;
  switch (endpoint.kind) {
    case "COHORT": {
      const cohort = requireCohort(world, endpoint.cohortId);
      const cohorts = new Map(world.cohorts);
      cohorts.set(endpoint.cohortId, {
        ...cohort,
        wallet: creditMap(cohort.wallet, delta.currencyId, delta.delta),
      });
      return { ...world, cohorts };
    }
    case "CLAN": {
      const clan = requireClan(world, endpoint.clanId);
      const clans = new Map(world.clans);
      clans.set(endpoint.clanId, {
        ...clan,
        treasury: creditMap(clan.treasury, delta.currencyId, delta.delta),
      });
      return { ...world, clans };
    }
    case "STATE": {
      const state = requireState(world, endpoint.stateId);
      const states = new Map(world.states);
      states.set(endpoint.stateId, {
        ...state,
        treasury: creditMap(state.treasury, delta.currencyId, delta.delta),
      });
      return { ...world, states };
    }
    case "PRODUCTION_UNIT": {
      const unit = requireProductionUnit(world, endpoint.productionUnitId);
      const productionUnits = new Map(world.productionUnits);
      productionUnits.set(endpoint.productionUnitId, {
        ...unit,
        wallet: creditMap(unit.wallet, delta.currencyId, delta.delta),
      });
      return { ...world, productionUnits };
    }
  }
}

function creditMap<K extends string>(current: ReadonlyMap<K, number>, key: K, delta: number): ReadonlyMap<K, number> {
  const next = new Map(current);
  next.set(key, (current.get(key) ?? 0) + delta);
  return next;
}

/**
 * Two deltas address the same live stock when their endpoint and key agree. Used to make
 * the preflight balance checks see the net effect when a buyer and a seller happen to be
 * the same actor, rather than checking each leg against a stale opening balance.
 */
function goodsDeltaKey(delta: GoodsDelta): string {
  const endpoint = delta.endpoint;
  const slot =
    endpoint.kind === "COHORT_HOUSEHOLD"
      ? `${actorRefKey({ type: "COHORT", cohortId: endpoint.cohortId })}:HOUSEHOLD`
      : endpoint.kind === "STATE_PUBLIC"
        ? `${actorRefKey({ type: "STATE", stateId: endpoint.stateId })}:PUBLIC`
        : `${actorRefKey({ type: "PRODUCTION_UNIT", productionUnitId: endpoint.productionUnitId })}:${endpoint.bucket}`;
  return `${slot}:${delta.goodId}`;
}

function moneyDeltaKey(delta: MoneyDelta): string {
  const endpoint = delta.endpoint;
  const owner =
    endpoint.kind === "COHORT"
      ? actorRefKey({ type: "COHORT", cohortId: endpoint.cohortId })
      : endpoint.kind === "CLAN"
        ? actorRefKey({ type: "CLAN", clanId: endpoint.clanId })
        : endpoint.kind === "STATE"
          ? actorRefKey({ type: "STATE", stateId: endpoint.stateId })
          : actorRefKey({ type: "PRODUCTION_UNIT", productionUnitId: endpoint.productionUnitId });
  return `${owner}:${delta.currencyId}`;
}

/** Public money-only delta seam shared by explicit settlement transitions. */
export interface ActorMoneyDelta {
  readonly actor: ActorRef;
  readonly currencyId: CurrencyId;
  readonly delta: number;
}

/** Read the one canonical live wallet owned by an actor. */
export function readActorWallet(world: WorldState, actor: ActorRef): LiveWallet {
  return readWallet(world, resolveWalletEndpoint(actor, "actor wallet read"));
}

/**
 * Apply a set of actor-money deltas atomically after one shared no-overdraft preflight.
 * This is deliberately the same endpoint/mutation path used by market settlement, so
 * later settlement domains cannot grow a second convention for where actor cash lives.
 */
export function applyActorMoneyDeltas(
  world: WorldState,
  deltas: readonly ActorMoneyDelta[],
  operation = "actor money transition",
): WorldState {
  const resolved: MoneyDelta[] = deltas.map((delta) => {
    if (!Number.isFinite(delta.delta)) {
      refuse(`${operation}: money delta for ${actorRefKey(delta.actor)} must be finite, got ${String(delta.delta)}`);
    }
    return {
      endpoint: resolveWalletEndpoint(delta.actor, operation),
      currencyId: delta.currencyId,
      delta: delta.delta,
    };
  });

  assertNoStockGoesNegative(world, [], resolved);
  let next = world;
  for (const delta of resolved) next = applyMoneyDelta(next, delta);
  return next;
}

/**
 * Apply one realized `MarketAllocation` to authoritative actor stock, returning the
 * resulting `WorldState`.
 *
 * The world is returned rather than written through, matching `applyMarketStateTransition`
 * and keeping `WorldState` immutable for the duration of one `executeTick()` call. The
 * caller decides when the settled world becomes the next authoritative one; see
 * docs/adr/0007-live-actor-stock-as-world-transition.md.
 *
 * Every check runs before the first `WorldState` is rebuilt, so a refused allocation
 * throws `SettlementRefusedError` with the input world untouched — the section-10 rule
 * "No mutation is applied unless all debits and inventory removals pass preflight
 * validation", enforced structurally rather than by unwinding.
 *
 * @param context the tick context; `tick`/`phase` are used for preflight diagnostics.
 */
export function executeAllocation(
  world: WorldState,
  context: TickContext,
  allocation: MarketAllocation,
): WorldState {
  const preflightError = preflightMarketSettlement(allocation, context.tick, context.phase);
  if (preflightError) {
    refuse(`executeAllocation: preflight failed: ${preflightError}`);
  }

  // Collected consumption tax must have a treasury to land in. Without a destination State
  // the money would be debited from the buyer and credited to nobody, destroying money
  // inside a transfer. An uncontrolled Region collects zero State consumption tax
  // (HANDOFF-REPAIR-006), so a positive amount with no destination is a defect, not a case
  // to absorb.
  if (allocation.consumptionTaxAmount > 0 && allocation.destinationStateId === null) {
    refuse(
      `executeAllocation: collected consumption tax ${allocation.consumptionTaxAmount} has no ` +
        `destinationStateId. Tax collected from the buyer must be credited to a State treasury; ` +
        `an uncontrolled Region collects zero State consumption tax (HANDOFF-REPAIR-006).`,
    );
  }

  const sellerGoods = resolveGoodsEndpoint(allocation.seller, allocation.sellerInventoryBucket, "seller");
  const buyerGoods = resolveGoodsEndpoint(allocation.buyer, allocation.buyerInventoryBucket, "buyer");
  const sellerWallet = resolveWalletEndpoint(allocation.seller, "seller");
  const buyerWallet = resolveWalletEndpoint(allocation.buyer, "buyer");

  const sellerNetReceipt = allocation.quantity * allocation.sellerNetUnitPrice;
  const buyerGrossDebit = allocation.quantity * allocation.buyerGrossUnitPrice;

  const goodsDeltas: GoodsDelta[] = [
    { endpoint: sellerGoods, goodId: allocation.goodId, delta: -allocation.quantity },
    { endpoint: buyerGoods, goodId: allocation.goodId, delta: allocation.quantity },
  ];

  const moneyDeltas: MoneyDelta[] = [
    { endpoint: buyerWallet, currencyId: allocation.marketCurrencyId, delta: -buyerGrossDebit },
    { endpoint: sellerWallet, currencyId: allocation.marketCurrencyId, delta: sellerNetReceipt },
  ];

  if (allocation.consumptionTaxAmount > 0 && allocation.destinationStateId !== null) {
    moneyDeltas.push({
      endpoint: { kind: "STATE", stateId: allocation.destinationStateId },
      currencyId: allocation.marketCurrencyId,
      delta: allocation.consumptionTaxAmount,
    });
  }

  assertNoStockGoesNegative(world, goodsDeltas, moneyDeltas);

  let next = world;
  for (const delta of goodsDeltas) {
    next = applyGoodsDelta(next, delta);
  }
  for (const delta of moneyDeltas) {
    next = applyMoneyDelta(next, delta);
  }
  return next;
}

/**
 * Apply every realized MAIN-pass allocation Phase-8 produced this tick to authoritative
 * actor stock, returning the settled `WorldState` (Issue #427 acceptance criterion 2).
 *
 * This is the wiring half of the criterion, and it sits where `applyMarketStateTransition`
 * already sits rather than inside `createPhase8Handler`. The reason is structural, not
 * stylistic: a `PhaseHandler` is `(world, context, pendingTransitions) => TickContext`, and
 * `executeTick()` holds one `WorldState` immutable for the whole 16-phase loop (REQ-CORE-004),
 * so a phase handler has no way to hand a mutated world back. Phase-8 remains the only
 * producer of these allocations and the only thing that decides which of them are realized;
 * this function is the explicit settlement boundary that carries them onto stock, exactly as
 * section 35 asks ("Pure planning/allocation functions should return plans/deltas. Mutation
 * belongs in explicit settlement/delivery functions"). See
 * docs/adr/0007-live-actor-stock-as-world-transition.md.
 *
 * Ordering is Phase-8's own. `computeLocalClearing` emits allocations from seller and buyer
 * lists already sorted by `actorKey|intentId` — the section-36 stable order — so iterating
 * `context.marketAllocations` in place preserves it. Re-sorting here would invent a second
 * ordering rule that could silently disagree with the one clearing used.
 *
 * Settlement is all-or-nothing across the tick: `executeAllocation` refuses before it
 * rebuilds anything, and each refusal propagates, so a `SettlementRefusedError` leaves the
 * caller holding the unsettled world it passed in rather than a half-applied one.
 */
export function applyMarketSettlementTransition(world: WorldState, context: TickContext): WorldState {
  let settled = world;
  for (const allocation of context.marketAllocations) {
    if (allocation.pass !== "MAIN") continue;
    settled = executeAllocation(settled, context, allocation);
  }
  return settled;
}

/**
 * Preflight the atomic transition: no live wallet or inventory may end below zero.
 *
 * Project each delta in the exact order the commit loops below will apply it. Do not regroup
 * the deltas into one arithmetic sum: IEEE-754 addition is not associative, so a separately
 * netted value can disagree with the actual sequential commit at the zero boundary. Also do
 * not reject an intermediate negative projection: one atomic bundle may debit and credit the
 * same stock before its final value is known. The invariant is the final canonical stock after
 * the complete atomic transition, and any final value < 0 is an overdraft even when its
 * magnitude is smaller than a configured domain epsilon.
 */
function assertNoStockGoesNegative(
  world: WorldState,
  goodsDeltas: readonly GoodsDelta[],
  moneyDeltas: readonly MoneyDelta[],
): void {
  const projectedGoods = new Map<string, { delta: GoodsDelta; opening: number; balance: number }>();
  for (const delta of goodsDeltas) {
    const key = goodsDeltaKey(delta);
    const existing = projectedGoods.get(key);
    const opening = existing?.opening ?? (readGoods(world, delta.endpoint).get(delta.goodId) ?? 0);
    const balance = (existing?.balance ?? opening) + delta.delta;
    projectedGoods.set(key, { delta, opening, balance });
  }

  for (const { delta, opening, balance } of projectedGoods.values()) {
    if (balance < 0) {
      refuse(
        `executeAllocation: ${goodsDeltaKey(delta)} holds ${opening} of good ` +
          `"${delta.goodId}" and cannot release the requested atomic net change; final balance ` +
          `would be ${balance}. Settlement never drives an inventory negative ` +
          `(Handoff/04 §10 preflight).`,
      );
    }
  }

  const projectedMoney = new Map<string, { delta: MoneyDelta; opening: number; balance: number }>();
  for (const delta of moneyDeltas) {
    const key = moneyDeltaKey(delta);
    const existing = projectedMoney.get(key);
    const opening = existing?.opening ?? (readWallet(world, delta.endpoint).get(delta.currencyId) ?? 0);
    const balance = (existing?.balance ?? opening) + delta.delta;
    projectedMoney.set(key, { delta, opening, balance });
  }

  for (const { delta, opening, balance } of projectedMoney.values()) {
    if (balance < 0) {
      refuse(
        `executeAllocation: ${moneyDeltaKey(delta)} holds ${opening} of currency ` +
          `"${delta.currencyId}" and cannot pay the requested atomic net change; final balance ` +
          `would be ${balance}. Settlement never drives a wallet negative ` +
          `(Handoff/04 §10 preflight).`,
      );
    }
  }
}
