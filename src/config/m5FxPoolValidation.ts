/**
 * M5 FX-pool genesis validation (REQ-CONFIG-009).
 *
 * This validates the pairwise storage contract before FX behavior is enabled:
 * one physical pool per currency pair, explicit base/quote direction, ownership
 * by the base-currency authority, explicit opening reserves, and finite bounded
 * quote controls. It does not quote, settle, or update FX rates.
 */
import type { FxPoolSeed, ScenarioDefinition } from "./scenarioDefinition";

export type FxOpeningScenario = Pick<
  ScenarioDefinition,
  "currencies" | "monetaryAuthorities"
>;

export interface ValidatedFxPoolGenesis {
  readonly key: string;
  readonly ownerAuthorityKey: string;
  readonly baseCurrencyKey: string;
  readonly quoteCurrencyKey: string;
  readonly baseCash: number;
  readonly quoteCash: number;
  readonly spotRateQuotePerBase: number;
}

function fail(poolKey: string, field: string, reason: string): never {
  throw new Error(`FxPoolSeed "${poolKey}": ${field} ${reason}`);
}

function requireFiniteAtLeast(
  value: number,
  minimum: number,
  label: string,
  poolKey: string,
  inclusive = true,
): void {
  const belowMinimum = inclusive ? value < minimum : value <= minimum;
  if (!Number.isFinite(value) || belowMinimum) {
    fail(
      poolKey,
      label,
      `must be finite and ${inclusive ? ">=" : ">"} ${minimum}`,
    );
  }
}

/**
 * Used only to detect duplicate physical storage. It deliberately sorts the
 * identity key while leaving the pool's semantic base/quote direction untouched.
 */
function unorderedPairIdentity(a: string, b: string): string {
  return JSON.stringify([a, b].sort());
}

export function validateFxPoolGenesis(
  scenario: FxOpeningScenario,
  minimumPoolReserve: number,
): readonly ValidatedFxPoolGenesis[] {
  if (!Number.isFinite(minimumPoolReserve) || minimumPoolReserve < 0) {
    throw new Error(
      "TradeConfig.fxMinimumPoolReserve must be finite and non-negative",
    );
  }

  const currencyKeys = new Set<string>();
  for (const currency of scenario.currencies) {
    if (currencyKeys.has(currency.key)) {
      throw new Error(`Duplicate CurrencySeed: ${currency.key}`);
    }
    currencyKeys.add(currency.key);
  }

  const authorityKeys = new Set<string>();
  const poolKeys = new Set<string>();
  const physicalPairs = new Set<string>();
  const validated: ValidatedFxPoolGenesis[] = [];

  for (const authority of scenario.monetaryAuthorities) {
    if (authorityKeys.has(authority.key)) {
      throw new Error(`Duplicate MonetaryAuthoritySeed: ${authority.key}`);
    }
    authorityKeys.add(authority.key);

    if (!currencyKeys.has(authority.currencyKey)) {
      throw new Error(
        `MonetaryAuthoritySeed "${authority.key}" owns undeclared currency "${authority.currencyKey}"`,
      );
    }

    for (const pool of authority.fxPools) {
      validatePool(
        pool,
        authority.key,
        authority.currencyKey,
        currencyKeys,
        poolKeys,
        physicalPairs,
        minimumPoolReserve,
      );

      validated.push({
        key: pool.key,
        ownerAuthorityKey: authority.key,
        baseCurrencyKey: pool.baseCurrencyKey,
        quoteCurrencyKey: pool.quoteCurrencyKey,
        baseCash: pool.cash[pool.baseCurrencyKey]!,
        quoteCash: pool.cash[pool.quoteCurrencyKey]!,
        spotRateQuotePerBase: pool.spotRateQuotePerBase,
      });
    }
  }

  return validated.sort(
    (a, b) =>
      a.baseCurrencyKey.localeCompare(b.baseCurrencyKey) ||
      a.quoteCurrencyKey.localeCompare(b.quoteCurrencyKey) ||
      a.key.localeCompare(b.key),
  );
}

