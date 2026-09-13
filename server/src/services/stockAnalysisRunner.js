/**
 * ============================================================
 * STOCK ANALYSIS RUNNER
 * ============================================================
 *
 * PURPOSE
 * -------
 *
 * Production bridge between:
 *
 * MarketDataHub
 * External/live intelligence
 * Engine Orchestrator
 *
 * FLOW
 * ----
 *
 * MarketDataHub
 *   ↓
 * Validate market snapshot
 *   ↓
 * Build normalized orchestrator inputs
 *   ↓
 * runTradingAnalysis(...)
 *   ↓
 * Risk pipeline
 *   ↓
 * Final decision
 *
 * SAFETY
 * ------
 *
 * - Never fabricates market data.
 * - Historical candles may be used for analysis.
 * - Missing/stale live quotes prevent execution readiness.
 * - Provider failure does not silently become positive evidence.
 * - Orchestrator remains the authority for trade decisions.
 * - This runner NEVER places an order.
 */

import {
  createMarketSnapshot,
  getMarketDataStatus,
} from "../data/marketDataHub.js";

import {
  runTradingAnalysis,
} from "../orchestration/engineOrchestrator.js";

import {
  getInstitutionalEvidence,
} from "./institutionalEvidenceBootstrap.js";

import getMarketClock
  from "./marketClockService.js";

/**
 * ============================================================
 * CONSTANTS
 * ============================================================
 */

export const STOCK_ANALYSIS_RUNNER_STATUS =
  Object.freeze({
    COMPLETE:
      "COMPLETE",

    ANALYSIS_ONLY:
      "ANALYSIS_ONLY",

    INSUFFICIENT_DATA:
      "INSUFFICIENT_DATA",

    INVALID_REQUEST:
      "INVALID_REQUEST",

    ERROR:
      "ERROR",
  });

const DEFAULT_MINIMUM_CANDLES =
  50;

const DEFAULT_TIMEOUT_MS =
  45_000;

/**
 * ============================================================
 * BASIC HELPERS
 * ============================================================
 */

function now() {
  return new Date()
    .toISOString();
}

function normalizeSymbol(
  value,
) {
  const symbol =
    String(
      value ??
        "",
    )
      .trim()
      .toUpperCase();

  return symbol ||
    null;
}

function numberOrNull(
  value,
) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const number =
    Number(
      value,
    );

  return Number.isFinite(
    number,
  )
    ? number
    : null;
}

function positiveNumberOrNull(
  value,
) {
  const number =
    numberOrNull(
      value,
    );

  return (
    number !== null &&
    number > 0
  )
    ? number
    : null;
}

function positiveInteger(
  value,
  fallback,
) {
  const number =
    Number(
      value,
    );

  if (
    !Number.isFinite(
      number,
    ) ||
    number <= 0
  ) {
    return fallback;
  }

  return Math.floor(
    number,
  );
}

function safeErrorMessage(
  error,
) {
  if (
    error instanceof Error
  ) {
    return error.message;
  }

  return String(
    error,
  );
}

/**
 * ============================================================
 * TIMEOUT
 * ============================================================
 */

async function withTimeout({
  task,

  timeoutMs,

  label,
}) {
  const limit =
    positiveInteger(
      timeoutMs,
      DEFAULT_TIMEOUT_MS,
    );

  let timer =
    null;

  try {
    return await Promise.race([
      Promise
        .resolve()
        .then(
          task,
        ),

      new Promise(
        (
          _resolve,
          reject,
        ) => {
          timer =
            setTimeout(
              () => {
                reject(
                  new Error(
                    `${label} timed out after ${limit}ms.`,
                  ),
                );
              },
              limit,
            );
        },
      ),
    ]);
  } finally {
    if (
      timer !== null
    ) {
      clearTimeout(
        timer,
      );
    }
  }
}

/**
 * ============================================================
 * PROVIDER EXECUTION
 * ============================================================
 *
 * Providers are optional.
 *
 * A provider failure becomes an explicit unavailable result.
 * It NEVER becomes positive evidence.
 */

