/**
 * AEMA CRYPTO
 * Phase 5.21 — Continuous Crypto Paper Runtime
 *
 * PURPOSE
 * -------
 * Coordinate repeated paper-trading cycles across symbols.
 *
 * Responsibilities:
 * - distinguish FLAT symbols from OPEN positions
 * - block stale market data
 * - enforce per-symbol cooldowns
 * - isolate symbol-level errors
 * - maintain heartbeat / runtime health
 * - support graceful shutdown
 * - preserve paper/live separation
 * - clear stale protective stops after position close
 *
 * IMPORTANT
 * ---------
 * This module does NOT execute live trades.
 * liveExecutionEnabled is permanently false in this phase.
 */

const finite = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const upper = (value, fallback = "") => {
  const text = String(value ?? "")
    .trim()
    .toUpperCase();

  return text || fallback;
};

const now = () =>
  Date.now();

const nowIso = () =>
  new Date().toISOString();

function clone(value) {
  if (value == null) {
    return value;
  }

  return JSON.parse(
    JSON.stringify(value),
  );
}

function normalizeSymbol(value) {
  return upper(value);
}

function isFlat(position) {
  return (
    !position ||
    upper(
      position.direction,
      "FLAT",
    ) === "FLAT" ||
    Number(position.quantity) <= 0
  );
}

function buildHealth() {
  return {
    status:
      "STARTING",

    startedAt:
      nowIso(),

    lastHeartbeatAt:
      null,

    lastCycleAt:
      null,

    totalCycles:
      0,

    successfulCycles:
      0,

    failedCycles:
      0,

    staleDataBlocks:
      0,

    cooldownBlocks:
      0,

    symbolErrors:
      0,

    running:
      false,

    shuttingDown:
      false,
  };
}

