/**
 * AEMA Crypto — Phase 6.53
 * Pre-Entry Futures Setup Builder
 *
 * Converts fresh execution-market evidence into a bounded, evidence-backed
 * LONG or SHORT setup BEFORE the Trade Entry Qualification Gate.
 *
 * Responsibilities:
 * - accept an already-decided LONG/SHORT direction
 * - choose executable entry side (ask for LONG, bid for SHORT)
 * - derive stop from real structure + ATR buffer
 * - derive target from real completed-candle structure
 * - calculate stop/target distance and risk:reward
 * - expose direction-specific execution slippage
 *
 * IMPORTANT:
 * - does NOT choose LONG vs SHORT
 * - does NOT size a position
 * - does NOT choose leverage
 * - does NOT approve a trade
 * - does NOT submit orders
 * - no synthetic stop fallback
 * - no missing-evidence neutral score
 * - no execution authority
 */

const DEFAULTS = Object.freeze({
  atrStopBufferMultiplier: 0.25,
  minimumRiskReward: 1.0,
  maximumEntryDeviationFromMarkPercent: 1.0,
});

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function upper(value) {
  return String(value ?? "").trim().toUpperCase();
}

function normalizeDirection(value) {
  const direction = upper(value);
  return direction === "LONG" || direction === "SHORT"
    ? direction
    : null;
}

function percentDistance(a, b) {
  const first = finite(a);
  const second = finite(b);

  if (
    first === null ||
    second === null ||
    first <= 0
  ) {
    return null;
  }

  return Math.abs(second - first) / first * 100;
}

function fail({
  direction = null,
  symbol = null,
  reason,
  failures = [],
  evidence = {},
} = {}) {
  return {
    approved: false,
    status: "PRE_ENTRY_SETUP_INSUFFICIENT",
    reason,
    symbol,
    direction,

    entryPrice: null,
    stopPrice: null,
    targetPrice: null,
    stopDistancePercent: null,
    targetDistancePercent: null,
    riskReward: null,

    atr: null,
    atrPercent: null,

    executionContext: {
      spreadPercent: null,
      liquidityScore: null,
      slippageEstimatePercent: null,
      venueHealthy: false,
      orderBookHealthy: false,
    },

    entryRiskContext: {
      riskReward: null,
      stopDistancePercent: null,
      targetDistancePercent: null,
      stopPrice: null,
      targetPrice: null,
      atr: null,
      atrPercent: null,
      structuralStopPrice: null,
    },

    evidence: {
      available: false,
      stopEvidenceAvailable: false,
      targetEvidenceAvailable: false,
      syntheticStopFallback: false,
      missingEvidenceReceivesNeutralScore: false,
      failures,
      ...evidence,
    },

    executionAuthority: false,
    liveExecution: false,
  };
}

/**
 * Build a pre-entry setup from cryptoFuturesExecutionMarketProvider output.
 *
 * `direction` must already have been decided by the upstream
 * intelligence/revalidation path.
 */
