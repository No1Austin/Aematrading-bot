import "dotenv/config";
import getSecCompanyFundamentalData from "../data/providers/secCompanyFundamentalDataProvider.js";
import AlpacaLiveMarketStream from "../data/providers/alpacaLiveMarketStream.js";
import getUSMacroData from "../data/providers/usMacroDataProvider.js";
import getUSCountryRiskData from "../data/providers/usCountryRiskDataProvider.js";
import getFederalReserveEvents from "../data/providers/federalReserveEventProvider.js";
import getFederalRegisterEvents from "../data/providers/federalRegisterEventProvider.js";
import getAlpacaPaperAccountData from "../data/providers/alpacaPaperAccountProvider.js";
import filterRelevantEvents from "../analysis/eventRelevanceEngine.js";

import getMarketEvents from "../data/providers/marketEventDataProvider.js";

import interpretMarketEvents from "../analysis/eventInterpretationEngine.js";

import {
  loadEngineWarmupHistory,
  ALPACA_TIMEFRAME,
  ALPACA_FEED,
} from "../data/providers/alpacaHistoricalDataService.js";

import {
  getMarketDataStatus,
  createMarketSnapshot,
} from "../data/marketDataHub.js";

import LiveEngineRunner from "./liveEngineRunner.js";





async function verifyCompanyFundamentals(
  symbol,
) {
  console.log(
    `\n[COMPANY CHECK] Loading SEC fundamentals for ${symbol}...`,
  );

  const result =
    await getSecCompanyFundamentalData({
      symbol,

      asOfDate:
        new Date()
          .toISOString(),
    });

  if (
    result.approved !== true ||
    !result.data
  ) {
    console.error(
      `[COMPANY CHECK] ${symbol} failed.`,
    );

    console.error({
      status:
        result.status,

      errors:
        result.errors,

      warnings:
        result.warnings,
    });

    return false;
  }

  console.log(
    `[COMPANY CHECK] ${symbol}: ${result.indicatorCount} SEC indicators ready.`,
  );

  console.log({
    revenueGrowth:
      result.data
        ?.revenue
        ?.growth ??
      null,

    earningsGrowth:
      result.data
        ?.earnings
        ?.epsGrowth ??
      null,

    operatingMargin:
      result.data
        ?.margins
        ?.operatingMargin ??
      null,

    netMargin:
      result.data
        ?.margins
        ?.netMargin ??
      null,

    debtToEquity:
      result.data
        ?.debt
        ?.debtToEquity ??
      null,
  });

  return true;
}

/**
 * ============================================================
 * LIVE PAPER INTELLIGENCE BOOTSTRAP
 * ============================================================
 *
 * PURPOSE
 * -------
 *
 * Start the real-data trading intelligence system.
 *
 * Startup sequence:
 *
 * 1. Enforce PAPER mode
 * 2. Validate Alpaca credentials
 * 3. Load real historical warmup candles
 * 4. Start Live Engine Runner
 * 5. Connect Alpaca live WebSocket
 * 6. Feed real live bars/quotes into Market Data Hub
 * 7. Run engines on completed bars
 *
 * IMPORTANT
 * ---------
 *
 * This bootstrap does NOT submit live-money orders.
 *
 * TRADING_MODE must equal PAPER.
 */

/**
 * ============================================================
 * CONFIG
 * ============================================================
 */

const SYMBOLS = [
  "AAPL",
];

const TIMEFRAME =
  ALPACA_TIMEFRAME.FIVE_MINUTES;

const FEED =
  ALPACA_FEED.IEX;

const MINIMUM_WARMUP_BARS =
  250;

/**
 * ============================================================
 * HELPERS
 * ============================================================
 */

function now() {
  return new Date()
    .toISOString();
}

function sleep(ms) {
  return new Promise(
    (resolve) =>
      setTimeout(
        resolve,
        ms,
      ),
  );
}


/**
 * ============================================================
 * COMPANY FUNDAMENTAL CACHE
 * ============================================================
 *
 * SEC fundamentals do not need to be downloaded on every
 * 5-minute market bar.
 *
 * Cache current live fundamentals for six hours.
 *
 * Historical/backtest calls can still pass their own
 * asOfTimestamp to the SEC provider when point-in-time
 * reconstruction is required.
 */

