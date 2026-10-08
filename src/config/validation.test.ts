import { describe, expect, it } from "vitest";

import type { GoodDefinition } from "./definitionPack";
import type { GoodId } from "../domain/id";
import type {
  ClanSeed,
  CohortSeed,
  CurrencyRegimeSeed,
  CurrencySeed,
  MarketSeed,
  MonetaryAuthoritySeed,
  ProductionUnitSeed,
  RegionSeed,
  ScenarioDefinition,
  ScenarioVariationConfig,
  StateSeed,
  TransportLinkSeed,
} from "./scenarioDefinition";
import {
  assertNoBehavioralOverrides,
  validateDefinitionPack,
  validateLaborConfig,
  validatePopulationConfig,
  validateProductionConfig,
  validateScenarioContent,
} from "./validation";
import type { DefinitionPack, NeedCategoryDefinition, RecipeDefinition } from "./definitionPack";
import { BASELINE_NEED_CATEGORY_IDS } from "./definitionPack";
import { createDefaultSimulationConfig } from "./simulationConfig";
import type {
  LaborConfig,
  MarketConfig,
  NumericConfig,
  PopulationConfig,
  ProductionConfig,
} from "./simulationConfig";

/**
 * Every control section 33 puts on `PopulationConfig`, named once so the tests that
 * depend on the surface do not each re-derive it from `Object.keys()` of the defaults.
 *
 * Keep this list independent of `Object.keys()` so the ownership and completeness
 * controls remain sensitive to the declared interface even if runtime construction
 * changes. HANDOFF-REPAIR-M4-003 now materializes all twenty controls by default.
 */
const M4_POPULATION_CONTROLS = [
  "minHouseholdCashPerCapita",
  "liquidityFloorShare",
  "baseParticipationByStratum",
  "minParticipation",
  "maxParticipation",
  "minHealthParticipationFactor",
  "maxHealthParticipationFactor",
  "minWeakOpportunityFactor",
  "maxWeakOpportunityFactor",
  "wageSignalAdjustmentSpeed",
  "maxWageSignalStep",
  "prosperityAlpha",
  "essentialAlpha",
  "incomeAlpha",
  "employmentAlpha",
  "scenarioRealIncomeScale",
  "healthRecoveryRate",
  "healthMaintenanceThreshold",
  "serviceHealthRate",
  "serviceBaseline",
] as const satisfies readonly (keyof PopulationConfig)[];

/**
 * Compile-time completeness: `satisfies` above proves every listed name is a real
 * `PopulationConfig` key, and this proves the converse — that the interface declares
 * no key the list omits. Adding a control to `PopulationConfig` without adding it here
 * fails `npm run typecheck` with the missing name in the message, so the list cannot
 * silently drift out of date the way a hand-counted "nineteen" did.
 */
type UnlistedPopulationControl = Exclude<keyof PopulationConfig, (typeof M4_POPULATION_CONTROLS)[number]>;
const _everyPopulationControlIsListed: UnlistedPopulationControl extends never
  ? true
  : UnlistedPopulationControl = true;
void _everyPopulationControlIsListed;

/**
 * The ownership negative control for acceptance criterion 6, at the type level.
 *
 * `HANDOFF-REPAIR-010` forbids a second owner for a value another config block already
 * holds. Checked at the type level so the *declared* surfaces must stay disjoint even
 * if runtime construction changes. Declaring `baselineParticipationRate` on
 * `PopulationConfig`, which `LaborConfig` already owns, fails `npm run typecheck` here
 * and names the key.
 */
type SiblingOwnedConfigKey = keyof LaborConfig | keyof MarketConfig | keyof NumericConfig | keyof ProductionConfig;
type DuplicatedConfigOwner = Extract<keyof PopulationConfig, SiblingOwnedConfigKey>;
const _populationOwnsNoSiblingKey: DuplicatedConfigOwner extends never ? true : DuplicatedConfigOwner = true;
void _populationOwnsNoSiblingKey;

/** A minimal, well-formed `ScenarioDefinition`-shaped object (required keys only). */
function minimalScenario(): Record<string, unknown> {
  return {
    id: "baseline-multistate-v1",
    version: "1.0.0",
    name: "Baseline multistate",
    description: "Canonical baseline scenario",
    definitionPackId: "baseline-pack-v1",
    geography: [],
    transportLinks: [],
    states: [],
    currencies: [],
    monetaryAuthorities: [],
    clans: [],
    cohorts: [],
    productionUnits: [],
  };
}

describe("assertNoBehavioralOverrides", () => {
  it("accepts a minimal well-formed ScenarioDefinition-shaped object", () => {
    expect(() => assertNoBehavioralOverrides(minimalScenario())).not.toThrow();
  });

  it("accepts the legitimate markets and clans seed-array fields", () => {
    const scenario = {
      ...minimalScenario(),
      markets: [{ regionKey: "r-1", initialPriceByGood: {} }],
      clans: [{ key: "c-1" }],
    };
    expect(() => assertNoBehavioralOverrides(scenario)).not.toThrow();
  });

  it("rejects a scenario patched with a SimulationConfig-owned numeric key", () => {
    const scenario = { ...minimalScenario(), numeric: { moneyEpsilon: 1e-9 } };
    expect(() => assertNoBehavioralOverrides(scenario)).toThrow(
      /SimulationConfig-owned behavioral key "numeric"/,
    );
  });

  it("rejects a scenario patched with an object-shaped markets behavioral override", () => {
    const scenario = { ...minimalScenario(), markets: { basePriceAdjustmentSpeed: 0.12 } };
    expect(() => assertNoBehavioralOverrides(scenario)).toThrow(
      /SimulationConfig-owned behavioral key "markets"/,
    );
  });

  it("rejects a scenario patched with an object-shaped clans behavioral override", () => {
    const scenario = { ...minimalScenario(), clans: { loyaltyAdjustmentSpeed: 0.05 } };
    expect(() => assertNoBehavioralOverrides(scenario)).toThrow(
      /SimulationConfig-owned behavioral key "clans"/,
    );
  });

  it("rejects a scenario carrying an arbitrary unknown key", () => {
    const scenario = { ...minimalScenario(), notARealField: true };
    expect(() => assertNoBehavioralOverrides(scenario)).toThrow(
      /unknown key "notARealField"/,
    );
  });

  it("rejects a non-object candidate", () => {
    expect(() => assertNoBehavioralOverrides(null)).toThrow(/must be a plain object/);
    expect(() => assertNoBehavioralOverrides([])).toThrow(/must be a plain object/);
    expect(() => assertNoBehavioralOverrides("scenario")).toThrow(/must be a plain object/);
  });

  // REQ-CONFIG-003: giving the seed/GoodDefinition placeholders concrete field
  // shapes must not disturb this REQ-CONFIG-001 key-membership check, since it
  // only inspects ScenarioDefinition's own top-level keys.
  it("accepts a fixture combining one instance of every newly-shaped seed and GoodDefinition type", () => {
    const region: RegionSeed = {
      key: "region-1",
      name: "Riverbend",
      controllerStateKey: "state-1",
      settlementCurrencyKey: "currency-1",
      settlementLevel: 3,
      infrastructure: { road: 0.6 },
      climateHabitabilityInputs: { rainfall: 0.5 },
      deposits: [{ resourceId: "iron-ore", initialQuantity: 1000, initiallyKnown: true }],
    };

    const transportLink: TransportLinkSeed = {
      key: "link-1",
      fromRegionKey: "region-1",
      toRegionKey: "region-2",
      distance: 120,
      baseCapacity: 50,
      condition: 0.9,
      baseTransportCost: 1.5,
    };

    const currencyRegime: CurrencyRegimeSeed = {
      currencyKey: "currency-1",
      regimeType: "INDEPENDENT_FLOAT",
      policyAuthorityKey: "state-1",
    };

    const state: StateSeed = {
      key: "state-1",
      name: "Rivercountry",
      treasury: { "currency-1": 10000 },
      publicInventory: { food: 500 },
      policy: {},
      effectiveCurrencyRegime: currencyRegime,
    };

    const currency: CurrencySeed = {
      key: "currency-1",
      code: "RVB",
      issuerAuthorityKey: "state-1",
    };

    const monetaryAuthority: MonetaryAuthoritySeed = {
      key: "cb-1",
      currencyKey: "currency-1",
      memberStateKeys: ["state-1"],
      wallet: { "currency-1": 50000 },
      policyRateAnnual: 0.03,
      fxPools: [],
    };

    const clan: ClanSeed = {
      key: "clan-1",
      name: "Merchant House",
      treasury: { "currency-1": 5000 },
      preferences: {},
      initialRelations: {},
    };

    const cohort: CohortSeed = {
      key: "cohort-1",
      regionKey: "region-1",
      clanKey: "clan-1",
      ageBand: "WORKING",
      stratum: "WORKING_MIDDLE",
      laborCategory: "GENERAL",
      population: 400,
      wallet: { "currency-1": 500 },
      householdInventory: { food: 20 },
      healthIndex: 0.8,
      prosperityEma: 0.5,
      essentialSatisfactionEma: 0.7,
      realIncomePerCapitaEma: 12,
      employmentRateEma: 0.9,
      migrationPressureEma: 0,
      mobilityAccumulator: 0,
      wageSignal: 2.5,
    };

    const productionUnit: ProductionUnitSeed = {
      key: "unit-1",
      regionKey: "region-1",
      owner: { type: "CLAN", key: "clan-1" },
      recipeId: "recipe-1",
      status: "ACTIVE",
      wallet: { "currency-1": 1000 },
      inputInventory: { "iron-ore": 50 },
      outputInventory: { tools: 5 },
      installedCapital: 10,
      condition: 0.95,
    };

    const market: MarketSeed = {
      regionKey: "region-1",
      initialPriceByGood: { food: 2 },
    };

    const variation: ScenarioVariationConfig = {
      enabled: true,
      populationFactorRange: [0.9, 1.1],
    };

    const goodDefinition: GoodDefinition = {
      id: "good:1" as unknown as GoodId,
      name: "Food",
      unitLabel: "unit",
      spoilageRatePerTick: 0.02,
      consumerNeedCategory: "SUBSISTENCE",
      necessityWeight: 1,
      substitutionGroup: "staple-food",
      referencePrice: 2,
      tradable: true,
    };

    const scenario = {
      ...minimalScenario(),
      geography: [region],
      transportLinks: [transportLink],
      states: [state],
      currencies: [currency],
      monetaryAuthorities: [monetaryAuthority],
      clans: [clan],
      cohorts: [cohort],
      productionUnits: [productionUnit],
      markets: [market],
      variation,
    };

    expect(() => assertNoBehavioralOverrides(scenario)).not.toThrow();
    // The fixture exercises every new type's concrete fields, including the
    // standalone CurrencyRegimeSeed and the new StateSeed, MonetaryAuthoritySeed,
    // and ClanSeed types. GoodDefinition (part of DefinitionPack, not
    // ScenarioDefinition) is also exercised.
    expect(currencyRegime.regimeType).toBe("INDEPENDENT_FLOAT");
    expect(state.key).toBe("state-1");
    expect(monetaryAuthority.memberStateKeys).toContain("state-1");
    expect(clan.name).toBe("Merchant House");
    expect(goodDefinition.tradable).toBe(true);
  });
});