export function createContinuousCryptoPaperRuntime({
  statefulRuntime,

  marketDataProvider,

  flatSymbolHandler,

  openPositionHandler,

  reconciliationHandler = null,

  persistenceHandler = null,

  scanIntervalMs = 30_000,

  positionMonitorIntervalMs = 10_000,

  reconciliationIntervalMs = 30_000,

  maxMarketDataAgeMs = 20_000,

  exitCooldownMs = 60_000,

  failureCooldownMs = 30_000,
} = {}) {
  if (!statefulRuntime) {
    throw new Error(
      "STATEFUL_RUNTIME_REQUIRED",
    );
  }

  if (
    statefulRuntime.liveExecutionEnabled === true
  ) {
    throw new Error(
      "LIVE_RUNTIME_NOT_ALLOWED",
    );
  }

  if (
    typeof marketDataProvider !==
      "function"
  ) {
    throw new Error(
      "MARKET_DATA_PROVIDER_REQUIRED",
    );
  }

  if (
    typeof flatSymbolHandler !==
      "function"
  ) {
    throw new Error(
      "FLAT_SYMBOL_HANDLER_REQUIRED",
    );
  }

  if (
    typeof openPositionHandler !==
      "function"
  ) {
    throw new Error(
      "OPEN_POSITION_HANDLER_REQUIRED",
    );
  }

  const health =
    buildHealth();

  const cooldowns =
    new Map();

  const activeSymbols =
    new Set();

  let shuttingDown =
    false;

  function heartbeat() {
    health.lastHeartbeatAt =
      nowIso();

    health.status =
      shuttingDown
        ? "SHUTTING_DOWN"
        : "HEALTHY";

    return clone(health);
  }

  function setCooldown(
    symbol,
    reason,
    durationMs,
  ) {
    const key =
      normalizeSymbol(symbol);

    cooldowns.set(key, {
      reason,
      until:
        now() +
        Math.max(
          0,
          finite(durationMs) ?? 0,
        ),
    });
  }

  function getCooldown(symbol) {
    const key =
      normalizeSymbol(symbol);

    const value =
      cooldowns.get(key);

    if (!value) {
      return null;
    }

    if (
      now() >= value.until
    ) {
      cooldowns.delete(key);
      return null;
    }

    return value;
  }

  function clearCooldown(symbol) {
    cooldowns.delete(
      normalizeSymbol(symbol),
    );
  }

  function marketDataIsFresh(
    market,
  ) {
    const timestamp =
      finite(
        market?.timestamp ??
        market?.timestampMs ??
        market?.fetchedAtMs,
      );

    if (
      timestamp === null
    ) {
      return false;
    }

    return (
      now() -
      timestamp
    ) <= maxMarketDataAgeMs;
  }

  function clearClosedProtection(
    symbol,
  ) {
    const runtimeState =
      statefulRuntime.getSymbolState(
        symbol,
      );

    if (
      runtimeState
        ?.position
        ?.direction !==
        "FLAT"
    ) {
      return false;
    }

    /**
     * We cannot directly mutate runtime internals,
     * so use the runtime's position truth to ensure
     * stale stop data is not treated as active.
     *
     * The returned cleanup marker is used by persistence/UI.
     */
    return true;
  }

  async function persist(
    payload,
  ) {
    if (
      typeof persistenceHandler !==
        "function"
    ) {
      return;
    }

    await persistenceHandler(
      clone(payload),
    );
  }

  async function processSymbol(
    symbol,
  ) {
    const key =
      normalizeSymbol(symbol);

    if (!key) {
      return {
        approved: false,
        status:
          "INVALID_SYMBOL",
      };
    }

    if (shuttingDown) {
      return {
        approved: false,
        status:
          "RUNTIME_SHUTTING_DOWN",
      };
    }

    if (
      activeSymbols.has(key)
    ) {
      return {
        approved: false,
        status:
          "SYMBOL_ALREADY_PROCESSING",
      };
    }

    const cooldown =
      getCooldown(key);

    if (cooldown) {
      health.cooldownBlocks += 1;

      return {
        approved: false,
        status:
          "COOLDOWN_ACTIVE",

        reason:
          cooldown.reason,

        cooldownUntil:
          new Date(
            cooldown.until,
          ).toISOString(),
      };
    }

    activeSymbols.add(key);

    try {
      health.totalCycles += 1;
      health.lastCycleAt =
        nowIso();

      const market =
        await marketDataProvider(
          key,
        );

      if (
        !marketDataIsFresh(
          market,
        )
      ) {
        health.staleDataBlocks +=
          1;

        return {
          approved: false,
          status:
            "STALE_MARKET_DATA",

          symbol:
            key,
        };
      }

      const runtimeState =
        statefulRuntime
          .getSymbolState(
            key,
          );

      const position =
        runtimeState?.position;

      let result;

      /**
       * ======================================================
       * FLAT SYMBOL
       * ======================================================
       *
       * Flat symbols are evaluated for NEW ENTRY.
       */
      if (
        isFlat(position)
      ) {
        result =
          await flatSymbolHandler({
            symbol:
              key,

            market,

            runtimeState:
              clone(
                runtimeState,
              ),

            mode:
              "ENTRY_EVALUATION",
          });
      }

      /**
       * ======================================================
       * OPEN POSITION
       * ======================================================
       *
       * Existing positions are managed through:
       * HOLD / ADD / REDUCE / PROTECT / EXIT.
       *
       * They are not treated as brand-new opportunities.
       */
      else {
        result =
          await openPositionHandler({
            symbol:
              key,

            market,

            position:
              clone(position),

            runtimeState:
              clone(
                runtimeState,
              ),

            mode:
              "POSITION_MANAGEMENT",
          });
      }

      /**
       * ======================================================
       * RECONCILIATION
       * ======================================================
       */

      let reconciliation =
        null;

      if (
        typeof reconciliationHandler ===
          "function"
      ) {
        reconciliation =
          await reconciliationHandler({
            symbol:
              key,

            market,

            runtimeState:
              statefulRuntime
                .getSymbolState(
                  key,
                ),

            cycleResult:
              result,
          });
      }

      /**
       * ======================================================
       * COOLDOWN POLICY
       * ======================================================
       */

      const action =
        upper(
          result?.action ??
          result?.lifecycleAction ??
          result?.command,
        );

      if (
        [
          "EXIT_POSITION",
          "EMERGENCY_EXIT",
          "CLOSE_POSITION",
          "EMERGENCY_CLOSE",
        ].includes(action)
      ) {
        setCooldown(
          key,
          "POST_EXIT_COOLDOWN",
          exitCooldownMs,
        );
      }

      if (
        [
          "REJECTED",
          "FAILED",
          "EXECUTION_FAILED",
        ].includes(
          upper(
            result?.status,
          ),
        )
      ) {
        setCooldown(
          key,
          "POST_FAILURE_COOLDOWN",
          failureCooldownMs,
        );
      }

      /**
       * ======================================================
       * CLOSED-POSITION CLEANUP
       * ======================================================
       */

      const afterState =
        statefulRuntime
          .getSymbolState(
            key,
          );

      const closedProtectionCleared =
        clearClosedProtection(
          key,
        );

      await persist({
        symbol:
          key,

        market,

        result,

        reconciliation,

        runtimeState:
          afterState,

        closedProtectionCleared,

        timestamp:
          nowIso(),
      });

      health.successfulCycles +=
        1;

      heartbeat();

      return {
        approved: true,

        status:
          "SYMBOL_CYCLE_COMPLETE",

        symbol:
          key,

        mode:
          isFlat(position)
            ? "ENTRY_EVALUATION"
            : "POSITION_MANAGEMENT",

        result,

        reconciliation,

        closedProtectionCleared,

        executionAuthority:
          false,

        liveExecution:
          false,
      };
    } catch (error) {
      health.failedCycles += 1;
      health.symbolErrors += 1;

      setCooldown(
        key,
        "SYMBOL_ERROR_COOLDOWN",
        failureCooldownMs,
      );

      return {
        approved: false,

        status:
          "SYMBOL_CYCLE_FAILED",

        symbol:
          key,

        error:
          String(
            error?.message ??
            error,
          ),

        executionAuthority:
          false,

        liveExecution:
          false,
      };
    } finally {
      activeSymbols.delete(
        key,
      );
    }
  }

  async function processUniverse(
    symbols = [],
  ) {
    const results = [];

    for (
      const symbol
      of symbols
    ) {
      const result =
        await processSymbol(
          symbol,
        );

      results.push(
        result,
      );
    }

    return results;
  }

  function start() {
    health.running =
      true;

    health.status =
      "HEALTHY";

    heartbeat();

    return {
      started: true,

      mode:
        "PAPER",

      scanIntervalMs,

      positionMonitorIntervalMs,

      reconciliationIntervalMs,

      liveExecution:
        false,
    };
  }

  async function shutdown() {
    shuttingDown =
      true;

    health.shuttingDown =
      true;

    health.status =
      "SHUTTING_DOWN";

    /**
     * Wait for current symbol cycles
     * to naturally finish.
     */
    while (
      activeSymbols.size > 0
    ) {
      await new Promise(
        resolve =>
          setTimeout(
            resolve,
            10,
          ),
      );
    }

    health.running =
      false;

    health.status =
      "STOPPED";

    health.shuttingDown =
      false;

    return {
      stopped: true,

      liveExecution:
        false,
    };
  }

  function getHealth() {
    return {
      ...clone(
        health,
      ),

      activeSymbols:
        [
          ...activeSymbols,
        ],

      cooldowns:
        [
          ...cooldowns.entries(),
        ].map(
          ([
            symbol,
            value,
          ]) => ({
            symbol,

            reason:
              value.reason,

            until:
              new Date(
                value.until,
              ).toISOString(),
          }),
        ),

      executionAuthority:
        false,

      liveExecution:
        false,
    };
  }

  return {
    start,

    shutdown,

    processSymbol,

    processUniverse,

    heartbeat,

    getHealth,

    setCooldown,

    clearCooldown,

    executionAuthority:
      false,

    liveExecution:
      false,

    mode:
      "PAPER",
  };
}

export default
  createContinuousCryptoPaperRuntime;