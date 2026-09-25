/**
 * AEMA CRYPTO
 * PHASE 5.9
 *
 * FUTURES RISK & POSITION PROTECTION MANAGER
 *
 * PURPOSE
 * -------
 * Converts an approved directional crypto trade into a
 * bounded futures risk plan.
 *
 * THIS MODULE:
 * - does NOT place orders
 * - does NOT modify orders
 * - does NOT close positions
 * - does NOT communicate with an exchange
 *
 * It only calculates risk instructions.
 */

const finite = (value) => {
  const n = Number(value);

  return Number.isFinite(n)
    ? n
    : null;
};

const clamp = (
  value,
  minimum = 0,
  maximum = 1,
) =>
  Math.min(
    maximum,
    Math.max(
      minimum,
      Number(value) || 0,
    ),
  );

const round = (
  value,
  digits = 6,
) => {
  if (!Number.isFinite(Number(value))) {
    return null;
  }

  const multiplier =
    10 ** digits;

  return (
    Math.round(
      Number(value) *
        multiplier,
    ) / multiplier
  );
};

const normalizeDirection = (
  value,
) => {
  const direction =
    String(
      value ?? "",
    )
      .trim()
      .toUpperCase();

  if (
    direction === "LONG" ||
    direction === "SHORT"
  ) {
    return direction;
  }

  return null;
};

export const CRYPTO_RISK_STATE =
  Object.freeze({
    NORMAL:
      "NORMAL",

    REDUCED:
      "REDUCED",

    DEFENSIVE:
      "DEFENSIVE",

    PROFIT_PROTECTION:
      "PROFIT_PROTECTION",

    EXIT_REQUIRED:
      "EXIT_REQUIRED",

    EMERGENCY:
      "EMERGENCY",
  });

export const DEFAULT_CRYPTO_FUTURES_RISK_POLICY =
  Object.freeze({
    /**
     * ACCOUNT RISK
     *
     * These are risk ceilings, not
     * guaranteed position sizes.
     */

    normalAccountRiskPercent:
      0.75,

    reducedAccountRiskPercent:
      0.5,

    defensiveAccountRiskPercent:
      0.25,

    maximumAccountRiskPercent:
      1.0,

    /**
     * LEVERAGE
     */

    defaultLeverage:
      2,

    maximumLeverage:
      5,

    extremeVolatilityMaximumLeverage:
      2,

    /**
     * STOP DISTANCE
     */

    minimumStopPercent:
      0.6,

    preferredStopPercent:
      1.5,

    maximumStopPercent:
      4.0,

    /**
     * VOLATILITY STOP MULTIPLIERS
     */

    normalVolatilityMultiplier:
      1,

    highVolatilityMultiplier:
      1.35,

    extremeVolatilityMultiplier:
      1.7,

    /**
     * TARGETS
     *
     * Expressed as multiples of initial
     * risk distance.
     */

    target1R:
      1.5,

    target2R:
      2.5,

    target3R:
      4,

    /**
     * PROFIT MANAGEMENT
     */

    breakevenTriggerR:
      1,

    trailingTriggerR:
      1.5,

    aggressiveTrailingTriggerR:
      2.5,

    normalTrailingDistanceR:
      1,

    aggressiveTrailingDistanceR:
      0.65,

    /**
     * LIQUIDATION PROTECTION
     */

    minimumLiquidationBufferPercent:
      8,

    preferredLiquidationBufferPercent:
      15,

    /**
     * EXPOSURE
     */

    maximumNotionalToEquity:
      2.5,

    /**
     * ENTRY PLAN EVIDENCE
     *
     * New futures entries must be based on real stop evidence.
     * We do not manufacture a preferred stop when ATR/structure is absent.
     */
    requireApprovedEntryQualification:
      true,

    requireStopEvidence:
      true,

    /**
     * Liquidation price may be unavailable before an order exists.
     * When supplied, it is validated strictly below.
     */
    requireKnownLiquidationPrice:
      false,
  });

function getVolatilityState(
  context,
) {
  const raw =
    String(
      context?.volatilityState ??
      context?.marketRegime
        ?.volatility ??
      "NORMAL",
    )
      .trim()
      .toUpperCase();

  if (
    raw === "EXTREME"
  ) {
    return "EXTREME";
  }

  if (
    raw === "HIGH"
  ) {
    return "HIGH";
  }

  return "NORMAL";
}

