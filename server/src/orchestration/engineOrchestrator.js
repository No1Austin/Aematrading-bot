import analyzeTechnicalIndicators from "../analysis/technicalIndicatorEngine.js";
import analyzeMacroRegime from "../analysis/macroRegimeEngine.js";
import analyzeCountryRisk from "../analysis/countryRiskEngine.js";
import analyzeCompanyFundamentals from "../analysis/companyFundamentalEngine.js";
import analyzeCompanyEconomicExposure from "../analysis/companyEconomicExposureEngine.js";
import analyzeEvents from "../analysis/eventIntelligenceEngine.js";
import analyzeSocialSentiment from "../analysis/socialSentimentEngine.js";
import analyzeInstitutionalPosition from "../analysis/institutionalPositionEngine.js";
import analyzeHistoricalAnalogues from "../analysis/historicalAnalogueEngine.js";
import analyzeLiquidityExecution from "../analysis/liquidityExecutionEngine.js";
import analyzeMarketRegime from "../regime/marketRegimeEngine.js";
import evaluateTradeDecision from "../strategy/tradeDecisionGate.js";
import evaluateRiskApproval from "../risk/tradeRiskAdapter.js";
import analyzeCrossEngineConsensus from "../analysis/crossEngineConsensusEngine.js";
import scoreTradeOpportunity from "../strategy/tradeScoringEngine.js";
import analyzeRiskReward from "../analysis/riskRewardEngine.js";
import createTradeSetupFingerprint from "../history/tradeSetupFingerprint.js";
import findHistoricalAnalogues from "../history/tradeSimilarityEngine.js";
import analyzeTradeHistoryOutcomes from "../history/tradeHistoryOutcomeEngine.js";
import evaluatePortfolioRisk from "../risk/portfolioRiskEngine.js";
import evaluateCorrelationExposure from "../risk/correlationExposureEngine.js";
import evaluateVolatilityRisk from "../risk/volatilityRiskEngine.js";
import evaluateDrawdownRecovery from "../risk/drawdownRecoveryEngine.js";
import evaluateLiquidityStress from "../risk/liquidityStressEngine.js";
import evaluateExecutionTiming from "../risk/executionTimingEngine.js";
import evaluateMarketShockHalt from "../risk/marketShockHaltEngine.js";
import evaluateOrderExecutionQuality from "../execution/orderExecutionQualityEngine.js";
import getLiveSocialSentiment
  from "../services/liveSocialSentimentService.js";

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
 * - Events
 * - Social
 * - Institutional Position
 * - Liquidity
 * - Risk/Reward
 *
 * WAVE 2
 * ------
 *
 * Run engines that depend on Wave 1:
 *
 * - Company Economic Exposure
 * - Company Fundamentals
 * - Market Regime
 * - Historical Analogue
 * - Bot Trade Setup Fingerprint
 * - Bot Trade Similarity
 * - Bot Trade History Outcome
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
 * WAVE 6
 * ------
 *
 * - Trade Risk Approval
 *
 * WAVE 7
 * ------
 *
 * - Portfolio Risk Approval
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

function normalizePositiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0
    ? Math.floor(parsed)
    : fallback;
}