describe("validateScenarioContent", () => {
  function createScenario(overrides: Record<string, unknown>): ScenarioDefinition {
    return {
      id: "test-scenario",
      version: "1.0.0",
      name: "Test",
      description: "Test",
      definitionPackId: "test-pack",
      geography: [],
      transportLinks: [],
      states: [],
      currencies: [],
      monetaryAuthorities: [],
      clans: [],
      cohorts: [],
      productionUnits: [],
      ...overrides,
    } as unknown as ScenarioDefinition;
  }

  it("accepts a minimal well-formed scenario", () => {
    const scenario = createScenario({
      geography: [
        {
          key: "r-1",
          name: "Region 1",
          controllerStateKey: null,
          settlementCurrencyKey: "c-1",
          settlementLevel: 1,
          infrastructure: {},
          climateHabitabilityInputs: {},
          deposits: [],
        },
      ],
      currencies: [{ key: "c-1", code: "CUR", issuerAuthorityKey: null }],
    });
    expect(() => validateScenarioContent(scenario)).not.toThrow();
  });

  it("rejects a region with invalid controllerStateKey", () => {
    const scenario = createScenario({
      geography: [
        {
          key: "r-1",
          name: "Region 1",
          controllerStateKey: "nonexistent",
          settlementCurrencyKey: "c-1",
          settlementLevel: 1,
          infrastructure: {},
          climateHabitabilityInputs: {},
          deposits: [],
        },
      ],
      currencies: [{ key: "c-1", code: "CUR", issuerAuthorityKey: null }],
    });
    expect(() => validateScenarioContent(scenario)).toThrow(/controllerStateKey.*non-existent State/);
  });

  it("rejects a region with invalid settlementCurrencyKey", () => {
    const scenario = createScenario({
      geography: [
        {
          key: "r-1",
          name: "Region 1",
          controllerStateKey: null,
          settlementCurrencyKey: "nonexistent",
          settlementLevel: 1,
          infrastructure: {},
          climateHabitabilityInputs: {},
          deposits: [],
        },
      ],
    });
    expect(() => validateScenarioContent(scenario)).toThrow(/settlementCurrencyKey.*non-existent Currency/);
  });

  it("rejects a region with non-finite settlementLevel", () => {
    const scenario = createScenario({
      geography: [
        {
          key: "r-1",
          name: "Region 1",
          controllerStateKey: null,
          settlementCurrencyKey: "c-1",
          settlementLevel: Number.NaN,
          infrastructure: {},
          climateHabitabilityInputs: {},
          deposits: [],
        },
      ],
      currencies: [{ key: "c-1", code: "CUR", issuerAuthorityKey: null }],
    });
    expect(() => validateScenarioContent(scenario)).toThrow(/settlementLevel.*NaN/);
  });

  it("rejects a transport link with invalid region references", () => {
    const scenario = createScenario({
      geography: [
        {
          key: "r-1",
          name: "Region 1",
          controllerStateKey: null,
          settlementCurrencyKey: "c-1",
          settlementLevel: 1,
          infrastructure: {},
          climateHabitabilityInputs: {},
          deposits: [],
        },
      ],
      transportLinks: [
        {
          key: "link-1",
          fromRegionKey: "r-1",
          toRegionKey: "nonexistent",
          distance: 100,
          baseCapacity: 50,
          condition: 0.9,
          baseTransportCost: 1,
        },
      ],
      currencies: [{ key: "c-1", code: "CUR", issuerAuthorityKey: null }],
    });
    expect(() => validateScenarioContent(scenario)).toThrow(/toRegionKey.*non-existent Region/);
  });

  it("rejects a transport link with condition out of [0,1]", () => {
    const scenario = createScenario({
      geography: [
        {
          key: "r-1",
          name: "Region 1",
          controllerStateKey: null,
          settlementCurrencyKey: "c-1",
          settlementLevel: 1,
          infrastructure: {},
          climateHabitabilityInputs: {},
          deposits: [],
        },
        {
          key: "r-2",
          name: "Region 2",
          controllerStateKey: null,
          settlementCurrencyKey: "c-1",
          settlementLevel: 1,
          infrastructure: {},
          climateHabitabilityInputs: {},
          deposits: [],
        },
      ],
      transportLinks: [
        {
          key: "link-1",
          fromRegionKey: "r-1",
          toRegionKey: "r-2",
          distance: 100,
          baseCapacity: 50,
          condition: 1.5,
          baseTransportCost: 1,
        },
      ],
      currencies: [{ key: "c-1", code: "CUR", issuerAuthorityKey: null }],
    });
    expect(() => validateScenarioContent(scenario)).toThrow(/condition.*\[0,1\]/);
  });

  it("rejects a cohort with invalid regionKey", () => {
    const scenario = createScenario({
      geography: [
        {
          key: "r-1",
          name: "Region 1",
          controllerStateKey: null,
          settlementCurrencyKey: "c-1",
          settlementLevel: 1,
          infrastructure: {},
          climateHabitabilityInputs: {},
          deposits: [],
        },
      ],
      currencies: [{ key: "c-1", code: "CUR", issuerAuthorityKey: null }],
      clans: [{ key: "clan-1" } as unknown as CohortSeed],
      cohorts: [
        {
          key: "cohort-1",
          regionKey: "nonexistent",
          clanKey: "clan-1",
          ageBand: "WORKING",
          stratum: "WORKING_MIDDLE",
          laborCategory: "GENERAL",
          population: 100,
          wallet: { "c-1": 1000 },
          householdInventory: {},
          healthIndex: 0.8,
          prosperityEma: 0.5,
          essentialSatisfactionEma: 0.7,
          realIncomePerCapitaEma: 10,
          employmentRateEma: 0.9,
          migrationPressureEma: 0,
          mobilityAccumulator: 0,
          wageSignal: 2,
        } as unknown as CohortSeed,
      ],
    });
    expect(() => validateScenarioContent(scenario)).toThrow(/regionKey.*non-existent Region/);
  });

  it("rejects a cohort with negative population", () => {
    const scenario = createScenario({
      geography: [
        {
          key: "r-1",
          name: "Region 1",
          controllerStateKey: null,
          settlementCurrencyKey: "c-1",
          settlementLevel: 1,
          infrastructure: {},
          climateHabitabilityInputs: {},
          deposits: [],
        },
      ],
      currencies: [{ key: "c-1", code: "CUR", issuerAuthorityKey: null }],
      clans: [{ key: "clan-1" } as unknown as CohortSeed],
      cohorts: [
        {
          key: "cohort-1",
          regionKey: "r-1",
          clanKey: "clan-1",
          ageBand: "WORKING",
          stratum: "WORKING_MIDDLE",
          laborCategory: "GENERAL",
          population: -100,
          wallet: { "c-1": 1000 },
          householdInventory: {},
          healthIndex: 0.8,
          prosperityEma: 0.5,
          essentialSatisfactionEma: 0.7,
          realIncomePerCapitaEma: 10,
          employmentRateEma: 0.9,
          migrationPressureEma: 0,
          mobilityAccumulator: 0,
          wageSignal: 2,
        } as unknown as CohortSeed,
      ],
    });
    expect(() => validateScenarioContent(scenario)).toThrow(/population.*positive/);
  });

  it("rejects a cohort with out-of-range healthIndex", () => {
    const scenario = createScenario({
      geography: [
        {
          key: "r-1",
          name: "Region 1",
          controllerStateKey: null,
          settlementCurrencyKey: "c-1",
          settlementLevel: 1,
          infrastructure: {},
          climateHabitabilityInputs: {},
          deposits: [],
        },
      ],
      currencies: [{ key: "c-1", code: "CUR", issuerAuthorityKey: null }],
      clans: [{ key: "clan-1" } as unknown as CohortSeed],
      cohorts: [
        {
          key: "cohort-1",
          regionKey: "r-1",
          clanKey: "clan-1",
          ageBand: "WORKING",
          stratum: "WORKING_MIDDLE",
          laborCategory: "GENERAL",
          population: 100,
          wallet: { "c-1": 1000 },
          householdInventory: {},
          healthIndex: 1.5,
          prosperityEma: 0.5,
          essentialSatisfactionEma: 0.7,
          realIncomePerCapitaEma: 10,
          employmentRateEma: 0.9,
          migrationPressureEma: 0,
          mobilityAccumulator: 0,
          wageSignal: 2,
        } as unknown as CohortSeed,
      ],
    });
    expect(() => validateScenarioContent(scenario)).toThrow(/healthIndex.*\[0,1\]/);
  });

  it("rejects a production unit with invalid owner reference", () => {
    const scenario = createScenario({
      geography: [
        {
          key: "r-1",
          name: "Region 1",
          controllerStateKey: null,
          settlementCurrencyKey: "c-1",
          settlementLevel: 1,
          infrastructure: {},
          climateHabitabilityInputs: {},
          deposits: [],
        },
      ],
      currencies: [{ key: "c-1", code: "CUR", issuerAuthorityKey: null }],
      clans: [{ key: "clan-1" } as unknown as CohortSeed],
      productionUnits: [
        {
          key: "unit-1",
          regionKey: "r-1",
          owner: { type: "CLAN", key: "nonexistent-clan" },
          recipeId: "recipe-1",
          status: "ACTIVE",
          wallet: {},
          inputInventory: {},
          outputInventory: {},
          installedCapital: 10,
          condition: 0.9,
        } as unknown as ProductionUnitSeed,
      ],
    });
    expect(() => validateScenarioContent(scenario)).toThrow(/owner Clan key.*non-existent Clan/);
  });

  it("rejects a market with zero or negative price", () => {
    const scenario = createScenario({
      geography: [
        {
          key: "r-1",
          name: "Region 1",
          controllerStateKey: null,
          settlementCurrencyKey: "c-1",
          settlementLevel: 1,
          infrastructure: {},
          climateHabitabilityInputs: {},
          deposits: [],
        },
      ],
      currencies: [{ key: "c-1", code: "CUR", issuerAuthorityKey: null }],
      markets: [
        {
          regionKey: "r-1",
          initialPriceByGood: { food: 0 },
        } as unknown as MarketSeed,
      ],
    });
    expect(() => validateScenarioContent(scenario)).toThrow(/initialPriceByGood\["food"\].*positive/);
  });

  it("rejects non-finite values in numeric fields", () => {
    const scenario = createScenario({
      geography: [
        {
          key: "r-1",
          name: "Region 1",
          controllerStateKey: null,
          settlementCurrencyKey: "c-1",
          settlementLevel: 1,
          infrastructure: {},
          climateHabitabilityInputs: {},
          deposits: [],
        },
      ],
      currencies: [{ key: "c-1", code: "CUR", issuerAuthorityKey: null }],
      clans: [{ key: "clan-1" } as unknown as CohortSeed],
      cohorts: [
        {
          key: "cohort-1",
          regionKey: "r-1",
          clanKey: "clan-1",
          ageBand: "WORKING",
          stratum: "WORKING_MIDDLE",
          laborCategory: "GENERAL",
          population: 100,
          wallet: { "c-1": Number.POSITIVE_INFINITY },
          householdInventory: {},
          healthIndex: 0.8,
          prosperityEma: 0.5,
          essentialSatisfactionEma: 0.7,
          realIncomePerCapitaEma: 10,
          employmentRateEma: 0.9,
          migrationPressureEma: 0,
          mobilityAccumulator: 0,
          wageSignal: 2,
        } as unknown as CohortSeed,
      ],
    });
    expect(() => validateScenarioContent(scenario)).toThrow(/wallet\["c-1"\].*Infinity/);
  });
});

