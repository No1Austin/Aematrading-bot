/**
 * AEMA Private Futures Research Bot
 *
 * Monitored setup observation engine.
 *
 * Responsibilities:
 * - wait for proposed entry activation
 * - observe price path using perpetual-futures candles
 * - detect stop-loss / target touches
 * - detect ambiguous candles where TP and SL both touched
 * - track favorable/adverse movement
 * - periodically re-evaluate the research thesis
 * - finalize terminal monitored outcomes
 *
 * IMPORTANT:
 * - Observational only.
 * - No orders.
 * - No position opening.
 * - No execution authority.
 */

import BOT_CONFIG from "../config/botConfig.js";

import getBotResearchMarketEvidence
  from "../research/botResearchMarketProvider.js";

import {
  runAllBotResearchEngines,
} from "../research/botResearchEngines.js";

import determineBotDirection
  from "../direction/botDirectionEngine.js";

import {
  getMonitoredSetup,
  updateMonitoredSetup,
  appendMonitorObservation,
  isTerminalMonitorStatus,
} from "./botSetupMonitorStore.js";

/*
 * ---------------------------------------------------------
 * HELPERS
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

function pctDistance(a, b) {
  const x = finiteOrNull(a);
  const y = finiteOrNull(b);

  if (
    x === null ||
    y === null ||
    x <= 0
  ) {
    return null;
  }

  return (
    Math.abs(y - x) /
    x
  ) * 100;
}

function percentChange(from, to) {
  const a = finiteOrNull(from);
  const b = finiteOrNull(to);

  if (
    a === null ||
    b === null ||
    a <= 0
  ) {
    return null;
  }

  return (
    (b - a) /
    a
  ) * 100;
}

function normalizeDirection(value) {
  if (!value) {
    return null;
  }

  const direction =
    String(value).toUpperCase();

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

function directionLabel(direction) {
  return direction === "LONG"
    ? "BULL"
    : direction === "SHORT"
      ? "BEAR"
      : null;
}

function isoNow() {
  return new Date().toISOString();
}

/*
 * ---------------------------------------------------------
 * PRICE TOUCH HELPERS
 * ---------------------------------------------------------
 */

function candleTouchesPrice(
  candle,
  price
) {
  const high =
    finiteOrNull(candle?.high);

  const low =
    finiteOrNull(candle?.low);

  const level =
    finiteOrNull(price);

  if (
    high === null ||
    low === null ||
    level === null
  ) {
    return false;
  }

  return (
    low <= level &&
    high >= level
  );
}

function candleHitsStop(
  candle,
  direction,
  stop
) {
  const high =
    finiteOrNull(candle?.high);

  const low =
    finiteOrNull(candle?.low);

  const level =
    finiteOrNull(stop);

  if (
    high === null ||
    low === null ||
    level === null
  ) {
    return false;
  }

  if (direction === "LONG") {
    return low <= level;
  }

  if (direction === "SHORT") {
    return high >= level;
  }

  return false;
}

function candleHitsTarget(
  candle,
  direction,
  target
) {
  const high =
    finiteOrNull(candle?.high);

  const low =
    finiteOrNull(candle?.low);

  const level =
    finiteOrNull(target);

  if (
    high === null ||
    low === null ||
    level === null
  ) {
    return false;
  }

  if (direction === "LONG") {
    return high >= level;
  }

  if (direction === "SHORT") {
    return low <= level;
  }

  return false;
}

/*
 * ---------------------------------------------------------
 * TRACKING
 * ---------------------------------------------------------
 */

