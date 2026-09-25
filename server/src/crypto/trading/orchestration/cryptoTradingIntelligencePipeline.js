/**
 * AEMA CRYPTO
 * Phase 5.22 — Trading Intelligence Runtime Integration
 *
 * PURPOSE
 * -------
 * Connect the crypto-specific trading engines to:
 *
 * - directional decision coordinator
 * - entry qualification
 * - futures risk
 * - live position monitoring
 * - dynamic stop management
 * - lifecycle coordination
 *
 * IMPORTANT
 * ---------
 * This layer has NO execution authority.
 *
 * It decides what SHOULD happen.
 * It does not place an order.
 */

import runTechnical
  from "../engines/cryptoTradingTechnicalEngine.js";

import runMomentum
  from "../engines/cryptoTradingMomentumEngine.js";

import runMarketStructure
  from "../engines/cryptoTradingMarketStructureEngine.js";

import runDerivatives
  from "../engines/cryptoTradingDerivativesEngine.js";

import runMarketRegime
  from "../engines/cryptoTradingMarketRegimeEngine.js";

import runBtcEthDependency
  from "../engines/cryptoTradingBtcEthDependencyEngine.js";

import runOnChainFlow
  from "../engines/cryptoTradingOnChainFlowEngine.js";

import coordinateCryptoTradingDecision
  from "../coordinator/cryptoTradingDecisionCoordinator.js";

import qualifyCryptoTradeEntry
  from "../gates/cryptoTradeEntryQualificationGate.js";

import monitorCryptoPosition
  from "../monitoring/cryptoLivePositionMonitor.js";

import updateCryptoDynamicStop
  from "../risk/cryptoDynamicStopManager.js";

import buildCryptoFuturesRiskPlan
  from "../risk/cryptoFuturesRiskManager.js";

import coordinateCryptoPositionLifecycle
  from "../coordinator/cryptoPositionLifecycleCoordinator.js";


const finite = (value) => {
  const n = Number(value);

  return Number.isFinite(n)
    ? n
    : null;
};


const upper = (
  value,
  fallback = "",
) => {
  const text =
    String(value ?? "")
      .trim()
      .toUpperCase();

  return text || fallback;
};


function clone(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return value;
  }

  return JSON.parse(
    JSON.stringify(value),
  );
}


function positionIsOpen(
  position,
) {
  const quantity =
    Math.max(
      0,
      finite(
        position?.quantity,
      ) ?? 0,
    );

  const direction =
    upper(
      position?.direction,
      "FLAT",
    );

  return (
    quantity > 0 &&
    (
      direction === "LONG" ||
      direction === "SHORT"
    )
  );
}


function buildFailedEngineResult(
  engine,
  error,
) {
  return {
    engine,

    status:
      "ENGINE_ERROR",

    role:
      "DIRECTIONAL",

    direction:
      "NEUTRAL",

    longSupport:
      0,

    shortSupport:
      0,

    confidence:
      0,

    quality:
      0,

    reasons: [],

    risks: [
      "ENGINE_RUNTIME_ERROR",
    ],

    warnings: [
      String(
        error?.message ??
        error,
      ),
    ],

    noExecutionAuthority:
      true,
  };
}


function engineNameFromKey(
  key,
) {
  const names = {
    technical:
      "CRYPTO_TRADING_TECHNICAL",

    momentum:
      "CRYPTO_TRADING_MOMENTUM",

    marketStructure:
      "CRYPTO_TRADING_MARKET_STRUCTURE",

    derivatives:
      "CRYPTO_TRADING_DERIVATIVES",

    marketRegime:
      "CRYPTO_TRADING_MARKET_REGIME",

    btcEthDependency:
      "CRYPTO_TRADING_BTC_ETH_DEPENDENCY",

    onChainFlow:
      "CRYPTO_TRADING_ON_CHAIN_FLOW",
  };

  return (
    names[key] ??
    key
  );
}


/**
 * Engine overrides are useful for:
 * - diagnostics
 * - replay
 * - backtesting
 * - deterministic simulations
 *
 * Override may be:
 *
 * engineOverrides.technical = {...result}
 *
 * OR
 *
 * engineOverrides.technical = async (...) => {...result}
 */

async function executeEngine({
  key,
  runner,
  candidate,
  context,
  override,
}) {
  try {
    if (
      typeof override ===
      "function"
    ) {
      return await override(
        candidate,
        context,
      );
    }

    if (
      override &&
      typeof override ===
        "object"
    ) {
      return clone(
        override,
      );
    }

    return await runner(
      candidate,
      context,
    );
  } catch (error) {
    return buildFailedEngineResult(
      engineNameFromKey(
        key,
      ),
      error,
    );
  }
}


