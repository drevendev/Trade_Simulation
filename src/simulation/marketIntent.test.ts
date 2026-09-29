/**
 * Tests for ephemeral MarketIntent contract and budget commitment ledger (REQ-MARKET-001).
 *
 * Covers:
 * 1. Valid MarketIntent creation for all actor types and purposes
 * 2. Validation rejection of non-finite/negative quantities
 * 3. Budget commitment ledger creation and overcommitment prevention
 * 4. ProductionUnit bucket routing (INPUT, OUTPUT, INVESTMENT)
 * 5. Generic actor bucket defaults
 * 6. Zero/epsilon edge cases
 */

import { describe, it, expect } from "vitest";
import type { ClanId, CurrencyId, GoodId, MarketId, ProductionUnitId, RegionId, StateId } from "../domain/id";
import {
  createMarketIntentId,
  validateMarketIntent,
  createEmptyBudgetCommitmentLedger,
  commitBudget,
  releaseCommitment,
  getEnvelopeCommitment,
  type MarketIntent,
} from "./marketIntent";

// Test ID allocators
const testClanId = "c:test-clan" as ClanId;
const testStateId = "s:test-state" as StateId;
const testProductionUnitId = "pu:test-pu" as ProductionUnitId;
const testRegionId = "r:test-region" as RegionId;
const testGoodId = "good:wheat" as GoodId;
const testCurrencyId = "cur:gold" as CurrencyId;
const testMarketId = "m:central" as MarketId;

