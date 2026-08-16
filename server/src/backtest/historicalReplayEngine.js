import runTradingAnalysis from "../orchestration/engineOrchestrator.js";

import {
  executeApprovedPaperTrade,
  processPaperPositionUpdate,
} from "../execution/paperExecutionCoordinator.js";

/**
 * ============================================================
 * HISTORICAL REPLAY ENGINE
 * ============================================================
 *
 * PURPOSE
 * -------
 *
 * Replay historical candles through the complete trading
 * pipeline while preventing future information from leaking
 * into earlier decisions.
 *
 * The engine can:
 *
 * - step through historical candles
 * - create trade decisions
 * - enforce 80+ scoring
 * - apply Decision Gate
 * - apply risk approval
 * - create paper positions
 * - manage trailing loss / trailing gain
 * - close trades
 * - calculate P&L
 * - calculate R multiples
 * - record trade history
 *
 * IMPORTANT
 * ---------
 *
 * This module is for historical simulation only.
 *
 * It does NOT connect to a live broker.
 */

/**
 * ============================================================
 * STATUS
 * ============================================================
 */

export const REPLAY_STATUS =
  Object.freeze({
    COMPLETE: "COMPLETE",

    RUNNING: "RUNNING",

    ERROR: "ERROR",

    INSUFFICIENT_DATA:
      "INSUFFICIENT_DATA",
  });

/**
 * ============================================================
 * DEFAULT CONFIGURATION
 * ============================================================
 */

export const DEFAULT_REPLAY_CONFIG =
  Object.freeze({
    /**
     * Minimum number of candles required before
     * the first analysis.
     *
     * Technical indicators such as SMA200 need
     * enough historical data.
     */
    warmupCandles: 220,

    /**
     * How often the bot is allowed to scan.
     *
     * 1 = every candle.
     *
     * Later this can differ for:
     *
     * 1 minute
     * 5 minute
     * hourly
     * daily
     */
    scanEveryCandles: 1,

    /**
     * Only one open position at a time
     * in the first backtest version.
     */
    maximumOpenPositions: 1,

    /**
     * Prevent immediate repeated re-entry.
     */
    cooldownCandles: 3,

    /**
     * Starting paper account.
     */
    startingBalance: 10000,

    accountRiskPercent: 0.005,

    dailyLossLimit: 200,

    /**
     * Paper execution.
     */
    slippagePercent: 0,

    /**
     * Whether to close an open position
     * at the final candle.
     */
    closeAtEnd: true,
  });

/**
 * ============================================================
 * HELPERS
 * ============================================================
 */

function isFiniteNumber(value) {
  return Number.isFinite(
    Number(value),
  );
}

function positiveNumber(value) {
  return (
    isFiniteNumber(value) &&
    Number(value) > 0
  );
}

function round(
  value,
  decimals = 4,
) {
  if (!isFiniteNumber(value)) {
    return null;
  }

  const factor =
    10 ** decimals;

  return (
    Math.round(
      (
        Number(value) +
        Number.EPSILON
      ) *
        factor,
    ) / factor
  );
}

function timestampOf(
  candle,
) {
  return (
    candle?.timestamp ??
    candle?.time ??
    candle?.date ??
    null
  );
}

function closePriceOf(
  candle,
) {
  return Number(
    candle?.close ??
    candle?.price ??
    0,
  );
}

/**
 * ============================================================
 * VALIDATE CANDLES
 * ============================================================
 */

function validateCandles(
  candles,
) {
  if (
    !Array.isArray(candles) ||
    candles.length === 0
  ) {
    return {
      valid: false,

      errors: [
        "Historical candles are required.",
      ],
    };
  }

  const badIndex =
    candles.findIndex(
      (candle) =>
        !positiveNumber(
          candle?.close,
        ) ||
        !timestampOf(candle),
    );

  if (badIndex !== -1) {
    return {
      valid: false,

      errors: [
        `Invalid candle found at index ${badIndex}.`,
      ],
    };
  }

  return {
    valid: true,

    errors: [],
  };
}

/**
 * ============================================================
 * ACCOUNT
 * ============================================================
 */

function createReplayAccount({
  config,
}) {
  return {
    startingBalance:
      Number(
        config.startingBalance,
      ),

    balance:
      Number(
        config.startingBalance,
      ),

    buyingPower:
      Number(
        config.startingBalance,
      ),

    riskPercent:
      Number(
        config.accountRiskPercent,
      ),

    dailyPnL: 0,

    dailyLossLimit:
      Number(
        config.dailyLossLimit,
      ),

    openPositions: [],

    portfolioExposure: 0,
  };
}

