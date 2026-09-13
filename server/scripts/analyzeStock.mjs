#!/usr/bin/env node

/**
 * ============================================================
 * LIVE STOCK ANALYSIS CLI
 * ============================================================
 *
 * FLOW
 * ----
 *
 * Symbol
 *   ↓
 * Stock Market Data Bootstrap
 *   ↓
 * Alpaca historical candles
 *   ↓
 * MarketDataHub
 *   ↓
 * Live Stock Analysis Service
 *   ↓
 * Stock Analysis Runner
 *   ↓
 * Engine Orchestrator
 *   ↓
 * Risk Pipeline
 *
 * IMPORTANT
 * ---------
 *
 * This script NEVER places an order.
 *
 * Historical market data can make analysis possible.
 * Historical data alone can NEVER authorize execution.
 */

import "dotenv/config";

import bootstrapStockMarketData from
  "../src/services/stockMarketDataBootstrapService.js";

import runLiveStockAnalysis, {
  runLiveStockAnalysisOnly,
} from "../src/services/liveStockAnalysisService.js";

/**
 * ============================================================
 * CONSTANTS
 * ============================================================
 */

const VALID_STOP_STAGES =
  new Set([
    "PORTFOLIO_RISK",
    "CORRELATION_EXPOSURE",
    "VOLATILITY_RISK",
    "DRAWDOWN_RECOVERY",
    "LIQUIDITY_STRESS",
    "EXECUTION_TIMING",
    "MARKET_SHOCK_HALT",
    "ORDER_EXECUTION_QUALITY",
  ]);

const DEFAULT_MINIMUM_BARS =
  250;

const DEFAULT_LOOKBACK_DAYS =
  30;

/**
 * ============================================================
 * HELPERS
 * ============================================================
 */

function normalizeSymbol(
  value,
) {
  if (
    typeof value !==
    "string"
  ) {
    return null;
  }

  const normalized =
    value
      .trim()
      .toUpperCase();

  return normalized ||
    null;
}

function safeArray(
  value,
) {
  return Array.isArray(
    value,
  )
    ? value
    : [];
}

