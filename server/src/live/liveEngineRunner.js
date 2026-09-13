import runTradingAnalysis from "../orchestration/engineOrchestrator.js";

import {
  getInstitutionalEvidence,
} from "../services/institutionalEvidenceBootstrap.js";

import {
  createMarketSnapshot,
  getMarketCandles,
  getLatestQuote,
  isQuoteFresh,
  subscribeToMarketData,
} from "../data/marketDataHub.js";
/**
 * ============================================================
 * LIVE ENGINE RUNNER
 * ============================================================
 *
 * PURPOSE
 * -------
 *
 * Listen to real market-data events from Market Data Hub
 * and run the trading intelligence pipeline automatically.
 *
 * The runner:
 *
 * - waits for completed live bars
 * - builds a point-in-time market snapshot
 * - runs all intelligence engines
 * - calculates LONG / SHORT scores
 * - applies decision gate
 * - applies risk approval
 * - exposes live engine states
 *
 * IMPORTANT
 * ---------
 *
 * This module does NOT submit broker orders.
 *
 * It produces live trade decisions and risk-approved
 * candidates only.
 */

/**
 * ============================================================
 * STATUS
 * ============================================================
 */

export const LIVE_ENGINE_STATUS =
  Object.freeze({
    IDLE: "IDLE",
    WAITING_FOR_DATA:
      "WAITING_FOR_DATA",
    ANALYZING:
      "ANALYZING",
    COMPLETE:
      "COMPLETE",
    ERROR:
      "ERROR",
    STOPPED:
      "STOPPED",
  });

/**
 * ============================================================
 * DEFAULT CONFIGURATION
 * ============================================================
 */

export const DEFAULT_LIVE_ENGINE_CONFIG =
  Object.freeze({
    /**
     * Minimum candles needed before engines run.
     */
    minimumCandles: 220,

    /**
     * Only analyze completed BAR events.
     *
     * Quote events still update liquidity state,
     * but do not rerun the entire system.
     */
    runOnBars: true,

    /**
     * Prevent duplicate analysis of same timestamp.
     */
    rejectDuplicateBars: true,

    /**
     * Do not start another analysis for the same
     * symbol while one is already running.
     */
    preventConcurrentRuns:
      true,
  });

/**
 * ============================================================
 * HELPERS
 * ============================================================
 */

function normalizeSymbol(
  symbol,
) {
  return String(
    symbol ?? "",
  )
    .trim()
    .toUpperCase();
}

function now() {
  return new Date()
    .toISOString();
}

function positiveNumber(value) {
  return (
    Number.isFinite(
      Number(value),
    ) &&
    Number(value) > 0
  );
}

/**
 * ============================================================
 * LIVE ENGINE RUNNER CLASS
 * ============================================================
 */

export class LiveEngineRunner {
  constructor({
    symbols = [],

    accountProvider = null,

    macroProvider = null,

    countryProvider = null,

    companyProvider = null,

    eventProvider = null,

    socialProvider = null,

    institutionalProvider = getInstitutionalEvidence,

    historicalRecordsProvider =
      null,

    breadthProvider = null,

    volatilityProvider = null,

    riskRewardProvider = null,

    onStatus = null,

    onEngineUpdate = null,

    onDecision = null,

    onError = null,

    config =
      DEFAULT_LIVE_ENGINE_CONFIG,
  } = {}) {
    this.symbols =
      [
        ...new Set(
          symbols
            .map(
              normalizeSymbol,
            )
            .filter(Boolean),
        ),
      ];

    this.accountProvider =
      accountProvider;

    this.macroProvider =
      macroProvider;

    this.countryProvider =
      countryProvider;

    this.companyProvider =
      companyProvider;

    this.eventProvider =
      eventProvider;

    this.socialProvider =
      socialProvider;

    this.institutionalProvider =
      institutionalProvider;

    this.historicalRecordsProvider =
      historicalRecordsProvider;

    this.breadthProvider =
      breadthProvider;

    this.volatilityProvider =
      volatilityProvider;

    this.riskRewardProvider =
      riskRewardProvider;

    this.onStatus =
      onStatus;

    this.onEngineUpdate =
      onEngineUpdate;

    this.onDecision =
      onDecision;

    this.onError =
      onError;

    this.config = {
      ...DEFAULT_LIVE_ENGINE_CONFIG,
      ...config,
    };

    this.status =
      LIVE_ENGINE_STATUS.IDLE;

    this.unsubscribe =
      null;

    this.runningSymbols =
      new Set();

    this.lastAnalyzedTimestamp =
      new Map();

    this.latestAnalysis =
      new Map();

    this.started =
      false;
  }

