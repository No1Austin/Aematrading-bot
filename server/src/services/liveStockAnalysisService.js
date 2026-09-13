/**
 * ============================================================
 * LIVE STOCK ANALYSIS SERVICE
 * ============================================================
 *
 * PURPOSE
 * -------
 *
 * Production-facing service that connects the real external
 * intelligence providers to:
 *
 *   stockAnalysisRunner
 *          ↓
 *   engineOrchestrator
 *          ↓
 *   risk pipeline
 *
 * IMPORTANT
 * ---------
 *
 * This service:
 *
 * - does NOT place orders
 * - does NOT bypass the orchestrator
 * - does NOT fabricate missing provider data
 * - does NOT convert provider failure into positive evidence
 * - does NOT make execution possible without runner approval
 *
 * The final execution authority exposed by this layer is:
 *
 *   result.executionReady === true
 *
 * Even that flag does NOT itself place an order.
 */

/**
 * ============================================================
 * IMPORTS
 * ============================================================
 */

import runStockAnalysis from
  "./stockAnalysisRunner.js";

import {
  getAggregatedCompanyFundamentalData,
} from
  "../data/providers/companyFundamentalAggregator.js";

import {
  getUSMacroData,
} from
  "../data/providers/usMacroDataProvider.js";

import {
  getUSCountryRiskData,
} from
  "../data/providers/usCountryRiskDataProvider.js";

import {
  getMarketEvents,
} from
  "../data/providers/marketEventDataProvider.js";

import historicalRecordsProvider from
  "../data/providers/historicalRecordsProvider.js";

import {
  getInstitutionalEvidence,
} from "./institutionalEvidenceBootstrap.js";
/**
 * ============================================================
 * STATUS
 * ============================================================
 */

export const LIVE_STOCK_ANALYSIS_STATUS =
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

/**
 * ============================================================
 * DEFAULTS
 * ============================================================
 */

const DEFAULT_MINIMUM_CANDLES =
  50;

const DEFAULT_PROVIDER_TIMEOUT_MS =
  30_000;

const DEFAULT_ENGINE_TIMEOUT_MS =
  30_000;

const DEFAULT_RUNNER_TIMEOUT_MS =
  45_000;

const DEFAULT_HISTORICAL_RECORDS_TIMEOUT_MS =
  30_000;

/**
 * ============================================================
 * HELPERS
 * ============================================================
 */

function now() {
  return new Date()
    .toISOString();
}

