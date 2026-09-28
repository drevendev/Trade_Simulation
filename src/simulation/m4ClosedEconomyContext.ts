/** Ephemeral M4 orchestration evidence carried only inside one TickContext. */

import type { MarketAllocation } from "./marketClearing";
import type { MarketIntent } from "./marketIntent";

declare module "./tickOrchestrator" {
  interface TickContext {
    /** Phase-4-only carried OUTPUT sellers; never forwarded as residual MAIN intents. */
    readonly phase4CarriedOutputIntents?: readonly MarketIntent[];
    /** Realized Phase-4 PRE_PRODUCTION allocations; never mixed with Phase-8 MAIN allocations. */
    readonly phase4MarketAllocations?: readonly MarketAllocation[];
  }
}

export {};