  /**
   * ========================================================
   * STATUS
   * ========================================================
   */

  async setStatus(
    status,
    details = {},
  ) {
    this.status =
      status;

    if (
      typeof this.onStatus ===
      "function"
    ) {
      try {
        await this.onStatus({
          status,
          timestamp:
            now(),
          ...details,
        });
      } catch {
        // UI callback must not break runner.
      }
    }
  }

  /**
   * ========================================================
   * ERROR
   * ========================================================
   */

  async emitError({
    symbol = null,
    error,
    phase = null,
  }) {
    const message =
      error instanceof Error
        ? error.message
        : String(error);

    if (
      typeof this.onError ===
      "function"
    ) {
      try {
        await this.onError({
          symbol,
          message,
          phase,
          timestamp:
            now(),
        });
      } catch {
        // Error consumer must not break runner.
      }
    }
  }

  /**
   * ========================================================
   * START
   * ========================================================
   */

  async start() {
    if (this.started) {
      return {
        approved: true,
        status:
          this.status,
        message:
          "Live engine runner is already started.",
      };
    }

    if (
      this.symbols.length ===
      0
    ) {
      return {
        approved: false,
        status:
          LIVE_ENGINE_STATUS.ERROR,
        errors: [
          "At least one symbol is required.",
        ],
      };
    }

    this.started =
      true;

    await this.setStatus(
      LIVE_ENGINE_STATUS
        .WAITING_FOR_DATA,
      {
        symbols:
          this.symbols,
      },
    );

    this.unsubscribe =
      subscribeToMarketData(
        async (event) => {
          await this.handleMarketEvent(
            event,
          );
        },
      );

    return {
      approved: true,

      status:
        LIVE_ENGINE_STATUS
          .WAITING_FOR_DATA,

      symbols:
        this.symbols,

      timestamp:
        now(),
    };
  }

  /**
   * ========================================================
   * MARKET EVENT
   * ========================================================
   */

  async handleMarketEvent(
    event,
  ) {
    try {
      if (
        !this.started
      ) {
        return;
      }

      if (
        !event ||
        event.type !== "BAR"
      ) {
        return;
      }

      const symbol =
        normalizeSymbol(
          event.symbol,
        );

      if (
        !this.symbols.includes(
          symbol,
        )
      ) {
        return;
      }

      const bar =
        event.bar;

      if (!bar) {
        return;
      }

      if (
        this.config
          .rejectDuplicateBars
      ) {
        const previous =
          this
            .lastAnalyzedTimestamp
            .get(symbol);

        if (
          previous &&
          previous ===
            bar.timestamp
        ) {
          return;
        }
      }

      if (
        this.config
          .preventConcurrentRuns &&
        this.runningSymbols.has(
          symbol,
        )
      ) {
        return;
      }

      await this.analyzeSymbol({
        symbol,
        bar,
      });
    } catch (error) {
      await this.emitError({
        error,
        phase:
          "MARKET_EVENT",
      });
    }
  }

  /**
   * ========================================================
   * BUILD LIQUIDITY INPUT
   * ========================================================
   */

    /**
   * ========================================================
   * BUILD LIQUIDITY INPUT
   * ========================================================
   *
   * IMPORTANT:
   *
   * This function must never manufacture liquidity.
   *
   * Missing/stale bid-ask data remains unavailable.
   * We do not convert a missing quote into a zero spread.
   */