function validatePool(
  pool: FxPoolSeed,
  ownerAuthorityKey: string,
  ownerCurrencyKey: string,
  currencyKeys: ReadonlySet<string>,
  poolKeys: Set<string>,
  physicalPairs: Set<string>,
  minimumPoolReserve: number,
): void {
  if (poolKeys.has(pool.key)) {
    fail(pool.key, "key", "is duplicated across authorities");
  }
  poolKeys.add(pool.key);

  if (pool.baseCurrencyKey === pool.quoteCurrencyKey) {
    fail(
      pool.key,
      "baseCurrencyKey/quoteCurrencyKey",
      "must refer to distinct currencies",
    );
  }

  if (
    !currencyKeys.has(pool.baseCurrencyKey) ||
    !currencyKeys.has(pool.quoteCurrencyKey)
  ) {
    fail(pool.key, "currencies", "must both be declared in the scenario");
  }

  if (pool.baseCurrencyKey !== ownerCurrencyKey) {
    fail(
      pool.key,
      "owner",
      `must be the authority of explicit base currency "${pool.baseCurrencyKey}", got "${ownerAuthorityKey}"`,
    );
  }

  const pairIdentity = unorderedPairIdentity(
    pool.baseCurrencyKey,
    pool.quoteCurrencyKey,
  );
  if (physicalPairs.has(pairIdentity)) {
    fail(
      pool.key,
      "pair",
      `duplicates an existing physical pool for ${pairIdentity}, including reverse direction`,
    );
  }
  physicalPairs.add(pairIdentity);

  if (
    !pool.cash ||
    typeof pool.cash !== "object" ||
    Array.isArray(pool.cash)
  ) {
    fail(pool.key, "cash", "must name exactly base and quote currency reserves");
  }

  const cashKeys = Object.keys(pool.cash);
  if (
    cashKeys.length !== 2 ||
    !cashKeys.includes(pool.baseCurrencyKey) ||
    !cashKeys.includes(pool.quoteCurrencyKey)
  ) {
    fail(
      pool.key,
      "cash",
      "must include exactly base and quote reserves and no other currency",
    );
  }

  requireFiniteAtLeast(
    pool.minOperationalReserveBase,
    0,
    "minOperationalReserveBase",
    pool.key,
  );
  requireFiniteAtLeast(
    pool.minOperationalReserveQuote,
    0,
    "minOperationalReserveQuote",
    pool.key,
  );

  const baseCash = pool.cash[pool.baseCurrencyKey]!;
  const quoteCash = pool.cash[pool.quoteCurrencyKey]!;
  requireFiniteAtLeast(
    baseCash,
    Math.max(minimumPoolReserve, pool.minOperationalReserveBase),
    "base reserve",
    pool.key,
  );
  requireFiniteAtLeast(
    quoteCash,
    Math.max(minimumPoolReserve, pool.minOperationalReserveQuote),
    "quote reserve",
    pool.key,
  );

  requireFiniteAtLeast(
    pool.spotRateQuotePerBase,
    0,
    "spotRateQuotePerBase",
    pool.key,
    false,
  );
  requireFiniteAtLeast(
    pool.transactionSpread,
    0,
    "transactionSpread",
    pool.key,
  );
  if (pool.transactionSpread >= 1) {
    fail(pool.key, "transactionSpread", "must be < 1");
  }

  requireFiniteAtLeast(
    pool.targetBaseReserveShare,
    0,
    "targetBaseReserveShare",
    pool.key,
  );
  if (pool.targetBaseReserveShare > 1) {
    fail(pool.key, "targetBaseReserveShare", "must be <= 1");
  }

  if (!Number.isFinite(pool.flowPressureEma)) {
    fail(pool.key, "flowPressureEma", "must be finite");
  }

  requireFiniteAtLeast(
    pool.maxRateMovePerTick,
    0,
    "maxRateMovePerTick",
    pool.key,
  );
}