const COMPANY_FUNDAMENTAL_CACHE_MS =
  6 *
  60 *
  60 *
  1000;

const companyFundamentalCache =
  new Map();

async function getLiveCompanyFundamentals({
  symbol,
  asOfTimestamp,
} = {}) {
  const normalizedSymbol =
    String(
      symbol ?? "",
    )
      .trim()
      .toUpperCase();

  if (!normalizedSymbol) {
    return {};
  }

  const cached =
    companyFundamentalCache.get(
      normalizedSymbol,
    );

  if (
    cached &&
    Date.now() -
      cached.cachedAt <
      COMPANY_FUNDAMENTAL_CACHE_MS
  ) {
    return cached.data;
  }

  const result =
    await getSecCompanyFundamentalData({
      symbol:
        normalizedSymbol,

      asOfDate:
        asOfTimestamp ??
        new Date()
          .toISOString(),
    });

  if (
    result.approved !== true ||
    !result.data
  ) {
    console.warn(
      `[COMPANY DATA] ${normalizedSymbol}: ${result.status ?? "UNAVAILABLE"}`,
    );

    if (
      Array.isArray(
        result.warnings,
      ) &&
      result.warnings.length >
        0
    ) {
      console.warn(
        "[COMPANY DATA] Warnings:",
        result.warnings,
      );
    }

    if (
      Array.isArray(
        result.errors,
      ) &&
      result.errors.length >
        0
    ) {
      console.error(
        "[COMPANY DATA] Errors:",
        result.errors,
      );
    }

    /**
     * Safe fail:
     *
     * Returning an empty object means the company engine
     * receives no fabricated directional evidence.
     */
    return {};
  }

  const companyData = {
    ...result.data,

    provider:
      result.provider,

    providerStatus:
      result.status,

    indicatorCount:
      result.indicatorCount,

    providerFetchedAt:
      result.fetchedAt,
  };

  companyFundamentalCache.set(
    normalizedSymbol,
    {
      data:
        companyData,

      cachedAt:
        Date.now(),
    },
  );

  console.log(
    `[COMPANY DATA] ${normalizedSymbol}: ${result.indicatorCount ?? 0} SEC indicators ready.`,
  );

  return companyData;
}

/**
 * ============================================================
 * PAPER MODE SAFETY
 * ============================================================
 */

function enforcePaperMode() {
  const mode =
    String(
      process.env
        .TRADING_MODE ??
        "",
    )
      .trim()
      .toUpperCase();

  if (
    mode !== "PAPER"
  ) {
    throw new Error(
      `Trading system refused to start because TRADING_MODE is "${mode || "UNSET"}". Expected PAPER.`,
    );
  }

  if (
    !process.env
      .ALPACA_API_KEY
  ) {
    throw new Error(
      "ALPACA_API_KEY is missing.",
    );
  }

  if (
    !process.env
      .ALPACA_SECRET_KEY
  ) {
    throw new Error(
      "ALPACA_SECRET_KEY is missing.",
    );
  }

  return true;
}

/**
 * ============================================================
 * DATE RANGE FOR WARMUP
 * ============================================================
 *
 * We request several weeks because market weekends and
 * holidays mean calendar days != trading days.
 */

function buildWarmupRange() {
  const end =
    new Date();

  const start =
    new Date(
      end.getTime() -
        30 *
          24 *
          60 *
          60 *
          1000,
    );

  return {
    start:
      start.toISOString(),

    end:
      end.toISOString(),
  };
}

/**
 * ============================================================
 * LOAD REAL HISTORICAL DATA
 * ============================================================
 */

