import { describe, expect, it } from "vitest";
import type { ActorRef } from "../domain/genesisLedger";
import type {
  ClanId,
  CohortId,
  GoodId,
  MonetaryAuthorityId,
  ProductionUnitId,
  RegionId,
  StateId,
} from "../domain/id";
import { createMarketIntentId, validateMarketIntent, type MarketIntent } from "./marketIntent";

const productionUnit: ActorRef = {
  type: "PRODUCTION_UNIT",
  productionUnitId: "pu:endpoint" as ProductionUnitId,
};
const clan: ActorRef = { type: "CLAN", clanId: "c:endpoint" as ClanId };
const state: ActorRef = { type: "STATE", stateId: "s:endpoint" as StateId };
const cohort: ActorRef = { type: "COHORT", cohortId: "co:endpoint" as CohortId };
const authority: ActorRef = {
  type: "MONETARY_AUTHORITY",
  authorityId: "auth:endpoint" as MonetaryAuthorityId,
};

function intent(
  actor: ActorRef,
  side: MarketIntent["side"],
  purpose: MarketIntent["purpose"],
  inventoryBucket?: MarketIntent["inventoryBucket"],
): MarketIntent {
  return {
    id: createMarketIntentId("mi:endpoint"),
    actor,
    regionId: "r:endpoint" as RegionId,
    goodId: "good:tools" as GoodId,
    side,
    purpose,
    desiredQuantity: 5,
    ...(side === "BUY" ? { maxSpend: 10 } : {}),
    sourcePlanId: "plan:endpoint",
    ...(inventoryBucket === undefined ? {} : { inventoryBucket }),
  };
}

describe("MarketIntent physical endpoint conformance (#246)", () => {
  it.each([undefined, "GENERAL"] as const)(
    "rejects ProductionUnit BUY/INPUT with bucket %s",
    (bucket) => {
      expect(() => validateMarketIntent(intent(productionUnit, "BUY", "INPUT", bucket)))
        .toThrow(/BUY\/INPUT must use INPUT bucket/);
    },
  );

  it.each([undefined, "GENERAL"] as const)(
    "rejects ProductionUnit BUY/INVESTMENT with bucket %s",
    (bucket) => {
      expect(() => validateMarketIntent(intent(productionUnit, "BUY", "INVESTMENT", bucket)))
        .toThrow(/BUY\/INVESTMENT must use INVESTMENT bucket/);
    },
  );

  it.each([undefined, "GENERAL"] as const)(
    "rejects ProductionUnit SELL with bucket %s",
    (bucket) => {
      expect(() => validateMarketIntent(intent(productionUnit, "SELL", "INVENTORY_REBALANCE", bucket)))
        .toThrow(/SELL must use INPUT, OUTPUT, or INVESTMENT bucket/);
    },
  );

  for (const actor of [state, cohort]) {
    for (const side of ["BUY", "SELL"] as const) {
      for (const purpose of ["CONSUMPTION", "INPUT", "INVESTMENT", "PUBLIC_PROCUREMENT", "INVENTORY_REBALANCE"] as const) {
        it.each(["INPUT", "OUTPUT", "INVESTMENT"] as const)(
          `rejects ${actor.type} ${side}/${purpose} with non-generic bucket %s`,
          (bucket) => {
            expect(() => validateMarketIntent(intent(actor, side, purpose, bucket)))
              .toThrow(/must use GENERAL inventory bucket/);
          },
        );
      }
    }
  }

  for (const purpose of ["CONSUMPTION", "PUBLIC_PROCUREMENT", "INVENTORY_REBALANCE"] as const) {
    it.each([undefined, "GENERAL"] as const)(
      `rejects ProductionUnit BUY/${purpose} with missing physical bucket %s`,
      (bucket) => {
        expect(() => validateMarketIntent(intent(productionUnit, "BUY", purpose, bucket)))
          .toThrow(/BUY must use INPUT, OUTPUT, or INVESTMENT bucket/);
      },
    );
    it.each(["INPUT", "OUTPUT", "INVESTMENT"] as const)(
      `accepts ProductionUnit BUY/${purpose} with physical bucket %s`,
      (bucket) => {
        expect(() => validateMarketIntent(intent(productionUnit, "BUY", purpose, bucket)))
          .not.toThrow();
      },
    );
  }

  it.each(["BUY", "SELL"] as const)("rejects MonetaryAuthority %s before settlement", (side) => {
    expect(() => validateMarketIntent(intent(authority, side, "INVENTORY_REBALANCE", "GENERAL")))
      .toThrow(/MonetaryAuthority is not a MarketIntent actor/);
  });

  // Positive controls prevent implementing these boundaries by refusing all intents.
  it.each(["INPUT", "INVESTMENT"] as const)("accepts explicit ProductionUnit BUY/%s", (bucket) => {
    expect(() => validateMarketIntent(intent(productionUnit, "BUY", bucket, bucket))).not.toThrow();
  });

  it.each(["INPUT", "OUTPUT", "INVESTMENT"] as const)(
    "accepts ProductionUnit SELL/%s with the default zero reserve",
    (bucket) => {
      expect(() => validateMarketIntent(intent(productionUnit, "SELL", "INVENTORY_REBALANCE", bucket)))
        .not.toThrow();
    },
  );

  for (const actor of [state, cohort]) {
    for (const side of ["BUY", "SELL"] as const) {
      it.each([undefined, "GENERAL"] as const)(
        `preserves ${actor.type} ${side} with bucket %s`,
        (bucket) => {
          expect(() => validateMarketIntent(intent(actor, side, "INVENTORY_REBALANCE", bucket)))
            .not.toThrow();
        },
      );
    }
  }

  it.each([
    ["BUY", "CONSUMPTION"],
    ["SELL", "INVENTORY_REBALANCE"],
  ] as const)("rejects Clan %s because no physical goods endpoint exists", (side, purpose) => {
    for (const bucket of [undefined, "GENERAL"] as const) {
      expect(() => validateMarketIntent(intent(clan, side, purpose, bucket)))
        .toThrow(/Clan MarketIntent has no physical goods inventory/);
    }
  });

  it.each([undefined, "GENERAL"] as const)(
    "keeps Cohort BUY valid as the negative control for Clan rejection with bucket %s",
    (bucket) => {
      expect(() => validateMarketIntent(intent(cohort, "BUY", "CONSUMPTION", bucket))).not.toThrow();
    },
  );
});
