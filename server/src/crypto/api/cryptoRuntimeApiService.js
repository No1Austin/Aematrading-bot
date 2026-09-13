/**
 * ============================================================
 * AEMA CRYPTO
 * RUNTIME API SERVICE
 * Phase 5.31
 * ============================================================
 *
 * Purpose:
 *
 * - expose read-only crypto runtime state to HTTP routes
 * - provide frontend-safe snapshots
 * - expose account / positions / orders / trades
 * - expose runtime / supervisor / recovery / persistence health
 * - evaluate supervisor actions without executing anything
 *
 * IMPORTANT:
 *
 * This service:
 * - does NOT execute trades
 * - does NOT submit orders
 * - does NOT mutate positions
 * - does NOT enable live execution
 * - has NO execution authority
 */


function clone(
  value,
) {
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


function upper(
  value,
  fallback = "",
) {
  const normalized =
    String(
      value ??
      fallback,
    )
      .trim()
      .toUpperCase();

  return normalized ||
    fallback;
}


function normalizeLimit(
  value,
  fallback = 100,
  maximum = 1000,
) {
  const number =
    Number(value);

  if (
    !Number.isFinite(number) ||
    number <= 0
  ) {
    return fallback;
  }

  return Math.min(
    maximum,
    Math.floor(number),
  );
}


function nowIso() {
  return new Date()
    .toISOString();
}


export function createCryptoRuntimeApiService({
  ledger = null,

  statefulRuntime = null,

  exchangeAdapter = null,

  supervisor = null,

  recoveryRuntime = null,

  autoCheckpointManager = null,

  crashSafeRuntime = null,
} = {}) {
  /**
   * ==========================================================
   * HEALTH
   * ==========================================================
   */

  function getRuntimeHealth() {
    const supervisorState =
      supervisor &&
      typeof supervisor
        .getSupervisorState ===
      "function"
        ? supervisor
            .getSupervisorState()
        : null;

    const crashSafeHealth =
      crashSafeRuntime &&
      typeof crashSafeRuntime
        .getHealth ===
      "function"
        ? crashSafeRuntime
            .getHealth()
        : null;

    return {
      approved:
        true,

      status:
        "CRYPTO_RUNTIME_HEALTH_READY",

      timestamp:
        nowIso(),

      supervisor:
        clone(
          supervisorState,
        ),

      crashSafe:
        clone(
          crashSafeHealth,
        ),

      executionAuthority:
        false,

      liveExecution:
        false,
    };
  }


  /**
   * ==========================================================
   * RUNTIME STATE
   * ==========================================================
   */

  function getRuntimeState() {
    const runtime =
      statefulRuntime &&
      typeof statefulRuntime
        .getRuntimeState ===
      "function"
        ? statefulRuntime
            .getRuntimeState()
        : null;

    return {
      approved:
        Boolean(runtime),

      status:
        runtime
          ? "CRYPTO_RUNTIME_STATE_READY"
          : "CRYPTO_RUNTIME_STATE_UNAVAILABLE",

      timestamp:
        nowIso(),

      runtime:
        clone(
          runtime,
        ),

      executionAuthority:
        false,

      liveExecution:
        false,
    };
  }


  /**
   * ==========================================================
   * ACCOUNT
   * ==========================================================
   */

  function getAccount() {
    const account =
      ledger &&
      typeof ledger
        .getSnapshot ===
      "function"
        ? ledger
            .getSnapshot()
        : null;

    return {
      approved:
        Boolean(account),

      status:
        account
          ? "CRYPTO_ACCOUNT_READY"
          : "CRYPTO_ACCOUNT_UNAVAILABLE",

      timestamp:
        nowIso(),

      account:
        clone(
          account,
        ),

      executionAuthority:
        false,

      liveExecution:
        false,
    };
  }


  /**
   * ==========================================================
   * POSITIONS
   * ==========================================================
   */

  function getPositions({
    symbol = null,
  } = {}) {
    let positions =
      [];

    if (
      ledger &&
      typeof ledger
        .getOpenPositions ===
      "function"
    ) {
      positions =
        ledger
          .getOpenPositions() ??
        [];
    }

    const normalizedSymbol =
      symbol
        ? upper(symbol)
        : null;

    if (
      normalizedSymbol
    ) {
      positions =
        positions.filter(
          position =>
            upper(
              position?.symbol,
            ) ===
            normalizedSymbol,
        );
    }

    return {
      approved:
        true,

      status:
        "CRYPTO_POSITIONS_READY",

      timestamp:
        nowIso(),

      count:
        positions.length,

      positions:
        clone(
          positions,
        ),

      executionAuthority:
        false,

      liveExecution:
        false,
    };
  }


  /**
   * ==========================================================
   * ORDERS
   * ==========================================================
   */

  async function getOrders({
    symbol = null,

    openOnly = false,

    limit = 100,
  } = {}) {
    let orders =
      [];

    const normalizedLimit =
      normalizeLimit(
        limit,
        100,
        1000,
      );

    if (
      exchangeAdapter
    ) {
      if (
        openOnly === true &&
        typeof exchangeAdapter
          .getOpenOrders ===
        "function"
      ) {
        orders =
          await exchangeAdapter
            .getOpenOrders({
              symbol:
                symbol ??
                null,
            });
      } else if (
        typeof exchangeAdapter
          .getSnapshot ===
        "function"
      ) {
        const snapshot =
          exchangeAdapter
            .getSnapshot();

        orders =
          Array.isArray(
            snapshot?.orders,
          )
            ? snapshot.orders
            : [];
      }
    }

    const normalizedSymbol =
      symbol
        ? upper(symbol)
        : null;

    if (
      normalizedSymbol
    ) {
      orders =
        orders.filter(
          order =>
            upper(
              order?.symbol,
            ) ===
            normalizedSymbol,
        );
    }

    orders =
      orders.slice(
        -normalizedLimit,
      );

    return {
      approved:
        true,

      status:
        "CRYPTO_ORDERS_READY",

      timestamp:
        nowIso(),

      count:
        orders.length,

      orders:
        clone(
          orders,
        ),

      executionAuthority:
        false,

      liveExecution:
        false,
    };
  }


  /**
   * ==========================================================
   * TRADES / FILLS
   * ==========================================================
   */

  function getTrades({
    symbol = null,

    limit = 100,
  } = {}) {
    let transactions =
      [];

    const normalizedLimit =
      normalizeLimit(
        limit,
        100,
        1000,
      );

    if (
      ledger &&
      typeof ledger
        .getTransactions ===
      "function"
    ) {
      transactions =
        ledger
          .getTransactions() ??
        [];
    }

    const normalizedSymbol =
      symbol
        ? upper(symbol)
        : null;

    if (
      normalizedSymbol
    ) {
      transactions =
        transactions.filter(
          transaction =>
            upper(
              transaction?.symbol,
            ) ===
            normalizedSymbol,
        );
    }

    transactions =
      transactions.slice(
        -normalizedLimit,
      );

    return {
      approved:
        true,

      status:
        "CRYPTO_TRADES_READY",

      timestamp:
        nowIso(),

      count:
        transactions.length,

      trades:
        clone(
          transactions,
        ),

      executionAuthority:
        false,

      liveExecution:
        false,
    };
  }


  /**
   * ==========================================================
   * PERSISTENCE
   * ==========================================================
   */

  function getPersistenceHealth() {
    const persistence =
      autoCheckpointManager &&
      typeof autoCheckpointManager
        .getHealth ===
      "function"
        ? autoCheckpointManager
            .getHealth()
        : null;

    return {
      approved:
        Boolean(persistence),

      status:
        persistence
          ? "CRYPTO_PERSISTENCE_HEALTH_READY"
          : "CRYPTO_PERSISTENCE_HEALTH_UNAVAILABLE",

      timestamp:
        nowIso(),

      persistence:
        clone(
          persistence,
        ),

      executionAuthority:
        false,

      liveExecution:
        false,
    };
  }


  /**
   * ==========================================================
   * RECOVERY
   * ==========================================================
   */

  function getRecoveryState() {
    const recovery =
      recoveryRuntime &&
      typeof recoveryRuntime
        .getRecoveryState ===
      "function"
        ? recoveryRuntime
            .getRecoveryState()
        : null;

    return {
      approved:
        Boolean(recovery),

      status:
        recovery
          ? "CRYPTO_RECOVERY_STATE_READY"
          : "CRYPTO_RECOVERY_STATE_UNAVAILABLE",

      timestamp:
        nowIso(),

      recovery:
        clone(
          recovery,
        ),

      executionAuthority:
        false,

      liveExecution:
        false,
    };
  }


  /**
   * ==========================================================
   * SUPERVISOR ACTION EVALUATION
   * ==========================================================
   *
   * Evaluates only.
   *
   * Never executes.
   */

  function evaluateAction({
    action,
    marketDataFresh =
      undefined,
    marketDataAgeMs =
      undefined,
  } = {}) {
    if (
      !supervisor ||
      typeof supervisor
        .evaluateAction !==
      "function"
    ) {
      return {
        approved:
          false,

        status:
          "SUPERVISOR_UNAVAILABLE",

        blocker:
          "CRYPTO_RUNTIME_SUPERVISOR_UNAVAILABLE",

        action:
          upper(
            action,
            "NONE",
          ),

        executionAuthority:
          false,

        liveExecution:
          false,
      };
    }

    const result =
      supervisor
        .evaluateAction({
          action,

          marketDataFresh,

          marketDataAgeMs,
        });

    return {
      ...clone(
        result,
      ),

      evaluatedOnly:
        true,

      executionAuthority:
        false,

      liveExecution:
        false,
    };
  }


  /**
   * ==========================================================
   * DASHBOARD SNAPSHOT
   * ==========================================================
   *
   * One endpoint can use this to avoid many frontend requests.
   */

  async function getDashboardSnapshot() {
    const [
      orders,
    ] =
      await Promise.all([
        getOrders({
          openOnly:
            true,

          limit:
            100,
        }),
      ]);

    return {
      approved:
        true,

      status:
        "CRYPTO_DASHBOARD_SNAPSHOT_READY",

      timestamp:
        nowIso(),

      health:
        getRuntimeHealth(),

      runtime:
        getRuntimeState(),

      account:
        getAccount(),

      positions:
        getPositions(),

      openOrders:
        orders,

      persistence:
        getPersistenceHealth(),

      recovery:
        getRecoveryState(),

      executionAuthority:
        false,

      liveExecution:
        false,
    };
  }


  return {
    getRuntimeHealth,

    getRuntimeState,

    getAccount,

    getPositions,

    getOrders,

    getTrades,

    getPersistenceHealth,

    getRecoveryState,

    evaluateAction,

    getDashboardSnapshot,

    executionAuthority:
      false,

    liveExecution:
      false,
  };
}


export default
  createCryptoRuntimeApiService;