async function warmSymbol(
  symbol,
) {
  const {
    start,
    end,
  } =
    buildWarmupRange();

  console.log(
    `\n[WARMUP] Loading real historical data for ${symbol}...`,
  );

  const result =
    await loadEngineWarmupHistory({
      symbol,

      start,

      end,

      timeframe:
        TIMEFRAME,

      feed:
        FEED,

      minimumBars:
        MINIMUM_WARMUP_BARS,
    });

  if (
    result.approved !== true
  ) {
    console.error(
      `[WARMUP] ${symbol} failed.`,
    );

    console.error({
      errors:
        result.errors,

      warnings:
        result.warnings,

      barCount:
        result.barCount,
    });

    return false;
  }

  console.log(
    `[WARMUP] ${symbol}: ${result.barCount} real bars loaded.`,
  );

  const status =
    getMarketDataStatus(
      symbol,
    );

  console.log(
    `[HUB] ${symbol}`,
    {
      historicalLoaded:
        status
          .historicalLoaded,

      candleCount:
        status
          .candleCount,

      latestBar:
        status
          .latestBarTimestamp,
    },
  );

  return true;
}


/**
 * ============================================================
 * ENGINE RUNNER
 * ============================================================
 */

const engineRunner =
  new LiveEngineRunner({
    symbols:
      SYMBOLS,

    /**
     * ------------------------------------------------------
     * ACCOUNT PROVIDER
     * ------------------------------------------------------
     *
     * Temporary paper-account values.
     *
     * We will replace this later with the real
     * Alpaca PAPER account and positions API.
     */

   accountProvider:
  async () => {
    const result =
      await getAlpacaPaperAccountData();

    if (
      result.approved !==
        true ||
      !result.data
    ) {
      console.warn(
        "[ACCOUNT DATA] Alpaca PAPER account unavailable.",
        {
          status:
            result.status ??
            "UNKNOWN",

          warnings:
            result.warnings ??
            [],

          errors:
            result.errors ??
            [],
        },
      );

      /**
       * Fail safe:
       *
       * No account data means no risk approval.
       */
      return {
        balance: 0,
        equity: 0,
        buyingPower: 0,
        riskPercent: 0,
        dailyPnL: 0,
        dailyLossLimit: 0,
        openPositions: [],
        portfolioExposure: 0,
        positionCount: 0,
        tradingBlocked: true,
        accountBlocked: true,
        shortingEnabled: false,
      };
    }

    console.log(
      `[ACCOUNT DATA] Alpaca PAPER account ready. Equity=${result.data.equity} BuyingPower=${result.data.buyingPower} Positions=${result.data.positionCount}`,
    );

    return result.data;
  },

    /**
     * ------------------------------------------------------
     * MACRO PROVIDER — REAL FRED DATA
     * ------------------------------------------------------
     *
     * Supplies real U.S. macroeconomic data to the
     * Macro Regime Engine.
     *
     * Includes:
     *
     * - inflation
     * - policy rate
     * - GDP
     * - unemployment
     * - employment
     * - consumer confidence
     * - consumer spending
     * - yield curve
     * - financial conditions
     * - credit conditions
     * - liquidity
     */
macroProvider:
  async () => {
    const result =
      await getUSMacroData();

    if (
      result.approved !== true ||
      !result.data
    ) {
      console.warn(
        "[MACRO DATA] FRED macro data unavailable.",
        {
          status:
            result.status ??
            "UNKNOWN",

          warnings:
            result.warnings ??
            [],

          errors:
            result.errors ??
            [],
        },
      );

      return {};
    }

    console.log(
      `[MACRO DATA] ${result.indicatorCount} FRED indicators ready.`,
    );

    return {
      ...result.data,

      provider:
        result.provider,

      providerStatus:
        result.status,

      indicatorCount:
        result.indicatorCount,
    };
  },


    /**
     * ------------------------------------------------------
     * COUNTRY PROVIDER — REAL U.S. COUNTRY CONDITIONS
     * ------------------------------------------------------
     *
     * Uses the SAME FRED macro snapshot already loaded
     * for the current trading-analysis cycle.
     */

    countryProvider:
      async ({
        macro,
      } = {}) => {
        const result =
          await getUSCountryRiskData({
            macroData:
              macro ??
              null,
          });

        if (
          result.approved !== true ||
          !result.data
        ) {
          console.warn(
            "[COUNTRY DATA] U.S. country data unavailable.",
            {
              status:
                result.status ??
                "UNKNOWN",

              warnings:
                result.warnings ??
                [],

              errors:
                result.errors ??
                [],
            },
          );

          return {};
        }

        console.log(
          `[COUNTRY DATA] ${result.indicatorCount} verified U.S. indicators ready.`,
        );

        return result.data;
      },

    /**
     * ------------------------------------------------------
     * REAL COMPANY FUNDAMENTAL PROVIDER
     * ------------------------------------------------------
     *
     * Official SEC EDGAR company facts.
     *
     * The provider uses the current bar timestamp as its
     * point-in-time cutoff so future filings cannot leak
     * into an earlier decision.
     */

    companyProvider:
      async ({
        symbol,
        asOfTimestamp,
      } = {}) =>
        getLiveCompanyFundamentals({
          symbol,
          asOfTimestamp,
        }),

        /**
     * ------------------------------------------------------
     * EVENT PROVIDER — VERIFIED U.S. EVENT SOURCES
     * ------------------------------------------------------
     *
     * Pipeline:
     *
     * Federal Reserve
     *      ↓
     * Official RSS + full statement
     *      ↓
     * Market event normalizer
     *      ↓
     * Event interpretation
     *      ↓
     * Event Intelligence Engine
     *
     * context.macro contains the SAME FRED macro snapshot
     * already loaded for this trading-analysis cycle.
     */

    eventProvider:
      async ({
        symbol,
        macro,
        timestamp,
        asOfTimestamp,
      } = {}) => {
        try {
          const currentTimestamp =
            asOfTimestamp ??
            timestamp ??
            new Date()
              .toISOString();


              /**
 * ==================================================
 * CACHE CHECK
 * ==================================================
 */
const cachedEvents =
  getCachedEvents();

if (cachedEvents) {
  console.log(
    `[EVENT CACHE] ${symbol}: using ${cachedEvents.length} cached combined event(s).`,
  );

  return cachedEvents;
}

console.log(
  `[EVENT CACHE] ${symbol}: cache expired or empty — refreshing event sources.`,
);

/**
 * ==================================================
 * 1. LOAD REAL FEDERAL RESERVE EVENTS
 * ==================================================
 */

const fedResult =
  await getFederalReserveEvents({
    asOfTimestamp:
      currentTimestamp,

    lookbackHours:
      72,
  });

let fedInterpretedEvents = [];

if (
  fedResult.approved ===
    true &&
  fedResult.eventCount >
    0
) {
  /**
   * ==================================================
   * 2. NORMALIZE FEDERAL RESERVE EVENTS
   * ==================================================
   */

  const normalizedFed =
    await getMarketEvents({
      symbol,

      country:
        "US",

      asOfTimestamp:
        currentTimestamp,

      lookbackHours:
        72,

      sourceEvents:
        fedResult.events,
    });

  if (
    normalizedFed.approved ===
      true &&
    normalizedFed.eventCount >
      0
  ) {
    /**
     * ==================================================
     * 3. INTERPRET FEDERAL RESERVE EVENTS
     * ==================================================
     */

    const fedInterpretation =
      interpretMarketEvents({
        events:
          normalizedFed.events,

        symbol,

        country:
          "US",

        sector:
          "TECHNOLOGY",

        macro:
          macro ??
          null,

        expectationsByEvent:
          {},
      });

    if (
      fedInterpretation.approved ===
        true
    ) {
      fedInterpretedEvents =
        fedInterpretation.events ??
        [];

      console.log(
        `[EVENT DATA] ${symbol}: ${fedInterpretation.interpretedCount} interpreted, ${fedInterpretation.unresolvedCount} unresolved Federal Reserve event(s).`,
      );
    } else {
      console.warn(
        "[EVENT DATA] Federal Reserve interpretation failed.",
        {
          status:
            fedInterpretation.status ??
            "UNKNOWN",

          warnings:
            fedInterpretation.warnings ??
            [],

          errors:
            fedInterpretation.errors ??
            [],
        },
      );
    }
  } else {
    console.warn(
      "[EVENT DATA] Federal Reserve normalization failed or returned no events.",
      {
        status:
          normalizedFed.status ??
          "UNKNOWN",

        warnings:
          normalizedFed.warnings ??
          [],

        errors:
          normalizedFed.errors ??
          [],
      },
    );
  }
} else {
  console.warn(
    "[EVENT DATA] Federal Reserve events unavailable.",
    {
      status:
        fedResult.status ??
        "UNKNOWN",

      warnings:
        fedResult.warnings ??
        [],

      errors:
        fedResult.errors ??
        [],
    },
  );
}

/**
 * ==================================================
 * 4. LOAD REAL FEDERAL REGISTER EVENTS
 * ==================================================
 */

const registerResult =
  await getFederalRegisterEvents({
    asOfTimestamp:
      currentTimestamp,

    lookbackHours:
      72,

    perPage:
      100,
  });

let registerInterpretedEvents = [];

if (
  registerResult.approved ===
    true &&
  registerResult.eventCount >
    0
) {
  /**
   * ==================================================
   * 5. NORMALIZE FEDERAL REGISTER EVENTS
   * ==================================================
   */

  const normalizedRegister =
    await getMarketEvents({
      symbol,

      country:
        "US",

      asOfTimestamp:
        currentTimestamp,

      lookbackHours:
        72,

      sourceEvents:
        registerResult.events,
    });

  if (
    normalizedRegister.approved ===
      true &&
    normalizedRegister.eventCount >
      0
  ) {
    /**
     * ==================================================
     * 6. FILTER FOR MARKET / AAPL RELEVANCE
     * ==================================================
     */

    const relevanceResult =
      filterRelevantEvents({
        events:
          normalizedRegister.events,

        symbol,

        sector:
          "TECHNOLOGY",

        country:
          "US",

        minimumScore:
          0.4,
      });

    if (
      relevanceResult.approved ===
        true
    ) {
      console.log(
        `[EVENT RELEVANCE] ${symbol}: ${relevanceResult.relevantCount}/${relevanceResult.originalCount} Federal Register event(s) retained.`,
      );

      if (
        Array.isArray(
          relevanceResult.warnings,
        ) &&
        relevanceResult.warnings.length >
          0
      ) {
        console.warn(
          "[EVENT RELEVANCE] Warnings:",
          relevanceResult.warnings,
        );
      }

      /**
       * ==================================================
       * 7. INTERPRET ONLY RELEVANT REGISTER EVENTS
       * ==================================================
       */

      if (
        relevanceResult.relevantCount >
        0
      ) {
        const registerInterpretation =
          interpretMarketEvents({
            events:
              relevanceResult.events,

            symbol,

            country:
              "US",

            sector:
              "TECHNOLOGY",

            macro:
              macro ??
              null,

            expectationsByEvent:
              {},
          });

        if (
          registerInterpretation.approved ===
            true
        ) {
          registerInterpretedEvents =
            registerInterpretation.events ??
            [];

          console.log(
            `[EVENT DATA] ${symbol}: ${registerInterpretation.interpretedCount} interpreted, ${registerInterpretation.unresolvedCount} unresolved Federal Register event(s).`,
          );
        } else {
          console.warn(
            "[EVENT DATA] Federal Register interpretation failed.",
            {
              status:
                registerInterpretation.status ??
                "UNKNOWN",

              warnings:
                registerInterpretation.warnings ??
                [],

              errors:
                registerInterpretation.errors ??
                [],
            },
          );
        }
      }
    } else {
      console.warn(
        "[EVENT DATA] Federal Register relevance filtering failed.",
        {
          status:
            relevanceResult.status ??
            "UNKNOWN",

          warnings:
            relevanceResult.warnings ??
            [],

          errors:
            relevanceResult.errors ??
            [],
        },
      );
    }
  } else {
    console.warn(
      "[EVENT DATA] Federal Register normalization failed or returned no events.",
      {
        status:
          normalizedRegister.status ??
          "UNKNOWN",

        warnings:
          normalizedRegister.warnings ??
          [],

        errors:
          normalizedRegister.errors ??
          [],
      },
    );
  }
} else {
  console.warn(
    "[EVENT DATA] Federal Register events unavailable.",
    {
      status:
        registerResult.status ??
        "UNKNOWN",

      warnings:
        registerResult.warnings ??
        [],

      errors:
        registerResult.errors ??
        [],
    },
  );
}

/**
 * ==================================================
 * 8. COMBINE VERIFIED EVENT SOURCES
 * ==================================================
 */

const finalEvents = [
  ...fedInterpretedEvents,
  ...registerInterpretedEvents,
];

/**
 * ==================================================
 * 9. CACHE COMBINED EVENTS
 * ==================================================
 */

const cacheWritten =
  setCachedEvents(
    finalEvents,
  );

if (cacheWritten) {
  console.log(
    `[EVENT CACHE] ${symbol}: cached ${finalEvents.length} combined event(s) for 30 minutes.`,
  );
}

return finalEvents;

        } catch (error) {
          console.error(
            "[EVENT DATA] Provider failed safely.",
            {
              symbol,

              error:
                error instanceof Error
                  ? error.message
                  : String(error),
            },
          );

          return [];
        }
      },
    onStatus({
      status,
      symbol,
      candleCount,
      minimumRequired,
      decision,
    }) {
      console.log(
        `\n[ENGINE RUNNER] ${status}`,
      );

      if (symbol) {
        console.log(
          `Symbol: ${symbol}`,
        );
      }

      if (
        candleCount !==
        undefined
      ) {
        console.log(
          `Candles: ${candleCount}/${minimumRequired}`,
        );
      }

      if (decision) {
        console.log(
          "Decision:",
          decision,
        );
      }
    },

    /**
     * ------------------------------------------------------
     * INDIVIDUAL ENGINE UPDATES
     * ------------------------------------------------------
     */

    onEngineUpdate({
      symbol,
      event,
    }) {
      const engine =
        event
          ?.engine ??
        "UNKNOWN";

      const type =
        event
          ?.type ??
        "UPDATE";

      console.log(
        `[${symbol}] ${engine} → ${type}`,
      );

      if (
        event
          ?.status
      ) {
        console.log(
          `    Status: ${event.status}`,
        );
      }
    },

    /**
     * ------------------------------------------------------
     * FINAL DECISION
     * ------------------------------------------------------
     */

    onDecision({
      symbol,
      finalDecision,
      analysis,
    }) {
      console.log(
        "\n====================================",
      );

      console.log(
        `LIVE ENGINE DECISION — ${symbol}`,
      );

      console.log(
        "====================================",
      );

      console.log(
        "LONG:",
        finalDecision
          ?.longScore ??
          0,
      );

      console.log(
        "SHORT:",
        finalDecision
          ?.shortScore ??
          0,
      );

      console.log(
        "Preferred side:",
        finalDecision
          ?.preferredSide ??
          "NONE",
      );

      console.log(
        "Score:",
        finalDecision
          ?.preferredScore ??
          0,
      );

      console.log(
        "Decision:",
        finalDecision
          ?.decision ??
          "NO_TRADE",
      );

      console.log(
        "Status:",
        finalDecision
          ?.status ??
          "UNKNOWN",
      );

      console.log(
        "Market regime:",
        finalDecision
          ?.marketRegime ??
          "UNKNOWN",
      );

      console.log(
        "Consensus:",
        finalDecision
          ?.consensus ??
          "UNKNOWN",
      );

      console.log(
        "Risk approved:",
        finalDecision
          ?.riskApproved ===
          true
          ? "YES"
          : "NO",
      );

      console.log(
        "====================================\n",
      );

      /**
       * Keep complete analysis available
       * for future database/frontend work.
       */

      if (
        analysis
          ?.approved !== true
      ) {
        console.warn(
          `[${symbol}] Analysis completed with errors.`,
        );
      }
    },

    onError({
      symbol,
      phase,
      message,
    }) {
      console.error(
        `[LIVE ENGINE ERROR]`,
        {
          symbol,
          phase,
          message,
        },
      );
    },
  });

