import { describe, expect, it } from "vitest";

import { baselineDefinitionPack } from "../config/fixtures/baselineDefinitionPack";
import { baselineScenario } from "../config/fixtures/baselineScenario";
import { createDefaultSimulationConfig } from "../config/simulationConfig";
import type { RegionId, StateId } from "../domain/id";
import {
  applyJurisdictionTransitionsAtPhase1,
  resolveEffectiveJurisdictionAtPhase1,
} from "./phase1JurisdictionTransition";
import { buildInitialWorld, type WorldState } from "./worldState";

function baselineWorld(): WorldState {
  return buildInitialWorld(
    baselineScenario,
    baselineDefinitionPack,
    createDefaultSimulationConfig(),
    42,
  );
}

function distinctTarget(world: WorldState, regionId: RegionId): StateId {
  const region = world.regions.get(regionId)!;
  const target = [...world.states.keys()]
    .sort((left, right) => String(left).localeCompare(String(right)))
    .find((stateId) => stateId !== region.controllerStateId);
  expect(target).toBeDefined();
  return target!;
}

describe("REQ-CORE-005 Phase-1 jurisdiction activation", () => {
  it("activates exactly at N, aligns snapshot and persisted authority, and preserves unrelated carriers", () => {
    const opening = baselineWorld();
    const region = [...opening.regions.values()]
      .sort((left, right) => String(left.regionId).localeCompare(String(right.regionId)))[0]!;
    const target = distinctTarget(opening, region.regionId);
    const futureTarget = region.controllerStateId;
    const stateCreation = {
      stateId: target,
      regionKey: region.seed.key,
      seed: { marker: "keep" },
      activateTick: 9,
    };
    const policyChange = {
      stateId: target,
      patch: { marker: "keep" },
      activateTick: 9,
    };
    const monetaryPolicyChange = {
      authorityId: [...opening.monetaryAuthorities.keys()][0]!,
      patch: { marker: "keep" },
      activateTick: 9,
    };
    const world: WorldState = {
      ...opening,
      pendingTransitions: {
        ...opening.pendingTransitions,
        jurisdictionChanges: [
          { regionId: region.regionId, nextControllerStateId: target, activateTick: 9 },
          { regionId: region.regionId, nextControllerStateId: futureTarget, activateTick: 10 },
        ],
        stateCreations: [stateCreation],
        policyChanges: [policyChange],
        monetaryPolicyChanges: [monetaryPolicyChange],
      },
    };

    const beforeRegion = world.regions.get(region.regionId)!;
    const snapshot = resolveEffectiveJurisdictionAtPhase1(world, 9);
    const applied = applyJurisdictionTransitionsAtPhase1(world, 9);

    expect(snapshot.size).toBe(world.regions.size);
    expect(snapshot.get(region.regionId)).toBe(target);
    expect(applied.regions.get(region.regionId)!.controllerStateId).toBe(target);
    expect(applied.pendingTransitions.jurisdictionChanges).toEqual([
      { regionId: region.regionId, nextControllerStateId: futureTarget, activateTick: 10 },
    ]);
    expect(applied.pendingTransitions.stateCreations).toEqual([stateCreation]);
    expect(applied.pendingTransitions.policyChanges).toEqual([policyChange]);
    expect(applied.pendingTransitions.monetaryPolicyChanges).toEqual([monetaryPolicyChange]);

    expect(world.regions.get(region.regionId)).toBe(beforeRegion);
    expect(beforeRegion.controllerStateId).toBe(region.controllerStateId);
    expect(world.pendingTransitions.jurisdictionChanges).toHaveLength(2);
  });

  it("keeps future jurisdiction changes inert and leaves the opening world unchanged", () => {
    const opening = baselineWorld();
    const region = [...opening.regions.values()][0]!;
    const target = distinctTarget(opening, region.regionId);
    const world: WorldState = {
      ...opening,
      pendingTransitions: {
        ...opening.pendingTransitions,
        jurisdictionChanges: [
          { regionId: region.regionId, nextControllerStateId: target, activateTick: 10 },
        ],
      },
    };

    expect(resolveEffectiveJurisdictionAtPhase1(world, 9).get(region.regionId))
      .toBe(region.controllerStateId);
    expect(applyJurisdictionTransitionsAtPhase1(world, 9)).toBe(world);
  });

  it("fails closed on malformed queued activation ticks before stale/due classification", () => {
    const opening = baselineWorld();
    const region = [...opening.regions.values()][0]!;
    const target = distinctTarget(opening, region.regionId);

    for (const activateTick of [Number.NaN, Number.POSITIVE_INFINITY, 4.5, -1]) {
      const world: WorldState = {
        ...opening,
        pendingTransitions: {
          ...opening.pendingTransitions,
          jurisdictionChanges: [
            { regionId: region.regionId, nextControllerStateId: target, activateTick },
          ],
        },
      };

      expect(() => resolveEffectiveJurisdictionAtPhase1(world, 5)).toThrow(
        /Invalid Phase-1 jurisdiction change/,
      );
      expect(() => applyJurisdictionTransitionsAtPhase1(world, 5)).toThrow(
        /Invalid Phase-1 jurisdiction change/,
      );
      expect(world.regions.get(region.regionId)!.controllerStateId).toBe(
        region.controllerStateId,
      );
      expect(world.pendingTransitions.jurisdictionChanges).toHaveLength(1);
    }
  });

  it("fails closed instead of silently preserving an overdue jurisdiction change", () => {
    const opening = baselineWorld();
    const region = [...opening.regions.values()][0]!;
    const target = distinctTarget(opening, region.regionId);
    const world: WorldState = {
      ...opening,
      pendingTransitions: {
        ...opening.pendingTransitions,
        jurisdictionChanges: [
          { regionId: region.regionId, nextControllerStateId: target, activateTick: 4 },
        ],
      },
    };

    expect(() => resolveEffectiveJurisdictionAtPhase1(world, 5)).toThrow(
      /Stale Phase-1 jurisdiction change/,
    );
    expect(() => applyJurisdictionTransitionsAtPhase1(world, 5)).toThrow(
      /Stale Phase-1 jurisdiction change/,
    );
    expect(world.regions.get(region.regionId)!.controllerStateId).toBe(
      region.controllerStateId,
    );
    expect(world.pendingTransitions.jurisdictionChanges).toHaveLength(1);
  });

  it("supports explicit null authority at the activation boundary", () => {
    const opening = baselineWorld();
    const region = [...opening.regions.values()][0]!;
    const world: WorldState = {
      ...opening,
      pendingTransitions: {
        ...opening.pendingTransitions,
        jurisdictionChanges: [
          { regionId: region.regionId, nextControllerStateId: null, activateTick: 3 },
        ],
      },
    };

    const snapshot = resolveEffectiveJurisdictionAtPhase1(world, 3);
    const applied = applyJurisdictionTransitionsAtPhase1(world, 3);
    expect(snapshot.get(region.regionId)).toBeNull();
    expect(applied.regions.get(region.regionId)!.controllerStateId).toBeNull();
  });

  it("fails closed on missing Region or non-null State references", () => {
    const opening = baselineWorld();
    const region = [...opening.regions.values()][0]!;
    const missingRegion = "r:missing" as RegionId;
    const missingState = "s:missing" as StateId;

    expect(() => resolveEffectiveJurisdictionAtPhase1({
      ...opening,
      pendingTransitions: {
        ...opening.pendingTransitions,
        jurisdictionChanges: [
          { regionId: missingRegion, nextControllerStateId: region.controllerStateId, activateTick: 4 },
        ],
      },
    }, 4)).toThrow(/missing Region/);

    expect(() => resolveEffectiveJurisdictionAtPhase1({
      ...opening,
      pendingTransitions: {
        ...opening.pendingTransitions,
        jurisdictionChanges: [
          { regionId: region.regionId, nextControllerStateId: missingState, activateTick: 4 },
        ],
      },
    }, 4)).toThrow(/missing State/);
  });

  it("rejects duplicate same-tick changes for one Region independent of insertion order", () => {
    const opening = baselineWorld();
    const region = [...opening.regions.values()][0]!;
    const target = distinctTarget(opening, region.regionId);
    const changes = [
      { regionId: region.regionId, nextControllerStateId: target, activateTick: 7 },
      { regionId: region.regionId, nextControllerStateId: null, activateTick: 7 },
    ] as const;

    for (const jurisdictionChanges of [changes, [...changes].reverse()]) {
      expect(() => resolveEffectiveJurisdictionAtPhase1({
        ...opening,
        pendingTransitions: {
          ...opening.pendingTransitions,
          jurisdictionChanges,
        },
      }, 7)).toThrow(/Duplicate Phase-1 jurisdiction change/);
    }
  });
});