function determineRiskState({
  entryQualification,
  liveMonitor,
  volatilityState,
}) {
  const action =
    String(
      liveMonitor?.action ??
      "",
    ).toUpperCase();

  if (
    action ===
      "EMERGENCY_EXIT"
  ) {
    return CRYPTO_RISK_STATE
      .EMERGENCY;
  }

  if (
    action === "EXIT"
  ) {
    return CRYPTO_RISK_STATE
      .EXIT_REQUIRED;
  }

  if (
    action ===
      "TRAIL_PROFIT" ||
    action ===
      "MOVE_STOP_TO_BREAKEVEN"
  ) {
    return CRYPTO_RISK_STATE
      .PROFIT_PROTECTION;
  }

  if (
    action ===
      "REDUCE_EXPOSURE" ||
    volatilityState ===
      "EXTREME"
  ) {
    return CRYPTO_RISK_STATE
      .DEFENSIVE;
  }

  if (
    entryQualification
      ?.state ===
      "ENTRY_ALLOWED_REDUCED" ||
    volatilityState ===
      "HIGH"
  ) {
    return CRYPTO_RISK_STATE
      .REDUCED;
  }

  return CRYPTO_RISK_STATE
    .NORMAL;
}

function riskPercentForState(
  state,
  policy,
) {
  switch (state) {
    case CRYPTO_RISK_STATE
      .REDUCED:
      return policy
        .reducedAccountRiskPercent;

    case CRYPTO_RISK_STATE
      .DEFENSIVE:
      return policy
        .defensiveAccountRiskPercent;

    case CRYPTO_RISK_STATE
      .EXIT_REQUIRED:

    case CRYPTO_RISK_STATE
      .EMERGENCY:
      return 0;

    default:
      return policy
        .normalAccountRiskPercent;
  }
}

function volatilityMultiplier(
  volatilityState,
  policy,
) {
  if (
    volatilityState ===
      "EXTREME"
  ) {
    return policy
      .extremeVolatilityMultiplier;
  }

  if (
    volatilityState ===
      "HIGH"
  ) {
    return policy
      .highVolatilityMultiplier;
  }

  return policy
    .normalVolatilityMultiplier;
}

function calculateStopDistance({
  entryPrice,
  atr,
  atrPercent,
  structuralStopPrice,
  direction,
  volatilityState,
  policy,
}) {
  let stopPercent = null;

  const atrValue =
    finite(atr);

  const atrPct =
    finite(atrPercent);

  if (
    atrPct !== null &&
    atrPct > 0
  ) {
    stopPercent =
      atrPct *
      volatilityMultiplier(
        volatilityState,
        policy,
      );
  } else if (
    atrValue !== null &&
    atrValue > 0 &&
    entryPrice > 0
  ) {
    stopPercent =
      (
        atrValue /
        entryPrice
      ) *
      100 *
      volatilityMultiplier(
        volatilityState,
        policy,
      );
  }

  /**
   * Do not manufacture a stop when volatility evidence is absent.
   * Structural invalidation below may still provide a real stop.
   */

  /**
   * Structural invalidation may require
   * a wider stop.
   */

  const structural =
    finite(
      structuralStopPrice,
    );

  if (
    structural !== null &&
    structural > 0
  ) {
    const structuralDistance =
      Math.abs(
        structural -
          entryPrice,
      ) /
      entryPrice *
      100;

    if (
      stopPercent === null ||
      structuralDistance >
        stopPercent
    ) {
      stopPercent =
        structuralDistance;
    }
  }

  if (
    stopPercent === null ||
    stopPercent <= 0
  ) {
    return {
      available:
        false,

      source:
        "NONE",

      stopPercent:
        null,

      stopDistance:
        null,

      stopPrice:
        null,
    };
  }

  stopPercent =
    clamp(
      stopPercent,
      policy.minimumStopPercent,
      policy.maximumStopPercent,
    );

  const distance =
    entryPrice *
    (
      stopPercent /
      100
    );

  const stopPrice =
    direction === "LONG"
      ? entryPrice -
        distance
      : entryPrice +
        distance;

  return {
    available:
      true,

    source:
      structural !== null &&
      structural > 0
        ? (
            atrPct !== null &&
            atrPct > 0
          ) ||
          (
            atrValue !== null &&
            atrValue > 0
          )
          ? "ATR_AND_STRUCTURE"
          : "STRUCTURE"
        : "ATR",

    stopPercent:
      round(
        stopPercent,
        4,
      ),

    stopDistance:
      round(
        distance,
      ),

    stopPrice:
      round(
        stopPrice,
      ),
  };
}

