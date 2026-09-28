/**
 * Phase-1 jurisdiction activation for REQ-CORE-005.
 *
 * PendingTransitions owns future authority changes. At Phase 1 of tick N, due
 * jurisdiction changes become both the TickContext authority snapshot and the
 * persisted Region.controllerStateId used by later phases. Other transition
 * carriers belong to later milestones and are deliberately preserved here.
 */
import type { RegionId, StateId } from "../domain/id";
import { stableOrderBy } from "../domain/ordering";
import { assertValidJurisdictionActivateTick } from "./pendingTransitions";
import type { WorldState } from "./worldState";

export function resolveEffectiveJurisdictionAtPhase1(
  world: WorldState,
  currentTick: number,
): ReadonlyMap<RegionId, StateId | null> {
  if (!Number.isInteger(currentTick) || currentTick < 0) {
    throw new Error(
      `Phase-1 jurisdiction tick must be a non-negative integer, got ${String(currentTick)}`,
    );
  }

  for (const change of stableOrderBy(
    world.pendingTransitions.jurisdictionChanges,
    (candidate) => `${String(candidate.regionId)}|${String(candidate.activateTick)}`,
  )) {
    try {
      assertValidJurisdictionActivateTick(change.activateTick);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Invalid Phase-1 jurisdiction change for Region ${String(change.regionId)}: ${reason}`,
      );
    }
  }

  const stale = world.pendingTransitions.jurisdictionChanges.filter(
    (change) => change.activateTick < currentTick,
  );
  if (stale.length > 0) {
    const first = stableOrderBy(
      stale,
      (change) => `${String(change.regionId)}|${change.activateTick}`,
    )[0]!;
    throw new Error(
      `Stale Phase-1 jurisdiction change for Region ${String(first.regionId)} was not activated at tick ${first.activateTick}`,
    );
  }

  const dueByRegion = new Map<RegionId, StateId | null>();
  const dueChanges = stableOrderBy(
    world.pendingTransitions.jurisdictionChanges.filter(
      (change) => change.activateTick === currentTick,
    ),
    (change) => String(change.regionId),
  );

  for (const change of dueChanges) {
    if (dueByRegion.has(change.regionId)) {
      throw new Error(
        `Duplicate Phase-1 jurisdiction change for Region ${String(change.regionId)} at tick ${currentTick}`,
      );
    }
    if (!world.regions.has(change.regionId)) {
      throw new Error(
        `Phase-1 jurisdiction change references missing Region ${String(change.regionId)}`,
      );
    }
    if (
      change.nextControllerStateId !== null &&
      !world.states.has(change.nextControllerStateId)
    ) {
      throw new Error(
        `Phase-1 jurisdiction change for Region ${String(change.regionId)} references missing State ${String(change.nextControllerStateId)}`,
      );
    }
    dueByRegion.set(change.regionId, change.nextControllerStateId);
  }

  const result = new Map<RegionId, StateId | null>();
  for (const region of stableOrderBy(
    world.regions.values(),
    (candidate) => String(candidate.regionId),
  )) {
    result.set(
      region.regionId,
      dueByRegion.has(region.regionId)
        ? dueByRegion.get(region.regionId)!
        : region.controllerStateId,
    );
  }
  return result;
}

export function applyJurisdictionTransitionsAtPhase1(
  world: WorldState,
  currentTick: number,
): WorldState {
  const effective = resolveEffectiveJurisdictionAtPhase1(world, currentTick);
  const hasDue = world.pendingTransitions.jurisdictionChanges.some(
    (change) => change.activateTick === currentTick,
  );
  if (!hasDue) return world;

  const regions = new Map(world.regions);
  for (const region of stableOrderBy(
    world.regions.values(),
    (candidate) => String(candidate.regionId),
  )) {
    const controllerStateId = effective.get(region.regionId);
    if (controllerStateId === undefined) {
      throw new Error(
        `Missing Phase-1 jurisdiction resolution for Region ${String(region.regionId)}`,
      );
    }
    regions.set(region.regionId, { ...region, controllerStateId });
  }

  return {
    ...world,
    regions,
    pendingTransitions: {
      ...world.pendingTransitions,
      jurisdictionChanges: world.pendingTransitions.jurisdictionChanges.filter(
        (change) => change.activateTick !== currentTick,
      ),
    },
  };
}
