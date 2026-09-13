/**
 * ============================================================
 * AEMA CRYPTO
 * TRADING RUNTIME SUPERVISOR
 * Phase 5.30
 * ============================================================
 *
 * Purpose:
 *
 * - supervise the crypto paper-trading runtime
 * - consume the normalized runtime health snapshot
 * - determine whether requested runtime actions are permitted
 * - block new / increased risk when system health is unsafe
 * - ALWAYS preserve risk reduction and emergency authority
 * - expose a frontend-friendly supervisor snapshot
 *
 * IMPORTANT:
 *
 * This supervisor:
 * - does NOT submit orders
 * - does NOT execute trades
 * - does NOT make network calls
 * - does NOT grant live execution authority
 *
 * Live execution is permanently disabled here.
 */

import {
  buildCryptoRuntimeHealthSnapshot,
  CRYPTO_RUNTIME_HEALTH_STATE,
} from "./cryptoRuntimeHealthSnapshot.js";


const LIVE_EXECUTION_ENABLED =
  false;


/**
 * Actions that may create or increase
 * portfolio exposure.
 */
const RISK_INCREASING_ACTIONS =
  new Set([
    "OPEN",
    "OPEN_POSITION",
    "INCREASE",
    "ADD_EXPOSURE",
    "RETRY_REMAINDER",
  ]);


/**
 * Actions that reduce existing risk.
 *
 * These MUST remain available even when
 * the supervisor is in SAFE_MODE or HALTED.
 */
const RISK_REDUCING_ACTIONS =
  new Set([
    "REDUCE",
    "REDUCE_EXPOSURE",

    "CLOSE",
    "CLOSE_POSITION",
    "EXIT_POSITION",

    "EMERGENCY",
    "EMERGENCY_EXIT",
    "EMERGENCY_CLOSE",
  ]);


/**
 * Protective actions do not create
 * directional exposure.
 */
const PROTECTIVE_ACTIONS =
  new Set([
    "STOP_UPDATE",
    "REPLACE_STOP",
    "REPAIR_STOP",
    "PROTECT_POSITION",
    "MOVE_STOP_TO_BREAKEVEN",
    "TRAIL_STOP",
  ]);


/**
 * Administrative/no-risk actions.
 */
const PASSIVE_ACTIONS =
  new Set([
    "NONE",
    "NO_ACTION",
    "WAIT",
    "HOLD",
    "IN_SYNC",
    "CANCEL_ORDER",
    "CANCEL_STALE",
    "MANUAL_REVIEW",
  ]);