describe("validateDefinitionPack", () => {
  function minimalRecipe(overrides?: Partial<RecipeDefinition>): RecipeDefinition {
    return {
      id: "test-recipe",
      outputGoodId: "good-1" as any,
      outputPerBatch: 10,
      inputsPerBatch: { "good-2": 2 } as any,
      laborCategory: "GENERAL",
      laborPerBatch: 5,
      batchesPerCapitalUnit: 2,
      investmentGoodsPerCapitalUnit: {},
      minimumStartupCapital: 100,
      baseThroughputFactor: 1,
      depreciationRatePerTick: 0.1,
      ...overrides,
    };
  }

  function goodDefinition(id: string): GoodDefinition {
    return {
      id: id as unknown as GoodId,
      name: id,
      unitLabel: "unit",
      spoilageRatePerTick: 0,
      consumerNeedCategory: null,
      referencePrice: 1,
      tradable: true,
    };
  }

  /**
   * Declares the goods `minimalRecipe()` references, so a pack built from it is
   * well-formed under the REQ-CONFIG-005 reference checks rather than accidentally
   * exercising them.
   */
  function minimalGoods(): Record<GoodId, GoodDefinition> {
    return {
      "good-1": goodDefinition("good-1"),
      "good-2": goodDefinition("good-2"),
    } as unknown as Record<GoodId, GoodDefinition>;
  }

  function minimalPack(recipes?: Record<string, RecipeDefinition>): DefinitionPack {
    return {
      id: "test-pack",
      version: "1.0.0",
      goods: minimalGoods(),
      recipes: recipes ?? { "recipe-1": minimalRecipe() },
      eventDefinitions: {},
      metricDefinitions: {},
    };
  }

  it("accepts a well-formed DefinitionPack with valid recipes", () => {
    const pack = minimalPack();
    expect(() => validateDefinitionPack(pack)).not.toThrow();
  });

  // REQ-CONFIG-005, Issue #509: `outputGoodId` was the recipe's one scalar Good reference
  // and was checked nowhere — not here, and not downstream, because no canonical reader
  // consumes it yet. An undeclared output Good therefore reached the constructed world.
  describe("outputGoodId good reference (REQ-CONFIG-005)", () => {
    it("rejects an output good the pack does not declare", () => {
      const pack = minimalPack({
        "recipe-1": minimalRecipe({
          outputGoodId: "good:unobtainium" as unknown as GoodId,
        }),
      });
      expect(() => validateDefinitionPack(pack)).toThrow(
        /RecipeDefinition "recipe-1": outputGoodId "good:unobtainium" references a Good the DefinitionPack does not declare/,
      );
    });

    it("rejects an undeclared output good even when every other recipe field is well-formed", () => {
      const pack = minimalPack({
        "recipe-1": minimalRecipe({
          outputGoodId: "good:unobtainium" as unknown as GoodId,
          outputPerBatch: 10,
          inputsPerBatch: { "good-2": 2 } as unknown as Record<GoodId, number>,
          investmentGoodsPerCapitalUnit: {},
        }),
      });
      expect(() => validateDefinitionPack(pack)).toThrow(
        /outputGoodId "good:unobtainium" references a Good the DefinitionPack does not declare/,
      );
    });

    it("names the offending recipe when only one of several recipes is invalid", () => {
      const pack = minimalPack({
        "recipe-1": minimalRecipe(),
        "recipe-2": minimalRecipe({ outputGoodId: "good:unobtainium" as unknown as GoodId }),
      });
      expect(() => validateDefinitionPack(pack)).toThrow(
        /RecipeDefinition "recipe-2": outputGoodId "good:unobtainium"/,
      );
    });

    it("accepts an output good the pack declares", () => {
      const pack = minimalPack({
        "recipe-1": minimalRecipe({ outputGoodId: "good-2" as unknown as GoodId }),
      });
      expect(() => validateDefinitionPack(pack)).not.toThrow();
    });
  });

  it("rejects outputPerBatch <= 0", () => {
    const pack = minimalPack({
      "recipe-1": minimalRecipe({ outputPerBatch: 0 }),
    });
    expect(() => validateDefinitionPack(pack)).toThrow(/outputPerBatch.*positive/);
  });

  it("rejects outputPerBatch that is non-finite", () => {
    const pack = minimalPack({
      "recipe-1": minimalRecipe({ outputPerBatch: Number.NaN }),
    });
    expect(() => validateDefinitionPack(pack)).toThrow(/outputPerBatch/);
  });

  it("rejects inputsPerBatch coefficient <= 0", () => {
    const pack = minimalPack({
      "recipe-1": minimalRecipe({
        inputsPerBatch: { "good-2": 0 } as any,
      }),
    });
    expect(() => validateDefinitionPack(pack)).toThrow(/inputsPerBatch\["good-2"\].*strictly positive/);
  });

  it("rejects inputsPerBatch coefficient that is non-finite", () => {
    const pack = minimalPack({
      "recipe-1": minimalRecipe({
        inputsPerBatch: { "good-2": Number.POSITIVE_INFINITY } as any,
      }),
    });
    expect(() => validateDefinitionPack(pack)).toThrow(/inputsPerBatch\["good-2"\]/);
  });

  it("accepts empty inputsPerBatch map", () => {
    const pack = minimalPack({
      "recipe-1": minimalRecipe({ inputsPerBatch: {} }),
    });
    expect(() => validateDefinitionPack(pack)).not.toThrow();
  });

  // REQ-CONFIG-005, Issue #508: `inputsPerBatch` used to be the one good-keyed recipe map
  // whose keys were never checked against `DefinitionPack.goods`, so an undeclared input
  // Good reached world construction instead of failing fast in step 1.
  describe("inputsPerBatch good references (REQ-CONFIG-005)", () => {
    it("rejects an input keyed by a good the pack does not declare", () => {
      const pack = minimalPack({
        "recipe-1": minimalRecipe({
          inputsPerBatch: { "good-2": 2, "good:unobtainium": 1 } as unknown as Record<GoodId, number>,
        }),
      });
      expect(() => validateDefinitionPack(pack)).toThrow(
        /RecipeDefinition "recipe-1": inputsPerBatch\["good:unobtainium"\] references a Good the DefinitionPack does not declare/,
      );
    });

    it("rejects an undeclared input good even when its coefficient is well-formed", () => {
      const pack = minimalPack({
        "recipe-1": minimalRecipe({
          inputsPerBatch: { "good:unobtainium": 1 } as unknown as Record<GoodId, number>,
        }),
      });
      expect(() => validateDefinitionPack(pack)).toThrow(
        /inputsPerBatch\["good:unobtainium"\] references a Good the DefinitionPack does not declare/,
      );
    });

    it("accepts a strictly positive coefficient keyed by a declared good", () => {
      const pack = minimalPack({
        "recipe-1": minimalRecipe({
          inputsPerBatch: { "good-1": 3, "good-2": 2 } as unknown as Record<GoodId, number>,
        }),
      });
      expect(() => validateDefinitionPack(pack)).not.toThrow();
    });
  });

  it("rejects laborPerBatch < 0", () => {
    const pack = minimalPack({
      "recipe-1": minimalRecipe({ laborPerBatch: -1 }),
    });
    expect(() => validateDefinitionPack(pack)).toThrow(/laborPerBatch.*non-negative/);
  });

  it("accepts laborPerBatch = 0", () => {
    const pack = minimalPack({
      "recipe-1": minimalRecipe({ laborPerBatch: 0 }),
    });
    expect(() => validateDefinitionPack(pack)).not.toThrow();
  });

  it("rejects batchesPerCapitalUnit <= 0", () => {
    const pack = minimalPack({
      "recipe-1": minimalRecipe({ batchesPerCapitalUnit: 0 }),
    });
    expect(() => validateDefinitionPack(pack)).toThrow(/batchesPerCapitalUnit.*positive/);
  });

  it("rejects minimumStartupCapital < 0", () => {
    const pack = minimalPack({
      "recipe-1": minimalRecipe({ minimumStartupCapital: -1 }),
    });
    expect(() => validateDefinitionPack(pack)).toThrow(/minimumStartupCapital.*non-negative/);
  });

  it("accepts minimumStartupCapital = 0", () => {
    const pack = minimalPack({
      "recipe-1": minimalRecipe({ minimumStartupCapital: 0 }),
    });
    expect(() => validateDefinitionPack(pack)).not.toThrow();
  });

  it("rejects minimumInfrastructureFactor < 0", () => {
    const pack = minimalPack({
      "recipe-1": minimalRecipe({ minimumInfrastructureFactor: -0.1 }),
    });
    expect(() => validateDefinitionPack(pack)).toThrow(/minimumInfrastructureFactor.*\[0,1\]/);
  });

  it("rejects minimumInfrastructureFactor > 1", () => {
    const pack = minimalPack({
      "recipe-1": minimalRecipe({ minimumInfrastructureFactor: 1.1 }),
    });
    expect(() => validateDefinitionPack(pack)).toThrow(/minimumInfrastructureFactor.*\[0,1\]/);
  });

  it("accepts minimumInfrastructureFactor in [0,1]", () => {
    const pack = minimalPack({
      "recipe-1": minimalRecipe({ minimumInfrastructureFactor: 0.5 }),
    });
    expect(() => validateDefinitionPack(pack)).not.toThrow();
  });

  it("rejects extractedResourcePerBatch <= 0", () => {
    const pack = minimalPack({
      "recipe-1": minimalRecipe({
        extractionResourceId: "iron-ore",
        extractedResourcePerBatch: 0,
      }),
    });
    expect(() => validateDefinitionPack(pack)).toThrow(/extractedResourcePerBatch.*positive/);
  });

  it("accepts omitted extractedResourcePerBatch", () => {
    const pack = minimalPack({
      "recipe-1": minimalRecipe() as any,
    });
    // Explicitly delete the extractedResourcePerBatch to test the optional path
    const recipe = pack.recipes["recipe-1"];
    if (recipe) {
      delete (recipe as any).extractedResourcePerBatch;
    }
    expect(() => validateDefinitionPack(pack)).not.toThrow();
  });

  it("rejects extractionResourceId without extractedResourcePerBatch", () => {
    const pack = minimalPack({
      "recipe-1": minimalRecipe({
        extractionResourceId: "iron-ore",
      } as any),
    });
    const recipe = pack.recipes["recipe-1"];
    if (recipe) {
      delete (recipe as any).extractedResourcePerBatch;
    }
    expect(() => validateDefinitionPack(pack)).toThrow(
      /extractionResourceId.*extractedResourcePerBatch.*both must be present together/,
    );
  });

  it("rejects extractedResourcePerBatch without extractionResourceId", () => {
    const pack = minimalPack({
      "recipe-1": minimalRecipe({
        extractedResourcePerBatch: 5,
      } as any),
    });
    const recipe = pack.recipes["recipe-1"];
    if (recipe) {
      delete (recipe as any).extractionResourceId;
    }
    expect(() => validateDefinitionPack(pack)).toThrow(
      /extractedResourcePerBatch.*extractionResourceId.*both must be present together/,
    );
  });

  it("accepts a valid extraction recipe with both extractionResourceId and extractedResourcePerBatch", () => {
    const pack = minimalPack({
      "recipe-1": minimalRecipe({
        extractionResourceId: "iron-ore",
        extractedResourcePerBatch: 5,
      }),
    });
    expect(() => validateDefinitionPack(pack)).not.toThrow();
  });

  it("rejects baseThroughputFactor <= 0", () => {
    const pack = minimalPack({
      "recipe-1": minimalRecipe({ baseThroughputFactor: 0 }),
    });
    expect(() => validateDefinitionPack(pack)).toThrow(/baseThroughputFactor.*positive/);
  });

  it("rejects depreciationRatePerTick >= 1", () => {
    const pack = minimalPack({
      "recipe-1": minimalRecipe({ depreciationRatePerTick: 1 }),
    });
    expect(() => validateDefinitionPack(pack)).toThrow(/depreciationRatePerTick.*\[0,1\)/);
  });

  it("rejects depreciationRatePerTick < 0", () => {
    const pack = minimalPack({
      "recipe-1": minimalRecipe({ depreciationRatePerTick: -0.1 }),
    });
    expect(() => validateDefinitionPack(pack)).toThrow(/depreciationRatePerTick.*\[0,1\)/);
  });

  it("accepts depreciationRatePerTick in [0,1)", () => {
    const pack = minimalPack({
      "recipe-1": minimalRecipe({ depreciationRatePerTick: 0.99 }),
    });
    expect(() => validateDefinitionPack(pack)).not.toThrow();
  });

  it("accepts empty recipes map", () => {
    const pack = minimalPack({});
    expect(() => validateDefinitionPack(pack)).not.toThrow();
  });

  // REQ-CONFIG-005, Issue #465: an invalid investmentGoodsPerCapitalUnit coefficient used
  // to survive validation and be dropped downstream by resolveCapitalGoodsPerCapitalUnit(),
  // where it became indistinguishable from a recipe declaring no investment good.
  describe("investmentGoodsPerCapitalUnit (REQ-CONFIG-005)", () => {
    /** A pack declaring `good:tools`, so an investment coefficient can name a real good. */
    function packWithTools(investment: Record<string, number>): DefinitionPack {
      return {
        ...minimalPack({
          "recipe-1": minimalRecipe({
            investmentGoodsPerCapitalUnit: investment as unknown as Record<GoodId, number>,
          }),
        }),
        goods: {
          ...minimalGoods(),
          "good:tools": goodDefinition("good:tools"),
        } as unknown as Record<GoodId, GoodDefinition>,
      };
    }

    it.each([
      ["NaN", Number.NaN],
      ["+Infinity", Number.POSITIVE_INFINITY],
      ["-Infinity", Number.NEGATIVE_INFINITY],
      ["zero", 0],
      ["negative", -5],
    ])("rejects a %s coefficient, naming the recipe and the good", (_label, coefficient) => {
      const pack = packWithTools({ "good:tools": coefficient });
      expect(() => validateDefinitionPack(pack)).toThrow(
        /RecipeDefinition "recipe-1": investmentGoodsPerCapitalUnit\["good:tools"\].*strictly positive/,
      );
    });

    it("rejects a coefficient keyed by a good the pack does not declare", () => {
      const pack = packWithTools({ "good:unobtainium": 100 });
      expect(() => validateDefinitionPack(pack)).toThrow(
        /RecipeDefinition "recipe-1": investmentGoodsPerCapitalUnit\["good:unobtainium"\] references a Good the DefinitionPack does not declare/,
      );
    });

    it("accepts a strictly positive coefficient keyed by a declared good", () => {
      const pack = packWithTools({ "good:tools": 100 });
      expect(() => validateDefinitionPack(pack)).not.toThrow();
    });

    it("accepts an empty map — a real 'no investment good' declaration", () => {
      const pack = packWithTools({});
      expect(() => validateDefinitionPack(pack)).not.toThrow();
    });
  });

  // Section 4 of `06 - Handoff/06 — POPULATION_DEMOGRAPHY_CLANS_CONTRACTS.md`
  // (REQ-CONFIG-007). `needCategories` is where the four baseline need categories
  // live; Handoff/03 section 8 puts need quantities and substitute groups in
  // definitions rather than global config, which is what settles the owner.
  describe("needCategories (REQ-CONFIG-007)", () => {
    function needCategory(id: string, overrides?: Partial<NeedCategoryDefinition>): NeedCategoryDefinition {
      return {
        id,
        perCapitaTarget: 1,
        priority: 1,
        substitutionGoods: [{ goodId: "good-1" as unknown as GoodId, basePreference: 1, qualityFactor: 1 }],
        priceSensitivity: 0.6,
        inventoryCarryoverTicks: 1,
        ...overrides,
      };
    }

    function packWithCategories(
      needCategories: Record<string, NeedCategoryDefinition>,
    ): DefinitionPack {
      return { ...minimalPack(), needCategories };
    }

    function baselineCategories(
      overrides?: Record<string, NeedCategoryDefinition>,
    ): Record<string, NeedCategoryDefinition> {
      const categories: Record<string, NeedCategoryDefinition> = {};
      for (const id of BASELINE_NEED_CATEGORY_IDS) {
        categories[id] = needCategory(id);
      }
      return { ...categories, ...overrides };
    }

    it("accepts a pack that declares no need categories at all", () => {
      expect(() => validateDefinitionPack(minimalPack())).not.toThrow();
      expect(minimalPack().needCategories).toBeUndefined();
    });

    it("accepts exactly the four baseline categories", () => {
      expect(() => validateDefinitionPack(packWithCategories(baselineCategories()))).not.toThrow();
      expect(Object.keys(baselineCategories())).toEqual(["ESSENTIAL_FOOD", "BASIC_GOODS", "SERVICES", "COMFORT"]);
    });

    it("rejects a category id that is not one of the four baseline ids", () => {
      const categories = baselineCategories({ LUXURY_TRAVEL: needCategory("LUXURY_TRAVEL") });
      expect(() => validateDefinitionPack(packWithCategories(categories))).toThrow(
        /declares "LUXURY_TRAVEL", which is not one of the four baseline categories/,
      );
    });

    it("rejects a registry missing one of the four baseline ids", () => {
      const categories = baselineCategories();
      delete categories.COMFORT;
      expect(() => validateDefinitionPack(packWithCategories(categories))).toThrow(
        /must declare the baseline category "COMFORT"/,
      );
    });

    it("rejects a duplicate id filed under a second key", () => {
      // The registry is keyed, so a repeated id can only arrive as a key/id
      // mismatch — which is the same defect and is caught first.
      const categories = baselineCategories({ COMFORT_ALIAS: needCategory("SERVICES") });
      expect(() => validateDefinitionPack(packWithCategories(categories))).toThrow(
        /NeedCategoryDefinition "COMFORT_ALIAS": id "SERVICES" does not match the key it is declared under/,
      );
    });

    it("rejects a non-finite or negative quantity", () => {
      for (const [field, value, message] of [
        ["perCapitaTarget", Number.NaN, /perCapitaTarget must be a non-negative finite number, got NaN/],
        ["perCapitaTarget", -1, /perCapitaTarget must be a non-negative finite number, got -1/],
        ["priceSensitivity", -0.5, /priceSensitivity must be a non-negative finite number, got -0.5/],
        ["inventoryCarryoverTicks", -2, /inventoryCarryoverTicks must be a non-negative finite number, got -2/],
        ["priority", Number.POSITIVE_INFINITY, /priority must be a finite number, got Infinity/],
      ] as const) {
        const categories = baselineCategories({ SERVICES: needCategory("SERVICES", { [field]: value }) });
        expect(() => validateDefinitionPack(packWithCategories(categories))).toThrow(message);
      }
    });

    it("accepts a zero priceSensitivity and a zero carryover window", () => {
      const categories = baselineCategories({
        ESSENTIAL_FOOD: needCategory("ESSENTIAL_FOOD", { priceSensitivity: 0, inventoryCarryoverTicks: 0 }),
      });
      expect(() => validateDefinitionPack(packWithCategories(categories))).not.toThrow();
    });

    it("rejects a minimumBudgetShare outside [0,1]", () => {
      for (const share of [-0.1, 1.5]) {
        const categories = baselineCategories({ BASIC_GOODS: needCategory("BASIC_GOODS", { minimumBudgetShare: share }) });
        expect(() => validateDefinitionPack(packWithCategories(categories))).toThrow(
          /minimumBudgetShare must be a finite number in \[0, 1\]/,
        );
      }
      const categories = baselineCategories({ BASIC_GOODS: needCategory("BASIC_GOODS", { minimumBudgetShare: 0.2 }) });
      expect(() => validateDefinitionPack(packWithCategories(categories))).not.toThrow();
    });

    // Decided one way: section 5 normalizes `share_g = weight_g / Σ weight`, so an
    // empty candidate list makes every share 0/0 and the category unsatisfiable.
    it("rejects an empty substitutionGoods list", () => {
      const categories = baselineCategories({ COMFORT: needCategory("COMFORT", { substitutionGoods: [] }) });
      expect(() => validateDefinitionPack(packWithCategories(categories))).toThrow(
        /substitutionGoods must declare at least one candidate good, got an empty array/,
      );
    });

    // The REQ-CONFIG-005 negative control (#512, #516) applied to the new reference.
    it("rejects a substitutionGoods entry naming a good the pack does not declare", () => {
      const categories = baselineCategories({
        ESSENTIAL_FOOD: needCategory("ESSENTIAL_FOOD", {
          substitutionGoods: [{ goodId: "good:unobtainium" as unknown as GoodId, basePreference: 1, qualityFactor: 1 }],
        }),
      });
      expect(() => validateDefinitionPack(packWithCategories(categories))).toThrow(
        /substitutionGoods goodId "good:unobtainium" references a Good the DefinitionPack does not declare/,
      );
    });

    it("rejects the same good listed twice in one category", () => {
      const candidate = { goodId: "good-1" as unknown as GoodId, basePreference: 1, qualityFactor: 1 };
      const categories = baselineCategories({
        SERVICES: needCategory("SERVICES", { substitutionGoods: [candidate, { ...candidate, basePreference: 2 }] }),
      });
      expect(() => validateDefinitionPack(packWithCategories(categories))).toThrow(
        /substitutionGoods declares goodId "good-1" more than once/,
      );
    });

    it("rejects a non-positive preference or quality factor", () => {
      for (const overrides of [{ basePreference: 0 }, { qualityFactor: -1 }]) {
        const categories = baselineCategories({
          BASIC_GOODS: needCategory("BASIC_GOODS", {
            substitutionGoods: [{ goodId: "good-2" as unknown as GoodId, basePreference: 1, qualityFactor: 1, ...overrides }],
          }),
        });
        expect(() => validateDefinitionPack(packWithCategories(categories))).toThrow(
          /substitutionGoods\["good-2"\]\.(basePreference|qualityFactor) must be a positive finite number/,
        );
      }
    });

    it("rejects a needCategories value that is not a keyed object", () => {
      const pack = { ...minimalPack(), needCategories: [] as unknown as Record<string, NeedCategoryDefinition> };
      expect(() => validateDefinitionPack(pack)).toThrow(
        /DefinitionPack.needCategories must be a plain object keyed by category id when present, got an array/,
      );
    });
  });
});

