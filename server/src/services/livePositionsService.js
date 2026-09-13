// server/src/services/livePositionsService.js

/**
 * ============================================================
 * LIVE POSITIONS SERVICE
 * ============================================================
 *
 * PURPOSE
 * -------
 *
 * Normalize the bot's internal position/session state into a
 * stable API contract for the SaaS frontend.
 *
 * This service does NOT:
 *
 * - create positions
 * - place orders
 * - authorize trades
 * - fabricate missing values
 * - mutate trading-session state
 *
 * It only READS and NORMALIZES real position information.
 *
 * ============================================================
 * SAAS BOUNDARY
 * ============================================================
 *
 * tenantContext is intentionally supported now so the API
 * contract does not need to change when authentication and
 * multi-tenant persistence are introduced.
 *
 * Until a real authenticated tenant exists, tenant fields may
 * remain null.
 */

export const LIVE_POSITIONS_STATUS =
  Object.freeze({
    COMPLETE:
      "COMPLETE",

    NO_POSITIONS:
      "NO_POSITIONS",

    INVALID_SOURCE:
      "INVALID_SOURCE",

    ERROR:
      "ERROR",
  });

function now() {
  return new Date()
    .toISOString();
}

function finiteNumber(
  value,
) {
  const number =
    Number(value);

  return Number.isFinite(
    number,
  )
    ? number
    : null;
}

function positiveNumber(
  value,
) {
  const number =
    finiteNumber(
      value,
    );

  return (
    number !== null &&
    number > 0
  )
    ? number
    : null;
}

function round(
  value,
  decimals = 2,
) {
  const number =
    finiteNumber(
      value,
    );

  if (number === null) {
    return null;
  }

  const multiplier =
    10 ** decimals;

  return (
    Math.round(
      (
        number +
        Number.EPSILON
      ) *
        multiplier,
    ) /
    multiplier
  );
}

function normalizeString(
  value,
) {
  const normalized =
    String(
      value ?? "",
    )
      .trim();

  return normalized ||
    null;
}

function normalizeSide(
  value,
) {
  const side =
    normalizeString(
      value,
    )
      ?.toUpperCase();

  if (
    side === "LONG" ||
    side === "SHORT"
  ) {
    return side;
  }

  return null;
}

function normalizeStatus(
  value,
) {
  return (
    normalizeString(
      value,
    )
      ?.toUpperCase() ??
    null
  );
}

function normalizeArray(
  value,
) {
  return Array.isArray(
    value,
  )
    ? value
    : [];
}

function safeObject(
  value,
) {
  return (
    value &&
    typeof value ===
      "object" &&
    !Array.isArray(
      value,
    )
  )
    ? value
    : null;
}

/**
 * ============================================================
 * P&L CALCULATION
 * ============================================================
 *
 * Existing broker values always take precedence.
 *
 * We calculate only when the position contains enough genuine
 * price information.
 */

function calculateUnrealizedPnL({
  side,
  shares,
  entryPrice,
  currentPrice,
}) {
  if (
    !side ||
    shares === null ||
    entryPrice === null ||
    currentPrice === null
  ) {
    return null;
  }

  if (side === "LONG") {
    return round(
      (
        currentPrice -
        entryPrice
      ) *
        shares,
      2,
    );
  }

  if (side === "SHORT") {
    return round(
      (
        entryPrice -
        currentPrice
      ) *
        shares,
      2,
    );
  }

  return null;
}

function calculatePnLPercent({
  side,
  entryPrice,
  currentPrice,
}) {
  if (
    !side ||
    entryPrice === null ||
    entryPrice <= 0 ||
    currentPrice === null
  ) {
    return null;
  }

  const change =
    side === "SHORT"
      ? (
          entryPrice -
          currentPrice
        )
      : (
          currentPrice -
          entryPrice
        );

  return round(
    (
      change /
      entryPrice
    ) *
      100,
    4,
  );
}

/**
 * ============================================================
 * THESIS NORMALIZATION
 * ============================================================
 */

function normalizeThesis(
  management,
  position,
) {
  const thesis =
    safeObject(
      management?.thesis,
    );

  const thesisState =
    safeObject(
      position?.thesisState,
    );

  if (
    !thesis &&
    !thesisState
  ) {
    return {
      available:
        false,

      status:
        null,

      exposureAction:
        null,

      conditionsPersist:
        null,

      entryReasons:
        [],

      currentReasons:
        [],

      deterioratingConditions:
        [],

      invalidatedConditions:
        [],

      raw:
        null,
    };
  }

  const status =
    normalizeStatus(
      thesis?.status ??
      thesisState?.status,
    );

  const exposureAction =
    normalizeStatus(
      thesis?.exposureAction ??
      thesisState
        ?.lastReductionAction,
    );

  const invalidatedConditions =
    normalizeArray(
      thesis
        ?.invalidatedConditions ??
      thesisState
        ?.invalidatedConditions,
    );

  const deterioratingConditions =
    normalizeArray(
      thesis
        ?.deterioratingConditions ??
      thesisState
        ?.deterioratingConditions,
    );

  let conditionsPersist =
    null;

  if (
    typeof thesis
      ?.conditionsPersist ===
    "boolean"
  ) {
    conditionsPersist =
      thesis
        .conditionsPersist;
  } else if (
    invalidatedConditions
      .length > 0
  ) {
    conditionsPersist =
      false;
  } else if (
    thesis?.approved ===
      true
  ) {
    conditionsPersist =
      true;
  }

  return {
    available:
      true,

    status,

    exposureAction,

    conditionsPersist,

    entryReasons:
      normalizeArray(
        thesis?.entryReasons ??
        thesisState
          ?.entryReasons,
      ),

    currentReasons:
      normalizeArray(
        thesis?.currentReasons ??
        thesis?.reasons ??
        thesisState
          ?.currentReasons,
      ),

    deterioratingConditions,

    invalidatedConditions,

    raw:
      thesis ??
      thesisState,
  };
}

