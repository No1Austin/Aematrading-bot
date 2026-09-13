/**
 * ============================================================
 * AEMA CRYPTO
 * PAPER RECOVERY RUNTIME
 * Phase 5.28
 * ============================================================
 *
 * Responsibilities:
 *
 * - coordinate restart recovery
 * - load and restore checkpoint
 * - block new/increased risk during recovery
 * - allow risk reduction during recovery
 * - reconcile restored runtime against paper exchange truth
 * - expose READY only after reconciliation succeeds
 *
 * IMPORTANT:
 *
 * PAPER ONLY.
 *
 * NO live execution.
 * NO execution authority.
 */


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


const finite = (
  value,
  fallback = 0,
) => {
  const n =
    Number(value);

  return Number.isFinite(n)
    ? n
    : fallback;
};


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


function nowIso() {
  return new Date()
    .toISOString();
}


function normalizeDirection(
  value,
) {
  const direction =
    upper(
      value,
      "FLAT",
    );

  if (
    direction === "LONG" ||
    direction === "SHORT"
  ) {
    return direction;
  }

  return "FLAT";
}


function normalizeQuantity(
  value,
) {
  return Math.max(
    0,
    finite(
      value,
      0,
    ),
  );
}


function positionIsOpen(
  position,
) {
  return (
    normalizeQuantity(
      position?.quantity,
    ) > 0 &&
    [
      "LONG",
      "SHORT",
    ].includes(
      normalizeDirection(
        position?.direction,
      ),
    )
  );
}


const RISK_INCREASING_ACTIONS =
  new Set([
    "OPEN_POSITION",
    "ADD_EXPOSURE",
    "OPEN",
    "INCREASE",
  ]);


const RISK_REDUCING_ACTIONS =
  new Set([
    "REDUCE_EXPOSURE",
    "EXIT_POSITION",
    "EMERGENCY_EXIT",
    "PROTECT_POSITION",
    "REDUCE",
    "CLOSE",
    "EMERGENCY_CLOSE",
    "STOP_UPDATE",
    "REPLACE_STOP",
  ]);


export const CRYPTO_RECOVERY_STATE =
  Object.freeze({
    INITIAL:
      "INITIAL",

    RESTORING:
      "RESTORING",

    RECONCILING:
      "RECONCILING",

    READY:
      "READY",

    FAILED:
      "FAILED",
  });