describe("canonical market defaults (REQ-MARKET-002)", () => {
  it("shortageSignalWeight matches Handoff/03 section 4", () => {
    const config = createDefaultSimulationConfig();
    expect(config.markets.shortageSignalWeight).toBe(0.65);
  });

  it("inventorySignalWeight matches Handoff/03 section 4", () => {
    const config = createDefaultSimulationConfig();
    expect(config.markets.inventorySignalWeight).toBe(0.35);
  });

  it("basePriceAdjustmentSpeed matches Handoff/03 section 4", () => {
    const config = createDefaultSimulationConfig();
    expect(config.markets.basePriceAdjustmentSpeed).toBe(0.12);
  });

  it("maxAbsoluteLogPriceMovePerTick matches Handoff/03 section 4", () => {
    const config = createDefaultSimulationConfig();
    expect(config.markets.maxAbsoluteLogPriceMovePerTick).toBe(0.18);
  });

  it("expectationAlpha matches Handoff/03 section 4", () => {
    const config = createDefaultSimulationConfig();
    expect(config.markets.expectationAlpha).toBe(0.25);
  });

  it("targetInventoryCoverageTicks matches Handoff/03 section 4", () => {
    const config = createDefaultSimulationConfig();
    expect(config.markets.targetInventoryCoverageTicks).toBe(1.0);
  });
});

