/**
 * ============================================================
 * CRYPTO VOLUME QUALITY ENGINE
 * ============================================================
 */

function finite(
  value,
) {
  const number =
    Number(value);

  return Number.isFinite(number)
    ? number
    : 0;
}

function clamp(
  value,
  minimum = 0,
  maximum = 100,
) {
  return Math.min(
    maximum,
    Math.max(
      minimum,
      value,
    ),
  );
}

export function analyzeCryptoVolumeQuality(
  measurement,
) {
  const volume =
    finite(
      measurement
        ?.volume24hUsd,
    );

  const liquidity =
    finite(
      measurement
        ?.liquidityUsd,
    );

  const transactions =
    finite(
      measurement
        ?.transactions24h,
    );

  const buys =
    finite(
      measurement
        ?.buys24h,
    );

  const sells =
    finite(
      measurement
        ?.sells24h,
    );

  const venueCount =
    finite(
      measurement
        ?.venueCount,
    );

  let score = 0;
  const reasons = [];
  const warnings = [];

  if (
    volume >=
    20_000_000
  ) {
    score += 30;
    reasons.push(
      "Exceptional 24h dollar volume.",
    );
  } else if (
    volume >=
    2_000_000
  ) {
    score += 25;
    reasons.push(
      "Strong 24h dollar volume.",
    );
  } else if (
    volume >=
    250_000
  ) {
    score += 18;
    reasons.push(
      "Meaningful 24h market activity.",
    );
  } else if (
    volume >=
    50_000
  ) {
    score += 10;
  }

  if (
    liquidity >
    0
  ) {
    const volumeToLiquidity =
      volume /
      liquidity;

    if (
      volumeToLiquidity >=
        0.25 &&
      volumeToLiquidity <=
        8
    ) {
      score += 25;

      reasons.push(
        "Volume is supported by usable liquidity.",
      );
    } else if (
      volumeToLiquidity >
      20
    ) {
      score += 5;

      warnings.push(
        "Volume is extremely high relative to available liquidity.",
      );
    } else {
      score += 12;
    }
  } else if (
    measurement
      ?.cexCount >
    0
  ) {
    score += 12;

    warnings.push(
      "DEX liquidity unavailable; CEX volume quality remains partially observable.",
    );
  }

  if (
    transactions >=
    5_000
  ) {
    score += 20;
  } else if (
    transactions >=
    1_000
  ) {
    score += 15;
  } else if (
    transactions >=
    100
  ) {
    score += 8;
  }

  if (
    buys >
      0 &&
    sells >
      0
  ) {
    const total =
      buys +
      sells;

    const balance =
      Math.min(
        buys,
        sells,
      ) /
      total;

    if (
      balance >=
      0.30
    ) {
      score += 15;

      reasons.push(
        "Two-sided trading activity is present.",
      );
    } else {
      score += 6;

      warnings.push(
        "Transaction flow is heavily one-sided.",
      );
    }
  }

  if (
    venueCount >=
    3
  ) {
    score += 10;

    reasons.push(
      "Activity is confirmed across multiple venues.",
    );
  } else if (
    venueCount >=
    1
  ) {
    score += 4;
  }

  return {
    status:
      "COMPLETE",

    score:
      Math.round(
        clamp(score) *
        100,
      ) / 100,

    volume24hUsd:
      volume,

    liquidityUsd:
      liquidity,

    volumeToLiquidity:
      liquidity >
      0
        ? volume /
          liquidity
        : null,

    transactions24h:
      transactions ||
      null,

    buys24h:
      buys ||
      null,

    sells24h:
      sells ||
      null,

    reasons,
    warnings,
  };
}

export default
  analyzeCryptoVolumeQuality;
