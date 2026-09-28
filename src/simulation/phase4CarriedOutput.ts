/**
 * HANDOFF-REPAIR-M4-006: PRE_PRODUCTION-only seller evidence for OUTPUT that
 * already exists before Phase 4. Same-tick Phase-5 output is never visible
 * here; Phase 5 later recomputes MAIN from remaining stock.
 */

import { createDefaultSimulationConfig } from "../config/simulationConfig";
import type { ProductionUnitId } from "../domain/id";
import { stableOrderBy } from "../domain/ordering";
import { createMarketIntentId, validateMarketIntent, type MarketIntent } from "./marketIntent";
import type { ProductionPlan } from "./productionPlanning";
import type { WorldState } from "./worldState";

function requireNonNegative(name: string, value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be finite and >= 0, got ${String(value)}`);
  }
  return value;
}

function regionIdForUnit(world: WorldState, unitId: ProductionUnitId, regionKey: string) {
  const regions = stableOrderBy(
    [...world.regions.values()].filter((region) => region.seed.key === regionKey),
    (region) => String(region.regionId),
  );
  if (regions.length !== 1) {
    throw new Error(
      `ProductionUnit ${String(unitId)} region ${regionKey} must resolve exactly once, got ${regions.length}`,
    );
  }
  return regions[0]!.regionId;
}

export function buildPhase4CarriedOutputSellIntents(
  world: WorldState,
  currentTick: number,
  productionPlans: readonly ProductionPlan[],
): readonly MarketIntent[] {
  if (!Number.isInteger(currentTick) || currentTick < 0) {
    throw new Error(
      `Phase-4 carried-output tick must be a non-negative integer, got ${String(currentTick)}`,
    );
  }

  const defaults = createDefaultSimulationConfig();
  const outputCoverageTicks = requireNonNegative(
    "ProductionConfig.outputCoverageTicks",
    world.simulationConfig.production.outputCoverageTicks ?? defaults.production.outputCoverageTicks!,
  );
  const quantityEpsilon = requireNonNegative(
    "SimulationConfig.numeric.quantityEpsilon",
    world.simulationConfig.numeric.quantityEpsilon ?? defaults.numeric.quantityEpsilon!,
  );
  if (quantityEpsilon === 0) {
    throw new Error("SimulationConfig.numeric.quantityEpsilon must be > 0");
  }

  const planByUnit = new Map<ProductionUnitId, ProductionPlan>();
  for (const plan of stableOrderBy(productionPlans, (candidate) => String(candidate.unitId))) {
    if (plan.tick !== currentTick) {
      throw new Error(
        `ProductionPlan ${plan.planId} is for tick ${plan.tick}, expected ${currentTick}`,
      );
    }
    if (planByUnit.has(plan.unitId)) {
      throw new Error(`Duplicate ProductionPlan for unit ${String(plan.unitId)}`);
    }
    planByUnit.set(plan.unitId, plan);
  }

  const intents: MarketIntent[] = [];
  for (const unit of stableOrderBy(
    world.productionUnits.values(),
    (candidate) => String(candidate.productionUnitId),
  )) {
    if (unit.status !== "ACTIVE" && unit.status !== "CLOSING") continue;

    const recipe = world.definitionRegistry.recipes[unit.seed.recipeId];
    if (recipe === undefined) {
      throw new Error(
        `ProductionUnit ${String(unit.productionUnitId)} references missing recipe ${unit.seed.recipeId}`,
      );
    }
    const plan = planByUnit.get(unit.productionUnitId);
    if (plan === undefined) {
      throw new Error(
        `Phase-4 carried OUTPUT for ${String(unit.productionUnitId)} requires the current ProductionPlan`,
      );
    }
    if (plan.recipeId !== recipe.id) {
      throw new Error(
        `ProductionPlan ${plan.planId} recipe does not match ProductionUnit ${String(unit.productionUnitId)}`,
      );
    }

    const outputQuantity = requireNonNegative(
      `ProductionUnit ${String(unit.productionUnitId)} carried OUTPUT ${String(recipe.outputGoodId)}`,
      unit.outputInventory.get(recipe.outputGoodId) ?? 0,
    );
    const reserve = unit.status === "CLOSING"
      ? 0
      : requireNonNegative(
        `ProductionUnit ${String(unit.productionUnitId)} target output reserve`,
        unit.signals.outputSalesEma * outputCoverageTicks,
      );
    const desiredQuantity = Math.max(0, outputQuantity - reserve);
    if (desiredQuantity <= quantityEpsilon) continue;

    const intent: MarketIntent = {
      id: createMarketIntentId(
        `mi:phase4-carried-output:${currentTick}:${String(unit.productionUnitId)}`,
      ),
      actor: { type: "PRODUCTION_UNIT", productionUnitId: unit.productionUnitId },
      regionId: regionIdForUnit(world, unit.productionUnitId, unit.seed.regionKey),
      goodId: recipe.outputGoodId,
      side: "SELL",
      purpose: "INVENTORY_REBALANCE",
      desiredQuantity,
      minimumReserveQuantity: reserve,
      sourcePlanId: plan.planId,
      inventoryBucket: "OUTPUT",
    };
    validateMarketIntent(intent);
    intents.push(intent);
  }

  return intents;
}