describe("canonical production defaults (REQ-CONFIG-006)", () => {
  /**
   * Handoff/03 section 6 "Production defaults". Every entry section 6 states, under
   * the section 37 spelling where the two documents differ (Decision A on Issue #527).
   */
  const SECTION_6_BASELINE: ReadonlyArray<readonly [keyof ProductionConfig, number]> = [
    ["baseTargetUtilization", 0.7],
    ["minTargetUtilization", 0.1],
    ["maxTargetUtilization", 1.0],
    ["targetSellThrough", 0.8],
    ["marginResponse", 0.15],
    ["sellThroughResponse", 0.2],
    ["inventoryResponse", 0.25],
    ["outputCoverageTicks", 0.75],
    ["inputCoverageTicks", 1.0],
    ["inputSafetyCoverageTicks", 0.5],
    ["productionSignalAlpha", 0.25],
    ["liquidityBufferShare", 0.1],
    ["minOperatingCash", 0],
    ["maxInputCriticality", 4.0],
    ["mothballAfterReviews", 3],
    ["reactivateAfterReviews", 2],
    ["closeAfterReviews", 8],
    ["minimumLifecycleScale", 1e-6],
  ];

  it.each(SECTION_6_BASELINE)("%s matches Handoff/03 section 6", (field, expected) => {
    expect(createDefaultSimulationConfig().production[field]).toBe(expected);
  });

  it("accepts its own defaults", () => {
    expect(() => validateProductionConfig(createDefaultSimulationConfig().production)).not.toThrow();
  });

  it("is deterministic across calls", () => {
    expect(createDefaultSimulationConfig().production).toEqual(createDefaultSimulationConfig().production);
  });

  it("declares every control section 37 names", () => {
    const declared = new Set<string>(Object.keys(createDefaultSimulationConfig().production));
    // Section 37's list verbatim, less `laborEpsilon`-style tolerances that
    // NumericConfig owns; the capital tolerance is `minimumLifecycleScale`.
    const section37 = [
      "baseTargetUtilization", "minTargetUtilization", "maxTargetUtilization", "marginResponse",
      "sellThroughResponse", "inventoryResponse", "targetSellThrough", "outputCoverageTicks",
      "inputCoverageTicks", "inputSafetyCoverageTicks", "productionSignalAlpha", "minOperatingCash",
      "liquidityBufferShare", "maxInputCriticality", "investmentReviewCadenceTicks",
      "investmentUtilizationThreshold", "minimumInvestmentMargin", "investmentPropensity",
      "maxInvestmentShareOfExcessCash", "maxCapitalGrowthPerReview", "lifecycleReviewCadenceTicks",
      "mothballMarginThreshold", "mothballUtilizationThreshold", "mothballAfterReviews",
      "reactivateMarginThreshold", "reactivateAfterReviews", "closeAfterReviews",
      "closingGraceReviews", "minimumLifecycleScale",
    ];
    expect(section37.filter((field) => !declared.has(field))).toEqual([]);
  });
});

