/**
 * AEMA Private Futures Research Bot
 * Futures Setup Builder V2
 *
 * Orchestrates:
 *
 * Direction-qualified research candidate
 *        ↓
 * Market Structure
 *        ↓
 * Market Regime
 *        ↓
 * Strategy Selection
 *        ↓
 * Setup Quality
 *        ↓
 * SETUP_READY / NO_SETUP
 *
 * Compatibility:
 * - preserves the legacy setup output contract;
 * - preserves LONG / SHORT internally where existing
 *   downstream components expect it;
 * - exposes BULL / BEAR research direction separately;
 * - does not size positions;
 * - does not choose leverage;
 * - does not execute orders.
 */
import {
  normalizeClosedCandles,
} from "./botSetupCandleUtils.js";

import BOT_CONFIG from "../config/botConfig.js";

import analyzeBotMarketStructure
  from "./botMarketStructureEngine.js";

import classifyBotMarketRegime
  from "./botMarketRegimeEngine.js";

import selectBotSetupStrategy
  from "./botSetupStrategyEngine.js";

import evaluateBotSetupQuality
  from "./botSetupQualityEngine.js";

import { buildVolatilityResearchDiagnostic } from "../risk/botVolatilityResearchDiagnostic.js";

/*
 * ---------------------------------------------------------
 * BASIC HELPERS
 * ---------------------------------------------------------
 */

function finiteOrNull(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const n = Number(value);

  return Number.isFinite(n)
    ? n
    : null;
}

function positiveOrNull(value) {
  const n =
    finiteOrNull(value);

  return (
    n !== null &&
    n > 0
  )
    ? n
    : null;
}

function percentDistance(
  from,
  to
) {
  const a =
    positiveOrNull(from);

  const b =
    finiteOrNull(to);

  if (
    a === null ||
    b === null
  ) {
    return null;
  }

  return (
    Math.abs(
      b - a
    ) /
    a
  ) * 100;
}

function unique(values = []) {
  return [
    ...new Set(
      values.filter(Boolean)
    ),
  ];
}

/*
 * ---------------------------------------------------------
 * DIRECTION HELPERS
 * ---------------------------------------------------------
 */

function normalizeInternalDirection(
  value
) {
  const direction =
    String(
      value || ""
    ).toUpperCase();

  if (
    direction === "LONG" ||
    direction === "BULL"
  ) {
    return "LONG";
  }

  if (
    direction === "SHORT" ||
    direction === "BEAR"
  ) {
    return "SHORT";
  }

  return null;
}

function normalizeResearchDirection(
  value
) {
  const direction =
    normalizeInternalDirection(
      value
    );

  if (direction === "LONG") {
    return "BULL";
  }

  if (direction === "SHORT") {
    return "BEAR";
  }

  return null;
}

/*
 * ---------------------------------------------------------
 * SAFE ENGINE RUNNER
 * ---------------------------------------------------------
 *
 * Setup analysis should fail closed.
 *
 * A broken strategy/structure engine must produce
 * NO_SETUP rather than accidentally falling back to
 * fabricated or generic geometry.
 */

function safeRun(
  name,
  fn,
  fallback
) {
  try {
    return fn();
  } catch (error) {
    return {
      ...fallback,

      approved: false,

      status:
        `${name}_ERROR`,

      blockers: unique([
        ...(
          Array.isArray(
            fallback?.blockers
          )
            ? fallback.blockers
            : []
        ),

        `${name}_ERROR`,
      ]),

      error:
        String(
          error?.message ??
          error ??
          "UNKNOWN_ERROR"
        ),

      executionAuthority:
        false,

      liveExecution:
        false,
    };
  }
}

/*
 * ---------------------------------------------------------
 * MAIN BUILDER
 * ---------------------------------------------------------
 */