function updateTracking(
  monitor,
  candles
) {
  const entry =
    finiteOrNull(monitor.entry);

  const direction =
    normalizeDirection(
      monitor.direction
    );

  let highest =
    finiteOrNull(
      monitor.tracking?.highestPrice
    );

  let lowest =
    finiteOrNull(
      monitor.tracking?.lowestPrice
    );

  for (const candle of candles) {
    const high =
      finiteOrNull(candle?.high);

    const low =
      finiteOrNull(candle?.low);

    if (high !== null) {
      highest =
        highest === null
          ? high
          : Math.max(
              highest,
              high
            );
    }

    if (low !== null) {
      lowest =
        lowest === null
          ? low
          : Math.min(
              lowest,
              low
            );
    }
  }

  let mfe = null;
  let mae = null;

  if (
    entry !== null &&
    direction === "LONG"
  ) {
    if (highest !== null) {
      mfe =
        Math.max(
          0,
          percentChange(
            entry,
            highest
          ) ?? 0
        );
    }

    if (lowest !== null) {
      mae =
        Math.min(
          0,
          percentChange(
            entry,
            lowest
          ) ?? 0
        );
    }
  }

  if (
    entry !== null &&
    direction === "SHORT"
  ) {
    if (lowest !== null) {
      const move =
        percentChange(
          entry,
          lowest
        );

      mfe =
        move === null
          ? null
          : Math.max(
              0,
              -move
            );
    }

    if (highest !== null) {
      const move =
        percentChange(
          entry,
          highest
        );

      mae =
        move === null
          ? null
          : Math.min(
              0,
              -move
            );
    }
  }

  return {
    highestPrice:
      highest,

    lowestPrice:
      lowest,

    maximumFavorableExcursionPercent:
      mfe,

    maximumAdverseExcursionPercent:
      mae,

    observations:
      Number(
        monitor.tracking
          ?.observations || 0
      ) + 1,
  };
}

/*
 * ---------------------------------------------------------
 * TERMINAL RESULT
 * ---------------------------------------------------------
 */

function createTerminalResult({
  monitor,
  status,
  candle,
  reason,
}) {
  const completedAt =
    isoNow();

  let outcome = null;
  let exitPrice = null;
  let rMultiple = null;

  if (status === "TARGET_HIT") {
    outcome = "WIN";

    exitPrice =
      monitor.target;

    const configuredRR =
      finiteOrNull(
        monitor.original
          ?.setup
          ?.riskReward
      );

    if (configuredRR !== null) {
      rMultiple =
        configuredRR;
    } else {
      const risk =
        Math.abs(
          monitor.entry -
          monitor.stop
        );

      const reward =
        Math.abs(
          monitor.target -
          monitor.entry
        );

      rMultiple =
        risk > 0
          ? reward / risk
          : null;
    }
  }

  if (status === "STOP_HIT") {
    outcome = "LOSS";

    exitPrice =
      monitor.stop;

    rMultiple =
      -1;
  }

  if (
    status ===
    "AMBIGUOUS_BOTH_TOUCHED"
  ) {
    outcome =
      "AMBIGUOUS";

    exitPrice =
      null;

    rMultiple =
      null;
  }

  return {
    outcome,

    reason,

    direction:
      monitor.direction,

    researchDirection:
      directionLabel(
        monitor.direction
      ),

    entryPrice:
      monitor.entry,

    stopPrice:
      monitor.stop,

    targetPrice:
      monitor.target,

    exitPrice,

    rMultiple,

    candle: candle
      ? {
          openTime:
            finiteOrNull(
              candle.openTime
            ),

          open:
            finiteOrNull(
              candle.open
            ),

          high:
            finiteOrNull(
              candle.high
            ),

          low:
            finiteOrNull(
              candle.low
            ),

          close:
            finiteOrNull(
              candle.close
            ),
        }
      : null,

    entryTriggeredAt:
      monitor.entryTriggeredAt,

    completedAt,

    executionAuthority:
      false,

    liveExecution:
      false,
  };
}

/*
 * ---------------------------------------------------------
 * PRICE PATH PROCESSING
 * ---------------------------------------------------------
 */