async function runOptionalProvider({
  name,

  fn,

  timeoutMs,
}) {
  if (
    typeof fn !==
    "function"
  ) {
    return {
      supplied:
        false,

      approved:
        false,

      status:
        "NOT_CONFIGURED",

      name,

      result:
        null,

      error:
        null,
    };
  }

  try {
    const result =
      await withTimeout({
        task:
          fn,

        timeoutMs,

        label:
          name,
      });

    return {
      supplied:
        true,

      approved:
        result
          ?.approved ===
        true,

      status:
        result
          ?.status ??
        (
          result
            ?.approved ===
          true
            ? "COMPLETE"
            : "UNAVAILABLE"
        ),

      name,

      result:
        result ??
        null,

      error:
        null,
    };
  } catch (error) {
    return {
      supplied:
        true,

      approved:
        false,

      status:
        "ERROR",

      name,

      result:
        null,

      error:
        safeErrorMessage(
          error,
        ),
    };
  }
}

/**
 * ============================================================
 * MARKET SNAPSHOT VALIDATION
 * ============================================================
 */

function inspectMarketSnapshot({
  snapshot,

  minimumCandles,
}) {
  const warnings = [];
  const errors = [];

  if (!snapshot) {
    return {
      usableForAnalysis:
        false,

      executionReady:
        false,

      candles: [],

      quote:
        null,

      latestBar:
        null,

      warnings,

      errors: [
        "No MarketDataHub snapshot exists for the symbol.",
      ],
    };
  }

  const candles =
    Array.isArray(
      snapshot.candles,
    )
      ? snapshot.candles
      : [];

  const requiredCandles =
    positiveInteger(
      minimumCandles,
      DEFAULT_MINIMUM_CANDLES,
    );

  if (
    candles.length <
    requiredCandles
  ) {
    errors.push(
      `Only ${candles.length} candles are available; at least ${requiredCandles} are required for this analysis run.`,
    );
  }

  const quote =
    snapshot.latestQuote &&
    typeof snapshot.latestQuote ===
      "object"
      ? snapshot.latestQuote
      : null;

  const bid =
    positiveNumberOrNull(
      quote?.bid,
    );

  const ask =
    positiveNumberOrNull(
      quote?.ask,
    );

  let validQuote =
    Boolean(
      quote &&
      bid !== null &&
      ask !== null &&
      ask >= bid,
    );

  if (
    quote &&
    !validQuote
  ) {
    warnings.push(
      "Latest market quote is malformed and cannot be used for execution.",
    );
  }

  const quoteFresh =
    snapshot.quoteFresh ===
    true;

  if (!quote) {
    warnings.push(
      "No live quote is available. Analysis may continue, but execution must remain disabled.",
    );
  } else if (
    !quoteFresh
  ) {
    warnings.push(
      "Latest quote is stale. Analysis may continue, but execution must remain disabled.",
    );
  }

  if (
    validQuote &&
    !quoteFresh
  ) {
    validQuote =
      false;
  }

  const latestBar =
    snapshot.latestBar &&
    typeof snapshot.latestBar ===
      "object"
      ? snapshot.latestBar
      : (
          candles.length >
          0
            ? candles[
                candles.length -
                1
              ]
            : null
        );

  return {
    usableForAnalysis:
      errors.length ===
      0,

    executionReady:
      errors.length ===
        0 &&
      validQuote &&
      quoteFresh,

    candles,

    quote,

    latestBar,

    warnings,

    errors,
  };
}

/**
 * ============================================================
 * LIQUIDITY INPUT
 * ============================================================
 */