/**
 * ============================================================
 * ALPACA LIVE STREAM
 * ============================================================
 */

const liveStream =
  new AlpacaLiveMarketStream({
    symbols:
      SYMBOLS,

    feed:
      FEED,

    onStatus({
      status,
      symbols,
      feed,
    }) {
      console.log(
        `[ALPACA] ${status}`,
      );

      if (symbols) {
        console.log(
          `    Symbols: ${symbols.join(
            ", ",
          )}`,
        );
      }

      if (feed) {
        console.log(
          `    Feed: ${feed}`,
        );
      }
    },

    onBar(bar) {
      console.log(
        `[LIVE BAR] ${bar.symbol} ${bar.timestamp} close=${bar.close}`,
      );

      /**
       * No manual engine call here.
       *
       * alpacaLiveMarketStream already pushes
       * this bar into marketDataHub.js.
       *
       * LiveEngineRunner is subscribed to that hub.
       */
    },

    onQuote(quote) {
      console.log(
        `[QUOTE] ${quote.symbol} bid=${quote.bid} ask=${quote.ask}`,
      );
    },

    onError(error) {
      console.error(
        "[ALPACA STREAM ERROR]",
        error,
      );
    },
  });

/**
 * ============================================================
 * STARTUP VERIFICATION
 * ============================================================
 */