function processPricePath(
  monitor,
  candles,
  cfg
) {
  let status =
    monitor.status;

  let entryTriggeredAt =
    monitor.entryTriggeredAt;

  let terminalResult =
    null;

  let terminalCandle =
    null;

  let lastProcessedCandleOpenTime =
    monitor.lastProcessedCandleOpenTime;

  /*
   * Process candles oldest -> newest.
   *
   * The provider already normalizes candles into
   * chronological order.
   */
  for (const candle of candles) {
    const openTime =
      finiteOrNull(
        candle?.openTime
      );

    if (openTime === null) {
      continue;
    }

    /*
     * Skip candles already fully considered by
     * previous monitoring cycles.
     */
    if (
      lastProcessedCandleOpenTime !== null &&
      openTime <
        lastProcessedCandleOpenTime
    ) {
      continue;
    }

    /*
     * -----------------------------------------------------
     * WAITING FOR ENTRY
     * -----------------------------------------------------
     */
    if (
      status ===
      "WAITING_ENTRY"
    ) {
      const entryTouched =
        candleTouchesPrice(
          candle,
          monitor.entry
        );

      if (!entryTouched) {
        lastProcessedCandleOpenTime =
          openTime;

        continue;
      }

      status =
        "ACTIVE";

      entryTriggeredAt =
        new Date(
          openTime
        ).toISOString();

      /*
       * IMPORTANT:
       *
       * The same candle may contain:
       * - entry
       * - stop
       * - target
       *
       * OHLC does not reveal intrabar ordering.
       *
       * We therefore inspect conservatively.
       */
      const stopHit =
        candleHitsStop(
          candle,
          monitor.direction,
          monitor.stop
        );

      const targetHit =
        candleHitsTarget(
          candle,
          monitor.direction,
          monitor.target
        );

      if (
        stopHit &&
        targetHit
      ) {
        if (
          cfg.ambiguousCandlePolicy ===
          "RECORD_AMBIGUOUS"
        ) {
          status =
            "AMBIGUOUS_BOTH_TOUCHED";

          terminalCandle =
            candle;

          terminalResult =
            createTerminalResult({
              monitor: {
                ...monitor,
                status,
                entryTriggeredAt,
              },

              status,

              candle,

              reason:
                "ENTRY_STOP_AND_TARGET_WITHIN_SAME_UNRESOLVED_CANDLE",
            });

          lastProcessedCandleOpenTime =
            openTime;

          break;
        }
      }

      /*
       * Entry and stop in the same candle cannot
       * safely be ordered from OHLC alone.
       *
       * Treat it as ambiguous rather than inventing
       * a LOSS or pretending the stop was not touched.
       */
      if (stopHit) {
        status =
          "AMBIGUOUS_BOTH_TOUCHED";

        terminalCandle =
          candle;

        terminalResult =
          createTerminalResult({
            monitor: {
              ...monitor,
              status,
              entryTriggeredAt,
            },

            status,

            candle,

            reason:
              "ENTRY_AND_STOP_WITHIN_SAME_UNRESOLVED_CANDLE",
          });

        lastProcessedCandleOpenTime =
          openTime;

        break;
      }

      /*
       * Likewise, entry and target inside one candle
       * cannot safely be ordered.
       */
      if (targetHit) {
        status =
          "AMBIGUOUS_BOTH_TOUCHED";

        terminalCandle =
          candle;

        terminalResult =
          createTerminalResult({
            monitor: {
              ...monitor,
              status,
              entryTriggeredAt,
            },

            status,

            candle,

            reason:
              "ENTRY_AND_TARGET_WITHIN_SAME_UNRESOLVED_CANDLE",
          });

        lastProcessedCandleOpenTime =
          openTime;

        break;
      }

      lastProcessedCandleOpenTime =
        openTime;

      continue;
    }

    /*
     * -----------------------------------------------------
     * ACTIVE SETUP
     * -----------------------------------------------------
     */
    if (status === "ACTIVE") {
      const stopHit =
        candleHitsStop(
          candle,
          monitor.direction,
          monitor.stop
        );

      const targetHit =
        candleHitsTarget(
          candle,
          monitor.direction,
          monitor.target
        );

      if (
        stopHit &&
        targetHit
      ) {
        status =
          "AMBIGUOUS_BOTH_TOUCHED";

        terminalCandle =
          candle;

        terminalResult =
          createTerminalResult({
            monitor: {
              ...monitor,
              entryTriggeredAt,
            },

            status,

            candle,

            reason:
              "STOP_AND_TARGET_WITHIN_SAME_UNRESOLVED_CANDLE",
          });

        lastProcessedCandleOpenTime =
          openTime;

        break;
      }

      if (stopHit) {
        status =
          "STOP_HIT";

        terminalCandle =
          candle;

        terminalResult =
          createTerminalResult({
            monitor: {
              ...monitor,
              entryTriggeredAt,
            },

            status,

            candle,

            reason:
              "STOP_PRICE_TOUCHED",
          });

        lastProcessedCandleOpenTime =
          openTime;

        break;
      }

      if (targetHit) {
        status =
          "TARGET_HIT";

        terminalCandle =
          candle;

        terminalResult =
          createTerminalResult({
            monitor: {
              ...monitor,
              entryTriggeredAt,
            },

            status,

            candle,

            reason:
              "TARGET_PRICE_TOUCHED",
          });

        lastProcessedCandleOpenTime =
          openTime;

        break;
      }
    }

    lastProcessedCandleOpenTime =
      openTime;
  }

  return {
    status,

    entryTriggeredAt,

    terminalResult,

    terminalCandle,

    lastProcessedCandleOpenTime,
  };
}

