// server/src/risk/liquidityStressEngine.js

/**
 * ============================================================
 * LIQUIDITY STRESS / SLIPPAGE RISK ENGINE
 * ============================================================
 *
 * PURPOSE
 * -------
 * Apply execution-safety constraints to a trade that has already
 * survived upstream risk layers.
 *
 * This engine is NOT a signal generator.
 *
 * It may:
 * - ALLOW the proposed share count,
 * - REDUCE the proposed share count,
 * - BLOCK execution.
 *
 * SAFETY CONTRACT
 * ---------------
 * - Never creates a trade.
 * - Never increases shares.
 * - Never interprets missing liquidity data as healthy liquidity.
 * - Deterministic for identical inputs.
 */

export const LIQUIDITY_STRESS_STATUS =
  Object.freeze({
    APPROVED: "APPROVED",
    REDUCED: "REDUCED",
    BLOCKED: "BLOCKED",
    INSUFFICIENT_DATA:
      "INSUFFICIENT_DATA",
    INVALID_INPUT:
      "INVALID_INPUT",
    ERROR: "ERROR",
  });

export const LIQUIDITY_STRESS_ACTION =
  Object.freeze({
    ALLOW: "ALLOW",
    REDUCE: "REDUCE",
    BLOCK: "BLOCK",
  });

export const DEFAULT_LIQUIDITY_STRESS_CONFIG =
  Object.freeze({
    /**
     * Bid/ask spread as percentage of mid price.
     */
    spreadReducePercent: 0.30,
    spreadSeverePercent: 0.60,
    spreadBlockPercent: 1.20,

    /**
     * Proposed shares / average daily volume.
     */
    participationReducePercent: 1,
    participationSeverePercent: 3,
    participationBlockPercent: 7.5,

    /**
     * Proposed position value / average daily dollar volume.
     */
    dollarParticipationReducePercent: 0.75,
    dollarParticipationSeverePercent: 2,
    dollarParticipationBlockPercent: 5,

    /**
     * Relative volume = current volume / average volume.
     */
    relativeVolumeReduceBelow: 0.50,
    relativeVolumeSevereBelow: 0.25,
    relativeVolumeBlockBelow: 0.10,

    /**
     * Estimated slippage percentage.
     */
    slippageReducePercent: 0.25,
    slippageSeverePercent: 0.60,
    slippageBlockPercent: 1.25,

    moderateMultiplier: 0.75,
    severeMultiplier: 0.50,
    minimumExposureMultiplier: 0.20,

    requireLiquidityEvidence: true,
  });

function finiteNumber(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const number =
    Number(value);

  return Number.isFinite(number)
    ? number
    : null;
}

function positiveNumber(value) {
  const number =
    finiteNumber(value);

  return (
    number !== null &&
    number > 0
  )
    ? number
    : null;
}

function nonNegativeNumber(value) {
  const number =
    finiteNumber(value);

  return (
    number !== null &&
    number >= 0
  )
    ? number
    : null;
}

function normalizeSide(value) {
  const side =
    String(value ?? "")
      .trim()
      .toUpperCase();

  return (
    side === "LONG" ||
    side === "SHORT"
  )
    ? side
    : null;
}

function clamp(
  value,
  minimum,
  maximum,
) {
  return Math.min(
    maximum,
    Math.max(
      minimum,
      value,
    ),
  );
}

function round(
  value,
  decimals = 6,
) {
  if (
    !Number.isFinite(value)
  ) {
    return null;
  }

  const factor =
    10 ** decimals;

  return (
    Math.round(
      value * factor,
    ) /
    factor
  );
}

function resolveConfig(
  config = {},
) {
  return {
    ...DEFAULT_LIQUIDITY_STRESS_CONFIG,

    ...(
      config &&
      typeof config === "object"
        ? config
        : {}
    ),
  };
}

function buildBlockedResult({
  status =
    LIQUIDITY_STRESS_STATUS
      .BLOCKED,
  reason,
  originalShares = 0,
  metrics = null,
  warnings = [],
  errors = [],
} = {}) {
  return {
    approved: false,

    engine:
      "LIQUIDITY_STRESS",

    status,

    action:
      LIQUIDITY_STRESS_ACTION
        .BLOCK,

    canExecute: false,

    exposureMultiplier: 0,

    originalShares,

    approvedShares: 0,

    metrics,

    reasons:
      reason
        ? [reason]
        : [],

    warnings,

    errors,
  };
}

/**
 * ============================================================
 * EVALUATE LIQUIDITY STRESS
 * ============================================================
 *
 * proposedTrade:
 * {
 *   symbol,
 *   side,
 *   shares,
 *   entryPrice
 * }
 *
 * liquidity:
 * {
 *   bid,
 *   ask,
 *   currentVolume,
 *   averageVolume,
 *   estimatedSlippagePercent
 * }
 */
