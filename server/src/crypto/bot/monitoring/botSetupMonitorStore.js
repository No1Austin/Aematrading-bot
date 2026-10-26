/**
 * AEMA Private Futures Research Bot
 *
 * Persistent monitored-setup store.
 *
 * Responsibilities:
 * - register qualified research setups for monitoring
 * - persist monitors across server restarts
 * - maintain monitoring observations
 * - preserve terminal setup outcomes
 *
 * IMPORTANT:
 * - Monitoring is observational only.
 * - This store does not place orders.
 * - This store does not open positions.
 * - This store has no execution authority.
 */

import fs from "node:fs";
import path from "node:path";

/*
 * ---------------------------------------------------------
 * PERSISTENCE
 * ---------------------------------------------------------
 */

const monitorPath = path.resolve(
  process.cwd(),
  process.env.AEMA_BOT_MONITOR_STORE_PATH ||
    "./data/aema-bot-monitored-setups.json"
);

const fresh = () => ({
  version: 2,
  monitors: [],
  updatedAt: new Date().toISOString(),
});

/*
 * ---------------------------------------------------------
 * HELPERS
 * ---------------------------------------------------------
 */

function createId() {
  return (
    `mon_${Date.now()}_` +
    Math.random().toString(36).slice(2, 9)
  );
}

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

function clone(value) {
  return value == null
    ? value
    : structuredClone(value);
}