/*
 * ---------------------------------------------------------
 * ENTRY EXPIRATION
 * ---------------------------------------------------------
 */

function entryExpired(
  monitor,
  cfg
) {
  if (
    monitor.status !==
    "WAITING_ENTRY"
  ) {
    return false;
  }

  const createdAt =
    Date.parse(
      monitor.createdAt
    );

  if (
    !Number.isFinite(
      createdAt
    )
  ) {
    return false;
  }

  return (
    Date.now() -
      createdAt >=
    cfg.maximumWaitingEntryAgeMs
  );
}

/*
 * ---------------------------------------------------------
 * THESIS RESEARCH
 * ---------------------------------------------------------
 */

function shouldRefreshResearch(
  monitor,
  cfg
) {
  if (
    !monitor.lastResearchObservedAt
  ) {
    return true;
  }

  const last =
    Date.parse(
      monitor.lastResearchObservedAt
    );

  if (
    !Number.isFinite(last)
  ) {
    return true;
  }

  return (
    Date.now() - last >=
    cfg.researchRefreshIntervalMs
  );
}

async function refreshResearchThesis(
  monitor,
  asset,
  options,
  cfg
) {
  if (
    !shouldRefreshResearch(
      monitor,
      cfg
    )
  ) {
    return null;
  }

  /*
   * Use the normal research timeframe here.
   *
   * TP/SL monitoring uses 1-minute candles separately.
   */
  const evidence =
    await getBotResearchMarketEvidence(
      asset,
      options.research
    );

  const engines =
    runAllBotResearchEngines(
      asset,
      evidence
    );

  const current =
    determineBotDirection(
      {
        symbol:
          monitor.symbol,

        asset,

        engines,
      },

      options.direction
    );

  const originalConfidence =
    finiteOrNull(
      monitor.original
        ?.directionDecision
        ?.confidence
    ) ?? 0;

  const currentConfidence =
    finiteOrNull(
      current
        ?.directionDecision
        ?.confidence
    ) ?? 0;

  const originalSeparation =
    finiteOrNull(
      monitor.original
        ?.directionDecision
        ?.separation
    ) ?? 0;

  const currentSeparation =
    finiteOrNull(
      current
        ?.directionDecision
        ?.separation
    ) ?? 0;

  const rawCurrentDirection =
    normalizeDirection(
      current
        ?.directionDecision
        ?.rawDirection
    );

  const directionChanged =
    Boolean(
      rawCurrentDirection &&
      rawCurrentDirection !==
        monitor.direction
    );

  const weakening =
    (
      originalConfidence -
        currentConfidence >=
      cfg.weakeningConfidenceDrop
    ) ||
    (
      originalSeparation -
        currentSeparation >=
      cfg.weakeningSeparationDrop
    );

  return {
    observedAt:
      isoNow(),

    evidence,

    engines,

    directionDecision:
      current.directionDecision,

    changes: {
      confidence:
        currentConfidence -
        originalConfidence,

      separation:
        currentSeparation -
        originalSeparation,

      directionChanged,

      weakening,
    },
  };
}