  buildLiquidityInput({
    symbol,
    bar,
    quote,
    candles,
    account,
  }) {
    const price =
      Number(
        bar?.close,
      );

    /**
     * ======================================================
     * QUOTE VALIDATION
     * ======================================================
     */

    const quoteFresh =
      isQuoteFresh(
        symbol,
      );

    const rawBid =
      Number(
        quote?.bid,
      );

    const rawAsk =
      Number(
        quote?.ask,
      );

    const bid =
      quoteFresh &&
      Number.isFinite(
        rawBid,
      ) &&
      rawBid > 0
        ? rawBid
        : null;

    const ask =
      quoteFresh &&
      Number.isFinite(
        rawAsk,
      ) &&
      rawAsk > 0
        ? rawAsk
        : null;

    /**
     * Never allow an inverted quote.
     */

    const validQuote =
      bid !== null &&
      ask !== null &&
      ask >= bid;

    /**
     * ======================================================
     * VOLUME
     * ======================================================
     */

    const safeCandles =
      Array.isArray(
        candles,
      )
        ? candles
        : [];

    /**
     * Current bar volume.
     */

    const currentVolumeCandidate =
      Number(
        bar?.volume,
      );

    const currentVolume =
      Number.isFinite(
        currentVolumeCandidate,
      ) &&
      currentVolumeCandidate >= 0
        ? currentVolumeCandidate
        : null;

    /**
     * Use prior bars for average volume.
     *
     * Excluding the current bar prevents the current spike
     * from influencing its own baseline.
     */

    const previousCandles =
      safeCandles
        .filter(
          (item) =>
            item?.timestamp !==
            bar?.timestamp,
        )
        .slice(
          -20,
        );

    const recentVolumes =
      previousCandles
        .map(
          (item) =>
            Number(
              item?.volume,
            ),
        )
        .filter(
          (value) =>
            Number.isFinite(
              value,
            ) &&
            value > 0,
        );

    const averageVolume =
      recentVolumes.length > 0
        ? recentVolumes.reduce(
            (
              sum,
              value,
            ) =>
              sum +
              value,
            0,
          ) /
          recentVolumes.length
        : null;

    /**
     * ======================================================
     * REALIZED VOLATILITY
     * ======================================================
     *
     * Calculate the standard deviation of recent percentage
     * returns.
     *
     * This is not IV/VIX.
     *
     * It is short-term realized volatility for execution-risk
     * estimation.
     */

    const recentCloses =
      safeCandles
        .slice(
          -21,
        )
        .map(
          (item) =>
            Number(
              item?.close,
            ),
        )
        .filter(
          (value) =>
            Number.isFinite(
              value,
            ) &&
            value > 0,
        );

    const returns = [];

    for (
      let index = 1;
      index <
      recentCloses.length;
      index += 1
    ) {
      const previous =
        recentCloses[
          index - 1
        ];

      const current =
        recentCloses[
          index
        ];

      if (
        previous <= 0
      ) {
        continue;
      }

      const change =
        (
          current -
          previous
        ) /
        previous;

      if (
        Number.isFinite(
          change,
        )
      ) {
        returns.push(
          change,
        );
      }
    }

    let volatilityPercent =
      null;

    if (
      returns.length >= 2
    ) {
      const mean =
        returns.reduce(
          (
            sum,
            value,
          ) =>
            sum +
            value,
          0,
        ) /
        returns.length;

      const variance =
        returns.reduce(
          (
            sum,
            value,
          ) =>
            sum +
            (
              value -
              mean
            ) **
              2,
          0,
        ) /
        (
          returns.length -
          1
        );

      const standardDeviation =
        Math.sqrt(
          variance,
        );

      if (
        Number.isFinite(
          standardDeviation,
        )
      ) {
        volatilityPercent =
          standardDeviation;
      }
    }

    /**
     * ======================================================
     * MARKET SESSION
     * ======================================================
     *
     * Determine U.S. market session using America/New_York
     * rather than the computer's local timezone.
     */

    const timestamp =
      bar?.timestamp
        ? new Date(
            bar.timestamp,
          )
        : new Date();

    let session =
      "CLOSED";

    if (
      !Number.isNaN(
        timestamp.getTime(),
      )
    ) {
      const parts =
        new Intl.DateTimeFormat(
          "en-US",
          {
            timeZone:
              "America/New_York",

            weekday:
              "short",

            hour:
              "2-digit",

            minute:
              "2-digit",

            hourCycle:
              "h23",
          },
        )
          .formatToParts(
            timestamp,
          );

      const getPart =
        (type) =>
          parts.find(
            (part) =>
              part.type ===
              type,
          )?.value;

      const weekday =
        getPart(
          "weekday",
        );

      const hour =
        Number(
          getPart(
            "hour",
          ),
        );

      const minute =
        Number(
          getPart(
            "minute",
          ),
        );

      const weekdayOpen =
        ![
          "Sat",
          "Sun",
        ].includes(
          weekday,
        );

      if (
        weekdayOpen &&
        Number.isFinite(
          hour,
        ) &&
        Number.isFinite(
          minute,
        )
      ) {
        const minutes =
          hour *
            60 +
          minute;

        /**
         * U.S. Eastern Time:
         *
         * Pre-market:   04:00 - 09:30
         * Regular:      09:30 - 16:00
         * After-hours:  16:00 - 20:00
         */

        if (
          minutes >=
            4 * 60 &&
          minutes <
            (
              9 *
                60 +
              30
            )
        ) {
          session =
            "PRE_MARKET";
        } else if (
          minutes >=
            (
              9 *
                60 +
              30
            ) &&
          minutes <
            16 *
              60
        ) {
          session =
            "REGULAR";
        } else if (
          minutes >=
            16 *
              60 &&
          minutes <
            20 *
              60
        ) {
          session =
            "AFTER_HOURS";
        }
      }
    }

    /**
     * ======================================================
     * PROVISIONAL POSITION VALUE
     * ======================================================
     *
     * Do NOT assume 25% of the account.
     *
     * Final position sizing belongs to tradeRiskManager.
     *
     * If a real proposed position value eventually exists in
     * account/context, we can use it here.
     */

    const proposedPositionValue =
      Number(
        account
          ?.proposedPositionValue,
      );

    const positionValue =
      Number.isFinite(
        proposedPositionValue,
      ) &&
      proposedPositionValue >
        0
        ? proposedPositionValue
        : null;

    /**
     * ======================================================
     * FINAL LIQUIDITY INPUT
     * ======================================================
     */

    return {
      price:
        Number.isFinite(
          price,
        ) &&
        price > 0
          ? price
          : null,

      /**
       * Missing quote remains missing.
       */
      bid:
        validQuote
          ? bid
          : null,

      ask:
        validQuote
          ? ask
          : null,

      currentVolume,

      averageVolume,

      positionValue,

      volatilityPercent,

      session,

      /**
       * Diagnostic information.
       *
       * The orchestrator can ignore this for now.
       */
      quoteFresh,

      quoteAvailable:
        validQuote,
    };
  }
  