describe("validateProductionConfig (REQ-CONFIG-006)", () => {
  it("rejects a non-finite value", () => {
    expect(() => validateProductionConfig({ baseTargetUtilization: Number.NaN })).toThrow(
      /baseTargetUtilization must be a finite number in \[0, 1\], got NaN/,
    );
    expect(() => validateProductionConfig({ outputCoverageTicks: Number.POSITIVE_INFINITY })).toThrow(
      /outputCoverageTicks must be a non-negative finite number, got Infinity/,
    );
    expect(() => validateProductionConfig({ minimumInvestmentMargin: Number.NaN })).toThrow(
      /minimumInvestmentMargin must be a finite number, got NaN/,
    );
  });

  it("rejects a share outside [0, 1]", () => {
    expect(() => validateProductionConfig({ liquidityBufferShare: 1.5 })).toThrow(
      /liquidityBufferShare must be a finite number in \[0, 1\], got 1.5/,
    );
    expect(() => validateProductionConfig({ targetSellThrough: -0.1 })).toThrow(
      /targetSellThrough must be a finite number in \[0, 1\]/,
    );
  });

  it("rejects a negative coverage and a non-positive tolerance", () => {
    expect(() => validateProductionConfig({ inputCoverageTicks: -1 })).toThrow(
      /inputCoverageTicks must be a non-negative finite number, got -1/,
    );
    expect(() => validateProductionConfig({ minimumLifecycleScale: 0 })).toThrow(
      /minimumLifecycleScale must be a positive finite number, got 0/,
    );
  });

  it("rejects a negative or fractional cadence and review count", () => {
    expect(() => validateProductionConfig({ investmentReviewCadenceTicks: -4 })).toThrow(
      /investmentReviewCadenceTicks must be a positive integer, got -4/,
    );
    expect(() => validateProductionConfig({ lifecycleReviewCadenceTicks: 0 })).toThrow(
      /lifecycleReviewCadenceTicks must be a positive integer, got 0/,
    );
    expect(() => validateProductionConfig({ mothballAfterReviews: 2.5 })).toThrow(
      /mothballAfterReviews must be a positive integer, got 2.5/,
    );
    expect(() => validateProductionConfig({ closingGraceReviews: -1 })).toThrow(
      /closingGraceReviews must be a non-negative integer, got -1/,
    );
  });

  it("accepts a zero closing grace but not a zero review count", () => {
    expect(() => validateProductionConfig({ closingGraceReviews: 0 })).not.toThrow();
    expect(() => validateProductionConfig({ closeAfterReviews: 0 })).toThrow(/positive integer/);
  });

  it("rejects an inverted utilization bound pair", () => {
    expect(() => validateProductionConfig({ minTargetUtilization: 0.9, maxTargetUtilization: 0.2 })).toThrow(
      /minTargetUtilization \(0.9\) must not exceed maxTargetUtilization \(0.2\)/,
    );
  });

  it("rejects a mothball margin above the reactivate margin", () => {
    expect(() => validateProductionConfig({ mothballMarginThreshold: 0.2, reactivateMarginThreshold: 0.05 })).toThrow(
      /mothballMarginThreshold \(0.2\) must not exceed reactivateMarginThreshold \(0.05\)/,
    );
  });

  it("accepts a negative margin threshold, whose sign the spec leaves open", () => {
    expect(() => validateProductionConfig({ mothballMarginThreshold: -0.05, reactivateMarginThreshold: 0 })).not.toThrow();
  });

  it("accepts an empty config, because every control is optional", () => {
    expect(() => validateProductionConfig({})).not.toThrow();
  });
});