/**
 * ============================================================
 * RUN ALL CRYPTO TRADING ENGINES
 * ============================================================
 */

export async function runCryptoTradingEngines({
  candidate,
  finalIntelligence = null,
  engineContext = {},
  engineOverrides = {},
} = {}) {
  if (!candidate) {
    throw new Error(
      "CRYPTO_TRADING_CANDIDATE_REQUIRED",
    );
  }

  /**
   * Technical/momentum/structure/on-chain use the
   * candidate measurements directly.
   *
   * Passing a second argument to JS functions that don't
   * consume it is harmless.
   */

  const [
    technical,
    momentum,
    marketStructure,
    derivatives,
    marketRegime,
    btcEthDependency,
    onChainFlow,
  ] =
    await Promise.all([
      executeEngine({
        key:
          "technical",

        runner:
          runTechnical,

        candidate,

        context:
          engineContext
            ?.technical,

        override:
          engineOverrides
            ?.technical,
      }),

      executeEngine({
        key:
          "momentum",

        runner:
          runMomentum,

        candidate,

        context:
          engineContext
            ?.momentum,

        override:
          engineOverrides
            ?.momentum,
      }),

      executeEngine({
        key:
          "marketStructure",

        runner:
          runMarketStructure,

        candidate,

        context:
          engineContext
            ?.marketStructure,

        override:
          engineOverrides
            ?.marketStructure,
      }),

      executeEngine({
        key:
          "derivatives",

        runner:
          async (
            value,
          ) =>
            runDerivatives(
              value,
              {
                finalIntelligence,
                ...(engineContext
                  ?.derivatives ??
                  {}),
              },
            ),

        candidate,

        context:
          engineContext
            ?.derivatives,

        override:
          engineOverrides
            ?.derivatives,
      }),

      executeEngine({
        key:
          "marketRegime",

        runner:
          runMarketRegime,

        candidate,

        context:
          engineContext
            ?.marketRegime,

        override:
          engineOverrides
            ?.marketRegime,
      }),

      executeEngine({
        key:
          "btcEthDependency",

        runner:
          runBtcEthDependency,

        candidate,

        context:
          engineContext
            ?.btcEthDependency,

        override:
          engineOverrides
            ?.btcEthDependency,
      }),

      executeEngine({
        key:
          "onChainFlow",

        runner:
          runOnChainFlow,

        candidate,

        context:
          engineContext
            ?.onChainFlow,

        override:
          engineOverrides
            ?.onChainFlow,
      }),
    ]);

  return {
    technical,
    momentum,
    marketStructure,
    derivatives,
    marketRegime,
    btcEthDependency,
    onChainFlow,
  };
}


/**
 * ============================================================
 * DECISION COORDINATOR ADAPTER
 * ============================================================
 *
 * The coordinator is expected to consume engineResults.
 *
 * This wrapper protects the integration boundary so we don't
 * need to modify the coordinator itself.
 */

function decisionLooksValid(
  decision,
) {
  return Boolean(
    decision &&
    typeof decision ===
      "object" &&
    (
      decision.preferredDirection ||
      decision.status ||
      decision.scores ||
      decision.consensus
    ),
  );
}


function runDecisionCoordinator(
  engineResults,
  decisionOptions = {},
) {
  /**
   * Primary contract:
   *
   * coordinateCryptoTradingDecision(
   *   engineResults,
   *   options
   * )
   */

  let decision;

  try {
    decision =
      coordinateCryptoTradingDecision(
        engineResults,
        decisionOptions,
      );
  } catch {
    decision = null;
  }

  if (
    decisionLooksValid(
      decision,
    )
  ) {
    return decision;
  }

  /**
   * Defensive compatibility fallback.
   *
   * This protects us if an earlier version used
   * a single object-style argument.
   */

  try {
    decision =
      coordinateCryptoTradingDecision({
        engineResults,

        ...engineResults,

        ...decisionOptions,
      });
  } catch (error) {
    return {
      status:
        "COORDINATOR_ERROR",

      preferredDirection:
        "NEUTRAL",

      scores: {
        long: 0,
        short: 0,
        separation: 0,
      },

      consensus: {
        confidence: 0,
        availableEngines: 0,
      },

      reasons: [],

      warnings: [
        String(
          error?.message ??
          error,
        ),
      ],

      noExecutionAuthority:
        true,
    };
  }

  return decision;
}