function calculateTargets({
  entryPrice,
  stopDistance,
  direction,
  policy,
}) {
  const sign =
    direction === "LONG"
      ? 1
      : -1;

  return {
    target1:
      round(
        entryPrice +
          sign *
            stopDistance *
            policy.target1R,
      ),

    target2:
      round(
        entryPrice +
          sign *
            stopDistance *
            policy.target2R,
      ),

    target3:
      round(
        entryPrice +
          sign *
            stopDistance *
            policy.target3R,
      ),

    target1R:
      policy.target1R,

    target2R:
      policy.target2R,

    target3R:
      policy.target3R,
  };
}

function calculateLeverage({
  volatilityState,
  riskState,
  requestedLeverage,
  policy,
}) {
  if (
    riskState ===
      CRYPTO_RISK_STATE
        .EXIT_REQUIRED ||
    riskState ===
      CRYPTO_RISK_STATE
        .EMERGENCY
  ) {
    return 0;
  }

  let maximum =
    policy.maximumLeverage;

  if (
    volatilityState ===
      "EXTREME"
  ) {
    maximum =
      Math.min(
        maximum,
        policy
          .extremeVolatilityMaximumLeverage,
      );
  }

  if (
    riskState ===
      CRYPTO_RISK_STATE
        .DEFENSIVE
  ) {
    maximum =
      Math.min(
        maximum,
        2,
      );
  }

  const requested =
    finite(
      requestedLeverage,
    );

  const leverage =
    requested !== null
      ? clamp(
          requested,
          1,
          maximum,
        )
      : Math.min(
          policy.defaultLeverage,
          maximum,
        );

  return round(
    leverage,
    2,
  );
}

function calculatePositionSize({
  accountEquity,
  riskPercent,
  stopPercent,
  exposureMultiplier,
  leverage,
  policy,
}) {
  if (
    accountEquity <= 0 ||
    riskPercent <= 0 ||
    stopPercent <= 0 ||
    leverage <= 0
  ) {
    return {
      riskBudgetUsd:
        0,

      rawNotionalUsd:
        0,

      maximumNotionalUsd:
        0,

      positionSizeUsd:
        0,
    };
  }

  const riskBudgetUsd =
    accountEquity *
    (
      riskPercent /
      100
    ) *
    exposureMultiplier;

  /**
   * If stop = 2%, and risk budget = $100,
   * maximum notional before other caps:
   *
   * 100 / 0.02 = $5,000
   */

  const rawNotionalUsd =
    riskBudgetUsd /
    (
      stopPercent /
      100
    );

  /**
   * Leverage is treated as a ceiling on
   * allowed notional relative to equity,
   * not as a reason to increase risk.
   */

  const leverageCap =
    accountEquity *
    leverage;

  const portfolioCap =
    accountEquity *
    policy
      .maximumNotionalToEquity;

  const maximumNotionalUsd =
    Math.min(
      leverageCap,
      portfolioCap,
    );

  const positionSizeUsd =
    Math.min(
      rawNotionalUsd,
      maximumNotionalUsd,
    );

  return {
    riskBudgetUsd:
      round(
        riskBudgetUsd,
        2,
      ),

    rawNotionalUsd:
      round(
        rawNotionalUsd,
        2,
      ),

    maximumNotionalUsd:
      round(
        maximumNotionalUsd,
        2,
      ),

    positionSizeUsd:
      round(
        positionSizeUsd,
        2,
      ),
  };
}

function calculateLiquidationProtection({
  direction,
  entryPrice,
  liquidationPrice,
  policy,
}) {
  const liquidation =
    finite(
      liquidationPrice,
    );

  if (
    liquidation === null ||
    liquidation <= 0
  ) {
    return {
      known:
        false,

      bufferPercent:
        null,

      safe:
        null,

      preferred:
        null,
    };
  }

  let bufferPercent;

  if (
    direction === "LONG"
  ) {
    bufferPercent =
      (
        entryPrice -
        liquidation
      ) /
      entryPrice *
      100;
  } else {
    bufferPercent =
      (
        liquidation -
        entryPrice
      ) /
      entryPrice *
      100;
  }

  return {
    known:
      true,

    bufferPercent:
      round(
        bufferPercent,
        4,
      ),

    safe:
      bufferPercent >=
      policy
        .minimumLiquidationBufferPercent,

    preferred:
      bufferPercent >=
      policy
        .preferredLiquidationBufferPercent,
  };
}