export function buildBotFuturesSetup(
  candidate,
  market,
  options = {}
) {
  const setupConfig = {
    ...BOT_CONFIG.setup,
    ...options,
  };

  const qualificationConfig = {
    ...BOT_CONFIG.setupQualification,
    ...(
      options.qualification ||
      {}
    ),
  };

  /*
   * -------------------------------------------------------
   * 1. LEGACY / INPUT VALIDATION
   * -------------------------------------------------------
   */

  const rawDirection =
    candidate
      ?.directionDecision
      ?.direction ??
    candidate?.direction ??
    null;

  const direction =
    normalizeInternalDirection(
      rawDirection
    );

  const researchDirection =
    normalizeResearchDirection(
      rawDirection
    );

  const inputBlockers = [
    ...(
      Array.isArray(
        market?.blockers
      )
        ? market.blockers
        : []
    ),
  ];

  if (
    candidate
      ?.directionDecision
      ?.qualified !== true
  ) {
    inputBlockers.push(
      "DIRECTION_NOT_QUALIFIED"
    );
  }

  if (!direction) {
    inputBlockers.push(
      "INVALID_DIRECTION"
    );
  }

  if (
    market?.approved !== true
  ) {
    inputBlockers.push(
      "MARKET_EVIDENCE_NOT_APPROVED"
    );
  }

  /*
   * -------------------------------------------------------
   * 2. FUTURES VALIDATION
   * -------------------------------------------------------
   */

  const instrumentType =
    market?.instrumentType ??
    candidate?.asset
      ?.instrumentType ??
    candidate?.asset
      ?.contractType ??
    null;

  const normalizedInstrumentType =
    String(
      instrumentType || ""
    ).toUpperCase();

  const futuresValidated =
    normalizedInstrumentType ===
      "PERPETUAL" ||
    normalizedInstrumentType ===
      "FUTURES";

  if (!futuresValidated) {
    inputBlockers.push(
      "FUTURES_INSTRUMENT_NOT_VALIDATED"
    );
  }

  /*
   * -------------------------------------------------------
   * 3. LEGACY MARKET VALUES
   * -------------------------------------------------------
   *
   * These remain in the final setup because other parts
   * of the platform may display them.
   */

  const atr =
    positiveOrNull(
      market?.atr
    );

  const support =
    positiveOrNull(
      market?.support
    );

  const resistance =
    positiveOrNull(
      market?.resistance
    );

  const spreadPercent =
    finiteOrNull(
      market?.spreadPercent
    );

  const directionalSlippage =
    direction === "LONG"
      ? market?.slippage?.buy
      : direction === "SHORT"
        ? market?.slippage?.sell
        : null;

  const legacySlippagePercent =
    directionalSlippage
      ?.available === true
      ? finiteOrNull(
          directionalSlippage
            ?.percent
        )
      : null;


      /*
 * -------------------------------------------------------
 * 3B. CONFIRMED SETUP CANDLES
 * -------------------------------------------------------
 *
 * Pattern recognition must use fully CLOSED candles.
 *
 * The original market object remains untouched and is
 * retained for live bid/ask, spread, slippage, freshness,
 * and execution-quality evidence.
 */

const setupCandleInterval =
  setupConfig.candleInterval ??
  "5m";

const rawSetupCandles =
  Array.isArray(market?.candles)
    ? market.candles
    : [];

const closedSetupCandles =
  normalizeClosedCandles(
    rawSetupCandles,
    {
      interval:
        setupCandleInterval,

      closeGraceMs:
        1_000,
      // Historical replay must not use wall-clock Date.now().
      nowMs: Number.isFinite(options?.replayNowMs)
        ? options.replayNowMs
        : Date.now(),
    }
  );

const analysisMarket = {
  ...market,

  candles:
    closedSetupCandles,

  candleAnalysis: {
    interval:
      setupCandleInterval,

    rawCount:
      rawSetupCandles.length,

    closedCount:
      closedSetupCandles.length,

    excludedCount:
      Math.max(
        0,
        rawSetupCandles.length -
        closedSetupCandles.length
      ),

    closedOnly:
      true,
  },
};

if (
  closedSetupCandles.length <
  30
) {
  inputBlockers.push(
    "INSUFFICIENT_CLOSED_SETUP_CANDLES"
  );
}

  /*
   * -------------------------------------------------------
   * 4. MARKET STRUCTURE
   * -------------------------------------------------------
   */

  const structure =
    safeRun(
      "MARKET_STRUCTURE",

      () =>
       analyzeBotMarketStructure(
  analysisMarket,
          {
            ...(
              options.structure ||
              {}
            ),

            candleInterval:
  setupCandleInterval,
          }
        ),

      {
        approved: false,

        status:
          "MARKET_STRUCTURE_UNAVAILABLE",

        blockers: [
          "MARKET_STRUCTURE_UNAVAILABLE",
        ],
      }
    );

  /*
   * -------------------------------------------------------
   * 5. MARKET REGIME
   * -------------------------------------------------------
   */

  const regime =
    safeRun(
      "MARKET_REGIME",

      () =>
        classifyBotMarketRegime(
          candidate,
          structure,
          options.regime ||
            {}
        ),

      {
        approved: false,

        status:
          "MARKET_REGIME_UNAVAILABLE",

        regime:
          "UNCLEAR",

        eligibleStrategies: [],

        blockers: [
          "MARKET_REGIME_UNAVAILABLE",
        ],
      }
    );

  /*
   * -------------------------------------------------------
   * 6. STRATEGY SELECTION
   * -------------------------------------------------------
   */

  const strategySelection =
    safeRun(
      "SETUP_STRATEGY",

      () =>
        selectBotSetupStrategy(
          candidate,
         analysisMarket,
          structure,
          regime,
          {
            ...(
              options.strategy ||
              {}
            ),

            shared: {
              atrStopBufferMultiplier:
                setupConfig
                  .atrStopBufferMultiplier,

              ...(
                options.strategy
                  ?.shared ||
                {}
              ),
            },
          }
        ),

      {
        approved: false,

        status:
          "NO_SETUP_STRATEGY",

        selectedStrategy:
          null,

        selectedResult:
          null,

        eligibleStrategies:
          Array.isArray(
            regime
              ?.eligibleStrategies
          )
            ? regime
                .eligibleStrategies
            : [],

        attemptedStrategies: [],

        matchedStrategies: [],

        blockers: [
          "SETUP_STRATEGY_UNAVAILABLE",
        ],
      }
    );

  /*
   * -------------------------------------------------------
   * 7. FINAL SETUP QUALITY
   * -------------------------------------------------------
   */

  const setupQuality =
    safeRun(
      "SETUP_QUALITY",

      () =>
        evaluateBotSetupQuality(
          candidate,
          market,
          structure,
          regime,
          strategySelection,
          {
            ...(
              options.quality ||
              {}
            ),

            minimumRiskReward:
              qualificationConfig
                .minimumRiskReward,

            maximumSpreadPercent:
              qualificationConfig
                .maximumSpreadPercent,
          }
        ),

      {
        approved: false,

        status:
          "SETUP_QUALITY_REJECTED",

        entry: null,
        stop: null,
        target: null,

        targets: [],

        targetsDetailed: [],

        riskReward: null,

        setupQualityScore:
          null,

        blockers: [
          "SETUP_QUALITY_UNAVAILABLE",
        ],
      }
    );

  /*
   * -------------------------------------------------------
   * 8. FINAL GEOMETRY
   * -------------------------------------------------------
   */

  const entry =
    positiveOrNull(
      setupQuality?.entry
    );

  const legacyStop =
    positiveOrNull(
      setupQuality?.stop
    );

  // The ATR/structure planner can affect the published research stop.
  // Preserve the old stop if inputs are missing; never tighten past the
  // existing structural invalidation or pretend missing evidence is valid.
  const volatilityResearch = buildVolatilityResearchDiagnostic({
    direction: researchDirection, entry, currentStop: legacyStop, target: positiveOrNull(setupQuality?.target),
    atr, support, resistance, spreadPercent,
    slippagePercent: legacySlippagePercent,
    config: options.volatilityResearch ?? {},
  });
  const stopActivation = {
    enabled: options.volatilityResearch?.enabled !== false,
    applied: false,
    reason: null,
    originalStop: legacyStop,
    proposedStop: positiveOrNull(volatilityResearch?.proposedStop ?? volatilityResearch?.stop),
  };
  let stop = legacyStop;
  const proposedStop = stopActivation.proposedStop;
  const structureLevel = direction === "LONG" ? support : resistance;
  const proposalValid = volatilityResearch?.status === "OBSERVED" &&
    entry !== null && legacyStop !== null && proposedStop !== null &&
    atr !== null && structureLevel !== null &&
    spreadPercent !== null && spreadPercent >= 0 &&
    legacySlippagePercent !== null && legacySlippagePercent >= 0 &&
    (direction === "LONG" ? proposedStop < entry && proposedStop <= structureLevel :
     direction === "SHORT" ? proposedStop > entry && proposedStop >= structureLevel : false);
  if (!stopActivation.enabled) stopActivation.reason = "FEATURE_DISABLED";
  else if (!proposalValid) stopActivation.reason = "INSUFFICIENT_VALIDATED_MARKET_INPUTS";
  else {
    // The new stop cannot be closer to entry than the old stop.
    stop = direction === "LONG" ? Math.min(legacyStop, proposedStop) : Math.max(legacyStop, proposedStop);
    stopActivation.applied = stop !== legacyStop;
    stopActivation.reason = stopActivation.applied ? "ATR_STRUCTURE_STOP_APPLIED" : "EXISTING_STOP_ALREADY_WIDER";
  }

  const target =
    positiveOrNull(
      setupQuality?.target
    );

  const validGeometry =
    direction === "LONG"
      ? (
          entry !== null &&
          stop !== null &&
          target !== null &&
          stop < entry &&
          target > entry
        )
      : direction === "SHORT"
        ? (
            entry !== null &&
            stop !== null &&
            target !== null &&
            stop > entry &&
            target < entry
          )
        : false;

  // Never trust a quality engine's approved flag without independent geometry
  // and economics checks. This is research qualification, not order approval.
  const reportedRiskReward = finiteOrNull(setupQuality?.riskReward);
  const calculatedRiskReward = validGeometry
    ? Math.abs(target - entry) / Math.abs(entry - stop)
    : null;
  const minimumRiskReward = positiveOrNull(qualificationConfig.minimumRiskReward);
  const normalizedTargets = Array.isArray(setupQuality?.targets)
    ? setupQuality.targets.map(positiveOrNull).filter(value => value !== null)
    : target !== null ? [target] : [];
  const directionallyValidTargets = normalizedTargets.filter(value =>
    direction === "LONG" ? value > entry : direction === "SHORT" ? value < entry : false
  );
  const targetListInvalid = normalizedTargets.length !== directionallyValidTargets.length;
  const geometryBlockers = [];
  if (setupQuality?.approved === true) {
    if (!validGeometry) geometryBlockers.push("INVALID_SETUP_GEOMETRY");
    if (targetListInvalid) geometryBlockers.push("TARGETS_ON_WRONG_SIDE_OF_ENTRY");
    if (calculatedRiskReward !== null && minimumRiskReward !== null &&
        calculatedRiskReward < minimumRiskReward) {
      geometryBlockers.push("RISK_REWARD_BELOW_MINIMUM");
    }
  }

  const stopDistance =
    validGeometry
      ? Math.abs(
          entry - stop
        )
      : null;

  const targetDistance =
    validGeometry
      ? Math.abs(
          target - entry
        )
      : null;

  const riskReward =
    stopDistance !== null &&
    stopDistance > 0 &&
    targetDistance !== null
      ? targetDistance /
        stopDistance
      : finiteOrNull(
          setupQuality
            ?.riskReward
        );

  /*
   * -------------------------------------------------------
   * 9. CONSOLIDATE BLOCKERS
   * -------------------------------------------------------
   */

  const finalBlockers =
    unique([
      ...inputBlockers,

      ...(
        Array.isArray(
          structure?.blockers
        )
          ? structure.blockers
          : []
      ),

      ...(
        Array.isArray(
          regime?.blockers
        )
          ? regime.blockers
          : []
      ),

      ...(
        Array.isArray(
          strategySelection
            ?.blockers
        )
          ? strategySelection
              .blockers
          : []
      ),

      ...(
        Array.isArray(
          setupQuality?.blockers
        )
          ? setupQuality.blockers
          : []
      ),

      ...geometryBlockers,
    ]);

  /*
   * Every layer must agree.
   */

  const approved =
    candidate
      ?.directionDecision
      ?.qualified === true &&
    market?.approved === true &&
    futuresValidated === true &&
    structure?.approved === true &&
    regime?.approved === true &&
    strategySelection
      ?.approved === true &&
    setupQuality
      ?.approved === true &&
    validGeometry === true &&
    finalBlockers.length === 0;

  /*
   * -------------------------------------------------------
   * 10. TARGET COMPATIBILITY
   * -------------------------------------------------------
   *
   * Keep `targets` as a numeric array.
   *
   * Existing UI / monitoring code may already depend
   * on that type.
   */

  const targets = directionallyValidTargets;

  const targetsDetailed =
    Array.isArray(setupQuality?.targetsDetailed)
      ? setupQuality.targetsDetailed
      : [];

  /*
   * -------------------------------------------------------
   * 11. FINAL SETUP
   * -------------------------------------------------------
   */

  return {
    ...candidate,

    executionMarket:
      market,

    setup: {
      /*
       * -----------------------------------------------
       * LEGACY CONTRACT
       * -----------------------------------------------
       */

      approved,

      status:
        approved
          ? "SETUP_READY"
          : "NO_SETUP",

      setupType:
        approved
          ? direction ===
            "LONG"
            ? "BUY"
            : "SELL"
          : "NONE",

      symbol:
        candidate?.symbol ??
        market?.symbol ??
        null,

      /*
       * Keep internal compatibility.
       */
      direction,

      /*
       * Public/research terminology.
       */
      researchDirection,

      /*
       * Setup geometry
       */
      entry,
      stop,
      target,

      targets,

      /*
       * Risk geometry
       */
      stopDistance,

      targetDistance,

      stopDistancePercent:
        percentDistance(
          entry,
          stop
        ),

      targetDistancePercent:
        percentDistance(
          entry,
          target
        ),

      riskReward,

      minimumRiskReward:
        qualificationConfig
          .minimumRiskReward,

      /*
       * Market quality
       */
      spreadPercent:
        finiteOrNull(
          setupQuality
            ?.spreadPercent
        ) ??
        spreadPercent,

      maximumSpreadPercent:
        qualificationConfig
          .maximumSpreadPercent,

      slippagePercent:
        finiteOrNull(
          setupQuality
            ?.slippagePercent
        ) ??
        legacySlippagePercent,

      depthNotional:
        finiteOrNull(
          market?.depth
            ?.totalNotional
        ),

      volatilityResearch,
      stopActivation,

      /*
       * Legacy structural evidence
       */
      atr,
      support,
      resistance,

      /*
       * Observation freshness
       */
      freshness:
        setupQuality
          ?.freshness ??
        market?.freshness ??
        null,

      /*
       * Instrument validation
       */
      instrumentType,

      futuresValidated,

      /*
       * -----------------------------------------------
       * V2 SETUP INTELLIGENCE
       * -----------------------------------------------
       */

      strategy:
        strategySelection
          ?.selectedStrategy ??
        null,

      lifecycleStatus:
        setupQuality?.lifecycleStatus ??
        (strategySelection?.status === "SETUP_STRATEGY_PLANNED" ? "PLANNED" : null),

      lifecycle:
        setupQuality?.lifecycle ??
        null,

      marketRegime:
        regime?.regime ??
        null,

      regimeScore:
        finiteOrNull(
          regime?.regimeScore
        ),

      entryZone:
        setupQuality
          ?.entryZone ??
        strategySelection
          ?.selectedResult
          ?.entryZone ??
        null,

      invalidation:
        setupQuality
          ?.invalidation ??
        strategySelection
          ?.selectedResult
          ?.invalidation ??
        null,

      targetsDetailed,

      setupQualityScore:
        finiteOrNull(
          setupQuality
            ?.setupQualityScore
        ),

      minimumSetupQualityScore:
        finiteOrNull(
          setupQuality
            ?.minimumSetupQualityScore
        ),

      qualityComponents:
        setupQuality
          ?.qualityComponents ??
        null,

      entryQuality:
        setupQuality
          ?.entryQuality ??
        null,

      executionQuality:
        setupQuality
          ?.executionQuality ??
        null,

      /*
       * Full structural analysis.
       */
      structure,

      /*
       * Full regime analysis.
       */
      regime,

      /*
       * Shows every strategy considered and why
       * it matched or failed.
       */
      strategySelection,

      /*
       * Final quality analysis.
       */
      quality:
        setupQuality,

      evidence:
        unique(
          Array.isArray(
            setupQuality
              ?.evidence
          )
            ? setupQuality
                .evidence
            : []
        ),

      risks:
        unique(
          Array.isArray(
            setupQuality
              ?.risks
          )
            ? setupQuality
                .risks
            : []
        ),

      /*
       * Independent safety diagnostics; does not authorize execution.
       */
      geometryDiagnostics: {
        valid: validGeometry,
        calculatedRiskReward,
        reportedRiskReward,
        minimumRiskReward,
        rejectedTargetCount: normalizedTargets.length - directionallyValidTargets.length,
        blockers: geometryBlockers,
      },

      /*
       * Qualification result
       */
      blockers:
        finalBlockers,

      /*
       * Explicit safety boundary
       */
      executionAuthority:
        false,

      liveExecution:
        false,
    },
  };
}

export default buildBotFuturesSetup;