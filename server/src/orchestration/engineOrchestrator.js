import analyzeTechnicalIndicators from "../analysis/technicalIndicatorEngine.js";
import analyzeMacroRegime from "../analysis/macroRegimeEngine.js";
import analyzeCountryRisk from "../analysis/countryRiskEngine.js";
import analyzeCompanyFundamentals from "../analysis/companyFundamentalEngine.js";
import analyzeEvents from "../analysis/eventIntelligenceEngine.js";
import analyzeSocialSentiment from "../analysis/socialSentimentEngine.js";
import analyzeHistoricalAnalogues from "../analysis/historicalAnalogueEngine.js";
import analyzeLiquidityExecution from "../analysis/liquidityExecutionEngine.js";
import analyzeMarketRegime from "../regime/marketRegimeEngine.js";
import evaluateTradeDecision from "../strategy/tradeDecisionGate.js";

import analyzeCrossEngineConsensus from "../analysis/crossEngineConsensusEngine.js";
import scoreTradeOpportunity from "../strategy/tradeScoringEngine.js";
import analyzeRiskReward from "../analysis/riskRewardEngine.js";
import evaluateRiskApproval from "../risk/tradeRiskAdapter.js";

/**
 * ============================================================
 * ENGINE ORCHESTRATOR
 * ============================================================
 *
 * PURPOSE
 * -------
 *
 * Coordinate the full trading intelligence pipeline.
 *
 * WAVE 1
 * ------
 *
 * Run independent engines in parallel:
 *
 * - Technical
 * - Macro
 * - Country
 * - Company
 * - Events
 * - Social
 * - Liquidity
 * - Risk/Reward
 *
 * WAVE 2
 * ------
 *
 * Run engines that depend on Wave 1:
 *
 * - Market Regime
 * - Historical Analogue
 *
 * WAVE 3
 * ------
 *
 * - Cross Engine Consensus
 *
 * WAVE 4
 * ------
 *
 * - Final LONG / SHORT Trade Score
 *
 * WAVE 5
 * ------
 *
 * - Trade Decision Gate
 *
 * FRONTEND
 * --------
 *
 * Every engine state is exposed as:
 *
 * RUNNING
 * COMPLETE
 * ERROR
 * INSUFFICIENT_DATA
 *
 * so the future frontend can show every engine
 * working simultaneously.
 */

/**
 * ============================================================
 * ENGINE STATUS
 * ============================================================
 */

export const ENGINE_STATUS =
  Object.freeze({
    IDLE:
      "IDLE",

    RUNNING:
      "RUNNING",

    COMPLETE:
      "COMPLETE",

    ERROR:
      "ERROR",

    INSUFFICIENT_DATA:
      "INSUFFICIENT_DATA",

    SKIPPED:
      "SKIPPED",
  });

/**
 * ============================================================
 * HELPERS
 * ============================================================
 */

function now() {
  return new Date()
    .toISOString();
}

function safeErrorMessage(
  error,
) {
  if (
    error instanceof Error
  ) {
    return error.message;
  }

  return String(error);
}

/**
 * ============================================================
 * ENGINE STATE
 * ============================================================
 */

function createEngineState({
  engine,
  maximumScore = null,
}) {
  return {
    engine,

    status:
      ENGINE_STATUS.IDLE,

    startedAt: null,

    completedAt: null,

    durationMs: null,

    result: null,

    error: null,

    maximumScore,
  };
}

/**
 * ============================================================
 * ORCHESTRATOR STATE
 * ============================================================
 */