function buildLiquidityInput({
  market,
  overrides,
}) {
  const quote =
    market.quote;

  const latestBar =
    market.latestBar;

  const bid =
    positiveNumberOrNull(
      quote?.bid,
    );

  const ask =
    positiveNumberOrNull(
      quote?.ask,
    );

  const close =
    positiveNumberOrNull(
      latestBar?.close,
    );

  const midpoint =
    (
      bid !== null &&
      ask !== null
    )
      ? (
          bid +
          ask
        ) /
        2
      : null;

  const price =
    positiveNumberOrNull(
      overrides?.price,
    ) ??
    midpoint ??
    close;

  return {
    price,

    bid:
      positiveNumberOrNull(
        overrides?.bid,
      ) ??
      bid,

    ask:
      positiveNumberOrNull(
        overrides?.ask,
      ) ??
      ask,

    currentVolume:
      numberOrNull(
        overrides
          ?.currentVolume,
      ) ??
      numberOrNull(
        latestBar
          ?.volume,
      ),

    averageVolume:
      numberOrNull(
        overrides
          ?.averageVolume,
      ),

    positionValue:
      numberOrNull(
        overrides
          ?.positionValue,
      ),

    volatilityPercent:
      numberOrNull(
        overrides
          ?.volatilityPercent,
      ),

    session:
      overrides
        ?.session ??
      null,
  };
}

/**
 * ============================================================
 * RISK / REWARD INPUT
 * ============================================================
 *
 * Do NOT manufacture stops, targets, probabilities, or R values.
 */

function buildRiskRewardInput({
  market,

  liquidity,

  overrides,
}) {
  const entryPrice =
    positiveNumberOrNull(
      overrides
        ?.entryPrice,
    ) ??
    positiveNumberOrNull(
      liquidity?.price,
    ) ??
    positiveNumberOrNull(
      market
        ?.latestBar
        ?.close,
    );

  return {
    entryPrice,

    longStopPrice:
      positiveNumberOrNull(
        overrides
          ?.longStopPrice,
      ),

    shortStopPrice:
      positiveNumberOrNull(
        overrides
          ?.shortStopPrice,
      ),

    longTargetPrice:
      positiveNumberOrNull(
        overrides
          ?.longTargetPrice,
      ),

    shortTargetPrice:
      positiveNumberOrNull(
        overrides
          ?.shortTargetPrice,
      ),

    longTargetR:
      numberOrNull(
        overrides
          ?.longTargetR,
      ),

    shortTargetR:
      numberOrNull(
        overrides
          ?.shortTargetR,
      ),

    longWinProbability:
      numberOrNull(
        overrides
          ?.longWinProbability,
      ),

    shortWinProbability:
      numberOrNull(
        overrides
          ?.shortWinProbability,
      ),
  };
}

/**
 * ============================================================
 * PROVIDER DATA EXTRACTION
 * ============================================================
 *
 * These deliberately return empty objects/arrays if a provider
 * is unavailable.
 *
 * They do NOT invent fallback intelligence.
 */

function extractCompanyInput(
  provider,
) {
  if (
    provider
      ?.approved !==
    true
  ) {
    return {};
  }

  const result =
    provider.result;

  if (
    !result ||
    typeof result !==
      "object"
  ) {
    return {};
  }

  const data =
    (
      result.data &&
      typeof result.data ===
        "object" &&
      !Array.isArray(
        result.data,
      )
    )
      ? result.data
      : {};

  const metadata =
    (
      data.metadata &&
      typeof data.metadata ===
        "object" &&
      !Array.isArray(
        data.metadata,
      )
    )
      ? data.metadata
      : (
          result.metadata &&
          typeof result.metadata ===
            "object" &&
          !Array.isArray(
            result.metadata,
          )
        )
        ? result.metadata
        : {};

  /**
   * Provider-level fields such as fundamentalCoverage,
   * provenance, and conflicts live outside result.data in the
   * company fundamental aggregator. Preserve them here instead
   * of silently dropping them before the orchestrator.
   *
   * Sector / industry are also normalized from either:
   *
   * - result.data
   * - result.data.metadata
   * - result
   *
   * This keeps the runner compatible with both the aggregated
   * provider contract and older/raw provider shapes.
   */
  return {
    ...data,

    sector:
      data.sector ??
      metadata.sector ??
      result.sector ??
      null,

    industry:
      data.industry ??
      metadata.industry ??
      result.industry ??
      null,

    countryCode:
      data.countryCode ??
      metadata.countryCode ??
      result.countryCode ??
      null,

    fundamentalCoverage:
      data.fundamentalCoverage ??
      result.fundamentalCoverage ??
      null,

    provenance:
      data.provenance ??
      result.provenance ??
      null,

    conflicts:
      data.conflicts ??
      result.conflicts ??
      [],
  };
}