async function verifyMacroData() {
  console.log(
    "\n[MACRO CHECK] Loading real FRED U.S. macro data...",
  );

  const result =
    await getUSMacroData({
      forceRefresh: true,
    });

  if (
    result.approved !== true ||
    !result.data
  ) {
    console.error(
      "[MACRO CHECK] Failed.",
    );

    console.error({
      status:
        result.status ??
        "UNKNOWN",

      warnings:
        result.warnings ??
        [],

      errors:
        result.errors ??
        [],
    });

    return false;
  }

  console.log(
    `[MACRO CHECK] ${result.indicatorCount} FRED indicators ready.`,
  );

  console.log({
    inflation:
      result.data
        ?.inflation
        ?.rate ??
      null,

    policyRate:
      result.data
        ?.policyRate
        ?.rate ??
      null,

    gdpGrowth:
      result.data
        ?.gdp
        ?.growth ??
      null,

    unemployment:
      result.data
        ?.unemployment
        ?.rate ??
      null,

    employmentGrowth:
      result.data
        ?.employment
        ?.growth ??
      null,

    consumerConfidence:
      result.data
        ?.consumerConfidence
        ?.value ??
      null,

    yieldCurve:
      result.data
        ?.yieldCurve
        ?.spread ??
      null,

    financialConditions:
      result.data
        ?.financialConditions
        ?.index ??
      null,

    creditConditions:
      result.data
        ?.creditConditions
        ?.state ??
      null,

    liquidity:
      result.data
        ?.liquidity
        ?.trend ??
      null,
  });

  return true;
}