function createInitialState({
  symbol,
}) {
  return {
    symbol,

    status:
      "INITIALIZING",

    startedAt:
      now(),

    completedAt:
      null,

    engines: {
      technical:
        createEngineState({
          engine:
            "TECHNICAL",
          maximumScore: 30,
        }),

      macro:
        createEngineState({
          engine:
            "MACRO_REGIME",
          maximumScore: 15,
        }),

      marketRegime:
        createEngineState({
          engine:
            "MARKET_REGIME",
        }),

      country:
        createEngineState({
          engine:
            "COUNTRY_RISK",
          maximumScore: 10,
        }),

      company:
        createEngineState({
          engine:
            "COMPANY_FUNDAMENTALS",
          maximumScore: 10,
        }),

      events:
        createEngineState({
          engine:
            "EVENT_INTELLIGENCE",
          maximumScore: 10,
        }),

      social:
        createEngineState({
          engine:
            "SOCIAL_SENTIMENT",
          maximumScore: 5,
        }),

      historical:
        createEngineState({
          engine:
            "HISTORICAL_ANALOGUE",
          maximumScore: 5,
        }),

      liquidity:
        createEngineState({
          engine:
            "LIQUIDITY",
          maximumScore: 5,
        }),

      riskReward:
        createEngineState({
          engine:
            "RISK_REWARD",
          maximumScore: 5,
        }),

      consensus:
        createEngineState({
          engine:
            "CROSS_ENGINE_CONSENSUS",
          maximumScore: 5,
        }),
riskApproval:
  createEngineState({
    engine:
      "TRADE_RISK_APPROVAL",
  }),

      scoring:
        createEngineState({
          engine:
            "TRADE_SCORING",
          maximumScore: 100,
        }),

      decisionGate:
        createEngineState({
          engine:
            "TRADE_DECISION_GATE",
        }),
    },

    finalDecision: null,

    warnings: [],

    errors: [],
  };
}

/**
 * ============================================================
 * EVENT CALLBACK
 * ============================================================
 *
 * onUpdate can later feed:
 *
 * WebSocket
 * Server-Sent Events
 * dashboardStream.js
 *
 * This is how the frontend will see engines
 * updating in real time.
 */

async function emitUpdate({
  state,
  onUpdate,
  event,
}) {
  if (
    typeof onUpdate !==
    "function"
  ) {
    return;
  }

  try {
    await onUpdate({
      event,

      state,

      timestamp:
        now(),
    });
  } catch {
    /**
     * Dashboard update failure should
     * never crash trading analysis.
     */
  }
}

/**
 * ============================================================
 * RUN ONE ENGINE SAFELY
 * ============================================================
 */

async function runEngine({
  key,

  state,

  fn,

  onUpdate,

  fallbackResult = null,
}) {
  const engineState =
    state.engines[key];

  engineState.status =
    ENGINE_STATUS.RUNNING;

  engineState.startedAt =
    now();

  const started =
    Date.now();

  await emitUpdate({
    state,

    onUpdate,

    event: {
      type:
        "ENGINE_STARTED",

      engine:
        engineState.engine,
    },
  });

  try {
    const result =
      await fn();

    const finished =
      Date.now();

    engineState.completedAt =
      now();

    engineState.durationMs =
      finished -
      started;

    engineState.result =
      result;

    /**
     * Map result status.
     */

    if (
      result?.status ===
        "INSUFFICIENT_DATA" ||
      result?.status ===
        "INSUFFICIENT_ANALOGUES"
    ) {
      engineState.status =
        ENGINE_STATUS
          .INSUFFICIENT_DATA;
    } else if (
      result?.approved ===
        false ||
      result?.status ===
        "ERROR"
    ) {
      engineState.status =
        ENGINE_STATUS.ERROR;
    } else {
      engineState.status =
        ENGINE_STATUS.COMPLETE;
    }

    await emitUpdate({
      state,

      onUpdate,

      event: {
        type:
          "ENGINE_COMPLETED",

        engine:
          engineState.engine,

        status:
          engineState.status,

        result,
      },
    });

    return result;
  } catch (error) {
    const finished =
      Date.now();

    engineState.status =
      ENGINE_STATUS.ERROR;

    engineState.completedAt =
      now();

    engineState.durationMs =
      finished -
      started;

    engineState.error =
      safeErrorMessage(
        error,
      );

    engineState.result =
      fallbackResult;

    state.errors.push({
      engine:
        engineState.engine,

      message:
        engineState.error,
    });

    await emitUpdate({
      state,

      onUpdate,

      event: {
        type:
          "ENGINE_FAILED",

        engine:
          engineState.engine,

        error:
          engineState.error,
      },
    });

    return fallbackResult;
  }
}

/**
 * ============================================================
 * MAIN ORCHESTRATOR
 * ============================================================
 */

