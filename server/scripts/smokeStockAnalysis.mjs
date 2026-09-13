import "dotenv/config";

import {
  resetMarketData,
  createMarketSnapshot,
  getMarketDataStatus,
} from "../src/data/marketDataHub.js";

import bootstrapStockMarketData from
  "../src/services/stockMarketDataBootstrapService.js";

import {
  runLiveStockAnalysisOnly,
} from "../src/services/liveStockAnalysisService.js";

/**
 * ============================================================
 * REAL STOCK ANALYSIS SMOKE TEST
 * ============================================================
 *
 * PURPOSE
 * -------
 *
 * Verify the complete production ANALYSIS path using real
 * providers and real MarketDataHub state.
 *
 * THIS SCRIPT NEVER PLACES AN ORDER.
 *
 * FLOW
 * ----
 *
 * Alpaca historical data
 *      ↓
 * MarketDataHub
 *      ↓
 * Company Fundamental Aggregator
 *      ├── SEC EDGAR
 *      └── Alpha Vantage
 *      ↓
 * Macro / Country / Events
 *      ↓
 * Stock Analysis Runner
 *      ↓
 * Engine Orchestrator
 *      ↓
 * Final analysis
 */

const symbol =
  String(
    process.argv[2] ??
      "AAPL",
  )
    .trim()
    .toUpperCase();

/**
 * ============================================================
 * HELPERS
 * ============================================================
 */

function section(
  title,
) {
  console.log(
    `\n===== ${title} =====\n`,
  );
}

function safeObject(
  value,
) {
  return (
    value &&
    typeof value ===
      "object"
  )
    ? value
    : {};
}

function summarizeProvider(
  provider,
) {
  if (!provider) {
    return {
      available: false,
      approved: false,
      status: null,
    };
  }

  return {
    available: true,

    supplied:
      provider
        ?.supplied ??
      null,

    approved:
      provider
        ?.approved ===
      true,

    status:
      provider
        ?.result
        ?.status ??
      provider
        ?.status ??
      null,

    provider:
      provider
        ?.result
        ?.provider ??
      null,

    indicatorCount:
      provider
        ?.result
        ?.indicatorCount ??
      null,

    warningCount:
      Array.isArray(
        provider
          ?.result
          ?.warnings,
      )
        ? provider
            .result
            .warnings
            .length
        : 0,

    errorCount:
      Array.isArray(
        provider
          ?.result
          ?.errors,
      )
        ? provider
            .result
            .errors
            .length
        : 0,
  };
}

function printEnvironmentStatus() {
  const variables = [
    "ALPACA_API_KEY",
    "ALPACA_SECRET_KEY",
    "SEC_USER_AGENT",
    "ALPHA_VANTAGE_API_KEY",
  ];

  return Object.fromEntries(
    variables.map(
      (name) => [
        name,
        Boolean(
          process.env[
            name
          ],
        ),
      ],
    ),
  );
}

/**
 * ============================================================
 * MAIN
 * ============================================================
 */