/**
 * ============================================================
 * CALCULATE ATR INPUT
 * ============================================================
 *
 * If your technical engine already exposes ATR,
 * the orchestrator will use that.
 *
 * This helper gives the position manager a fallback
 * during replay.
 */

function calculateSimpleATR(
  candles,
  period = 14,
) {
  if (
    candles.length <
    period + 1
  ) {
    return null;
  }

  const recent =
    candles.slice(
      -(period + 1),
    );

  const ranges = [];

  for (
    let i = 1;
    i < recent.length;
    i += 1
  ) {
    const current =
      recent[i];

    const previous =
      recent[i - 1];

    if (
      !positiveNumber(
        current?.high,
      ) ||
      !positiveNumber(
        current?.low,
      ) ||
      !positiveNumber(
        previous?.close,
      )
    ) {
      continue;
    }

    const high =
      Number(
        current.high,
      );

    const low =
      Number(
        current.low,
      );

    const previousClose =
      Number(
        previous.close,
      );

    const trueRange =
      Math.max(
        high - low,

        Math.abs(
          high -
          previousClose,
        ),

        Math.abs(
          low -
          previousClose,
        ),
      );

    ranges.push(
      trueRange,
    );
  }

  if (
    ranges.length === 0
  ) {
    return null;
  }

  return (
    ranges.reduce(
      (
        sum,
        value,
      ) =>
        sum + value,
      0,
    ) /
    ranges.length
  );
}

/**
 * ============================================================
 * BUILD LIQUIDITY INPUT
 * ============================================================
 *
 * Historical OHLCV usually does not contain real historical
 * bid/ask spread.
 *
 * This first version allows caller-provided builders.
 *
 * Otherwise use conservative synthetic values for testing.
 */

function buildDefaultLiquidity({
  candle,
  positionValue = null,
}) {
  const price =
    Number(
      candle.close,
    );

  const syntheticSpread =
    price *
    0.0005;

  return {
    price,

    bid:
      price -
      syntheticSpread /
        2,

    ask:
      price +
      syntheticSpread /
        2,

    currentVolume:
      Number(
        candle.volume ??
        0,
      ),

    averageVolume:
      Number(
        candle.averageVolume ??
        candle.volume ??
        1_000_000,
      ),

    positionValue,

    volatilityPercent:
      positiveNumber(
        candle.atrPercent,
      )
        ? Number(
            candle.atrPercent,
          )
        : 0.02,

    session:
      "REGULAR",
  };
}

/**
 * ============================================================
 * BUILD RISK/REWARD INPUT
 * ============================================================
 *
 * Initial simple geometry:
 *
 * LONG:
 * stop = entry - ATR * 2
 *
 * SHORT:
 * stop = entry + ATR * 2
 *
 * targets use default R logic inside riskRewardEngine.
 */

function buildDefaultRiskReward({
  candle,
  atr,
}) {
  const entryPrice =
    Number(
      candle.close,
    );

  if (
    !positiveNumber(
      entryPrice,
    ) ||
    !positiveNumber(
      atr,
    )
  ) {
    return null;
  }

  const stopDistance =
    Number(atr) * 2;

  return {
    entryPrice,

    longStopPrice:
      entryPrice -
      stopDistance,

    shortStopPrice:
      entryPrice +
      stopDistance,

    longTargetR: 2.5,

    shortTargetR: 2.5,
  };
}

/**
 * ============================================================
 * PERFORMANCE METRICS
 * ============================================================
 */