export async function runTradingAnalysis({
  symbol,

  /**
   * Market data.
   */

    account = null,


  candles = [],

  breadth = null,

  volatility = null,

  liquidity = null,

  riskReward = null,

  /**
   * Macro.
   */
  macroInput = {},

  /**
   * Country.
   */
  countryInput = {},

  /**
   * Company.
   */
  companyInput = {},

  /**
   * Events.
   */
  events = [],

  /**
   * Social.
   */
  socialInput = {},

  /**
   * Historical analogue database.
   */
  historicalRecords = [],

  /**
   * Backtest-safe timestamp.
   */
  asOfTimestamp =
    Date.now(),

  /**
   * Optional live-state callback.
   */
  onUpdate = null,
} = {}) {
  const state =
    createInitialState({
      symbol,
    });

  state.status =
    "RUNNING";

  await emitUpdate({
    state,

    onUpdate,

    event: {
      type:
        "ANALYSIS_STARTED",

      symbol,
    },
  });

  try {
    /**
     * ======================================================
     * WAVE 1
     * ======================================================
     *
     * Independent engines run simultaneously.
     */

    const [
      technical,
      macro,
      country,
      company,
      eventResult,
      social,
      liquidityResult,
      riskRewardResult,
    ] =
      await Promise.all([
        /**
         * TECHNICAL
         */
        runEngine({
          key:
            "technical",

          state,

          onUpdate,

          fn: async () =>
            analyzeTechnicalIndicators({
              candles,
            }),

          fallbackResult: {
            approved: false,

            engine:
              "TECHNICAL",

            status:
              "ERROR",

            direction:
              "UNKNOWN",

            confidence: 0,
          },
        }),

        /**
         * MACRO
         */
        runEngine({
          key:
            "macro",

          state,

          onUpdate,

          fn: async () =>
            analyzeMacroRegime({
              ...macroInput,
            }),

          fallbackResult: {
            approved: false,

            engine:
              "MACRO_REGIME",

            status:
              "ERROR",

            direction:
              "UNKNOWN",

            confidence: 0,

            rawScore: 0,
          },
        }),

        /**
         * COUNTRY
         */
        runEngine({
          key:
            "country",

          state,

          onUpdate,

          fn: async () =>
            analyzeCountryRisk({
              ...countryInput,
            }),

          fallbackResult: {
            approved: false,

            engine:
              "COUNTRY_RISK",

            status:
              "ERROR",

            direction:
              "UNKNOWN",

            confidence: 0,

            rawScore: 0,
          },
        }),

        /**
         * COMPANY
         */
        runEngine({
          key:
            "company",

          state,

          onUpdate,

          fn: async () =>
            analyzeCompanyFundamentals({
              symbol,

              ...companyInput,
            }),

          fallbackResult: {
            approved: false,

            engine:
              "COMPANY_FUNDAMENTALS",

            status:
              "ERROR",

            direction:
              "UNKNOWN",

            confidence: 0,

            rawScore: 0,
          },
        }),

        /**
         * EVENTS
         */
        runEngine({
          key:
            "events",

          state,

          onUpdate,

          fn: async () =>
            analyzeEvents({
              events,

              symbol,

              country:
                countryInput
                  ?.country ??
                null,

              sector:
                companyInput
                  ?.sector ??
                null,

              currentTimestamp:
                asOfTimestamp,
            }),

          fallbackResult: {
            approved: false,

            engine:
              "EVENT_INTELLIGENCE",

            status:
              "ERROR",

            direction:
              "UNKNOWN",

            confidence: 0,

            rawScore: 0,

            eventFreeze: {
              active: true,

              reasons: [
                {
                  type:
                    "ENGINE_FAILURE",

                  reason:
                    "Event engine unavailable.",
                },
              ],
            },
          },
        }),

        /**
         * SOCIAL
         */
        runEngine({
          key:
            "social",

          state,

          onUpdate,

          fn: async () =>
            analyzeSocialSentiment({
              symbol,

              ...socialInput,
            }),

          fallbackResult: {
            approved: false,

            engine:
              "SOCIAL_SENTIMENT",

            status:
              "ERROR",

            direction:
              "UNKNOWN",

            confidence: 0,

            rawScore: 0,
          },
        }),

        /**
         * LIQUIDITY
         */
        runEngine({
          key:
            "liquidity",

          state,

          onUpdate,

          fn: async () =>
            analyzeLiquidityExecution({
              symbol,

              price:
                liquidity?.price,

              bid:
                liquidity?.bid,

              ask:
                liquidity?.ask,

              currentVolume:
                liquidity?.currentVolume,

              averageVolume:
                liquidity?.averageVolume,

              positionValue:
                liquidity?.positionValue,

              volatilityPercent:
                liquidity?.volatilityPercent,

              session:
                liquidity?.session,
            }),

          fallbackResult: {
            approved: false,

            engine:
              "LIQUIDITY_EXECUTION",

            status:
              "ERROR",

            executionDecision:
              "BLOCK",

            qualityScore: 0,

            directionalSupport: {
              long: 0,
              short: 0,
            },
          },
        }),

        /**
         * RISK / REWARD
         */
        runEngine({
          key:
            "riskReward",

          state,

          onUpdate,

        fn: async () =>
  analyzeRiskReward({
    entryPrice:
      riskReward?.entryPrice,

    longStopPrice:
      riskReward?.longStopPrice,

    shortStopPrice:
      riskReward?.shortStopPrice,

    longTargetPrice:
      riskReward?.longTargetPrice,

    shortTargetPrice:
      riskReward?.shortTargetPrice,

    longTargetR:
      riskReward?.longTargetR,

    shortTargetR:
      riskReward?.shortTargetR,

    longWinProbability:
      riskReward?.longWinProbability,

    shortWinProbability:
      riskReward?.shortWinProbability,
  }),

          fallbackResult: {
            approved: false,

            engine:
              "RISK_REWARD",

            status:
              "ERROR",
          },
        }),
      ]);

    /**
     * ======================================================
     * WAVE 2A — MARKET REGIME
     * ======================================================
     *
     * Depends on:
     *
     * technical
     * macro
     * breadth
     * volatility
     * liquidity
     */

    const marketRegime =
      await runEngine({
        key:
          "marketRegime",

        state,

        onUpdate,

        fn: async () =>
          analyzeMarketRegime({
            technical,

            macro,

            breadth,

            volatility,

            liquidity:
              liquidityResult,
          }),

        fallbackResult: {
          approved: false,

          engine:
            "MARKET_REGIME",

          status:
            "ERROR",

          regime:
            "SIDEWAYS",

          direction:
            "NEUTRAL",

          confidence: 0,

          rawScore: 0,
        },
      });

    /**
     * ======================================================
     * WAVE 2B — HISTORICAL ANALOGUE
     * ======================================================
     *
     * Now that Wave 1 + regime are complete,
     * construct the current market fingerprint
     * and compare it to history.
     */

    const historical =
      await runEngine({
        key:
          "historical",

        state,

        onUpdate,

        fn: async () =>
          analyzeHistoricalAnalogues({
            technical,

            macro,

            marketRegime,

            country,

            company,

            events:
              eventResult,

            social,

            volatility:
              marketRegime
                ?.volatility ??
              volatility,

            liquidity:
              liquidityResult,

            historicalRecords,

            asOfTimestamp,
          }),

        fallbackResult: {
          approved: false,

          engine:
            "HISTORICAL_ANALOGUE",

          status:
            "ERROR",

          direction:
            "UNKNOWN",

          confidence: 0,

          rawScore: 0,

          directionalSupport: {
            long: 0.5,

            short: 0.5,
          },
        },
      });

    /**
     * ======================================================
     * WAVE 3 — CROSS ENGINE CONSENSUS
     * ======================================================
     */

    const consensus =
      await runEngine({
        key:
          "consensus",

        state,

        onUpdate,

        fn: async () =>
          analyzeCrossEngineConsensus({
            technical,

            macro,

            marketRegime,

            country,

            company,

            events:
              eventResult,

            social,

            historical,

            liquidity:
              liquidityResult,

            riskReward:
              riskRewardResult,
          }),

        fallbackResult: {
          approved: false,

          engine:
            "CROSS_ENGINE_CONSENSUS",

          status:
            "ERROR",

          direction:
            "INSUFFICIENT_DATA",

          confidence: 0,

          rawScore: 0,

          directionalSupport: {
            long: 0.5,

            short: 0.5,
          },
        },
      });

    /**
     * ======================================================
     * WAVE 4 — FINAL TRADE SCORING
     * ======================================================
     */

    const scoring =
      await runEngine({
        key:
          "scoring",

        state,

        onUpdate,

        fn: async () =>
          scoreTradeOpportunity({
            symbol,

            technical,

            macro,

            marketRegime,

            events:
              eventResult,

            company,

            country,

            social,

            historical,

            liquidity:
              liquidityResult,

            riskReward:
              riskRewardResult,

            consensus,
          }),

        fallbackResult: {
          approved: false,

          engine:
            "TRADE_SCORING",

          status:
            "ERROR",

          symbol,

          preferredSide:
            null,

          preferredScore:
            0,

          tradeEligible:
            false,
        },
      });

    /**
     * ======================================================
     * WAVE 5 — TRADE DECISION GATE
     * ======================================================
     *
     * Final safety gate before tradeRiskManager.js.
     *
     * A score >= 80 is necessary, but it is NOT sufficient.
     * Liquidity, risk/reward, event freezes, engine health,
     * directional ambiguity, and consensus are checked here.
     */

    const decisionGate =
      await runEngine({
        key:
          "decisionGate",

        state,

        onUpdate,

        fn: async () =>
          evaluateTradeDecision({
            symbol,

            scoring,

            events:
              eventResult,

            liquidity:
              liquidityResult,

            riskReward:
              riskRewardResult,

            consensus,

            engineStates:
              state.engines,
          }),

        fallbackResult: {
          approved: false,

          engine:
            "TRADE_DECISION_GATE",

          status:
            "ERROR",

          decision:
            "NO_TRADE",

          canProceedToRiskManager:
            false,

          side: null,

          score: 0,

          reasons: [
            "Decision gate unavailable.",
          ],

          warnings: [],
        },
      });
/**
 * ============================================================
 * WAVE 6 — TRADE RISK APPROVAL
 * ============================================================
 *
 * Only runs when the Decision Gate allows the candidate
 * to proceed to the risk manager.
 */

    const riskApproval =
      await runEngine({
        key:
          "riskApproval",

        state,

        onUpdate,

        fn: async () => {
          if (
            decisionGate
              ?.canProceedToRiskManager !==
            true
          ) {
            return {
              approved: false,

              engine:
                "TRADE_RISK_APPROVAL",

              status:
                "BLOCKED",

              canExecute:
                false,

              reasons: [
                "Decision Gate did not approve this trade for risk evaluation.",
              ],

              warnings: [],

              timestamp:
                now(),
            };
          }

          return evaluateRiskApproval({
            symbol,

            decisionGate,

            /**
             * ======================================================
             * REAL ALPACA ACCOUNT STATE
             * ======================================================
             */

            accountBalance:
              account?.balance,

            accountEquity:
              account?.equity,

            accountRiskPercent:
              account?.riskPercent,

            buyingPower:
              account?.buyingPower,

            accountStatus:
              account?.status,

            tradingBlocked:
              account?.tradingBlocked ===
              true,

            accountBlocked:
              account?.accountBlocked ===
              true,

            shortingEnabled:
              account?.shortingEnabled ===
              true,

            dailyPnL:
              account?.dailyPnL,

            dailyLossLimit:
              account?.dailyLossLimit,

            openPositions:
              Array.isArray(
                account?.openPositions,
              )
                ? account.openPositions
                : [],

            portfolioExposure:
              Number.isFinite(
                Number(
                  account
                    ?.portfolioExposure,
                ),
              )
                ? Number(
                    account
                      .portfolioExposure,
                  )
                : null,

            /**
             * ======================================================
             * MARKET / TRADE RISK INPUTS
             * ======================================================
             */

            atr:
              technical
                ?.indicators
                ?.atr
                ?.value ??
              null,

            liquidity:
              liquidityResult,

            marketRegime,

            /**
             * ======================================================
             * ADDITIONAL INTELLIGENCE CONTEXT
             * ======================================================
             */

            additionalContext: {
              scoring,

              consensus,

              macro,

              country,

              company,

              events:
                eventResult,
            },
          });
        },

        fallbackResult: {
          approved: false,

          engine:
            "TRADE_RISK_APPROVAL",

          status:
            "ERROR",

          canExecute:
            false,

          reasons: [
            "Trade risk approval engine unavailable.",
          ],

          warnings: [],
        },
      });

    /**
     * ======================================================
     * FINAL DECISION
     * ======================================================
     *
     * Still NOT execution.
     *
     * Only a decisionGate result with
     * canProceedToRiskManager === true may continue to:
     *
     * tradeRiskManager.js
     */

    state.finalDecision = {
  symbol,

  status:
    riskApproval?.status ??
    decisionGate?.status ??
    "NO_TRADE",

  decision:
    riskApproval
      ?.canExecute === true
      ? "APPROVED_FOR_PAPER_EXECUTION"
      : "NO_TRADE",

  preferredSide:
    decisionGate?.side ??
    null,

  preferredScore:
    decisionGate?.score ??
    0,

  longScore:
    scoring
      ?.long
      ?.score ??
    0,

  shortScore:
    scoring
      ?.short
      ?.score ??
    0,

  tradeEligible:
    decisionGate
      ?.canProceedToRiskManager ===
    true,

  canProceedToRiskManager:
    decisionGate
      ?.canProceedToRiskManager ===
    true,

  riskApproved:
    riskApproval
      ?.canExecute ===
    true,

  canProceedToPaperExecution:
    riskApproval
      ?.canExecute ===
    true,

  eventFreeze:
    eventResult
      ?.eventFreeze
      ?.active === true,

  marketRegime:
    marketRegime
      ?.regime ??
    null,

  recessionRisk:
    macro
      ?.recessionRisk ??
    null,

  consensus:
    consensus
      ?.direction ??
    null,

  tradeGeometry:
    decisionGate
      ?.tradeGeometry ??
    null,

  execution:
    decisionGate
      ?.execution ??
    null,

  position:
    riskApproval
      ?.position ??
    null,

  riskStatus:
    riskApproval
      ?.status ??
    null,

  reasons: [
    ...(
      decisionGate
        ?.reasons ??
      []
    ),

    ...(
      riskApproval
        ?.reasons ??
      []
    ),
  ],

  warnings: [
    ...(
      decisionGate
        ?.warnings ??
      []
    ),

    ...(
      riskApproval
        ?.warnings ??
      []
    ),
  ],

  timestamp:
    now(),
};

    /**
     * ======================================================
     * COMPLETE
     * ======================================================
     */

    state.status =
      "COMPLETE";

    state.completedAt =
      now();

    await emitUpdate({
      state,

      onUpdate,

      event: {
        type:
          "ANALYSIS_COMPLETED",

        symbol,

        finalDecision:
          state.finalDecision,
      },
    });

    return {
      approved: true,

      ...state,

      results: {
  technical,
  macro,
  marketRegime,
  country,
  company,

  events:
    eventResult,

  social,
  historical,

  liquidity:
    liquidityResult,

  riskReward:
    riskRewardResult,

  consensus,
  scoring,
  decisionGate,
  riskApproval,
},
    };
  } catch (error) {
    /**
     * ======================================================
     * ORCHESTRATOR SAFE FAIL
     * ======================================================
     */

    state.status =
      "ERROR";

    state.completedAt =
      now();

    state.errors.push({
      engine:
        "ENGINE_ORCHESTRATOR",

      message:
        safeErrorMessage(
          error,
        ),
    });

    state.finalDecision = {
      symbol,

      status:
        "SYSTEM_ERROR",

      decision:
        "NO_TRADE",

      preferredSide:
        null,

      preferredScore: 0,

      longScore: 0,

      shortScore: 0,

      tradeEligible:
        false,

      canProceedToRiskManager:
        false,

      eventFreeze: true,

      tradeGeometry:
        null,

      execution:
        null,

      reasons: [
        "Analysis orchestration failed.",
      ],

      warnings: [],

      timestamp:
        now(),
    };

    await emitUpdate({
      state,

      onUpdate,

      event: {
        type:
          "ANALYSIS_FAILED",

        symbol,

        error:
          safeErrorMessage(
            error,
        ),
      },
    });

    return {
      approved: false,

      ...state,
    };
  }
}

export default runTradingAnalysis;