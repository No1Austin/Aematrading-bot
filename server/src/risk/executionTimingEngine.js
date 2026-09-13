// server/src/risk/executionTimingEngine.js

/**
 * Execution Timing / Market Session Risk Engine
 *
 * Responsibility:
 * Decide whether an otherwise-approved trade is being proposed at an
 * appropriate execution time.
 *
 * This engine does NOT:
 * - generate trade direction
 * - override an upstream block
 * - evaluate event meaning (Event Intelligence owns that)
 * - evaluate spread/volume/slippage quality (Liquidity Stress owns that)
 * - increase position size
 *
 * Default session assumptions:
 * - U.S. equities regular session: 09:30–16:00 America/New_York
 * - premarket / after-hours: blocked by default
 * - first 2 minutes: blocked
 * - remainder of first 15 minutes: reduced
 * - lunch window: moderately reduced
 * - final 15 minutes: reduced
 * - final 2 minutes: blocked
 */

export const EXECUTION_TIMING_STATUS = Object.freeze({
  APPROVED: "APPROVED",
  REDUCED: "REDUCED",
  BLOCKED: "BLOCKED",
  INVALID_INPUT: "INVALID_INPUT",
});

export const EXECUTION_TIMING_ACTION = Object.freeze({
  ALLOW: "ALLOW",
  REDUCE: "REDUCE",
  BLOCK: "BLOCK",
});

