/**
 * ============================================================
 * AEMA CRYPTO
 * Phase 5.30
 *
 * RUNTIME SUPERVISOR DIAGNOSTIC
 * ============================================================
 *
 * Validates:
 *
 * - NORMAL permits new risk
 * - DEGRADED blocks new risk
 * - SAFE_MODE blocks new risk
 * - HALTED blocks new risk
 * - reductions remain available
 * - closes remain available
 * - emergency exits remain available
 * - protective stop actions remain available
 * - stale market data creates SAFE_MODE
 * - repeated failures create SAFE_MODE
 * - hard failure creates HALTED
 * - recovery back to healthy returns NORMAL
 * - unknown actions fail closed
 * - no live execution authority exists
 */

import {
  createCryptoTradingRuntimeSupervisor,
} from "../src/crypto/trading/runtime/cryptoTradingRuntimeSupervisor.js";


console.log(
  "\nAEMA CRYPTO PHASE 5.30 — RUNTIME SUPERVISOR / HEALTH / SAFE MODE\n",
);


/**
 * ============================================================
 * MOCK SUBSYSTEMS
 * ============================================================
 *
 * We intentionally use controllable subsystem mocks here.
 * This diagnostic tests the supervisor contract itself without
 * modifying the already-passing Phase 5.18–5.29 components.
 */

const subsystemState = {
  recovery: {
    state:
      "READY",

    ready:
      true,

    recovering:
      false,

    failed:
      false,
  },

  persistence: {
    dirty:
      false,

    degraded:
      false,

    failureCount:
      0,
  },

  continuous: {
    status:
      "RUNNING",

    healthy:
      true,

    staleDataCount:
      0,

    errorCount:
      0,

    liveExecution:
      false,

    executionAuthority:
      false,
  },
};


const recoveryRuntime = {
  getRecoveryState() {
    return {
      ...subsystemState
        .recovery,
    };
  },
};


const autoCheckpointManager = {
  getHealth() {
    return {
      ...subsystemState
        .persistence,
    };
  },
};


const continuousRuntime = {
  getHealth() {
    return {
      ...subsystemState
        .continuous,
    };
  },
};


const supervisor =
  createCryptoTradingRuntimeSupervisor({
    recoveryRuntime,

    autoCheckpointManager,

    continuousRuntime,

    maximumMarketDataAgeMs:
      60_000,

    maximumRepeatedFailures:
      3,
  });


const rows =
  [];


function record(
  scenario,
  result,
) {
  rows.push({
    scenario,

    state:
      result
        ?.supervisorState ??
      result
        ?.state ??
      "N/A",

    action:
      result
        ?.action ??
      "N/A",

    approved:
      result
        ?.approved ??
      "N/A",

    classification:
      result
        ?.classification ??
      "N/A",

    blocker:
      result
        ?.blocker ??
      "NONE",

    authority:
      result
        ?.executionAuthority ??
      false,

    live:
      result
        ?.liveExecution ??
      false,
  });

  return result;
}


/**
 * ============================================================
 * 1. HEALTHY / NORMAL
 * ============================================================
 */

const normalOpen =
  record(
    "NORMAL_OPEN",
    supervisor.evaluateAction({
      action:
        "OPEN_POSITION",
    }),
  );


const normalIncrease =
  record(
    "NORMAL_INCREASE",
    supervisor.evaluateAction({
      action:
        "ADD_EXPOSURE",
    }),
  );


/**
 * ============================================================
 * 2. DEGRADED PERSISTENCE
 * ============================================================
 */

subsystemState
  .persistence
  .dirty =
    true;

subsystemState
  .persistence
  .degraded =
    true;

subsystemState
  .persistence
  .failureCount =
    1;


const degradedOpen =
  record(
    "DEGRADED_OPEN",
    supervisor.evaluateAction({
      action:
        "OPEN_POSITION",
    }),
  );


const degradedReduce =
  record(
    "DEGRADED_REDUCE",
    supervisor.evaluateAction({
      action:
        "REDUCE_EXPOSURE",
    }),
  );


const degradedClose =
  record(
    "DEGRADED_CLOSE",
    supervisor.evaluateAction({
      action:
        "CLOSE_POSITION",
    }),
  );