describe("canonical labor defaults (REQ-CONFIG-006)", () => {
  /** Handoff/03 section 7 "Labor defaults". */
  const SECTION_7_BASELINE: ReadonlyArray<readonly [keyof LaborConfig, number]> = [
    ["baselineParticipationRate", 0.7],
    ["laborWageAttractivenessElasticity", 0.5],
    ["minWageWeight", 0.5],
    ["maxWageWeight", 2.0],
    ["wageAdjustmentSpeed", 0.1],
    ["startingReferenceWage", 10],
    ["unemploymentWagePressure", 0.4],
    ["vacancyWagePressure", 0.4],
    ["minimumWorkingHealthFactor", 0.5],
    ["maximumWorkingHealthFactor", 1.05],
  ];

  it.each(SECTION_7_BASELINE)("%s matches Handoff/03 section 7", (field, expected) => {
    expect(createDefaultSimulationConfig().labor[field]).toBe(expected);
  });

  it("allows exactly the one core baseline labor category", () => {
    expect(createDefaultSimulationConfig().labor.allowedLaborCategories).toEqual(["GENERAL"]);
  });

  it("accepts its own defaults", () => {
    expect(() => validateLaborConfig(createDefaultSimulationConfig().labor)).not.toThrow();
  });

  it("is deterministic across calls", () => {
    expect(createDefaultSimulationConfig().labor).toEqual(createDefaultSimulationConfig().labor);
  });

  /**
   * Decision on Issue #527: labor is measured in worker-equivalents, a quantity, and
   * `NumericConfig.quantityEpsilon` already owns that tolerance. Declaring a
   * `laborEpsilon` here would create a second owner for one value.
   */
  it("does not restate an epsilon NumericConfig owns", () => {
    const config = createDefaultSimulationConfig();
    expect(config.labor).not.toHaveProperty("laborEpsilon");
    expect(config.numeric.quantityEpsilon).toBe(1e-9);
  });
});

describe("validateLaborConfig (REQ-CONFIG-006)", () => {
  it("rejects a non-finite value", () => {
    expect(() => validateLaborConfig({ baselineParticipationRate: Number.NaN })).toThrow(
      /baselineParticipationRate must be a finite number in \[0, 1\], got NaN/,
    );
    expect(() => validateLaborConfig({ maxLogWageStep: Number.POSITIVE_INFINITY })).toThrow(
      /maxLogWageStep must be a positive finite number, got Infinity/,
    );
  });

  it("rejects a participation rate outside [0, 1]", () => {
    expect(() => validateLaborConfig({ baselineParticipationRate: 1.2 })).toThrow(
      /baselineParticipationRate must be a finite number in \[0, 1\], got 1.2/,
    );
  });

  it("rejects a non-positive wage weight and reference wage", () => {
    expect(() => validateLaborConfig({ minWageWeight: 0 })).toThrow(
      /minWageWeight must be a positive finite number, got 0/,
    );
    expect(() => validateLaborConfig({ startingReferenceWage: -10 })).toThrow(
      /startingReferenceWage must be a positive finite number, got -10/,
    );
  });

  it("rejects a negative elasticity and wage pressure", () => {
    expect(() => validateLaborConfig({ laborWageAttractivenessElasticity: -0.5 })).toThrow(
      /laborWageAttractivenessElasticity must be a non-negative finite number, got -0.5/,
    );
    expect(() => validateLaborConfig({ vacancyWagePressure: -1 })).toThrow(
      /vacancyWagePressure must be a non-negative finite number, got -1/,
    );
  });

  it("rejects an inverted wage-weight bound pair", () => {
    expect(() => validateLaborConfig({ minWageWeight: 3, maxWageWeight: 1 })).toThrow(
      /minWageWeight \(3\) must not exceed maxWageWeight \(1\)/,
    );
  });

  it("rejects an inverted working-health bound pair", () => {
    expect(() => validateLaborConfig({ minimumWorkingHealthFactor: 1.2, maximumWorkingHealthFactor: 0.9 })).toThrow(
      /minimumWorkingHealthFactor \(1.2\) must not exceed maximumWorkingHealthFactor \(0.9\)/,
    );
  });

  it("rejects more labor categories than v1 allows", () => {
    expect(() => validateLaborConfig({ allowedLaborCategories: ["GENERAL", "A", "B", "C"] })).toThrow(
      /must declare at most 3 categories in v1, got 4/,
    );
  });

  it("rejects an empty, duplicated or unnamed labor category list", () => {
    expect(() => validateLaborConfig({ allowedLaborCategories: [] })).toThrow(/at least one category/);
    expect(() => validateLaborConfig({ allowedLaborCategories: ["GENERAL", "GENERAL"] })).toThrow(
      /declares "GENERAL" more than once/,
    );
    expect(() => validateLaborConfig({ allowedLaborCategories: [""] })).toThrow(/non-empty category names/);
  });

  it("accepts an empty config, because every control is optional", () => {
    expect(() => validateLaborConfig({})).not.toThrow();
  });
});

describe("production and labor config ownership (REQ-CONFIG-006)", () => {
  /**
   * Section 37: "MarketConfig owns prices/clearing. Do not duplicate those values in
   * ProductionConfig." The same rule protects NumericConfig, whose tolerances
   * HANDOFF-REPAIR-010 explicitly left under `SimulationConfig.numeric`.
   */
  it("duplicates no MarketConfig or NumericConfig key", () => {
    const config = createDefaultSimulationConfig();
    const owned = new Set([...Object.keys(config.markets), ...Object.keys(config.numeric)]);
    const added = [...Object.keys(config.production), ...Object.keys(config.labor)];
    expect(added.filter((key) => owned.has(key))).toEqual([]);
  });

  it("still refuses a scenario carrying production or labor", () => {
    expect(() => assertNoBehavioralOverrides({ ...minimalScenario(), production: { marginResponse: 0.9 } })).toThrow(
      /SimulationConfig-owned behavioral key "production"/,
    );
    expect(() => assertNoBehavioralOverrides({ ...minimalScenario(), labor: { minWageWeight: 0.1 } })).toThrow(
      /SimulationConfig-owned behavioral key "labor"/,
    );
  });

  it("leaves every sibling placeholder empty", () => {
    const config = createDefaultSimulationConfig();
    // `population` (M4) and `trade` (M5) are now materialized; only the
    // remaining deferred blocks are still untouched placeholders.
    for (const key of ["clans", "fiscal", "monetary", "expansion", "events", "performance"] as const) {
      expect(config[key]).toEqual({});
    }
  });
});

