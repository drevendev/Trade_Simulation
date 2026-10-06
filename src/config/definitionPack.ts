/**
 * DefinitionPack layer (REQ-CONFIG-001; `GoodDefinition` and `RecipeDefinition` shapes REQ-CONFIG-003).
 *
 * See `docs/spec/mirror/06 - Handoff/03 — CANONICAL_CONFIG_AND_WORLD_GENERATION.md`
 * section 2: "DefinitionPack owns immutable type definitions and recipes."
 * Section 16A gives the RecipeDefinition shape; it mirrors the contract from
 * PRODUCTION_CAPITAL_LABOR_CONTRACTS.md. Types owned by later requirements remain
 * empty placeholders below.
 */
import type { GoodId } from "../domain/id";

/**
 * Section 15's bullet list, field for field. `consumerNeedCategory` has no
 * enumerated vocabulary in this anchor document, so it is a nullable string
 * rather than an invented literal union. `necessityWeight` and
 * `substitutionGroup` are optional per the same section's "where consumed by
 * households" qualifier; `capitalInfrastructureEligibilityTags` is optional
 * per its own "where relevant" qualifier.
 */
export interface GoodDefinition {
  readonly id: GoodId;
  readonly name: string;
  readonly unitLabel: string;
  readonly spoilageRatePerTick: number;
  readonly consumerNeedCategory: string | null;
  readonly necessityWeight?: number;
  readonly substitutionGroup?: string;
  /** Initialization/diagnostics only — never an equilibrium anchor. */
  readonly referencePrice: number;
  readonly tradable: boolean;
  /**
   * Cargo-capacity units consumed by one physical unit in M5 transport.
   * Required and strictly positive for every tradable good in a world with active
   * TransportLinks; optional only so no-trade M0-M4/manual fixtures stay representable.
   */
  readonly cargoWeightPerUnit?: number;
  readonly capitalInfrastructureEligibilityTags?: readonly string[];
}

/**
 * Section 16A: M1 executable initialization boundary (REQ-CONFIG-003).
 * RecipeDefinition is immutable DefinitionPack data. Its M1 field shape is
 * the same definition-data contract owned by PRODUCTION_CAPITAL_LABOR_CONTRACTS.
 * Validation requires: positive output and batches-per-capital-unit, non-negative
 * input/labor/startup-capital quantities, [0,1] infrastructure factor where
 * present, positive extraction amount when an extraction resource is named,
 * positive baseThroughputFactor, and depreciationRatePerTick in [0,1).
 */
export interface RecipeDefinition {
  readonly id: string;
  readonly outputGoodId: GoodId;
  readonly outputPerBatch: number;
  readonly inputsPerBatch: Readonly<Record<GoodId, number>>;
  readonly laborCategory: string;
  readonly laborPerBatch: number;
  readonly batchesPerCapitalUnit: number;
  readonly investmentGoodsPerCapitalUnit: Readonly<Record<GoodId, number>>;
  readonly minimumStartupCapital: number;
  readonly infrastructureCategory?: string;
  readonly minimumInfrastructureFactor?: number;
  readonly extractionResourceId?: string;
  readonly extractedResourcePerBatch?: number;
  readonly baseThroughputFactor: number;
  readonly depreciationRatePerTick: number;
}

/**
 * Section 4 of `06 - Handoff/06 — POPULATION_DEMOGRAPHY_CLANS_CONTRACTS.md`, field
 * for field (REQ-CONFIG-007).
 *
 * Section 33 of that document says `PopulationConfig` must centralize "need
 * category definitions", while section 4 puts them on
 * `DefinitionRegistry.needCategories`. Section 8 of Handoff/03 decides it: "Need
 * quantities, nutrition/health contribution, spoilage and substitute groups belong
 * to GoodDefinition/NeedDefinition, not global config." So the instances are
 * immutable pack data, exactly like `RecipeDefinition`, and `PopulationConfig`
 * keeps the global household-demand controls that are not per-category.
 *
 * `priceSensitivity` is the per-category exponent of the section 5 substitution
 * formula, which is why it is here rather than as one global elasticity.
 */
export interface NeedCategoryDefinition {
  readonly id: string;
  readonly perCapitaTarget: number;
  readonly priority: number;
  readonly minimumBudgetShare?: number;
  readonly substitutionGoods: readonly {
    readonly goodId: GoodId;
    readonly basePreference: number;
    readonly qualityFactor: number;
  }[];
  readonly priceSensitivity: number;
  readonly inventoryCarryoverTicks: number;
}

/**
 * Section 4: "DefinitionRegistry.needCategories must support exactly four baseline
 * categories". A pack that declares `needCategories` declares exactly these.
 */
export const BASELINE_NEED_CATEGORY_IDS = [
  "ESSENTIAL_FOOD",
  "BASIC_GOODS",
  "SERVICES",
  "COMFORT",
] as const;

/** Concrete fields land with the events requirement that owns event definitions (section 13). */
export interface EventDefinition {}

/** Concrete fields land with whichever requirement first defines a derived diagnostic metric. */
export interface MetricDefinition {}

export interface DefinitionPack {
  readonly id: string;
  readonly version: string;
  readonly goods: Readonly<Record<GoodId, GoodDefinition>>;
  readonly recipes: Readonly<Record<string, RecipeDefinition>>;
  /**
   * Optional: a pack that runs no household demand declares none. When present it
   * carries exactly the four `BASELINE_NEED_CATEGORY_IDS` — see
   * `validateDefinitionPack`. REQ-CONFIG-007 declares the shape and its bounds; no
   * baseline instance is authored here, because no document reachable from that
   * requirement states a `perCapitaTarget`, `priceSensitivity` or
   * `inventoryCarryoverTicks` (`docs/spec/OPEN_QUESTIONS.md`, Q-002).
   */
  readonly needCategories?: Readonly<Record<string, NeedCategoryDefinition>>;
  readonly eventDefinitions: Readonly<Record<string, EventDefinition>>;
  readonly metricDefinitions: Readonly<Record<string, MetricDefinition>>;
}