/**
 * Restore persistence.
 */

subsystemState
  .persistence
  .dirty =
    false;

subsystemState
  .persistence
  .degraded =
    false;


/**
 * ============================================================
 * 3. STALE MARKET DATA → SAFE MODE
 * ============================================================
 */

supervisor
  .setMarketDataHealth({
    fresh:
      false,

    ageMs:
      120_000,
  });


const staleOpen =
  record(
    "STALE_DATA_OPEN",
    supervisor.evaluateAction({
      action:
        "OPEN_POSITION",
    }),
  );


const staleStop =
  record(
    "STALE_DATA_STOP",
    supervisor.evaluateAction({
      action:
        "REPLACE_STOP",
    }),
  );


const staleEmergency =
  record(
    "STALE_DATA_EMERGENCY",
    supervisor.evaluateAction({
      action:
        "EMERGENCY_CLOSE",
    }),
  );


/**
 * Restore fresh data.
 */

supervisor
  .setMarketDataHealth({
    fresh:
      true,

    ageMs:
      1_000,
  });


/**
 * ============================================================
 * 4. REPEATED FAILURES → SAFE MODE
 * ============================================================
 */

supervisor
  .recordRuntimeFailure();

supervisor
  .recordRuntimeFailure();

supervisor
  .recordRuntimeFailure();


const failureOpen =
  record(
    "FAILURE_LIMIT_OPEN",
    supervisor.evaluateAction({
      action:
        "OPEN_POSITION",
    }),
  );


const failureClose =
  record(
    "FAILURE_LIMIT_CLOSE",
    supervisor.evaluateAction({
      action:
        "CLOSE_POSITION",
    }),
  );


/**
 * Clear runtime failure pressure.
 */

supervisor
  .clearRuntimeFailures();


/**
 * ============================================================
 * 5. RECOVERY INCOMPLETE → SAFE MODE
 * ============================================================
 */

subsystemState
  .recovery
  .state =
    "RECONCILING";

subsystemState
  .recovery
  .ready =
    false;

subsystemState
  .recovery
  .recovering =
    true;


const recoveryOpen =
  record(
    "RECOVERY_OPEN",
    supervisor.evaluateAction({
      action:
        "OPEN_POSITION",
    }),
  );


const recoveryReduce =
  record(
    "RECOVERY_REDUCE",
    supervisor.evaluateAction({
      action:
        "REDUCE_EXPOSURE",
    }),
  );


/**
 * Restore recovery readiness.
 */

subsystemState
  .recovery
  .state =
    "READY";

subsystemState
  .recovery
  .ready =
    true;

subsystemState
  .recovery
  .recovering =
    false;


/**
 * ============================================================
 * 6. HARD FAILURE → HALTED
 * ============================================================
 */

supervisor
  .setHardFailure({
    active:
      true,

    reason:
      "DIAGNOSTIC_HARD_FAILURE",
  });


const haltedOpen =
  record(
    "HALTED_OPEN",
    supervisor.evaluateAction({
      action:
        "OPEN_POSITION",
    }),
  );


const haltedReduce =
  record(
    "HALTED_REDUCE",
    supervisor.evaluateAction({
      action:
        "REDUCE_EXPOSURE",
    }),
  );


const haltedClose =
  record(
    "HALTED_CLOSE",
    supervisor.evaluateAction({
      action:
        "CLOSE_POSITION",
    }),
  );


const haltedStop =
  record(
    "HALTED_STOP",
    supervisor.evaluateAction({
      action:
        "REPLACE_STOP",
    }),
  );


const haltedEmergency =
  record(
    "HALTED_EMERGENCY",
    supervisor.evaluateAction({
      action:
        "EMERGENCY_CLOSE",
    }),
  );


/**
 * ============================================================
 * 7. RECOVER FROM HARD FAILURE
 * ============================================================
 */

supervisor
  .clearHardFailure();


const recoveredOpen =
  record(
    "RECOVERED_OPEN",
    supervisor.evaluateAction({
      action:
        "OPEN_POSITION",
    }),
  );


/**
 * ============================================================
 * 8. UNKNOWN ACTION FAILS CLOSED
 * ============================================================
 */

