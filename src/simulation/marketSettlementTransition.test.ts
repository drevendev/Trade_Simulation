/**
 * Proves Issue #427 acceptance criteria 1, 3 and 5 against a real `WorldState`.
 *
 * Every fixture here settles through `executeAllocation()` onto the live wallets and
 * inventories of a world produced by `buildInitialWorld(baselineScenario, ...)` — not onto
 * a test-local `Map` standing in for state. That is the whole point of the Issue: the
 * MTFX-I1/I2 proofs that already exist in `acceptance-004-m3-golden-gate.test.ts` build
 * their own synthetic wallet/inventory maps because, before this change, `WorldState`
 * carried nothing for them to mutate.
 */

import { describe, it, expect } from "vitest";
import { buildInitialWorld, type WorldState } from "./worldState";
import { baselineDefinitionPack } from "../config/fixtures/baselineDefinitionPack";
import { baselineScenario } from "../config/fixtures/baselineScenario";
import type { SimulationConfig } from "../config/simulationConfig";
import { actorRefKey, type ActorRef } from "../domain/genesisLedger";
import { initializeTickContext } from "./tickOrchestrator";
import type { TickContext } from "./tickOrchestrator";
import { createMarketAllocationId, type MarketAllocation } from "./marketClearing";
import { createMarketIntentId } from "./marketIntent";
import {
  applyActorMoneyDeltas,
  executeAllocation,
  SettlementRefusedError,
} from "./marketSettlementTransition";
import type { CohortId, CurrencyId, GoodId, ProductionUnitId, StateId } from "../domain/id";

function createTestConfig(): SimulationConfig {
  return {
    configVersion: "1.0.0",
    numeric: {
      moneyEpsilon: 1e-9,
      quantityEpsilon: 1e-9,
      populationEpsilon: 1e-6,
      rateEpsilon: 1e-12,
      reconciliationRelativeTolerance: 1e-9,
      maxFiniteMagnitude: 1e15,
    },
    cadence: {
      productionLifecycleReviewEveryTicks: 3,
      investmentReviewEveryTicks: 3,
      clanDistributionEveryTicks: 3,
      fiscalPolicyReviewEveryTicks: 3,
      monetaryPolicyReviewEveryTicks: 1,
      expansionReviewEveryTicks: 3,
      stateFormationReviewEveryTicks: 6,
    },
    markets: {
      shortageSignalWeight: 0.5,
      inventorySignalWeight: 0.5,
      basePriceAdjustmentSpeed: 0.1,
      maxAbsoluteLogPriceMovePerTick: 0.1,
      targetInventoryCoverageTicks: 1.0,
      expectationAlpha: 0.1,
    },
    trade: {},
    production: {},
    labor: {},
    population: {},
    clans: {},
    fiscal: {},
    monetary: {},
    expansion: {},
    events: {},
    performance: {},
  };
}

const FOOD = "good:food" as GoodId;

function buildWorld(): WorldState {
  return buildInitialWorld(baselineScenario, baselineDefinitionPack, createTestConfig(), 42);
}

/**
 * First element of a genesis collection the baseline scenario is required to populate.
 * Throws rather than returning `undefined`, so an empty collection fails as the scenario
 * defect it is instead of as a confusing assertion further down.
 */
function first<T>(values: Iterable<T>, what: string): T {
  for (const value of values) return value;
  throw new Error(`baseline scenario carries no ${what}`);
}

/**
 * A canonical M3 counterparty triple drawn from the real baseline world: a food-producing
 * ProductionUnit selling from its OUTPUT inventory, a Cohort in the same region buying into
 * its household inventory, and that region's controlling State as the tax destination. All
 * three own the endowments the baseline scenario gives them, so none of the balances below
 * is invented by this test.
 */
