/**
 * AEMA CRYPTO
 * Phase 5.20
 *
 * STATEFUL PAPER TRADING RUNTIME
 *
 * Purpose:
 * - maintain state across repeated paper-trading cycles
 * - prevent duplicate/concurrent symbol processing
 * - preserve actual exchange position truth
 * - preserve partial-fill truth
 * - prevent accidental position flips
 * - preserve protective-stop state
 * - prevent exit-pending positions from rebuilding
 * - provide deterministic runtime actions
 *
 * IMPORTANT:
 * This runtime has NO live execution authority.
 *
 * It does not make network calls.
 * It does not submit exchange orders.
 * It coordinates state only.
 */

const LIVE_EXECUTION_ENABLED = false;

const TERMINAL_EXECUTION_STATES =
  new Set([
    "FILLED",
    "CANCELLED",
    "REJECTED",
    "EXPIRED",
    "FAILED",
  ]);

const ACTIVE_EXECUTION_STATES =
  new Set([
    "CREATED",
    "SUBMITTED",
    "ACKNOWLEDGED",
    "PARTIALLY_FILLED",
  ]);

const EXIT_ACTIONS =
  new Set([
    "EXIT_POSITION",
    "EMERGENCY_EXIT",
    "CLOSE_POSITION",
    "EMERGENCY_CLOSE",
  ]);

const RISK_REDUCTION_ACTIONS =
  new Set([
    "REDUCE_EXPOSURE",
    "EXIT_POSITION",
    "EMERGENCY_EXIT",
    "CLOSE_POSITION",
    "EMERGENCY_CLOSE",
    "PROTECT_POSITION",
    "STOP_UPDATE",
    "REPLACE_STOP",
  ]);

const RISK_INCREASING_ACTIONS =
  new Set([
    "OPEN_POSITION",
    "ADD_EXPOSURE",
    "OPEN",
    "INCREASE",
  ]);

function finite(
  value,
  fallback = 0,
) {
  const number =
    Number(value);

  return Number.isFinite(number)
    ? number
    : fallback;
}

function positive(
  value,
  fallback = 0,
) {
  return Math.max(
    0,
    finite(
      value,
      fallback,
    ),
  );
}

function normalizeSymbol(
  symbol,
) {
  return String(
    symbol ?? "",
  )
    .trim()
    .toUpperCase();
}

function normalizeDirection(
  direction,
) {
  const normalized =
    String(
      direction ?? "",
    ).toUpperCase();

  if (
    normalized === "LONG" ||
    normalized === "SHORT"
  ) {
    return normalized;
  }

  return "FLAT";
}

function normalizeAction(
  action,
) {
  return String(
    action ?? "NONE",
  ).toUpperCase();
}

function nowIso() {
  return new Date()
    .toISOString();
}

function clone(
  value,
) {
  if (
    value === undefined
  ) {
    return undefined;
  }

  return JSON.parse(
    JSON.stringify(value),
  );
}

function makePosition({
  symbol,
} = {}) {
  return {
    symbol:
      normalizeSymbol(symbol),

    direction:
      "FLAT",

    quantity:
      0,

    exposure:
      0,

    averageEntryPrice:
      null,

    stopPrice:
      null,

    lifecycleState:
      "CLOSED",

    exitPending:
      false,

    lastExecutionStatus:
      null,

    lastClientOrderId:
      null,

    updatedAt:
      null,
  };
}