function extractMacroInput(
  provider,
) {
  if (
    provider
      ?.approved !==
    true
  ) {
    return {};
  }

  const result =
    provider.result;

  if (
    result?.data &&
    typeof result.data ===
      "object"
  ) {
    return {
      ...result.data,
    };
  }

  return {};
}

function extractCountryInput(
  provider,
) {
  if (
    provider
      ?.approved !==
    true
  ) {
    return {};
  }

  const result =
    provider.result;

  if (
    result?.data &&
    typeof result.data ===
      "object"
  ) {
    return {
      ...result.data,
    };
  }

  return {};
}

function extractEvents(
  provider,
) {
  if (
    provider
      ?.approved !==
    true
  ) {
    return [];
  }

  const result =
    provider.result;

  if (
    Array.isArray(
      result?.events,
    )
  ) {
    return result.events;
  }

  if (
    Array.isArray(
      result?.data,
    )
  ) {
    return result.data;
  }

  if (
    Array.isArray(
      result
        ?.data
        ?.events,
    )
  ) {
    return result
      .data
      .events;
  }

  return [];
}

/**
 * ============================================================
 * PROVIDER DIAGNOSTICS
 * ============================================================
 */


function buildProviderDiagnostics(
  providers,
) {
  const diagnostics =
    {};

  for (
    const [
      key,
      provider,
    ]
    of Object.entries(
      providers,
    )
  ) {
    diagnostics[
      key
    ] = {
      supplied:
        provider
          ?.supplied ===
        true,

      approved:
        provider
          ?.approved ===
        true,

      status:
        provider
          ?.status ??
        "UNKNOWN",

      error:
        provider
          ?.error ??
        null,
    };
  }

  return diagnostics;
}

/**
 * ============================================================
 * MAIN RUNNER
 * ============================================================
 */