async function start() {
  console.log(
    "\n====================================",
  );

  console.log(
    "REAL-DATA PAPER INTELLIGENCE SYSTEM",
  );

  console.log(
    "====================================",
  );

  console.log(
    `Started: ${now()}`,
  );

  console.log(
    `Mode: ${process.env.TRADING_MODE}`,
  );

  console.log(
    `Symbols: ${SYMBOLS.join(
      ", ",
    )}`,
  );

  console.log(
    `Timeframe: ${TIMEFRAME}`,
  );

  console.log(
    `Feed: ${FEED}`,
  );

  console.log(
    "====================================\n",
  );

  /**
   * ========================================================
   * PAPER SAFETY
   * ========================================================
   */

  enforcePaperMode();

  console.log(
    "[SAFETY] PAPER mode verified.",
  );

  /**
   * ========================================================
   * COMPANY FUNDAMENTAL VERIFICATION
   * ========================================================
   */

  for (
    const symbol
    of SYMBOLS
  ) {
    const companyReady =
      await verifyCompanyFundamentals(
        symbol,
      );

    if (!companyReady) {
      throw new Error(
        `Company fundamentals unavailable for ${symbol}.`,
      );
    }
  }
/**
 * ========================================================
 * MACRO DATA VERIFICATION
 * ========================================================
 */

const macroReady =
  await verifyMacroData();

if (!macroReady) {
  throw new Error(
    "Real U.S. macro data is unavailable.",
  );
}
  /**
   * ========================================================
   * HISTORICAL WARMUP
   * ========================================================
   */

  for (
    const symbol
    of SYMBOLS
  ) {
    const ready =
      await warmSymbol(
        symbol,
      );

    if (!ready) {
      throw new Error(
        `Unable to warm ${symbol}. Live system will not start.`,
      );
    }
  }

  /**
   * ========================================================
   * VERIFY SNAPSHOTS
   * ========================================================
   */

  for (
    const symbol
    of SYMBOLS
  ) {
    const snapshot =
      createMarketSnapshot(
        symbol,
      );

    if (!snapshot) {
      throw new Error(
        `Market snapshot unavailable for ${symbol}.`,
      );
    }

    console.log(
      `[SNAPSHOT] ${symbol}: ${snapshot.candleCount} candles ready.`,
    );
  }

  /**
   * ========================================================
   * START ENGINE RUNNER FIRST
   * ========================================================
   *
   * Important:
   *
   * Runner must subscribe before live bars begin arriving.
   */

  const runnerResult =
    await engineRunner
      .start();

  if (
    runnerResult
      .approved !== true
  ) {
    throw new Error(
      `Live Engine Runner failed: ${
        runnerResult
          .errors
          ?.join(", ") ??
        "Unknown error"
      }`,
    );
  }

  console.log(
    "\n[ENGINE RUNNER] Ready.",
  );

  /**
   * Tiny gap before opening WebSocket.
   */

  await sleep(250);

  /**
   * ========================================================
   * CONNECT REAL LIVE DATA
   * ========================================================
   */

  const streamResult =
    await liveStream
      .connect();

  if (
    streamResult
      .approved !== true
  ) {
    throw new Error(
      `Alpaca live stream failed: ${
        streamResult
          .errors
          ?.join(", ") ??
        "Unknown error"
      }`,
    );
  }

  console.log(
    "\n====================================",
  );

  console.log(
    "LIVE SYSTEM INITIALIZED",
  );

  console.log(
    "====================================",
  );

  console.log(
    "Historical data: READY",
  );

  console.log(
    "Market Data Hub: READY",
  );

  console.log(
    "Engine Runner: READY",
  );

  console.log(
    "Alpaca stream: CONNECTING",
  );

  console.log(
    "\nWaiting for real market data...",
  );

  console.log(
    "====================================\n",
  );
}

