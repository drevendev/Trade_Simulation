/**
 * SimulationConfig layer (REQ-CONFIG-001).
 *
 * See `docs/spec/mirror/06 - Handoff/03 — CANONICAL_CONFIG_AND_WORLD_GENERATION.md`
 * section 2: "SimulationConfig owns reusable behavioral tuning" shared across
 * scenarios. Each of the thirteen sub-config types below is a named placeholder —
 * its concrete field-level defaults (sections 3-14 of that document) land with the
 * requirement that owns the corresponding subsystem (M3-M10), not with this
 * scaffolding requirement. Declaring them now, rather than inlining `unknown`,
 * is what makes `SimulationConfig` a real distinct type today and lets later
 * requirements add fields without touching this file's shape.
 */

import { createDefaultPopulationConfig } from "./m4PopulationDefaults";

/** Concrete fields land with the numeric-tolerance requirement that owns them (section 3). */
export interface NumericConfig {
  readonly moneyEpsilon?: number;
  readonly quantityEpsilon?: number;
  readonly populationEpsilon?: number;
  readonly rateEpsilon?: number;
  readonly reconciliationRelativeTolerance?: number;
  readonly maxFiniteMagnitude?: number;
}

/** Concrete fields land with the cadence-scheduling requirement that owns them (section 3). */
export interface CadenceConfig {}

/** Concrete fields land with the markets requirement that owns them (section 4). */
export interface MarketConfig {
  readonly shortageSignalWeight?: number;
  readonly inventorySignalWeight?: number;
  readonly basePriceAdjustmentSpeed?: number;
  readonly maxAbsoluteLogPriceMovePerTick?: number;
  readonly targetInventoryCoverageTicks?: number;
  readonly expectationAlpha?: number;
}

/**
 * M5 transport/trade/FX configuration (REQ-CONFIG-008 / REQ-CONFIG-009).
 *
 * Baseline values are owned by Handoff/03 section 5. Link-specific route topology,
 * fee receivers and optional ordinary attrition remain ScenarioDefinition data;
 * pair-specific base/quote direction and opening FX reserves remain FxPoolSeed data.
 */
export interface TradeConfig {
  readonly transportCapacityUtilizationTarget?: number;
  readonly transportConditionMinimum?: number;
  readonly shipmentMinimumQuantity?: number;
  readonly tradeOpportunityMinimumMarginShare?: number;
  readonly tradeOpportunityMaximumRoutesPerGoodPerRegion?: number;
  readonly maxExportShareOfAvailableSurplus?: number;
  readonly defaultTransitTicksPerLink?: number;
  readonly shipmentLossFromOrdinaryTrade?: number;
  readonly fxReservationSafetyShare?: number;
  readonly fxRateAdjustmentSpeed?: number;
  readonly fxMaxAbsoluteLogMovePerTick?: number;
  readonly fxMinimumPoolReserve?: number;
}

/**
 * M4 production and capital controls (REQ-CONFIG-006).
 *
 * The field list is section 37 "Configuration surface" of
 * `06 - Handoff/05 — PRODUCTION_CAPITAL_LABOR_CONTRACTS.md`; the baseline values
 * are section 6 "Production defaults" of
 * `06 - Handoff/03 — CANONICAL_CONFIG_AND_WORLD_GENERATION.md`, which
 * `HANDOFF-REPAIR-005`/`-010` establish as the sole owner of `SimulationConfig`
 * baseline numbers. `HANDOFF-REPAIR-M4-002` completed the eleven section-37
 * production values that Q-001 had left open; all section-37 production controls
 * now have canonical M4 defaults and are validated here.
 *
 * Section 37: "Scenario RecipeDefinitions own recipe-specific coefficients and
 * depreciation. State policy owns minimum wage/taxes/ownership gates. MarketConfig
 * owns prices/clearing. Do not duplicate those values in ProductionConfig." The
 * quantity tolerance section 37 asks for is `NumericConfig.quantityEpsilon` and is
 * deliberately not restated here; `minimumLifecycleScale` is the capital tolerance.
 */