  /**
   * ========================================================
   * PROVIDER HELPER
   * ========================================================
   */

  async callProvider(
    provider,
    context,
    fallback,
  ) {
    if (
      typeof provider !==
      "function"
    ) {
      return fallback;
    }

    try {
      const result =
        await provider(
          context,
        );

      return (
        result ??
        fallback
      );
    } catch (error) {
      await this.emitError({
        symbol:
          context.symbol,

        error,

        phase:
          "DATA_PROVIDER",
      });

      return fallback;
    }
  }

  /**
   * ========================================================
   * ANALYZE SYMBOL
   * ========================================================
   */

  async analyzeSymbol({
    symbol,
    bar,
  }) {
    this.runningSymbols.add(
      symbol,
    );

    await this.setStatus(
      LIVE_ENGINE_STATUS
        .ANALYZING,
      {
        symbol,

        barTimestamp:
          bar.timestamp,
      },
    );

    try {
      const snapshot =
        createMarketSnapshot(
          symbol,
        );

      if (!snapshot) {
        throw new Error(
          "Market snapshot unavailable.",
        );
      }

      const candles =
        getMarketCandles(
          symbol,
        );

      /**
       * ====================================================
       * WARMUP
       * ====================================================
       */

      if (
        candles.length <
        this.config
          .minimumCandles
      ) {
        await this.setStatus(
          LIVE_ENGINE_STATUS
            .WAITING_FOR_DATA,
          {
            symbol,

            candleCount:
              candles.length,

            minimumRequired:
              this.config
                .minimumCandles,
          },
        );

        return {
          approved: false,

          status:
            "WARMING_UP",

          symbol,

          candleCount:
            candles.length,

          minimumRequired:
            this.config
              .minimumCandles,
        };
      }

      const quote =
        getLatestQuote(
          symbol,
        );

      const context = {
        symbol,

        bar,

        quote,

        snapshot,

        candles,

        asOfTimestamp:
          bar.timestamp,
      };

      /**
       * ====================================================
       * ACCOUNT
       * ====================================================
       */

      const account =
        await this.callProvider(
          this.accountProvider,

          context,

          null,
        );

      context.account =
        account;

      /**
       * ====================================================
       * EXTERNAL ENGINE DATA
       * ====================================================
       */

            /**
       * ====================================================
       * EXTERNAL ENGINE DATA
       * ====================================================
       *
       * IMPORTANT:
       *
       * Macro data is loaded FIRST.
       *
       * Country Risk depends partly on the same macro
       * snapshot, so we attach the completed macro result
       * to context before running the remaining providers.
       *
       * This prevents:
       *
       * - duplicate FRED requests
       * - macro/country snapshot mismatches
       * - unnecessary API traffic
       */

      const macroInput =
        await this.callProvider(
          this.macroProvider,

          context,

          {},
        );

      /**
       * Make the completed macro snapshot available
       * to downstream providers.
       */

      context.macro =
        macroInput;

      /**
       * ====================================================
       * REMAINING EXTERNAL PROVIDERS
       * ====================================================
       *
       * These providers do not depend on one another,
       * so they can continue running concurrently.
       */

      const [
        countryInput,
        companyInput,
        events,
        socialInput,
        institutionalInput,
        breadth,
        volatility,
        historicalRecords,
      ] =
        await Promise.all([
          /**
           * COUNTRY RISK
           *
           * Receives context.macro from the completed
           * macro provider above.
           */

          this.callProvider(
            this.countryProvider,

            context,

            {},
          ),

          /**
           * COMPANY FUNDAMENTALS
           */

          this.callProvider(
            this.companyProvider,

            context,

            {},
          ),

          /**
           * EVENTS / NEWS
           */

          this.callProvider(
            this.eventProvider,

            context,

            [],
          ),

          /**
           * SOCIAL SENTIMENT
           */

          this.callProvider(
            this.socialProvider,

            context,

            {},
          ),

          /**
           * MARKET BREADTH
           */

          this.callProvider(
            this.breadthProvider,

            context,

            null,
          ),

          /**
           * VOLATILITY
           */

          this.callProvider(
            this.volatilityProvider,

            context,

            null,
          ),

          /**
           * HISTORICAL ANALOGUES
           */

          this.callProvider(
            this
              .historicalRecordsProvider,

            context,

            [],
          ),
        ]);
      /**
       * ====================================================
       * RISK / REWARD
       * ====================================================
       */

      let riskReward =
        await this.callProvider(
          this.riskRewardProvider,

          {
            ...context,

            account,
          },

          null,
        );

      /**
       * Temporary fallback geometry.
       *
       * Later our dedicated live risk setup builder
       * will determine structure-aware stops.
       */

      if (!riskReward) {
        const price =
          Number(
            bar.close,
          );

        const recent =
          candles.slice(
            -15,
          );

        const averageRange =
          recent.length > 0
            ? recent.reduce(
                (
                  sum,
                  candle,
                ) =>
                  sum +
                  Math.abs(
                    Number(
                      candle.high,
                    ) -
                    Number(
                      candle.low,
                    ),
                  ),
                0,
              ) /
              recent.length
            : price *
              0.01;

        const stopDistance =
          Math.max(
            averageRange *
              1.5,

            price *
              0.005,
          );

        riskReward = {
          entryPrice:
            price,

          longStopPrice:
            price -
            stopDistance,

          shortStopPrice:
            price +
            stopDistance,

          longTargetR:
            2.5,

          shortTargetR:
            2.5,
        };
      }

      /**
       * ====================================================
       * LIQUIDITY
       * ====================================================
       */

      const liquidity =
        this.buildLiquidityInput({
          symbol,

          bar,

          quote,

          candles,

          account,
        });

      /**
       * ====================================================
       * RUN FULL ENGINE ORCHESTRATOR
       * ====================================================
       */

      const analysis =
        await runTradingAnalysis({
          symbol,

          account,

          candles,

          breadth,

          volatility,

          liquidity,

          riskReward,

          macroInput,

          countryInput,

          companyInput,

          events,

          socialInput,

          institutionalInput,

          historicalRecords,

          asOfTimestamp:
            bar.timestamp,

          onUpdate:
            async ({
              event,
              state,
            }) => {
              if (
                typeof this
                  .onEngineUpdate ===
                "function"
              ) {
                try {
                  await this
                    .onEngineUpdate({
                      symbol,

                      event,

                      engines:
                        state
                          .engines,

                      timestamp:
                        now(),
                    });
                } catch {
                  // Frontend callback must not break analysis.
                }
              }
            },
        });

      /**
       * ====================================================
       * SAVE RESULT
       * ====================================================
       */

      this.latestAnalysis.set(
        symbol,
        analysis,
      );

      this
        .lastAnalyzedTimestamp
        .set(
          symbol,
          bar.timestamp,
        );

      await this.setStatus(
        LIVE_ENGINE_STATUS
          .COMPLETE,
        {
          symbol,

          decision:
            analysis
              ?.finalDecision ??
            null,
        },
      );

      /**
       * ====================================================
       * DECISION CALLBACK
       * ====================================================
       */

      if (
        typeof this
          .onDecision ===
        "function"
      ) {
        try {
          await this.onDecision({
            symbol,

            bar,

            snapshot,

            analysis,

            finalDecision:
              analysis
                ?.finalDecision ??
              null,

            timestamp:
              now(),
          });
        } catch {
          // Decision consumer must not break runner.
        }
      }

      return analysis;
    } catch (error) {
      await this.emitError({
        symbol,

        error,

        phase:
          "ANALYSIS",
      });

      await this.setStatus(
        LIVE_ENGINE_STATUS.ERROR,
        {
          symbol,
        },
      );

      return {
        approved: false,

        symbol,

        errors: [
          error instanceof Error
            ? error.message
            : String(error),
        ],
      };
    } finally {
      this.runningSymbols.delete(
        symbol,
      );
    }
  }