function calculateMetrics({
  trades,
  account,
}) {
  const closedTrades =
    trades.filter(
      (trade) =>
        trade.status ===
        "CLOSED",
    );

  const winners =
    closedTrades.filter(
      (trade) =>
        Number(
          trade.realizedPnL,
        ) > 0,
    );

  const losers =
    closedTrades.filter(
      (trade) =>
        Number(
          trade.realizedPnL,
        ) < 0,
    );

  const breakeven =
    closedTrades.filter(
      (trade) =>
        Number(
          trade.realizedPnL,
        ) === 0,
    );

  const grossProfit =
    winners.reduce(
      (
        sum,
        trade,
      ) =>
        sum +
        Number(
          trade.realizedPnL,
        ),
      0,
    );

  const grossLoss =
    Math.abs(
      losers.reduce(
        (
          sum,
          trade,
        ) =>
          sum +
          Number(
            trade.realizedPnL,
          ),
        0,
      ),
    );

  const netPnL =
    closedTrades.reduce(
      (
        sum,
        trade,
      ) =>
        sum +
        Number(
          trade.realizedPnL ??
          0,
        ),
      0,
    );

  const totalR =
    closedTrades.reduce(
      (
        sum,
        trade,
      ) =>
        sum +
        Number(
          trade.finalR ??
          0,
        ),
      0,
    );

  const averageR =
    closedTrades.length > 0
      ? totalR /
        closedTrades.length
      : 0;

  const winRate =
    closedTrades.length > 0
      ? winners.length /
        closedTrades.length
      : 0;

  const profitFactor =
    grossLoss > 0
      ? grossProfit /
        grossLoss
      : grossProfit > 0
        ? Infinity
        : 0;

  const returnPercent =
    Number(
      account.startingBalance,
    ) > 0
      ? (
          account.balance -
          account.startingBalance
        ) /
        account.startingBalance
      : 0;

  return {
    totalTrades:
      closedTrades.length,

    winners:
      winners.length,

    losers:
      losers.length,

    breakeven:
      breakeven.length,

    winRate:
      round(
        winRate,
        4,
      ),

    grossProfit:
      round(
        grossProfit,
        2,
      ),

    grossLoss:
      round(
        grossLoss,
        2,
      ),

    netPnL:
      round(
        netPnL,
        2,
      ),

    averageR:
      round(
        averageR,
        4,
      ),

    profitFactor:
      Number.isFinite(
        profitFactor,
      )
        ? round(
            profitFactor,
            4,
          )
        : "INFINITY",

    startingBalance:
      round(
        account.startingBalance,
        2,
      ),

    endingBalance:
      round(
        account.balance,
        2,
      ),

    returnPercent:
      round(
        returnPercent *
          100,
        2,
      ),
  };
}

/**
 * ============================================================
 * MAIN HISTORICAL REPLAY
 * ============================================================
 */