export interface ProductionConfig {
  /** Utilization a unit plans toward before margin/sell-through/inventory response. */
  readonly baseTargetUtilization?: number;
  /** Lower clamp on planned utilization. Must not exceed `maxTargetUtilization`. */
  readonly minTargetUtilization?: number;
  /** Upper clamp on planned utilization. */
  readonly maxTargetUtilization?: number;
  /** Sensitivity of planned utilization to realized margin. */
  readonly marginResponse?: number;
  /** Sensitivity of planned utilization to realized sell-through. */
  readonly sellThroughResponse?: number;
  /** Sensitivity of planned utilization to output inventory coverage. */
  readonly inventoryResponse?: number;
  /** Sell-through share a unit plans toward. */
  readonly targetSellThrough?: number;
  /** Ticks of output a unit plans to hold. */
  readonly outputCoverageTicks?: number;
  /** Ticks of inputs a unit plans to hold. */
  readonly inputCoverageTicks?: number;
  /** Extra ticks of input cover held as safety stock. */
  readonly inputSafetyCoverageTicks?: number;
  /** EMA smoothing factor for the production planning signal. */
  readonly productionSignalAlpha?: number;
  /** Cash a unit keeps before committing to labor or procurement. */
  readonly minOperatingCash?: number;
  /** Share of cash held back as a liquidity buffer. */
  readonly liquidityBufferShare?: number;
  /** Upper clamp on the input-criticality multiplier. */
  readonly maxInputCriticality?: number;

  /** Ticks between investment reviews. */
  readonly investmentReviewCadenceTicks?: number;
  /** Utilization a unit must exceed to consider investing. */
  readonly investmentUtilizationThreshold?: number;
  /** Margin a unit must exceed to consider investing. */
  readonly minimumInvestmentMargin?: number;
  /** Share of eligible cash a unit directs to investment. */
  readonly investmentPropensity?: number;
  /** Upper clamp on investment as a share of excess cash. */
  readonly maxInvestmentShareOfExcessCash?: number;
  /** Upper clamp on capital growth per investment review. */
  readonly maxCapitalGrowthPerReview?: number;

  /** Ticks between lifecycle reviews. */
  readonly lifecycleReviewCadenceTicks?: number;
  /** Margin below which a review counts as nonviable. */
  readonly mothballMarginThreshold?: number;
  /** Utilization below which a review counts as nonviable. */
  readonly mothballUtilizationThreshold?: number;
  /** Consecutive nonviable reviews before mothballing. Section 6 `mothballAfterNonviableReviews`. */
  readonly mothballAfterReviews?: number;
  /** Margin above which a mothballed review counts as viable. */
  readonly reactivateMarginThreshold?: number;
  /** Consecutive viable reviews before reactivating. Section 6 `reactivateAfterViableReviews`. */
  readonly reactivateAfterReviews?: number;
  /** Consecutive mothballed reviews before closing. Section 6 `closeAfterMothballedReviews`. */
  readonly closeAfterReviews?: number;
  /** Reviews a CLOSING unit is granted before removal. */
  readonly closingGraceReviews?: number;

  /** Capital tolerance: scale below which a unit is lifecycle-negligible. */
  readonly minimumLifecycleScale?: number;
}

/**
 * M4 labor controls (REQ-CONFIG-006).
 *
 * Field list from section 37 of Handoff/05, baseline values from section 7
 * "Labor defaults" of Handoff/03. `HANDOFF-REPAIR-M4-002` completed the three
 * section-37 labor values that Q-001 had left open. Section 37's `laborEpsilon`
 * is deliberately absent: labor is measured in worker-equivalents, a quantity,
 * and `NumericConfig.quantityEpsilon` already owns that tolerance. Section 37:
 * State policy owns minimum wage, taxes and ownership gates, so none appears here.
 */