/**
 * ============================================================
 * MANAGEMENT NORMALIZATION
 * ============================================================
 */

function normalizeManagement(
  management,
) {
  if (
    !management ||
    typeof management !==
      "object"
  ) {
    return {
      available:
        false,

      engine:
        "POSITION_MANAGER",

      status:
        null,

      action:
        null,

      shouldExit:
        false,

      exitReason:
        null,

      exposureMultiplier:
        null,

      currentR:
        null,

      peakR:
        null,

      currentStop:
        null,

      trailingActive:
        null,

      warnings:
        [],

      errors:
        [],
    };
  }

  const metrics =
    safeObject(
      management.metrics,
    ) ?? {};

  const trailing =
    safeObject(
      management.trailing,
    );

  const status =
    normalizeStatus(
      management.status,
    );

  let action =
    null;

  if (
    management
      ?.shouldExit ===
    true
  ) {
    action =
      "EXIT";
  } else if (
    status === "REDUCED"
  ) {
    action =
      "REDUCE";
  } else if (
    status === "HOLDING"
  ) {
    action =
      "HOLD";
  }

  return {
    available:
      true,

    engine:
      normalizeString(
        management.engine,
      ) ??
      "POSITION_MANAGER",

    status,

    action,

    shouldExit:
      management
        ?.shouldExit ===
      true,

    exitReason:
      normalizeString(
        management
          ?.exitReason,
      ),

    exposureMultiplier:
      finiteNumber(
        metrics
          ?.exposureMultiplier,
      ),

    currentR:
      finiteNumber(
        metrics
          ?.currentR ??
        trailing
          ?.currentR,
      ),

    peakR:
      finiteNumber(
        metrics
          ?.peakR ??
        trailing
          ?.peakR,
      ),

    currentStop:
      positiveNumber(
        metrics
          ?.currentStop ??
        trailing
          ?.currentStopPrice,
      ),

    trailingActive:
      trailing
        ? true
        : null,

    warnings:
      normalizeArray(
        management.warnings,
      ),

    errors:
      normalizeArray(
        management.errors,
      ),
  };
}

/**
 * ============================================================
 * POSITION NORMALIZATION
 * ============================================================
 */

export function normalizeLivePosition({
  position,
  management = null,
  tenantContext = null,
} = {}) {
  if (
    !position ||
    typeof position !==
      "object"
  ) {
    return null;
  }

  const side =
    normalizeSide(
      position.side,
    );

  const shares =
    positiveNumber(
      position.shares,
    );

  const entryPrice =
    positiveNumber(
      position.entryPrice,
    );

  const currentPrice =
    positiveNumber(
      position.currentPrice,
    );

  const brokerUnrealizedPnL =
    finiteNumber(
      position
        .unrealizedPnL,
    );

  const calculatedPnL =
    calculateUnrealizedPnL({
      side,
      shares,
      entryPrice,
      currentPrice,
    });

  const unrealizedPnL =
    brokerUnrealizedPnL ??
    calculatedPnL;

  const managementState =
    normalizeManagement(
      management,
    );

  const thesis =
    normalizeThesis(
      management,
      position,
    );

  const currentStop =
    managementState
      .currentStop ??
    positiveNumber(
      position.stopPrice,
    );

  return {
    id:
      normalizeString(
        position.id,
      ),

    orderId:
      normalizeString(
        position.orderId,
      ),

    /**
     * SaaS ownership placeholders.
     *
     * These become populated from authenticated server-side
     * context later. Never trust user IDs supplied directly
     * from the browser.
     */

    tenant: {
      userId:
        normalizeString(
          tenantContext
            ?.userId,
        ),

      workspaceId:
        normalizeString(
          tenantContext
            ?.workspaceId,
        ),

      accountId:
        normalizeString(
          tenantContext
            ?.accountId,
        ),

      sessionId:
        normalizeString(
          tenantContext
            ?.sessionId,
        ),
    },

    symbol:
      normalizeString(
        position.symbol,
      )
        ?.toUpperCase() ??
      null,

    side,

    status:
      normalizeStatus(
        position.status,
      ),

    entry: {
      price:
        entryPrice,

      originalPrice:
        positiveNumber(
          position
            .originalEntryPrice,
        ),

      shares,

      positionValue:
        finiteNumber(
          position
            .positionValue,
        ),

      commission:
        finiteNumber(
          position
            .entryCommission,
        ),

      openedAt:
        normalizeString(
          position.openedAt,
        ),
    },

    market: {
      currentPrice,

      bestPrice:
        positiveNumber(
          position.bestPrice,
        ),

      currentPositionValue:
        (
          currentPrice !==
            null &&
          shares !==
            null
        )
          ? round(
              currentPrice *
                shares,
              2,
            )
          : null,
    },

    performance: {
      realizedPnL:
        finiteNumber(
          position
            .realizedPnL,
        ),

      unrealizedPnL,

      unrealizedPnLPercent:
        calculatePnLPercent({
          side,
          entryPrice,
          currentPrice,
        }),

      currentR:
        managementState
          .currentR,

      peakR:
        managementState
          .peakR,
    },

    risk: {
      initialStop:
        positiveNumber(
          position.stopPrice,
        ),

      currentStop,

      target:
        positiveNumber(
          position
            .targetPrice,
        ),

      intelligenceScore:
        finiteNumber(
          position
            .intelligenceScore,
        ),
    },

    management:
      managementState,

    thesis,

    metadata:
      safeObject(
        position.metadata,
      ) ?? {},

    timestamps: {
      openedAt:
        normalizeString(
          position.openedAt,
        ),

      closedAt:
        normalizeString(
          position.closedAt,
        ),

      normalizedAt:
        now(),
    },
  };
}