export async function runHistoricalReplay({
  symbol,

  candles = [],

  /**
   * Historical records for the Historical Analogue Engine.
   */
  historicalRecords = [],

  /**
   * Optional data builders.
   *
   * These allow us to plug real historical macro,
   * fundamental, event, social and liquidity datasets
   * into the replay later.
   */

  getMacroInput = null,

  getCountryInput = null,

  getCompanyInput = null,

  getEvents = null,

  getSocialInput = null,

  getBreadth = null,

  getVolatility = null,

  getLiquidity = null,

  getRiskReward = null,

  config =
    DEFAULT_REPLAY_CONFIG,

  onUpdate = null,
} = {}) {
  const validation =
    validateCandles(
      candles,
    );

  if (!validation.valid) {
    return {
      approved: false,

      engine:
        "HISTORICAL_REPLAY",

      status:
        REPLAY_STATUS
          .INSUFFICIENT_DATA,

      symbol,

      trades: [],

      errors:
        validation.errors,

      warnings: [],
    };
  }

  if (
    candles.length <=
    config.warmupCandles
  ) {
    return {
      approved: false,

      engine:
        "HISTORICAL_REPLAY",

      status:
        REPLAY_STATUS
          .INSUFFICIENT_DATA,

      symbol,

      trades: [],

      errors: [
        `At least ${config.warmupCandles + 1} candles are required.`,
      ],

      warnings: [],
    };
  }

  const account =
    createReplayAccount({
      config,
    });

  const trades = [];

  const decisions = [];

  let openPosition =
    null;

  let currentTrade =
    null;

  let cooldownRemaining =
    0;

  try {
    /**
     * ======================================================
     * CANDLE LOOP
     * ======================================================
     */

    for (
      let index =
        config.warmupCandles;
      index <
      candles.length;
      index += 1
    ) {
      const candle =
        candles[index];

      const currentPrice =
        closePriceOf(
          candle,
        );

      const asOfTimestamp =
        timestampOf(
          candle,
        );

      /**
       * Only candles available up to NOW.
       *
       * This is a core look-ahead safeguard.
       */

      const availableCandles =
        candles.slice(
          0,
          index + 1,
        );

      const atr =
        calculateSimpleATR(
          availableCandles,
        );

      /**
       * ====================================================
       * MANAGE OPEN POSITION FIRST
       * ====================================================
       */

      if (openPosition) {
        const update =
          await processPaperPositionUpdate({
            position:
              openPosition,

            currentPrice,

            atr,

            slippagePercent:
              config
                .slippagePercent,
          });

        if (
          update?.approved === true
        ) {
          openPosition =
            update.position;

          if (
            update.status ===
            "POSITION_CLOSED"
          ) {
            const realizedPnL =
              Number(
                update
                  ?.position
                  ?.realizedPnL ??
                0,
              );

            account.balance +=
              realizedPnL;

            account.buyingPower =
              account.balance;

            account.dailyPnL +=
              realizedPnL;

            if (currentTrade) {
              currentTrade.status =
                "CLOSED";

              currentTrade.exitTimestamp =
                asOfTimestamp;

              currentTrade.exitPrice =
                update
                  ?.execution
                  ?.exitPrice ??
                update
                  ?.position
                  ?.exitPrice ??
                currentPrice;

              currentTrade.exitReason =
                update
                  ?.exitReason ??
                null;

              currentTrade.realizedPnL =
                realizedPnL;

              currentTrade.finalR =
                update
                  ?.management
                  ?.metrics
                  ?.finalR ??
                null;

              currentTrade.peakR =
                update
                  ?.management
                  ?.metrics
                  ?.peakR ??
                null;
            }

            openPosition =
              null;

            currentTrade =
              null;

            cooldownRemaining =
              config
                .cooldownCandles;
          }
        }

        /**
         * Only one position at a time.
         */

        if (openPosition) {
          continue;
        }
      }

      /**
       * ====================================================
       * COOLDOWN
       * ====================================================
       */

      if (
        cooldownRemaining > 0
      ) {
        cooldownRemaining -=
          1;

        continue;
      }

      /**
       * ====================================================
       * SCAN FREQUENCY
       * ====================================================
       */

      if (
        (
          index -
          config.warmupCandles
        ) %
          config.scanEveryCandles !==
        0
      ) {
        continue;
      }

      /**
       * ====================================================
       * BUILD POINT-IN-TIME INPUTS
       * ====================================================
       */

      const context = {
        symbol,

        candle,

        candles:
          availableCandles,

        index,

        asOfTimestamp,

        account,
      };

      const macroInput =
        typeof getMacroInput ===
        "function"
          ? await getMacroInput(
              context,
            )
          : {};

      const countryInput =
        typeof getCountryInput ===
        "function"
          ? await getCountryInput(
              context,
            )
          : {};

      const companyInput =
        typeof getCompanyInput ===
        "function"
          ? await getCompanyInput(
              context,
            )
          : {};

      const events =
        typeof getEvents ===
        "function"
          ? await getEvents(
              context,
            )
          : [];

      const socialInput =
        typeof getSocialInput ===
        "function"
          ? await getSocialInput(
              context,
            )
          : {};

      const breadth =
        typeof getBreadth ===
        "function"
          ? await getBreadth(
              context,
            )
          : null;

      const volatility =
        typeof getVolatility ===
        "function"
          ? await getVolatility(
              context,
            )
          : {
              atrPercent:
                positiveNumber(
                  atr,
                )
                  ? atr /
                    currentPrice
                  : null,
            };

      /**
       * Risk geometry is needed before
       * scoring because R:R contributes 5 points.
       */

      const riskReward =
        typeof getRiskReward ===
        "function"
          ? await getRiskReward({
              ...context,

              atr,
            })
          : buildDefaultRiskReward({
              candle,

              atr,
            });

      const estimatedPositionValue =
        account.balance *
        0.25;

      const liquidity =
        typeof getLiquidity ===
        "function"
          ? await getLiquidity({
              ...context,

              atr,

              riskReward,
            })
          : buildDefaultLiquidity({
              candle,

              positionValue:
                estimatedPositionValue,
            });

      /**
       * ====================================================
       * FULL ANALYSIS
       * ====================================================
       */

      const analysis =
        await runTradingAnalysis({
          symbol,

          account,

          candles:
            availableCandles,

          breadth,

          volatility,

          liquidity,

          riskReward,

          macroInput,

          countryInput,

          companyInput,

          events,

          socialInput,

          historicalRecords,

          asOfTimestamp,

          onUpdate:
            null,
        });

      decisions.push({
        timestamp:
          asOfTimestamp,

        index,

        longScore:
          analysis
            ?.finalDecision
            ?.longScore ??
          0,

        shortScore:
          analysis
            ?.finalDecision
            ?.shortScore ??
          0,

        side:
          analysis
            ?.finalDecision
            ?.preferredSide ??
          null,

        decision:
          analysis
            ?.finalDecision
            ?.decision ??
          "NO_TRADE",

        status:
          analysis
            ?.finalDecision
            ?.status ??
          null,
      });

      /**
       * ====================================================
       * NO APPROVED TRADE
       * ====================================================
       */

      if (
        analysis
          ?.finalDecision
          ?.canProceedToPaperExecution !==
        true
      ) {
        continue;
      }

      const riskApproval =
        analysis
          ?.results
          ?.riskApproval;

      if (
        riskApproval
          ?.canExecute !==
        true
      ) {
        continue;
      }

      /**
       * ====================================================
       * PAPER ENTRY
       * ====================================================
       */

      const entry =
        executeApprovedPaperTrade({
          symbol,

          riskApproval,

          currentPrice,

          slippagePercent:
            config
              .slippagePercent,

          metadata: {
            replay: true,

            candleIndex:
              index,

            timestamp:
              asOfTimestamp,
          },
        });

      if (
        entry?.approved !== true ||
        !entry.position
      ) {
        continue;
      }

      openPosition =
        entry.position;

      account.openPositions =
        [
          openPosition,
        ];

      account.portfolioExposure =
        Number(
          openPosition
            .positionValue ??
          0,
        );

      currentTrade = {
        id:
          openPosition.id,

        symbol,

        side:
          openPosition.side,

        status:
          "OPEN",

        entryTimestamp:
          asOfTimestamp,

        entryIndex:
          index,

        entryPrice:
          openPosition
            .entryPrice,

        initialStopPrice:
          openPosition
            ?.trailingState
            ?.initialStopPrice ??
          openPosition
            .stopPrice,

        targetPrice:
          openPosition
            .targetPrice,

        shares:
          openPosition
            .shares,

        intelligenceScore:
          riskApproval
            .intelligenceScore,

        longScore:
          analysis
            ?.finalDecision
            ?.longScore ??
          null,

        shortScore:
          analysis
            ?.finalDecision
            ?.shortScore ??
          null,

        regime:
          analysis
            ?.finalDecision
            ?.marketRegime ??
          null,

        consensus:
          analysis
            ?.finalDecision
            ?.consensus ??
          null,

        realizedPnL: 0,

        finalR: null,

        peakR: null,

        exitTimestamp: null,

        exitPrice: null,

        exitReason: null,
      };

      trades.push(
        currentTrade,
      );

      if (
        typeof onUpdate ===
        "function"
      ) {
        await onUpdate({
          type:
            "TRADE_OPENED",

          trade:
            currentTrade,

          account: {
            ...account,
          },
        });
      }
    }

    /**
     * ======================================================
     * CLOSE REMAINING POSITION AT END
     * ======================================================
     */

    if (
      openPosition &&
      config.closeAtEnd
    ) {
      const lastCandle =
        candles[
          candles.length - 1
        ];

      const finalPrice =
        closePriceOf(
          lastCandle,
        );

      const atr =
        calculateSimpleATR(
          candles,
        );

      const finalUpdate =
        await processPaperPositionUpdate({
          position:
            openPosition,

          currentPrice:
            finalPrice,

          atr,

          slippagePercent:
            config
              .slippagePercent,
        });

      /**
       * If the normal position manager did not close it,
       * leave it flagged as OPEN_END_OF_TEST for now.
       *
       * We'll later add explicit forced-close support.
       */

      if (
        finalUpdate?.status ===
        "POSITION_CLOSED"
      ) {
        const realizedPnL =
          Number(
            finalUpdate
              ?.position
              ?.realizedPnL ??
            0,
          );

        account.balance +=
          realizedPnL;

        if (currentTrade) {
          currentTrade.status =
            "CLOSED";

          currentTrade.exitTimestamp =
            timestampOf(
              lastCandle,
            );

          currentTrade.exitPrice =
            finalUpdate
              ?.position
              ?.exitPrice ??
            finalPrice;

          currentTrade.exitReason =
            finalUpdate
              ?.exitReason ??
            "END_OF_REPLAY";

          currentTrade.realizedPnL =
            realizedPnL;
        }
      } else if (
        currentTrade
      ) {
        currentTrade.status =
          "OPEN_END_OF_REPLAY";
      }
    }

    /**
     * ======================================================
     * METRICS
     * ======================================================
     */

    const metrics =
      calculateMetrics({
        trades,

        account,
      });

    return {
      approved: true,

      engine:
        "HISTORICAL_REPLAY",

      status:
        REPLAY_STATUS.COMPLETE,

      symbol,

      account,

      metrics,

      trades,

      decisions,

      configuration:
        config,

      warnings: [],

      errors: [],

      timestamp:
        new Date()
          .toISOString(),
    };
  } catch (error) {
    return {
      approved: false,

      engine:
        "HISTORICAL_REPLAY",

      status:
        REPLAY_STATUS.ERROR,

      symbol,

      account,

      trades,

      decisions,

      warnings: [
        "Historical replay failed safely. Results should not be treated as valid strategy performance.",
      ],

      errors: [
        error instanceof Error
          ? error.message
          : String(error),
      ],

      timestamp:
        new Date()
          .toISOString(),
    };
  }
}

export default runHistoricalReplay;