export function evaluateLiquidityStress({
  proposedTrade = null,
  liquidity = null,
  config = {},
} = {}) {
  try {
    const cfg =
      resolveConfig(
        config,
      );

    const symbol =
      String(
        proposedTrade
          ?.symbol ??
        "",
      )
        .trim()
        .toUpperCase();

    const side =
      normalizeSide(
        proposedTrade
          ?.side,
      );

    const originalShares =
      positiveNumber(
        proposedTrade
          ?.shares,
      );

    const entryPrice =
      positiveNumber(
        proposedTrade
          ?.entryPrice ??
        proposedTrade
          ?.currentPrice,
      );

    if (
      !symbol ||
      !side ||
      originalShares === null ||
      entryPrice === null
    ) {
      return buildBlockedResult({
        status:
          LIQUIDITY_STRESS_STATUS
            .INVALID_INPUT,

        reason:
          "Valid proposed trade symbol, side, shares, and entry price are required.",

        originalShares:
          originalShares ?? 0,
      });
    }

    const input =
      (
        liquidity &&
        typeof liquidity ===
          "object"
      )
        ? liquidity
        : {};

    const bid =
      positiveNumber(
        input
          ?.bid,
      );

    const ask =
      positiveNumber(
        input
          ?.ask,
      );

    const currentVolume =
      nonNegativeNumber(
        input
          ?.currentVolume,
      );

    const averageVolume =
      positiveNumber(
        input
          ?.averageVolume,
      );

    const estimatedSlippagePercent =
      nonNegativeNumber(
        input
          ?.estimatedSlippagePercent ??
        input
          ?.slippagePercent,
      );

    let spreadPercent =
      null;

    if (
      bid !== null &&
      ask !== null &&
      ask >= bid
    ) {
      const mid =
        (
          bid +
          ask
        ) /
        2;

      spreadPercent =
        mid > 0
          ? (
              (
                ask -
                bid
              ) /
              mid
            ) *
            100
          : null;
    }

    const participationPercent =
      averageVolume !== null
        ? (
            originalShares /
            averageVolume
          ) *
          100
        : null;

    const relativeVolume =
      (
        currentVolume !== null &&
        averageVolume !== null
      )
        ? (
            currentVolume /
            averageVolume
          )
        : null;

    const positionValue =
      originalShares *
      entryPrice;

    const averageDailyDollarVolume =
      averageVolume !== null
        ? (
            averageVolume *
            entryPrice
          )
        : null;

    const dollarParticipationPercent =
      averageDailyDollarVolume !==
        null &&
      averageDailyDollarVolume > 0
        ? (
            positionValue /
            averageDailyDollarVolume
          ) *
          100
        : null;

    const evidenceCount =
      [
        spreadPercent !== null,
        participationPercent !== null,
        relativeVolume !== null,
        dollarParticipationPercent !== null,
        estimatedSlippagePercent !== null,
      ]
        .filter(Boolean)
        .length;

    const metrics = {
      bid,

      ask,

      spreadPercent:
        round(
          spreadPercent,
          6,
        ),

      currentVolume,

      averageVolume,

      relativeVolume:
        round(
          relativeVolume,
          6,
        ),

      participationPercent:
        round(
          participationPercent,
          6,
        ),

      positionValue:
        round(
          positionValue,
          2,
        ),

      averageDailyDollarVolume:
        round(
          averageDailyDollarVolume,
          2,
        ),

      dollarParticipationPercent:
        round(
          dollarParticipationPercent,
          6,
        ),

      estimatedSlippagePercent,

      evidenceCount,
    };

    if (
      cfg
        .requireLiquidityEvidence ===
        true &&
      evidenceCount === 0
    ) {
      return buildBlockedResult({
        status:
          LIQUIDITY_STRESS_STATUS
            .INSUFFICIENT_DATA,

        reason:
          "No usable liquidity evidence was available; missing liquidity was not treated as healthy liquidity.",

        originalShares,

        metrics,

        warnings: [
          "Liquidity stress could not be evaluated safely.",
        ],
      });
    }

    /**
     * ======================================================
     * HARD BLOCKS
     * ======================================================
     */

    if (
      spreadPercent !== null &&
      spreadPercent >=
        cfg
          .spreadBlockPercent
    ) {
      return buildBlockedResult({
        reason:
          "Bid/ask spread exceeds the configured liquidity block threshold.",

        originalShares,

        metrics,
      });
    }

    if (
      participationPercent !== null &&
      participationPercent >=
        cfg
          .participationBlockPercent
    ) {
      return buildBlockedResult({
        reason:
          "Proposed order participation exceeds the configured volume block threshold.",

        originalShares,

        metrics,
      });
    }

    if (
      dollarParticipationPercent !== null &&
      dollarParticipationPercent >=
        cfg
          .dollarParticipationBlockPercent
    ) {
      return buildBlockedResult({
        reason:
          "Proposed dollar participation exceeds the configured liquidity block threshold.",

        originalShares,

        metrics,
      });
    }

   if (
  relativeVolume !== null &&
  relativeVolume <
    cfg
      .relativeVolumeBlockBelow

    ) {
      return buildBlockedResult({
        reason:
          "Relative market volume is too low for safe execution.",

        originalShares,

        metrics,
      });
    }

    if (
      estimatedSlippagePercent !== null &&
      estimatedSlippagePercent >=
        cfg
          .slippageBlockPercent
    ) {
      return buildBlockedResult({
        reason:
          "Estimated slippage exceeds the configured block threshold.",

        originalShares,

        metrics,
      });
    }

    /**
     * ======================================================
     * ADAPTIVE REDUCTION
     * ======================================================
     */

    let multiplier = 1;

    const reasons = [];

    const applyModerate =
      (reason) => {
        multiplier =
          Math.min(
            multiplier,
            clamp(
              cfg
                .moderateMultiplier,
              0,
              1,
            ),
          );

        reasons.push(
          reason,
        );
      };

    const applySevere =
      (reason) => {
        multiplier =
          Math.min(
            multiplier,
            clamp(
              cfg
                .severeMultiplier,
              0,
              1,
            ),
          );

        reasons.push(
          reason,
        );
      };

    if (
      spreadPercent !== null
    ) {
      if (
        spreadPercent >=
          cfg
            .spreadSeverePercent
      ) {
        applySevere(
          "Bid/ask spread requires substantial execution-size reduction.",
        );
      } else if (
        spreadPercent >=
          cfg
            .spreadReducePercent
      ) {
        applyModerate(
          "Bid/ask spread requires lower execution size.",
        );
      }
    }

    if (
      participationPercent !== null
    ) {
      if (
        participationPercent >=
          cfg
            .participationSeverePercent
      ) {
        applySevere(
          "Proposed order is large relative to average volume.",
        );
      } else if (
        participationPercent >=
          cfg
            .participationReducePercent
      ) {
        applyModerate(
          "Proposed order participation requires lower size.",
        );
      }
    }

    if (
      dollarParticipationPercent !==
        null
    ) {
      if (
        dollarParticipationPercent >=
          cfg
            .dollarParticipationSeverePercent
      ) {
        applySevere(
          "Dollar participation requires substantial exposure reduction.",
        );
      } else if (
        dollarParticipationPercent >=
          cfg
            .dollarParticipationReducePercent
      ) {
        applyModerate(
          "Dollar participation requires lower exposure.",
        );
      }
    }

   if (
  relativeVolume !== null
) {
  if (
    relativeVolume <
      cfg
        .relativeVolumeSevereBelow
  ) {
    applySevere(
      "Current relative volume is severely depressed.",
    );
  } else if (
    relativeVolume <
      cfg
        .relativeVolumeReduceBelow
  ) {
    applyModerate(
      "Current relative volume is below normal.",
    );
  }
}

    if (
      estimatedSlippagePercent !== null
    ) {
      if (
        estimatedSlippagePercent >=
          cfg
            .slippageSeverePercent
      ) {
        applySevere(
          "Estimated slippage requires substantial size reduction.",
        );
      } else if (
        estimatedSlippagePercent >=
          cfg
            .slippageReducePercent
      ) {
        applyModerate(
          "Estimated slippage requires lower size.",
        );
      }
    }

    multiplier =
      clamp(
        multiplier,
        0,
        1,
      );

    if (
      multiplier <
      cfg
        .minimumExposureMultiplier
    ) {
      return buildBlockedResult({
        reason:
          "Required liquidity reduction is below the minimum executable exposure.",

        originalShares,

        metrics,
      });
    }

    const approvedShares =
      Math.min(
        originalShares,

        Math.max(
          1,

          Math.floor(
            originalShares *
            multiplier,
          ),
        ),
      );

    if (
      approvedShares <
      originalShares
    ) {
      return {
        approved: true,

        engine:
          "LIQUIDITY_STRESS",

        status:
          LIQUIDITY_STRESS_STATUS
            .REDUCED,

        action:
          LIQUIDITY_STRESS_ACTION
            .REDUCE,

        canExecute: true,

        exposureMultiplier:
          round(
            approvedShares /
            originalShares,
            6,
          ),

        originalShares,

        approvedShares,

        metrics,

        reasons,

        warnings: [],

        errors: [],
      };
    }

    return {
      approved: true,

      engine:
        "LIQUIDITY_STRESS",

      status:
        LIQUIDITY_STRESS_STATUS
          .APPROVED,

      action:
        LIQUIDITY_STRESS_ACTION
          .ALLOW,

      canExecute: true,

      exposureMultiplier: 1,

      originalShares,

      approvedShares:
        originalShares,

      metrics,

      reasons:
        reasons.length > 0
          ? reasons
          : [
              "Liquidity and estimated execution stress are within configured limits.",
            ],

      warnings: [],

      errors: [],
    };
  } catch (error) {
    return buildBlockedResult({
      status:
        LIQUIDITY_STRESS_STATUS
          .ERROR,

      reason:
        "Liquidity stress evaluation failed safely.",

      errors: [
        error?.message ??
        "Unknown liquidity stress error.",
      ],
    });
  }
}

export default
  evaluateLiquidityStress;