export function createCryptoPaperRecoveryRuntime({
  checkpointManager,

  ledger,

  statefulRuntime,

  exchangeAdapter,

  maximumCheckpointAgeMs =
    24 * 60 * 60 * 1000,
} = {}) {
  if (!checkpointManager) {
    throw new Error(
      "CHECKPOINT_MANAGER_REQUIRED",
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


  if (
    exchangeAdapter
      ?.liveExecution ===
      true
  ) {
    throw new Error(
      "LIVE_EXCHANGE_ADAPTER_NOT_ALLOWED",
    );
  }


  let recoveryState =
    CRYPTO_RECOVERY_STATE
      .INITIAL;

  let recoveryStartedAt =
    null;

  let recoveryCompletedAt =
    null;

  let lastError =
    null;

  let lastCheckpoint =
    null;

  let lastReconciliation =
    null;

  function initializeFreshStart() {
  recoveryStartedAt =
    nowIso();

  recoveryCompletedAt =
    recoveryStartedAt;

  recoveryState =
    CRYPTO_RECOVERY_STATE
      .READY;

  lastError =
    null;

  lastCheckpoint =
    null;

  lastReconciliation = {
    approved:
      true,

    status:
      "FRESH_START_NO_RECONCILIATION_REQUIRED",

    symbolsChecked:
      0,

    results:
      [],

    completedAt:
      recoveryCompletedAt,

    executionAuthority:
      false,

    liveExecution:
      false,
  };

  return {
    approved:
      true,

    status:
      "FRESH_START_READY",

    recoveryState,

    executionAuthority:
      false,

    liveExecution:
      false,
  };
  }

  /**
   * ==========================================================
   * RECOVERY ACTION GATE
   * ==========================================================
   */

  function evaluateAction(
    action,
  ) {
    const normalizedAction =
      upper(
        action,
        "HOLD",
      );

    if (
      recoveryState ===
      CRYPTO_RECOVERY_STATE.READY
    ) {
      return {
        approved:
          true,

        state:
          recoveryState,

        action:
          normalizedAction,

        riskIncreasing:
          RISK_INCREASING_ACTIONS
            .has(
              normalizedAction,
            ),

        riskReducing:
          RISK_REDUCING_ACTIONS
            .has(
              normalizedAction,
            ),

        blocker:
          null,

        executionAuthority:
          false,

        liveExecution:
          false,
      };
    }


    if (
      RISK_REDUCING_ACTIONS.has(
        normalizedAction,
      )
    ) {
      return {
        approved:
          true,

        state:
          recoveryState,

        action:
          normalizedAction,

        riskIncreasing:
          false,

        riskReducing:
          true,

        blocker:
          null,

        reason:
          "RISK_REDUCTION_ALLOWED_DURING_RECOVERY",

        executionAuthority:
          false,

        liveExecution:
          false,
      };
    }


    if (
      RISK_INCREASING_ACTIONS.has(
        normalizedAction,
      )
    ) {
      return {
        approved:
          false,

        state:
          recoveryState,

        action:
          normalizedAction,

        riskIncreasing:
          true,

        riskReducing:
          false,

        blocker:
          "RECOVERY_NOT_COMPLETE",

        executionAuthority:
          false,

        liveExecution:
          false,
      };
    }


    return {
      approved:
        true,

      state:
        recoveryState,

      action:
        normalizedAction,

      riskIncreasing:
        false,

      riskReducing:
        false,

      blocker:
        null,

      executionAuthority:
        false,

      liveExecution:
        false,
    };
  }


  /**
   * ==========================================================
   * EXCHANGE / RUNTIME RECONCILIATION
   * ==========================================================
   */

  async function reconcileSymbol(
    symbol,
  ) {
    const exchangePosition =
      await exchangeAdapter
        .getPosition(
          symbol,
        );

    const runtimeState =
      statefulRuntime
        .getSymbolState(
          symbol,
        );

    const runtimePosition =
      runtimeState
        ?.position ??
      {};

    const exchangeDirection =
      normalizeDirection(
        exchangePosition
          ?.direction,
      );

    const exchangeQuantity =
      normalizeQuantity(
        exchangePosition
          ?.quantity,
      );

    const runtimeDirection =
      normalizeDirection(
        runtimePosition
          ?.direction,
      );

    const runtimeQuantity =
      normalizeQuantity(
        runtimePosition
          ?.quantity,
      );


    const directionAligned =
      exchangeDirection ===
      runtimeDirection;


    const quantityAligned =
      Math.abs(
        exchangeQuantity -
        runtimeQuantity,
      ) <=
      1e-8;


    if (
      !directionAligned ||
      !quantityAligned
    ) {
      statefulRuntime
        .adoptExchangePosition({
          symbol,

          exchangePosition:
            clone(
              exchangePosition,
            ),
        });
    }


    const after =
      statefulRuntime
        .getSymbolState(
          symbol,
        );


    const resultingDirection =
      normalizeDirection(
        after
          ?.position
          ?.direction,
      );

    const resultingQuantity =
      normalizeQuantity(
        after
          ?.position
          ?.quantity,
      );


    const reconciled =
      resultingDirection ===
        exchangeDirection &&
      Math.abs(
        resultingQuantity -
        exchangeQuantity,
      ) <=
        1e-8;


    return {
      symbol,

      reconciled,

      before: {
        runtimeDirection,
        runtimeQuantity,

        exchangeDirection,
        exchangeQuantity,
      },

      after: {
        direction:
          resultingDirection,

        quantity:
          resultingQuantity,
      },
    };
  }


  async function reconcileRestoredState() {
    recoveryState =
      CRYPTO_RECOVERY_STATE
        .RECONCILING;


    const symbols =
      new Set();


    const ledgerPositions =
      ledger
        .getOpenPositions?.() ??
      [];


    for (
      const position
      of ledgerPositions
    ) {
      const symbol =
        upper(
          position?.symbol,
        );

      if (symbol) {
        symbols.add(
          symbol,
        );
      }
    }

let exchangePositions =
  [];

if (
  typeof exchangeAdapter
    ?.getPositions ===
  "function"
) {
  exchangePositions =
    await exchangeAdapter
      .getPositions();
} else if (
  typeof exchangeAdapter
    ?.getSnapshot ===
  "function"
) {
  const snapshot =
    exchangeAdapter
      .getSnapshot();

  exchangePositions =
    Array.isArray(
      snapshot?.positions,
    )
      ? snapshot.positions
      : [];
}


    for (
      const position
      of exchangePositions
    ) {
      const symbol =
        upper(
          position?.symbol,
        );

      if (symbol) {
        symbols.add(
          symbol,
        );
      }
    }


    const runtimeState =
      statefulRuntime
        .getRuntimeState?.();


    const runtimeSymbols =
      Array.isArray(
        runtimeState?.symbols,
      )
        ? runtimeState.symbols
        : [];


    for (
      const item
      of runtimeSymbols
    ) {
      const symbol =
        upper(
          item?.symbol ??
          item
            ?.state
            ?.symbol,
        );

      if (symbol) {
        symbols.add(
          symbol,
        );
      }
    }


    const results =
      [];


    for (
      const symbol
      of symbols
    ) {
      results.push(
        await reconcileSymbol(
          symbol,
        ),
      );
    }


    const approved =
      results.every(
        result =>
          result.reconciled ===
          true,
      );


    lastReconciliation = {
      approved,

      status:
        approved
          ? "RECONCILIATION_COMPLETE"
          : "RECONCILIATION_FAILED",

      symbolsChecked:
        results.length,

      results,

      completedAt:
        nowIso(),

      executionAuthority:
        false,

      liveExecution:
        false,
    };


    return clone(
      lastReconciliation,
    );
  }


  /**
   * ==========================================================
   * RECOVER
   * ==========================================================
   */

  async function recover({
    allowStaleCheckpoint =
      false,
  } = {}) {
    recoveryStartedAt =
      nowIso();

    recoveryCompletedAt =
      null;

    lastError =
      null;

    recoveryState =
      CRYPTO_RECOVERY_STATE
        .RESTORING;


    const loaded =
      await checkpointManager
        .loadCheckpoint();


    if (
      loaded?.approved !==
      true
    ) {
      recoveryState =
        CRYPTO_RECOVERY_STATE
          .FAILED;

      lastError =
        loaded?.blocker ??
        loaded?.status ??
        "CHECKPOINT_LOAD_FAILED";

      return {
        approved:
          false,

        status:
          "RECOVERY_FAILED",

        blocker:
          lastError,

        recoveryState,

        executionAuthority:
          false,

        liveExecution:
          false,
      };
    }


    lastCheckpoint =
      clone(
        loaded.checkpoint,
      );


    const stale =
      checkpointManager
        .checkpointIsStale({
          checkpoint:
            loaded.checkpoint,

          maximumAgeMs:
            maximumCheckpointAgeMs,
        });


    if (
      stale &&
      !allowStaleCheckpoint
    ) {
      recoveryState =
        CRYPTO_RECOVERY_STATE
          .FAILED;

      lastError =
        "CHECKPOINT_STALE";

      return {
        approved:
          false,

        status:
          "RECOVERY_BLOCKED",

        blocker:
          "CHECKPOINT_STALE",

        recoveryState,

        executionAuthority:
          false,

        liveExecution:
          false,
      };
    }


    const restored =
      await checkpointManager
        .restoreCheckpoint({
          checkpoint:
            loaded.checkpoint,
        });


    if (
      restored?.approved !==
      true
    ) {
      recoveryState =
        CRYPTO_RECOVERY_STATE
          .FAILED;

      lastError =
        restored?.blocker ??
        restored?.status ??
        "CHECKPOINT_RESTORE_FAILED";

      return {
        approved:
          false,

        status:
          "RECOVERY_FAILED",

        blocker:
          lastError,

        recoveryState,

        restore:
          restored,

        executionAuthority:
          false,

        liveExecution:
          false,
      };
    }


    const reconciliation =
      await reconcileRestoredState();


    if (
      reconciliation
        ?.approved !==
      true
    ) {
      recoveryState =
        CRYPTO_RECOVERY_STATE
          .FAILED;

      lastError =
        "RECONCILIATION_FAILED";

      return {
        approved:
          false,

        status:
          "RECOVERY_FAILED",

        blocker:
          lastError,

        recoveryState,

        restore:
          restored,

        reconciliation,

        executionAuthority:
          false,

        liveExecution:
          false,
      };
    }


    recoveryState =
      CRYPTO_RECOVERY_STATE
        .READY;

    recoveryCompletedAt =
      nowIso();


    return {
      approved:
        true,

      status:
        "RECOVERY_COMPLETE",

      recoveryState,

      checkpoint:
        clone(
          loaded.checkpoint,
        ),

      restore:
        restored,

      reconciliation,

      executionAuthority:
        false,

      liveExecution:
        false,
    };
  }


  /**
   * ==========================================================
   * STATE
   * ==========================================================
   */

  function getRecoveryState() {
    return {
      state:
        recoveryState,

      ready:
        recoveryState ===
        CRYPTO_RECOVERY_STATE
          .READY,

      recovering:
        [
          CRYPTO_RECOVERY_STATE
            .RESTORING,

          CRYPTO_RECOVERY_STATE
            .RECONCILING,
        ].includes(
          recoveryState,
        ),

      failed:
        recoveryState ===
        CRYPTO_RECOVERY_STATE
          .FAILED,

      recoveryStartedAt,

      recoveryCompletedAt,

      lastError,

      lastCheckpoint:
        clone(
          lastCheckpoint,
        ),

      lastReconciliation:
        clone(
          lastReconciliation,
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
    recover,

    initializeFreshStart,

    reconcileRestoredState,

    evaluateAction,

    getRecoveryState,

    paperExecution:
      true,

    liveExecution:
      false,

    executionAuthority:
      false,
  };
}


export default
  createCryptoPaperRecoveryRuntime;