function normalizeDecision(
  decision,
) {
  const preferredDirection =
    upper(
      decision
        ?.preferredDirection ??
      decision?.direction,
      "NEUTRAL",
    );

  return {
    ...decision,

    preferredDirection,

    /**
     * Lifecycle currently also reads decision.direction.
     * Preserve both names.
     */
    direction:
      preferredDirection,

    noExecutionAuthority:
      true,
  };
}



function getFinalRevalidationDirection(
  candidate,
) {
  return upper(
    candidate
      ?.finalRevalidation
      ?.decision,
    "NEUTRAL",
  );
}


function buildDirectionAgreement({
  candidate,
  decision,
  entryGate = null,
} = {}) {
  const finalDirection =
    getFinalRevalidationDirection(
      candidate,
    );

  const intelligenceDirection =
    upper(
      decision
        ?.preferredDirection ??
      decision?.direction,
      "NEUTRAL",
    );

  const entryDirection =
    upper(
      entryGate?.direction,
      intelligenceDirection,
    );

  const validFinalDirection =
    finalDirection === "LONG" ||
    finalDirection === "SHORT";

  const validIntelligenceDirection =
    intelligenceDirection === "LONG" ||
    intelligenceDirection === "SHORT";

  const validEntryDirection =
    entryDirection === "LONG" ||
    entryDirection === "SHORT";

  const approved =
    validFinalDirection &&
    validIntelligenceDirection &&
    validEntryDirection &&
    finalDirection ===
      intelligenceDirection &&
    intelligenceDirection ===
      entryDirection;

  return {
    approved,

    finalRevalidationDirection:
      finalDirection,

    tradingIntelligenceDirection:
      intelligenceDirection,

    entryGateDirection:
      entryDirection,

    reason:
      approved
        ? "DIRECTION_AGREEMENT_CONFIRMED"
        : "DIRECTION_REVALIDATION_INTELLIGENCE_CONFLICT",

    noExecutionAuthority:
      true,

    liveExecution:
      false,
  };
}


function buildDirectionConflictEntryGate({
  decision,
  directionAgreement,
} = {}) {
  return {
    approved:
      false,

    state:
      "NO_TRADE_CONFLICT",

    direction:
      directionAgreement
        ?.tradingIntelligenceDirection ??
      decision?.preferredDirection ??
      "NEUTRAL",

    entryQuality:
      null,

    exposureMultiplier:
      0,

    metrics:
      {},

    reasons:
      [],

    warnings:
      [],

    blockers: [
      directionAgreement
        ?.reason ??
      "DIRECTION_REVALIDATION_INTELLIGENCE_CONFLICT",
    ],

    directionAgreement,

    noExecutionAuthority:
      true,

    liveExecution:
      false,
  };
}


/**
 * ============================================================
 * ENTRY PATH
 * ============================================================
 */