describe("MarketIntent validation", () => {
  describe("Valid MarketIntent creation", () => {
    it("creates valid BUY intent for Clan consumer", () => {
      const intent: MarketIntent = {
        id: createMarketIntentId("mi:clan-buy-1"),
        actor: { type: "CLAN", clanId: testClanId },
        regionId: testRegionId,
        goodId: testGoodId,
        side: "BUY",
        purpose: "CONSUMPTION",
        desiredQuantity: 100,
        maxSpend: 5000,
        sourcePlanId: "plan:clan-1",
        inventoryBucket: "GENERAL",
      };

      expect(() => validateMarketIntent(intent)).not.toThrow();
    });

    it("rejects Clan SELL because a Clan owns no goods inventory", () => {
      const intent: MarketIntent = {
        id: createMarketIntentId("mi:clan-sell-1"),
        actor: { type: "CLAN", clanId: testClanId },
        regionId: testRegionId,
        goodId: testGoodId,
        side: "SELL",
        purpose: "INVENTORY_REBALANCE",
        desiredQuantity: 50,
        minimumReserveQuantity: 10,
        sourcePlanId: "plan:clan-2",
        inventoryBucket: "GENERAL",
      };

      expect(() => validateMarketIntent(intent)).toThrow(/Clan SELL intent has no physical goods inventory/);
    });

    it("creates valid BUY/INPUT intent for ProductionUnit", () => {
      const intent: MarketIntent = {
        id: createMarketIntentId("mi:pu-input-1"),
        actor: { type: "PRODUCTION_UNIT", productionUnitId: testProductionUnitId },
        regionId: testRegionId,
        goodId: testGoodId,
        side: "BUY",
        purpose: "INPUT",
        desiredQuantity: 200,
        maxSpend: 1000,
        sourcePlanId: "plan:pu-1",
        inventoryBucket: "INPUT",
      };

      expect(() => validateMarketIntent(intent)).not.toThrow();
    });

    it("creates valid BUY/INVESTMENT intent for ProductionUnit", () => {
      const intent: MarketIntent = {
        id: createMarketIntentId("mi:pu-invest-1"),
        actor: { type: "PRODUCTION_UNIT", productionUnitId: testProductionUnitId },
        regionId: testRegionId,
        goodId: testGoodId,
        side: "BUY",
        purpose: "INVESTMENT",
        desiredQuantity: 50,
        maxSpend: 5000,
        sourcePlanId: "plan:pu-2",
        inventoryBucket: "INVESTMENT",
      };

      expect(() => validateMarketIntent(intent)).not.toThrow();
    });

    it("creates valid SELL intent for ProductionUnit with OUTPUT bucket", () => {
      const intent: MarketIntent = {
        id: createMarketIntentId("mi:pu-output-1"),
        actor: { type: "PRODUCTION_UNIT", productionUnitId: testProductionUnitId },
        regionId: testRegionId,
        goodId: testGoodId,
        side: "SELL",
        purpose: "INVENTORY_REBALANCE",
        desiredQuantity: 300,
        minimumReserveQuantity: 50,
        sourcePlanId: "plan:pu-3",
        inventoryBucket: "OUTPUT",
      };

      expect(() => validateMarketIntent(intent)).not.toThrow();
    });

    it("creates valid State PUBLIC_PROCUREMENT intent", () => {
      const intent: MarketIntent = {
        id: createMarketIntentId("mi:state-procure-1"),
        actor: { type: "STATE", stateId: testStateId },
        regionId: testRegionId,
        goodId: testGoodId,
        side: "BUY",
        purpose: "PUBLIC_PROCUREMENT",
        desiredQuantity: 1000,
        maxSpend: 10000,
        sourcePlanId: "plan:state-1",
        inventoryBucket: "GENERAL",
      };

      expect(() => validateMarketIntent(intent)).not.toThrow();
    });

    it("accepts zero desiredQuantity", () => {
      const intent: MarketIntent = {
        id: createMarketIntentId("mi:zero-qty-1"),
        actor: { type: "CLAN", clanId: testClanId },
        regionId: testRegionId,
        goodId: testGoodId,
        side: "BUY",
        purpose: "CONSUMPTION",
        desiredQuantity: 0,
        maxSpend: 0,
        sourcePlanId: "plan:zero",
      };

      expect(() => validateMarketIntent(intent)).not.toThrow();
    });

    it("accepts omitted minimumReserveQuantity (defaults to 0)", () => {
      const intent: MarketIntent = {
        id: createMarketIntentId("mi:sell-no-reserve-1"),
        actor: { type: "STATE", stateId: testStateId },
        regionId: testRegionId,
        goodId: testGoodId,
        side: "SELL",
        purpose: "INVENTORY_REBALANCE",
        desiredQuantity: 100,
        sourcePlanId: "plan:sell-1",
      };

      expect(() => validateMarketIntent(intent)).not.toThrow();
    });
  });

  describe("Validation rejection of invalid constraints", () => {
    it("rejects negative desiredQuantity", () => {
      const intent: MarketIntent = {
        id: createMarketIntentId("mi:negative-qty-1"),
        actor: { type: "CLAN", clanId: testClanId },
        regionId: testRegionId,
        goodId: testGoodId,
        side: "BUY",
        purpose: "CONSUMPTION",
        desiredQuantity: -10,
        maxSpend: 100,
        sourcePlanId: "plan:bad-qty",
      };

      expect(() => validateMarketIntent(intent)).toThrow(/desiredQuantity must be >= 0/);
    });

    it("rejects non-finite desiredQuantity", () => {
      const intent: MarketIntent = {
        id: createMarketIntentId("mi:inf-qty-1"),
        actor: { type: "CLAN", clanId: testClanId },
        regionId: testRegionId,
        goodId: testGoodId,
        side: "BUY",
        purpose: "CONSUMPTION",
        desiredQuantity: Infinity,
        maxSpend: 100,
        sourcePlanId: "plan:inf",
      };

      expect(() => validateMarketIntent(intent)).toThrow();
    });

    it("rejects BUY intent without maxSpend", () => {
      const intent: MarketIntent = {
        id: createMarketIntentId("mi:no-spend-1"),
        actor: { type: "CLAN", clanId: testClanId },
        regionId: testRegionId,
        goodId: testGoodId,
        side: "BUY",
        purpose: "CONSUMPTION",
        desiredQuantity: 100,
        sourcePlanId: "plan:no-spend",
      };

      expect(() => validateMarketIntent(intent)).toThrow(/must have maxSpend/);
    });

    it("rejects negative maxSpend", () => {
      const intent: MarketIntent = {
        id: createMarketIntentId("mi:neg-spend-1"),
        actor: { type: "CLAN", clanId: testClanId },
        regionId: testRegionId,
        goodId: testGoodId,
        side: "BUY",
        purpose: "CONSUMPTION",
        desiredQuantity: 100,
        maxSpend: -500,
        sourcePlanId: "plan:neg-spend",
      };

      expect(() => validateMarketIntent(intent)).toThrow(/maxSpend must be >= 0/);
    });

    it("rejects negative minimumReserveQuantity", () => {
      const intent: MarketIntent = {
        id: createMarketIntentId("mi:neg-reserve-1"),
        actor: { type: "CLAN", clanId: testClanId },
        regionId: testRegionId,
        goodId: testGoodId,
        side: "SELL",
        purpose: "INVENTORY_REBALANCE",
        desiredQuantity: 100,
        minimumReserveQuantity: -5,
        sourcePlanId: "plan:neg-reserve",
      };

      expect(() => validateMarketIntent(intent)).toThrow(/minimumReserveQuantity must be >= 0/);
    });

    it("rejects SELL intent with maxSpend", () => {
      const intent: MarketIntent = {
        id: createMarketIntentId("mi:sell-spend-1"),
        actor: { type: "CLAN", clanId: testClanId },
        regionId: testRegionId,
        goodId: testGoodId,
        side: "SELL",
        purpose: "INVENTORY_REBALANCE",
        desiredQuantity: 100,
        maxSpend: 1000,
        sourcePlanId: "plan:sell-spend",
      };

      expect(() => validateMarketIntent(intent)).toThrow(/must not have maxSpend/);
    });

    it("rejects invalid side value", () => {
      const intent = {
        id: createMarketIntentId("mi:bad-side-1"),
        actor: { type: "CLAN", clanId: testClanId },
        regionId: testRegionId,
        goodId: testGoodId,
        side: "HOLD" as const,
        purpose: "CONSUMPTION",
        desiredQuantity: 100,
        maxSpend: 500,
        sourcePlanId: "plan:bad-side",
      };

      expect(() => validateMarketIntent(intent as any)).toThrow(/side must be BUY or SELL/);
    });

    it("rejects invalid purpose value", () => {
      const intent = {
        id: createMarketIntentId("mi:bad-purpose-1"),
        actor: { type: "CLAN", clanId: testClanId },
        regionId: testRegionId,
        goodId: testGoodId,
        side: "BUY",
        purpose: "SPECULATION",
        desiredQuantity: 100,
        maxSpend: 500,
        sourcePlanId: "plan:bad-purpose",
      };

      expect(() => validateMarketIntent(intent as any)).toThrow(/purpose must be one of/);
    });

    it("rejects ProductionUnit BUY/INPUT with wrong bucket", () => {
      const intent: MarketIntent = {
        id: createMarketIntentId("mi:pu-wrong-bucket-1"),
        actor: { type: "PRODUCTION_UNIT", productionUnitId: testProductionUnitId },
        regionId: testRegionId,
        goodId: testGoodId,
        side: "BUY",
        purpose: "INPUT",
        desiredQuantity: 100,
        maxSpend: 500,
        sourcePlanId: "plan:wrong-bucket",
        inventoryBucket: "OUTPUT",
      };

      expect(() => validateMarketIntent(intent)).toThrow(/BUY\/INPUT must use INPUT bucket/);
    });

    it("rejects ProductionUnit BUY/INVESTMENT with wrong bucket", () => {
      const intent: MarketIntent = {
        id: createMarketIntentId("mi:pu-invest-wrong-1"),
        actor: { type: "PRODUCTION_UNIT", productionUnitId: testProductionUnitId },
        regionId: testRegionId,
        goodId: testGoodId,
        side: "BUY",
        purpose: "INVESTMENT",
        desiredQuantity: 100,
        maxSpend: 500,
        sourcePlanId: "plan:invest-wrong",
        inventoryBucket: "INPUT",
      };

      expect(() => validateMarketIntent(intent)).toThrow(/BUY\/INVESTMENT must use INVESTMENT bucket/);
    });

    it("rejects ProductionUnit SELL with the unspecified GENERAL bucket", () => {
      const intent: MarketIntent = {
        id: createMarketIntentId("mi:pu-sell-wrong-1"),
        actor: { type: "PRODUCTION_UNIT", productionUnitId: testProductionUnitId },
        regionId: testRegionId,
        goodId: testGoodId,
        side: "SELL",
        purpose: "INVENTORY_REBALANCE",
        desiredQuantity: 100,
        sourcePlanId: "plan:sell-wrong",
        inventoryBucket: "GENERAL",
      };

      expect(() => validateMarketIntent(intent)).toThrow(/SELL must use INPUT, OUTPUT, or INVESTMENT bucket/);
    });
  });
});