/*
 * ---------------------------------------------------------
 * MAIN MONITOR REFRESH
 * ---------------------------------------------------------
 */

export async function refreshMonitoredSetup(
  id,
  options = {}
) {
  const monitor =
    getMonitoredSetup(id);

  if (!monitor) {
    throw new Error(
      "MONITORED_SETUP_NOT_FOUND"
    );
  }

  /*
   * Terminal monitors are immutable from a market
   * observation perspective.
   */
  if (
    isTerminalMonitorStatus(
      monitor.status
    )
  ) {
    return monitor;
  }

  const cfg = {
    ...BOT_CONFIG.monitoring,
    ...(options.monitoring || {}),
  };

  if (!cfg.enabled) {
    return monitor;
  }

  const asset =
    monitor.original?.asset || {
      symbol:
        monitor.symbol,

      productId:
        monitor.original
          ?.setup
          ?.productId,
    };

  /*
   * -------------------------------------------------------
   * PRICE-PATH EVIDENCE
   * -------------------------------------------------------
   *
   * This is intentionally separate from deep research.
   */
  const priceEvidence =
    await getBotResearchMarketEvidence(
      asset,
      {
        candleInterval:
          cfg.priceMonitorCandleInterval,

        candleLimit:
          cfg.priceMonitorCandleLimit,

        /*
         * Price monitoring does not need a large
         * order book.
         */
        depthLimit:
          Math.min(
            Number(
              BOT_CONFIG.research
                .depthLimit || 100
            ),
            20
          ),

        timeoutMs:
          BOT_CONFIG.research
            .timeoutMs,
      }
    );

  const candles =
    Array.isArray(
      priceEvidence?.candles
    )
      ? priceEvidence.candles
      : [];

  if (!candles.length) {
    throw new Error(
      "MONITOR_PRICE_CANDLES_UNAVAILABLE"
    );
  }

  /*
   * Only process candles relevant to this monitor.
   */
  const createdAtMs =
    Date.parse(
      monitor.createdAt
    );

  const relevantCandles =
    candles.filter(
      (candle) => {
        const openTime =
          finiteOrNull(
            candle?.openTime
          );

        if (openTime === null) {
          return false;
        }

        if (
          Number.isFinite(
            createdAtMs
          ) &&
          openTime <
            createdAtMs -
              60_000
        ) {
          return false;
        }

        return true;
      }
    );

  const path =
    processPricePath(
      monitor,
      relevantCandles,
      cfg
    );

  const tracking =
    updateTracking(
      monitor,
      relevantCandles
    );

  /*
   * -------------------------------------------------------
   * TERMINAL RESULT
   * -------------------------------------------------------
   */
  if (path.terminalResult) {
    const completedAt =
      path.terminalResult
        .completedAt;

    const observation = {
      observedAt:
        isoNow(),

      type:
        "TERMINAL",

      status:
        path.status,

      markPrice:
        finiteOrNull(
          priceEvidence.markPrice
        ),

      candle:
        path.terminalCandle,

      result:
        path.terminalResult,

      tracking,

      source:
        priceEvidence.source,

      exchange:
        priceEvidence.exchange,

      executionAuthority:
        false,
    };

    return appendMonitorObservation(
      id,
      observation,
      {
        status:
          path.status,

        entryTriggeredAt:
          path.entryTriggeredAt,

        completedAt,

        result:
          path.terminalResult,

        tracking,

        lastPriceObservedAt:
          isoNow(),

        lastProcessedCandleOpenTime:
          path.lastProcessedCandleOpenTime,
      }
    );
  }

  /*
   * -------------------------------------------------------
   * ENTRY EXPIRATION
   * -------------------------------------------------------
   */
  const currentForExpiry = {
    ...monitor,

    status:
      path.status,

    entryTriggeredAt:
      path.entryTriggeredAt,
  };

  if (
    entryExpired(
      currentForExpiry,
      cfg
    )
  ) {
    const completedAt =
      isoNow();

    const result = {
      outcome:
        "NO_ENTRY",

      reason:
        "ENTRY_NOT_TRIGGERED_BEFORE_EXPIRATION",

      direction:
        monitor.direction,

      researchDirection:
        directionLabel(
          monitor.direction
        ),

      entryPrice:
        monitor.entry,

      stopPrice:
        monitor.stop,

      targetPrice:
        monitor.target,

      exitPrice:
        null,

      rMultiple:
        null,

      completedAt,

      executionAuthority:
        false,

      liveExecution:
        false,
    };

    const observation = {
      observedAt:
        completedAt,

      type:
        "TERMINAL",

      status:
        "ENTRY_EXPIRED",

      result,

      tracking,

      executionAuthority:
        false,
    };

    return appendMonitorObservation(
      id,
      observation,
      {
        status:
          "ENTRY_EXPIRED",

        completedAt,

        result,

        tracking,

        lastPriceObservedAt:
          isoNow(),

        lastProcessedCandleOpenTime:
          path.lastProcessedCandleOpenTime,
      }
    );
  }

  /*
   * -------------------------------------------------------
   * THESIS RE-EVALUATION
   * -------------------------------------------------------
   */
  let thesis = null;

  try {
    thesis =
      await refreshResearchThesis(
        {
          ...monitor,

          status:
            path.status,

          entryTriggeredAt:
            path.entryTriggeredAt,
        },

        asset,
        options,
        cfg
      );
  } catch (error) {
    /*
     * A temporary research failure must not terminate
     * price monitoring.
     */
    console.error(
      `[BOT MONITOR] thesis refresh failed for ${monitor.symbol}:`,
      error?.message || error
    );
  }

  const mark =
    finiteOrNull(
      priceEvidence.markPrice
    );

  const nearStop =
    (
      pctDistance(
        monitor.stop,
        mark
      ) ?? Infinity
    ) <=
    cfg.reboundDistanceToStopPercent;

  let observationStatus =
    path.status;

  /*
   * WAITING_ENTRY and ACTIVE are lifecycle states.
   *
   * Weakening/strengthening are observation states and
   * should not replace the lifecycle state permanently.
   */
  let thesisState =
    null;

  if (thesis) {
    const decision =
      thesis.directionDecision;

    if (
      thesis.changes
        .directionChanged ||
      !decision?.qualified
    ) {
      thesisState =
        "THESIS_WEAKENING";
    } else if (
      nearStop &&
      path.status ===
        "ACTIVE"
    ) {
      thesisState =
        "REBOUND_WATCH";
    } else if (
      thesis.changes
        .weakening
    ) {
      thesisState =
        "WEAKENING";
    } else if (
      Number(
        thesis.changes
          .confidence
      ) > 0
    ) {
      thesisState =
        "STRENGTHENING";
    } else {
      thesisState =
        "STABLE";
    }
  } else if (
    nearStop &&
    path.status ===
      "ACTIVE"
  ) {
    thesisState =
      "REBOUND_WATCH";
  }

  const observedAt =
    isoNow();

  const observation = {
    observedAt,

    type:
      "MONITOR",

    status:
      observationStatus,

    thesisState,

    markPrice:
      mark,

    lastPrice:
      finiteOrNull(
        priceEvidence.lastPrice
      ),

    indexPrice:
      finiteOrNull(
        priceEvidence.indexPrice
      ),

    entryTriggered:
      Boolean(
        path.entryTriggeredAt
      ),

    entryTriggeredAt:
      path.entryTriggeredAt,

    tracking,

    changes:
      thesis?.changes ?? null,

    directionDecision:
      thesis
        ?.directionDecision ??
      null,

    engines:
      thesis?.engines ??
      null,

    source:
      priceEvidence.source,

    exchange:
      priceEvidence.exchange,

    executionAuthority:
      false,
  };

  const patch = {
    status:
      path.status,

    entryTriggeredAt:
      path.entryTriggeredAt,

    tracking,

    lastPriceObservedAt:
      observedAt,

    lastProcessedCandleOpenTime:
      path.lastProcessedCandleOpenTime,
  };

  if (thesis) {
    patch.lastResearchObservedAt =
      thesis.observedAt;
  }

  return appendMonitorObservation(
    id,
    observation,
    patch
  );
}

export default refreshMonitoredSetup;