function safeObject(
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

/**
 * ============================================================
 * ARGUMENT PARSING
 * ============================================================
 */

function parseArguments(
  argv,
) {
  const args =
    safeArray(
      argv,
    );

  let symbol =
    null;

  let analysisOnly =
    false;

  let redditOnly =
    false;

  let stopAfter =
    null;

  let minimumBars =
    DEFAULT_MINIMUM_BARS;

  let lookbackDays =
    DEFAULT_LOOKBACK_DAYS;

  const unknownArguments =
    [];

  for (
    const rawArgument
    of args
  ) {
    const argument =
      String(
        rawArgument ??
        "",
      )
        .trim();

    if (!argument) {
      continue;
    }

    if (
      argument ===
      "--analysis-only"
    ) {
      analysisOnly =
        true;

      continue;
    }

    if (
      argument ===
      "--reddit-only"
    ) {
      redditOnly =
        true;

      continue;
    }

    if (
      argument.startsWith(
        "--stop-after=",
      )
    ) {
      stopAfter =
        argument
          .slice(
            "--stop-after="
              .length,
          )
          .trim()
          .toUpperCase() ||
        null;

      continue;
    }

    if (
      argument.startsWith(
        "--minimum-bars=",
      )
    ) {
      minimumBars =
        positiveInteger(
          argument.slice(
            "--minimum-bars="
              .length,
          ),
          DEFAULT_MINIMUM_BARS,
        );

      continue;
    }

    if (
      argument.startsWith(
        "--lookback-days=",
      )
    ) {
      lookbackDays =
        positiveInteger(
          argument.slice(
            "--lookback-days="
              .length,
          ),
          DEFAULT_LOOKBACK_DAYS,
        );

      continue;
    }

    if (
      argument.startsWith(
        "--",
      )
    ) {
      unknownArguments.push(
        argument,
      );

      continue;
    }

    if (!symbol) {
      symbol =
        normalizeSymbol(
          argument,
        );

      continue;
    }

    unknownArguments.push(
      argument,
    );
  }

  return {
    symbol,

    analysisOnly,

    redditOnly,

    stopAfter,

    minimumBars,

    lookbackDays,

    unknownArguments,
  };
}

/**
 * ============================================================
 * USAGE
 * ============================================================
 */

function printUsage() {
  console.log(`
Usage:

  node scripts/analyzeStock.mjs SYMBOL [options]

Examples:

  node scripts/analyzeStock.mjs AAPL

  node scripts/analyzeStock.mjs AAPL --analysis-only

  node scripts/analyzeStock.mjs NVDA --reddit-only

  node scripts/analyzeStock.mjs AAPL \\
    --stop-after=VOLATILITY_RISK

  node scripts/analyzeStock.mjs AAPL \\
    --minimum-bars=300 \\
    --lookback-days=40

Options:

  --analysis-only
      Force analysis-only mode.

  --reddit-only
      Use Reddit-only social acquisition.

  --stop-after=STAGE
      Stop after a specific downstream risk stage.

  --minimum-bars=N
      Minimum historical candles required.
      Default: ${DEFAULT_MINIMUM_BARS}

  --lookback-days=N
      Historical lookback window.
      Default: ${DEFAULT_LOOKBACK_DAYS}

Valid stop-after stages:

  PORTFOLIO_RISK
  CORRELATION_EXPOSURE
  VOLATILITY_RISK
  DRAWDOWN_RECOVERY
  LIQUIDITY_STRESS
  EXECUTION_TIMING
  MARKET_SHOCK_HALT
  ORDER_EXECUTION_QUALITY
`);
}

/**
 * ============================================================
 * SUMMARY
 * ============================================================
 */

function buildSummary(
  result,
) {
  const safeResult =
    safeObject(
      result,
    );

  const market =
    safeObject(
      safeResult.market,
    );

  const latestBar =
    safeObject(
      market.latestBar,
    );

  const latestQuote =
    safeObject(
      market.latestQuote,
    );

  const analysis =
    safeObject(
      safeResult.analysis,
    );

  const finalDecision =
    safeObject(
      safeResult.finalDecision,
    );

  const providers =
    safeObject(
      safeResult.providers,
    );

  return {
    approved:
      safeResult.approved ===
      true,

    status:
      safeResult.status ??
      "UNKNOWN",

    symbol:
      safeResult.symbol ??
      null,

    executionReady:
      safeResult
        .executionReady ===
      true,

    market: {
      quoteFresh:
        market.quoteFresh ===
        true,

      candleCount:
        market.candleCount ??
        null,

      latestPrice:
        latestBar.close ??
        null,

      bid:
        latestQuote.bid ??
        null,

      ask:
        latestQuote.ask ??
        null,
    },

    analysis: {
      approved:
        analysis.approved ===
        true,

      status:
        analysis.status ??
        null,
    },

    finalDecision: {
      decision:
        finalDecision
          .decision ??
        null,

      preferredSide:
        finalDecision
          .preferredSide ??
        null,

      preferredScore:
        finalDecision
          .preferredScore ??
        null,

      canProceedToRiskManager:
        finalDecision
          .canProceedToRiskManager ===
        true,

      canProceedToPaperExecution:
        finalDecision
          .canProceedToPaperExecution ===
        true,
    },

    providers: {
      company:
        providers
          ?.company
          ?.approved ===
        true,

      macro:
        providers
          ?.macro
          ?.approved ===
        true,

      country:
        providers
          ?.country
          ?.approved ===
        true,

      events:
        providers
          ?.events
          ?.approved ===
        true,
    },

    warningCount:
      safeArray(
        safeResult.warnings,
      ).length,

    errorCount:
      safeArray(
        safeResult.errors,
      ).length,
  };
}

/**
 * ============================================================
 * PRINT BOOTSTRAP SUMMARY
 * ============================================================
 */

function printBootstrapSummary(
  bootstrapResult,
) {
  console.log(
    "\nMARKET DATA BOOTSTRAP\n",
  );

  console.dir(
    {
      approved:
        bootstrapResult
          ?.approved ===
        true,

      status:
        bootstrapResult
          ?.status ??
        "UNKNOWN",

      symbol:
        bootstrapResult
          ?.symbol ??
        null,

      analysisReady:
        bootstrapResult
          ?.analysisReady ===
        true,

      executionReady:
        bootstrapResult
          ?.executionReady ===
        true,

      candleCount:
        bootstrapResult
          ?.market
          ?.candleCount ??
        0,

      historicalLoaded:
        bootstrapResult
          ?.market
          ?.historicalLoaded ===
        true,

      hasQuote:
        bootstrapResult
          ?.market
          ?.hasQuote ===
        true,

      quoteFresh:
        bootstrapResult
          ?.market
          ?.quoteFresh ===
        true,

      historicalProvider:
        bootstrapResult
          ?.historical
          ?.provider ??
        null,

      timeframe:
        bootstrapResult
          ?.historical
          ?.timeframe ??
        null,

      feed:
        bootstrapResult
          ?.historical
          ?.feed ??
        null,
    },
    {
      depth:
        null,

      colors:
        true,
    },
  );
}

/**
 * ============================================================
 * MAIN
 * ============================================================
 */

async function main() {
  const {
    symbol,

    analysisOnly,

    redditOnly,

    stopAfter,

    minimumBars,

    lookbackDays,

    unknownArguments,
  } =
    parseArguments(
      process.argv.slice(
        2,
      ),
    );

  /**
   * ========================================================
   * CLI VALIDATION
   * ========================================================
   */

  if (!symbol) {
    console.error(
      "\nERROR: A stock symbol is required.\n",
    );

    printUsage();

    process.exitCode =
      1;

    return;
  }

  if (
    unknownArguments.length >
    0
  ) {
    console.error(
      "\nERROR: Unknown arguments:",
      unknownArguments.join(
        ", ",
      ),
      "\n",
    );

    printUsage();

    process.exitCode =
      1;

    return;
  }

  if (
    stopAfter &&
    !VALID_STOP_STAGES.has(
      stopAfter,
    )
  ) {
    console.error(
      `\nERROR: Invalid stop-after stage: ${stopAfter}\n`,
    );

    printUsage();

    process.exitCode =
      1;

    return;
  }

  /**
   * Any partial pipeline run is automatically
   * analysis-only.
   */

  const effectiveAnalysisOnly =
    analysisOnly ||
    Boolean(
      stopAfter,
    );

  const liveSocialConfig =
    redditOnly
      ? {
          sources: [
            "REDDIT",
          ],
        }
      : {};

  console.log(
    `\nPreparing stock analysis for ${symbol}...\n`,
  );

  console.log({
    symbol,

    analysisOnly:
      effectiveAnalysisOnly,

    liveSocial:
      true,

    socialSources:
      redditOnly
        ? [
            "REDDIT",
          ]
        : [
            "REDDIT",
            "X",
          ],

    minimumBars,

    lookbackDays,

    stopAfter:
      stopAfter ??
      null,
  });

  /**
   * ========================================================
   * MARKET DATA BOOTSTRAP
   * ========================================================
   */

  console.log(
    `\nBootstrapping MarketDataHub for ${symbol}...\n`,
  );

  let bootstrapResult;

  try {
    bootstrapResult =
      await bootstrapStockMarketData({
        symbol,

        minimumBars,

        lookbackDays,
      });
  } catch (error) {
    console.error(
      "\nMARKET DATA BOOTSTRAP CRASHED\n",
    );

    console.error(
      error instanceof Error
        ? error.stack ??
          error.message
        : String(
            error,
          ),
    );

    process.exitCode =
      1;

    return;
  }

  /**
   * Defensive contract validation.
   */

  if (
    !bootstrapResult ||
    typeof bootstrapResult !==
      "object"
  ) {
    console.error(
      "\nERROR: Market-data bootstrap returned an invalid result.\n",
    );

    process.exitCode =
      1;

    return;
  }

  printBootstrapSummary(
    bootstrapResult,
  );

  /**
   * ========================================================
   * BOOTSTRAP FAIL-CLOSED BOUNDARY
   * ========================================================
   */

  if (
    bootstrapResult
      .approved !==
      true ||
    bootstrapResult
      .analysisReady !==
      true
  ) {
    console.log(
      "\nMARKET DATA WARNINGS\n",
    );

    for (
      const warning
      of safeArray(
        bootstrapResult
          .warnings,
      )
    ) {
      console.log(
        `- ${String(
          warning,
        )}`,
      );
    }

    console.log(
      "\nMARKET DATA ERRORS\n",
    );

    for (
      const error
      of safeArray(
        bootstrapResult
          .errors,
      )
    ) {
      console.log(
        `- ${
          typeof error ===
          "string"
            ? error
            : JSON.stringify(
                error,
              )
        }`,
      );
    }

    console.log(
      "\nSAFETY VERDICT\n",
    );

    console.log(
      "ANALYSIS NOT READY.",
    );

    console.log(
      "No order has been placed.",
    );

    process.exitCode =
      1;

    return;
  }

  /**
   * Bootstrap may be ANALYSIS_READY without a live
   * quote.
   *
   * That is acceptable.
   *
   * The later runner/live-service layers will keep
   * executionReady=false.
   */

  if (
    bootstrapResult
      ?.market
      ?.quoteFresh !==
    true
  ) {
    console.log(
      "\nMarket history is ready, but no fresh quote is available.",
    );

    console.log(
      "Analysis will continue. Execution must remain disabled.\n",
    );
  }

  /**
   * ========================================================
   * RUN LIVE STOCK ANALYSIS
   * ========================================================
   */

  console.log(
    `Running stock intelligence pipeline for ${symbol}...\n`,
  );

  let result;

  try {
    const options = {
      symbol,

      useLiveSocial:
        true,

      liveSocialConfig,

      stopAfter,
    };

    if (
      effectiveAnalysisOnly
    ) {
      result =
        await runLiveStockAnalysisOnly(
          options,
        );
    } else {
      result =
        await runLiveStockAnalysis(
          options,
        );
    }
  } catch (error) {
    console.error(
      "\nLIVE STOCK ANALYSIS CRASHED\n",
    );

    console.error(
      error instanceof Error
        ? error.stack ??
          error.message
        : String(
            error,
          ),
    );

    process.exitCode =
      1;

    return;
  }

  /**
   * ========================================================
   * DEFENSIVE RESULT VALIDATION
   * ========================================================
   */

  if (
    !result ||
    typeof result !==
      "object"
  ) {
    console.error(
      "\nERROR: Live stock service returned an invalid result.\n",
    );

    process.exitCode =
      1;

    return;
  }

  /**
   * ========================================================
   * FULL RESULT
   * ========================================================
   */

  console.log(
    "FULL RESULT\n",
  );

  console.dir(
    result,
    {
      depth:
        null,

      colors:
        true,
    },
  );

  /**
   * ========================================================
   * SUMMARY
   * ========================================================
   */

  const summary =
    buildSummary(
      result,
    );

  console.log(
    "\nSUMMARY\n",
  );

  console.dir(
    summary,
    {
      depth:
        null,

      colors:
        true,
    },
  );

  /**
   * ========================================================
   * WARNINGS
   * ========================================================
   */

  const warnings =
    safeArray(
      result.warnings,
    );

  if (
    warnings.length >
    0
  ) {
    console.log(
      "\nWARNINGS\n",
    );

    for (
      const warning
      of warnings
    ) {
      console.log(
        `- ${String(
          warning,
        )}`,
      );
    }
  }

  /**
   * ========================================================
   * ERRORS
   * ========================================================
   */

  const errors =
    safeArray(
      result.errors,
    );

  if (
    errors.length >
    0
  ) {
    console.log(
      "\nERRORS\n",
    );

    for (
      const error
      of errors
    ) {
      console.log(
        `- ${
          typeof error ===
          "string"
            ? error
            : JSON.stringify(
                error,
              )
        }`,
      );
    }
  }

  /**
   * ========================================================
   * SAFETY VERDICT
   * ========================================================
   */

  console.log(
    "\nSAFETY VERDICT\n",
  );

  /**
   * This must be impossible.
   */

  if (
    result.executionReady ===
      true &&
    effectiveAnalysisOnly
  ) {
    console.error(
      "CRITICAL: Analysis-only/partial run incorrectly reported executionReady=true.",
    );

    process.exitCode =
      2;

    return;
  }

  /**
   * Additional defense:
   *
   * even if lower layers somehow reported execution
   * readiness, bootstrap history alone must never be
   * interpreted as execution authorization.
   */

  if (
    result.executionReady ===
      true &&
    bootstrapResult
      ?.market
      ?.quoteFresh !==
      true
  ) {
    console.error(
      "CRITICAL: Analysis reported execution readiness without a fresh bootstrap quote.",
    );

    process.exitCode =
      2;

    return;
  }

  if (
    result.executionReady ===
    true
  ) {
    console.log(
      "ANALYSIS APPROVED FOR DOWNSTREAM PAPER-EXECUTION CONSIDERATION.",
    );

    console.log(
      "No order has been placed by this script.",
    );
  } else {
    console.log(
      "NOT EXECUTION READY.",
    );

    console.log(
      "No order has been placed.",
    );
  }

  /**
   * Analysis failure should be visible to shell/CI.
   */

  if (
    result.approved !==
    true
  ) {
    process.exitCode =
      1;
  }
}

/**
 * ============================================================
 * PROCESS-LEVEL FAIL SAFE
 * ============================================================
 */

main()
  .catch(
    (error) => {
      console.error(
        "\nUNHANDLED CLI ERROR\n",
      );

      console.error(
        error instanceof Error
          ? error.stack ??
            error.message
          : String(
              error,
            ),
      );

      process.exitCode =
        1;
    },
  );