function determineTrailingPlan({
  unrealizedR,
  riskState,
  policy,
}) {
  const r =
    finite(
      unrealizedR,
    ) ?? 0;

  const breakevenEligible =
    r >=
    policy
      .breakevenTriggerR;

  const trailingEligible =
    r >=
    policy
      .trailingTriggerR;

  const aggressive =
    r >=
      policy
        .aggressiveTrailingTriggerR ||
    riskState ===
      CRYPTO_RISK_STATE
        .PROFIT_PROTECTION;

  return {
    breakevenEligible,

    trailingEligible,

    trailingMode:
      !trailingEligible
        ? "NONE"
        : aggressive
          ? "AGGRESSIVE"
          : "NORMAL",

    trailingDistanceR:
      !trailingEligible
        ? null
        : aggressive
          ? policy
              .aggressiveTrailingDistanceR
          : policy
              .normalTrailingDistanceR,
  };
}

/**
 * ==========================================================
 * MAIN RISK MANAGER
 * ==========================================================
 */

export function buildCryptoFuturesRiskPlan(
  context = {},
  policyOverrides = {},
) {
  const policy = {
    ...DEFAULT_CRYPTO_FUTURES_RISK_POLICY,
    ...policyOverrides,
  };

  const direction =
    normalizeDirection(
      context.direction ??
      context
        ?.entryQualification
        ?.direction,
    );

  const entryPrice =
    finite(
      context.entryPrice,
    );

  const accountEquity =
    finite(
      context.accountEquity,
    );

  const inputBlockers = [];

  if (!direction) {
    inputBlockers.push(
      "DIRECTION_REQUIRED",
    );
  }

  if (
    entryPrice === null ||
    entryPrice <= 0
  ) {
    inputBlockers.push(
      "ENTRY_PRICE_REQUIRED",
    );
  }

  if (
    accountEquity === null ||
    accountEquity <= 0
  ) {
    inputBlockers.push(
      "ACCOUNT_EQUITY_REQUIRED",
    );
  }

  if (
    policy.requireApprovedEntryQualification === true &&
    context?.entryQualification?.approved !== true &&
    !context?.liveMonitor
  ) {
    inputBlockers.push(
      "APPROVED_ENTRY_QUALIFICATION_REQUIRED",
    );
  }

  if (inputBlockers.length > 0) {
    return {
      approved:
        false,

      status:
        "INSUFFICIENT_DATA",

      direction:
        direction ??
        "NEUTRAL",

      canExecute:
        false,

      blockers:
        inputBlockers,

      warnings:
        [],

      noExecutionAuthority:
        true,

      liveExecution:
        false,
    };
  }

  const volatilityState =
    getVolatilityState(
      context,
    );

  const riskState =
    determineRiskState({
      entryQualification:
        context
          .entryQualification,

      liveMonitor:
        context.liveMonitor,

      volatilityState,
    });

  let exposureMultiplier =
    finite(
      context
        ?.liveMonitor
        ?.exposureMultiplier ??
      context
        ?.entryQualification
        ?.exposureMultiplier ??
      1,
    );

  exposureMultiplier =
    clamp(
      exposureMultiplier,
      0,
      1,
    );

  if (
    riskState ===
      CRYPTO_RISK_STATE
        .EXIT_REQUIRED ||
    riskState ===
      CRYPTO_RISK_STATE
        .EMERGENCY
  ) {
    exposureMultiplier =
      0;
  }

  const riskPercent =
    Math.min(
      riskPercentForState(
        riskState,
        policy,
      ),
      policy
        .maximumAccountRiskPercent,
    );

  const stop =
    calculateStopDistance({
      entryPrice,

      atr:
        context.atr,

      atrPercent:
        context.atrPercent,

      structuralStopPrice:
        context
          .structuralStopPrice,

      direction,

      volatilityState,

      policy,
    });

  if (
    policy.requireStopEvidence === true &&
    stop?.available !== true
  ) {
    return {
      approved:
        false,

      status:
        "INSUFFICIENT_DATA",

      riskState,

      direction,

      entryPrice:
        round(
          entryPrice,
        ),

      accountEquity:
        round(
          accountEquity,
          2,
        ),

      canExecute:
        false,

      blockers: [
        "STOP_EVIDENCE_REQUIRED",
      ],

      warnings:
        [],

      evidence: {
        atr:
          finite(context.atr),

        atrPercent:
          finite(context.atrPercent),

        structuralStopPrice:
          finite(
            context.structuralStopPrice,
          ),

        stopSource:
          stop?.source ??
          "NONE",
      },

      noExecutionAuthority:
        true,

      liveExecution:
        false,
    };
  }

  const leverage =
    calculateLeverage({
      volatilityState,

      riskState,

      requestedLeverage:
        context
          .requestedLeverage,

      policy,
    });

  const sizing =
    calculatePositionSize({
      accountEquity,

      riskPercent,

      stopPercent:
        stop.stopPercent,

      exposureMultiplier,

      leverage,

      policy,
    });

  const targets =
    calculateTargets({
      entryPrice,

      stopDistance:
        stop.stopDistance,

      direction,

      policy,
    });

  const liquidation =
    calculateLiquidationProtection({
      direction,

      entryPrice,

      liquidationPrice:
        context
          .liquidationPrice,

      policy,
    });

  const trailing =
    determineTrailingPlan({
      unrealizedR:
        context.unrealizedR,

      riskState,

      policy,
    });

  const blockers = [];
  const warnings = [];

  if (
    riskState ===
      CRYPTO_RISK_STATE
        .EXIT_REQUIRED
  ) {
    blockers.push(
      "LIVE_THESIS_REQUIRES_EXIT",
    );
  }

  if (
    riskState ===
      CRYPTO_RISK_STATE
        .EMERGENCY
  ) {
    blockers.push(
      "EMERGENCY_RISK_STATE",
    );
  }

  if (
    policy.requireKnownLiquidationPrice === true &&
    liquidation.known !== true
  ) {
    blockers.push(
      "LIQUIDATION_PRICE_EVIDENCE_REQUIRED",
    );
  }

  if (
    liquidation.known &&
    liquidation.safe ===
      false
  ) {
    blockers.push(
      "LIQUIDATION_BUFFER_TOO_SMALL",
    );
  }

  if (
    liquidation.known &&
    liquidation.safe &&
    !liquidation.preferred
  ) {
    warnings.push(
      "LIQUIDATION_BUFFER_BELOW_PREFERRED",
    );
  }

  if (
    stop.stopPercent >=
    policy
      .maximumStopPercent
  ) {
    warnings.push(
      "STOP_DISTANCE_AT_POLICY_MAXIMUM",
    );
  }

  if (
    volatilityState ===
      "EXTREME"
  ) {
    warnings.push(
      "EXTREME_VOLATILITY",
    );
  }

  if (
    !Number.isFinite(
      Number(
        sizing.positionSizeUsd,
      ),
    ) ||
    sizing.positionSizeUsd <= 0
  ) {
    blockers.push(
      "POSITION_SIZE_NOT_EXECUTABLE",
    );
  }

  const approved =
    blockers.length === 0 &&
    sizing.positionSizeUsd > 0;

  return {
    approved,

    status:
      approved
        ? "RISK_PLAN_READY"
        : "RISK_PLAN_BLOCKED",

    riskState,

    direction,

    entryPrice:
      round(
        entryPrice,
      ),

    volatilityState,

    accountEquity:
      round(
        accountEquity,
        2,
      ),

    accountRiskPercent:
      round(
        riskPercent,
        4,
      ),

    exposureMultiplier:
      round(
        exposureMultiplier,
        4,
      ),

    leverage: {
      recommended:
        leverage,

      maximum:
        volatilityState ===
          "EXTREME"
          ? Math.min(
              policy.maximumLeverage,
              policy
                .extremeVolatilityMaximumLeverage,
            )
          : policy
              .maximumLeverage,
    },

    stop: {
      initialStopPrice:
        stop.stopPrice,

      currentStopPrice:
        stop.stopPrice,

      stopDistance:
        stop.stopDistance,

      stopDistancePercent:
        stop.stopPercent,

      structuralStopPrice:
        finite(
          context
            .structuralStopPrice,
        ),
    },

    targets,

    sizing,

    liquidation,

    trailing,

    riskReward: {
      target1:
        policy.target1R,

      target2:
        policy.target2R,

      target3:
        policy.target3R,
    },

    warnings,

    blockers,

    evidence: {
      stopEvidenceAvailable:
        stop?.available === true,

      stopSource:
        stop?.source ??
        "NONE",

      atr:
        finite(
          context.atr,
        ),

      atrPercent:
        finite(
          context.atrPercent,
        ),

      structuralStopPrice:
        finite(
          context.structuralStopPrice,
        ),

      liquidationPriceKnown:
        liquidation?.known === true,

      entryQualificationApproved:
        context
          ?.entryQualification
          ?.approved === true,

      failClosed:
        true,

      syntheticStopFallback:
        false,
    },

    noExecutionAuthority:
      true,

    liveExecution:
      false,

    /**
     * Architectural invariant.
     *
     * Risk manager calculates instructions.
     * Execution belongs elsewhere.
     */
    canExecute:
      false,

    generatedAt:
      new Date()
        .toISOString(),
  };
}

export default
  buildCryptoFuturesRiskPlan;