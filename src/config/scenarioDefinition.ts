/**
 * ScenarioDefinition layer (REQ-CONFIG-001; seed shapes REQ-CONFIG-003).
 *
 * See `docs/spec/mirror/06 - Handoff/03 — CANONICAL_CONFIG_AND_WORLD_GENERATION.md`
 * section 2: "ScenarioDefinition owns starting world stocks/topology/institutions."
 * Section 16 ("Scenario seed schemas") gives the field-level shape below for every
 * seed type that document specifies standalone. `StateSeed`, `MonetaryAuthoritySeed`,
 * `ClanSeed`, `BondSeed` and `InitialEventSeed` remain empty placeholders here: each
 * references a nested type (`StatePolicySeed`, `FxPoolSeed`, `ClanPreferenceState`,
 * `ClanStateRelationSeed`, or a bond/event shape) owned by a different domain
 * document that `REQ-CONFIG-003`'s bounded first slice does not read.
 */

export interface RegionSeed {
  readonly key: string;
  readonly name: string;
  readonly controllerStateKey: string | null;
  readonly settlementCurrencyKey: string;
  readonly settlementLevel: number;
  readonly infrastructure: Readonly<Record<string, number>>;
  readonly climateHabitabilityInputs: Readonly<Record<string, number>>;
  readonly deposits: readonly {
    readonly resourceId: string;
    readonly initialQuantity: number;
    readonly initiallyKnown: boolean;
  }[];
}

export interface TransportLinkSeed {
  readonly key: string;
  readonly fromRegionKey: string;
  readonly toRegionKey: string;
  readonly bidirectional?: boolean;
  readonly distance: number;
  readonly baseCapacity: number;
  readonly condition: number;
  readonly baseTransportCost: number;
  /** Link-specific travel time; falls back to TradeConfig.defaultTransitTicksPerLink. */
  readonly transitTicks?: number;
  /** Optional explicit routine physical attrition; falls back to the configured zero baseline. */
  readonly routinePhysicalLossRate?: number;
  readonly feeReceiverStateKey?: string | null;
}

export interface M4ProductionPlanningPolicySeed {
  /** Explicit read-only M4 minimum-wage fixtures, keyed by Region seed key then labor category. */
  readonly minimumWageFloorByRegionKey: Readonly<
    Record<string, Readonly<Record<string, number>>>
  >;
  /** Explicit read-only M4 mandatory pre-payroll cash fixtures, keyed by ProductionUnit seed key. */
  readonly mandatoryKnownCashByProductionUnitKey: Readonly<Record<string, number>>;
  /**
   * Explicit M4-only current-law answers for ProductionUnit lifecycle readiness.
   * M6 later replaces these coarse scenario fixtures with the same pure-query semantics.
   * They are optional in the schema for compatibility with older/manual fixtures, but
   * controlled-Region lifecycle review fails closed unless both answers are present.
   */
  readonly lifecycleOwnershipAllowed?: boolean;
  readonly lifecycleProductionAllowed?: boolean;
}

export interface StatePolicySeed {
  /**
   * Deterministic M4-only production-planning policy input. Mutable fiscal institutions
   * remain M6 work; an explicit empty pair of maps means no applicable M4 rule.
   */
  readonly m4ProductionPlanning?: M4ProductionPlanningPolicySeed;
}

export interface StateSeed {
  readonly key: string;
  readonly name: string;
  readonly treasury: Readonly<Record<string, number>>;
  readonly publicInventory: Readonly<Record<string, number>>;
  readonly policy: StatePolicySeed;
  readonly effectiveCurrencyRegime: CurrencyRegimeSeed;
}

export interface CurrencyRegimeSeed {
  readonly currencyKey: string;
  readonly regimeType: "INDEPENDENT_FLOAT" | "MONETARY_UNION" | "FOREIGN_LEGAL_TENDER";
  readonly policyAuthorityKey: string | null;
}

export interface CurrencySeed {
  readonly key: string;
  readonly code: string;
  readonly issuerAuthorityKey: string | null;
}

export interface FxPoolSeed {
  readonly key: string;
  readonly baseCurrencyKey: string;
  readonly quoteCurrencyKey: string;
  readonly cash: Readonly<Record<string, number>>;
  readonly spotRateQuotePerBase: number;
  readonly targetBaseReserveShare: number;
  readonly flowPressureEma: number;
  readonly transactionSpread: number;
  readonly minOperationalReserveBase: number;
  readonly minOperationalReserveQuote: number;
  readonly maxRateMovePerTick: number;
}

export interface MonetaryAuthoritySeed {
  readonly key: string;
  readonly currencyKey: string;
  readonly memberStateKeys: readonly string[];
  readonly wallet: Readonly<Record<string, number>>;
  readonly policyRateAnnual?: number;
  readonly fxPools: readonly FxPoolSeed[];
}