function clone(
  value,
) {
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


function upper(
  value,
  fallback = "NONE",
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


function nowIso() {
  return new Date()
    .toISOString();
}


function normalizeAction(
  action,
) {
  return upper(
    action,
    "NONE",
  );
}


function classifyAction(
  action,
) {
  const normalized =
    normalizeAction(
      action,
    );

  if (
    RISK_INCREASING_ACTIONS
      .has(normalized)
  ) {
    return {
      action:
        normalized,

      classification:
        "RISK_INCREASING",

      riskIncreasing:
        true,

      riskReducing:
        false,

      protective:
        false,

      passive:
        false,
    };
  }

  if (
    RISK_REDUCING_ACTIONS
      .has(normalized)
  ) {
    return {
      action:
        normalized,

      classification:
        "RISK_REDUCING",

      riskIncreasing:
        false,

      riskReducing:
        true,

      protective:
        false,

      passive:
        false,
    };
  }

  if (
    PROTECTIVE_ACTIONS
      .has(normalized)
  ) {
    return {
      action:
        normalized,

      classification:
        "PROTECTIVE",

      riskIncreasing:
        false,

      riskReducing:
        true,

      protective:
        true,

      passive:
        false,
    };
  }

  if (
    PASSIVE_ACTIONS
      .has(normalized)
  ) {
    return {
      action:
        normalized,

      classification:
        "PASSIVE",

      riskIncreasing:
        false,

      riskReducing:
        false,

      protective:
        false,

      passive:
        true,
    };
  }

  /*
   * Unknown actions are deliberately
   * conservative.
   *
   * They are NOT assumed to be
   * risk-reducing.
   */
  return {
    action:
      normalized,

    classification:
      "UNKNOWN",

    riskIncreasing:
      false,

    riskReducing:
      false,

    protective:
      false,

    passive:
      false,
  };
}


function healthStateToSupervisorState(
  healthState,
) {
  switch (
    upper(
      healthState,
      "HEALTHY",
    )
  ) {
    case CRYPTO_RUNTIME_HEALTH_STATE
      .HALTED:
      return "HALTED";

    case CRYPTO_RUNTIME_HEALTH_STATE
      .SAFE_MODE:
      return "SAFE_MODE";

    case CRYPTO_RUNTIME_HEALTH_STATE
      .DEGRADED:
      return "DEGRADED";

    default:
      return "NORMAL";
  }
}


export const
  CRYPTO_RUNTIME_SUPERVISOR_STATE =
    Object.freeze({
      NORMAL:
        "NORMAL",

      DEGRADED:
        "DEGRADED",

      SAFE_MODE:
        "SAFE_MODE",

      HALTED:
        "HALTED",
    });


export function
createCryptoTradingRuntimeSupervisor({
  crashSafeRuntime = null,

  recoveryRuntime = null,

  autoCheckpointManager = null,

  continuousRuntime = null,

  maximumMarketDataAgeMs =
    60_000,

  maximumRepeatedFailures =
    3,
} = {}) {
  const state = {
    startedAt:
      nowIso(),

    updatedAt:
      nowIso(),

    evaluationCount:
      0,

    decisionCount:
      0,

    blockedCount:
      0,

    allowedCount:
      0,

    marketDataFresh:
      true,

    marketDataAgeMs:
      0,

    repeatedFailureCount:
      0,

    hardFailure:
      false,

    hardFailureReason:
      null,

    lastHealth:
      null,

    lastDecision:
      null,

    transitionHistory:
      [],

    supervisorState:
      CRYPTO_RUNTIME_SUPERVISOR_STATE
        .NORMAL,
  };


  function recordTransition(
    previousState,
    nextState,
    health,
  ) {
    if (
      previousState ===
      nextState
    ) {
      return;
    }

    state.transitionHistory
      .push({
        from:
          previousState,

        to:
          nextState,

        at:
          nowIso(),

        reasons:
          clone(
            health?.reasons ??
            [],
          ),
      });

    /*
     * Prevent an indefinitely growing
     * in-memory history.
     */
    if (
      state.transitionHistory
        .length >
      100
    ) {
      state.transitionHistory =
        state.transitionHistory
          .slice(-100);
    }
  }


  function evaluateHealth(
    overrides = {},
  ) {
    const health =
      buildCryptoRuntimeHealthSnapshot({
        crashSafeRuntime,

        recoveryRuntime,

        autoCheckpointManager,

        continuousRuntime,

        marketDataFresh:
          overrides
            .marketDataFresh ??
          state.marketDataFresh,

        marketDataAgeMs:
          overrides
            .marketDataAgeMs ??
          state.marketDataAgeMs,

        maximumMarketDataAgeMs:
          overrides
            .maximumMarketDataAgeMs ??
          maximumMarketDataAgeMs,

        repeatedFailureCount:
          overrides
            .repeatedFailureCount ??
          state
            .repeatedFailureCount,

        maximumRepeatedFailures:
          overrides
            .maximumRepeatedFailures ??
          maximumRepeatedFailures,

        hardFailure:
          overrides
            .hardFailure ??
          state.hardFailure,
      });


    const previousState =
      state.supervisorState;


    const nextState =
      healthStateToSupervisorState(
        health.state,
      );


    state.supervisorState =
      nextState;

    state.lastHealth =
      clone(
        health,
      );

    state.evaluationCount +=
      1;

    state.updatedAt =
      nowIso();


    recordTransition(
      previousState,
      nextState,
      health,
    );


    return clone(
      health,
    );
  }


  function evaluateAction({
    action = "NONE",

    marketDataFresh =
      undefined,

    marketDataAgeMs =
      undefined,
  } = {}) {
    if (
      marketDataFresh !==
      undefined
    ) {
      state.marketDataFresh =
        marketDataFresh ===
        true;
    }


    if (
      marketDataAgeMs !==
      undefined
    ) {
      state.marketDataAgeMs =
        Math.max(
          0,
          finite(
            marketDataAgeMs,
            0,
          ),
        );
    }


    const health =
      evaluateHealth();


    const classification =
      classifyAction(
        action,
      );


    const supervisorState =
      state.supervisorState;


    let approved =
      false;

    let blocker =
      "NONE";

    let reason =
      "ACTION_ALLOWED";


    /**
     * ========================================================
     * RISK REDUCTION
     * ========================================================
     *
     * This check intentionally comes first.
     *
     * Even HALTED does not prevent the
     * system from reducing existing risk.
     */
    if (
      classification
        .riskReducing
    ) {
      approved =
        true;

      reason =
        classification
          .protective
          ? "PROTECTIVE_ACTION_ALLOWED"
          : "RISK_REDUCTION_ALWAYS_ALLOWED";
    }


    /**
     * ========================================================
     * PASSIVE ACTIONS
     * ========================================================
     */
    else if (
      classification
        .passive
    ) {
      approved =
        true;

      reason =
        "PASSIVE_ACTION_ALLOWED";
    }


    /**
     * ========================================================
     * UNKNOWN ACTION
     * ========================================================
     */
    else if (
      classification
        .classification ===
      "UNKNOWN"
    ) {
      approved =
        false;

      blocker =
        "UNKNOWN_RUNTIME_ACTION";

      reason =
        "UNKNOWN_ACTION_REJECTED";
    }


    /**
     * ========================================================
     * RISK INCREASE
     * ========================================================
     */
    else if (
      classification
        .riskIncreasing
    ) {
      if (
        supervisorState ===
        CRYPTO_RUNTIME_SUPERVISOR_STATE
          .NORMAL
      ) {
        approved =
          true;

        reason =
          "NEW_RISK_ALLOWED";
      } else if (
        supervisorState ===
        CRYPTO_RUNTIME_SUPERVISOR_STATE
          .DEGRADED
      ) {
        approved =
          false;

        blocker =
          "RUNTIME_DEGRADED";

        reason =
          "NEW_RISK_BLOCKED";
      } else if (
        supervisorState ===
        CRYPTO_RUNTIME_SUPERVISOR_STATE
          .SAFE_MODE
      ) {
        approved =
          false;

        blocker =
          "RUNTIME_SAFE_MODE";

        reason =
          "NEW_RISK_BLOCKED";
      } else {
        approved =
          false;

        blocker =
          "RUNTIME_HALTED";

        reason =
          "NEW_RISK_BLOCKED";
      }
    }


    const result = {
      approved,

      status:
        approved
          ? "SUPERVISOR_ACTION_ALLOWED"
          : "SUPERVISOR_ACTION_BLOCKED",

      supervisorState,

      action:
        classification.action,

      classification:
        classification
          .classification,

      riskIncreasing:
        classification
          .riskIncreasing,

      riskReducing:
        classification
          .riskReducing,

      protective:
        classification
          .protective,

      blocker,

      reason,

      health:
        clone(
          health,
        ),

      executionAuthority:
        false,

      liveExecution:
        false,
    };


    state.lastDecision =
      clone(
        result,
      );

    state.decisionCount +=
      1;


    if (approved) {
      state.allowedCount +=
        1;
    } else {
      state.blockedCount +=
        1;
    }


    state.updatedAt =
      nowIso();


    return result;
  }


  function setMarketDataHealth({
    fresh = true,
    ageMs = 0,
  } = {}) {
    state.marketDataFresh =
      fresh === true;

    state.marketDataAgeMs =
      Math.max(
        0,
        finite(
          ageMs,
          0,
        ),
      );

    state.updatedAt =
      nowIso();

    return evaluateHealth();
  }


  function recordRuntimeFailure({
    count = 1,
  } = {}) {
    state.repeatedFailureCount +=
      Math.max(
        1,
        finite(
          count,
          1,
        ),
      );

    state.updatedAt =
      nowIso();

    return evaluateHealth();
  }


  function clearRuntimeFailures() {
    state.repeatedFailureCount =
      0;

    state.updatedAt =
      nowIso();

    return evaluateHealth();
  }


  function setHardFailure({
    active = true,
    reason = null,
  } = {}) {
    state.hardFailure =
      active === true;

    state.hardFailureReason =
      state.hardFailure
        ? upper(
            reason,
            "HARD_RUNTIME_FAILURE",
          )
        : null;

    state.updatedAt =
      nowIso();

    return evaluateHealth();
  }


  function clearHardFailure() {
    state.hardFailure =
      false;

    state.hardFailureReason =
      null;

    state.updatedAt =
      nowIso();

    return evaluateHealth();
  }


  function getHealth() {
    return (
      state.lastHealth ??
      evaluateHealth()
    );
  }


  function getSupervisorState() {
    return {
      supervisorState:
        state.supervisorState,

      startedAt:
        state.startedAt,

      updatedAt:
        state.updatedAt,

      evaluationCount:
        state.evaluationCount,

      decisionCount:
        state.decisionCount,

      allowedCount:
        state.allowedCount,

      blockedCount:
        state.blockedCount,

      marketDataFresh:
        state.marketDataFresh,

      marketDataAgeMs:
        state.marketDataAgeMs,

      repeatedFailureCount:
        state.repeatedFailureCount,

      hardFailure:
        state.hardFailure,

      hardFailureReason:
        state.hardFailureReason,

      health:
        clone(
          state.lastHealth,
        ),

      lastDecision:
        clone(
          state.lastDecision,
        ),

      transitionHistory:
        clone(
          state.transitionHistory,
        ),

      paperExecution:
        true,

      liveExecution:
        false,

      liveExecutionEnabled:
        LIVE_EXECUTION_ENABLED,

      executionAuthority:
        false,
    };
  }


  function resetSupervisorState() {
    state.marketDataFresh =
      true;

    state.marketDataAgeMs =
      0;

    state.repeatedFailureCount =
      0;

    state.hardFailure =
      false;

    state.hardFailureReason =
      null;

    state.lastHealth =
      null;

    state.lastDecision =
      null;

    state.transitionHistory =
      [];

    state.supervisorState =
      CRYPTO_RUNTIME_SUPERVISOR_STATE
        .NORMAL;

    state.evaluationCount =
      0;

    state.decisionCount =
      0;

    state.allowedCount =
      0;

    state.blockedCount =
      0;

    state.updatedAt =
      nowIso();

    return getSupervisorState();
  }


  return {
    evaluateHealth,

    evaluateAction,

    setMarketDataHealth,

    recordRuntimeFailure,

    clearRuntimeFailures,

    setHardFailure,

    clearHardFailure,

    getHealth,

    getSupervisorState,

    resetSupervisorState,

    executionAuthority:
      false,

    liveExecution:
      false,

    liveExecutionEnabled:
      LIVE_EXECUTION_ENABLED,
  };
}


export default
  createCryptoTradingRuntimeSupervisor;