export interface LaborConfig {
  /** Share of the WORKING population that participates in the labor market. */
  readonly baselineParticipationRate?: number;
  /** Elasticity of labor supply to relative wage attractiveness. */
  readonly laborWageAttractivenessElasticity?: number;
  /** Lower clamp on the wage weight. Must not exceed `maxWageWeight`. */
  readonly minWageWeight?: number;
  /** Upper clamp on the wage weight. */
  readonly maxWageWeight?: number;
  /** Speed at which a sticky wage offer closes on its target. */
  readonly wageAdjustmentSpeed?: number;
  /** Reference wage per worker-equivalent per tick when no scenario value applies. */
  readonly startingReferenceWage?: number;
  /** Regional wage pressure from unemployment. */
  readonly unemploymentWagePressure?: number;
  /** Regional wage pressure from vacancies. */
  readonly vacancyWagePressure?: number;
  /** Lower clamp on the working health factor. Must not exceed `maximumWorkingHealthFactor`. */
  readonly minimumWorkingHealthFactor?: number;
  /** Upper clamp on the working health factor. */
  readonly maximumWorkingHealthFactor?: number;
  /** Labor categories the core baseline allows. Section 7 permits at most three in v1. */
  readonly allowedLaborCategories?: readonly string[];

  /** Upper clamp on a single log wage step; canonical baseline is `ln(1.05)`. */
  readonly maxLogWageStep?: number;
  /** Unit-level wage response to its own vacancies. */
  readonly unitVacancyResponse?: number;
  /** Upper clamp on the labor-market tightness signal. */
  readonly maxTightnessSignal?: number;
}

/**
 * M4 household-demand, participation and welfare-signal controls (REQ-CONFIG-007).
 *
 * The field list is the M4 subset of section 33 "Configuration surface" of
 * `06 - Handoff/06 — POPULATION_DEMOGRAPHY_CLANS_CONTRACTS.md`, spelled as the
 * sections that state each control spell it. HANDOFF-REPAIR-M4-003 reconciles the
 * vocabulary mismatch in Handoff/03 section 8, makes Handoff/03 the sole baseline
 * owner, and supplies the canonical defaults for all twenty controls below. Q-002
 * is answered; demography/migration remain deferred to M8.
 *
 * Deliberately absent, because another owner already holds the value:
 *
 * - `workerEpsilon` (section 9). Workers are measured in worker-equivalents, a
 *   quantity, and `NumericConfig.quantityEpsilon` owns that tolerance —
 *   `HANDOFF-REPAIR-010` states the precedent and #528 applied it to `laborEpsilon`.
 * - The `P_raw` prosperity weights (section 10). Section 33 enumerates what
 *   `PopulationConfig` must centralize and prosperity weights are not in it; they
 *   are stated inline as coefficients summing to 1.0, and section 33's "Scenario
 *   files may override values but may not introduce new bespoke formulas without
 *   schema version change" is exactly what a scenario-tunable weight vector would
 *   defeat. They belong to the requirement that owns the welfare formula.
 * - `NeedCategoryDefinition` instances. Handoff/03 section 8: "Need quantities,
 *   nutrition/health contribution, spoilage and substitute groups belong to
 *   GoodDefinition/NeedDefinition, not global config." The shape lives with the
 *   other per-definition registries in `./definitionPack.ts`.
 *
 * Demography, migration, mobility and every `ClanConfig` control are deferred by
 * this requirement's own statement and are absent; `EXECUTION_ORDER.md` puts them
 * in M6 and M8.
 */
export interface PopulationConfig {
  /** Section 4: cash per person a cohort reserves before planning consumption. */
  readonly minHouseholdCashPerCapita?: number;
  /** Section 4: share of opening home cash a cohort reserves, whichever floor binds. */
  readonly liquidityFloorShare?: number;