const unknownAction =
  record(
    "UNKNOWN_ACTION",
    supervisor.evaluateAction({
      action:
        "DO_SOMETHING_UNSAFE",
    }),
  );


/**
 * ============================================================
 * FINAL STATE
 * ============================================================
 */

const finalState =
  supervisor
    .getSupervisorState();


console.table(
  rows,
);


/**
 * ============================================================
 * INVARIANTS
 * ============================================================
 */

const invariants = {
  healthyRuntimeStartsNormal:
    normalOpen
      .supervisorState ===
      "NORMAL",

  healthyRuntimeAllowsOpen:
    normalOpen
      .approved ===
      true,

  healthyRuntimeAllowsIncrease:
    normalIncrease
      .approved ===
      true,

  persistenceFailureCreatesDegraded:
    degradedOpen
      .supervisorState ===
      "DEGRADED",

  degradedBlocksNewRisk:
    degradedOpen
      .approved ===
      false,

  degradedAllowsReduction:
    degradedReduce
      .approved ===
      true,

  degradedAllowsClose:
    degradedClose
      .approved ===
      true,

  staleMarketDataCreatesSafeMode:
    staleOpen
      .supervisorState ===
      "SAFE_MODE",

  staleMarketDataBlocksNewRisk:
    staleOpen
      .approved ===
      false,

  stopAllowedDuringSafeMode:
    staleStop
      .approved ===
      true,

  emergencyAllowedDuringSafeMode:
    staleEmergency
      .approved ===
      true,

  repeatedFailuresCreateSafeMode:
    failureOpen
      .supervisorState ===
      "SAFE_MODE",

  repeatedFailuresBlockNewRisk:
    failureOpen
      .approved ===
      false,

  closeAllowedDuringFailureSafeMode:
    failureClose
      .approved ===
      true,

  incompleteRecoveryCreatesSafeMode:
    recoveryOpen
      .supervisorState ===
      "SAFE_MODE",

  incompleteRecoveryBlocksNewRisk:
    recoveryOpen
      .approved ===
      false,

  reductionAllowedDuringRecovery:
    recoveryReduce
      .approved ===
      true,

  hardFailureCreatesHalted:
    haltedOpen
      .supervisorState ===
      "HALTED",

  haltedBlocksNewRisk:
    haltedOpen
      .approved ===
      false,

  haltedStillAllowsReduction:
    haltedReduce
      .approved ===
      true,

  haltedStillAllowsClose:
    haltedClose
      .approved ===
      true,

  haltedStillAllowsProtection:
    haltedStop
      .approved ===
      true,

  haltedStillAllowsEmergency:
    haltedEmergency
      .approved ===
      true,

  supervisorCanRecoverToNormal:
    recoveredOpen
      .supervisorState ===
      "NORMAL",

  newRiskReturnsAfterRecovery:
    recoveredOpen
      .approved ===
      true,

  unknownActionFailsClosed:
    unknownAction
      .approved ===
      false,

  unknownActionHasBlocker:
    unknownAction
      .blocker ===
      "UNKNOWN_RUNTIME_ACTION",

  transitionsRecorded:
    Array.isArray(
      finalState
        .transitionHistory,
    ) &&
    finalState
      .transitionHistory
      .length >
      0,

  noExecutionAuthority:
    rows.every(
      (row) =>
        row.authority ===
        false,
    ) &&
    finalState
      .executionAuthority ===
      false,

  liveExecutionDisabled:
    rows.every(
      (row) =>
        row.live ===
        false,
    ) &&
    finalState
      .liveExecution ===
      false &&
    finalState
      .liveExecutionEnabled ===
      false,
};


console.log(
  "\nINVARIANTS",
);

console.dir(
  invariants,
  {
    depth:
      null,
  },
);


const passed =
  Object
    .values(
      invariants,
    )
    .every(
      (value) =>
        value ===
        true,
    );


if (!passed) {
  console.error(
    "\nPHASE 5.30 FAILED — one or more invariants failed.",
  );

  process.exitCode =
    1;
} else {
  console.log(
    "\nPHASE 5.30 PASSED — runtime supervision, health gating and safe-mode behavior is valid.",
  );
}