function pickCounterparties(world: WorldState): {
  sellerUnitId: ProductionUnitId;
  buyerCohortId: CohortId;
  stateId: StateId;
  currencyId: CurrencyId;
} {
  for (const unit of world.productionUnits.values()) {
    if ((unit.outputInventory.get(FOOD) ?? 0) <= 0) continue;

    const regionKey = unit.seed.regionKey;
    const region = Array.from(world.regions.values()).find((r) => r.seed.key === regionKey);
    if (!region || region.controllerStateId === null) continue;

    const buyer = Array.from(world.cohorts.values()).find(
      (c) => c.seed.regionKey === regionKey && (c.wallet.get(region.settlementCurrencyId) ?? 0) > 0,
    );
    if (!buyer) continue;

    // The unit must hold the market currency it will be paid in, and the buyer must pay in
    // the same one: a cross-currency settlement is M5 trade/FX, explicitly out of scope here.
    if ((unit.wallet.get(region.settlementCurrencyId) ?? 0) <= 0) continue;

    return {
      sellerUnitId: unit.productionUnitId,
      buyerCohortId: buyer.cohortId,
      stateId: region.controllerStateId,
      currencyId: region.settlementCurrencyId,
    };
  }
  throw new Error("baseline scenario carries no ProductionUnit/Cohort food counterparty pair");
}

/**
 * Build one allocation whose money legs already satisfy the section-10 identity
 * `buyerGross = sellerNet + collectedTax`, so preflight passes and the test exercises the
 * stock mutation rather than re-testing `preflightMarketSettlement`.
 */
function buildAllocation(overrides: {
  seller: ActorRef;
  buyer: ActorRef;
  quantity: number;
  sellerNetUnitPrice: number;
  taxPerUnit?: number;
  currencyId: CurrencyId;
  destinationStateId: StateId | null;
  sellerInventoryBucket?: MarketAllocation["sellerInventoryBucket"];
  buyerInventoryBucket?: MarketAllocation["buyerInventoryBucket"];
  goodId?: GoodId;
}): MarketAllocation {
  const taxPerUnit = overrides.taxPerUnit ?? 0;
  return {
    id: createMarketAllocationId("ma:test-1"),
    marketId: "market:test" as MarketAllocation["marketId"],
    regionId: "region:test" as MarketAllocation["regionId"],
    goodId: overrides.goodId ?? FOOD,
    pass: "MAIN",
    sellerIntentId: createMarketIntentId("mi:seller-1"),
    buyerIntentId: createMarketIntentId("mi:buyer-1"),
    seller: overrides.seller,
    buyer: overrides.buyer,
    quantity: overrides.quantity,
    sellerNetUnitPrice: overrides.sellerNetUnitPrice,
    buyerGrossUnitPrice: overrides.sellerNetUnitPrice + taxPerUnit,
    marketCurrencyId: overrides.currencyId,
    consumptionTaxAmount: taxPerUnit * overrides.quantity,
    destinationStateId: overrides.destinationStateId,
    sellerInventoryBucket: overrides.sellerInventoryBucket ?? "OUTPUT",
    buyerInventoryBucket: overrides.buyerInventoryBucket ?? "GENERAL",
  };
}

function context(): TickContext {
  return { ...initializeTickContext(3, 42), phase: 8 };
}