export function createCryptoPaperTradingRuntime({
  paperOnly = true,
} = {}) {
  /*
   * Paper-only is deliberately hard enforced.
   *
   * Supplying paperOnly:false does NOT enable
   * live execution.
   */
  const runtimeState = {
    mode:
      "PAPER",

    paperOnly:
      true,

    liveExecutionEnabled:
      LIVE_EXECUTION_ENABLED,

    cycle:
      0,

    startedAt:
      nowIso(),

    symbols:
      new Map(),

    symbolLocks:
      new Set(),

    processedCycleKeys:
      new Set(),

    processedClientOrderIds:
      new Set(),
  };

  function getOrCreateSymbolState(
    symbol,
  ) {
    const key =
      normalizeSymbol(symbol);

    if (!key) {
      throw new Error(
        "RUNTIME_SYMBOL_REQUIRED",
      );
    }

    if (
      !runtimeState.symbols.has(
        key,
      )
    ) {
      runtimeState.symbols.set(
        key,
        {
          symbol:
            key,

          position:
            makePosition({
              symbol: key,
            }),

          activeOrder:
            null,

          protectiveStop:
            null,

          lastDecision:
            null,

          lastCycleKey:
            null,

          cycleCount:
            0,

          updatedAt:
            null,

            entryEngines:
  null,

riskPlan:
  null,

        },
      );
    }

    return runtimeState.symbols.get(
      key,
    );
  }

  function acquireSymbolLock(
    symbol,
  ) {
    const key =
      normalizeSymbol(symbol);

    if (
      runtimeState.symbolLocks.has(
        key,
      )
    ) {
      return false;
    }

    runtimeState.symbolLocks.add(
      key,
    );

    return true;
  }

  function releaseSymbolLock(
    symbol,
  ) {
    runtimeState.symbolLocks.delete(
      normalizeSymbol(symbol),
    );
  }

  function hasActiveOrder(
    symbolState,
  ) {
    const status =
      String(
        symbolState
          ?.activeOrder
          ?.status ??
        "",
      ).toUpperCase();

    return ACTIVE_EXECUTION_STATES.has(
      status,
    );
  }

  function validateRequestedDirection({
    symbolState,
    requestedDirection,
    action,
  }) {
    const currentDirection =
      normalizeDirection(
        symbolState
          ?.position
          ?.direction,
      );

    const requested =
      normalizeDirection(
        requestedDirection,
      );

    const normalizedAction =
      normalizeAction(action);

    /*
     * Risk reduction must always remain possible.
     */
    if (
      RISK_REDUCTION_ACTIONS.has(
        normalizedAction,
      )
    ) {
      return {
        approved: true,
        blocker: null,
      };
    }

    /*
     * No direct LONG -> SHORT or SHORT -> LONG flip.
     *
     * Existing position must first reach FLAT.
     */
    if (
      currentDirection !== "FLAT" &&
      requested !== "FLAT" &&
      currentDirection !== requested
    ) {
      return {
        approved: false,
        blocker:
          "DIRECT_POSITION_FLIP_BLOCKED",
      };
    }

    return {
      approved: true,
      blocker: null,
    };
  }

  function validateRiskIncrease({
    symbolState,
    action,
  }) {
    const normalizedAction =
      normalizeAction(action);

    if (
      !RISK_INCREASING_ACTIONS.has(
        normalizedAction,
      )
    ) {
      return {
        approved: true,
        blocker: null,
      };
    }

    if (
      symbolState
        ?.position
        ?.exitPending
    ) {
      return {
        approved: false,
        blocker:
          "EXIT_PENDING_CANNOT_INCREASE_RISK",
      };
    }

    if (
      hasActiveOrder(
        symbolState,
      )
    ) {
      return {
        approved: false,
        blocker:
          "ACTIVE_ORDER_ALREADY_EXISTS",
      };
    }

    return {
      approved: true,
      blocker: null,
    };
  }

  function beginCycle({
    symbol,
    cycleKey = null,
    action = "NONE",
    requestedDirection = "FLAT",
  } = {}) {
    const key =
      normalizeSymbol(symbol);

    if (!key) {
      return {
        approved: false,
        status:
          "RUNTIME_CYCLE_BLOCKED",
        blocker:
          "SYMBOL_REQUIRED",
        executionAuthority:
          false,
      };
    }

    const effectiveCycleKey =
      cycleKey ??
      `${key}:${runtimeState.cycle + 1}`;

    if (
      runtimeState
        .processedCycleKeys
        .has(
          effectiveCycleKey,
        )
    ) {
      return {
        approved: false,
        status:
          "RUNTIME_CYCLE_DUPLICATE",
        blocker:
          "DUPLICATE_CYCLE",
        symbol:
          key,
        cycleKey:
          effectiveCycleKey,
        executionAuthority:
          false,
      };
    }

    if (
      !acquireSymbolLock(
        key,
      )
    ) {
      return {
        approved: false,
        status:
          "RUNTIME_CYCLE_LOCKED",
        blocker:
          "SYMBOL_CYCLE_ALREADY_RUNNING",
        symbol:
          key,
        cycleKey:
          effectiveCycleKey,
        executionAuthority:
          false,
      };
    }

    const symbolState =
      getOrCreateSymbolState(
        key,
      );

    const directionCheck =
      validateRequestedDirection({
        symbolState,
        requestedDirection,
        action,
      });

    if (
      !directionCheck.approved
    ) {
      releaseSymbolLock(
        key,
      );

      return {
        approved: false,
        status:
          "RUNTIME_CYCLE_BLOCKED",
        blocker:
          directionCheck.blocker,
        symbol:
          key,
        cycleKey:
          effectiveCycleKey,
        executionAuthority:
          false,
      };
    }

    const riskCheck =
      validateRiskIncrease({
        symbolState,
        action,
      });

    if (
      !riskCheck.approved
    ) {
      releaseSymbolLock(
        key,
      );

      return {
        approved: false,
        status:
          "RUNTIME_CYCLE_BLOCKED",
        blocker:
          riskCheck.blocker,
        symbol:
          key,
        cycleKey:
          effectiveCycleKey,
        executionAuthority:
          false,
      };
    }

    runtimeState.cycle += 1;

    symbolState.cycleCount += 1;

    symbolState.lastCycleKey =
      effectiveCycleKey;

    symbolState.updatedAt =
      nowIso();

    return {
      approved: true,

      status:
        "RUNTIME_CYCLE_STARTED",

      symbol:
        key,

      cycleKey:
        effectiveCycleKey,

      runtimeCycle:
        runtimeState.cycle,

      currentPosition:
        clone(
          symbolState.position,
        ),

      executionAuthority:
        false,
    };
  }

  function completeCycle({
    symbol,
    cycleKey,
    decision = null,
  } = {}) {
    const key =
      normalizeSymbol(symbol);

    const symbolState =
      getOrCreateSymbolState(
        key,
      );

    if (cycleKey) {
      runtimeState
        .processedCycleKeys
        .add(
          cycleKey,
        );
    }

    symbolState.lastDecision =
      clone(decision);

      if (
  decision?.entryEngines
) {
  symbolState.entryEngines =
    clone(
      decision.entryEngines,
    );
}

if (
  decision?.riskPlan
) {
  symbolState.riskPlan =
    clone(
      decision.riskPlan,
    );
}

    symbolState.updatedAt =
      nowIso();

    releaseSymbolLock(
      key,
    );

    return {
      approved: true,
      status:
        "RUNTIME_CYCLE_COMPLETE",
      symbol:
        key,
      cycleKey:
        cycleKey ?? null,
      executionAuthority:
        false,
    };
  }

  function failCycle({
    symbol,
    cycleKey,
    error = null,
  } = {}) {
    const key =
      normalizeSymbol(symbol);

    releaseSymbolLock(
      key,
    );

    return {
      approved: false,
      status:
        "RUNTIME_CYCLE_FAILED",
      symbol:
        key,
      cycleKey:
        cycleKey ?? null,
      error:
        error
          ? String(
              error?.message ??
              error,
            )
          : null,
      executionAuthority:
        false,
    };
  }

  function registerOrder({
    symbol,
    order,
  } = {}) {
    const key =
      normalizeSymbol(symbol);

    const symbolState =
      getOrCreateSymbolState(
        key,
      );

    const clientOrderId =
      String(
        order?.clientOrderId ??
        "",
      ).trim();

    if (
      clientOrderId &&
      runtimeState
        .processedClientOrderIds
        .has(
          clientOrderId,
        )
    ) {
      return {
        approved: false,
        status:
          "ORDER_REGISTRATION_BLOCKED",
        blocker:
          "DUPLICATE_CLIENT_ORDER_ID",
        executionAuthority:
          false,
      };
    }

    if (
      hasActiveOrder(
        symbolState,
      )
    ) {
      return {
        approved: false,
        status:
          "ORDER_REGISTRATION_BLOCKED",
        blocker:
          "ACTIVE_ORDER_ALREADY_EXISTS",
        executionAuthority:
          false,
      };
    }

    symbolState.activeOrder = {
      ...clone(order),

      status:
        String(
          order?.status ??
          "CREATED",
        ).toUpperCase(),
    };

    if (clientOrderId) {
      runtimeState
        .processedClientOrderIds
        .add(
          clientOrderId,
        );
    }

    return {
      approved: true,
      status:
        "ORDER_REGISTERED",
      executionAuthority:
        false,
    };
  }

  function updateOrderState({
    symbol,
    executionState,
  } = {}) {
    const symbolState =
      getOrCreateSymbolState(
        symbol,
      );

    const status =
      String(
        executionState?.status ??
        "",
      ).toUpperCase();

    symbolState.activeOrder = {
      ...clone(
        symbolState.activeOrder ??
        {},
      ),

      ...clone(
        executionState ??
        {},
      ),

      status,
    };

    /*
     * Keep terminal order truth for inspection,
     * but it is no longer considered active.
     */
    if (
      TERMINAL_EXECUTION_STATES.has(
        status,
      )
    ) {
      symbolState.activeOrder = {
        ...symbolState.activeOrder,
        terminal:
          true,
      };
    }

    symbolState.position.lastExecutionStatus =
      status || null;

    symbolState.updatedAt =
      nowIso();

    return {
      approved: true,
      status:
        "ORDER_STATE_UPDATED",
      executionStatus:
        status,
      executionAuthority:
        false,
    };
  }

  function adoptExchangePosition({
    symbol,
    exchangePosition,
  } = {}) {
    const key =
      normalizeSymbol(symbol);

    const symbolState =
      getOrCreateSymbolState(
        key,
      );

    const quantity =
      positive(
        exchangePosition?.quantity,
      );

    let direction =
      normalizeDirection(
        exchangePosition?.direction,
      );

    if (
      quantity <= 0
    ) {
      direction =
        "FLAT";
    }

    symbolState.position = {
      ...symbolState.position,

      symbol:
        key,

      direction,

      quantity,

      exposure:
        direction === "FLAT"
          ? 0
          : positive(
              exchangePosition
                ?.exposure ??
              symbolState
                ?.position
                ?.exposure,
            ),

      averageEntryPrice:
        direction === "FLAT"
          ? null
          : (
              Number.isFinite(
                Number(
                  exchangePosition
                    ?.averageEntryPrice,
                ),
              )
                ? Number(
                    exchangePosition
                      .averageEntryPrice,
                  )
                : symbolState
                    ?.position
                    ?.averageEntryPrice ??
                  null
            ),

      lifecycleState:
        direction === "FLAT"
          ? "CLOSED"
          : (
              symbolState
                ?.position
                ?.exitPending
                ? "EXIT_PENDING"
                : "OPEN"
            ),

      /*
       * Once exchange truth confirms FLAT,
       * exit-pending may safely terminate.
       */
      exitPending:
        direction === "FLAT"
          ? false
          : Boolean(
              symbolState
                ?.position
                ?.exitPending,
            ),

      updatedAt:
        nowIso(),
    };

    return {
      approved: true,
      status:
        "EXCHANGE_POSITION_ADOPTED",
      position:
        clone(
          symbolState.position,
        ),
      executionAuthority:
        false,
    };
  }

  function setLifecycleState({
    symbol,
    state,
    action,
    targetExposure = null,
  } = {}) {
    const symbolState =
      getOrCreateSymbolState(
        symbol,
      );

    const normalizedState =
      String(
        state ?? "",
      ).toUpperCase();

    const normalizedAction =
      normalizeAction(action);

    symbolState.position.lifecycleState =
      normalizedState ||
      symbolState.position.lifecycleState;

    if (
      EXIT_ACTIONS.has(
        normalizedAction,
      ) ||
      normalizedState ===
        "EXIT_PENDING"
    ) {
      symbolState.position.exitPending =
        true;
    }

    if (
      targetExposure !== null &&
      targetExposure !== undefined
    ) {
      symbolState.position.exposure =
        positive(
          targetExposure,
        );
    }

    symbolState.position.updatedAt =
      nowIso();

    return {
      approved: true,
      status:
        "LIFECYCLE_STATE_UPDATED",
      position:
        clone(
          symbolState.position,
        ),
      executionAuthority:
        false,
    };
  }

  function updateProtectiveStop({
    symbol,
    stopPrice,
  } = {}) {
    const symbolState =
      getOrCreateSymbolState(
        symbol,
      );

    const direction =
      normalizeDirection(
        symbolState
          ?.position
          ?.direction,
      );

    const nextStop =
      finite(
        stopPrice,
        NaN,
      );

    if (
      !Number.isFinite(
        nextStop,
      ) ||
      nextStop <= 0
    ) {
      return {
        approved: false,
        status:
          "STOP_UPDATE_BLOCKED",
        blocker:
          "INVALID_STOP_PRICE",
        executionAuthority:
          false,
      };
    }

    const previousStop =
      Number(
        symbolState
          ?.protectiveStop
          ?.stopPrice,
      );

    /*
     * Never loosen an existing protective stop.
     *
     * LONG: stop may only move upward.
     * SHORT: stop may only move downward.
     */
    if (
      Number.isFinite(
        previousStop,
      )
    ) {
      if (
        direction === "LONG" &&
        nextStop < previousStop
      ) {
        return {
          approved: false,
          status:
            "STOP_UPDATE_BLOCKED",
          blocker:
            "LONG_STOP_CANNOT_LOOSEN",
          executionAuthority:
            false,
        };
      }

      if (
        direction === "SHORT" &&
        nextStop > previousStop
      ) {
        return {
          approved: false,
          status:
            "STOP_UPDATE_BLOCKED",
          blocker:
            "SHORT_STOP_CANNOT_LOOSEN",
          executionAuthority:
            false,
        };
      }
    }

    symbolState.protectiveStop = {
      symbol:
        symbolState.symbol,

      direction,

      stopPrice:
        nextStop,

      updatedAt:
        nowIso(),
    };

    symbolState.position.stopPrice =
      nextStop;

    symbolState.updatedAt =
      nowIso();

    return {
      approved: true,
      status:
        "PROTECTIVE_STOP_UPDATED",
      stop:
        clone(
          symbolState.protectiveStop,
        ),
      executionAuthority:
        false,
    };
  }

  function clearTerminalOrder({
    symbol,
  } = {}) {
    const symbolState =
      getOrCreateSymbolState(
        symbol,
      );

    const status =
      String(
        symbolState
          ?.activeOrder
          ?.status ??
        "",
      ).toUpperCase();

    if (
      !TERMINAL_EXECUTION_STATES.has(
        status,
      )
    ) {
      return {
        approved: false,
        status:
          "ORDER_CLEAR_BLOCKED",
        blocker:
          "ORDER_NOT_TERMINAL",
        executionAuthority:
          false,
      };
    }

    symbolState.activeOrder =
      null;

    return {
      approved: true,
      status:
        "TERMINAL_ORDER_CLEARED",
      executionAuthority:
        false,
    };
  }

  function getSymbolState(
    symbol,
  ) {
    return clone(
      getOrCreateSymbolState(
        symbol,
      ),
    );
  }

  function getRuntimeState() {
    return {
      mode:
        runtimeState.mode,

      paperOnly:
        runtimeState.paperOnly,

      liveExecutionEnabled:
        runtimeState
          .liveExecutionEnabled,

      cycle:
        runtimeState.cycle,

      startedAt:
        runtimeState.startedAt,

      lockedSymbols:
        [
          ...runtimeState
            .symbolLocks,
        ],

      symbols:
        [
          ...runtimeState
            .symbols
            .values(),
        ].map(
          clone,
        ),

      executionAuthority:
        false,
    };
  }
function exportPersistentState() {
  const symbols = [];

  for (
    const [
      symbol,
      symbolState,
    ] of runtimeState.symbols.entries()
  ) {
    symbols.push({
      symbol,

      state:
        clone(
          symbolState,
        ),
    });
  }

  return {
    version: 1,

    mode:
      runtimeState.mode,

    paperOnly:
      true,

    liveExecutionEnabled:
      false,

    cycle:
      runtimeState.cycle,

    startedAt:
      runtimeState.startedAt,

    symbols,

    processedCycleKeys: [
      ...runtimeState.processedCycleKeys,
    ],

    processedClientOrderIds: [
      ...runtimeState.processedClientOrderIds,
    ],

    lockedSymbols: [],

    exportedAt:
      nowIso(),

    paperExecution:
      true,

    liveExecution:
      false,

    executionAuthority:
      false,
  };
}


function restorePersistentState(
  snapshot,
) {
  if (
    !snapshot ||
    typeof snapshot !==
      "object"
  ) {
    return {
      approved: false,

      status:
        "RUNTIME_RESTORE_REJECTED",

      blocker:
        "INVALID_RUNTIME_SNAPSHOT",

      executionAuthority:
        false,

      liveExecution:
        false,
    };
  }

  if (
    snapshot.version !== 1
  ) {
    return {
      approved: false,

      status:
        "RUNTIME_RESTORE_REJECTED",

      blocker:
        "UNSUPPORTED_RUNTIME_SNAPSHOT_VERSION",

      executionAuthority:
        false,

      liveExecution:
        false,
    };
  }

  /*
   * Persistence can never enable live execution.
   */
  runtimeState.mode =
    "PAPER";

  runtimeState.paperOnly =
    true;

  runtimeState.liveExecutionEnabled =
    false;

  /*
   * Process-local locks must never survive restart.
   */
  runtimeState.symbolLocks =
    new Set();

  runtimeState.symbols =
    new Map();

  const persistedSymbols =
    Array.isArray(
      snapshot.symbols,
    )
      ? snapshot.symbols
      : [];

  for (
    const item
    of persistedSymbols
  ) {
    const symbol =
      normalizeSymbol(
        item?.symbol ??
        item?.state?.symbol,
      );

    if (!symbol) {
      continue;
    }

    const persistedState =
      (
        item?.state &&
        typeof item.state ===
          "object"
      )
        ? clone(
            item.state,
          )
        : {};

    const restoredState = {
      symbol,

      position: {
        ...makePosition({
          symbol,
        }),

        ...clone(
          persistedState.position ??
          {},
        ),
      },

      activeOrder:
        clone(
          persistedState.activeOrder ??
          null,
        ),

      protectiveStop:
        clone(
          persistedState.protectiveStop ??
          null,
        ),

      lastDecision:
        clone(
          persistedState.lastDecision ??
          null,
        ),

      lastCycleKey:
        persistedState.lastCycleKey ??
        null,

      cycleCount:
        Math.max(
          0,
          Math.trunc(
            finite(
              persistedState.cycleCount,
              0,
            ),
          ),
        ),

      updatedAt:
        persistedState.updatedAt ??
        null,

      entryEngines:
        clone(
          persistedState.entryEngines ??
          null,
        ),

      riskPlan:
        clone(
          persistedState.riskPlan ??
          null,
        ),
    };

    restoredState.position.symbol =
      symbol;

    restoredState.position.direction =
      normalizeDirection(
        restoredState
          .position
          .direction,
      );

    restoredState.position.quantity =
      positive(
        restoredState
          .position
          .quantity,
      );

    restoredState.position.exposure =
      positive(
        restoredState
          .position
          .exposure,
      );

    if (
      restoredState.position.direction ===
        "FLAT" ||
      restoredState.position.quantity <= 0
    ) {
      restoredState.position.direction =
        "FLAT";

      restoredState.position.quantity =
        0;

      restoredState.position.exposure =
        0;

      restoredState.position.averageEntryPrice =
        null;

      restoredState.position.lifecycleState =
        "CLOSED";

      restoredState.position.exitPending =
        false;
    }

    runtimeState.symbols.set(
      symbol,
      restoredState,
    );
  }

  runtimeState.processedCycleKeys =
    new Set(
      (
        snapshot.processedCycleKeys ??
        []
      ).map(
        value =>
          String(value),
      ),
    );

  runtimeState.processedClientOrderIds =
    new Set(
      (
        snapshot.processedClientOrderIds ??
        []
      ).map(
        value =>
          String(value),
      ),
    );

  runtimeState.cycle =
    Math.max(
      0,
      Math.trunc(
        finite(
          snapshot.cycle,
          0,
        ),
      ),
    );

  if (
    typeof snapshot.startedAt ===
      "string" &&
    snapshot.startedAt
  ) {
    runtimeState.startedAt =
      snapshot.startedAt;
  }

  return {
    approved: true,

    status:
      "RUNTIME_STATE_RESTORED",

    symbolCount:
      runtimeState.symbols.size,

    cycle:
      runtimeState.cycle,

    runtimeState:
      getRuntimeState(),

    executionAuthority:
      false,

    liveExecution:
      false,
  };
}



  return {
    beginCycle,
    completeCycle,
    failCycle,

    registerOrder,
    updateOrderState,
    clearTerminalOrder,

    adoptExchangePosition,
    setLifecycleState,
    updateProtectiveStop,

    getSymbolState,
    getRuntimeState,
    exportPersistentState,

restorePersistentState,

    executionAuthority:
      false,

    liveExecutionEnabled:
      false,

    paperOnly:
      true,
  };
}

export default
  createCryptoPaperTradingRuntime;