export function buildCryptoPreEntrySetup({
  candidate = null,
  direction = null,
  executionMarket = null,
  policy = DEFAULTS,
} = {}) {
  const resolvedDirection = normalizeDirection(
    direction ??
      candidate?.finalRevalidation?.decision ??
      candidate?.tradingDecision ??
      candidate?.preferredDirection,
  );

  const symbol =
    executionMarket?.symbol ??
    executionMarket?.market?.symbol ??
    candidate?.symbol ??
    candidate?.asset?.symbol ??
    null;

  if (!resolvedDirection) {
    return fail({
      symbol,
      reason: "LONG_OR_SHORT_DIRECTION_REQUIRED",
      failures: [
        {
          code: "DIRECTION_REQUIRED",
          detail: direction ?? null,
        },
      ],
    });
  }

  if (executionMarket?.approved !== true) {
    return fail({
      symbol,
      direction: resolvedDirection,
      reason: "EXECUTION_MARKET_EVIDENCE_REQUIRED",
      failures: [
        {
          code: "EXECUTION_MARKET_EVIDENCE_NOT_APPROVED",
          detail: executionMarket?.status ?? null,
        },
        ...(Array.isArray(executionMarket?.evidence?.failures)
          ? executionMarket.evidence.failures
          : []),
      ],
    });
  }

  const market = executionMarket?.market ?? {};
  const setup = executionMarket?.setupEvidence ?? {};
  const execution = executionMarket?.executionContext ?? {};

  const markPrice = finite(market?.markPrice);
  const bestBid = finite(market?.bestBid);
  const bestAsk = finite(market?.bestAsk);
  const atr = finite(setup?.atr ?? market?.atr);
  const atrPercent = finite(setup?.atrPercent ?? market?.atrPercent);

  const support = finite(setup?.support ?? market?.support);
  const resistance = finite(setup?.resistance ?? market?.resistance);
  const structuralHigh = finite(
    setup?.structuralHigh ?? market?.structuralHigh,
  );
  const structuralLow = finite(
    setup?.structuralLow ?? market?.structuralLow,
  );

  const spreadPercent = finite(execution?.spreadPercent);
  const liquidityScore = finite(execution?.liquidityScore);

  const directionSlippage =
    resolvedDirection === "LONG"
      ? finite(
          execution?.buySlippageEstimatePercent ??
            execution?.slippageEstimatePercent,
        )
      : finite(
          execution?.sellSlippageEstimatePercent ??
            execution?.slippageEstimatePercent,
        );

  const failures = [];

  if (markPrice === null || markPrice <= 0) {
    failures.push({
      code: "MARK_PRICE_REQUIRED",
      detail: markPrice,
    });
  }

  if (bestBid === null || bestBid <= 0) {
    failures.push({
      code: "BEST_BID_REQUIRED",
      detail: bestBid,
    });
  }

  if (bestAsk === null || bestAsk <= 0) {
    failures.push({
      code: "BEST_ASK_REQUIRED",
      detail: bestAsk,
    });
  }

  if (spreadPercent === null) {
    failures.push({
      code: "SPREAD_EVIDENCE_REQUIRED",
      detail: spreadPercent,
    });
  }

  if (liquidityScore === null) {
    failures.push({
      code: "LIQUIDITY_EVIDENCE_REQUIRED",
      detail: liquidityScore,
    });
  }

  if (directionSlippage === null) {
    failures.push({
      code: "DIRECTIONAL_SLIPPAGE_EVIDENCE_REQUIRED",
      detail: resolvedDirection,
    });
  }

  if (atr === null || atr <= 0 || atrPercent === null) {
    failures.push({
      code: "ATR_EVIDENCE_REQUIRED",
      detail: {
        atr,
        atrPercent,
      },
    });
  }

  if (resolvedDirection === "LONG") {
    if (support === null) {
      failures.push({
        code: "LONG_SUPPORT_REQUIRED",
        detail: support,
      });
    }

    if (structuralHigh === null) {
      failures.push({
        code: "LONG_STRUCTURAL_TARGET_REQUIRED",
        detail: structuralHigh,
      });
    }
  }

  if (resolvedDirection === "SHORT") {
    if (resistance === null) {
      failures.push({
        code: "SHORT_RESISTANCE_REQUIRED",
        detail: resistance,
      });
    }

    if (structuralLow === null) {
      failures.push({
        code: "SHORT_STRUCTURAL_TARGET_REQUIRED",
        detail: structuralLow,
      });
    }
  }

  if (failures.length) {
    return fail({
      symbol,
      direction: resolvedDirection,
      reason: "PRE_ENTRY_EVIDENCE_INCOMPLETE",
      failures,
      evidence: {
        markPrice,
        bestBid,
        bestAsk,
        atr,
        atrPercent,
        support,
        resistance,
        structuralHigh,
        structuralLow,
      },
    });
  }

  /*
   * A marketable LONG enters against the ask.
   * A marketable SHORT enters against the bid.
   */
  const entryPrice =
    resolvedDirection === "LONG"
      ? bestAsk
      : bestBid;

  const entryDeviationFromMarkPercent =
    percentDistance(markPrice, entryPrice);

  const maxEntryDeviation =
    finite(policy?.maximumEntryDeviationFromMarkPercent) ??
    DEFAULTS.maximumEntryDeviationFromMarkPercent;

  if (
    entryDeviationFromMarkPercent === null ||
    entryDeviationFromMarkPercent > maxEntryDeviation
  ) {
    return fail({
      symbol,
      direction: resolvedDirection,
      reason: "ENTRY_PRICE_DEVIATION_TOO_LARGE",
      failures: [
        {
          code: "ENTRY_PRICE_DEVIATION_TOO_LARGE",
          detail: {
            markPrice,
            entryPrice,
            entryDeviationFromMarkPercent,
            maximumEntryDeviationFromMarkPercent: maxEntryDeviation,
          },
        },
      ],
    });
  }

  const atrBufferMultiplier =
    finite(policy?.atrStopBufferMultiplier) ??
    DEFAULTS.atrStopBufferMultiplier;

  if (atrBufferMultiplier < 0) {
    return fail({
      symbol,
      direction: resolvedDirection,
      reason: "INVALID_ATR_STOP_BUFFER_POLICY",
      failures: [
        {
          code: "INVALID_ATR_STOP_BUFFER_MULTIPLIER",
          detail: atrBufferMultiplier,
        },
      ],
    });
  }

  const atrBuffer = atr * atrBufferMultiplier;

  /*
   * Stop is evidence-backed:
   * LONG  -> completed-candle support minus ATR buffer
   * SHORT -> completed-candle resistance plus ATR buffer
   *
   * There is deliberately no preferred-percent or arbitrary fallback.
   */
  const structuralStopPrice =
    resolvedDirection === "LONG"
      ? support
      : resistance;

  const stopPrice =
    resolvedDirection === "LONG"
      ? structuralStopPrice - atrBuffer
      : structuralStopPrice + atrBuffer;

  /*
   * Target is also structural evidence, not a fabricated fixed-R target:
   * LONG  -> completed-candle structural high
   * SHORT -> completed-candle structural low
   */
  const targetPrice =
    resolvedDirection === "LONG"
      ? structuralHigh
      : structuralLow;

  const geometryValid =
    resolvedDirection === "LONG"
      ? stopPrice > 0 &&
        stopPrice < entryPrice &&
        targetPrice > entryPrice
      : stopPrice > entryPrice &&
        targetPrice > 0 &&
        targetPrice < entryPrice;

  if (!geometryValid) {
    return fail({
      symbol,
      direction: resolvedDirection,
      reason: "INVALID_EXECUTABLE_SETUP_GEOMETRY",
      failures: [
        {
          code: "STOP_TARGET_GEOMETRY_INVALID",
          detail: {
            direction: resolvedDirection,
            entryPrice,
            stopPrice,
            targetPrice,
            support,
            resistance,
            structuralHigh,
            structuralLow,
          },
        },
      ],
      evidence: {
        atr,
        atrPercent,
        structuralStopPrice,
        atrBuffer,
      },
    });
  }

  const riskPerUnit =
    resolvedDirection === "LONG"
      ? entryPrice - stopPrice
      : stopPrice - entryPrice;

  const rewardPerUnit =
    resolvedDirection === "LONG"
      ? targetPrice - entryPrice
      : entryPrice - targetPrice;

  if (
    riskPerUnit <= 0 ||
    rewardPerUnit <= 0
  ) {
    return fail({
      symbol,
      direction: resolvedDirection,
      reason: "NON_POSITIVE_SETUP_RISK_OR_REWARD",
      failures: [
        {
          code: "NON_POSITIVE_RISK_OR_REWARD",
          detail: {
            riskPerUnit,
            rewardPerUnit,
          },
        },
      ],
    });
  }

  const stopDistancePercent =
    riskPerUnit / entryPrice * 100;

  const targetDistancePercent =
    rewardPerUnit / entryPrice * 100;

  const riskReward =
    rewardPerUnit / riskPerUnit;

  const minimumRiskReward =
    finite(policy?.minimumRiskReward) ??
    DEFAULTS.minimumRiskReward;

  if (riskReward < minimumRiskReward) {
    return {
      ...fail({
        symbol,
        direction: resolvedDirection,
        reason: "PRE_ENTRY_RISK_REWARD_TOO_LOW",
        failures: [
          {
            code: "PRE_ENTRY_RISK_REWARD_TOO_LOW",
            detail: {
              riskReward,
              minimumRiskReward,
            },
          },
        ],
      }),

      entryPrice,
      stopPrice,
      targetPrice,
      stopDistancePercent,
      targetDistancePercent,
      riskReward,
      atr,
      atrPercent,

      entryRiskContext: {
        riskReward,
        stopDistancePercent,
        targetDistancePercent,
        stopPrice,
        targetPrice,
        atr,
        atrPercent,
        structuralStopPrice,
      },

      evidence: {
        available: true,
        stopEvidenceAvailable: true,
        targetEvidenceAvailable: true,
        stopSource: "STRUCTURE_WITH_ATR_BUFFER",
        targetSource: "COMPLETED_CANDLE_STRUCTURE",
        syntheticStopFallback: false,
        missingEvidenceReceivesNeutralScore: false,
        failures: [
          {
            code: "PRE_ENTRY_RISK_REWARD_TOO_LOW",
            detail: {
              riskReward,
              minimumRiskReward,
            },
          },
        ],
      },
    };
  }

  const resolvedExecutionContext = {
    spreadPercent,
    liquidityScore,
    slippageEstimatePercent: directionSlippage,
    buySlippageEstimatePercent: finite(
      execution?.buySlippageEstimatePercent,
    ),
    sellSlippageEstimatePercent: finite(
      execution?.sellSlippageEstimatePercent,
    ),
    venueHealthy: execution?.venueHealthy === true,
    orderBookHealthy: execution?.orderBookHealthy === true,
  };

  const entryRiskContext = {
    riskReward,
    stopDistancePercent,
    targetDistancePercent,
    stopPrice,
    targetPrice,
    atr,
    atrPercent,
    structuralStopPrice,
  };

  return {
    approved: true,
    status: "PRE_ENTRY_SETUP_READY",
    reason: "EVIDENCE_BACKED_FUTURES_SETUP_AVAILABLE",

    symbol,
    direction: resolvedDirection,

    entryPrice,
    stopPrice,
    targetPrice,

    riskPerUnit,
    rewardPerUnit,
    stopDistancePercent,
    targetDistancePercent,
    riskReward,

    atr,
    atrPercent,

    executionContext: resolvedExecutionContext,
    entryRiskContext,

    evidence: {
      available: true,
      stopEvidenceAvailable: true,
      targetEvidenceAvailable: true,

      markPrice,
      bestBid,
      bestAsk,
      entryDeviationFromMarkPercent,

      support,
      resistance,
      structuralHigh,
      structuralLow,

      structuralStopPrice,
      atrBuffer,
      atrStopBufferMultiplier,

      stopSource: "STRUCTURE_WITH_ATR_BUFFER",
      targetSource: "COMPLETED_CANDLE_STRUCTURE",

      directionSpecificSlippagePercent: directionSlippage,

      syntheticStopFallback: false,
      missingEvidenceReceivesNeutralScore: false,
      failures: [],
    },

    metadata: {
      evidenceOnly: true,
      setupProposalOnly: true,
      directionChosenUpstream: true,
      positionSizingPerformed: false,
      leverageSelected: false,
      executionAuthority: false,
      liveExecution: false,
    },

    executionAuthority: false,
    liveExecution: false,
  };
}

export function createCryptoPreEntrySetupBuilder(
  options = {},
) {
  return function cryptoPreEntrySetupBuilder(
    context = {},
  ) {
    return buildCryptoPreEntrySetup({
      ...context,
      policy: {
        ...DEFAULTS,
        ...(options?.policy ?? options),
        ...(context?.policy ?? {}),
      },
    });
  };
}

export {
  DEFAULTS as DEFAULT_CRYPTO_PRE_ENTRY_SETUP_POLICY,
};

export default buildCryptoPreEntrySetup;
