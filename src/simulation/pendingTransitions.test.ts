import { describe, expect, it } from "vitest";

import type {
  ClanId,
  CohortId,
  CurrencyId,
  MarketId,
  MonetaryAuthorityId,
  ProductionUnitId,
  RegionId,
  StateId,
  TransportLinkId,
} from "../domain/id";
import {
  createEmptyPendingTransitions,
  addJurisdictionChange,
  addStateCreation,
  addPolicyChange,
  addMonetaryPolicyChange,
  getActiveTransitionsAtTick,
  removeActivatedTransitions,
} from "./pendingTransitions";

describe("PendingTransitions (REQ-CORE-005)", () => {
  const regionId = "r:region-1" as RegionId;
  const stateId1 = "s:state-1" as StateId;
  const stateId2 = "s:state-2" as StateId;
  const authorityId = "ma:auth-1" as MonetaryAuthorityId;

  describe("createEmptyPendingTransitions", () => {
    it("creates an empty transitions container", () => {
      const transitions = createEmptyPendingTransitions();
      expect(transitions.jurisdictionChanges).toHaveLength(0);
      expect(transitions.stateCreations).toHaveLength(0);
      expect(transitions.policyChanges).toHaveLength(0);
      expect(transitions.monetaryPolicyChanges).toHaveLength(0);
    });
  });

  describe("jurisdiction changes", () => {
    it("queues a jurisdiction change for future activation", () => {
      const transitions = createEmptyPendingTransitions();
      const updated = addJurisdictionChange(
        transitions,
        regionId,
        stateId1,
        2, // activateTick = 2
      );

      expect(updated.jurisdictionChanges).toHaveLength(1);
      expect(updated.jurisdictionChanges[0]!).toEqual({
        regionId,
        nextControllerStateId: stateId1,
        activateTick: 2,
      });
    });

    it("supports multiple jurisdiction changes with different activation times", () => {
      let transitions = createEmptyPendingTransitions();
      transitions = addJurisdictionChange(transitions, regionId, stateId1, 2);
      transitions = addJurisdictionChange(transitions, regionId, stateId2, 3);

      expect(transitions.jurisdictionChanges).toHaveLength(2);
      expect(transitions.jurisdictionChanges[0]!.activateTick).toBe(2);
      expect(transitions.jurisdictionChanges[1]!.activateTick).toBe(3);
    });

    it("allows setting controllerStateId to null (uncontrolled region)", () => {
      const transitions = createEmptyPendingTransitions();
      const updated = addJurisdictionChange(transitions, regionId, null, 2);

      expect(updated.jurisdictionChanges[0]!.nextControllerStateId).toBe(null);
    });

    it("rejects malformed activation ticks before they enter the jurisdiction queue", () => {
      const transitions = createEmptyPendingTransitions();

      for (const activateTick of [Number.NaN, Number.POSITIVE_INFINITY, 2.5, -1]) {
        expect(() =>
          addJurisdictionChange(transitions, regionId, stateId1, activateTick),
        ).toThrow(/finite non-negative integer/);
      }

      expect(transitions.jurisdictionChanges).toEqual([]);
    });
  });

  describe("policy changes", () => {
    it("queues a policy change for a state", () => {
      const transitions = createEmptyPendingTransitions();
      const patch = { taxRate: 0.15 };
      const updated = addPolicyChange(transitions, stateId1, patch, 3);

      expect(updated.policyChanges).toHaveLength(1);
      expect(updated.policyChanges[0]!).toEqual({
        stateId: stateId1,
        patch,
        activateTick: 3,
      });
    });

    it("supports multiple policy changes for different states and times", () => {
      let transitions = createEmptyPendingTransitions();
      transitions = addPolicyChange(transitions, stateId1, { taxRate: 0.15 }, 2);
      transitions = addPolicyChange(transitions, stateId2, { taxRate: 0.20 }, 3);

      expect(transitions.policyChanges).toHaveLength(2);
    });
  });

  describe("monetary policy changes", () => {
    it("queues a monetary policy change for an authority", () => {
      const transitions = createEmptyPendingTransitions();
      const patch = { policyRate: 0.05 };
      const updated = addMonetaryPolicyChange(
        transitions,
        authorityId,
        patch,
        4,
      );

      expect(updated.monetaryPolicyChanges).toHaveLength(1);
      expect(updated.monetaryPolicyChanges[0]!).toEqual({
        authorityId,
        patch,
        activateTick: 4,
      });
    });
  });

  describe("state creations", () => {
    it("queues a state creation for future activation", () => {
      const transitions = createEmptyPendingTransitions();
      const stateCreation = {
        stateId: stateId2,
        regionKey: "region-1",
        seed: { key: "NewState" },
        activateTick: 5,
      };
      const updated = addStateCreation(transitions, stateCreation);

      expect(updated.stateCreations).toHaveLength(1);
      expect(updated.stateCreations[0]!).toEqual(stateCreation);
    });
  });

  describe("CORE-T7: Phase-14 jurisdiction change becomes economic only in N+1", () => {
    it("N+1 changes are not effective at current tick", () => {
      let transitions = createEmptyPendingTransitions();
      const currentTick = 10;

      // Queue a change for tick N+1
      transitions = addJurisdictionChange(
        transitions,
        regionId,
        stateId1,
        currentTick + 1,
      );

      // At currentTick, the change is NOT active
      const activeNow = getActiveTransitionsAtTick(transitions, currentTick);
      expect(activeNow.jurisdictionChanges).toHaveLength(0);
    });

    it("N+1 changes become effective exactly at their activateTick", () => {
      let transitions = createEmptyPendingTransitions();
      const currentTick = 10;
      const nextTick = currentTick + 1;

      transitions = addJurisdictionChange(transitions, regionId, stateId1, nextTick);

      const activeNext = getActiveTransitionsAtTick(transitions, nextTick);
      expect(activeNext.jurisdictionChanges).toHaveLength(1);
      expect(activeNext.jurisdictionChanges[0]!.activateTick).toBe(nextTick);
    });

    it("transitions cannot mutate current-tick state (verified by semantics)", () => {
      // The PendingTransitions structure ensures that only changes with
      // activateTick = currentTick are retrieved by getActiveTransitionsAtTick.
      // Because N+1 changes have activateTick > currentTick, they cannot
      // be retrieved at currentTick, preventing any mutation of current state.

      let transitions = createEmptyPendingTransitions();
      const currentTick = 10;

      transitions = addJurisdictionChange(
        transitions,
        regionId,
        stateId1,
        currentTick + 1,
      );

      // Only an N+2 change should be visible then
      transitions = addJurisdictionChange(
        transitions,
        regionId,
        stateId2,
        currentTick + 2,
      );

      const activeCurrent = getActiveTransitionsAtTick(transitions, currentTick);
      expect(activeCurrent.jurisdictionChanges).toHaveLength(0);
    });
  });

  describe("getActiveTransitionsAtTick", () => {
    it("returns only transitions for the specified tick", () => {
      let transitions = createEmptyPendingTransitions();
      const tick1 = 5;
      const tick2 = 6;

      transitions = addJurisdictionChange(transitions, regionId, stateId1, tick1);
      transitions = addJurisdictionChange(transitions, regionId, stateId2, tick2);
      transitions = addPolicyChange(transitions, stateId1, {}, tick1);
      transitions = addPolicyChange(transitions, stateId1, {}, tick2);

      const activeTick1 = getActiveTransitionsAtTick(transitions, tick1);
      expect(activeTick1.jurisdictionChanges).toHaveLength(1);
      expect(activeTick1.policyChanges).toHaveLength(1);

      const activeTick2 = getActiveTransitionsAtTick(transitions, tick2);
      expect(activeTick2.jurisdictionChanges).toHaveLength(1);
      expect(activeTick2.policyChanges).toHaveLength(1);
    });

    it("returns empty transitions for a tick with no changes", () => {
      let transitions = createEmptyPendingTransitions();
      transitions = addJurisdictionChange(transitions, regionId, stateId1, 10);

      const activeTick5 = getActiveTransitionsAtTick(transitions, 5);
      expect(activeTick5.jurisdictionChanges).toHaveLength(0);
      expect(activeTick5.stateCreations).toHaveLength(0);
      expect(activeTick5.policyChanges).toHaveLength(0);
      expect(activeTick5.monetaryPolicyChanges).toHaveLength(0);
    });
  });

  describe("removeActivatedTransitions", () => {
    it("removes transitions for the specified tick", () => {
      let transitions = createEmptyPendingTransitions();
      transitions = addJurisdictionChange(transitions, regionId, stateId1, 5);
      transitions = addJurisdictionChange(transitions, regionId, stateId2, 6);
      transitions = addPolicyChange(transitions, stateId1, {}, 5);

      const updated = removeActivatedTransitions(transitions, 5);

      expect(updated.jurisdictionChanges).toHaveLength(1);
      expect(updated.jurisdictionChanges[0]!.activateTick).toBe(6);
      expect(updated.policyChanges).toHaveLength(0);
    });

    it("preserves transitions for other ticks", () => {
      let transitions = createEmptyPendingTransitions();
      transitions = addJurisdictionChange(transitions, regionId, stateId1, 5);
      transitions = addJurisdictionChange(transitions, regionId, stateId2, 6);
      transitions = addJurisdictionChange(transitions, regionId, stateId1, 7);

      const updated = removeActivatedTransitions(transitions, 6);

      expect(updated.jurisdictionChanges).toHaveLength(2);
      expect(updated.jurisdictionChanges[0]!.activateTick).toBe(5);
      expect(updated.jurisdictionChanges[1]!.activateTick).toBe(7);
    });

    it("handles removal from mixed transition types", () => {
      let transitions = createEmptyPendingTransitions();
      transitions = addJurisdictionChange(transitions, regionId, stateId1, 5);
      transitions = addPolicyChange(transitions, stateId1, {}, 5);
      transitions = addMonetaryPolicyChange(transitions, authorityId, {}, 5);

      const updated = removeActivatedTransitions(transitions, 5);

      expect(updated.jurisdictionChanges).toHaveLength(0);
      expect(updated.policyChanges).toHaveLength(0);
      expect(updated.monetaryPolicyChanges).toHaveLength(0);
    });
  });

  describe("immutability contract", () => {
    it("returns new objects rather than mutating inputs", () => {
      const original = createEmptyPendingTransitions();
      const updated = addJurisdictionChange(
        original,
        regionId,
        stateId1,
        5,
      );

      expect(original.jurisdictionChanges).toHaveLength(0);
      expect(updated.jurisdictionChanges).toHaveLength(1);
      expect(original).not.toBe(updated);
    });
  });
});
