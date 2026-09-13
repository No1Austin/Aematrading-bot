import {
  buildCryptoDirectionalResult,
  buildInsufficientDirectionalResult,
  CRYPTO_ENGINE_ROLE,
  CRYPTO_TIME_HORIZON,
} from "../contracts/cryptoDirectionalEngineContract.js";

const finite = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const clamp = (value, min = 0, max = 100) =>
  Math.min(max, Math.max(min, Number(value) || 0));

const round = (value, places = 2) => {
  const n = Number(value);

  if (!Number.isFinite(n)) {
    return 0;
  }

  const factor = 10 ** places;
  return Math.round(n * factor) / factor;
};

function normalizeSignedPercent(
  value,
  strong = 20,
) {
  const n = finite(value);

  if (n === null) {
    return null;
  }

  const magnitude =
    clamp(
      Math.abs(n) /
        strong *
        100,
    );

  return {
    direction:
      n > 0
        ? "UP"
        : n < 0
          ? "DOWN"
          : "FLAT",

    magnitude,
    value: n,
  };
}

function normalizeRatio(
  value,
  neutral = 1,
  strongDeviation = 0.5,
) {
  const n = finite(value);

  if (n === null) {
    return null;
  }

  const deviation =
    n - neutral;

  const magnitude =
    clamp(
      Math.abs(deviation) /
        strongDeviation *
        100,
    );

  return {
    direction:
      deviation > 0
        ? "UP"
        : deviation < 0
          ? "DOWN"
          : "FLAT",

    magnitude,
    value: n,
  };
}

/**
 * ============================================================
 * AEMA CRYPTO TRADING ON-CHAIN FLOW ENGINE
 * ============================================================
 *
 * PURPOSE
 *
 * Convert on-chain behavior into directional trading evidence.
 *
 * This engine reasons about FLOW, not project quality.
 *
 * Bullish examples:
 *
 * - exchange outflows
 * - whale accumulation
 * - active address growth
 * - transaction growth
 * - TVL growth
 * - staking inflows
 * - bridge inflows
 *
 * Bearish examples:
 *
 * - exchange inflows
 * - whale distribution
 * - falling activity
 * - TVL contraction
 * - staking withdrawals
 * - bridge outflows
 *
 * IMPORTANT
 *
 * High activity by itself is not bullish.
 * Direction matters.
 *
 * Missing data must not automatically reject a candidate.
 */