function normalizeDirection(setup = {}) {
  const raw =
    setup.direction ??
    setup.side ??
    null;

  if (!raw) {
    return null;
  }

  const direction =
    String(raw).toUpperCase();

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

/*
 * ---------------------------------------------------------
 * LOAD
 * ---------------------------------------------------------
 */

function load() {
  try {
    if (!fs.existsSync(monitorPath)) {
      return fresh();
    }

    const parsed = JSON.parse(
      fs.readFileSync(
        monitorPath,
        "utf8"
      )
    );

    return {
      ...fresh(),
      ...parsed,

      monitors:
        Array.isArray(parsed?.monitors)
          ? parsed.monitors
          : [],
    };
  } catch (error) {
    console.error(
      "[BOT MONITOR STORE] load:",
      error?.message || error
    );

    return fresh();
  }
}

let state = load();

/*
 * ---------------------------------------------------------
 * SAVE
 * ---------------------------------------------------------
 */

function save() {
  fs.mkdirSync(
    path.dirname(monitorPath),
    {
      recursive: true,
    }
  );

  state.updatedAt =
    new Date().toISOString();

  const tmp =
    `${monitorPath}.tmp`;

  fs.writeFileSync(
    tmp,
    JSON.stringify(
      state,
      null,
      2
    )
  );

  fs.renameSync(
    tmp,
    monitorPath
  );
}

/*
 * ---------------------------------------------------------
 * TERMINAL STATES
 * ---------------------------------------------------------
 */

export function isTerminalMonitorStatus(
  status
) {
  return [
    "TARGET_HIT",
    "STOP_HIT",
    "AMBIGUOUS_BOTH_TOUCHED",
    "ENTRY_EXPIRED",
    "CANCELLED",
  ].includes(status);
}

/*
 * ---------------------------------------------------------
 * CREATE
 * ---------------------------------------------------------
 */

export function createMonitoredSetup(
  candidate,
  scenario = null,
  { userId } = {}
) {
  if (typeof userId !== "string" || !/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(userId)) {
    throw new Error("SUPABASE_USER_REQUIRED");
  }
  if (!candidate?.setup?.approved) {
    throw new Error(
      "ONLY_APPROVED_SETUP_CAN_BE_MONITORED"
    );
  }

  const setup =
    candidate.setup;

  const direction =
    normalizeDirection(setup);

  if (!direction) {
    throw new Error(
      "MONITOR_DIRECTION_REQUIRED"
    );
  }

  const entry =
    finiteOrNull(setup.entry);

  const stop =
    finiteOrNull(setup.stop);

  const target =
    finiteOrNull(setup.target);

  if (
    entry === null ||
    entry <= 0 ||
    stop === null ||
    stop <= 0 ||
    target === null ||
    target <= 0
  ) {
    throw new Error(
      "MONITOR_INVALID_PRICE_LEVELS"
    );
  }

  /*
   * Validate LONG geometry:
   *
   * stop < entry < target
   */
  if (
    direction === "LONG" &&
    !(
      stop < entry &&
      target > entry
    )
  ) {
    throw new Error(
      "MONITOR_INVALID_LONG_GEOMETRY"
    );
  }

  /*
   * Validate SHORT geometry:
   *
   * target < entry < stop
   */
  if (
    direction === "SHORT" &&
    !(
      target < entry &&
      stop > entry
    )
  ) {
    throw new Error(
      "MONITOR_INVALID_SHORT_GEOMETRY"
    );
  }

  const now =
    new Date().toISOString();

  const monitor = {
    id:
      createId(),

    userId,

    setupId:
      candidate.setupId ??
      null,

    symbol:
      candidate.symbol ??
      candidate.asset?.symbol ??
      null,

    /*
     * Monitoring does not assume the proposed
     * entry has already been filled.
     */
    status:
      "WAITING_ENTRY",

    direction,

    entry,

    stop,

    target,

    createdAt:
      now,

    updatedAt:
      now,

    entryTriggeredAt:
      null,

    completedAt:
      null,

    lastPriceObservedAt:
      null,

    lastResearchObservedAt:
      null,

    /*
     * Used to avoid unnecessarily processing
     * historical candles repeatedly.
     */
    lastProcessedCandleOpenTime:
      null,

    result:
      null,

    scenario:
      clone(scenario),

    original: {
      asset:
        clone(
          candidate.asset
        ),

      directionDecision:
        clone(
          candidate.directionDecision
        ),

      researchRankScore:
        finiteOrNull(
          candidate.researchRankScore
        ),

      engines:
        clone(
          candidate.engines
        ),

      setup:
        clone(
          candidate.setup
        ),
    },

    /*
     * Price-path statistics.
     */
    tracking: {
      highestPrice:
        null,

      lowestPrice:
        null,

      maximumFavorableExcursionPercent:
        null,

      maximumAdverseExcursionPercent:
        null,

      observations:
        0,
    },

    lastObservation:
      null,

    history:
      [],

    /*
     * Prevent duplicate learning records after
     * terminal completion.
     */
    learningRecorded:
      false,

    learningRecordedAt:
      null,

    executionAuthority:
      false,

    liveExecution:
      false,
  };

  if (!monitor.symbol) {
    throw new Error(
      "MONITOR_SYMBOL_REQUIRED"
    );
  }

  state.monitors.push(
    monitor
  );

  save();

  return clone(monitor);
}

/*
 * ---------------------------------------------------------
 * GET ONE
 * ---------------------------------------------------------
 */

export function getMonitoredSetup(
  id
) {
  const monitor =
    state.monitors.find(
      (row) =>
        row.id === id
    );

  return monitor
    ? clone(monitor)
    : null;
}

/*
 * ---------------------------------------------------------
 * LIST
 * ---------------------------------------------------------
 */

export function listMonitoredSetups(
  options = {}
) {
  const {
    activeOnly = false,
    terminalOnly = false,
  } = options;

  let rows =
    state.monitors;

  if (activeOnly) {
    rows = rows.filter(
      (row) =>
        !isTerminalMonitorStatus(
          row.status
        )
    );
  }

  if (terminalOnly) {
    rows = rows.filter(
      (row) =>
        isTerminalMonitorStatus(
          row.status
        )
    );
  }

  return rows
    .slice()
    .sort(
      (a, b) =>
        Date.parse(
          b.createdAt
        ) -
        Date.parse(
          a.createdAt
        )
    )
    .map(clone);
}

/*
 * ---------------------------------------------------------
 * UPDATE
 * ---------------------------------------------------------
 */

export function updateMonitoredSetup(
  id,
  patch
) {
  const index =
    state.monitors.findIndex(
      (row) =>
        row.id === id
    );

  if (index < 0) {
    return null;
  }

  const current =
    state.monitors[index];

  /*
   * Once a monitor reaches a terminal market state,
   * another observation must not reactivate it.
   *
   * Metadata such as learningRecorded can still
   * be updated without changing the terminal status.
   */
  if (
    isTerminalMonitorStatus(
      current.status
    ) &&
    patch?.status &&
    patch.status !==
      current.status
  ) {
    throw new Error(
      "TERMINAL_MONITOR_CANNOT_CHANGE_STATUS"
    );
  }

  const next = {
    ...current,
    ...clone(patch),

    updatedAt:
      new Date().toISOString(),
  };

  state.monitors[index] =
    next;

  save();

  return clone(next);
}

/*
 * ---------------------------------------------------------
 * APPEND OBSERVATION
 * ---------------------------------------------------------
 */

export function appendMonitorObservation(
  id,
  observation,
  patch = {}
) {
  const monitor =
    getMonitoredSetup(id);

  if (!monitor) {
    return null;
  }

  const history = [
    ...(monitor.history || []),
    clone(observation),
  ].slice(-500);

  return updateMonitoredSetup(
    id,
    {
      ...patch,

      lastObservation:
        clone(observation),

      history,
    }
  );
}

/*
 * ---------------------------------------------------------
 * MARK LEARNING RECORDED
 * ---------------------------------------------------------
 */

export function markMonitorLearningRecorded(
  id
) {
  return updateMonitoredSetup(
    id,
    {
      learningRecorded:
        true,

      learningRecordedAt:
        new Date().toISOString(),
    }
  );
}

/*
 * ---------------------------------------------------------
 * CANCEL
 * ---------------------------------------------------------
 */

export function cancelMonitoredSetup(
  id,
  reason = "USER_CANCELLED"
) {
  const monitor =
    getMonitoredSetup(id);

  if (!monitor) {
    throw new Error(
      "MONITORED_SETUP_NOT_FOUND"
    );
  }

  if (
    isTerminalMonitorStatus(
      monitor.status
    )
  ) {
    return monitor;
  }

  const now =
    new Date().toISOString();

  return updateMonitoredSetup(
    id,
    {
      status:
        "CANCELLED",

      completedAt:
        now,

      result: {
        outcome:
          "CANCELLED",

        reason,

        completedAt:
          now,

        executionAuthority:
          false,

        liveExecution:
          false,
      },
    }
  );
}

/*
 * ---------------------------------------------------------
 * STORE INFORMATION
 * ---------------------------------------------------------
 */

export function getMonitorStoreInfo() {
  const active =
    state.monitors.filter(
      (row) =>
        !isTerminalMonitorStatus(
          row.status
        )
    ).length;

  const completed =
    state.monitors.filter(
      (row) =>
        isTerminalMonitorStatus(
          row.status
        )
    ).length;

  return {
    monitorPath,

    count:
      state.monitors.length,

    active,

    completed,

    updatedAt:
      state.updatedAt,
  };
}

/*
 * ---------------------------------------------------------
 * DEFAULT EXPORT
 * ---------------------------------------------------------
 */

export default {
  createMonitoredSetup,

  getMonitoredSetup,

  listMonitoredSetups,

  updateMonitoredSetup,

  appendMonitorObservation,

  markMonitorLearningRecorded,

  cancelMonitoredSetup,

  isTerminalMonitorStatus,

  getMonitorStoreInfo,
};