/**
 * AEMA CRYPTO
 * Phase 5.24
 *
 * PAPER PORTFOLIO SNAPSHOT
 *
 * Builds portfolio-risk input from the actual
 * stateful paper runtime positions.
 *
 * NO execution authority.
 */

const finite = (
  value,
  fallback = 0,
) => {
  const n = Number(value);

  return Number.isFinite(n)
    ? n
    : fallback;
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


function normalizePosition({
  runtimeState,
  marketPrices = {},
} = {}) {
  const position =
    runtimeState?.position ??
    {};

  const symbol =
    upper(
      runtimeState?.symbol ??
      position?.symbol,
    );

  const direction =
    upper(
      position?.direction,
      "FLAT",
    );

  const quantity =
    Math.max(
      0,
      finite(
        position?.quantity,
      ),
    );

  if (
    !symbol ||
    quantity <= 0 ||
    ![
      "LONG",
      "SHORT",
    ].includes(direction)
  ) {
    return null;
  }

  const marketPrice =
    finite(
      marketPrices?.[symbol] ??
      position?.currentPrice ??
      position?.averageEntryPrice,
      0,
    );

  const notionalUsd =
    marketPrice > 0
      ? quantity *
        marketPrice
      : finite(
          position?.notionalUsd,
          0,
        );

  const exposure =
    Math.max(
      0,
      finite(
        position?.exposure ??
        position?.currentExposure,
        1,
      ),
    );

  const leverage =
    Math.max(
      0,
      finite(
        runtimeState
          ?.riskPlan
          ?.leverage
          ?.recommended ??
        position?.leverage,
        1,
      ),
    );

  return {
    symbol,

    direction,

    quantity,

    exposure,

    leverage,

    notionalUsd,

    averageEntryPrice:
      finite(
        position
          ?.averageEntryPrice,
        null,
      ),

    currentPrice:
      marketPrice > 0
        ? marketPrice
        : null,

    theme:
      position?.theme ??
      null,

    systemicDependency:
      finite(
        position
          ?.systemicDependency,
        0,
      ),

    correlations:
      clone(
        position?.correlations ??
        {},
      ),
  };
}


export function buildPaperPortfolioSnapshot({
  statefulRuntime,

  marketPrices = {},

  accountEquity = null,

  drawdownPercent = 0,

  marketStress = false,
} = {}) {
  if (!statefulRuntime) {
    throw new Error(
      "STATEFUL_RUNTIME_REQUIRED",
    );
  }

  const runtime =
    statefulRuntime
      .getRuntimeState();

  const positions =
    (
      runtime?.symbols ??
      []
    )
      .map(
        runtimeState =>
          normalizePosition({
            runtimeState,
            marketPrices,
          }),
      )
      .filter(Boolean);

  let grossExposure = 0;
  let longExposure = 0;
  let shortExposure = 0;
  let leverageWeightedExposure = 0;

  for (
    const position
    of positions
  ) {
    grossExposure +=
      position.exposure;

    leverageWeightedExposure +=
      position.exposure *
      position.leverage;

    if (
      position.direction ===
      "LONG"
    ) {
      longExposure +=
        position.exposure;
    }

    if (
      position.direction ===
      "SHORT"
    ) {
      shortExposure +=
        position.exposure;
    }
  }

  const netExposure =
    longExposure -
    shortExposure;

  return {
    positions,

    metrics: {
      positionCount:
        positions.length,

      grossExposure,

      longExposure,

      shortExposure,

      netExposure,

      leverageWeightedExposure,
    },

    accountEquity:
      finite(
        accountEquity,
        null,
      ),

    drawdownPercent:
      Math.max(
        0,
        finite(
          drawdownPercent,
          0,
        ),
      ),

    marketStress:
      Boolean(
        marketStress,
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
  buildPaperPortfolioSnapshot;