  /**
   * ========================================================
   * GET LATEST ANALYSIS
   * ========================================================
   */

  getLatestAnalysis(
    symbol,
  ) {
    return (
      this.latestAnalysis.get(
        normalizeSymbol(
          symbol,
        ),
      ) ??
      null
    );
  }

  /**
   * ========================================================
   * STATUS SNAPSHOT
   * ========================================================
   */

  getStatus() {
    return {
      status:
        this.status,

      started:
        this.started,

      symbols: [
        ...this.symbols,
      ],

      runningSymbols: [
        ...this
          .runningSymbols,
      ],

      lastAnalyzedTimestamp:
        Object.fromEntries(
          this
            .lastAnalyzedTimestamp,
        ),

      timestamp:
        now(),
    };
  }

  /**
   * ========================================================
   * STOP
   * ========================================================
   */

  async stop() {
    if (
      typeof this.unsubscribe ===
      "function"
    ) {
      this.unsubscribe();

      this.unsubscribe =
        null;
    }

    this.started =
      false;

    this.runningSymbols.clear();

    await this.setStatus(
      LIVE_ENGINE_STATUS.STOPPED,
    );

    return {
      approved: true,

      status:
        LIVE_ENGINE_STATUS.STOPPED,

      timestamp:
        now(),
    };
  }
}

export default LiveEngineRunner;