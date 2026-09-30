/**
 * Immutable WorldState threading for milestone integrations that need an earlier phase's
 * explicit state transition to become visible to a later phase in the same canonical tick.
 *
 * `tickOrchestrator.ts` remains the sole owner of the 0..15 phase order, phase dispatch and
 * phase-boundary reconciliation rules. This seam only carries the returned WorldState from
 * an accepted phase transition into the next `executePhase` call; it never mutates an input
 * WorldState in place.
 */

import type { WorldState } from "./worldState";
import {
  TOTAL_PHASES,
  executePhase,
  initializeTickContext,
  validateTickInvariants,
  type PhaseBoundaryValidationError,
  type PhaseHandler,
  type TickContext,
} from "./tickOrchestrator";

export type PhaseWorldTransition = (
  phase: number,
  world: WorldState,
  context: TickContext,
) => WorldState;

/**
 * Optional read-only diagnostic seam invoked only after an accepted phase transition.
 * It observes the exact authoritative before/after WorldState pair without changing
 * phase order, reconciliation, or the transition selected by the caller.
 */
export type PhaseWorldTransitionObserver = (
  phase: number,
  beforeWorld: WorldState,
  afterWorld: WorldState,
  context: TickContext,
) => void;

export interface StatefulTickExecutionResult {
  readonly world: WorldState;
  readonly context: TickContext;
  readonly phaseTrace: readonly number[];
  readonly phaseBoundaryError?: PhaseBoundaryValidationError;
  readonly reconciliationErrors: readonly {
    category: string;
    key: string;
    residual: number;
  }[] | null;
}

/**
 * Execute the canonical phase sequence while threading explicit immutable WorldState
 * transitions between phase boundaries. A failed reconciliation returns before the
 * transition for the failing phase is made visible, so the caller never observes a
 * partially accepted phase.
 */
export function executeStatefulTick(
  openingWorld: WorldState,
  tickNumber: number,
  handler: PhaseHandler,
  applyPhaseTransition: PhaseWorldTransition,
  observePhaseTransition?: PhaseWorldTransitionObserver,
): StatefulTickExecutionResult {
  let world = openingWorld;
  let context = initializeTickContext(tickNumber, openingWorld.seed);
  const phaseTrace: number[] = [];
  const tolerance = openingWorld.simulationConfig.numeric.reconciliationRelativeTolerance;

  for (let phase = 0; phase < TOTAL_PHASES; phase += 1) {
    context = executePhase(
      phase,
      handler,
      world,
      context,
      world.pendingTransitions,
    );
    phaseTrace.push(phase);

    const boundaryErrors = validateTickInvariants(context, tolerance);
    if (boundaryErrors !== null) {
      return {
        world,
        context,
        phaseTrace,
        phaseBoundaryError: { phase, errors: boundaryErrors },
        reconciliationErrors: boundaryErrors,
      };
    }

    const beforeWorld = world;
    world = applyPhaseTransition(phase, beforeWorld, context);
    observePhaseTransition?.(phase, beforeWorld, world, context);
  }

  return { world, context, phaseTrace, reconciliationErrors: null };
}