  /**
   * Section 8: participation before health, law and opportunity factors, keyed by
   * cohort stratum. HANDOFF-REPAIR-M4-003 makes this map the canonical M4
   * participation baseline; the older LaborConfig scalar is not a second owner.
   */
  readonly baseParticipationByStratum?: Readonly<Record<string, number>>;
  /** Section 8: lower clamp on participation. Must not exceed `maxParticipation`. */
  readonly minParticipation?: number;
  /** Section 8: upper clamp on participation. */
  readonly maxParticipation?: number;
  /**
   * Section 8: lower clamp on `healthParticipationFactor`, whose recommended range
   * is `[0.75, 1.02]`. Distinct from `LaborConfig.minimumWorkingHealthFactor`,
   * which bounds the Production `healthLaborProductivityFactor` (section 11).
   */
  readonly minHealthParticipationFactor?: number;
  /** Section 8: upper clamp on `healthParticipationFactor`. */
  readonly maxHealthParticipationFactor?: number;
  /** Section 8: lower clamp on the EMA-based `weakOpportunityFactor`. */
  readonly minWeakOpportunityFactor?: number;
  /** Section 8: upper clamp on `weakOpportunityFactor`. */
  readonly maxWeakOpportunityFactor?: number;

  /**
   * Section 9: smoothing factor of the log-space wage-signal update. Section 8 of
   * Handoff/03 spells it `wageSignalAlpha`; the section 9 formula
   * `wageSignal × exp(speed × ln(target/wageSignal))` *is* a geometric EMA with
   * that smoothing factor, and neither section declares a second wage-signal
   * smoothing control, so the mapping is forced rather than chosen.
   */
  readonly wageSignalAdjustmentSpeed?: number;
  /** Section 9: upper clamp on one log step of the cohort wage signal. */
  readonly maxWageSignalStep?: number;

  /** Section 10: EMA alpha for `prosperityEma`. */
  readonly prosperityAlpha?: number;
  /** Section 10: EMA alpha for `essentialSatisfactionEma`. */
  readonly essentialAlpha?: number;
  /** Section 10: EMA alpha for `realIncomePerCapitaEma`. */
  readonly incomeAlpha?: number;
  /** Section 10: EMA alpha for `employmentRateEma`. */
  readonly employmentAlpha?: number;
  /** Section 10: scale of `saturatingNormalize` on real income per capita. */
  readonly scenarioRealIncomeScale?: number;

  /** Section 11: health gained per unit of essential satisfaction above threshold. */
  readonly healthRecoveryRate?: number;
  /** Section 11: essential satisfaction at which health neither rises nor falls. */
  readonly healthMaintenanceThreshold?: number;
  /** Section 11: health gained per unit of service coverage above baseline. */
  readonly serviceHealthRate?: number;
  /** Section 11: service coverage at which services neither help nor harm health. */
  readonly serviceBaseline?: number;
}

/** Concrete fields land with the clans requirement that owns them (section 9). */
export interface ClanConfig {}

/** Concrete fields land with the fiscal requirement that owns them (section 10). */
export interface FiscalConfig {}

/** Concrete fields land with the monetary requirement that owns them (section 11). */
export interface MonetaryConfig {}

/** Concrete fields land with the expansion requirement that owns them (section 12). */
export interface ExpansionConfig {}

/** Concrete fields land with the events requirement that owns them (section 13). */
export interface EventConfig {}

/** Concrete fields land with the performance requirement that owns them (section 14). */
export interface PerformanceConfig {}

/**
 * The thirteen behavioral-tuning keys `SimulationConfig` owns, exactly as named
 * in section 2. Scenario data may never carry one of these keys directly — see
 * `./validation.ts`'s `assertNoBehavioralOverrides`.
 */
export const SIMULATION_CONFIG_BEHAVIORAL_KEYS = [
  "numeric",
  "cadence",
  "markets",
  "trade",
  "production",
  "labor",
  "population",
  "clans",
  "fiscal",
  "monetary",
  "expansion",
  "events",
  "performance",
] as const satisfies readonly (keyof Omit<SimulationConfig, "configVersion">)[];

export interface SimulationConfig {
  readonly configVersion: string;
  readonly numeric: NumericConfig;
  readonly cadence: CadenceConfig;
  readonly markets: MarketConfig;
  readonly trade: TradeConfig;
  readonly production: ProductionConfig;
  readonly labor: LaborConfig;
  readonly population: PopulationConfig;
  readonly clans: ClanConfig;
  readonly fiscal: FiscalConfig;
  readonly monetary: MonetaryConfig;
  readonly expansion: ExpansionConfig;
  readonly events: EventConfig;
  readonly performance: PerformanceConfig;
}