async function runEntryPath({
  candidate,
  engineResults,
  decision,
  market,
  account,
  executionContext,
  entryRiskContext,
  entryPolicy,
  futuresRiskPolicy,
  riskContext,
}) {
  const preEntryDirectionAgreement =
    buildDirectionAgreement({
      candidate,
      decision,
      entryGate: {
        direction:
          decision?.preferredDirection,
      },
    });

  const entryGate =
    preEntryDirectionAgreement
      ?.approved === true
      ? qualifyCryptoTradeEntry({
          decision,

          execution:
            executionContext,

          risk:
            entryRiskContext,

          ...(entryPolicy
            ? {
                policy:
                  entryPolicy,
              }
            : {}),
        })
      : buildDirectionConflictEntryGate({
          decision,
          directionAgreement:
            preEntryDirectionAgreement,
        });

  const directionAgreement =
    buildDirectionAgreement({
      candidate,
      decision,
      entryGate,
    });

  const resolvedEntryGate =
    directionAgreement?.approved === true
      ? {
          ...entryGate,

          directionAgreement,
        }
      : buildDirectionConflictEntryGate({
          decision,
          directionAgreement,
        });

  const entryPrice =
    finite(
      riskContext
        ?.entryPrice ??
      market?.price ??
      market?.markPrice ??
      market?.lastPrice ??
      candidate
        ?.measurements
        ?.priceUsd,
    );

  const accountEquity =
    finite(
      riskContext
        ?.accountEquity ??
      account?.equity ??
      account?.accountEquity,
    );

  const riskPlan =
    (
      directionAgreement?.approved === true &&
      resolvedEntryGate?.approved === true
    )
      ? buildCryptoFuturesRiskPlan(
      {
        ...riskContext,

        direction:
          resolvedEntryGate
            ?.direction ??
          decision
            ?.preferredDirection,

        entryQualification:
          resolvedEntryGate,

        entryPrice,

        accountEquity,

        atr:
          riskContext?.atr ??
          candidate
            ?.measurements
            ?.atr,

        atrPercent:
          riskContext
            ?.atrPercent ??
          candidate
            ?.measurements
            ?.atrPercent,

        volatilityScore:
          riskContext
            ?.volatilityScore ??
          market
            ?.volatilityScore,

        requestedLeverage:
          riskContext
            ?.requestedLeverage ??
          account
            ?.requestedLeverage,
      },

      futuresRiskPolicy ??
      {},
    )
      : {
          approved:
            false,

          status:
            directionAgreement?.approved === true
              ? "ENTRY_QUALIFICATION_REQUIRED"
              : "DIRECTION_CONFLICT",

          reason:
            directionAgreement?.approved === true
              ? "ENTRY_GATE_NOT_APPROVED"
              : directionAgreement?.reason,

          direction:
            resolvedEntryGate?.direction ??
            decision?.preferredDirection ??
            "NEUTRAL",

          noExecutionAuthority:
            true,

          liveExecution:
            false,
        };

  const lifecycle =
    await coordinateCryptoPositionLifecycle({
      position: {
        state:
          "FLAT",

        direction:
          decision
            ?.preferredDirection,

        exposure:
          0,

        currentExposure:
          0,
      },

      monitor: {},

      riskPlan,

      stopPlan: {},

      decision,

      entryGate:
        resolvedEntryGate,
    });

  return {
    mode:
      "ENTRY_EVALUATION",

    engineResults,

    decision,

    entryGate:
      resolvedEntryGate,

    directionAgreement,

    liveMonitor:
      null,

    riskPlan,

    stopPlan:
      null,

    lifecycle,

    action:
      lifecycle?.action ??
      (
        (
          resolvedEntryGate?.approved === true &&
          riskPlan?.approved === true &&
          directionAgreement?.approved === true
        )
          ? "OPEN_POSITION"
          : "WAIT"
      ),

    evidenceContract: {
      executionEvidenceRequired: [
        "spreadPercent",
        "liquidityScore",
      ],

      entryRiskEvidenceRequired: [
        "riskReward",
        "stopDistancePercent",
      ],

      entryPriceAvailable:
        entryPrice !== null,

      accountEquityAvailable:
        accountEquity !== null,

      failClosed:
        true,

      missingEvidenceReceivesNeutralScore:
        false,
    },

    noExecutionAuthority:
      true,

    liveExecution:
      false,
  };
}


/**
 * ============================================================
 * OPEN POSITION MANAGEMENT PATH
 * ============================================================
 */