export default async function runCryptoTradingOnChainFlowEngine(
  candidate,
) {
  const m =
    candidate?.measurements ??
    {};

  const x =
    m?.onChain ??
    m?.onChainFlow ??
    {};

  const exchangeNetflowUsd =
    finite(
      x?.exchangeNetflowUsd ??
      x?.exchangeNetFlowUsd,
    );

  const exchangeNetflowPercent =
    finite(
      x?.exchangeNetflowPercent ??
      x?.exchangeNetFlowPercent,
    );

  const whaleNetflowUsd =
    finite(
      x?.whaleNetflowUsd ??
      x?.whaleNetFlowUsd,
    );

  const whaleAccumulationScore =
    finite(
      x?.whaleAccumulationScore,
    );

  const activeAddressesChange =
    finite(
      x?.activeAddressesChangePercent,
    );

  const transactionCountChange =
    finite(
      x?.transactionCountChangePercent,
    );

  const tvlChange =
    finite(
      x?.tvlChangePercent ??
      x?.tvlChange24hPercent,
    );

  const stakingNetflow =
    finite(
      x?.stakingNetflowUsd ??
      x?.stakingNetFlowUsd,
    );

  const stakingChangePercent =
    finite(
      x?.stakingChangePercent,
    );

  const bridgeNetflowUsd =
    finite(
      x?.bridgeNetflowUsd ??
      x?.bridgeNetFlowUsd,
    );

  const holderGrowthPercent =
    finite(
      x?.holderGrowthPercent,
    );

  const stablecoinFlowScore =
    finite(
      x?.stablecoinFlowScore,
    );

  const exchangeReserveChangePercent =
    finite(
      x?.exchangeReserveChangePercent,
    );

  const evidenceValues = [
    exchangeNetflowUsd,
    exchangeNetflowPercent,
    whaleNetflowUsd,
    whaleAccumulationScore,
    activeAddressesChange,
    transactionCountChange,
    tvlChange,
    stakingNetflow,
    stakingChangePercent,
    bridgeNetflowUsd,
    holderGrowthPercent,
    stablecoinFlowScore,
    exchangeReserveChangePercent,
  ];

  const available =
    evidenceValues.filter(
      (value) =>
        value !== null,
    ).length;

  if (available < 2) {
    return buildInsufficientDirectionalResult({
      engine:
        "CRYPTO_TRADING_ON_CHAIN_FLOW",

      role:
        CRYPTO_ENGINE_ROLE.DIRECTIONAL,

      horizon:
        CRYPTO_TIME_HORIZON.SWING,

      reasons: [
        "INSUFFICIENT_ON_CHAIN_FLOW_DATA",
      ],

      evidence: {
        availableSignals:
          available,
      },
    });
  }

  let longSupport = 0;
  let shortSupport = 0;

  const reasons = [];
  const risks = [];

  let usedWeight = 0;

  /**
   * ----------------------------------------------------------
   * EXCHANGE NETFLOW
   * ----------------------------------------------------------
   *
   * Positive exchange inflow:
   * more tokens moving onto exchanges -> potential sell pressure.
   *
   * Negative netflow:
   * tokens leaving exchanges -> potential accumulation.
   */

  if (
    exchangeNetflowPercent !==
    null
  ) {
    const signal =
      normalizeSignedPercent(
        exchangeNetflowPercent,
        15,
      );

    if (
      signal.direction ===
      "UP"
    ) {
      shortSupport +=
        signal.magnitude *
        0.18;

      reasons.push(
        "EXCHANGE_INFLOW_SUPPORTS_SHORT",
      );
    }

    if (
      signal.direction ===
      "DOWN"
    ) {
      longSupport +=
        signal.magnitude *
        0.18;

      reasons.push(
        "EXCHANGE_OUTFLOW_SUPPORTS_LONG",
      );
    }

    usedWeight +=
      0.18;
  } else if (
    exchangeNetflowUsd !==
    null
  ) {
    const scaled =
      clamp(
        Math.log10(
          Math.abs(
            exchangeNetflowUsd,
          ) +
          1,
        ) /
          9 *
          100,
      );

    if (
      exchangeNetflowUsd >
      0
    ) {
      shortSupport +=
        scaled *
        0.18;

      reasons.push(
        "EXCHANGE_INFLOW_SUPPORTS_SHORT",
      );
    }

    if (
      exchangeNetflowUsd <
      0
    ) {
      longSupport +=
        scaled *
        0.18;

      reasons.push(
        "EXCHANGE_OUTFLOW_SUPPORTS_LONG",
      );
    }

    usedWeight +=
      0.18;
  }

  /**
   * ----------------------------------------------------------
   * EXCHANGE RESERVE CHANGE
   * ----------------------------------------------------------
   */

  if (
    exchangeReserveChangePercent !==
    null
  ) {
    const signal =
      normalizeSignedPercent(
        exchangeReserveChangePercent,
        10,
      );

    if (
      signal.direction ===
      "UP"
    ) {
      shortSupport +=
        signal.magnitude *
        0.10;

      reasons.push(
        "RISING_EXCHANGE_RESERVES",
      );
    }

    if (
      signal.direction ===
      "DOWN"
    ) {
      longSupport +=
        signal.magnitude *
        0.10;

      reasons.push(
        "FALLING_EXCHANGE_RESERVES",
      );
    }

    usedWeight +=
      0.10;
  }

  /**
   * ----------------------------------------------------------
   * WHALE FLOW
   * ----------------------------------------------------------
   */

  if (
    whaleAccumulationScore !==
    null
  ) {
    const score =
      clamp(
        whaleAccumulationScore,
      );

    if (
      score >=
      55
    ) {
      longSupport +=
        score *
        0.16;

      reasons.push(
        "WHALE_ACCUMULATION",
      );
    } else if (
      score <=
      45
    ) {
      shortSupport +=
        (
          100 -
          score
        ) *
        0.16;

      reasons.push(
        "WHALE_DISTRIBUTION",
      );
    }

    usedWeight +=
      0.16;
  } else if (
    whaleNetflowUsd !==
    null
  ) {
    const scaled =
      clamp(
        Math.log10(
          Math.abs(
            whaleNetflowUsd,
          ) +
          1,
        ) /
          9 *
          100,
      );

    if (
      whaleNetflowUsd >
      0
    ) {
      longSupport +=
        scaled *
        0.16;

      reasons.push(
        "WHALE_ACCUMULATION",
      );
    }

    if (
      whaleNetflowUsd <
      0
    ) {
      shortSupport +=
        scaled *
        0.16;

      reasons.push(
        "WHALE_DISTRIBUTION",
      );
    }

    usedWeight +=
      0.16;
  }

  /**
   * ----------------------------------------------------------
   * ACTIVE ADDRESSES
   * ----------------------------------------------------------
   */

  if (
    activeAddressesChange !==
    null
  ) {
    const signal =
      normalizeSignedPercent(
        activeAddressesChange,
        25,
      );

    if (
      signal.direction ===
      "UP"
    ) {
      longSupport +=
        signal.magnitude *
        0.12;

      reasons.push(
        "ACTIVE_ADDRESS_GROWTH",
      );
    }

    if (
      signal.direction ===
      "DOWN"
    ) {
      shortSupport +=
        signal.magnitude *
        0.12;

      reasons.push(
        "ACTIVE_ADDRESS_DECLINE",
      );
    }

    usedWeight +=
      0.12;
  }

  /**
   * ----------------------------------------------------------
   * TRANSACTION ACTIVITY
   * ----------------------------------------------------------
   */

  if (
    transactionCountChange !==
    null
  ) {
    const signal =
      normalizeSignedPercent(
        transactionCountChange,
        30,
      );

    if (
      signal.direction ===
      "UP"
    ) {
      longSupport +=
        signal.magnitude *
        0.10;

      reasons.push(
        "TRANSACTION_ACTIVITY_GROWTH",
      );
    }

    if (
      signal.direction ===
      "DOWN"
    ) {
      shortSupport +=
        signal.magnitude *
        0.10;

      reasons.push(
        "TRANSACTION_ACTIVITY_DECLINE",
      );
    }

    usedWeight +=
      0.10;
  }

  /**
   * ----------------------------------------------------------
   * TVL
   * ----------------------------------------------------------
   */

  if (
    tvlChange !==
    null
  ) {
    const signal =
      normalizeSignedPercent(
        tvlChange,
        20,
      );

    if (
      signal.direction ===
      "UP"
    ) {
      longSupport +=
        signal.magnitude *
        0.12;

      reasons.push(
        "TVL_EXPANSION",
      );
    }

    if (
      signal.direction ===
      "DOWN"
    ) {
      shortSupport +=
        signal.magnitude *
        0.12;

      reasons.push(
        "TVL_CONTRACTION",
      );
    }

    usedWeight +=
      0.12;
  }

  /**
   * ----------------------------------------------------------
   * STAKING FLOW
   * ----------------------------------------------------------
   */

  if (
    stakingChangePercent !==
    null
  ) {
    const signal =
      normalizeSignedPercent(
        stakingChangePercent,
        15,
      );

    if (
      signal.direction ===
      "UP"
    ) {
      longSupport +=
        signal.magnitude *
        0.08;

      reasons.push(
        "STAKING_GROWTH",
      );
    }

    if (
      signal.direction ===
      "DOWN"
    ) {
      shortSupport +=
        signal.magnitude *
        0.08;

      reasons.push(
        "STAKING_WITHDRAWALS",
      );
    }

    usedWeight +=
      0.08;
  } else if (
    stakingNetflow !==
    null
  ) {
    const scaled =
      clamp(
        Math.log10(
          Math.abs(
            stakingNetflow,
          ) +
          1,
        ) /
          9 *
          100,
      );

    if (
      stakingNetflow >
      0
    ) {
      longSupport +=
        scaled *
        0.08;

      reasons.push(
        "STAKING_INFLOW",
      );
    }

    if (
      stakingNetflow <
      0
    ) {
      shortSupport +=
        scaled *
        0.08;

      reasons.push(
        "STAKING_OUTFLOW",
      );
    }

    usedWeight +=
      0.08;
  }

  /**
   * ----------------------------------------------------------
   * BRIDGE FLOW
   * ----------------------------------------------------------
   */

  if (
    bridgeNetflowUsd !==
    null
  ) {
    const scaled =
      clamp(
        Math.log10(
          Math.abs(
            bridgeNetflowUsd,
          ) +
          1,
        ) /
          9 *
          100,
      );

    if (
      bridgeNetflowUsd >
      0
    ) {
      longSupport +=
        scaled *
        0.06;

      reasons.push(
        "BRIDGE_CAPITAL_INFLOW",
      );
    }

    if (
      bridgeNetflowUsd <
      0
    ) {
      shortSupport +=
        scaled *
        0.06;

      reasons.push(
        "BRIDGE_CAPITAL_OUTFLOW",
      );
    }

    usedWeight +=
      0.06;
  }

  /**
   * ----------------------------------------------------------
   * HOLDER GROWTH
   * ----------------------------------------------------------
   */

  if (
    holderGrowthPercent !==
    null
  ) {
    const signal =
      normalizeSignedPercent(
        holderGrowthPercent,
        10,
      );

    if (
      signal.direction ===
      "UP"
    ) {
      longSupport +=
        signal.magnitude *
        0.05;

      reasons.push(
        "HOLDER_BASE_EXPANDING",
      );
    }

    if (
      signal.direction ===
      "DOWN"
    ) {
      shortSupport +=
        signal.magnitude *
        0.05;

      reasons.push(
        "HOLDER_BASE_CONTRACTING",
      );
    }

    usedWeight +=
      0.05;
  }

  /**
   * ----------------------------------------------------------
   * STABLECOIN FLOW SCORE
   * ----------------------------------------------------------
   *
   * Expected scale:
   * 0 = strongly bearish liquidity flow
   * 50 = neutral
   * 100 = strongly bullish
   */

  if (
    stablecoinFlowScore !==
    null
  ) {
    const score =
      clamp(
        stablecoinFlowScore,
      );

    if (
      score >
      55
    ) {
      longSupport +=
        (
          score -
          50
        ) *
        2 *
        0.08;

      reasons.push(
        "POSITIVE_STABLECOIN_LIQUIDITY_FLOW",
      );
    }

    if (
      score <
      45
    ) {
      shortSupport +=
        (
          50 -
          score
        ) *
        2 *
        0.08;

      reasons.push(
        "NEGATIVE_STABLECOIN_LIQUIDITY_FLOW",
      );
    }

    usedWeight +=
      0.08;
  }

  /**
   * ----------------------------------------------------------
   * NORMALIZE AVAILABLE SIGNALS
   * ----------------------------------------------------------
   *
   * Missing fields should not automatically make this engine weak.
   */

  if (
    usedWeight >
    0
  ) {
    longSupport =
      longSupport /
      usedWeight;

    shortSupport =
      shortSupport /
      usedWeight;
  }

  longSupport =
    clamp(
      longSupport,
    );

  shortSupport =
    clamp(
      shortSupport,
    );

  /**
   * ----------------------------------------------------------
   * CROSS-SIGNAL REASONING
   * ----------------------------------------------------------
   */

  const strongAccumulation =
    (
      whaleAccumulationScore !==
        null &&
      whaleAccumulationScore >=
        65
    ) ||
    (
      whaleNetflowUsd !==
        null &&
      whaleNetflowUsd >
        0
    );

  const exchangeOutflow =
    (
      exchangeNetflowPercent !==
        null &&
      exchangeNetflowPercent <
        0
    ) ||
    (
      exchangeNetflowUsd !==
        null &&
      exchangeNetflowUsd <
        0
    );

  const strongDistribution =
    (
      whaleAccumulationScore !==
        null &&
      whaleAccumulationScore <=
        35
    ) ||
    (
      whaleNetflowUsd !==
        null &&
      whaleNetflowUsd <
        0
    );

  const exchangeInflow =
    (
      exchangeNetflowPercent !==
        null &&
      exchangeNetflowPercent >
        0
    ) ||
    (
      exchangeNetflowUsd !==
        null &&
      exchangeNetflowUsd >
        0
    );

  if (
    strongAccumulation &&
    exchangeOutflow
  ) {
    longSupport +=
      10;

    reasons.push(
      "ACCUMULATION_AND_EXCHANGE_OUTFLOW_CONFIRM_LONG",
    );
  }

  if (
    strongDistribution &&
    exchangeInflow
  ) {
    shortSupport +=
      10;

    reasons.push(
      "DISTRIBUTION_AND_EXCHANGE_INFLOW_CONFIRM_SHORT",
    );
  }

  /**
   * Mixed signals should reduce confidence rather than force direction.
   */

  const positiveActivity =
    [
      activeAddressesChange,
      transactionCountChange,
      tvlChange,
      holderGrowthPercent,
    ]
      .filter(
        value =>
          value !==
            null,
      )
      .filter(
        value =>
          value >
          0,
      )
      .length;

  const negativeActivity =
    [
      activeAddressesChange,
      transactionCountChange,
      tvlChange,
      holderGrowthPercent,
    ]
      .filter(
        value =>
          value !==
            null,
      )
      .filter(
        value =>
          value <
          0,
      )
      .length;

  if (
    positiveActivity >
      0 &&
    negativeActivity >
      0
  ) {
    risks.push(
      "MIXED_ON_CHAIN_ACTIVITY",
    );
  }

  /**
   * ----------------------------------------------------------
   * EXTREME FLOW WARNINGS
   * ----------------------------------------------------------
   */

  if (
    exchangeNetflowPercent !==
      null &&
    exchangeNetflowPercent >
      25
  ) {
    risks.push(
      "EXTREME_EXCHANGE_INFLOW",
    );
  }

  if (
    exchangeNetflowPercent !==
      null &&
    exchangeNetflowPercent <
      -25
  ) {
    risks.push(
      "EXTREME_EXCHANGE_OUTFLOW",
    );
  }

  longSupport =
    clamp(
      longSupport,
    );

  shortSupport =
    clamp(
      shortSupport,
    );

  /**
   * ----------------------------------------------------------
   * CONFIDENCE
   * ----------------------------------------------------------
   */

  const coverage =
    Math.min(
      1,
      available / 8,
    );

  const separation =
    Math.abs(
      longSupport -
      shortSupport,
    );

  const conflictPenalty =
    risks.includes(
      "MIXED_ON_CHAIN_ACTIVITY",
    )
      ? 0.85
      : 1;

  const confidence =
    Math.min(
      1,
      Math.max(
        0,
        (
          coverage *
            0.45 +
          Math.min(
            1,
            separation /
              50,
          ) *
            0.35 +
          Math.min(
            1,
            usedWeight,
          ) *
            0.20
        ) *
          conflictPenalty,
      ),
    );

  const quality =
    clamp(
      coverage *
        55 +
      Math.min(
        1,
        usedWeight,
      ) *
        30 +
      Math.min(
        1,
        separation /
          50,
      ) *
        15,
    );

  return buildCryptoDirectionalResult({
    engine:
      "CRYPTO_TRADING_ON_CHAIN_FLOW",

    role:
      CRYPTO_ENGINE_ROLE
        .DIRECTIONAL,

    horizon:
      CRYPTO_TIME_HORIZON
        .SWING,

    longSupport,
    shortSupport,

    confidence,
    quality,

    reasons,
    risks,

    evidence: {
      exchangeNetflowUsd,
      exchangeNetflowPercent,
      exchangeReserveChangePercent,

      whaleNetflowUsd,
      whaleAccumulationScore,

      activeAddressesChangePercent:
        activeAddressesChange,

      transactionCountChangePercent:
        transactionCountChange,

      tvlChangePercent:
        tvlChange,

      stakingNetflowUsd:
        stakingNetflow,

      stakingChangePercent,

      bridgeNetflowUsd,

      holderGrowthPercent,

      stablecoinFlowScore,

      availableSignals:
        available,

      usedWeight:
        round(
          usedWeight,
          4,
        ),

      positiveActivitySignals:
        positiveActivity,

      negativeActivitySignals:
        negativeActivity,
    },
  });
}