export function createDefaultSimulationConfig(): SimulationConfig {
  return {
    configVersion: "1.0.0",
    numeric: {
      moneyEpsilon: 1e-9,
      quantityEpsilon: 1e-9,
      populationEpsilon: 1e-6,
      rateEpsilon: 1e-12,
      reconciliationRelativeTolerance: 1e-9,
      maxFiniteMagnitude: 1e15,
    },
    cadence: {},
    markets: {
      shortageSignalWeight: 0.65,
      inventorySignalWeight: 0.35,
      basePriceAdjustmentSpeed: 0.12,
      maxAbsoluteLogPriceMovePerTick: 0.18,
      targetInventoryCoverageTicks: 1.0,
      expectationAlpha: 0.25,
    },
    // Handoff/03 section 5: canonical M5 transport/trade/FX baseline.
    trade: {
      transportCapacityUtilizationTarget: 0.8,
      transportConditionMinimum: 0.05,
      shipmentMinimumQuantity: 1e-6,
      tradeOpportunityMinimumMarginShare: 0.03,
      tradeOpportunityMaximumRoutesPerGoodPerRegion: 4,
      maxExportShareOfAvailableSurplus: 0.5,
      defaultTransitTicksPerLink: 1,
      shipmentLossFromOrdinaryTrade: 0,
      fxReservationSafetyShare: 0.02,
      fxRateAdjustmentSpeed: 0.08,
      fxMaxAbsoluteLogMovePerTick: 0.12,
      fxMinimumPoolReserve: 1e-6,
    },
    // Handoff/03 section 6 "Production defaults", completed by HANDOFF-REPAIR-M4-002.
    production: {
      baseTargetUtilization: 0.7,
      minTargetUtilization: 0.1,
      maxTargetUtilization: 1.0,
      targetSellThrough: 0.8,
      marginResponse: 0.15,
      sellThroughResponse: 0.2,
      inventoryResponse: 0.25,
      outputCoverageTicks: 0.75,
      inputCoverageTicks: 1.0,
      inputSafetyCoverageTicks: 0.5,
      productionSignalAlpha: 0.25,
      liquidityBufferShare: 0.1,
      minOperatingCash: 0,
      maxInputCriticality: 4.0,
      investmentReviewCadenceTicks: 3,
      investmentUtilizationThreshold: 0.75,
      minimumInvestmentMargin: 0.05,
      investmentPropensity: 0.35,
      maxInvestmentShareOfExcessCash: 0.5,
      maxCapitalGrowthPerReview: 0.25,
      lifecycleReviewCadenceTicks: 3,
      mothballMarginThreshold: -0.1,
      mothballUtilizationThreshold: 0.25,
      mothballAfterReviews: 3,
      reactivateMarginThreshold: 0.05,
      reactivateAfterReviews: 2,
      closeAfterReviews: 8,
      closingGraceReviews: 4,
      minimumLifecycleScale: 1e-6,
    },
    // Handoff/03 section 7 "Labor defaults", completed by HANDOFF-REPAIR-M4-002.
    labor: {
      baselineParticipationRate: 0.7,
      laborWageAttractivenessElasticity: 0.5,
      minWageWeight: 0.5,
      maxWageWeight: 2.0,
      wageAdjustmentSpeed: 0.1,
      startingReferenceWage: 10,
      unemploymentWagePressure: 0.4,
      vacancyWagePressure: 0.4,
      minimumWorkingHealthFactor: 0.5,
      maximumWorkingHealthFactor: 1.05,
      allowedLaborCategories: ["GENERAL"],
      maxLogWageStep: Math.log(1.05),
      unitVacancyResponse: 0.02,
      maxTightnessSignal: 2.0,
    },
    // The twenty canonical M4 controls of HANDOFF-REPAIR-M4-003 (Q-002, answered),
    // built fresh on every call by `createDefaultPopulationConfig()`.
    population: createDefaultPopulationConfig(),
    clans: {},
    fiscal: {},
    monetary: {},
    expansion: {},
    events: {},
    performance: {},
  };
}
