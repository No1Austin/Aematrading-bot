/**
 * ============================================================
 * AEMA CRYPTO
 * PAPER CHECKPOINT MANAGER
 * Phase 5.28
 * ============================================================
 *
 * Responsibilities:
 *
 * - collect persistent state from:
 *   - paper account ledger
 *   - stateful paper runtime
 *   - paper exchange adapter
 *
 * - create one canonical versioned checkpoint
 * - restore component state after restart
 * - validate cross-component persistence contracts
 *
 * IMPORTANT
 * ---------
 *
 * This module does NOT reach into private Maps or Sets.
 *
 * Components must explicitly expose:
 *
 * exportPersistentState()
 * restorePersistentState(snapshot)
 *
 * This preserves ownership boundaries.
 *
 * NO live execution authority.
 */


const clone = (value) => {
  if (
    value === null ||
    value === undefined
  ) {
    return value;
  }

  return JSON.parse(
    JSON.stringify(value),
  );
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


function nowIso() {
  return new Date()
    .toISOString();
}


/**
 * ============================================================
 * PERSISTENCE CONTRACT VALIDATION
 * ============================================================
 */

function validateExportContract({
  component,
  name,
}) {
  if (!component) {
    return {
      valid: false,

      reason:
        `${name}_REQUIRED`,
    };
  }

  if (
    typeof component
      .exportPersistentState !==
    "function"
  ) {
    return {
      valid: false,

      reason:
        `${name}_EXPORT_STATE_UNAVAILABLE`,
    };
  }

  return {
    valid: true,
    reason: null,
  };
}


function validateRestoreContract({
  component,
  name,
}) {
  if (!component) {
    return {
      valid: false,

      reason:
        `${name}_REQUIRED`,
    };
  }

  if (
    typeof component
      .restorePersistentState !==
    "function"
  ) {
    return {
      valid: false,

      reason:
        `${name}_RESTORE_STATE_UNAVAILABLE`,
    };
  }

  return {
    valid: true,
    reason: null,
  };
}


/**
 * ============================================================
 * CHECKPOINT STATE SHAPE
 * ============================================================
 */

function validateCheckpointState(
  state,
) {
  if (
    !state ||
    typeof state !== "object" ||
    Array.isArray(state)
  ) {
    return {
      valid: false,

      reason:
        "CHECKPOINT_STATE_INVALID",
    };
  }

  if (
    !state.ledger ||
    typeof state.ledger !==
      "object"
  ) {
    return {
      valid: false,

      reason:
        "LEDGER_STATE_MISSING",
    };
  }

  if (
    !state.runtime ||
    typeof state.runtime !==
      "object"
  ) {
    return {
      valid: false,

      reason:
        "RUNTIME_STATE_MISSING",
    };
  }

  if (
    !state.exchange ||
    typeof state.exchange !==
      "object"
  ) {
    return {
      valid: false,

      reason:
        "EXCHANGE_STATE_MISSING",
    };
  }

  return {
    valid: true,

    reason: null,
  };
}


/**
 * ============================================================
 * FACTORY
 * ============================================================
 */

export function createCryptoPaperCheckpointManager({
  stateStore,

  ledger,

  statefulRuntime,

  exchangeAdapter,
} = {}) {
  if (!stateStore) {
    throw new Error(
      "PAPER_STATE_STORE_REQUIRED",
    );
  }

  if (!ledger) {
    throw new Error(
      "PAPER_ACCOUNT_LEDGER_REQUIRED",
    );
  }

  if (!statefulRuntime) {
    throw new Error(
      "STATEFUL_RUNTIME_REQUIRED",
    );
  }

  if (!exchangeAdapter) {
    throw new Error(
      "PAPER_EXCHANGE_ADAPTER_REQUIRED",
    );
  }


  /**
   * ==========================================================
   * HARD PAPER-ONLY SAFETY
   * ==========================================================
   */

  if (
    exchangeAdapter
      ?.liveExecution ===
      true
  ) {
    throw new Error(
      "LIVE_EXCHANGE_ADAPTER_NOT_ALLOWED",
    );
  }

  if (
    statefulRuntime
      ?.liveExecutionEnabled ===
      true
  ) {
    throw new Error(
      "LIVE_RUNTIME_NOT_ALLOWED",
    );
  }


  /**
   * ==========================================================
   * EXPORT COMPLETE CHECKPOINT STATE
   * ==========================================================
   */

  function exportCheckpointState() {
    const components = [
      {
        component:
          ledger,

        name:
          "LEDGER",
      },

      {
        component:
          statefulRuntime,

        name:
          "RUNTIME",
      },

      {
        component:
          exchangeAdapter,

        name:
          "EXCHANGE",
      },
    ];

    for (
      const item
      of components
    ) {
      const validation =
        validateExportContract(
          item,
        );

      if (!validation.valid) {
        return {
          approved:
            false,

          status:
            "CHECKPOINT_EXPORT_BLOCKED",

          blocker:
            validation.reason,

          state:
            null,

          executionAuthority:
            false,

          liveExecution:
            false,
        };
      }
    }


    const ledgerState =
      ledger
        .exportPersistentState();

    const runtimeState =
      statefulRuntime
        .exportPersistentState();

    const exchangeState =
      exchangeAdapter
        .exportPersistentState();


    const state = {
      capturedAt:
        nowIso(),

      ledger:
        clone(
          ledgerState,
        ),

      runtime:
        clone(
          runtimeState,
        ),

      exchange:
        clone(
          exchangeState,
        ),

      safety: {
        paperExecution:
          true,

        liveExecution:
          false,

        executionAuthority:
          false,
      },
    };


    const validation =
      validateCheckpointState(
        state,
      );

    if (!validation.valid) {
      return {
        approved:
          false,

        status:
          "CHECKPOINT_EXPORT_INVALID",

        blocker:
          validation.reason,

        state:
          null,

        executionAuthority:
          false,

        liveExecution:
          false,
      };
    }


    return {
      approved:
        true,

      status:
        "CHECKPOINT_STATE_EXPORTED",

      state,

      executionAuthority:
        false,

      liveExecution:
        false,
    };
  }


  /**
   * ==========================================================
   * SAVE CHECKPOINT
   * ==========================================================
   */

  async function saveCheckpoint({
    metadata = {},
  } = {}) {
    const exported =
      exportCheckpointState();

    if (
      exported?.approved !==
      true
    ) {
      return exported;
    }


    const saved =
      await stateStore.save({
        state:
          exported.state,

        metadata: {
          ...clone(metadata),

          checkpointType:
            "AEMA_CRYPTO_PAPER_TRADING",

          capturedAt:
            exported
              ?.state
              ?.capturedAt,

          paperExecution:
            true,

          liveExecution:
            false,
        },
      });


    return {
      ...saved,

      checkpointState:
        clone(
          exported.state,
        ),

      executionAuthority:
        false,

      liveExecution:
        false,
    };
  }


  /**
   * ==========================================================
   * LOAD CHECKPOINT WITHOUT RESTORING
   * ==========================================================
   */

  async function loadCheckpoint() {
    const loaded =
      await stateStore.load();

    if (
      loaded?.approved !==
      true
    ) {
      return loaded;
    }


    const state =
      loaded
        ?.checkpoint
        ?.state;


    const validation =
      validateCheckpointState(
        state,
      );


    if (!validation.valid) {
      return {
        approved:
          false,

        status:
          "CHECKPOINT_STATE_INVALID",

        blocker:
          validation.reason,

        checkpoint:
          null,

        executionAuthority:
          false,

        liveExecution:
          false,
      };
    }


    return {
      approved:
        true,

      status:
        "CHECKPOINT_READY_FOR_RESTORE",

      checkpoint:
        clone(
          loaded.checkpoint,
        ),

      executionAuthority:
        false,

      liveExecution:
        false,
    };
  }


  /**
   * ==========================================================
   * RESTORE COMPONENT
   * ==========================================================
   */

  async function restoreComponent({
    component,

    name,

    snapshot,
  }) {
    const contract =
      validateRestoreContract({
        component,
        name,
      });


    if (!contract.valid) {
      return {
        approved:
          false,

        component:
          name,

        status:
          "COMPONENT_RESTORE_BLOCKED",

        blocker:
          contract.reason,
      };
    }


    try {
      const result =
        await component
          .restorePersistentState(
            clone(snapshot),
          );


      if (
        result?.approved ===
        false
      ) {
        return {
          approved:
            false,

          component:
            name,

          status:
            result?.status ??
            "COMPONENT_RESTORE_FAILED",

          blocker:
            result?.blocker ??
            "RESTORE_REJECTED",

          result,
        };
      }


      return {
        approved:
          true,

        component:
          name,

        status:
          result?.status ??
          "COMPONENT_RESTORED",

        result,
      };
    } catch (error) {
      return {
        approved:
          false,

        component:
          name,

        status:
          "COMPONENT_RESTORE_FAILED",

        blocker:
          String(
            error?.message ??
            error,
          ),
      };
    }
  }


  /**
   * ==========================================================
   * RESTORE CHECKPOINT
   * ==========================================================
   *
   * Restore order:
   *
   * 1. ledger
   * 2. exchange
   * 3. runtime
   *
   * Why this order?
   *
   * Ledger:
   * restores financial truth.
   *
   * Exchange:
   * restores simulated venue truth.
   *
   * Runtime:
   * restores orchestration state last.
   *
   * Reconciliation happens AFTER this manager completes.
   */

  async function restoreCheckpoint({
    checkpoint = null,
  } = {}) {
    let resolvedCheckpoint =
      checkpoint;


    if (!resolvedCheckpoint) {
      const loaded =
        await loadCheckpoint();

      if (
        loaded?.approved !==
        true
      ) {
        return loaded;
      }

      resolvedCheckpoint =
        loaded.checkpoint;
    }


    const state =
      resolvedCheckpoint?.state;


    const validation =
      validateCheckpointState(
        state,
      );


    if (!validation.valid) {
      return {
        approved:
          false,

        status:
          "CHECKPOINT_RESTORE_BLOCKED",

        blocker:
          validation.reason,

        executionAuthority:
          false,

        liveExecution:
          false,
      };
    }


    /**
     * Ledger first.
     */

    const ledgerRestore =
      await restoreComponent({
        component:
          ledger,

        name:
          "LEDGER",

        snapshot:
          state.ledger,
      });


    if (
      ledgerRestore?.approved !==
      true
    ) {
      return {
        approved:
          false,

        status:
          "CHECKPOINT_RESTORE_FAILED",

        failedComponent:
          "LEDGER",

        restoreResults: {
          ledger:
            ledgerRestore,
        },

        executionAuthority:
          false,

        liveExecution:
          false,
      };
    }


    /**
     * Exchange second.
     */

    const exchangeRestore =
      await restoreComponent({
        component:
          exchangeAdapter,

        name:
          "EXCHANGE",

        snapshot:
          state.exchange,
      });


    if (
      exchangeRestore?.approved !==
      true
    ) {
      return {
        approved:
          false,

        status:
          "CHECKPOINT_RESTORE_FAILED",

        failedComponent:
          "EXCHANGE",

        restoreResults: {
          ledger:
            ledgerRestore,

          exchange:
            exchangeRestore,
        },

        executionAuthority:
          false,

        liveExecution:
          false,
      };
    }


    /**
     * Runtime last.
     */

    const runtimeRestore =
      await restoreComponent({
        component:
          statefulRuntime,

        name:
          "RUNTIME",

        snapshot:
          state.runtime,
      });


    if (
      runtimeRestore?.approved !==
      true
    ) {
      return {
        approved:
          false,

        status:
          "CHECKPOINT_RESTORE_FAILED",

        failedComponent:
          "RUNTIME",

        restoreResults: {
          ledger:
            ledgerRestore,

          exchange:
            exchangeRestore,

          runtime:
            runtimeRestore,
        },

        executionAuthority:
          false,

        liveExecution:
          false,
      };
    }


    return {
      approved:
        true,

      status:
        "CHECKPOINT_RESTORED",

      restoredAt:
        nowIso(),

      checkpointCreatedAt:
        resolvedCheckpoint
          ?.createdAt ??
        null,

      checkpointCapturedAt:
        state
          ?.capturedAt ??
        null,

      restoreResults: {
        ledger:
          ledgerRestore,

        exchange:
          exchangeRestore,

        runtime:
          runtimeRestore,
      },

      reconciliationRequired:
        true,

      executionAuthority:
        false,

      liveExecution:
        false,
    };
  }


  /**
   * ==========================================================
   * CHECKPOINT AGE
   * ==========================================================
   */

  function checkpointAgeMs(
    checkpoint,
  ) {
    const timestamp =
      Date.parse(
        checkpoint
          ?.createdAt ??
        checkpoint
          ?.state
          ?.capturedAt ??
        "",
      );


    if (
      !Number.isFinite(
        timestamp,
      )
    ) {
      return null;
    }


    return Math.max(
      0,
      Date.now() -
        timestamp,
    );
  }


  function checkpointIsStale({
    checkpoint,

    maximumAgeMs =
      24 * 60 * 60 * 1000,
  } = {}) {
    const age =
      checkpointAgeMs(
        checkpoint,
      );


    if (age === null) {
      return true;
    }


    return (
      age >
      maximumAgeMs
    );
  }


  /**
   * ==========================================================
   * PUBLIC API
   * ==========================================================
   */

  return {
    exportCheckpointState,

    saveCheckpoint,

    loadCheckpoint,

    restoreCheckpoint,

    checkpointAgeMs,

    checkpointIsStale,

    paperExecution:
      true,

    liveExecution:
      false,

    executionAuthority:
      false,
  };
}


export default
  createCryptoPaperCheckpointManager;