export const DEFAULT_EXECUTION_TIMING_CONFIG = Object.freeze({
  timeZone: "America/New_York",

  regularSessionOpenMinutes: 9 * 60 + 30,
  regularSessionCloseMinutes: 16 * 60,

  allowPremarket: false,
  allowAfterHours: false,

  blockOpeningMinutes: 2,
  reduceOpeningMinutes: 15,
  openingExposureMultiplier: 0.6,

  lunchStartMinutes: 12 * 60,
  lunchEndMinutes: 13 * 60 + 30,
  lunchExposureMultiplier: 0.8,

  reduceClosingMinutes: 15,
  blockClosingMinutes: 2,
  closingExposureMultiplier: 0.6,

  // Optional scheduled-event timing protection.
  // Event meaning/freeze remains the responsibility of Event Intelligence.
  blockScheduledEventWithinMinutes: 2,
  reduceScheduledEventWithinMinutes: 10,
  scheduledEventExposureMultiplier: 0.5,

  minimumExposureMultiplier: 0.1,
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

  return number !== null &&
    number > 0
    ? number
    : null;
}

function clamp(
  value,
  min,
  max,
) {
  return Math.min(
    max,
    Math.max(
      min,
      value,
    ),
  );
}

function round(
  value,
  digits = 6,
) {
  const factor =
    10 ** digits;

  return Math.round(
    value * factor,
  ) / factor;
}

function normalizeSide(value) {
  const side =
    String(
      value ?? "",
    )
      .trim()
      .toUpperCase();

  return side === "LONG" ||
    side === "SHORT"
    ? side
    : null;
}

function normalizeSymbol(value) {
  const symbol =
    String(
      value ?? "",
    )
      .trim()
      .toUpperCase();

  return symbol ||
    null;
}

function validDate(value) {
  if (
    value instanceof Date
  ) {
    return Number.isFinite(
      value.getTime(),
    )
      ? new Date(
          value.getTime(),
        )
      : null;
  }

  if (
    typeof value !== "string" &&
    typeof value !== "number"
  ) {
    return null;
  }

  const date =
    new Date(value);

  return Number.isFinite(
    date.getTime(),
  )
    ? date
    : null;
}

function getZonedParts(
  date,
  timeZone,
) {
  try {
    const formatter =
      new Intl.DateTimeFormat(
        "en-US",
        {
          timeZone,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          weekday: "short",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hourCycle: "h23",
        },
      );

    const parts =
      formatter.formatToParts(
        date,
      );

    const map = {};

    for (
      const part of parts
    ) {
      if (
        part.type !==
        "literal"
      ) {
        map[part.type] =
          part.value;
      }
    }

    const hour =
      Number(map.hour);

    const minute =
      Number(map.minute);

    const second =
      Number(map.second);

    if (
      !Number.isFinite(hour) ||
      !Number.isFinite(minute) ||
      !Number.isFinite(second)
    ) {
      return null;
    }

    return {
      year:
        Number(map.year),

      month:
        Number(map.month),

      day:
        Number(map.day),

      weekday:
        map.weekday,

      hour,
      minute,
      second,

      minuteOfDay:
        hour * 60 +
        minute +
        second / 60,
    };
  } catch {
    return null;
  }
}

function resolveConfig(
  config = {},
) {
  return {
    ...DEFAULT_EXECUTION_TIMING_CONFIG,
    ...(config ?? {}),
  };
}

function buildBlockedResult({
  status =
    EXECUTION_TIMING_STATUS
      .BLOCKED,

  reason,

  originalShares = 0,

  metrics = {},

  warnings = [],
} = {}) {
  return {
    approved: false,
    engine:
      "EXECUTION_TIMING",

    status,

    action:
      EXECUTION_TIMING_ACTION
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

    errors: [],
  };
}

function getScheduledEventDistanceMinutes({
  timestamp,
  scheduledEventAt,
  minutesUntilScheduledEvent,
}) {
  const explicit =
    finiteNumber(
      minutesUntilScheduledEvent,
    );

  if (
    explicit !== null
  ) {
    return Math.abs(
      explicit,
    );
  }

  const eventDate =
    validDate(
      scheduledEventAt,
    );

  if (
    !eventDate
  ) {
    return null;
  }

  return Math.abs(
    (
      eventDate.getTime() -
      timestamp.getTime()
    ) /
      60000,
  );
}

/**
 * evaluateExecutionTiming({
 *   proposedTrade: {
 *     symbol,
 *     side,
 *     shares,
 *     entryPrice
 *   },
 *   timestamp,
 *   scheduledEventAt?,
 *   minutesUntilScheduledEvent?,
 *   config?
 * })
 */
export function evaluateExecutionTiming({
  proposedTrade = null,
  timestamp = null,
  scheduledEventAt = null,
  minutesUntilScheduledEvent = null,
  config = {},
} = {}) {
  try {
    const cfg =
      resolveConfig(
        config,
      );

    const symbol =
      normalizeSymbol(
        proposedTrade
          ?.symbol,
      );

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
          EXECUTION_TIMING_STATUS
            .INVALID_INPUT,

        reason:
          "Valid proposed trade is required.",

        originalShares:
          originalShares ?? 0,
      });
    }

    const executionTime =
      validDate(
        timestamp,
      );

    if (
      !executionTime
    ) {
      return buildBlockedResult({
        status:
          EXECUTION_TIMING_STATUS
            .INVALID_INPUT,

        reason:
          "Valid execution timestamp is required.",

        originalShares,
      });
    }

    const zoned =
      getZonedParts(
        executionTime,
        cfg.timeZone,
      );

    if (
      !zoned
    ) {
      return buildBlockedResult({
        status:
          EXECUTION_TIMING_STATUS
            .INVALID_INPUT,

        reason:
          "Execution timestamp could not be resolved in the configured market timezone.",

        originalShares,
      });
    }

    const metrics = {
      symbol,
      side,

      timestamp:
        executionTime
          .toISOString(),

      timeZone:
        cfg.timeZone,

      weekday:
        zoned.weekday,

      localHour:
        zoned.hour,

      localMinute:
        zoned.minute,

      minuteOfDay:
        round(
          zoned.minuteOfDay,
          4,
        ),

      minutesFromOpen:
        null,

      minutesToClose:
        null,

      session:
        null,

      scheduledEventDistanceMinutes:
        null,
    };

    const warnings = [];
    const reasons = [];

    const isWeekend =
      zoned.weekday ===
        "Sat" ||
      zoned.weekday ===
        "Sun";

    if (
      isWeekend
    ) {
      metrics.session =
        "MARKET_CLOSED";

      return buildBlockedResult({
        reason:
          "Regular U.S. equity market session is closed on weekends.",

        originalShares,
        metrics,
        warnings,
      });
    }

    const minuteOfDay =
      zoned.minuteOfDay;

    const open =
      finiteNumber(
        cfg.regularSessionOpenMinutes,
      );

    const close =
      finiteNumber(
        cfg.regularSessionCloseMinutes,
      );

    if (
      open === null ||
      close === null ||
      close <= open
    ) {
      return buildBlockedResult({
        status:
          EXECUTION_TIMING_STATUS
            .INVALID_INPUT,

        reason:
          "Execution timing configuration contains an invalid regular session.",

        originalShares,
        metrics,
        warnings,
      });
    }

    if (
      minuteOfDay < open
    ) {
      metrics.session =
        "PREMARKET";

      if (
        cfg.allowPremarket !==
        true
      ) {
        return buildBlockedResult({
          reason:
            "Premarket execution is disabled by default.",

          originalShares,
          metrics,
          warnings,
        });
      }
    } else if (
      minuteOfDay >= close
    ) {
      metrics.session =
        "AFTER_HOURS";

      if (
        cfg.allowAfterHours !==
        true
      ) {
        return buildBlockedResult({
          reason:
            "After-hours execution is disabled by default.",

          originalShares,
          metrics,
          warnings,
        });
      }
    } else {
      metrics.session =
        "REGULAR";

      metrics.minutesFromOpen =
        round(
          minuteOfDay -
            open,
          4,
        );

      metrics.minutesToClose =
        round(
          close -
            minuteOfDay,
          4,
        );
    }

    let multiplier = 1;

    const applyReduction = (
      candidateMultiplier,
      reason,
    ) => {
      const normalized =
        clamp(
          finiteNumber(
            candidateMultiplier,
          ) ?? 1,
          0,
          1,
        );

      multiplier =
        Math.min(
          multiplier,
          normalized,
        );

      if (
        reason
      ) {
        reasons.push(
          reason,
        );
      }
    };

    if (
      metrics.session ===
      "REGULAR"
    ) {
      const fromOpen =
        metrics
          .minutesFromOpen;

      const toClose =
        metrics
          .minutesToClose;

      const blockOpen =
        Math.max(
          0,
          finiteNumber(
            cfg.blockOpeningMinutes,
          ) ?? 0,
        );

      const reduceOpen =
        Math.max(
          blockOpen,
          finiteNumber(
            cfg.reduceOpeningMinutes,
          ) ?? 0,
        );

      const blockClose =
        Math.max(
          0,
          finiteNumber(
            cfg.blockClosingMinutes,
          ) ?? 0,
        );

      const reduceClose =
        Math.max(
          blockClose,
          finiteNumber(
            cfg.reduceClosingMinutes,
          ) ?? 0,
        );

      if (
        fromOpen <
        blockOpen
      ) {
        return buildBlockedResult({
          reason:
            "Execution is inside the blocked market-opening window.",

          originalShares,
          metrics,
          warnings,
        });
      }

      if (
        toClose <=
        blockClose
      ) {
        return buildBlockedResult({
          reason:
            "Execution is inside the blocked market-closing window.",

          originalShares,
          metrics,
          warnings,
        });
      }

      if (
        fromOpen <
        reduceOpen
      ) {
        applyReduction(
          cfg.openingExposureMultiplier,
          "Opening-session timing requires lower exposure.",
        );
      }

      if (
        toClose <=
        reduceClose
      ) {
        applyReduction(
          cfg.closingExposureMultiplier,
          "Closing-session timing requires lower exposure.",
        );
      }

      const lunchStart =
        finiteNumber(
          cfg.lunchStartMinutes,
        );

      const lunchEnd =
        finiteNumber(
          cfg.lunchEndMinutes,
        );

      if (
        lunchStart !== null &&
        lunchEnd !== null &&
        lunchEnd >
          lunchStart &&
        minuteOfDay >=
          lunchStart &&
        minuteOfDay <
          lunchEnd
      ) {
        applyReduction(
          cfg.lunchExposureMultiplier,
          "Midday execution window requires moderately lower exposure.",
        );
      }
    }

    const eventDistance =
      getScheduledEventDistanceMinutes({
        timestamp:
          executionTime,

        scheduledEventAt,

        minutesUntilScheduledEvent,
      });

    metrics
      .scheduledEventDistanceMinutes =
      eventDistance === null
        ? null
        : round(
            eventDistance,
            4,
          );

    if (
      eventDistance !==
      null
    ) {
      const blockEvent =
        Math.max(
          0,
          finiteNumber(
            cfg.blockScheduledEventWithinMinutes,
          ) ?? 0,
        );

      const reduceEvent =
        Math.max(
          blockEvent,
          finiteNumber(
            cfg.reduceScheduledEventWithinMinutes,
          ) ?? 0,
        );

      if (
        eventDistance <=
        blockEvent
      ) {
        return buildBlockedResult({
          reason:
            "Execution is too close to a scheduled market event.",

          originalShares,
          metrics,
          warnings,
        });
      }

      if (
        eventDistance <=
        reduceEvent
      ) {
        applyReduction(
          cfg.scheduledEventExposureMultiplier,
          "Scheduled-event proximity requires lower exposure.",
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
      cfg.minimumExposureMultiplier
    ) {
      return buildBlockedResult({
        reason:
          "Required timing reduction is below the minimum executable exposure.",

        originalShares,
        metrics,
        warnings,
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
          "EXECUTION_TIMING",

        status:
          EXECUTION_TIMING_STATUS
            .REDUCED,

        action:
          EXECUTION_TIMING_ACTION
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
        warnings,
        errors: [],
      };
    }

    return {
      approved: true,

      engine:
        "EXECUTION_TIMING",

      status:
        EXECUTION_TIMING_STATUS
          .APPROVED,

      action:
        EXECUTION_TIMING_ACTION
          .ALLOW,

      canExecute: true,

      exposureMultiplier: 1,

      originalShares,

      approvedShares:
        originalShares,

      metrics,
      reasons,
      warnings,
      errors: [],
    };
  } catch (
    error
  ) {
    return buildBlockedResult({
      status:
        EXECUTION_TIMING_STATUS
          .INVALID_INPUT,

      reason:
        "Unknown execution timing error.",

      originalShares:
        positiveNumber(
          proposedTrade
            ?.shares,
        ) ?? 0,

      warnings: [
        error instanceof Error
          ? error.message
          : String(error),
      ],
    });
  }
}

export default evaluateExecutionTiming;
