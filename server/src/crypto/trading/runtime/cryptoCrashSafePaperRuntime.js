/**
 * ============================================================
 * AEMA CRYPTO
 * CRASH-SAFE PAPER TRADING RUNTIME
 * Phase 5.29
 * ============================================================
 *
 * Purpose:
 *
 * - connect paper-trading runtime state to automatic checkpoints
 * - checkpoint meaningful state mutations
 * - preserve trading truth if persistence fails
 * - expose persistence health
 * - support recovery-aware startup
 * - support graceful shutdown with final checkpoint
 *
 * IMPORTANT:
 *
 * This component has:
 *
 * executionAuthority = false
 * liveExecution = false
 *
 * It does NOT:
 *
 * - submit exchange orders
 * - authorize trades
 * - alter fills
 * - manufacture execution state
 * - roll back trading state after persistence failure
 *
 * Trading state becomes truth FIRST.
 * Persistence follows SECOND.
 */


function clone(value) {
  if (
    value === undefined ||
    value === null
  ) {
    return value;
  }

  return JSON.parse(
    JSON.stringify(value),
  );
}


function nowIso() {
  return new Date()
    .toISOString();
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


const MUTATING_EXECUTION_STATUSES =
  new Set([
    "FILLED",
    "PARTIALLY_FILLED",
    "STOP_REPLACED",
    "CANCELLED",
  ]);


const MUTATING_LIFECYCLE_ACTIONS =
  new Set([
    "OPEN",
    "OPEN_POSITION",
    "INCREASE",
    "ADD_EXPOSURE",
    "REDUCE",
    "REDUCE_EXPOSURE",
    "CLOSE",
    "CLOSE_POSITION",
    "EXIT_POSITION",
    "EMERGENCY_EXIT",
    "EMERGENCY_CLOSE",
    "STOP_UPDATE",
    "PROTECT_POSITION",
    "REPLACE_STOP",
  ]);


/**
 * Determine whether the result of a completed cycle
 * represents state worth durably checkpointing.
 *
 * We deliberately allow several representations because
 * the integrated/ledger-aware runtimes expose different
 * result envelopes.
 */
function cycleMutatedState(
  result,
) {
  if (
    !result ||
    typeof result !==
      "object"
  ) {
    return false;
  }


  const executionStatus =
    upper(
      result
        ?.execution
        ?.status ??
      result
        ?.paperExecution
        ?.status ??
      result
        ?.result
        ?.execution
        ?.status,
    );


  if (
    MUTATING_EXECUTION_STATUSES
      .has(
        executionStatus,
      )
  ) {
    return true;
  }


  const lifecycleAction =
    upper(
      result
        ?.lifecycle
        ?.action ??
      result
        ?.lifecycleAction ??
      result
        ?.action ??
      result
        ?.result
        ?.lifecycle
        ?.action,
    );


  if (
    MUTATING_LIFECYCLE_ACTIONS
      .has(
        lifecycleAction,
      )
  ) {
    return true;
  }


  /*
   * Ledger synchronization is itself a durable financial
   * mutation if an actual fill reached the account ledger.
   */

  const ledgerStatus =
    upper(
      result
        ?.ledgerSync
        ?.status ??
      result
        ?.ledger
        ?.status ??
      result
        ?.accountSync
        ?.status,
    );


  if (
    ledgerStatus ===
      "FILL_APPLIED"
  ) {
    return true;
  }


  /*
   * Explicit persistence hints can be supplied by wrappers.
   */

  if (
    result.stateMutated ===
      true ||
    result.requiresCheckpoint ===
      true
  ) {
    return true;
  }


  return false;
}


/**
 * Produce a useful reason for checkpoint metadata.
 */
function checkpointReasonFor(
  result,
) {
  const executionStatus =
    upper(
      result
        ?.execution
        ?.status ??
      result
        ?.paperExecution
        ?.status,
    );


  if (
    executionStatus ===
      "PARTIALLY_FILLED"
  ) {
    return "PARTIAL_FILL";
  }


  if (
    executionStatus ===
      "FILLED"
  ) {
    return "EXECUTION_FILL";
  }


  if (
    executionStatus ===
      "STOP_REPLACED"
  ) {
    return "STOP_REPLACEMENT";
  }


  if (
    executionStatus ===
      "CANCELLED"
  ) {
    return "ORDER_CANCELLATION";
  }


  const ledgerStatus =
    upper(
      result
        ?.ledgerSync
        ?.status ??
      result
        ?.ledger
        ?.status ??
      result
        ?.accountSync
        ?.status,
    );


  if (
    ledgerStatus ===
      "FILL_APPLIED"
  ) {
    return "LEDGER_FILL";
  }


  const lifecycleAction =
    upper(
      result
        ?.lifecycle
        ?.action ??
      result
        ?.lifecycleAction ??
      result
        ?.action,
    );


  if (lifecycleAction) {
    return `LIFECYCLE_${lifecycleAction}`;
  }


  return "PAPER_STATE_MUTATION";
}


export function createCryptoCrashSafePaperRuntime({
  runtime,

  autoCheckpointManager,

  recoveryRuntime = null,

  periodicCheckpointing =
    true,
} = {}) {
  if (!runtime) {
    throw new Error(
      "PAPER_RUNTIME_REQUIRED",
    );
  }


  if (
    !autoCheckpointManager ||
    typeof autoCheckpointManager
      .requestCheckpoint !==
      "function"
  ) {
    throw new Error(
      "AUTO_CHECKPOINT_MANAGER_REQUIRED",
    );
  }


  let started =
    false;

  let shuttingDown =
    false;

  let processedCycles =
    0;

  let mutationCount =
    0;

  let persistenceFailureCount =
    0;

  let lastCycleAt =
    null;

  let lastPersistenceResult =
    null;

  let lastRecoveryResult =
    null;


  /**
   * ==========================================================
   * CHECKPOINT AFTER MUTATION
   * ==========================================================
   */

  async function persistMutation({
    result,
    reason = null,
    metadata = {},
  } = {}) {
    const checkpointReason =
      reason ??
      checkpointReasonFor(
        result,
      );


    const persistence =
      await autoCheckpointManager
        .requestCheckpoint({
          reason:
            checkpointReason,

          metadata: {
            ...clone(
              metadata,
            ),

            processedCycles,

            mutationCount,

            mutationObservedAt:
              nowIso(),
          },
        });


    lastPersistenceResult =
      clone(
        persistence,
      );


    if (
      persistence?.approved !==
      true
    ) {
      persistenceFailureCount +=
        1;
    }


    return persistence;
  }


  /**
   * ==========================================================
   * PROCESS ONE MARKET SNAPSHOT
   * ==========================================================
   *
   * The underlying runtime performs the real paper-runtime
   * operation.
   *
   * Only AFTER that operation finishes do we checkpoint.
   */

  async function processMarketSnapshot(
    input = {},
  ) {
    if (shuttingDown) {
      return {
        approved:
          false,

        status:
          "CRASH_SAFE_RUNTIME_SHUTTING_DOWN",

        blocker:
          "SHUTDOWN_IN_PROGRESS",

        executionAuthority:
          false,

        liveExecution:
          false,
      };
    }


    if (
      typeof runtime
        .processMarketSnapshot !==
      "function"
    ) {
      return {
        approved:
          false,

        status:
          "CRASH_SAFE_RUNTIME_BLOCKED",

        blocker:
          "PROCESS_MARKET_SNAPSHOT_UNAVAILABLE",

        executionAuthority:
          false,

        liveExecution:
          false,
      };
    }


    const result =
      await runtime
        .processMarketSnapshot(
          input,
        );


    processedCycles +=
      1;

    lastCycleAt =
      nowIso();


    const mutated =
      cycleMutatedState(
        result,
      );


    if (!mutated) {
      return {
        ...result,

        crashSafePersistence: {
          required:
            false,

          status:
            "CHECKPOINT_NOT_REQUIRED",

          executionAuthority:
            false,

          liveExecution:
            false,
        },

        executionAuthority:
          false,

        liveExecution:
          false,
      };
    }


    mutationCount +=
      1;


    /*
     * State mutation has already happened.
     *
     * A persistence failure therefore MUST NOT replace or
     * invalidate the runtime result.
     */

    const persistence =
      await persistMutation({
        result,

        metadata: {
          symbol:
            input?.symbol ??
            result?.symbol ??
            null,

          cycleKey:
            input?.cycleKey ??
            result?.cycleKey ??
            null,
        },
      });


    return {
      ...result,

      crashSafePersistence: {
        required:
          true,

        ...clone(
          persistence,
        ),

        executionAuthority:
          false,

        liveExecution:
          false,
      },

      executionAuthority:
        false,

      liveExecution:
        false,
    };
  }


  /**
   * ==========================================================
   * MANUAL STATE MUTATION CHECKPOINT
   * ==========================================================
   *
   * Used for mutations that may happen outside a normal
   * market-snapshot cycle:
   *
   * - fee update
   * - funding update
   * - manual mark update
   * - administrative state mutation
   */

  async function checkpointMutation({
    reason =
      "EXTERNAL_STATE_MUTATION",

    metadata = {},
  } = {}) {
    mutationCount +=
      1;

    return persistMutation({
      result: {
        stateMutated:
          true,
      },

      reason,

      metadata,
    });
  }


  /**
   * ==========================================================
   * RECOVERY
   * ==========================================================
   */

  async function recover(
    options = {},
  ) {
    if (
      !recoveryRuntime ||
      typeof recoveryRuntime
        .recover !==
      "function"
    ) {
      return {
        approved:
          true,

        status:
          "RECOVERY_RUNTIME_NOT_CONFIGURED",

        executionAuthority:
          false,

        liveExecution:
          false,
      };
    }


    const result =
      await recoveryRuntime
        .recover(
          options,
        );


    lastRecoveryResult =
      clone(
        result,
      );


    return {
      ...result,

      executionAuthority:
        false,

      liveExecution:
        false,
    };
  }


  /**
   * ==========================================================
   * START
   * ==========================================================
   */

  function start() {
    if (started) {
      return {
        approved:
          true,

        status:
          "CRASH_SAFE_RUNTIME_ALREADY_STARTED",

        executionAuthority:
          false,

        liveExecution:
          false,
      };
    }


    started =
      true;

    shuttingDown =
      false;


    let runtimeStart =
      null;


    if (
      typeof runtime.start ===
      "function"
    ) {
      runtimeStart =
        runtime.start();
    }


    let periodic =
      null;


    if (
      periodicCheckpointing &&
      typeof autoCheckpointManager
        .startPeriodicCheckpointing ===
      "function"
    ) {
      periodic =
        autoCheckpointManager
          .startPeriodicCheckpointing();
    }


    return {
      approved:
        true,

      status:
        "CRASH_SAFE_RUNTIME_STARTED",

      runtime:
        clone(
          runtimeStart,
        ),

      periodic:
        clone(
          periodic,
        ),

      executionAuthority:
        false,

      liveExecution:
        false,
    };
  }


  /**
   * ==========================================================
   * RETRY DIRTY PERSISTENCE
   * ==========================================================
   */

  async function retryPersistence() {
    if (
      typeof autoCheckpointManager
        .retryDirtyCheckpoint !==
      "function"
    ) {
      return {
        approved:
          false,

        status:
          "PERSISTENCE_RETRY_UNAVAILABLE",

        executionAuthority:
          false,

        liveExecution:
          false,
      };
    }


    const result =
      await autoCheckpointManager
        .retryDirtyCheckpoint({
          reason:
            "CRASH_SAFE_RUNTIME_RETRY",
        });


    lastPersistenceResult =
      clone(
        result,
      );


    return {
      ...result,

      executionAuthority:
        false,

      liveExecution:
        false,
    };
  }


  /**
   * ==========================================================
   * GRACEFUL SHUTDOWN
   * ==========================================================
   */

  async function shutdown({
    metadata = {},
  } = {}) {
    if (shuttingDown) {
      return {
        approved:
          true,

        status:
          "CRASH_SAFE_RUNTIME_SHUTDOWN_ALREADY_STARTED",

        executionAuthority:
          false,

        liveExecution:
          false,
      };
    }


    shuttingDown =
      true;


    /*
     * Stop the underlying continuous runtime first so new
     * mutations cannot arrive while the final checkpoint is
     * being produced.
     */

    let runtimeShutdown =
      null;


    if (
      typeof runtime.shutdown ===
      "function"
    ) {
      runtimeShutdown =
        await runtime
          .shutdown();
    }


    let finalCheckpoint =
      null;


    if (
      typeof autoCheckpointManager
        .checkpointBeforeShutdown ===
      "function"
    ) {
      finalCheckpoint =
        await autoCheckpointManager
          .checkpointBeforeShutdown({
            metadata: {
              ...clone(
                metadata,
              ),

              processedCycles,

              mutationCount,

              shutdownAt:
                nowIso(),
            },
          });
    }


    started =
      false;


    return {
      approved:
        finalCheckpoint
          ?.approved !==
        false,

      status:
        finalCheckpoint
          ?.approved ===
        false
          ? "CRASH_SAFE_RUNTIME_SHUTDOWN_PERSISTENCE_FAILED"
          : "CRASH_SAFE_RUNTIME_SHUTDOWN_COMPLETE",

      runtime:
        clone(
          runtimeShutdown,
        ),

      finalCheckpoint:
        clone(
          finalCheckpoint,
        ),

      executionAuthority:
        false,

      liveExecution:
        false,
    };
  }


  /**
   * ==========================================================
   * HEALTH
   * ==========================================================
   */

  function getHealth() {
    const persistenceHealth =
      typeof autoCheckpointManager
        .getHealth ===
      "function"
        ? autoCheckpointManager
            .getHealth()
        : null;


    const runtimeHealth =
      typeof runtime
        .getHealth ===
      "function"
        ? runtime
            .getHealth()
        : null;


    const recoveryState =
      recoveryRuntime &&
      typeof recoveryRuntime
        .getRecoveryState ===
      "function"
        ? recoveryRuntime
            .getRecoveryState()
        : null;


    return {
      started,

      shuttingDown,

      processedCycles,

      mutationCount,

      persistenceFailureCount,

      lastCycleAt,

      persistence:
        clone(
          persistenceHealth,
        ),

      runtime:
        clone(
          runtimeHealth,
        ),

      recovery:
        clone(
          recoveryState,
        ),

      lastPersistenceResult:
        clone(
          lastPersistenceResult,
        ),

      lastRecoveryResult:
        clone(
          lastRecoveryResult,
        ),

      paperExecution:
        true,

      liveExecution:
        false,

      executionAuthority:
        false,
    };
  }


  return {
    start,

    recover,

    processMarketSnapshot,

    checkpointMutation,

    retryPersistence,

    shutdown,

    getHealth,

    paperExecution:
      true,

    liveExecution:
      false,

    executionAuthority:
      false,
  };
}


export default
  createCryptoCrashSafePaperRuntime;