/**
 * ============================================================
 * BUILD POSITIONS RESPONSE
 * ============================================================
 */

export function buildLivePositionsResponse({
  positions = [],
  managementByPositionId = {},
  tenantContext = null,
  source = "PAPER_TRADING_SESSION",
} = {}) {
  try {
    const sourcePositions =
      Array.isArray(
        positions,
      )
        ? positions
        : [];

    const normalized =
      sourcePositions
        .map(
          position => {
            const positionId =
              normalizeString(
                position?.id,
              );

            const management =
              positionId
                ? managementByPositionId
                    ?.[
                      positionId
                    ] ??
                  null
                : null;

            return normalizeLivePosition({
              position,
              management,
              tenantContext,
            });
          },
        )
        .filter(Boolean);

    const openPositions =
      normalized.filter(
        position =>
          position.status ===
          "OPEN",
      );

    const totalUnrealizedPnL =
      round(
        openPositions.reduce(
          (
            total,
            position,
          ) =>
            total +
            (
              finiteNumber(
                position
                  ?.performance
                  ?.unrealizedPnL,
              ) ??
              0
            ),
          0,
        ),
        2,
      );

    const totalMarketValue =
      round(
        openPositions.reduce(
          (
            total,
            position,
          ) =>
            total +
            (
              finiteNumber(
                position
                  ?.market
                  ?.currentPositionValue,
              ) ??
              0
            ),
          0,
        ),
        2,
      );

    return {
      success:
        true,

      approved:
        true,

      service:
        "LIVE_POSITIONS",

      status:
        openPositions
          .length > 0
          ? LIVE_POSITIONS_STATUS
              .COMPLETE
          : LIVE_POSITIONS_STATUS
              .NO_POSITIONS,

      source,

      tenant: {
        userId:
          normalizeString(
            tenantContext
              ?.userId,
          ),

        workspaceId:
          normalizeString(
            tenantContext
              ?.workspaceId,
          ),

        accountId:
          normalizeString(
            tenantContext
              ?.accountId,
          ),

        sessionId:
          normalizeString(
            tenantContext
              ?.sessionId,
          ),
      },

      summary: {
        openPositionCount:
          openPositions.length,

        totalMarketValue,

        totalUnrealizedPnL,

        longPositions:
          openPositions
            .filter(
              position =>
                position.side ===
                "LONG",
            )
            .length,

        shortPositions:
          openPositions
            .filter(
              position =>
                position.side ===
                "SHORT",
            )
            .length,
      },

      positions:
        openPositions,

      warnings:
        [],

      errors:
        [],

      timestamp:
        now(),
    };
  } catch (error) {
    return {
      success:
        false,

      approved:
        false,

      service:
        "LIVE_POSITIONS",

      status:
        LIVE_POSITIONS_STATUS
          .ERROR,

      source,

      tenant:
        tenantContext ??
        null,

      summary: {
        openPositionCount:
          0,

        totalMarketValue:
          0,

        totalUnrealizedPnL:
          0,

        longPositions:
          0,

        shortPositions:
          0,
      },

      positions:
        [],

      warnings: [
        "Position information could not be normalized safely.",
      ],

      errors: [
        error instanceof Error
          ? error.message
          : String(
              error,
            ),
      ],

      timestamp:
        now(),
    };
  }
}

export default
  buildLivePositionsResponse;