describe("executeAllocation — live actor stock settlement (Issue #427)", () => {
  describe("criterion 5: opening and live stock share one owner mapping", () => {
    it("every cohort's live opening wallet/inventory equals its genesis records under actorRefKey", () => {
      const world = buildWorld();

      const openingMoney = new Map<string, number>();
      const openingGoods = new Map<string, number>();
      for (const record of world.worldGenesisLedger.records) {
        if (record.type === "MONEY_ENDOWMENT" && record.owner.type === "COHORT") {
          const key = `${actorRefKey(record.owner)}:${record.currencyId}`;
          openingMoney.set(key, (openingMoney.get(key) ?? 0) + record.amount);
        }
        if (record.type === "GOOD_ENDOWMENT" && record.owner.type === "COHORT") {
          const key = `${actorRefKey(record.owner)}:${record.goodId}`;
          openingGoods.set(key, (openingGoods.get(key) ?? 0) + record.amount);
        }
      }
      expect(openingMoney.size).toBeGreaterThan(0);
      expect(openingGoods.size).toBeGreaterThan(0);

      for (const cohort of world.cohorts.values()) {
        const ownerKey = actorRefKey({ type: "COHORT", cohortId: cohort.cohortId });
        for (const [currencyId, amount] of cohort.wallet) {
          expect(openingMoney.get(`${ownerKey}:${currencyId}`)).toBe(amount);
        }
        for (const [goodId, amount] of cohort.householdInventory) {
          expect(openingGoods.get(`${ownerKey}:${goodId}`)).toBe(amount);
        }
      }
    });

    it("a ProductionUnit's live INPUT/OUTPUT/INVESTMENT stocks are three distinct buckets", () => {
      const world = buildWorld();
      const unit = Array.from(world.productionUnits.values()).find(
        (u) => u.seed.recipeId === "recipe:tools-craft",
      );
      expect(unit).toBeDefined();

      // baselineScenario gives a tools-craft unit iron+wood INPUT, tools OUTPUT and tools
      // INVESTMENT. A single flattened inventory would show tools once, not twice.
      expect(unit!.inputInventory.get("good:iron" as GoodId)).toBe(50);
      expect(unit!.inputInventory.get("good:wood" as GoodId)).toBe(75);
      expect(unit!.outputInventory.get("good:tools" as GoodId)).toBe(150);
      expect(unit!.investmentInventory.get("good:tools" as GoodId)).toBe(50);
    });

    it("a Clan carries a live treasury and no goods inventory field at all", () => {
      const world = buildWorld();
      const clan = first(world.clans.values(), "Clan");

      expect(clan.treasury.size).toBeGreaterThan(0);
      expect(Object.keys(clan)).toEqual(expect.not.arrayContaining(["householdInventory", "inventory"]));
    });
  });

  describe("criterion 3: conservation against the real mutated WorldState", () => {
    it("conserves money: buyer gross debit == seller net receipt + collected tax", () => {
      const world = buildWorld();
      const { sellerUnitId, buyerCohortId, stateId, currencyId } = pickCounterparties(world);

      const quantity = 4;
      const sellerNetUnitPrice = 10;
      const taxPerUnit = 2.5;
      const allocation = buildAllocation({
        seller: { type: "PRODUCTION_UNIT", productionUnitId: sellerUnitId },
        buyer: { type: "COHORT", cohortId: buyerCohortId },
        quantity,
        sellerNetUnitPrice,
        taxPerUnit,
        currencyId,
        destinationStateId: stateId,
      });

      const beforeBuyer = world.cohorts.get(buyerCohortId)!.wallet.get(currencyId) ?? 0;
      const beforeSeller = world.productionUnits.get(sellerUnitId)!.wallet.get(currencyId) ?? 0;
      const beforeTreasury = world.states.get(stateId)!.treasury.get(currencyId) ?? 0;

      const next = executeAllocation(world, context(), allocation);

      const afterBuyer = next.cohorts.get(buyerCohortId)!.wallet.get(currencyId) ?? 0;
      const afterSeller = next.productionUnits.get(sellerUnitId)!.wallet.get(currencyId) ?? 0;
      const afterTreasury = next.states.get(stateId)!.treasury.get(currencyId) ?? 0;

      const buyerDebit = beforeBuyer - afterBuyer;
      const sellerReceipt = afterSeller - beforeSeller;
      const taxCollected = afterTreasury - beforeTreasury;

      expect(buyerDebit).toBeCloseTo(quantity * (sellerNetUnitPrice + taxPerUnit), 9);
      expect(sellerReceipt).toBeCloseTo(quantity * sellerNetUnitPrice, 9);
      expect(taxCollected).toBeCloseTo(quantity * taxPerUnit, 9);
      // MTFX-I2, now on authoritative state rather than a synthetic map.
      expect(buyerDebit).toBeCloseTo(sellerReceipt + taxCollected, 9);
      // No money is created or destroyed across the three touched wallets.
      expect(afterBuyer + afterSeller + afterTreasury).toBeCloseTo(
        beforeBuyer + beforeSeller + beforeTreasury,
        9,
      );
    });

    it("conserves goods: the seller's OUTPUT decrease equals the buyer's household increase", () => {
      const world = buildWorld();
      const { sellerUnitId, buyerCohortId, stateId, currencyId } = pickCounterparties(world);

      const quantity = 7;
      const allocation = buildAllocation({
        seller: { type: "PRODUCTION_UNIT", productionUnitId: sellerUnitId },
        buyer: { type: "COHORT", cohortId: buyerCohortId },
        quantity,
        sellerNetUnitPrice: 5,
        currencyId,
        destinationStateId: stateId,
      });

      const beforeSellerStock = world.productionUnits.get(sellerUnitId)!.outputInventory.get(FOOD) ?? 0;
      const beforeBuyerStock = world.cohorts.get(buyerCohortId)!.householdInventory.get(FOOD) ?? 0;

      const next = executeAllocation(world, context(), allocation);

      const afterSellerStock = next.productionUnits.get(sellerUnitId)!.outputInventory.get(FOOD) ?? 0;
      const afterBuyerStock = next.cohorts.get(buyerCohortId)!.householdInventory.get(FOOD) ?? 0;

      // MTFX-I1 on authoritative state.
      expect(beforeSellerStock - afterSellerStock).toBeCloseTo(quantity, 9);
      expect(afterBuyerStock - beforeBuyerStock).toBeCloseTo(quantity, 9);
      expect(afterSellerStock + afterBuyerStock).toBeCloseTo(beforeSellerStock + beforeBuyerStock, 9);

      // MTFX-I25: the goods left the OUTPUT bucket specifically. A settlement that debited a
      // flattened unit-wide inventory would leave these two untouched and still look conserved.
      expect(next.productionUnits.get(sellerUnitId)!.inputInventory).toEqual(
        world.productionUnits.get(sellerUnitId)!.inputInventory,
      );
      expect(next.productionUnits.get(sellerUnitId)!.investmentInventory).toEqual(
        world.productionUnits.get(sellerUnitId)!.investmentInventory,
      );
    });

    it("leaves the input WorldState untouched and returns the settled one", () => {
      const world = buildWorld();
      const { sellerUnitId, buyerCohortId, stateId, currencyId } = pickCounterparties(world);

      const beforeSellerStock = world.productionUnits.get(sellerUnitId)!.outputInventory.get(FOOD) ?? 0;
      const beforeBuyerWallet = world.cohorts.get(buyerCohortId)!.wallet.get(currencyId) ?? 0;

      const next = executeAllocation(
        world,
        context(),
        buildAllocation({
          seller: { type: "PRODUCTION_UNIT", productionUnitId: sellerUnitId },
          buyer: { type: "COHORT", cohortId: buyerCohortId },
          quantity: 3,
          sellerNetUnitPrice: 6,
          currencyId,
          destinationStateId: stateId,
        }),
      );

      expect(next).not.toBe(world);
      expect(world.productionUnits.get(sellerUnitId)!.outputInventory.get(FOOD)).toBe(beforeSellerStock);
      expect(world.cohorts.get(buyerCohortId)!.wallet.get(currencyId)).toBe(beforeBuyerWallet);
      expect(next.productionUnits.get(sellerUnitId)!.outputInventory.get(FOOD)).toBeCloseTo(
        beforeSellerStock - 3,
        9,
      );
    });
  });

  describe("criterion 2: refuses rather than inventing a stock endpoint", () => {
    /** Assert the call is refused and the world it was given is unchanged. */
    function expectRefusal(world: WorldState, allocation: MarketAllocation, matcher: RegExp): void {
      const snapshot = JSON.stringify(
        Array.from(world.productionUnits.values(), (u) => [
          u.productionUnitId,
          Array.from(u.outputInventory),
          Array.from(u.wallet),
        ]),
      );
      expect(() => executeAllocation(world, context(), allocation)).toThrow(SettlementRefusedError);
      expect(() => executeAllocation(world, context(), allocation)).toThrow(matcher);
      expect(
        JSON.stringify(
          Array.from(world.productionUnits.values(), (u) => [
            u.productionUnitId,
            Array.from(u.outputInventory),
            Array.from(u.wallet),
          ]),
        ),
      ).toBe(snapshot);
    }

    it("refuses a Clan goods endpoint: a Clan owns a treasury and no physical inventory", () => {
      const world = buildWorld();
      const { buyerCohortId, stateId, currencyId } = pickCounterparties(world);
      const clanId = first(world.clans.keys(), "Clan");

      expectRefusal(
        world,
        buildAllocation({
          seller: { type: "CLAN", clanId },
          buyer: { type: "COHORT", cohortId: buyerCohortId },
          quantity: 1,
          sellerNetUnitPrice: 1,
          currencyId,
          destinationStateId: stateId,
          sellerInventoryBucket: "GENERAL",
        }),
        /owns no physical goods inventory/,
      );
    });

    it("refuses a GENERAL bucket on a ProductionUnit rather than guessing which inventory", () => {
      const world = buildWorld();
      const { sellerUnitId, buyerCohortId, stateId, currencyId } = pickCounterparties(world);

      expectRefusal(
        world,
        buildAllocation({
          seller: { type: "PRODUCTION_UNIT", productionUnitId: sellerUnitId },
          buyer: { type: "COHORT", cohortId: buyerCohortId },
          quantity: 1,
          sellerNetUnitPrice: 1,
          currencyId,
          destinationStateId: stateId,
          sellerInventoryBucket: "GENERAL",
        }),
        /unspecified generic ProductionUnit inventory invalid/,
      );
    });

    it("refuses a ProductionUnit bucket on a Cohort, which holds one household inventory", () => {
      const world = buildWorld();
      const { sellerUnitId, buyerCohortId, stateId, currencyId } = pickCounterparties(world);

      expectRefusal(
        world,
        buildAllocation({
          seller: { type: "PRODUCTION_UNIT", productionUnitId: sellerUnitId },
          buyer: { type: "COHORT", cohortId: buyerCohortId },
          quantity: 1,
          sellerNetUnitPrice: 1,
          currencyId,
          destinationStateId: stateId,
          buyerInventoryBucket: "INPUT",
        }),
        /has one householdInventory/,
      );
    });

    it("refuses a MonetaryAuthority counterparty, which is a genesis-accounting owner only", () => {
      const world = buildWorld();
      const { buyerCohortId, stateId, currencyId } = pickCounterparties(world);
      const authorityId = first(world.monetaryAuthorities.keys(), "MonetaryAuthority");

      expectRefusal(
        world,
        buildAllocation({
          seller: { type: "MONETARY_AUTHORITY", authorityId },
          buyer: { type: "COHORT", cohortId: buyerCohortId },
          quantity: 1,
          sellerNetUnitPrice: 1,
          currencyId,
          destinationStateId: stateId,
          sellerInventoryBucket: "GENERAL",
        }),
        /is not a market actor/,
      );
    });

    it("refuses collected consumption tax that has no destination State treasury", () => {
      const world = buildWorld();
      const { sellerUnitId, buyerCohortId, currencyId } = pickCounterparties(world);

      expectRefusal(
        world,
        buildAllocation({
          seller: { type: "PRODUCTION_UNIT", productionUnitId: sellerUnitId },
          buyer: { type: "COHORT", cohortId: buyerCohortId },
          quantity: 2,
          sellerNetUnitPrice: 5,
          taxPerUnit: 1,
          currencyId,
          destinationStateId: null,
        }),
        /has no destinationStateId/,
      );
    });

    it("refuses a sale larger than the seller's live stock instead of driving it negative", () => {
      const world = buildWorld();
      const { sellerUnitId, buyerCohortId, stateId, currencyId } = pickCounterparties(world);
      const available = world.productionUnits.get(sellerUnitId)!.outputInventory.get(FOOD) ?? 0;

      expectRefusal(
        world,
        buildAllocation({
          seller: { type: "PRODUCTION_UNIT", productionUnitId: sellerUnitId },
          buyer: { type: "COHORT", cohortId: buyerCohortId },
          quantity: available + 1,
          sellerNetUnitPrice: 0,
          currencyId,
          destinationStateId: stateId,
        }),
        /cannot release/,
      );
    });

    it("refuses a purchase larger than the buyer's live wallet instead of overdrawing it", () => {
      const world = buildWorld();
      const { sellerUnitId, buyerCohortId, stateId, currencyId } = pickCounterparties(world);
      const wallet = world.cohorts.get(buyerCohortId)!.wallet.get(currencyId) ?? 0;

      expectRefusal(
        world,
        buildAllocation({
          seller: { type: "PRODUCTION_UNIT", productionUnitId: sellerUnitId },
          buyer: { type: "COHORT", cohortId: buyerCohortId },
          quantity: 1,
          sellerNetUnitPrice: wallet + 1,
          currencyId,
          destinationStateId: stateId,
        }),
        /cannot pay/,
      );
    });

    it("refuses a sub-epsilon seller overdraw instead of persisting a negative inventory", () => {
      const world = buildWorld();
      const { sellerUnitId, buyerCohortId, stateId, currencyId } = pickCounterparties(world);
      const unit = world.productionUnits.get(sellerUnitId)!;
      const outputInventory = new Map(unit.outputInventory);
      outputInventory.set(FOOD, 0);
      const productionUnits = new Map(world.productionUnits);
      productionUnits.set(sellerUnitId, { ...unit, outputInventory });
      const zeroStockWorld: WorldState = { ...world, productionUnits };

      expectRefusal(
        zeroStockWorld,
        buildAllocation({
          seller: { type: "PRODUCTION_UNIT", productionUnitId: sellerUnitId },
          buyer: { type: "COHORT", cohortId: buyerCohortId },
          quantity: 5e-10,
          sellerNetUnitPrice: 1,
          currencyId,
          destinationStateId: stateId,
        }),
        /cannot release/,
      );
    });

    it("refuses a sub-epsilon buyer overdraw instead of persisting a negative wallet", () => {
      const world = buildWorld();
      const { sellerUnitId, buyerCohortId, stateId, currencyId } = pickCounterparties(world);
      const cohort = world.cohorts.get(buyerCohortId)!;
      const wallet = new Map(cohort.wallet);
      wallet.set(currencyId, 0);
      const cohorts = new Map(world.cohorts);
      cohorts.set(buyerCohortId, { ...cohort, wallet });
      const zeroWalletWorld: WorldState = { ...world, cohorts };

      expectRefusal(
        zeroWalletWorld,
        buildAllocation({
          seller: { type: "PRODUCTION_UNIT", productionUnitId: sellerUnitId },
          buyer: { type: "COHORT", cohortId: buyerCohortId },
          quantity: 5e-10,
          sellerNetUnitPrice: 1,
          currencyId,
          destinationStateId: stateId,
        }),
        /cannot pay/,
      );
    });

    it("projects same-wallet deltas in commit order so an exact-zero atomic result is accepted", () => {
      const world = buildWorld();
      const { buyerCohortId, currencyId } = pickCounterparties(world);
      const cohort = world.cohorts.get(buyerCohortId)!;
      const wallet = new Map(cohort.wallet);
      wallet.set(currencyId, 1e-9);
      const cohorts = new Map(world.cohorts);
      cohorts.set(buyerCohortId, { ...cohort, wallet });
      const tinyWalletWorld: WorldState = { ...world, cohorts };
      const buyer = { type: "COHORT", cohortId: buyerCohortId } as const;

      const next = applyActorMoneyDeltas(tinyWalletWorld, [
        { actor: buyer, currencyId, delta: 5e-10 },
        { actor: buyer, currencyId, delta: -1.5000000000000002e-9 },
      ]);

      expect(next.cohorts.get(buyerCohortId)!.wallet.get(currencyId)).toBe(0);
    });

    it("settles a State's public inventory purchase, the one non-Cohort GENERAL endpoint", () => {
      const world = buildWorld();
      const { sellerUnitId, stateId, currencyId } = pickCounterparties(world);

      // Positive control for the GENERAL refusals above: GENERAL is a real endpoint when the
      // actor canonically owns exactly one goods stock, so the refusals are about ownership,
      // not about the literal string "GENERAL".
      const before = world.states.get(stateId)!.publicInventory.get(FOOD) ?? 0;
      const next = executeAllocation(
        world,
        context(),
        buildAllocation({
          seller: { type: "PRODUCTION_UNIT", productionUnitId: sellerUnitId },
          buyer: { type: "STATE", stateId },
          quantity: 2,
          sellerNetUnitPrice: 3,
          currencyId,
          destinationStateId: null,
        }),
      );

      expect(next.states.get(stateId)!.publicInventory.get(FOOD)).toBeCloseTo(before + 2, 9);
    });
  });
});