function normalizeSymbol(
  value,
) {
  const normalized =
    String(
      value ??
      "",
    )
      .trim()
      .toUpperCase();

  return normalized ||
    null;
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

function positiveInteger(
  value,
  fallback,
) {
  const parsed =
    Number(
      value,
    );

  if (
    !Number.isFinite(
      parsed,
    ) ||
    parsed <= 0
  ) {
    return fallback;
  }

  return Math.floor(
    parsed,
  );
}

async function withTimeout({
  task,
  timeoutMs,
  label,
}) {
  if (typeof task !== "function") {
    throw new TypeError(
      `${label ?? "Task"} must be a function.`,
    );
  }

  const limit =
    positiveInteger(
      timeoutMs,
      DEFAULT_HISTORICAL_RECORDS_TIMEOUT_MS,
    );

  let timer = null;

  try {
    return await Promise.race([
      Promise.resolve().then(task),

      new Promise((_resolve, reject) => {
        timer = setTimeout(
          () => reject(
            new Error(
              `${label ?? "Task"} timed out after ${limit}ms.`,
            ),
          ),
          limit,
        );
      }),
    ]);
  } finally {
    if (timer !== null) {
      clearTimeout(timer);
    }
  }
}

function normalizeObject(
  value,
) {
  return (
    value &&
    typeof value ===
      "object" &&
    !Array.isArray(
      value,
    )
  )
    ? value
    : {};
}

/**
 * ============================================================
 * LIVE PROVIDER WRAPPERS
 * ============================================================
 *
 * Keep these wrappers deliberately thin.
 *
 * stockAnalysisRunner already:
 *
 * - applies provider timeouts
 * - catches provider exceptions
 * - records unavailable providers
 * - refuses to treat failure as positive evidence
 *
 * Therefore this layer should NOT duplicate those decisions.
 */

async function companyProvider({
  symbol,

  asOfDate = null,

  asOfTimestamp = null,
} = {}) {
  const resolvedAsOfDate =
    asOfDate ??
    asOfTimestamp ??
    null;

  return getAggregatedCompanyFundamentalData({
    symbol,

    asOfDate:
      resolvedAsOfDate,
  });
}

async function macroProvider({
  asOfDate = null,
} = {}) {
  return getUSMacroData({
    asOfDate,
  });
}

async function countryProvider({
  asOfDate = null,
} = {}) {
  return getUSCountryRiskData({
    asOfDate,
  });
}

async function eventsProvider({
  symbol,

  country = "US",

  asOfTimestamp =
    null,
} = {}) {
  return getMarketEvents({
    symbol,

    country,

    asOfTimestamp:
      asOfTimestamp ??
      now(),
  });
}

/**
 * Institutional evidence provider.
 *
 * This explicitly wires the production live-analysis path to the
 * institutional evidence service instead of depending on an implicit
 * fallback inside stockAnalysisRunner.
 *
 * Missing SEC/FINRA evidence remains missing evidence; it is never
 * converted into positive institutional conviction.
 */
async function institutionalProvider({
  symbol,

  asOf = null,

  asOfDate = null,

  asOfTimestamp = null,

  managers = null,
} = {}) {
  const normalizedSymbol =
    normalizeSymbol(symbol);

  if (!normalizedSymbol) {
    return {
      approved: false,
      service: "INSTITUTIONAL_EVIDENCE",
      status: "INVALID_REQUEST",
      symbol: null,
      evidence: null,
      warnings: [],
      errors: [
        "A non-empty trading symbol is required for institutional evidence.",
      ],
    };
  }

  return getInstitutionalEvidence({
    symbol:
      normalizedSymbol,

    asOf:
      asOf ??
      asOfTimestamp ??
      asOfDate ??
      now(),

    managers:
      Array.isArray(managers)
        ? managers
        : null,
  });
}

/**
 * ============================================================
 * REAL PROVIDER SET
 * ============================================================
 *
 * Exported primarily for:
 *
 * - integration testing
 * - diagnostics
 * - future provider replacement
 */

export const LIVE_STOCK_PROVIDERS =
  Object.freeze({
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
  });

/**
 * ============================================================
 * BUILD SAFE ERROR RESULT
 * ============================================================
 */

function buildFailureResult({
  symbol,

  status,

  error,

  startedAt,
}) {
  return {
    approved:
      false,

    service:
      "LIVE_STOCK_ANALYSIS",

    status,

    symbol:
      symbol ??
      null,

    executionReady:
      false,

    analysis:
      null,

    finalDecision:
      null,

    runnerResult:
      null,

    warnings: [
      "Live stock analysis failed safely. No trade execution should occur.",
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

/**
 * ============================================================
 * MAIN LIVE ANALYSIS
 * ============================================================
 */

export async function runLiveStockAnalysis({
  symbol,

  /**
   * Live social intelligence.
   *
   * Adanos acquisition remains inside the social service /
   * orchestrator path already tested separately.
   */
  useLiveSocial =
    true,

  liveSocialConfig = {},

  /**
   * Additional orchestrator inputs.
   *
   * These can contain:
   *
   * account
   * correlationInput
   * breadth
   * volatility
   * liquidity
   * riskReward
   * executionTiming
   * marketShock
   * orderExecution
   * historicalRecords
   * socialInput
   *
   * Explicit inputs remain useful for deterministic tests and
   * later upstream services.
   */
  inputs = {},

  /**
   * Safety configuration.
   */
  minimumCandles =
    DEFAULT_MINIMUM_CANDLES,

  providerTimeoutMs =
    DEFAULT_PROVIDER_TIMEOUT_MS,

  engineTimeoutMs =
    DEFAULT_ENGINE_TIMEOUT_MS,

  runnerTimeoutMs =
    DEFAULT_RUNNER_TIMEOUT_MS,

  historicalRecordsTimeoutMs =
    DEFAULT_HISTORICAL_RECORDS_TIMEOUT_MS,

  /**
   * Integration/research boundary.
   *
   * Any non-null stopAfter must remain non-executable.
   */
  stopAfter =
    null,

  /**
   * Optional frontend/live-state callback.
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
   * ========================================================
   * VALIDATE SYMBOL
   * ========================================================
   */

  if (!normalizedSymbol) {
    return {
      approved:
        false,

      service:
        "LIVE_STOCK_ANALYSIS",

      status:
        LIVE_STOCK_ANALYSIS_STATUS
          .INVALID_REQUEST,

      symbol:
        null,

      executionReady:
        false,

      analysis:
        null,

      finalDecision:
        null,

      runnerResult:
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
    const normalizedInputs =
      normalizeObject(
        inputs,
      );

    const safeInputs = {
      ...normalizedInputs,
    };

    const safeLiveSocialConfig =
      normalizeObject(
        liveSocialConfig,
      );

    /**
     * ======================================================
     * HISTORICAL ANALOGUE RECORDS
     * ======================================================
     *
     * Explicit historicalRecords supplied by the caller are
     * authoritative. This preserves deterministic tests,
     * controlled research and replay workflows.
     *
     * For normal live analysis, acquire the bot's point-in-time
     * market-history records here and forward them through the
     * runner's existing inputs contract.
     *
     * IMPORTANT:
     *
     * - provider failure is fail-soft: analysis may continue
     * - missing history never becomes fabricated evidence
     * - botTradeHistory remains a separate input
     * - historicalRecordsProvider owns look-ahead protection
     */

    let historicalRecordsWarning =
      null;

    if (
      !Array.isArray(
        normalizedInputs
          ?.historicalRecords,
      )
    ) {
      try {
        const historicalRecords =
          await withTimeout({
            task:
              () =>
                historicalRecordsProvider({
                  symbol:
                    normalizedSymbol,

                  asOfTimestamp:
                    normalizedInputs
                      ?.asOfTimestamp ??
                    Date.now(),

                  candles:
                    Array.isArray(
                      normalizedInputs
                        ?.candles,
                    )
                      ? normalizedInputs
                          .candles
                      : [],
                }),

            timeoutMs:
              positiveInteger(
                historicalRecordsTimeoutMs,
                DEFAULT_HISTORICAL_RECORDS_TIMEOUT_MS,
              ),

            label:
              "Historical records provider",
          });

        safeInputs.historicalRecords =
          Array.isArray(
            historicalRecords,
          )
            ? historicalRecords
            : [];
      } catch (error) {
        safeInputs.historicalRecords =
          [];

        historicalRecordsWarning =
          `Historical analogue records were unavailable: ${safeErrorMessage(
            error,
          )}`;
      }
    }

    /**
     * ======================================================
     * RUN PRODUCTION ANALYSIS
     * ======================================================
     *
     * IMPORTANT:
     *
     * Real providers are injected here.
     *
     * The core stockAnalysisRunner remains independently
     * testable and therefore does not directly own API
     * credentials or provider imports.
     */

    const runnerResult =
      await runStockAnalysis({
        symbol:
          normalizedSymbol,

        useLiveSocial:
          useLiveSocial ===
          true,

        liveSocialConfig:
          safeLiveSocialConfig,

        providers:
          LIVE_STOCK_PROVIDERS,

        inputs:
          safeInputs,

        minimumCandles:
          positiveInteger(
            minimumCandles,
            DEFAULT_MINIMUM_CANDLES,
          ),

        providerTimeoutMs:
          positiveInteger(
            providerTimeoutMs,
            DEFAULT_PROVIDER_TIMEOUT_MS,
          ),

        engineTimeoutMs:
          positiveInteger(
            engineTimeoutMs,
            DEFAULT_ENGINE_TIMEOUT_MS,
          ),

        runnerTimeoutMs:
          positiveInteger(
            runnerTimeoutMs,
            DEFAULT_RUNNER_TIMEOUT_MS,
          ),

        stopAfter,

        onUpdate,
      });

    /**
     * ======================================================
     * FAIL-CLOSED RESULT VALIDATION
     * ======================================================
     *
     * Never trust an undefined/malformed runner response.
     */

    if (
      !runnerResult ||
      typeof runnerResult !==
        "object"
    ) {
      return buildFailureResult({
        symbol:
          normalizedSymbol,

        status:
          LIVE_STOCK_ANALYSIS_STATUS
            .ERROR,

        error:
          new Error(
            "Stock analysis runner returned an invalid result.",
          ),

        startedAt,
      });
    }

    /**
     * ======================================================
     * EXECUTION READINESS
     * ======================================================
     *
     * We deliberately recalculate this instead of blindly
     * forwarding the runner flag.
     *
     * Requirements:
     *
     * 1. runner approved
     * 2. runner executionReady
     * 3. complete production run
     * 4. final decision explicitly permits paper execution
     *
     * This provides another fail-closed boundary between the
     * intelligence system and the future execution service.
     */

    const runnerApproved =
      runnerResult
        ?.approved ===
      true;

    const runnerExecutionReady =
      runnerResult
        ?.executionReady ===
      true;

    const finalDecisionAllowsExecution =
      runnerResult
        ?.finalDecision
        ?.canProceedToPaperExecution ===
      true;

    const isFullProductionRun =
      stopAfter ===
      null ||
      stopAfter ===
      undefined;

    const executionReady =
      runnerApproved &&
      runnerExecutionReady &&
      finalDecisionAllowsExecution &&
      isFullProductionRun;

    /**
     * ======================================================
     * WARNINGS
     * ======================================================
     */

    const warnings =
      Array.isArray(
        runnerResult
          ?.warnings,
      )
        ? [
            ...runnerResult
              .warnings,
          ]
        : [];

    if (
      historicalRecordsWarning
    ) {
      warnings.push(
        historicalRecordsWarning,
      );
    }

    if (
      runnerExecutionReady &&
      !runnerApproved
    ) {
      warnings.push(
        "Runner reported execution readiness without overall approval. Live service blocked execution.",
      );
    }

    if (
      runnerExecutionReady &&
      !finalDecisionAllowsExecution
    ) {
      warnings.push(
        "Runner reported execution readiness but the final decision did not explicitly permit paper execution. Live service blocked execution.",
      );
    }

    if (
      !isFullProductionRun
    ) {
      warnings.push(
        "Partial pipeline runs are analysis-only and cannot become execution ready.",
      );
    }

    /**
     * ======================================================
     * STATUS
     * ======================================================
     */

    let status =
      runnerResult
        ?.status ??
      LIVE_STOCK_ANALYSIS_STATUS
        .ERROR;

    if (
      executionReady
    ) {
      status =
        LIVE_STOCK_ANALYSIS_STATUS
          .COMPLETE;
    } else if (
      runnerApproved &&
      (
        status ===
          "COMPLETE" ||
        status ===
          "ANALYSIS_ONLY"
      )
    ) {
      status =
        LIVE_STOCK_ANALYSIS_STATUS
          .ANALYSIS_ONLY;
    }

    /**
     * ======================================================
     * FINAL SERVICE RESULT
     * ======================================================
     */

    return {
      approved:
        runnerApproved,

      service:
        "LIVE_STOCK_ANALYSIS",

      status,

      symbol:
        normalizedSymbol,

      /**
       * This is the only execution-readiness value callers of
       * THIS service should consume.
       *
       * It still does not place an order.
       */
      executionReady,

      market:
        runnerResult
          ?.market ??
        null,

      providers:
        runnerResult
          ?.providers ??
        null,

      analysis:
        runnerResult
          ?.analysis ??
        null,

      finalDecision:
        runnerResult
          ?.finalDecision ??
        null,

      /**
       * Retain the runner result for diagnostics/audit.
       */
      runnerResult,

      warnings,

      errors:
        Array.isArray(
          runnerResult
            ?.errors,
        )
          ? [
              ...runnerResult
                .errors,
            ]
          : [],

      startedAt,

      completedAt:
        now(),
    };
  } catch (error) {
    /**
     * ======================================================
     * ABSOLUTE FAILURE BOUNDARY
     * ======================================================
     *
     * No uncaught service exception may become permission to
     * trade.
     */

    return buildFailureResult({
      symbol:
        normalizedSymbol,

      status:
        LIVE_STOCK_ANALYSIS_STATUS
          .ERROR,

      error,

      startedAt,
    });
  }
}

/**
 * ============================================================
 * ANALYSIS-ONLY CONVENIENCE FUNCTION
 * ============================================================
 *
 * Useful for:
 *
 * - dashboards
 * - research
 * - manual inspection
 * - weekend analysis
 *
 * Even if lower layers somehow return execution approval,
 * this function forcibly removes execution readiness.
 */

export async function runLiveStockAnalysisOnly(
  options = {},
) {
  const result =
    await runLiveStockAnalysis(
      options,
    );

  const warnings =
    Array.isArray(
      result?.warnings,
    )
      ? [
          ...result.warnings,
        ]
      : [];

  if (
    result
      ?.executionReady ===
    true
  ) {
    warnings.push(
      "Execution readiness was intentionally disabled because analysis-only mode was requested.",
    );
  }

  return {
    ...result,

    status:
      result
        ?.approved ===
      true
        ? LIVE_STOCK_ANALYSIS_STATUS
            .ANALYSIS_ONLY
        : result.status,

    executionReady:
      false,

    warnings,
  };
}

/**
 * ============================================================
 * DEFAULT EXPORT
 * ============================================================
 */

export default
  runLiveStockAnalysis;