export interface ClanPreferenceState {}

export interface ClanStateRelationSeed {}

export interface ClanSeed {
  readonly key: string;
  readonly name: string;
  readonly treasury: Readonly<Record<string, number>>;
  readonly preferences: ClanPreferenceState;
  readonly initialRelations?: Readonly<Record<string, ClanStateRelationSeed>>;
}

export interface CohortSeed {
  readonly key: string;
  readonly regionKey: string;
  readonly clanKey: string;
  readonly ageBand: "CHILD" | "WORKING" | "ELDER";
  readonly stratum: "VULNERABLE" | "WORKING_MIDDLE" | "AFFLUENT";
  /** Baseline value is `GENERAL`; other categories land with the labor requirement. */
  readonly laborCategory: string;
  readonly population: number;
  readonly wallet: Readonly<Record<string, number>>;
  readonly householdInventory: Readonly<Record<string, number>>;
  /** `[0,1]`. */
  readonly healthIndex: number;
  /** `[0,1]`. */
  readonly prosperityEma: number;
  /** `[0,1]`. */
  readonly essentialSatisfactionEma: number;
  /** Normalized, `>= 0`. */
  readonly realIncomePerCapitaEma: number;
  /** `[0,1]`. */
  readonly employmentRateEma: number;
  /** Bounded `[-1,1]`. */
  readonly migrationPressureEma: number;
  /** Bounded `[-1,1]`. */
  readonly mobilityAccumulator: number;
  /** Settlement-currency units per worker-equivalent per tick. */
  readonly wageSignal: number;
}

export interface ProductionUnitSeed {
  readonly key: string;
  readonly regionKey: string;
  readonly owner:
    | { readonly type: "CLAN"; readonly key: string }
    | { readonly type: "STATE"; readonly key: string };
  readonly recipeId: string;
  readonly status: "ACTIVE" | "PLANNED" | "MOTHBALLED";
  readonly wallet: Readonly<Record<string, number>>;
  readonly inputInventory: Readonly<Record<string, number>>;
  readonly outputInventory: Readonly<Record<string, number>>;
  readonly investmentInventory?: Readonly<Record<string, number>>;
  readonly installedCapital: number;
  readonly condition: number;
  readonly wageOffer?: number;
}

export interface MarketSeed {
  readonly regionKey: string;
  readonly initialPriceByGood: Readonly<Record<string, number>>;
}

/** Concrete fields land with world genesis (section 16, bond opening positions). */
export interface BondSeed {}

/** Concrete fields land with world genesis (section 16, initial scheduled events). */
export interface InitialEventSeed {}

export interface ScenarioVariationConfig {
  readonly enabled: boolean;
  readonly populationFactorRange?: readonly [number, number];
  readonly depositQuantityFactorRange?: readonly [number, number];
  readonly startingInventoryFactorRange?: readonly [number, number];
  readonly startingCashFactorRange?: readonly [number, number];
  readonly infrastructureFactorRange?: readonly [number, number];
}

export interface ScenarioDefinition {
  readonly id: string;
  readonly version: string;
  readonly name: string;
  readonly description: string;
  readonly definitionPackId: string;
  readonly geography: readonly RegionSeed[];
  readonly transportLinks: readonly TransportLinkSeed[];
  readonly states: readonly StateSeed[];
  readonly currencies: readonly CurrencySeed[];
  readonly monetaryAuthorities: readonly MonetaryAuthoritySeed[];
  readonly clans: readonly ClanSeed[];
  readonly cohorts: readonly CohortSeed[];
  readonly productionUnits: readonly ProductionUnitSeed[];
  readonly markets?: readonly MarketSeed[];
  readonly bonds?: readonly BondSeed[];
  readonly initialEvents?: readonly InitialEventSeed[];
  readonly variation?: ScenarioVariationConfig;
}

/**
 * Every key section 2's `ScenarioDefinition` interface declares. `markets` and
 * `clans` also happen to be `SimulationConfig` behavioral-key names (section 2's
 * two hierarchies were not designed to avoid key-name collisions) — an array
 * value there is the legitimate seed-list field; a plain-object value is a
 * smuggled `MarketConfig`/`ClanConfig` behavioral patch. See
 * `./validation.ts`'s `assertNoBehavioralOverrides`, which is the actual
 * mechanical proof that scenario-specific behavioral overrides are rejected.
 */
export const SCENARIO_DEFINITION_KEYS = [
  "id",
  "version",
  "name",
  "description",
  "definitionPackId",
  "geography",
  "transportLinks",
  "states",
  "currencies",
  "monetaryAuthorities",
  "clans",
  "cohorts",
  "productionUnits",
  "markets",
  "bonds",
  "initialEvents",
  "variation",
] as const satisfies readonly (keyof ScenarioDefinition)[];
