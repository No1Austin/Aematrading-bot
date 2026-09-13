/**
 * ============================================================
 * AEMA CRYPTO
 * RUNTIME HEALTH SNAPSHOT
 * Phase 5.30
 * ============================================================
 *
 * Purpose:
 *
 * - combine health signals from runtime subsystems
 * - normalize recovery / persistence / runtime health
 * - detect degraded or unsafe operating conditions
 * - produce one supervisor-friendly health snapshot
 *
 * IMPORTANT:
 *
 * This module:
 * - does NOT execute trades
 * - does NOT mutate runtime state
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


function nowIso() {
  return new Date()
    .toISOString();
}


export const CRYPTO_RUNTIME_HEALTH_STATE =
  Object.freeze({
    HEALTHY:
      "HEALTHY",

    DEGRADED:
      "DEGRADED",

    SAFE_MODE:
      "SAFE_MODE",

    HALTED:
      "HALTED",
  });


export function buildCryptoRuntimeHealthSnapshot({
  crashSafeRuntime = null,

  recoveryRuntime = null,

  autoCheckpointManager = null,

  continuousRuntime = null,

  marketDataFresh = true,

  marketDataAgeMs = 0,

  maximumMarketDataAgeMs =
    60_000,

  repeatedFailureCount = 0,

  maximumRepeatedFailures = 3,

  hardFailure = false,
} = {}) {
  const reasons =
    [];

  const warnings =
    [];


  /**
   * ==========================================================
   * SUBSYSTEM HEALTH
   * ==========================================================
   */

  const crashSafeHealth =
    crashSafeRuntime &&
    typeof crashSafeRuntime
      .getHealth ===
    "function"
      ? crashSafeRuntime
          .getHealth()
      : null;


  const recoveryHealth =
    recoveryRuntime &&
    typeof recoveryRuntime
      .getRecoveryState ===
    "function"
      ? recoveryRuntime
          .getRecoveryState()
      : crashSafeHealth
          ?.recovery ??
        null;


  const persistenceHealth =
    autoCheckpointManager &&
    typeof autoCheckpointManager
      .getHealth ===
    "function"
      ? autoCheckpointManager
          .getHealth()
      : crashSafeHealth
          ?.persistence ??
        null;


  const continuousHealth =
    continuousRuntime &&
    typeof continuousRuntime
      .getHealth ===
    "function"
      ? continuousRuntime
          .getHealth()
      : crashSafeHealth
          ?.runtime ??
        null;


  /**
   * ==========================================================
   * RECOVERY
   * ==========================================================
   */

  const recoveryState =
    upper(
      recoveryHealth?.state,
      recoveryHealth?.ready === true
        ? "READY"
        : "UNKNOWN",
    );


  const recoveryReady =
    recoveryHealth === null
      ? true
      : recoveryHealth?.ready ===
          true ||
        recoveryState ===
          "READY";


  const recoveryFailed =
    recoveryHealth?.failed ===
      true ||
    recoveryState ===
      "FAILED";


  const recoveryActive =
    recoveryHealth?.recovering ===
      true ||
    [
      "RESTORING",
      "RECONCILING",
    ].includes(
      recoveryState,
    );


  if (recoveryFailed) {
    reasons.push(
      "RECOVERY_FAILED",
    );
  } else if (
    recoveryActive
  ) {
    reasons.push(
      "RECOVERY_IN_PROGRESS",
    );
  } else if (
    !recoveryReady
  ) {
    reasons.push(
      "RECOVERY_NOT_READY",
    );
  }


  /**
   * ==========================================================
   * PERSISTENCE
   * ==========================================================
   */

  const persistenceDirty =
    persistenceHealth?.dirty ===
    true;


  const persistenceDegraded =
    persistenceHealth?.degraded ===
      true ||
    persistenceDirty;


  const persistenceFailures =
    Math.max(
      0,
      finite(
        persistenceHealth
          ?.failureCount,
        0,
      ),
    );


  if (persistenceDirty) {
    reasons.push(
      "PERSISTENCE_DIRTY",
    );
  }


  if (
    persistenceFailures >
    0
  ) {
    warnings.push(
      "PERSISTENCE_FAILURES_RECORDED",
    );
  }


  /**
   * ==========================================================
   * MARKET DATA
   * ==========================================================
   */

  const normalizedMarketDataAgeMs =
    Math.max(
      0,
      finite(
        marketDataAgeMs,
        0,
      ),
    );


  const normalizedMaximumAgeMs =
    Math.max(
      1,
      finite(
        maximumMarketDataAgeMs,
        60_000,
      ),
    );


  const marketDataStale =
    marketDataFresh !==
      true ||
    normalizedMarketDataAgeMs >
      normalizedMaximumAgeMs;


  if (marketDataStale) {
    reasons.push(
      "MARKET_DATA_STALE",
    );
  }


  /**
   * ==========================================================
   * FAILURE PRESSURE
   * ==========================================================
   */

  const normalizedFailureCount =
    Math.max(
      0,
      finite(
        repeatedFailureCount,
        0,
      ),
    );


  const normalizedFailureLimit =
    Math.max(
      1,
      finite(
        maximumRepeatedFailures,
        3,
      ),
    );


  const repeatedFailuresExceeded =
    normalizedFailureCount >=
    normalizedFailureLimit;


  if (
    repeatedFailuresExceeded
  ) {
    reasons.push(
      "REPEATED_RUNTIME_FAILURES",
    );
  }


  /**
   * ==========================================================
   * HARD FAILURE
   * ==========================================================
   */

  if (hardFailure) {
    reasons.push(
      "HARD_RUNTIME_FAILURE",
    );
  }


  /**
   * ==========================================================
   * DETERMINE HEALTH STATE
   * ==========================================================
   */

  let state =
    CRYPTO_RUNTIME_HEALTH_STATE
      .HEALTHY;


  if (hardFailure) {
    state =
      CRYPTO_RUNTIME_HEALTH_STATE
        .HALTED;
  } else if (
    recoveryFailed
  ) {
    state =
      CRYPTO_RUNTIME_HEALTH_STATE
        .SAFE_MODE;
  } else if (
    recoveryActive ||
    !recoveryReady ||
    marketDataStale ||
    repeatedFailuresExceeded
  ) {
    state =
      CRYPTO_RUNTIME_HEALTH_STATE
        .SAFE_MODE;
  } else if (
    persistenceDegraded
  ) {
    state =
      CRYPTO_RUNTIME_HEALTH_STATE
        .DEGRADED;
  }


  /**
   * ==========================================================
   * RISK PERMISSIONS
   * ==========================================================
   *
   * Core design rule:
   *
   * unsafe state may veto NEW/INCREASED risk,
   * but must never veto reduction / exit / protection.
   */

  const newRiskAllowed =
    state ===
    CRYPTO_RUNTIME_HEALTH_STATE
      .HEALTHY;


  const increasedRiskAllowed =
    newRiskAllowed;


  const riskReductionAllowed =
    true;


  const emergencyExitAllowed =
    true;


  const protectionAllowed =
    true;


  /**
   * ==========================================================
   * RESULT
   * ==========================================================
   */

  return {
    generatedAt:
      nowIso(),

    state,

    healthy:
      state ===
      CRYPTO_RUNTIME_HEALTH_STATE
        .HEALTHY,

    degraded:
      state ===
      CRYPTO_RUNTIME_HEALTH_STATE
        .DEGRADED,

    safeMode:
      state ===
      CRYPTO_RUNTIME_HEALTH_STATE
        .SAFE_MODE,

    halted:
      state ===
      CRYPTO_RUNTIME_HEALTH_STATE
        .HALTED,

    reasons,

    warnings,

    permissions: {
      newRiskAllowed,

      increasedRiskAllowed,

      riskReductionAllowed,

      emergencyExitAllowed,

      protectionAllowed,
    },

    recovery: {
      configured:
        recoveryHealth !==
        null,

      state:
        recoveryState,

      ready:
        recoveryReady,

      recovering:
        recoveryActive,

      failed:
        recoveryFailed,

      snapshot:
        clone(
          recoveryHealth,
        ),
    },

    persistence: {
      configured:
        persistenceHealth !==
        null,

      dirty:
        persistenceDirty,

      degraded:
        persistenceDegraded,

      failureCount:
        persistenceFailures,

      snapshot:
        clone(
          persistenceHealth,
        ),
    },

    marketData: {
      fresh:
        !marketDataStale,

      stale:
        marketDataStale,

      ageMs:
        normalizedMarketDataAgeMs,

      maximumAgeMs:
        normalizedMaximumAgeMs,
    },

    failures: {
      repeatedFailureCount:
        normalizedFailureCount,

      maximumRepeatedFailures:
        normalizedFailureLimit,

      thresholdExceeded:
        repeatedFailuresExceeded,

      hardFailure:
        hardFailure ===
        true,
    },

    runtime:
      clone(
        continuousHealth,
      ),

    crashSafe:
      clone(
        crashSafeHealth,
      ),

    paperExecution:
      true,

    liveExecution:
      false,

    executionAuthority:
      false,
  };
}


export default
  buildCryptoRuntimeHealthSnapshot;