export async function runStockAnalysis({
  symbol,

  /**
   * When true, the orchestrator may acquire live Adanos social
   * intelligence.
   */
  useLiveSocial =
    true,

  liveSocialConfig = {},

  /**
   * Optional providers.
   *
   * Functions are injected so this runner remains testable and
   * does not accidentally spend API credits during unit tests.
   */
  providers = {},

  /**
   * Optional explicit inputs.
   *
   * Explicit values take precedence over provider-derived
   * values.
   */
  inputs = {},

  minimumCandles =
    DEFAULT_MINIMUM_CANDLES,

  providerTimeoutMs =
    30_000,

  engineTimeoutMs =
    30_000,

  runnerTimeoutMs =
    DEFAULT_TIMEOUT_MS,

  /**
   * Optional stage boundary for integration testing.
   */
  stopAfter =
    null,

  /**
   * Optional orchestrator state callback.
   */
  onUpdate =
    null,
} = {}) {
  const startedAt =
    now();

  const normalizedSymbol =
    normalizeSymbol(
      symbol,
    );

  /**
   * ======================================================
   * PROVIDER NORMALIZATION
   * ======================================================
   *
   * IMPORTANT:
   * JavaScript default-parameter objects are replaced in full
   * when a caller supplies any providers object. That previously
   * allowed liveStockAnalysisService to pass company/macro/etc.
   * while accidentally deleting the default institutional
   * provider.
   *
   * Merge defaults HERE instead.
   *
   * - Missing institutional property -> real default service.
   * - institutional: null -> explicitly disabled.
   * - institutional: mockFn -> injected test/research provider.
   *
   * No provider failure is converted into positive evidence;
   * runOptionalProvider still fails closed.
   */
  const suppliedProviders =
    (
      providers &&
      typeof providers === "object" &&
      !Array.isArray(providers)
    )
      ? providers
      : {};

  const effectiveProviders = {
    company:
      suppliedProviders.company ??
      null,

    macro:
      suppliedProviders.macro ??
      null,

    country:
      suppliedProviders.country ??
      null,

    events:
      suppliedProviders.events ??
      null,

    institutional:
      Object.prototype.hasOwnProperty.call(
        suppliedProviders,
        "institutional",
      )
        ? suppliedProviders.institutional
        : getInstitutionalEvidence,
  };

  if (!normalizedSymbol) {
    return {
      approved:
        false,

      service:
        "STOCK_ANALYSIS_RUNNER",

      status:
        STOCK_ANALYSIS_RUNNER_STATUS
          .INVALID_REQUEST,

      symbol:
        null,

      executionReady:
        false,

      analysis:
        null,

      warnings: [],

      errors: [
        "A non-empty trading symbol is required.",
      ],

      startedAt,

      completedAt:
        now(),
    };
  }

  try {
    /**
     * ======================================================
     * MARKET DATA
     * ======================================================
     */

    const snapshot =
      createMarketSnapshot(
        normalizedSymbol,
      );

    // MarketDataHub status describes DATA readiness, not whether
    // NYSE/Nasdaq is currently open.
    const marketDataStatus =
      getMarketDataStatus(
        normalizedSymbol,
      );

    // Authoritative exchange-session state. Failure is UNKNOWN,
    // never silently converted to CLOSED.
    const marketSession =
      await getMarketClock();

    const market =
      inspectMarketSnapshot({
        snapshot,

        minimumCandles,
      });

    /**
     * Without sufficient candles, technical analysis is not
     * trustworthy enough to run the trading pipeline.
     */
    if (
      market
        .usableForAnalysis !==
      true
    ) {
      return {
        approved:
          false,

        service:
          "STOCK_ANALYSIS_RUNNER",

        status:
          STOCK_ANALYSIS_RUNNER_STATUS
            .INSUFFICIENT_DATA,

        symbol:
          normalizedSymbol,

        executionReady:
          false,

        market: {
          // Preserve the old data-status information explicitly.
          status:
            marketDataStatus,

          dataStatus:
            marketDataStatus,

          session:
            marketSession,

          candleCount:
            market
              .candles
              .length,

          quoteFresh:
            snapshot
              ?.quoteFresh ===
            true,
        },

        analysis:
          null,

        warnings:
          market.warnings,

        errors:
          market.errors,

        startedAt,

        completedAt:
          now(),
      };
    }

    /**
     * ======================================================
     * EXTERNAL INTELLIGENCE
     * ======================================================
     *
     * Independent providers execute concurrently.
     */

    const [
      companyProvider,
      macroProvider,
      countryProvider,
      eventsProvider,
      institutionalProvider,
    ] =
      await Promise.all([
        runOptionalProvider({
          name:
            "COMPANY_FUNDAMENTALS",

          fn:
            typeof effectiveProviders
              ?.company ===
            "function"
              ? () =>
                  effectiveProviders
  .company({
    symbol:
      normalizedSymbol,

    asOfDate:
      inputs
        ?.asOfDate ??
      null,
  })
              : null,

          timeoutMs:
            providerTimeoutMs,
        }),

        runOptionalProvider({
          name:
            "US_MACRO",

          fn:
            typeof effectiveProviders
              ?.macro ===
            "function"
              ? () =>
                  effectiveProviders
                    .macro({
                      asOfDate:
                        inputs
                          ?.asOfDate ??
                        null,
                    })
              : null,

          timeoutMs:
            providerTimeoutMs,
        }),

        runOptionalProvider({
          name:
            "US_COUNTRY_RISK",

          fn:
            typeof effectiveProviders
              ?.country ===
            "function"
              ? () =>
                  effectiveProviders
                    .country({
                      asOfDate:
                        inputs
                          ?.asOfDate ??
                        null,
                    })
              : null,

          timeoutMs:
            providerTimeoutMs,
        }),

        runOptionalProvider({
          name:
            "MARKET_EVENTS",

          fn:
            typeof effectiveProviders
              ?.events ===
            "function"
              ? () =>
                  effectiveProviders
                    .events({
                      symbol:
                        normalizedSymbol,

                      country:
                        inputs
                          ?.country ??
                        "US",

                      asOfTimestamp:
                        inputs
                          ?.asOfTimestamp ??
                        now(),
                    })
              : null,

          timeoutMs:
            providerTimeoutMs,
        }),

        runOptionalProvider({
          name:
            "INSTITUTIONAL_EVIDENCE",

          fn:
            typeof effectiveProviders
              ?.institutional ===
            "function"
              ? () =>
                  effectiveProviders
                    .institutional({
                      symbol:
                        normalizedSymbol,

                      asOf:
                        inputs
                          ?.asOfTimestamp ??
                        inputs
                          ?.asOfDate ??
                        now(),

                      managers:
                        inputs
                          ?.institutionalManagers ??
                        null,
                    })
              : null,

          timeoutMs:
            providerTimeoutMs,
        }),
      ]);

    const providerResults = {
      company:
        companyProvider,

      macro:
        macroProvider,

      country:
        countryProvider,

      events:
        eventsProvider,

      institutional:
        institutionalProvider,
    };

    /**
     * ======================================================
     * BUILD ORCHESTRATOR INPUT
     * ======================================================
     */

    const liquidity =
      buildLiquidityInput({
        market,

        overrides:
          inputs
            ?.liquidity ??
          {},
      });

    const riskReward =
      buildRiskRewardInput({
        market,

        liquidity,

        overrides:
          inputs
            ?.riskReward ??
          {},
      });

    const providerCompanyInput =
      extractCompanyInput(
        companyProvider,
      );

    const explicitCompanyInput =
      (
        inputs
          ?.companyInput &&
        typeof inputs
          .companyInput ===
          "object" &&
        !Array.isArray(
          inputs.companyInput,
        )
      )
        ? inputs.companyInput
        : {};

    /**
     * Explicit company inputs override provider-derived fields,
     * but a partial explicit object must NOT discard the rest of
     * the aggregated company dataset.
     *
     * This is especially important for:
     *
     * - sector / industry
     * - valuation
     * - profitability
     * - balance-sheet metrics
     * - capital allocation
     * - forward data
     * - fundamentalCoverage
     */
    const companyInput = {
      ...providerCompanyInput,
      ...explicitCompanyInput,

      sector:
        explicitCompanyInput
          .sector ??
        providerCompanyInput
          .sector ??
        null,

      industry:
        explicitCompanyInput
          .industry ??
        providerCompanyInput
          .industry ??
        null,

      countryCode:
        explicitCompanyInput
          .countryCode ??
        providerCompanyInput
          .countryCode ??
        null,

      fundamentalCoverage:
        explicitCompanyInput
          .fundamentalCoverage ??
        providerCompanyInput
          .fundamentalCoverage ??
        null,
    };

    const macroInput =
      inputs
        ?.macroInput ??
      extractMacroInput(
        macroProvider,
      );

    const countryInput =
      inputs
        ?.countryInput ??
      extractCountryInput(
        countryProvider,
      );

    const events =
      Array.isArray(
        inputs?.events,
      )
        ? inputs.events
        : extractEvents(
            eventsProvider,
          );

    /**
     * ======================================================
     * INSTITUTIONAL POSITION INPUT
     * ======================================================
     *
     * Explicit evidence always takes precedence.
     *
     * Otherwise use the normalized evidence returned by
     * institutionalEvidenceService.js.
     *
     * The provider/service is responsible for preserving raw
     * SEC/FINRA source diagnostics and for refusing to invent
     * institutional position changes.
     */
    const explicitInstitutionalInput =
      (
        inputs
          ?.institutionalInput &&
        typeof inputs
          .institutionalInput ===
          "object" &&
        !Array.isArray(
          inputs.institutionalInput,
        )
      )
        ? inputs.institutionalInput
        : null;

    const providerInstitutionalEvidence =
      (
        institutionalProvider
          ?.supplied ===
          true &&
        institutionalProvider
          ?.result
          ?.evidence &&
        typeof institutionalProvider
          .result
          .evidence ===
          "object" &&
        !Array.isArray(
          institutionalProvider
            .result
            .evidence,
        )
      )
        ? institutionalProvider
            .result
            .evidence
        : null;

    /**
     * Preserve real partial evidence for the engine to validate.
     *
     * We intentionally do NOT synthesize any institutional
     * counts, ownership percentages, or directional values here.
     * The Institutional Position Engine remains responsible for
     * deciding whether the supplied real evidence is sufficient.
     */
    const institutionalInput =
      explicitInstitutionalInput ??
      providerInstitutionalEvidence;

    /**
     * ======================================================
     * ORCHESTRATOR
     * ======================================================
     */

    const orchestratorInput = {
      symbol:
        normalizedSymbol,

      account:
        inputs
          ?.account ??
        null,

      correlationInput:
        inputs
          ?.correlationInput ??
        {
          candidateReturns: [],
          positionReturns: {},
        },

      candles:
        market.candles,

      breadth:
        inputs
          ?.breadth ??
        null,

      volatility:
        inputs
          ?.volatility ??
        null,

      liquidity,

      executionTiming:
        inputs
          ?.executionTiming ??
        null,

      marketShock:
        inputs
          ?.marketShock ??
        null,

      orderExecution:
        inputs
          ?.orderExecution ??
        (
          market
            .executionReady
            ? {
                bid:
                  liquidity.bid,

                ask:
                  liquidity.ask,

                lastPrice:
                  liquidity.price,

                quoteTimestamp:
                  market
                    .quote
                    ?.timestamp ??
                  null,

                ...(
                  inputs
                    ?.orderExecution ??
                  {}
                ),
              }
            : null
        ),

      riskReward,

      macroInput,

      countryInput,

      companyInput,

      events,

      /**
       * Real normalized institutional evidence.
       *
       * Null means no usable institutional provider response was
       * available. The Institutional Position Engine will then
       * fail closed with INSUFFICIENT_DATA.
       */
      institutionalInput,

      socialInput:
        inputs
          ?.socialInput ??
        {},

      useLiveSocial:
        inputs
          ?.socialInput &&
        Object.keys(
          inputs.socialInput,
        ).length >
          0
          ? false
          : useLiveSocial,

      liveSocialConfig,

      historicalRecords:
        Array.isArray(
          inputs
            ?.historicalRecords,
        )
          ? inputs
              .historicalRecords
          : [],

          /**
 * Bot's own CLOSED / COMPLETED trade history.
 *
 * This MUST remain separate from market-history
 * analogue records.
 */
botTradeHistory:
  Array.isArray(
    inputs
      ?.botTradeHistory,
  )
    ? inputs
        .botTradeHistory
    : [],

      asOfTimestamp:
        inputs
          ?.asOfTimestamp ??
        Date.now(),

      stopAfter,

      engineTimeoutMs,

      onUpdate,
    };

    const analysis =
      await withTimeout({
        task:
          () =>
            runTradingAnalysis(
              orchestratorInput,
            ),

        timeoutMs:
          runnerTimeoutMs,

        label:
          "Trading analysis",
      });

    /**
     * ======================================================
     * EXECUTION SAFETY
     * ======================================================
     *
     * Runner readiness AND orchestrator approval are required.
     *
     * This runner still does NOT place an order.
     */

    const orchestratorExecutionApproved =
      analysis
        ?.finalDecision
        ?.canProceedToPaperExecution ===
      true;

    const executionReady =
      market
        .executionReady ===
        true &&
      stopAfter ===
        null &&
      orchestratorExecutionApproved;

    const warnings = [
      ...market.warnings,
    ];

    for (
      const provider
      of Object.values(
        providerResults,
      )
    ) {
      if (
        provider
          ?.supplied ===
          true &&
        provider
          ?.approved !==
          true
      ) {
        warnings.push(
          `${provider.name} was unavailable or unapproved and was not treated as positive evidence.`,
        );
      }

      if (
        provider
          ?.error
      ) {
        warnings.push(
          `${provider.name}: ${provider.error}`,
        );
      }

      if (
        provider
          ?.result &&
        Array.isArray(
          provider.result.warnings,
        )
      ) {
        for (
          const providerWarning
          of provider.result.warnings
        ) {
          if (
            providerWarning &&
            !warnings.includes(
              providerWarning,
            )
          ) {
            warnings.push(
              providerWarning,
            );
          }
        }
      }
    }

    if (
      market
        .executionReady !==
      true
    ) {
      warnings.push(
        "Execution readiness is disabled because a fresh valid live quote is unavailable.",
      );
    }

    if (
      stopAfter !==
      null
    ) {
      warnings.push(
        "This is a partial pipeline run. Execution readiness is forcibly disabled.",
      );
    }

    if (
      orchestratorExecutionApproved &&
      market
        .executionReady !==
      true
    ) {
      warnings.push(
        "The orchestrator indicated paper-execution eligibility, but the runner blocked execution because live market-data requirements were not satisfied.",
      );
    }

    const status =
      executionReady
        ? STOCK_ANALYSIS_RUNNER_STATUS
            .COMPLETE
        : STOCK_ANALYSIS_RUNNER_STATUS
            .ANALYSIS_ONLY;

    return {
      approved:
        analysis
          ?.approved ===
        true,

      service:
        "STOCK_ANALYSIS_RUNNER",

      status,

      symbol:
        normalizedSymbol,

      /**
       * IMPORTANT:
       *
       * executionReady is the runner-level final safety flag.
       *
       * Do not execute from analysis.finalDecision alone.
       */
      executionReady,

      market: {
        // Session status and quote freshness are deliberately separate.
        session:
          marketSession,

        dataStatus:
          marketDataStatus,

        candleCount:
          market
            .candles
            .length,

        historicalLoaded:
          snapshot
            ?.historicalLoaded ===
          true,

        historicalCandleCount:
          snapshot
            ?.historicalCandleCount ??
          0,

        liveBarCount:
          snapshot
            ?.liveBarCount ??
          0,

        quoteCount:
          snapshot
            ?.quoteCount ??
          0,

        hasQuote:
          Boolean(
            market.quote,
          ),

        quoteFresh:
          snapshot
            ?.quoteFresh ===
          true,

        executionReady:
          market
            .executionReady,

        latestBar:
          market
            .latestBar
            ? {
                timestamp:
                  market
                    .latestBar
                    .timestamp ??
                  null,

                close:
                  market
                    .latestBar
                    .close ??
                  null,

                volume:
                  market
                    .latestBar
                    .volume ??
                  null,
              }
            : null,

        latestQuote:
          market.quote
            ? {
                timestamp:
                  market
                    .quote
                    .timestamp ??
                  null,

                bid:
                  market
                    .quote
                    .bid ??
                  null,

                ask:
                  market
                    .quote
                    .ask ??
                  null,

                bidSize:
                  market
                    .quote
                    .bidSize ??
                  null,

                askSize:
                  market
                    .quote
                    .askSize ??
                  null,
              }
            : null,
      },

      providers: {
        ...buildProviderDiagnostics(
          providerResults,
        ),

        institutionalSources:
          institutionalProvider
            ?.result
            ?.providers ??
          null,
      },

      analysis,

      finalDecision:
        analysis
          ?.finalDecision ??
        null,

      warnings,

      errors: [],

      startedAt,

      completedAt:
        now(),
    };
  } catch (error) {
    return {
      approved:
        false,

      service:
        "STOCK_ANALYSIS_RUNNER",

      status:
        STOCK_ANALYSIS_RUNNER_STATUS
          .ERROR,

      symbol:
        normalizedSymbol,

      executionReady:
        false,

      analysis:
        null,

      finalDecision:
        null,

      warnings: [
        "Stock analysis failed safely. No trade execution should occur.",
      ],

      errors: [
        safeErrorMessage(
          error,
        ),
      ],

      startedAt,

      completedAt:
        now(),
    };
  }
}

export default runStockAnalysis;