describe("canonical population defaults (REQ-CONFIG-007)", () => {
  it("materializes every canonical M4 PopulationConfig control", () => {
    const population = createDefaultSimulationConfig().population;
    expect(Object.keys(population).sort()).toEqual([...M4_POPULATION_CONTROLS].sort());
    for (const field of M4_POPULATION_CONTROLS) {
      expect(population[field], `${field} must be materialized`).not.toBeUndefined();
    }
  });

  it("accepts its own defaults", () => {
    expect(() => validatePopulationConfig(createDefaultSimulationConfig().population)).not.toThrow();
  });

  it("is deterministic across calls and isolates the stratum map", () => {
    const first = createDefaultSimulationConfig().population;
    const second = createDefaultSimulationConfig().population;
    expect(first).toEqual(second);
    expect(first.baseParticipationByStratum).not.toBe(second.baseParticipationByStratum);
  });

  /**
   * REQ-CONFIG-007's STATEMENT defers demography, migration and mobility, and
   * `EXECUTION_ORDER.md` puts them in M8. Section 33 names them in the same
   * sentence as the M4 controls, so their absence is the thing that has to be
   * proved: this test fails the moment a later run pulls M8 forward.
   */
  it.each([
    "annualFertilityRate",
    "baselineMonthlyBirthRate",
    "baselineMonthlyDeathRateChild",
    "baselineMonthlyDeathRateWorking",
    "baselineMonthlyDeathRateElder",
    "maximumMortalityMultiplier",
    "healthMortalitySensitivity",
    "hungerMortalitySensitivity",
    "agingChildToWorkingMonthlyShare",
    "agingWorkingToElderMonthlyShare",
    "migrationReviewEveryTicks",
    "maxMigratingSharePerTick",
    "maxMonthlyMigrationRate",
    "migrationUtilitySensitivity",
    "migrationNetworkWeight",
    "migrationDistancePenalty",
    "migrationCandidateCap",
    "dependentAttachmentShare",
    "mobilityCadenceTicks",
    "socialMobilityMaxSharePerTick",
  ])("does not declare the deferred M8 control %s", (field) => {
    expect(createDefaultSimulationConfig().population).not.toHaveProperty(field);
  });

  /**
   * Decision on Issue #531, applying the #528 reading: workers are measured in
   * worker-equivalents, a quantity, and `NumericConfig.quantityEpsilon` owns that
   * tolerance. The section 10 `P_raw` weights are formula coefficients that must
   * sum to 1.0, and section 33 does not list them among what `PopulationConfig`
   * centralizes; a scenario-tunable weight vector is the "new bespoke formula"
   * that same section forbids without a schema version change.
   */
  it("declares neither a worker epsilon nor the prosperity weights", () => {
    const config = createDefaultSimulationConfig();
    expect(config.population).not.toHaveProperty("workerEpsilon");
    expect(config.population).not.toHaveProperty("prosperityEssentialWeight");
    expect(config.population).not.toHaveProperty("prosperityWeights");
    expect(config.numeric.quantityEpsilon).toBe(1e-9);
  });
});

describe("validatePopulationConfig (REQ-CONFIG-007)", () => {
  it("rejects a non-finite value", () => {
    expect(() => validatePopulationConfig({ prosperityAlpha: Number.NaN })).toThrow(
      /PopulationConfig.prosperityAlpha must be a finite number in \[0, 1\], got NaN/,
    );
    expect(() => validatePopulationConfig({ healthRecoveryRate: Number.POSITIVE_INFINITY })).toThrow(
      /PopulationConfig.healthRecoveryRate must be a non-negative finite number, got Infinity/,
    );
    expect(() => validatePopulationConfig({ scenarioRealIncomeScale: Number.NEGATIVE_INFINITY })).toThrow(
      /PopulationConfig.scenarioRealIncomeScale must be a positive finite number, got -Infinity/,
    );
  });

  it("rejects a value outside its declared range", () => {
    expect(() => validatePopulationConfig({ liquidityFloorShare: 1.5 })).toThrow(
      /PopulationConfig.liquidityFloorShare must be a finite number in \[0, 1\], got 1.5/,
    );
    expect(() => validatePopulationConfig({ employmentAlpha: -0.1 })).toThrow(
      /PopulationConfig.employmentAlpha must be a finite number in \[0, 1\], got -0.1/,
    );
    expect(() => validatePopulationConfig({ minHouseholdCashPerCapita: -1 })).toThrow(
      /PopulationConfig.minHouseholdCashPerCapita must be a non-negative finite number, got -1/,
    );
    expect(() => validatePopulationConfig({ maxWageSignalStep: 0 })).toThrow(
      /PopulationConfig.maxWageSignalStep must be a positive finite number, got 0/,
    );
  });

  it("rejects an inverted participation bound pair", () => {
    expect(() => validatePopulationConfig({ minParticipation: 0.9, maxParticipation: 0.2 })).toThrow(
      /PopulationConfig.minParticipation \(0.9\) must not exceed maxParticipation \(0.2\)/,
    );
  });

  it("rejects an inverted health or opportunity factor clamp", () => {
    expect(() =>
      validatePopulationConfig({ minHealthParticipationFactor: 1.2, maxHealthParticipationFactor: 0.9 }),
    ).toThrow(/minHealthParticipationFactor \(1.2\) must not exceed maxHealthParticipationFactor \(0.9\)/);
    expect(() =>
      validatePopulationConfig({ minWeakOpportunityFactor: 1.1, maxWeakOpportunityFactor: 1 }),
    ).toThrow(/minWeakOpportunityFactor \(1.1\) must not exceed maxWeakOpportunityFactor \(1\)/);
  });

  it("validates baseParticipationByStratum entry by entry", () => {
    expect(() => validatePopulationConfig({ baseParticipationByStratum: { WORKING_MIDDLE: 1.4 } })).toThrow(
      /baseParticipationByStratum\["WORKING_MIDDLE"\] must be a finite number in \[0, 1\], got 1.4/,
    );
    expect(() => validatePopulationConfig({ baseParticipationByStratum: { VULNERABLE: Number.NaN } })).toThrow(
      /baseParticipationByStratum\["VULNERABLE"\] must be a finite number in \[0, 1\], got NaN/,
    );
    expect(() =>
      validatePopulationConfig({ baseParticipationByStratum: [0.7] as unknown as Record<string, number> }),
    ).toThrow(/baseParticipationByStratum must be a plain object keyed by stratum when present, got an array/);
    expect(() =>
      validatePopulationConfig({ baseParticipationByStratum: { VULNERABLE: 0.4, WORKING_MIDDLE: 0.7, AFFLUENT: 0.6 } }),
    ).not.toThrow();
  });

  it("accepts an empty config, because every control is optional", () => {
    expect(() => validatePopulationConfig({})).not.toThrow();
  });
});

describe("population config ownership (REQ-CONFIG-007)", () => {
  /**
   * Section 33 gives `PopulationConfig` its own list, and `HANDOFF-REPAIR-010` is
   * the standing precedent against a second owner for a value another block
   * already holds. `LaborConfig` in particular already owns
   * `baselineParticipationRate` and the working-health-factor clamp.
   */
  it("duplicates no LaborConfig, MarketConfig, ProductionConfig or NumericConfig key", () => {
    const config = createDefaultSimulationConfig();
    const owned = new Set([
      ...Object.keys(config.labor),
      ...Object.keys(config.markets),
      ...Object.keys(config.production),
      ...Object.keys(config.numeric),
    ]);
    // All twenty declared controls are materialized by HANDOFF-REPAIR-M4-003. The
    // exhaustive half of this control remains the `DuplicatedConfigOwner` type at the
    // top of this file, while this runtime half keeps ownership drift visible in
    // `npm test` as well as in `npm run typecheck`.
    expect(M4_POPULATION_CONTROLS.filter((key) => owned.has(key))).toEqual([]);
  });

  it("still refuses a scenario carrying population", () => {
    expect(() => assertNoBehavioralOverrides({ ...minimalScenario(), population: { prosperityAlpha: 0.9 } })).toThrow(
      /SimulationConfig-owned behavioral key "population"/,
    );
  });

  it("changes no numeric, markets, production or labor value", () => {
    const config = createDefaultSimulationConfig();
    expect(config.numeric.quantityEpsilon).toBe(1e-9);
    expect(config.markets.basePriceAdjustmentSpeed).toBe(0.12);
    expect(config.production.baseTargetUtilization).toBe(0.7);
    expect(config.labor.baselineParticipationRate).toBe(0.7);
    expect(config.labor.minimumWorkingHealthFactor).toBe(0.5);
    expect(config.labor.maximumWorkingHealthFactor).toBe(1.05);
  });
});