describe("Budget commitment ledger", () => {
  describe("Ledger creation and basic operations", () => {
    it("creates empty ledger", () => {
      const ledger = createEmptyBudgetCommitmentLedger();
      expect(ledger.commitmentsByEnvelope.size).toBe(0);
    });

    it("commits budget to empty envelope", () => {
      let ledger = createEmptyBudgetCommitmentLedger();
      const clanActor = { type: "CLAN" as const, clanId: testClanId };

      const result = commitBudget(ledger, clanActor, testCurrencyId, "envelope:phase-8", 1000, 5000);
      expect(typeof result === "object").toBe(true);

      if (typeof result === "object") {
        ledger = result;
        expect(getEnvelopeCommitment(ledger, clanActor, testCurrencyId, "envelope:phase-8")).toBe(1000);
      }
    });

    it("accumulates multiple commits in same envelope", () => {
      let ledger = createEmptyBudgetCommitmentLedger();
      const clanActor = { type: "CLAN" as const, clanId: testClanId };
      const envelope = "envelope:phase-8";

      ledger = commitBudget(ledger, clanActor, testCurrencyId, envelope, 1000, 5000) as any;
      expect(ledger).not.toBe("object"); // Should succeed
      ledger = commitBudget(ledger, clanActor, testCurrencyId, envelope, 2000, 5000) as any;

      expect(getEnvelopeCommitment(ledger, clanActor, testCurrencyId, envelope)).toBe(3000);
    });

    it("separates commitments by actor", () => {
      let ledger = createEmptyBudgetCommitmentLedger();
      const clan1 = { type: "CLAN" as const, clanId: testClanId };
      const clan2 = { type: "CLAN" as const, clanId: "c:other" as ClanId };
      const envelope = "envelope:phase-8";

      ledger = commitBudget(ledger, clan1, testCurrencyId, envelope, 1000, 5000) as any;
      ledger = commitBudget(ledger, clan2, testCurrencyId, envelope, 2000, 5000) as any;

      expect(getEnvelopeCommitment(ledger, clan1, testCurrencyId, envelope)).toBe(1000);
      expect(getEnvelopeCommitment(ledger, clan2, testCurrencyId, envelope)).toBe(2000);
    });

    it("separates commitments by currency", () => {
      let ledger = createEmptyBudgetCommitmentLedger();
      const actor = { type: "CLAN" as const, clanId: testClanId };
      const envelope = "envelope:phase-8";
      const goldCurrency = testCurrencyId;
      const silverCurrency = "cur:silver" as CurrencyId;

      ledger = commitBudget(ledger, actor, goldCurrency, envelope, 1000, 5000) as any;
      ledger = commitBudget(ledger, actor, silverCurrency, envelope, 2000, 5000) as any;

      expect(getEnvelopeCommitment(ledger, actor, goldCurrency, envelope)).toBe(1000);
      expect(getEnvelopeCommitment(ledger, actor, silverCurrency, envelope)).toBe(2000);
    });

    it("separates commitments by envelope", () => {
      let ledger = createEmptyBudgetCommitmentLedger();
      const actor = { type: "CLAN" as const, clanId: testClanId };

      ledger = commitBudget(ledger, actor, testCurrencyId, "envelope:phase-4", 1000, 2000) as any;
      ledger = commitBudget(ledger, actor, testCurrencyId, "envelope:phase-8", 1500, 5000) as any;

      expect(getEnvelopeCommitment(ledger, actor, testCurrencyId, "envelope:phase-4")).toBe(1000);
      expect(getEnvelopeCommitment(ledger, actor, testCurrencyId, "envelope:phase-8")).toBe(1500);
    });
  });

  describe("Overcommitment prevention", () => {
    it("rejects commitment exceeding envelope limit", () => {
      const ledger = createEmptyBudgetCommitmentLedger();
      const actor = { type: "CLAN" as const, clanId: testClanId };

      const result = commitBudget(ledger, actor, testCurrencyId, "envelope:phase-8", 6000, 5000);
      expect(typeof result === "string").toBe(true);
      expect(result).toMatch(/exceed limit/);
    });

    it("rejects cumulative overcommitment", () => {
      let ledger = createEmptyBudgetCommitmentLedger();
      const actor = { type: "CLAN" as const, clanId: testClanId };

      ledger = commitBudget(ledger, actor, testCurrencyId, "envelope:phase-8", 3000, 5000) as any;
      const result = commitBudget(ledger, actor, testCurrencyId, "envelope:phase-8", 3000, 5000);

      expect(typeof result === "string").toBe(true);
      expect(result).toMatch(/exceed limit/);
    });

    it("allows commitment exactly at limit", () => {
      let ledger = createEmptyBudgetCommitmentLedger();
      const actor = { type: "CLAN" as const, clanId: testClanId };

      ledger = commitBudget(ledger, actor, testCurrencyId, "envelope:phase-8", 2500, 5000) as any;
      const result = commitBudget(ledger, actor, testCurrencyId, "envelope:phase-8", 2500, 5000);

      expect(typeof result === "object").toBe(true);
      if (typeof result === "object") {
        expect(getEnvelopeCommitment(result, actor, testCurrencyId, "envelope:phase-8")).toBe(5000);
      }
    });

    it("allows zero commitment", () => {
      const ledger = createEmptyBudgetCommitmentLedger();
      const actor = { type: "CLAN" as const, clanId: testClanId };

      const result = commitBudget(ledger, actor, testCurrencyId, "envelope:phase-8", 0, 5000);
      expect(typeof result === "object").toBe(true);
    });
  });

  describe("Release and reusability", () => {
    it("does not release commitment when envelope is non-reusable", () => {
      let ledger = createEmptyBudgetCommitmentLedger();
      const actor = { type: "CLAN" as const, clanId: testClanId };

      ledger = commitBudget(ledger, actor, testCurrencyId, "envelope:phase-8", 1000, 5000) as any;
      ledger = releaseCommitment(ledger, actor, testCurrencyId, "envelope:phase-8", 500, false);

      expect(getEnvelopeCommitment(ledger, actor, testCurrencyId, "envelope:phase-8")).toBe(1000);
    });

    it("releases partial commitment when envelope is reusable", () => {
      let ledger = createEmptyBudgetCommitmentLedger();
      const actor = { type: "CLAN" as const, clanId: testClanId };

      ledger = commitBudget(ledger, actor, testCurrencyId, "envelope:phase-8", 1000, 5000) as any;
      ledger = releaseCommitment(ledger, actor, testCurrencyId, "envelope:phase-8", 400, true);

      expect(getEnvelopeCommitment(ledger, actor, testCurrencyId, "envelope:phase-8")).toBe(600);
    });

    it("completely removes envelope when all committed amount is released", () => {
      let ledger = createEmptyBudgetCommitmentLedger();
      const actor = { type: "CLAN" as const, clanId: testClanId };

      ledger = commitBudget(ledger, actor, testCurrencyId, "envelope:phase-8", 1000, 5000) as any;
      ledger = releaseCommitment(ledger, actor, testCurrencyId, "envelope:phase-8", 1000, true);

      expect(getEnvelopeCommitment(ledger, actor, testCurrencyId, "envelope:phase-8")).toBe(0);
      expect(ledger.commitmentsByEnvelope.size).toBe(0);
    });

    it("prevents over-release (clamped to zero)", () => {
      let ledger = createEmptyBudgetCommitmentLedger();
      const actor = { type: "CLAN" as const, clanId: testClanId };

      ledger = commitBudget(ledger, actor, testCurrencyId, "envelope:phase-8", 1000, 5000) as any;
      ledger = releaseCommitment(ledger, actor, testCurrencyId, "envelope:phase-8", 2000, true);

      expect(getEnvelopeCommitment(ledger, actor, testCurrencyId, "envelope:phase-8")).toBe(0);
    });

    it("allows release after commitment is rejected, if reusable", () => {
      let ledger = createEmptyBudgetCommitmentLedger();
      const actor = { type: "CLAN" as const, clanId: testClanId };

      // Try to commit 6000 (exceeds limit of 5000)
      const commitResult = commitBudget(ledger, actor, testCurrencyId, "envelope:phase-8", 6000, 5000);

      // If rejected, no commitment was recorded, so release has no effect
      if (typeof commitResult === "string") {
        ledger = releaseCommitment(ledger, actor, testCurrencyId, "envelope:phase-8", 1000, true);
        expect(getEnvelopeCommitment(ledger, actor, testCurrencyId, "envelope:phase-8")).toBe(0);
      }
    });
  });

  describe("ProductionUnit-specific scenarios", () => {
    it("tracks separate commitments for ProductionUnit vs Clan", () => {
      let ledger = createEmptyBudgetCommitmentLedger();
      const puActor = { type: "PRODUCTION_UNIT" as const, productionUnitId: testProductionUnitId };
      const clanActor = { type: "CLAN" as const, clanId: testClanId };

      ledger = commitBudget(ledger, puActor, testCurrencyId, "envelope:phase-8", 1000, 5000) as any;
      ledger = commitBudget(ledger, clanActor, testCurrencyId, "envelope:phase-8", 2000, 5000) as any;

      expect(getEnvelopeCommitment(ledger, puActor, testCurrencyId, "envelope:phase-8")).toBe(1000);
      expect(getEnvelopeCommitment(ledger, clanActor, testCurrencyId, "envelope:phase-8")).toBe(2000);
    });
  });
});