/**
 * ============================================================
 * SHUTDOWN
 * ============================================================
 */

async function shutdown(
  signal,
) {
  console.log(
    `\n${signal} received.`,
  );

  console.log(
    "Stopping live paper intelligence system...",
  );

  try {
    liveStream.close();

    await engineRunner
      .stop();

    console.log(
      "Shutdown complete.",
    );
  } catch (error) {
    console.error(
      "Shutdown error:",
      error,
    );
  }

  process.exit(0);
}

process.on(
  "SIGINT",
  () =>
    shutdown(
      "SIGINT",
    ),
);

process.on(
  "SIGTERM",
  () =>
    shutdown(
      "SIGTERM",
    ),
);

/**
 * ============================================================
 * BOOT
 * ============================================================
 */
/**
 * ============================================================
 * COMBINED EVENT CACHE
 * ============================================================
 *
 * Federal Reserve and Federal Register events do not need
 * to be downloaded again on every completed 5-minute market candle.
 *
 * Cache lifetime: 30 minutes.
 */

const EVENT_CACHE_TTL_MS =
  30 * 60 * 1000;

const eventCache = {
  events: null,
  fetchedAt: 0,
};

function getCachedEvents() {
  if (
    !Array.isArray(
      eventCache.events,
    ) ||
    eventCache.fetchedAt <= 0
  ) {
    return null;
  }

  const age =
    Date.now() -
    eventCache.fetchedAt;

  if (
    age < 0 ||
    age >
      EVENT_CACHE_TTL_MS
  ) {
    return null;
  }

  return [
    ...eventCache.events,
  ];
}

function setCachedEvents(
  events,
) {
  if (
    !Array.isArray(
      events,
    )
  ) {
    return false;
  }

  eventCache.events = [
    ...events,
  ];

  eventCache.fetchedAt =
    Date.now();

  return true;
}


start().catch(
  (error) => {
    console.error(
      "\n====================================",
    );

    console.error(
      "LIVE SYSTEM FAILED TO START",
    );

    console.error(
      "====================================",
    );

    console.error(
      error instanceof Error
        ? error.message
        : error,
    );

    console.error(
      "\nNo live system was started.\n",
    );

    liveStream.close();

    engineRunner
      .stop()
      .finally(
        () => {
          process.exit(1);
        },
      );
  },
);