async function main() {
  section(
    "CONFIGURATION",
  );

  console.log({
    symbol,

    executionMode:
      "ANALYSIS_ONLY",

    environment:
      printEnvironmentStatus(),
  });

  /**
   * Never reuse stale MarketDataHub state from another test.
   */
  resetMarketData(
    symbol,
  );

  /**
   * ==========================================================
   * STEP 1
   * LOAD REAL HISTORICAL MARKET DATA
   * ==========================================================
   */

  section(
    "MARKET DATA BOOTSTRAP",
  );

  const bootstrap =
    await bootstrapStockMarketData({
      symbol,

      /**
       * 30 calendar days should comfortably provide enough
       * 5-minute candles for normal engine warmup.
       */
      lookbackDays: 30,

      minimumBars: 250,
    });

  console.dir(
    bootstrap,
    {
      depth: 5,
    },
  );

  if (
    bootstrap
      ?.analysisReady !==
    true
  ) {
    section(
      "SMOKE TEST FAILED",
    );

    console.error(
      "MarketDataHub could not be prepared for analysis.",
    );

    console.error({
      approved:
        bootstrap
          ?.approved ??
        false,

      status:
        bootstrap
          ?.status ??
        null,

      analysisReady:
        bootstrap
          ?.analysisReady ??
        false,

      warnings:
        bootstrap
          ?.warnings ??
        [],

      errors:
        bootstrap
          ?.errors ??
        [],
    });

    process.exitCode =
      1;

    return;
  }

  /**
   * ==========================================================
   * STEP 2
   * VERIFY MARKET DATA HUB
   * ==========================================================
   */

  section(
    "MARKET DATA HUB",
  );

  const marketStatus =
    getMarketDataStatus(
      symbol,
    );

  const snapshot =
    createMarketSnapshot(
      symbol,
    );

  console.log({
    status:
      marketStatus,

    snapshot: {
      exists:
        Boolean(
          snapshot,
        ),

      candleCount:
        snapshot
          ?.candleCount ??
        0,

      historicalLoaded:
        snapshot
          ?.historicalLoaded ??
        false,

      hasLatestBar:
        Boolean(
          snapshot
            ?.latestBar,
        ),

      hasLatestQuote:
        Boolean(
          snapshot
            ?.latestQuote,
        ),

      quoteFresh:
        snapshot
          ?.quoteFresh ??
        false,
    },
  });

  /**
   * ==========================================================
   * STEP 3
   * RUN REAL ANALYSIS
   * ==========================================================
   */

  section(
    "LIVE STOCK ANALYSIS",
  );

  const result =
    await runLiveStockAnalysisOnly({
      symbol,
    });

  /**
   * ==========================================================
   * STEP 4
   * COMPACT SUMMARY
   * ==========================================================
   */

  const providers =
    safeObject(
      result?.providers,
    );

  const analysis =
    safeObject(
      result?.analysis,
    );

  const engineResults =
    safeObject(
      analysis?.results,
    );

  section(
    "PRODUCTION SMOKE SUMMARY",
  );

  console.dir(
    {
      symbol:
        result
          ?.symbol ??
        symbol,

      service:
        result
          ?.service ??
        null,

      approved:
        result
          ?.approved ===
        true,

      status:
        result
          ?.status ??
        null,

      /**
       * Must ALWAYS remain false from this script.
       */
      executionReady:
        result
          ?.executionReady ===
        true,

      market: {
        candleCount:
          result
            ?.market
            ?.candleCount ??
          snapshot
            ?.candleCount ??
          0,

        quoteFresh:
          result
            ?.market
            ?.quoteFresh ??
          false,

        latestPrice:
          snapshot
            ?.latestBar
            ?.close ??
          null,

        bid:
          snapshot
            ?.latestQuote
            ?.bid ??
          null,

        ask:
          snapshot
            ?.latestQuote
            ?.ask ??
          null,
      },

      providers: {
        company:
          summarizeProvider(
            providers
              ?.company,
          ),

        macro:
          summarizeProvider(
            providers
              ?.macro,
          ),

        country:
          summarizeProvider(
            providers
              ?.country,
          ),

        events:
          summarizeProvider(
            providers
              ?.events,
          ),
      },

      engines: {
        technical: {
          approved:
            engineResults
              ?.technical
              ?.approved ??
            false,

          status:
            engineResults
              ?.technical
              ?.status ??
            null,
        },

        company: {
          approved:
            engineResults
              ?.company
              ?.approved ??
            false,

          status:
            engineResults
              ?.company
              ?.status ??
            null,

          direction:
            engineResults
              ?.company
              ?.direction ??
            null,

          health:
            engineResults
              ?.company
              ?.health ??
            null,

          rawScore:
            engineResults
              ?.company
              ?.rawScore ??
            null,

          confidence:
            engineResults
              ?.company
              ?.confidence ??
            null,

          evidenceCount:
            Array.isArray(
              engineResults
                ?.company
                ?.evidence,
            )
              ? engineResults
                  .company
                  .evidence
                  .length
              : 0,
        },

        macro: {
          approved:
            engineResults
              ?.macro
              ?.approved ??
            false,

          status:
            engineResults
              ?.macro
              ?.status ??
            null,
        },

        country: {
          approved:
            engineResults
              ?.country
              ?.approved ??
            false,

          status:
            engineResults
              ?.country
              ?.status ??
            null,
        },

        events: {
          approved:
            engineResults
              ?.events
              ?.approved ??
            false,

          status:
            engineResults
              ?.events
              ?.status ??
            null,
        },

        historical: {
          approved:
            engineResults
              ?.historical
              ?.approved ??
            false,

          status:
            engineResults
              ?.historical
              ?.status ??
            null,
        },

        historyOutcome: {
          approved:
            engineResults
              ?.historyOutcome
              ?.approved ??
            false,

          status:
            engineResults
              ?.historyOutcome
              ?.status ??
            null,
        },
      },

      finalDecision: {
        decision:
          result
            ?.finalDecision
            ?.decision ??
          null,

        canProceedToRiskManager:
          result
            ?.finalDecision
            ?.canProceedToRiskManager ??
          false,

        canProceedToPaperExecution:
          result
            ?.finalDecision
            ?.canProceedToPaperExecution ??
          false,
      },

      warningCount:
        Array.isArray(
          result?.warnings,
        )
          ? result
              .warnings
              .length
          : 0,

      errorCount:
        Array.isArray(
          result?.errors,
        )
          ? result
              .errors
              .length
          : 0,
    },
    {
      depth: 8,
    },
  );

  /**
   * ==========================================================
   * COMPANY FUNDAMENTAL DETAILS
   * ==========================================================
   */

  section(
    "COMPANY FUNDAMENTALS",
  );

  console.dir(
    engineResults
      ?.company ??
    null,
    {
      depth: 10,
    },
  );

  /**
   * ==========================================================
   * WARNINGS / ERRORS
   * ==========================================================
   */

  if (
    Array.isArray(
      result?.warnings,
    ) &&
    result
      .warnings
      .length >
      0
  ) {
    section(
      "WARNINGS",
    );

    for (
      const warning
      of result.warnings
    ) {
      console.log(
        `- ${warning}`,
      );
    }
  }

  if (
    Array.isArray(
      result?.errors,
    ) &&
    result
      .errors
      .length >
      0
  ) {
    section(
      "ERRORS",
    );

    for (
      const error
      of result.errors
    ) {
      console.log(
        `- ${error}`,
      );
    }
  }

  /**
   * ==========================================================
   * SAFETY VERDICT
   * ==========================================================
   */

  section(
    "SAFETY VERDICT",
  );

  if (
    result
      ?.executionReady ===
    true
  ) {
    /**
     * runLiveStockAnalysisOnly must NEVER allow this.
     */
    console.error(
      "FAIL: analysis-only smoke test unexpectedly reported executionReady=true.",
    );

    process.exitCode =
      1;

    return;
  }

  console.log(
    "PASS: analysis-only mode prevented execution.",
  );

  console.log(
    "No order has been placed.",
  );
}

main()
  .catch(
    (error) => {
      section(
        "UNHANDLED ERROR",
      );

      console.error(
        error,
      );

      process.exitCode =
        1;
    },
  );