async function withTimeout(task, timeoutMs, label = "operation") {
  const limit = normalizePositiveInteger(timeoutMs, 30000);
  let timer = null;

  try {
    return await Promise.race([
      Promise.resolve().then(task),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`${label} timed out after ${limit}ms.`));
        }, limit);
      }),
    ]);
  } finally {
    if (timer !== null) {
      clearTimeout(timer);
    }
  }
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
          maximumScore: 10,
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
          maximumScore: 2.5,
        }),

      company:
        createEngineState({
          engine:
            "COMPANY_FUNDAMENTALS",
          maximumScore: 30,
        }),

      economicExposure:
        createEngineState({
          engine:
            "COMPANY_ECONOMIC_EXPOSURE",
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

      institutional:
        createEngineState({
          engine:
            "INSTITUTIONAL_POSITION",
          maximumScore: 7.5,
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
          maximumScore: null,
        }),

      riskReward:
        createEngineState({
          engine:
            "RISK_REWARD",
          maximumScore: null,
        }),

      tradeFingerprint:
        createEngineState({
          engine:
            "TRADE_SETUP_FINGERPRINT",
        }),

      historySimilarity:
        createEngineState({
          engine:
            "TRADE_HISTORY_SIMILARITY",
        }),

      historyOutcome:
        createEngineState({
          engine:
            "TRADE_HISTORY_OUTCOME",
        }),

      consensus:
        createEngineState({
          engine:
            "CROSS_ENGINE_CONSENSUS",
          maximumScore: null,
        }),
riskApproval:
  createEngineState({
    engine:
      "TRADE_RISK_APPROVAL",
  }),

      portfolioRisk:
        createEngineState({
          engine:
            "PORTFOLIO_RISK",
        }),

      correlationExposure:
        createEngineState({
          engine:
            "CORRELATION_EXPOSURE",
        }),

      volatilityRisk:
        createEngineState({
          engine:
            "VOLATILITY_RISK",
        }),

      drawdownRecovery:
        createEngineState({
          engine:
            "DRAWDOWN_RECOVERY",
        }),

      liquidityStress:
        createEngineState({
          engine:
            "LIQUIDITY_STRESS",
        }),

      executionTiming:
        createEngineState({
          engine:
            "EXECUTION_TIMING",
        }),

      marketShockHalt:
        createEngineState({
          engine:
            "MARKET_SHOCK_HALT",
        }),

      orderExecutionQuality:
        createEngineState({
          engine:
            "ORDER_EXECUTION_QUALITY",
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
  timeoutMs = null,
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
    const result = await withTimeout(
      fn,
      timeoutMs ?? state.engineTimeoutMs ?? 30000,
      engineState.engine,
    );

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
 * PIPELINE STAGE CONTROL
 * ============================================================
 *
 * stopAfter is optional and is intended for deterministic
 * stage-specific integration testing / research.
 *
 * Production behavior is unchanged when stopAfter is null:
 * the complete pipeline runs through ORDER_EXECUTION_QUALITY.
 */
export const PIPELINE_STAGE = Object.freeze({
  PORTFOLIO_RISK: "PORTFOLIO_RISK",
  CORRELATION_EXPOSURE: "CORRELATION_EXPOSURE",
  VOLATILITY_RISK: "VOLATILITY_RISK",
  DRAWDOWN_RECOVERY: "DRAWDOWN_RECOVERY",
  LIQUIDITY_STRESS: "LIQUIDITY_STRESS",
  EXECUTION_TIMING: "EXECUTION_TIMING",
  MARKET_SHOCK_HALT: "MARKET_SHOCK_HALT",
  ORDER_EXECUTION_QUALITY: "ORDER_EXECUTION_QUALITY",
});

const PIPELINE_STAGE_RANK = Object.freeze({
  [PIPELINE_STAGE.PORTFOLIO_RISK]: 1,
  [PIPELINE_STAGE.CORRELATION_EXPOSURE]: 2,
  [PIPELINE_STAGE.VOLATILITY_RISK]: 3,
  [PIPELINE_STAGE.DRAWDOWN_RECOVERY]: 4,
  [PIPELINE_STAGE.LIQUIDITY_STRESS]: 5,
  [PIPELINE_STAGE.EXECUTION_TIMING]: 6,
  [PIPELINE_STAGE.MARKET_SHOCK_HALT]: 7,
  [PIPELINE_STAGE.ORDER_EXECUTION_QUALITY]: 8,
});

function buildSkippedStageResult({
  engine,
  position,
  reason,
}) {
  const shares = Number(position?.shares);
  const upstreamShares =
    Number.isFinite(shares) && shares > 0
      ? shares
      : 0;

  // IMPORTANT: a stage that did not run must never claim that it
  // approved execution. Keep the upstream position only as diagnostic
  // context for partial/integration-test runs. Final authorization is
  // evaluated only through the requested boundary.
  return {
    approved: false,
    engine,
    status: ENGINE_STATUS.SKIPPED,
    action: "SKIP",
    canExecute: false,
    exposureMultiplier: 0,
    originalShares: upstreamShares,
    approvedShares: 0,
    passThroughPosition:
      upstreamShares > 0
        ? {
            ...position,
            shares: upstreamShares,
          }
        : null,
    metrics: {
      stageControl: true,
      skipped: true,
      upstreamShares,
    },
    reasons: [
      reason ??
        "Stage skipped because the requested integration-test boundary was reached.",
    ],
    warnings: [
      "This stage was not evaluated and therefore grants no execution authorization.",
    ],
    errors: [],
  };
}

/**
 * ============================================================
 * EXECUTION APPROVAL CHAIN VALIDATOR
 * ============================================================
 *
 * Defense in depth for final execution authorization.
 *
 * A downstream stage can never resurrect a trade that failed an
 * earlier mandatory approval. Full production runs require every
 * downstream stage through ORDER_EXECUTION_QUALITY to explicitly
 * authorize. stopAfter runs validate only through their requested
 * boundary.
 */
function validateExecutionApprovalChain({
  decisionGate,
  riskApproval,
  stageResults,
  boundaryStage,
  finalPosition,
}) {
  const failures = [];

  if (
    decisionGate
      ?.canProceedToRiskManager !==
    true
  ) {
    failures.push(
      "Decision Gate did not authorize risk evaluation.",
    );
  }

  if (
    riskApproval
      ?.canExecute !==
    true
  ) {
    failures.push(
      "Trade Risk Approval did not authorize execution.",
    );
  }

  const boundaryRank =
    PIPELINE_STAGE_RANK[
      boundaryStage
    ];

  if (
    !Number.isFinite(
      boundaryRank,
    )
  ) {
    failures.push(
      `Unknown execution boundary: ${String(
        boundaryStage,
      )}.`,
    );
  }

  const orderedStages =
    Object.entries(
      PIPELINE_STAGE_RANK,
    )
      .sort(
        (
          [, leftRank],
          [, rightRank],
        ) =>
          leftRank -
          rightRank,
      );

  for (
    const [
      stage,
      rank,
    ]
    of orderedStages
  ) {
    if (
      Number.isFinite(
        boundaryRank,
      ) &&
      rank >
        boundaryRank
    ) {
      break;
    }

    const result =
      stageResults
        ?.[stage];

    if (!result) {
      failures.push(
        `${stage} result is missing.`,
      );

      continue;
    }

    if (
      result
        ?.status ===
        ENGINE_STATUS.SKIPPED
    ) {
      failures.push(
        `${stage} was skipped before the requested execution boundary.`,
      );

      continue;
    }

    if (
      result
        ?.canExecute !==
        true
    ) {
      failures.push(
        `${stage} did not authorize execution.`,
      );
    }
  }

  const shares =
    Number(
      finalPosition
        ?.shares,
    );

  if (
    !finalPosition ||
    !Number.isFinite(
      shares,
    ) ||
    shares <=
      0
  ) {
    failures.push(
      "Final approved position is missing or has invalid shares.",
    );
  }

  return {
    approved:
      failures.length ===
      0,

    failures,

    boundaryStage,

    validatedThrough:
      Number.isFinite(
        boundaryRank,
      )
        ? boundaryStage
        : null,

    finalShares:
      Number.isFinite(
        shares,
      ) &&
      shares >
        0
        ? shares
        : 0,
  };
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

  /**
   * Correlation / exposure data.
   *
   * candidateReturns:
   *   Return series for the proposed trade symbol.
   *
   * positionReturns:
   *   Map keyed by symbol containing return series for
   *   currently open positions.
   *
   * Example:
   * {
   *   candidateReturns: [...],
   *   positionReturns: {
   *     MSFT: [...],
   *     NVDA: [...],
   *   },
   * }
   */
  correlationInput = {
    candidateReturns: [],
    positionReturns: {},
  },

  candles = [],

  breadth = null,

  volatility = null,

  liquidity = null,

  /**
   * Execution timing evidence.
   *
   * Optional fields:
   * - timestamp
   * - scheduledEventAt
   * - minutesUntilScheduledEvent
   * - config
   */
  executionTiming = null,

  /**
   * Market shock / halt evidence.
   */
  marketShock = null,

  /**
   * Final order execution evidence.
   *
   * Expected fields may include:
   * - bid
   * - ask
   * - lastPrice
   * - orderType
   * - intendedPrice
   * - estimatedFillPrice
   * - quoteTimestamp
   */
  orderExecution = null,

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
  useLiveSocial = false,

  liveSocialConfig = {},

  /**
   * Institutional-position evidence.
   *
   * Provider-agnostic normalized evidence. Example fields:
   * - evidenceAt / filedAt / publishedAt
   * - reportingPeriodEnd
   * - institutionsEvaluated
   * - increasedPositions / reducedPositions
   * - newPositions / exitedPositions
   * - sharesAdded / sharesReduced
   * - ownershipPercent / previousOwnershipPercent
   *
   * This remains optional evidence. Missing input must not
   * fabricate institutional conviction.
   */
  institutionalInput = null,

  /**
   * Historical analogue database.
   */
/**
 * Historical MARKET analogue database.
 *
 * These are historical market-state records generated
 * from market data and forward outcomes.
 *
 * They are NOT completed bot trades.
 */
historicalRecords = [],

/**
 * Bot's own CLOSED / COMPLETED trade history.
 *
 * This is deliberately separate from historicalRecords.
 */
botTradeHistory = [],

  /**
   * Backtest-safe timestamp.
   */
  asOfTimestamp =
    Date.now(),

  /**
   * Optional integration-test / research boundary.
   *
   * null = run the complete production pipeline.
   */
  stopAfter = null,

  /**
   * Per-engine timeout. A hung provider/engine must never hold
   * the orchestration pipeline indefinitely.
   */
  engineTimeoutMs = 30000,

  /**
   * Optional live-state callback.
   */
  onUpdate = null,
} = {}) {
  const state =
    createInitialState({
      symbol,
    });

  state.engineTimeoutMs = normalizePositiveInteger(
    engineTimeoutMs,
    30000,
  );

  const normalizedSymbol = String(symbol ?? "")
    .trim()
    .toUpperCase();

  if (!normalizedSymbol) {
    state.status = "ERROR";
    state.completedAt = now();
    state.errors.push({
      engine: "ENGINE_ORCHESTRATOR",
      message: "A non-empty trading symbol is required.",
    });
    state.finalDecision = {
      symbol: null,
      status: "INVALID_INPUT",
      decision: "NO_TRADE",
      canProceedToRiskManager: false,
      canProceedToPaperExecution: false,
      reasons: ["A non-empty trading symbol is required."],
      warnings: [],
      timestamp: now(),
    };
    return { approved: false, ...state };
  }

  symbol = normalizedSymbol;
  state.symbol = normalizedSymbol;

  const normalizedStopAfter =
    stopAfter === null || stopAfter === undefined
      ? null
      : String(stopAfter).trim().toUpperCase();

  if (
    normalizedStopAfter !== null &&
    !(normalizedStopAfter in PIPELINE_STAGE_RANK)
  ) {
    state.status = "ERROR";
    state.completedAt = now();
    state.errors.push({
      engine: "ENGINE_ORCHESTRATOR",
      message: `Invalid stopAfter stage: ${normalizedStopAfter}.`,
    });
    state.finalDecision = {
      symbol,
      status: "INVALID_INPUT",
      decision: "NO_TRADE",
      canProceedToRiskManager: false,
      canProceedToPaperExecution: false,
      reasons: [`Invalid stopAfter stage: ${normalizedStopAfter}.`],
      warnings: [],
      timestamp: now(),
    };
    return { approved: false, ...state };
  }

  const isPartialRun = normalizedStopAfter !== null;

  const requestedStageRank =
    normalizedStopAfter === null
      ? null
      : PIPELINE_STAGE_RANK[normalizedStopAfter];

  const shouldRunStage =
    (stage) => {
      if (
        requestedStageRank ===
        null
      ) {
        return true;
      }

      const stageRank =
        PIPELINE_STAGE_RANK[
          stage
        ];

      return (
        Number.isFinite(
          stageRank,
        ) &&
        stageRank <=
          requestedStageRank
      );
    };

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
      eventResult,
      social,
      institutional,
      liquidityResult,
      riskRewardResult,
    ] = await Promise.all([
      runEngine({
        key: "technical",
        state,
        onUpdate,
        fn: async () =>
          analyzeTechnicalIndicators({
            symbol,
            candles,
          }),
        fallbackResult: {
          approved: false,
          engine: "TECHNICAL_INDICATORS",
          status: "ERROR",
          direction: "UNKNOWN",
          confidence: 0,
          directionalSupport: {
            long: 0,
            short: 0,
          },
        },
      }),

      runEngine({
        key: "macro",
        state,
        onUpdate,
        fn: async () => analyzeMacroRegime({ ...macroInput }),
        fallbackResult: {
          approved: false,
          engine: "MACRO_REGIME",
          status: "ERROR",
          direction: "UNKNOWN",
          confidence: 0,
          rawScore: 0,
        },
      }),

      runEngine({
        key: "country",
        state,
        onUpdate,
        fn: async () => analyzeCountryRisk({ ...countryInput }),
        fallbackResult: {
          approved: false,
          engine: "COUNTRY_RISK",
          status: "ERROR",
          direction: "UNKNOWN",
          confidence: 0,
          rawScore: 0,
        },
      }),

      runEngine({
        key: "events",
        state,
        onUpdate,
        fn: async () =>
          analyzeEvents({
            events,
            symbol,
            country: countryInput?.country ?? null,
            sector: companyInput?.sector ?? null,
            currentTimestamp: asOfTimestamp,
          }),
        fallbackResult: {
          approved: false,
          engine: "EVENT_INTELLIGENCE",
          status: "ERROR",
          direction: "UNKNOWN",
          confidence: 0,
          rawScore: 0,
          eventFreeze: {
            active: true,
            reasons: [{
              type: "ENGINE_FAILURE",
              reason: "Event engine unavailable.",
            }],
          },
        },
      }),

      runEngine({
        key: "social",
        state,
        onUpdate,
        fn: async () => {
          const hasInjectedSocialInput =
            socialInput &&
            typeof socialInput === "object" &&
            Object.keys(socialInput).length > 0;

          if (hasInjectedSocialInput) {
            return analyzeSocialSentiment({ symbol, ...socialInput });
          }

          if (useLiveSocial === true) {
            const liveSocialResult = await getLiveSocialSentiment({
              symbol,
              adanosConfig: liveSocialConfig,
            });

            if (liveSocialResult?.engineResult) {
              return {
                ...liveSocialResult.engineResult,
                liveSource: {
                  provider:
                    liveSocialResult?.sourceResult?.provider ??
                    "ADANOS_SOCIAL",
                  status: liveSocialResult?.status ?? null,
                  platformCount:
                    liveSocialResult?.social?.platformCount ?? 0,
                  cached:
                    liveSocialResult?.sourceResult?.cached ?? false,
                  fetchedAt: liveSocialResult?.fetchedAt ?? null,
                },
              };
            }
          }

          return analyzeSocialSentiment({ symbol });
        },
        fallbackResult: {
          approved: false,
          engine: "SOCIAL_SENTIMENT",
          status: "ERROR",
          direction: "UNKNOWN",
          confidence: 0,
          rawScore: 0,
          directionalSupport: {
            long: 0.5,
            short: 0.5,
          },
          scoring: {
            directional: true,
            maximumPoints: 5,
            evidenceAvailable: false,
            neutralFallbackApplied: true,
          },
        },
      }),

      runEngine({
        key: "institutional",
        state,
        onUpdate,
        fn: async () =>
          analyzeInstitutionalPosition({
            symbol,

            evidence:
              institutionalInput,

            asOfTimestamp,
          }),
        fallbackResult: {
          approved: false,
          engine:
            "INSTITUTIONAL_POSITION",
          status:
            "ERROR",
          symbol,
          signal:
            "INSUFFICIENT_DATA",
          direction:
            "NEUTRAL",
          confidence: 0,
          directionalSupport: {
            long: 0.5,
            short: 0.5,
          },
          scoring: {
            directional: true,
            maximumPoints: 7.5,
            evidenceAvailable: false,
            neutralFallbackApplied: true,
          },
          evidence: null,
          freshness: null,
          reasons: [
            "Institutional position engine unavailable.",
          ],
          warnings: [
            "Institutional position evidence is optional and this failure cannot independently authorize a trade.",
          ],
          errors: [],
        },
      }),

      runEngine({
        key: "liquidity",
        state,
        onUpdate,
        fn: async () =>
          analyzeLiquidityExecution({
            symbol,
            price: liquidity?.price,
            bid: liquidity?.bid,
            ask: liquidity?.ask,
            currentVolume: liquidity?.currentVolume,
            averageVolume: liquidity?.averageVolume,
            positionValue: liquidity?.positionValue,
            volatilityPercent: liquidity?.volatilityPercent,
            session: liquidity?.session,
          }),
        fallbackResult: {
          approved: false,
          engine: "LIQUIDITY_EXECUTION",
          status: "ERROR",
          executionDecision: "BLOCK",
          qualityScore: 0,
          directionalSupport: { long: 0, short: 0 },
        },
      }),

      runEngine({
        key: "riskReward",
        state,
        onUpdate,
        fn: async () =>
          analyzeRiskReward({
            entryPrice: riskReward?.entryPrice,
            longStopPrice: riskReward?.longStopPrice,
            shortStopPrice: riskReward?.shortStopPrice,
            longTargetPrice: riskReward?.longTargetPrice,
            shortTargetPrice: riskReward?.shortTargetPrice,
            longTargetR: riskReward?.longTargetR,
            shortTargetR: riskReward?.shortTargetR,
            longWinProbability: riskReward?.longWinProbability,
            shortWinProbability: riskReward?.shortWinProbability,
          }),
        fallbackResult: {
          approved: false,
          engine: "RISK_REWARD",
          status: "ERROR",
        },
      }),
    ]);

    /**
     * ======================================================
     * WAVE 2A — COMPANY ECONOMIC EXPOSURE
     * ======================================================
     *
     * Company Economic Exposure is deliberately separated from
     * the 30-point Company Fundamental Engine. It estimates how
     * sensitive the business is to recession, rates, consumer
     * conditions, currency, and trade. The Fundamental Engine
     * then evaluates those sensitivities against the completed
     * Macro and Country results.
     *
     * This stage never creates trade authority. Missing company
     * classification remains unavailable rather than neutral.
     */

    const economicExposure =
      await runEngine({
        key:
          "economicExposure",

        state,

        onUpdate,

        fn: async () => {
          const sector =
            companyInput?.sector ??
            companyInput?.metadata?.sector ??
            companyInput?.data?.sector ??
            companyInput?.data?.metadata?.sector ??
            null;

          const industry =
            companyInput?.industry ??
            companyInput?.metadata?.industry ??
            companyInput?.data?.industry ??
            companyInput?.data?.metadata?.industry ??
            null;

          const explicitSensitivity =
            companyInput?.sensitivity ??
            companyInput?.economicSensitivity ??
            companyInput?.data?.sensitivity ??
            companyInput?.data?.economicSensitivity ??
            null;

          return analyzeCompanyEconomicExposure({
            symbol,
            sector,
            industry,
            explicitSensitivity,
          });
        },

        fallbackResult: {
          approved: false,
          engine:
            "COMPANY_ECONOMIC_EXPOSURE",
          status:
            "ERROR",
          symbol,
          sensitivity: null,
          confidence: 0,
          coverage: 0,
          reasons: [],
          warnings: [
            "Company economic exposure analysis is unavailable.",
          ],
          errors: [],
        },
      });

    /**
     * ======================================================
     * WAVE 2B — COMPANY FUNDAMENTALS
     * ======================================================
     *
     * Company Fundamentals now runs after Macro, Country, and
     * Company Economic Exposure so the full 30-point model can
     * score Economic Exposure without double-counting it as an
     * independent top-level trading engine.
     */

    const company =
      await runEngine({
        key:
          "company",

        state,

        onUpdate,

        fn: async () =>
          analyzeCompanyFundamentals({
            symbol,
            ...companyInput,

            sensitivity:
              economicExposure?.sensitivity ??
              companyInput?.sensitivity ??
              companyInput?.economicSensitivity ??
              null,

            macro,

            country,
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
          fundamentalScore: 0,
          score: 0,
          maximumScore: 30,
          directionalSupport: {
            long: null,
            short: null,
          },
          warnings: [
            "Company Fundamental Engine unavailable.",
          ],
          errors: [],
        },
      });

    /**
     * ======================================================
     * WAVE 2C — MARKET REGIME
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
     * WAVE 2D — HISTORICAL ANALOGUE
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
     * WAVE 2E — BOT TRADE HISTORY LEARNING
     * ======================================================
     *
     * This subsystem is deliberately separate from the existing
     * HISTORICAL_ANALOGUE engine.
     *
     * HISTORICAL_ANALOGUE:
     * - compares current market conditions with prior market data.
     *
     * BOT TRADE HISTORY LEARNING:
     * - fingerprints the current candidate setup,
     * - compares it against the bot's own completed trades,
     * - summarizes the outcomes of similar past setups.
     *
     * For now, historyOutcome remains advisory. It is exposed in
     * results but is NOT yet allowed to change consensus, scoring,
     * the Decision Gate, or risk approval. This keeps integration
     * measurable and fail-safe.
     */

    const historySide = (() => {
      const technicalDirection =
        String(
          technical?.direction ??
          technical?.bias?.direction ??
          "",
        )
          .trim()
          .toUpperCase();

      if (
        technicalDirection ===
        "SHORT"
      ) {
        return "SHORT";
      }

      if (
        technicalDirection ===
        "LONG"
      ) {
        return "LONG";
      }

      const longSupport =
        Number(
          technical
            ?.directionalSupport
            ?.long ??
          0.5,
        );

      const shortSupport =
        Number(
          technical
            ?.directionalSupport
            ?.short ??
          0.5,
        );

      return (
        shortSupport >
        longSupport
      )
        ? "SHORT"
        : "LONG";
    })();

    /**
     * ------------------------------------------------------
     * CURRENT TRADE SETUP FINGERPRINT
     * ------------------------------------------------------
     */
const tradeFingerprint =
  await runEngine({
    key:
      "tradeFingerprint",

    state,

    onUpdate,

    fn: async () =>
      createTradeSetupFingerprint({
        symbol,

        side:
          historySide,

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

        entryPrice:
          riskReward
            ?.entryPrice ??
          liquidity
            ?.price ??
          null,

        stopPrice:
          historySide ===
          "LONG"
            ? (
                riskReward
                  ?.longStopPrice ??
                null
              )
            : (
                riskReward
                  ?.shortStopPrice ??
                null
              ),

        targetPrice:
          historySide ===
          "LONG"
            ? (
                riskReward
                  ?.longTargetPrice ??
                null
              )
            : (
                riskReward
                  ?.shortTargetPrice ??
                null
              ),

        asOfTimestamp,
      }),

        fallbackResult: {
          approved: false,

          engine:
            "TRADE_SETUP_FINGERPRINT",

          status:
            "ERROR",

          fingerprint:
            null,

          errors: [
            "Trade setup fingerprint unavailable.",
          ],

          warnings: [],
        },
      });

    /**
     * ------------------------------------------------------
     * FIND SIMILAR COMPLETED BOT TRADES
     * ------------------------------------------------------
     *
     * findHistoricalAnalogues performs its own point-in-time
     * protection by comparing each trade's closedAt with the
     * candidate fingerprint's asOfTimestamp.
     */

    const historySimilarity =
      await runEngine({
        key:
          "historySimilarity",

        state,

        onUpdate,

        fn: async () => {
          if (
            tradeFingerprint
              ?.approved !==
              true ||
            !tradeFingerprint
              ?.fingerprint
          ) {
            return {
              approved: false,

              engine:
                "TRADE_HISTORY_SIMILARITY",

              status:
                "INVALID_CANDIDATE",

              matches: [],

              evaluatedTrades: 0,

              qualifyingTrades: 0,

              reasons: [
                "Current trade fingerprint is unavailable.",
              ],

              warnings: [],

              errors: [],
            };
          }

          return findHistoricalAnalogues({
  candidate:
    tradeFingerprint
      .fingerprint,

  historicalTrades:
    Array.isArray(
      botTradeHistory,
    )
      ? botTradeHistory
      : [],
});
        },

        fallbackResult: {
          approved: false,

          engine:
            "TRADE_HISTORY_SIMILARITY",

          status:
            "ERROR",

          matches: [],

          evaluatedTrades: 0,

          qualifyingTrades: 0,

          reasons: [
            "Trade history similarity engine unavailable.",
          ],

          warnings: [],

          errors: [],
        },
      });

    /**
     * ------------------------------------------------------
     * ANALYZE OUTCOMES OF SIMILAR TRADES
     * ------------------------------------------------------
     */

    const historyOutcome =
      await runEngine({
        key:
          "historyOutcome",

        state,

        onUpdate,

        fn: async () =>
          analyzeTradeHistoryOutcomes({
            matches:
              historySimilarity
                ?.matches ??
              [],

            side:
              historySide,

            symbol,
          }),

        fallbackResult: {
          approved: false,

          engine:
            "TRADE_HISTORY_OUTCOME",

          status:
            "ERROR",

          signal:
            "INSUFFICIENT_DATA",

          confidence:
            "INSUFFICIENT",

          stats:
            null,

          directionalSupport: {
            long: null,

            short: null,
          },

          reasons: [
            "Trade history outcome engine unavailable.",
          ],

          warnings: [],

          errors: [],
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

            institutional,

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

        institutional,

        historical,

        /**
         * Bot's own completed-trade historical intelligence.
         *
         * The scoring engine decides whether this is usable
         * and falls back to the market historical analogue
         * when bot-history evidence is insufficient.
         *
         * IMPORTANT:
         * Both sources occupy the SAME historical scoring
         * allocation. They are never added together.
         */
        historyOutcome,

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

              historyOutcome,

              macro,

              country,

              company,

              institutional,

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
     * WAVE 7 — PORTFOLIO RISK APPROVAL
     * ======================================================
     *
     * Portfolio risk is the final portfolio-level safety layer.
     * It cannot create a trade. It can only approve, reduce, or
     * block a position that already passed trade-level risk.
     */

    const portfolioRisk =
      await runEngine({
        key:
          "portfolioRisk",

        state,

        onUpdate,

        fn: async () => {
          if (
            riskApproval
              ?.canExecute !==
            true
          ) {
            return {
              approved: false,

              engine:
                "PORTFOLIO_RISK",

              status:
                "BLOCKED",

              canExecute:
                false,

              position:
                null,

              reasons: [
                "Trade-level risk approval did not authorize this candidate.",
              ],

              warnings: [],

              timestamp:
                now(),
            };
          }

          const proposedTrade = {
            ...(
              riskApproval
                ?.position ??
              {}
            ),

            symbol,

            side:
              riskApproval
                ?.position
                ?.side ??
              decisionGate
                ?.side ??
              null,

            sector:
              companyInput
                ?.sector ??
              company
                ?.sector ??
              riskApproval
                ?.position
                ?.sector ??
              null,
          };

          return evaluatePortfolioRisk({
            account,

            proposedTrade,

            openPositions:
              Array.isArray(
                account
                  ?.openPositions,
              )
                ? account.openPositions
                : [],

            consecutiveLosses:
              Number.isFinite(
                Number(
                  account
                    ?.consecutiveLosses,
                ),
              )
                ? Number(
                    account
                      .consecutiveLosses,
                  )
                : null,
          });
        },

        fallbackResult: {
          approved: false,

          engine:
            "PORTFOLIO_RISK",

          status:
            "ERROR",

          canExecute:
            false,

          position:
            null,

          reasons: [
            "Portfolio risk engine unavailable.",
          ],

          warnings: [],
        },
      });

    /**
     * ------------------------------------------------------
     * PORTFOLIO-ADJUSTED POSITION
     * ------------------------------------------------------
     *
     * Portfolio Risk never creates a new trade. When it
     * approves a reduced size, preserve the complete position
     * produced by tradeRiskAdapter and change only the shares.
     */

    const portfolioAdjustedPosition =
      portfolioRisk
        ?.canExecute === true &&
      riskApproval
        ?.position
        ? {
            ...riskApproval.position,

            shares:
              Number.isFinite(
                Number(
                  portfolioRisk
                    ?.approvedShares,
                ),
              )
                ? Number(
                    portfolioRisk
                      .approvedShares,
                  )
                : riskApproval
                    .position
                    .shares,

            portfolioRisk: {
              status:
                portfolioRisk
                  ?.status ??
                null,

              action:
                portfolioRisk
                  ?.action ??
                null,

              exposureMultiplier:
                portfolioRisk
                  ?.exposureMultiplier ??
                null,

              originalShares:
                portfolioRisk
                  ?.originalShares ??
                riskApproval
                  .position
                  .shares,

              approvedShares:
                portfolioRisk
                  ?.approvedShares ??
                riskApproval
                  .position
                  .shares,
            },
          }
        : null;

    /**
     * ======================================================
     * WAVE 8 — CORRELATION EXPOSURE APPROVAL
     * ======================================================
     *
     * Correlation Exposure is downstream of Portfolio Risk.
     *
     * SAFETY CONTRACT
     * ---------------
     * - It cannot create a trade.
     * - It cannot resurrect a trade blocked upstream.
     * - It cannot increase Portfolio Risk's approved shares.
     * - It may only approve, reduce, or block.
     * - Missing return data is passed through honestly and is
     *   never converted into zero correlation.
     */

    const correlationExposure =
      await runEngine({
        key:
          "correlationExposure",

        state,

        onUpdate,

        fn: async () => {
          if (
            !shouldRunStage(
              PIPELINE_STAGE.CORRELATION_EXPOSURE,
            )
          ) {
            return buildSkippedStageResult({
              engine:
                "CORRELATION_EXPOSURE",

              position:
                portfolioAdjustedPosition,

              reason:
                "Pipeline stopped after the requested upstream stage.",
            });
          }

          if (
            portfolioRisk
              ?.canExecute !==
            true ||
            !portfolioAdjustedPosition
          ) {
            return {
              approved: false,

              engine:
                "CORRELATION_EXPOSURE",

              status:
                "BLOCKED",

              action:
                "BLOCK",

              canExecute:
                false,

              exposureMultiplier: 0,

              originalShares:
                portfolioAdjustedPosition
                  ?.shares ??
                0,

              approvedShares: 0,

              metrics: null,

              reasons: [
                "Portfolio Risk did not authorize this candidate.",
              ],

              warnings: [],

              errors: [],
            };
          }

          const candidateReturns =
            Array.isArray(
              correlationInput
                ?.candidateReturns,
            )
              ? correlationInput
                  .candidateReturns
              : [];

          const positionReturns =
            (
              correlationInput
                ?.positionReturns &&
              typeof correlationInput
                .positionReturns ===
                "object"
            )
              ? correlationInput
                  .positionReturns
              : {};

          const correlationOpenPositions =
            Array.isArray(
              account
                ?.openPositions,
            )
              ? account.openPositions.map(
                  (position) => {
                    const positionSymbol =
                      String(
                        position
                          ?.symbol ??
                        "",
                      )
                        .trim()
                        .toUpperCase();

                    const mappedReturns =
                      Array.isArray(
                        positionReturns[
                          positionSymbol
                        ],
                      )
                        ? positionReturns[
                            positionSymbol
                          ]
                        : (
                            Array.isArray(
                              position
                                ?.returns,
                            )
                              ? position
                                  .returns
                              : []
                          );

                    return {
                      ...position,

                      returns:
                        mappedReturns,
                    };
                  },
                )
              : [];

          const result =
            evaluateCorrelationExposure({
              account,

              proposedTrade: {
                ...portfolioAdjustedPosition,

                symbol,

                side:
                  portfolioAdjustedPosition
                    ?.side ??
                  decisionGate
                    ?.side ??
                  null,

                entryPrice:
                  portfolioAdjustedPosition
                    ?.entryPrice ??
                  riskReward
                    ?.entryPrice ??
                  liquidity
                    ?.price ??
                  null,

                returns:
                  candidateReturns,
              },

              openPositions:
                correlationOpenPositions,
            });

          /**
           * Defense in depth:
           *
           * Even if the correlation engine is changed later,
           * the orchestrator itself refuses any share count
           * larger than Portfolio Risk already authorized.
           */
          const upstreamShares =
            Number(
              portfolioAdjustedPosition
                ?.shares,
            );

          const correlationShares =
            Number(
              result
                ?.approvedShares,
            );

          if (
            result
              ?.canExecute ===
                true &&
            Number.isFinite(
              upstreamShares,
            ) &&
            Number.isFinite(
              correlationShares,
            ) &&
            correlationShares >
              upstreamShares
          ) {
            return {
              ...result,

              approved: false,

              status:
                "BLOCKED",

              action:
                "BLOCK",

              canExecute:
                false,

              approvedShares: 0,

              reasons: [
                ...(
                  result
                    ?.reasons ??
                  []
                ),

                "Correlation Exposure attempted to increase an upstream-approved position.",
              ],
            };
          }

          return result;
        },

        fallbackResult: {
          approved: false,

          engine:
            "CORRELATION_EXPOSURE",

          status:
            "ERROR",

          action:
            "BLOCK",

          canExecute:
            false,

          exposureMultiplier: 0,

          originalShares:
            portfolioAdjustedPosition
              ?.shares ??
            0,

          approvedShares: 0,

          metrics: null,

          reasons: [
            "Correlation exposure engine unavailable.",
          ],

          warnings: [],

          errors: [],
        },
      });

    /**
     * ------------------------------------------------------
     * CORRELATION-ADJUSTED POSITION
     * ------------------------------------------------------
     *
     * Preserve the complete Portfolio Risk adjusted position.
     * Correlation Exposure may only keep or reduce its shares.
     */

    const correlationAdjustedPosition =
      correlationExposure
        ?.canExecute === true &&
      portfolioAdjustedPosition
        ? {
            ...portfolioAdjustedPosition,

            shares:
              Number.isFinite(
                Number(
                  correlationExposure
                    ?.approvedShares,
                ),
              )
                ? Math.min(
                    Number(
                      portfolioAdjustedPosition
                        .shares,
                    ),
                    Number(
                      correlationExposure
                        .approvedShares,
                    ),
                  )
                : portfolioAdjustedPosition
                    .shares,

            correlationExposure: {
              status:
                correlationExposure
                  ?.status ??
                null,

              action:
                correlationExposure
                  ?.action ??
                null,

              exposureMultiplier:
                correlationExposure
                  ?.exposureMultiplier ??
                null,

              originalShares:
                correlationExposure
                  ?.originalShares ??
                portfolioAdjustedPosition
                  .shares,

              approvedShares:
                correlationExposure
                  ?.approvedShares ??
                portfolioAdjustedPosition
                  .shares,

              metrics:
                correlationExposure
                  ?.metrics ??
                null,
            },
          }
        : null;

    /**
     * ======================================================
     * WAVE 9 — VOLATILITY RISK APPROVAL
     * ======================================================
     *
     * Volatility Risk is downstream of Correlation Exposure.
     * It cannot create or resurrect a trade, and it cannot
     * increase the upstream-approved share count.
     */

    const volatilityRisk =
      await runEngine({
        key:
          "volatilityRisk",

        state,

        onUpdate,

        fn: async () => {
          if (
            !shouldRunStage(
              PIPELINE_STAGE.VOLATILITY_RISK,
            )
          ) {
            return buildSkippedStageResult({
              engine:
                "VOLATILITY_RISK",

              position:
                correlationAdjustedPosition,

              reason:
                "Pipeline stopped after the requested upstream stage.",
            });
          }

          if (
            correlationExposure
              ?.canExecute !== true ||
            !correlationAdjustedPosition
          ) {
            return {
              approved: false,
              engine: "VOLATILITY_RISK",
              status: "BLOCKED",
              action: "BLOCK",
              canExecute: false,
              exposureMultiplier: 0,
              originalShares:
                correlationAdjustedPosition
                  ?.shares ?? 0,
              approvedShares: 0,
              metrics: null,
              reasons: [
                "Correlation Exposure did not authorize this candidate.",
              ],
              warnings: [],
              errors: [],
            };
          }

          const volatilityEvidence =
            volatility &&
            typeof volatility === "object"
              ? { ...volatility }
              : {};

          const technicalAtr =
            Number(
              technical
                ?.indicators
                ?.atr
                ?.value,
            );

          if (
            volatilityEvidence.atr == null &&
            Number.isFinite(technicalAtr) &&
            technicalAtr >= 0
          ) {
            volatilityEvidence.atr =
              technicalAtr;
          }

          const result =
            evaluateVolatilityRisk({
              proposedTrade: {
                ...correlationAdjustedPosition,
                symbol,
                side:
                  correlationAdjustedPosition
                    ?.side ??
                  decisionGate?.side ??
                  null,
                entryPrice:
                  correlationAdjustedPosition
                    ?.entryPrice ??
                  riskReward?.entryPrice ??
                  liquidity?.price ??
                  null,
              },
              volatility:
                volatilityEvidence,
            });

          const upstreamShares =
            Number(
              correlationAdjustedPosition
                ?.shares,
            );

          const volatilityShares =
            Number(
              result?.approvedShares,
            );

          if (
            result?.canExecute === true &&
            Number.isFinite(upstreamShares) &&
            Number.isFinite(volatilityShares) &&
            volatilityShares > upstreamShares
          ) {
            return {
              ...result,
              approved: false,
              status: "BLOCKED",
              action: "BLOCK",
              canExecute: false,
              approvedShares: 0,
              reasons: [
                ...(result?.reasons ?? []),
                "Volatility Risk attempted to increase an upstream-approved position.",
              ],
            };
          }

          return result;
        },

        fallbackResult: {
          approved: false,
          engine: "VOLATILITY_RISK",
          status: "ERROR",
          action: "BLOCK",
          canExecute: false,
          exposureMultiplier: 0,
          originalShares:
            correlationAdjustedPosition
              ?.shares ?? 0,
          approvedShares: 0,
          metrics: null,
          reasons: [
            "Volatility risk engine unavailable.",
          ],
          warnings: [],
          errors: [],
        },
      });

    /**
     * ------------------------------------------------------
     * VOLATILITY-ADJUSTED POSITION
     * ------------------------------------------------------
     */

    const volatilityAdjustedPosition =
      volatilityRisk?.canExecute === true &&
      correlationAdjustedPosition
        ? {
            ...correlationAdjustedPosition,
            shares:
              Number.isFinite(
                Number(
                  volatilityRisk
                    ?.approvedShares,
                ),
              )
                ? Math.min(
                    Number(
                      correlationAdjustedPosition
                        .shares,
                    ),
                    Number(
                      volatilityRisk
                        .approvedShares,
                    ),
                  )
                : correlationAdjustedPosition
                    .shares,
            volatilityRisk: {
              status:
                volatilityRisk?.status ?? null,
              action:
                volatilityRisk?.action ?? null,
              exposureMultiplier:
                volatilityRisk
                  ?.exposureMultiplier ?? null,
              originalShares:
                volatilityRisk
                  ?.originalShares ??
                correlationAdjustedPosition
                  .shares,
              approvedShares:
                volatilityRisk
                  ?.approvedShares ??
                correlationAdjustedPosition
                  .shares,
              metrics:
                volatilityRisk?.metrics ?? null,
            },
          }
        : null;

    /**
     * ======================================================
     * WAVE 10 — DRAWDOWN RECOVERY APPROVAL
     * ======================================================
     *
     * Drawdown Recovery is downstream of Volatility Risk.
     * It cannot create or resurrect a trade, and it cannot
     * increase the upstream-approved share count.
     */

    const drawdownRecovery =
      await runEngine({
        key:
          "drawdownRecovery",

        state,

        onUpdate,

        fn: async () => {
          if (
            !shouldRunStage(
              PIPELINE_STAGE.DRAWDOWN_RECOVERY,
            )
          ) {
            return buildSkippedStageResult({
              engine:
                "DRAWDOWN_RECOVERY",

              position:
                volatilityAdjustedPosition,

              reason:
                "Pipeline stopped after the requested upstream stage.",
            });
          }

          if (
            volatilityRisk
              ?.canExecute !== true ||
            !volatilityAdjustedPosition
          ) {
            return {
              approved: false,
              engine: "DRAWDOWN_RECOVERY",
              status: "BLOCKED",
              action: "BLOCK",
              mode: "BLOCKED",
              canExecute: false,
              exposureMultiplier: 0,
              originalShares:
                volatilityAdjustedPosition
                  ?.shares ?? 0,
              approvedShares: 0,
              metrics: null,
              reasons: [
                "Volatility Risk did not authorize this candidate.",
              ],
              warnings: [],
              errors: [],
            };
          }

          const result =
            evaluateDrawdownRecovery({
              proposedTrade: {
                ...volatilityAdjustedPosition,
                symbol,
                side:
                  volatilityAdjustedPosition
                    ?.side ??
                  decisionGate?.side ??
                  null,
                entryPrice:
                  volatilityAdjustedPosition
                    ?.entryPrice ??
                  riskReward?.entryPrice ??
                  liquidity?.price ??
                  null,
              },

              account,

              recentTrades:
                Array.isArray(
                  account?.recentTrades,
                )
                  ? account.recentTrades
                  : [],
            });

          const upstreamShares =
            Number(
              volatilityAdjustedPosition
                ?.shares,
            );

          const recoveryShares =
            Number(
              result?.approvedShares,
            );

          if (
            result?.canExecute === true &&
            Number.isFinite(upstreamShares) &&
            Number.isFinite(recoveryShares) &&
            recoveryShares > upstreamShares
          ) {
            return {
              ...result,
              approved: false,
              status: "BLOCKED",
              action: "BLOCK",
              canExecute: false,
              approvedShares: 0,
              reasons: [
                ...(result?.reasons ?? []),
                "Drawdown Recovery attempted to increase an upstream-approved position.",
              ],
            };
          }

          return result;
        },

        fallbackResult: {
          approved: false,
          engine: "DRAWDOWN_RECOVERY",
          status: "ERROR",
          action: "BLOCK",
          mode: "BLOCKED",
          canExecute: false,
          exposureMultiplier: 0,
          originalShares:
            volatilityAdjustedPosition
              ?.shares ?? 0,
          approvedShares: 0,
          metrics: null,
          reasons: [
            "Drawdown recovery engine unavailable.",
          ],
          warnings: [],
          errors: [],
        },
      });

    /**
     * ------------------------------------------------------
     * DRAWDOWN-ADJUSTED POSITION
     * ------------------------------------------------------
     *
     * Preserve the complete Volatility Risk adjusted position.
     * Drawdown Recovery may only keep or reduce its shares.
     */

    const drawdownAdjustedPosition =
      drawdownRecovery?.canExecute === true &&
      volatilityAdjustedPosition
        ? {
            ...volatilityAdjustedPosition,
            shares:
              Number.isFinite(
                Number(
                  drawdownRecovery
                    ?.approvedShares,
                ),
              )
                ? Math.min(
                    Number(
                      volatilityAdjustedPosition
                        .shares,
                    ),
                    Number(
                      drawdownRecovery
                        .approvedShares,
                    ),
                  )
                : volatilityAdjustedPosition
                    .shares,
            drawdownRecovery: {
              status:
                drawdownRecovery?.status ?? null,
              action:
                drawdownRecovery?.action ?? null,
              mode:
                drawdownRecovery?.mode ?? null,
              exposureMultiplier:
                drawdownRecovery
                  ?.exposureMultiplier ?? null,
              originalShares:
                drawdownRecovery
                  ?.originalShares ??
                volatilityAdjustedPosition
                  .shares,
              approvedShares:
                drawdownRecovery
                  ?.approvedShares ??
                volatilityAdjustedPosition
                  .shares,
              metrics:
                drawdownRecovery?.metrics ?? null,
            },
          }
        : null;

    /**
     * ======================================================
     * WAVE 11 — LIQUIDITY STRESS APPROVAL
     * ======================================================
     *
     * Liquidity Stress is downstream of Drawdown Recovery.
     * It cannot create or resurrect a trade, and it cannot
     * increase the upstream-approved share count.
     */

    const liquidityStress =
      await runEngine({
        key: "liquidityStress",
        state,
        onUpdate,

        fn: async () => {
          if (
            !shouldRunStage(
              PIPELINE_STAGE.LIQUIDITY_STRESS,
            )
          ) {
            return buildSkippedStageResult({
              engine:
                "LIQUIDITY_STRESS",

              position:
                drawdownAdjustedPosition,

              reason:
                "Pipeline stopped after the requested upstream stage.",
            });
          }

          if (
            drawdownRecovery?.canExecute !== true ||
            !drawdownAdjustedPosition
          ) {
            return {
              approved: false,
              engine: "LIQUIDITY_STRESS",
              status: "BLOCKED",
              action: "BLOCK",
              canExecute: false,
              exposureMultiplier: 0,
              originalShares:
                drawdownAdjustedPosition?.shares ?? 0,
              approvedShares: 0,
              metrics: null,
              reasons: [
                "Drawdown Recovery did not authorize this candidate.",
              ],
              warnings: [],
              errors: [],
            };
          }

          const result =
            evaluateLiquidityStress({
              proposedTrade: {
                ...drawdownAdjustedPosition,
                symbol,
                side:
                  drawdownAdjustedPosition?.side ??
                  decisionGate?.side ??
                  null,
                entryPrice:
                  drawdownAdjustedPosition?.entryPrice ??
                  riskReward?.entryPrice ??
                  liquidity?.price ??
                  null,
              },
              liquidity:
                liquidity && typeof liquidity === "object"
                  ? { ...liquidity }
                  : {},
            });

          const upstreamShares =
            Number(drawdownAdjustedPosition?.shares);

          const liquidityShares =
            Number(result?.approvedShares);

          if (
            result?.canExecute === true &&
            Number.isFinite(upstreamShares) &&
            Number.isFinite(liquidityShares) &&
            liquidityShares > upstreamShares
          ) {
            return {
              ...result,
              approved: false,
              status: "BLOCKED",
              action: "BLOCK",
              canExecute: false,
              approvedShares: 0,
              reasons: [
                ...(result?.reasons ?? []),
                "Liquidity Stress attempted to increase an upstream-approved position.",
              ],
            };
          }

          return result;
        },

        fallbackResult: {
          approved: false,
          engine: "LIQUIDITY_STRESS",
          status: "ERROR",
          action: "BLOCK",
          canExecute: false,
          exposureMultiplier: 0,
          originalShares:
            drawdownAdjustedPosition?.shares ?? 0,
          approvedShares: 0,
          metrics: null,
          reasons: [
            "Liquidity stress engine unavailable.",
          ],
          warnings: [],
          errors: [],
        },
      });

    /**
     * ------------------------------------------------------
     * LIQUIDITY-STRESS-ADJUSTED POSITION
     * ------------------------------------------------------
     */

    const liquidityStressAdjustedPosition =
      liquidityStress?.canExecute === true &&
      drawdownAdjustedPosition
        ? {
            ...drawdownAdjustedPosition,
            shares:
              Number.isFinite(
                Number(liquidityStress?.approvedShares),
              )
                ? Math.min(
                    Number(drawdownAdjustedPosition.shares),
                    Number(liquidityStress.approvedShares),
                  )
                : drawdownAdjustedPosition.shares,
            liquidityStress: {
              status: liquidityStress?.status ?? null,
              action: liquidityStress?.action ?? null,
              exposureMultiplier:
                liquidityStress?.exposureMultiplier ?? null,
              originalShares:
                liquidityStress?.originalShares ??
                drawdownAdjustedPosition.shares,
              approvedShares:
                liquidityStress?.approvedShares ??
                drawdownAdjustedPosition.shares,
              metrics: liquidityStress?.metrics ?? null,
            },
          }
        : null;

    /**
     * ======================================================
     * WAVE 12 — EXECUTION TIMING APPROVAL
     * ======================================================
     *
     * Execution Timing is downstream of Liquidity Stress.
     * It cannot create or resurrect a trade, and it cannot
     * increase the upstream-approved share count.
     */

    const executionTimingResult =
      await runEngine({
        key: "executionTiming",
        state,
        onUpdate,

        fn: async () => {
          if (
            !shouldRunStage(
              PIPELINE_STAGE.EXECUTION_TIMING,
            )
          ) {
            return buildSkippedStageResult({
              engine:
                "EXECUTION_TIMING",

              position:
                liquidityStressAdjustedPosition,

              reason:
                "Pipeline stopped after the requested upstream stage.",
            });
          }

          if (
            liquidityStress?.canExecute !== true ||
            !liquidityStressAdjustedPosition
          ) {
            return {
              approved: false,
              engine: "EXECUTION_TIMING",
              status: "BLOCKED",
              action: "BLOCK",
              canExecute: false,
              exposureMultiplier: 0,
              originalShares:
                liquidityStressAdjustedPosition?.shares ?? 0,
              approvedShares: 0,
              metrics: null,
              reasons: [
                "Liquidity Stress did not authorize this candidate.",
              ],
              warnings: [],
              errors: [],
            };
          }

          const result =
            evaluateExecutionTiming({
              proposedTrade: {
                ...liquidityStressAdjustedPosition,
                symbol,
                side:
                  liquidityStressAdjustedPosition?.side ??
                  decisionGate?.side ??
                  null,
                entryPrice:
                  liquidityStressAdjustedPosition?.entryPrice ??
                  riskReward?.entryPrice ??
                  liquidity?.price ??
                  null,
              },
              timestamp:
                executionTiming?.timestamp ??
                asOfTimestamp,
              scheduledEventAt:
                executionTiming?.scheduledEventAt ?? null,
              minutesUntilScheduledEvent:
                executionTiming?.minutesUntilScheduledEvent ?? null,
              config:
                executionTiming?.config ?? {},
            });

          const upstreamShares =
            Number(liquidityStressAdjustedPosition?.shares);

          const timingShares =
            Number(result?.approvedShares);

          if (
            result?.canExecute === true &&
            Number.isFinite(upstreamShares) &&
            Number.isFinite(timingShares) &&
            timingShares > upstreamShares
          ) {
            return {
              ...result,
              approved: false,
              status: "BLOCKED",
              action: "BLOCK",
              canExecute: false,
              approvedShares: 0,
              reasons: [
                ...(result?.reasons ?? []),
                "Execution Timing attempted to increase an upstream-approved position.",
              ],
            };
          }

          return result;
        },

        fallbackResult: {
          approved: false,
          engine: "EXECUTION_TIMING",
          status: "ERROR",
          action: "BLOCK",
          canExecute: false,
          exposureMultiplier: 0,
          originalShares:
            liquidityStressAdjustedPosition?.shares ?? 0,
          approvedShares: 0,
          metrics: null,
          reasons: [
            "Execution timing engine unavailable.",
          ],
          warnings: [],
          errors: [],
        },
      });

    /**
     * ------------------------------------------------------
     * EXECUTION-TIMING-ADJUSTED POSITION
     * ------------------------------------------------------
     */

    const executionTimingAdjustedPosition =
      executionTimingResult?.canExecute === true &&
      liquidityStressAdjustedPosition
        ? {
            ...liquidityStressAdjustedPosition,
            shares:
              Number.isFinite(
                Number(executionTimingResult?.approvedShares),
              )
                ? Math.min(
                    Number(liquidityStressAdjustedPosition.shares),
                    Number(executionTimingResult.approvedShares),
                  )
                : liquidityStressAdjustedPosition.shares,
            executionTiming: {
              status: executionTimingResult?.status ?? null,
              action: executionTimingResult?.action ?? null,
              exposureMultiplier:
                executionTimingResult?.exposureMultiplier ?? null,
              originalShares:
                executionTimingResult?.originalShares ??
                liquidityStressAdjustedPosition.shares,
              approvedShares:
                executionTimingResult?.approvedShares ??
                liquidityStressAdjustedPosition.shares,
              metrics: executionTimingResult?.metrics ?? null,
            },
          }
        : null;

    /**
     * ======================================================
     * WAVE 13 — MARKET SHOCK / HALT APPROVAL
     * ======================================================
     *
     * Market Shock / Halt is downstream of Execution Timing.
     * It cannot create or resurrect a trade, and it cannot
     * increase the upstream-approved share count.
     */

    const marketShockHaltResult =
      await runEngine({
        key: "marketShockHalt",
        state,
        onUpdate,

        fn: async () => {
          if (
            !shouldRunStage(
              PIPELINE_STAGE.MARKET_SHOCK_HALT,
            )
          ) {
            return buildSkippedStageResult({
              engine:
                "MARKET_SHOCK_HALT",

              position:
                executionTimingAdjustedPosition,

              reason:
                "Pipeline stopped after the requested upstream stage.",
            });
          }

          if (
            executionTimingResult?.canExecute !== true ||
            !executionTimingAdjustedPosition
          ) {
            return {
              approved: false,
              engine: "MARKET_SHOCK_HALT",
              status: "BLOCKED",
              action: "BLOCK",
              canExecute: false,
              exposureMultiplier: 0,
              originalShares:
                executionTimingAdjustedPosition?.shares ?? 0,
              approvedShares: 0,
              metrics: null,
              reasons: [
                "Execution Timing did not authorize this candidate.",
              ],
              warnings: [],
              errors: [],
            };
          }

          const result =
            evaluateMarketShockHalt({
              proposedTrade: {
                ...executionTimingAdjustedPosition,
                symbol,
                side:
                  executionTimingAdjustedPosition?.side ??
                  decisionGate?.side ??
                  null,
                entryPrice:
                  executionTimingAdjustedPosition?.entryPrice ??
                  riskReward?.entryPrice ??
                  liquidity?.price ??
                  null,
              },

              marketState:
                marketShock &&
                typeof marketShock === "object"
                  ? { ...marketShock }
                  : {},
            });

          const upstreamShares =
            Number(
              executionTimingAdjustedPosition?.shares,
            );

          const shockShares =
            Number(
              result?.approvedShares,
            );

          if (
            result?.canExecute === true &&
            Number.isFinite(upstreamShares) &&
            Number.isFinite(shockShares) &&
            shockShares > upstreamShares
          ) {
            return {
              ...result,
              approved: false,
              status: "BLOCKED",
              action: "BLOCK",
              canExecute: false,
              approvedShares: 0,
              reasons: [
                ...(result?.reasons ?? []),
                "Market Shock / Halt attempted to increase an upstream-approved position.",
              ],
            };
          }

          return result;
        },

        fallbackResult: {
          approved: false,
          engine: "MARKET_SHOCK_HALT",
          status: "ERROR",
          action: "BLOCK",
          canExecute: false,
          exposureMultiplier: 0,
          originalShares:
            executionTimingAdjustedPosition?.shares ?? 0,
          approvedShares: 0,
          metrics: null,
          reasons: [
            "Market shock / halt engine unavailable.",
          ],
          warnings: [],
          errors: [],
        },
      });

    /**
     * ------------------------------------------------------
     * MARKET-SHOCK-ADJUSTED POSITION
     * ------------------------------------------------------
     */

    const marketShockAdjustedPosition =
      marketShockHaltResult?.canExecute === true &&
      executionTimingAdjustedPosition
        ? {
            ...executionTimingAdjustedPosition,

            shares:
              Number.isFinite(
                Number(
                  marketShockHaltResult?.approvedShares,
                ),
              )
                ? Math.min(
                    Number(
                      executionTimingAdjustedPosition.shares,
                    ),
                    Number(
                      marketShockHaltResult.approvedShares,
                    ),
                  )
                : executionTimingAdjustedPosition.shares,

            marketShockHalt: {
              status:
                marketShockHaltResult?.status ?? null,

              action:
                marketShockHaltResult?.action ?? null,

              exposureMultiplier:
                marketShockHaltResult
                  ?.exposureMultiplier ?? null,

              originalShares:
                marketShockHaltResult?.originalShares ??
                executionTimingAdjustedPosition.shares,

              approvedShares:
                marketShockHaltResult?.approvedShares ??
                executionTimingAdjustedPosition.shares,

              metrics:
                marketShockHaltResult?.metrics ?? null,
            },
          }
        : null;


    /**
     * ======================================================
     * WAVE 14 — ORDER EXECUTION QUALITY APPROVAL
     * ======================================================
     *
     * Order Execution Quality is downstream of Market Shock / Halt.
     * It cannot create or resurrect a trade, and it cannot increase
     * the upstream-approved share count.
     */

    const orderExecutionQualityResult =
      await runEngine({
        key:
          "orderExecutionQuality",

        state,

        onUpdate,

        fn: async () => {
          if (
            !shouldRunStage(
              PIPELINE_STAGE.ORDER_EXECUTION_QUALITY,
            )
          ) {
            return buildSkippedStageResult({
              engine:
                "ORDER_EXECUTION_QUALITY",

              position:
                marketShockAdjustedPosition,

              reason:
                "Pipeline stopped after the requested upstream stage.",
            });
          }

          if (
            marketShockHaltResult
              ?.canExecute !== true ||
            !marketShockAdjustedPosition
          ) {
            return {
              approved: false,

              engine:
                "ORDER_EXECUTION_QUALITY",

              status:
                "BLOCKED",

              action:
                "BLOCK",

              canExecute:
                false,

              exposureMultiplier: 0,

              originalShares:
                marketShockAdjustedPosition
                  ?.shares ?? 0,

              approvedShares: 0,

              metrics: null,

              reasons: [
                "Market Shock / Halt did not authorize this candidate.",
              ],

              warnings: [],

              errors: [],
            };
          }

          const result =
            evaluateOrderExecutionQuality({
              proposedTrade: {
                ...marketShockAdjustedPosition,

                symbol,

                side:
                  marketShockAdjustedPosition
                    ?.side ??
                  decisionGate
                    ?.side ??
                  null,

                entryPrice:
                  marketShockAdjustedPosition
                    ?.entryPrice ??
                  riskReward
                    ?.entryPrice ??
                  liquidity
                    ?.price ??
                  null,
              },

              execution:
                orderExecution &&
                typeof orderExecution ===
                  "object"
                  ? {
                      ...orderExecution,
                    }
                  : {},

              now:
                asOfTimestamp,
            });

          const upstreamShares =
            Number(
              marketShockAdjustedPosition
                ?.shares,
            );

          const executionShares =
            Number(
              result
                ?.approvedShares,
            );

          if (
            result
              ?.canExecute === true &&
            Number.isFinite(
              upstreamShares,
            ) &&
            Number.isFinite(
              executionShares,
            ) &&
            executionShares >
              upstreamShares
          ) {
            return {
              ...result,

              approved: false,

              status:
                "BLOCKED",

              action:
                "BLOCK",

              canExecute:
                false,

              approvedShares: 0,

              reasons: [
                ...(
                  result
                    ?.reasons ??
                  []
                ),

                "Order Execution Quality attempted to increase an upstream-approved position.",
              ],
            };
          }

          return result;
        },

        fallbackResult: {
          approved: false,

          engine:
            "ORDER_EXECUTION_QUALITY",

          status:
            "ERROR",

          action:
            "BLOCK",

          canExecute:
            false,

          exposureMultiplier: 0,

          originalShares:
            marketShockAdjustedPosition
              ?.shares ?? 0,

          approvedShares: 0,

          metrics: null,

          reasons: [
            "Order execution quality engine unavailable.",
          ],

          warnings: [],

          errors: [],
        },
      });

    /**
     * ------------------------------------------------------
     * ORDER-EXECUTION-QUALITY-ADJUSTED POSITION
     * ------------------------------------------------------
     */

    const orderExecutionQualityAdjustedPosition =
      orderExecutionQualityResult
        ?.canExecute === true &&
      marketShockAdjustedPosition
        ? {
            ...marketShockAdjustedPosition,

            shares:
              Number.isFinite(
                Number(
                  orderExecutionQualityResult
                    ?.approvedShares,
                ),
              )
                ? Math.min(
                    Number(
                      marketShockAdjustedPosition
                        .shares,
                    ),

                    Number(
                      orderExecutionQualityResult
                        .approvedShares,
                    ),
                  )
                : marketShockAdjustedPosition
                    .shares,

            orderExecutionQuality: {
              status:
                orderExecutionQualityResult
                  ?.status ??
                null,

              action:
                orderExecutionQualityResult
                  ?.action ??
                null,

              exposureMultiplier:
                orderExecutionQualityResult
                  ?.exposureMultiplier ??
                null,

              originalShares:
                orderExecutionQualityResult
                  ?.originalShares ??
                marketShockAdjustedPosition
                  .shares,

              approvedShares:
                orderExecutionQualityResult
                  ?.approvedShares ??
                marketShockAdjustedPosition
                  .shares,

              metrics:
                orderExecutionQualityResult
                  ?.metrics ??
                null,
            },
          }
        : null;

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
/**
 * Resolve the effective downstream boundary for both production runs
 * and deterministic stopAfter integration/research runs.
 *
 * stopAfter means "evaluate through this stage", not "invalidate the
 * trade because later stages were intentionally skipped".
 */
const boundaryResultByStage = {
  [PIPELINE_STAGE.PORTFOLIO_RISK]: portfolioRisk,
  [PIPELINE_STAGE.CORRELATION_EXPOSURE]: correlationExposure,
  [PIPELINE_STAGE.VOLATILITY_RISK]: volatilityRisk,
  [PIPELINE_STAGE.DRAWDOWN_RECOVERY]: drawdownRecovery,
  [PIPELINE_STAGE.LIQUIDITY_STRESS]: liquidityStress,
  [PIPELINE_STAGE.EXECUTION_TIMING]: executionTimingResult,
  [PIPELINE_STAGE.MARKET_SHOCK_HALT]: marketShockHaltResult,
  [PIPELINE_STAGE.ORDER_EXECUTION_QUALITY]: orderExecutionQualityResult,
};

const boundaryPositionByStage = {
  [PIPELINE_STAGE.PORTFOLIO_RISK]: portfolioAdjustedPosition,
  [PIPELINE_STAGE.CORRELATION_EXPOSURE]: correlationAdjustedPosition,
  [PIPELINE_STAGE.VOLATILITY_RISK]: volatilityAdjustedPosition,
  [PIPELINE_STAGE.DRAWDOWN_RECOVERY]: drawdownAdjustedPosition,
  [PIPELINE_STAGE.LIQUIDITY_STRESS]: liquidityStressAdjustedPosition,
  [PIPELINE_STAGE.EXECUTION_TIMING]: executionTimingAdjustedPosition,
  [PIPELINE_STAGE.MARKET_SHOCK_HALT]: marketShockAdjustedPosition,
  [PIPELINE_STAGE.ORDER_EXECUTION_QUALITY]: orderExecutionQualityAdjustedPosition,
};

const effectiveBoundaryStage =
  normalizedStopAfter ?? PIPELINE_STAGE.ORDER_EXECUTION_QUALITY;

const effectiveBoundaryResult =
  boundaryResultByStage[effectiveBoundaryStage] ?? null;

const effectiveBoundaryPosition =
  boundaryPositionByStage[effectiveBoundaryStage] ?? null;

const effectiveBoundaryShares =
  Number(
    effectiveBoundaryPosition
      ?.shares,
  );

const executionApprovalChain =
  validateExecutionApprovalChain({
    decisionGate,

    riskApproval,

    boundaryStage:
      effectiveBoundaryStage,

    finalPosition:
      effectiveBoundaryPosition,

    stageResults: {
      [PIPELINE_STAGE.PORTFOLIO_RISK]:
        portfolioRisk,

      [PIPELINE_STAGE.CORRELATION_EXPOSURE]:
        correlationExposure,

      [PIPELINE_STAGE.VOLATILITY_RISK]:
        volatilityRisk,

      [PIPELINE_STAGE.DRAWDOWN_RECOVERY]:
        drawdownRecovery,

      [PIPELINE_STAGE.LIQUIDITY_STRESS]:
        liquidityStress,

      [PIPELINE_STAGE.EXECUTION_TIMING]:
        executionTimingResult,

      [PIPELINE_STAGE.MARKET_SHOCK_HALT]:
        marketShockHaltResult,

      [PIPELINE_STAGE.ORDER_EXECUTION_QUALITY]:
        orderExecutionQualityResult,
    },
  });

const canProceedToPaperExecution =
  executionApprovalChain
    .approved ===
  true;

const includedStageResults = [
  { stage: PIPELINE_STAGE.PORTFOLIO_RISK, result: portfolioRisk },
  { stage: PIPELINE_STAGE.CORRELATION_EXPOSURE, result: correlationExposure },
  { stage: PIPELINE_STAGE.VOLATILITY_RISK, result: volatilityRisk },
  { stage: PIPELINE_STAGE.DRAWDOWN_RECOVERY, result: drawdownRecovery },
  { stage: PIPELINE_STAGE.LIQUIDITY_STRESS, result: liquidityStress },
  { stage: PIPELINE_STAGE.EXECUTION_TIMING, result: executionTimingResult },
  { stage: PIPELINE_STAGE.MARKET_SHOCK_HALT, result: marketShockHaltResult },
  { stage: PIPELINE_STAGE.ORDER_EXECUTION_QUALITY, result: orderExecutionQualityResult },
].filter(({ stage }) => shouldRunStage(stage));

const downstreamReasons =
  includedStageResults.flatMap(({ result }) =>
    Array.isArray(result?.reasons) ? result.reasons : []
  );

const downstreamWarnings =
  includedStageResults.flatMap(({ result }) =>
    Array.isArray(result?.warnings) ? result.warnings : []
  );

state.finalDecision = {
  symbol,

  status:
    effectiveBoundaryResult?.status ??
    riskApproval?.status ??
    decisionGate?.status ??
    "NO_TRADE",

  decision:
    canProceedToPaperExecution
      ? "APPROVED_FOR_PAPER_EXECUTION"
      : "NO_TRADE",

  preferredSide: decisionGate?.side ?? null,
  preferredScore: decisionGate?.score ?? 0,
  longScore: scoring?.long?.score ?? 0,
  shortScore: scoring?.short?.score ?? 0,

  tradeEligible:
    decisionGate?.canProceedToRiskManager === true,

  canProceedToRiskManager:
    decisionGate?.canProceedToRiskManager === true,

  riskApproved:
    riskApproval?.canExecute === true,

  canProceedToPaperExecution,

  executionApprovalChain,

  eventFreeze:
    eventResult?.eventFreeze?.active === true,

  marketRegime:
    marketRegime?.regime ?? null,

  recessionRisk:
    macro?.recessionRisk ?? null,

  consensus:
    consensus?.direction ?? null,

  tradeGeometry:
    decisionGate?.tradeGeometry ?? null,

  execution:
    decisionGate?.execution ?? null,

  position:
    canProceedToPaperExecution
      ? effectiveBoundaryPosition
      : null,

  riskStatus:
    riskApproval?.status ?? null,

  portfolioRiskStatus:
    portfolioRisk?.status ?? null,

  correlationExposureStatus:
    shouldRunStage(PIPELINE_STAGE.CORRELATION_EXPOSURE)
      ? correlationExposure?.status ?? null
      : null,

  volatilityRiskStatus:
    shouldRunStage(PIPELINE_STAGE.VOLATILITY_RISK)
      ? volatilityRisk?.status ?? null
      : null,

  drawdownRecoveryStatus:
    shouldRunStage(PIPELINE_STAGE.DRAWDOWN_RECOVERY)
      ? drawdownRecovery?.status ?? null
      : null,

  liquidityStressStatus:
    shouldRunStage(PIPELINE_STAGE.LIQUIDITY_STRESS)
      ? liquidityStress?.status ?? null
      : null,

  executionTimingStatus:
    shouldRunStage(PIPELINE_STAGE.EXECUTION_TIMING)
      ? executionTimingResult?.status ?? null
      : null,

  marketShockHaltStatus:
    shouldRunStage(PIPELINE_STAGE.MARKET_SHOCK_HALT)
      ? marketShockHaltResult?.status ?? null
      : null,

  orderExecutionQualityStatus:
    shouldRunStage(PIPELINE_STAGE.ORDER_EXECUTION_QUALITY)
      ? orderExecutionQualityResult?.status ?? null
      : null,

  reasons: [
    ...(decisionGate?.reasons ?? []),
    ...(riskApproval?.reasons ?? []),
    ...downstreamReasons,
    ...(
      executionApprovalChain
        .approved ===
        true
        ? []
        : executionApprovalChain
            .failures
    ),
  ],

  warnings: [
    ...(decisionGate?.warnings ?? []),
    ...(riskApproval?.warnings ?? []),
    ...downstreamWarnings,
    ...(isPartialRun
      ? [
          `Partial pipeline run completed through ${effectiveBoundaryStage}. Downstream stages were intentionally skipped.`,
        ]
      : []),
  ],

  timestamp: now(),
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
  economicExposure,

  events:
    eventResult,

  social,

  /**
   * Institutional-position intelligence.
   *
   * This is evidence only. It cannot independently create
   * execution authority.
   */
  institutional,

  /**
   * Existing market-history intelligence.
   */
  historical,

  /**
   * Bot's own completed-trade learning pipeline.
   */
  tradeFingerprint,
  historySimilarity,
  historyOutcome,

liquidity:
  liquidityResult,
  riskReward:
    riskRewardResult,

  consensus,
  scoring,
  decisionGate,
  riskApproval,
  portfolioRisk,
  correlationExposure,
  volatilityRisk,
  drawdownRecovery,
  liquidityStress,

  executionTiming:
    state.engines
      .executionTiming
      ?.result ??
    executionTimingResult,

  marketShockHalt:
    state.engines
      .marketShockHalt
      ?.result ??
    marketShockHaltResult,

  orderExecutionQuality:
    state.engines
      .orderExecutionQuality
      ?.result ??
    orderExecutionQualityResult,
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