async function runPositionManagementPath({
  candidate,
  position,
  engineResults,
  entryEngines,
  decision,
  market,
  account,
  existingRiskPlan,
  riskContext,
  monitorPolicy,
  dynamicStopPolicy,
  futuresRiskPolicy,
}) {
  /**
   * Entry engine state should normally be stored with
   * the position at the moment the trade opens.
   */

  const resolvedEntryEngines =
    entryEngines ??
    position?.entryEngines ??
    null;

  const monitor =
    monitorCryptoPosition({
      position,

      entryEngines:
        resolvedEntryEngines,

      currentEngines:
        engineResults,

      market,

      ...(monitorPolicy
        ? {
            policy:
              monitorPolicy,
          }
        : {}),
    });

  const entryPrice =
    finite(
      position?.entryPrice ??
      position
        ?.averageEntryPrice ??
      existingRiskPlan
        ?.entryPrice ??
      market?.price,
    );

  const accountEquity =
    finite(
      riskContext
        ?.accountEquity ??
      account?.equity ??
      account?.accountEquity,
    );

  /**
   * Re-evaluate current risk state.
   *
   * If we don't have enough information to construct a new
   * risk plan, preserve the original position risk plan.
   */

  const currentRiskPlan =
    buildCryptoFuturesRiskPlan(
      {
        ...riskContext,

        direction:
          position?.direction,

        entryPrice,

        accountEquity,

        liveMonitor:
          monitor,

        atr:
          riskContext?.atr ??
          candidate
            ?.measurements
            ?.atr,

        atrPercent:
          riskContext
            ?.atrPercent ??
          candidate
            ?.measurements
            ?.atrPercent,

        volatilityScore:
          riskContext
            ?.volatilityScore ??
          market
            ?.volatilityScore,

        requestedLeverage:
          riskContext
            ?.requestedLeverage ??
          existingRiskPlan
            ?.leverage
            ?.recommended ??
          account
            ?.requestedLeverage,
      },

      futuresRiskPolicy ??
      {},
    );

  const riskPlan =
    currentRiskPlan
      ?.approved
      ? currentRiskPlan
      : (
          existingRiskPlan ??
          currentRiskPlan
        );

  const stopPosition = {
    ...position,

    entryPrice,

    currentPrice:
      finite(
        position?.currentPrice ??
        market?.price ??
        market?.markPrice ??
        market?.lastPrice,
      ),

    currentStopPrice:
      position
        ?.currentStopPrice ??
      position
        ?.stopPrice ??
      riskPlan
        ?.stop
        ?.currentStopPrice ??
      riskPlan
        ?.stop
        ?.initialStopPrice,
  };

  const stopPlan =
    updateCryptoDynamicStop({
      position:
        stopPosition,

      riskPlan,

      liveMonitor:
        monitor,

      market,

      policyOverrides:
        dynamicStopPolicy ??
        {},
    });

  const lifecycle =
    await coordinateCryptoPositionLifecycle({
      position: {
        ...position,

        state:
          position?.state ??
          position
            ?.lifecycleState ??
          "OPEN",

        direction:
          position?.direction,

        exposure:
          position?.exposure ??
          position
            ?.currentExposure ??
          1,
      },

      monitor,

      riskPlan,

      stopPlan,

      decision,

      entryGate: {},
    });

  return {
    mode:
      "POSITION_MANAGEMENT",

    engineResults,

    decision,

    entryGate:
      null,

    liveMonitor:
      monitor,

    riskPlan,

    stopPlan,

    lifecycle,

    action:
      lifecycle?.action ??
      monitor?.action ??
      "HOLD",

    noExecutionAuthority:
      true,

    liveExecution:
      false,
  };
}


/**
 * ============================================================
 * MAIN PHASE 5.22 PIPELINE
 * ============================================================
 */

export async function runCryptoTradingIntelligencePipeline({
  candidate,

  position = null,

  entryEngines = null,

  existingRiskPlan = null,

  finalIntelligence = null,

  market = {},

  account = {},

  executionContext = {},

  entryRiskContext = {},

  riskContext = {},

  engineContext = {},

  engineOverrides = {},

  decisionOptions = {},

  entryPolicy = null,

  monitorPolicy = null,

  dynamicStopPolicy = null,

  futuresRiskPolicy = null,
} = {}) {
  if (!candidate) {
    throw new Error(
      "CRYPTO_TRADING_CANDIDATE_REQUIRED",
    );
  }

  const engineResults =
    await runCryptoTradingEngines({
      candidate,

      finalIntelligence,

      engineContext,

      engineOverrides,
    });

  const rawDecision =
    runDecisionCoordinator(
      engineResults,
      decisionOptions,
    );

  const decision =
    normalizeDecision(
      rawDecision,
    );

  const open =
    positionIsOpen(
      position,
    );

  let result;

  if (!open) {
    result =
      await runEntryPath({
        candidate,

        engineResults,

        decision,

        market,

        account,

        executionContext,

        entryRiskContext,

        entryPolicy,

        futuresRiskPolicy,

        riskContext,
      });
  } else {
    result =
      await runPositionManagementPath({
        candidate,

        position,

        engineResults,

        entryEngines,

        decision,

        market,

        account,

        existingRiskPlan,

        riskContext,

        monitorPolicy,

        dynamicStopPolicy,

        futuresRiskPolicy,
      });
  }

  return {
    symbol:
      candidate?.symbol ??
      position?.symbol ??
      null,

    candidateType:
      candidate
        ?.candidateType ??
      candidate?.type ??
      null,

    ...result,

    engineErrors:
      Object.entries(
        engineResults,
      )
        .filter(
          ([, value]) =>
            value?.status ===
            "ENGINE_ERROR",
        )
        .map(
          ([key, value]) => ({
            engine:
              key,

            warnings:
              value?.warnings ??
              [],
          }),
        ),

    paperExecution:
      true,

    liveExecution:
      false,

    executionAuthority:
      false,
  };
}


export default
  runCryptoTradingIntelligencePipeline;