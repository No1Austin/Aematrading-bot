/**
 * ============================================================
 * AEMA CRYPTO
 * SHARED RUNTIME CONTAINER
 * Phase 5.31
 * ============================================================
 *
 * Creates ONE shared paper-trading state graph for the server.
 *
 * All crypto API endpoints read from these same instances.
 *
 * PAPER ONLY.
 * NO live execution.
 * NO execution authority.
 */

import createCryptoPaperAccountLedger
  from "../trading/account/cryptoPaperAccountLedger.js";

import createCryptoPaperTradingRuntime
  from "../trading/runtime/cryptoPaperTradingRuntime.js";

import createPaperCryptoExchangeAdapter
  from "../trading/execution/paperCryptoExchangeAdapter.js";

import createCryptoPaperStateStore
  from "../trading/persistence/cryptoPaperStateStore.js";

import createCryptoPaperCheckpointManager
  from "../trading/persistence/cryptoPaperCheckpointManager.js";

import createCryptoPaperRecoveryRuntime
  from "../trading/runtime/cryptoPaperRecoveryRuntime.js";

import createCryptoPaperAutoCheckpointManager
  from "../trading/persistence/cryptoPaperAutoCheckpointManager.js";

import createCryptoTradingRuntimeSupervisor
  from "../trading/runtime/cryptoTradingRuntimeSupervisor.js";

import createCryptoRuntimeApiService
  from "../api/cryptoRuntimeApiService.js";

import createCryptoScannerService
  from "../scanner/cryptoScannerService.js";
/**
 * ============================================================
 * CONFIG
 * ============================================================
 */

const startingEquity =
  Number.isFinite(
    Number(
      process.env
        .AEMA_CRYPTO_PAPER_STARTING_EQUITY,
    ),
  )
    ? Math.max(
        1,
        Number(
          process.env
            .AEMA_CRYPTO_PAPER_STARTING_EQUITY,
        ),
      )
    : 10_000;


const checkpointPath =
  process.env
    .AEMA_CRYPTO_CHECKPOINT_PATH ??
  "data/crypto-paper/runtime-checkpoint.json";


/**
 * ============================================================
 * SHARED STATE AUTHORITIES
 * ============================================================
 */

export const cryptoPaperLedger =
  createCryptoPaperAccountLedger({
    startingEquity,
  });


export const cryptoPaperRuntime =
  createCryptoPaperTradingRuntime();


export const cryptoPaperExchange =
  createPaperCryptoExchangeAdapter({
    defaultPrice:
      100,

    defaultFillRatio:
      1,
  });


/**
 * ============================================================
 * PERSISTENCE
 * ============================================================
 */

export const cryptoPaperStateStore =
  createCryptoPaperStateStore({
    filePath:
      checkpointPath,
  });


export const cryptoPaperCheckpointManager =
  createCryptoPaperCheckpointManager({
    stateStore:
      cryptoPaperStateStore,

    ledger:
      cryptoPaperLedger,

    statefulRuntime:
      cryptoPaperRuntime,

    exchangeAdapter:
      cryptoPaperExchange,
  });


export const cryptoPaperAutoCheckpointManager =
  createCryptoPaperAutoCheckpointManager({
    checkpointManager:
      cryptoPaperCheckpointManager,

    periodicIntervalMs:
      60_000,
  });


/**
 * ============================================================
 * RECOVERY
 * ============================================================
 */

export const cryptoPaperRecoveryRuntime =
  createCryptoPaperRecoveryRuntime({
    checkpointManager:
      cryptoPaperCheckpointManager,

    ledger:
      cryptoPaperLedger,

    statefulRuntime:
      cryptoPaperRuntime,

    exchangeAdapter:
      cryptoPaperExchange,

    maximumCheckpointAgeMs:
      24 * 60 * 60 * 1000,
  });


/**
 * ============================================================
 * SUPERVISOR
 * ============================================================
 */

export const cryptoTradingRuntimeSupervisor =
  createCryptoTradingRuntimeSupervisor({
    recoveryRuntime:
      cryptoPaperRecoveryRuntime,

    autoCheckpointManager:
      cryptoPaperAutoCheckpointManager,

    maximumMarketDataAgeMs:
      60_000,

    maximumRepeatedFailures:
      3,
  });


/**
 * ============================================================
 * FRONTEND API SERVICE
 * ============================================================
 */

export const cryptoRuntimeApiService =
  createCryptoRuntimeApiService({
    ledger:
      cryptoPaperLedger,

    statefulRuntime:
      cryptoPaperRuntime,

    exchangeAdapter:
      cryptoPaperExchange,

    supervisor:
      cryptoTradingRuntimeSupervisor,

    recoveryRuntime:
      cryptoPaperRecoveryRuntime,

    autoCheckpointManager:
      cryptoPaperAutoCheckpointManager,
  });


/**
 * ============================================================
 * CRYPTO SCANNER SERVICE
 * ============================================================
 *
 * Research-only orchestration.
 *
 * Real engine adapters will be wired into this object next.
 * Until then, the scanner service preserves unavailable
 * evidence explicitly and uses neutral fallback semantics.
 *
 * NO execution authority.
 * NO live execution.
 */

export const cryptoScannerService =
  createCryptoScannerService({
    engines: {
      /**
       * Real crypto research engines will be connected here:
       *
       * momentum
       * liquidity
       * onChain
       * narrative
       * news
       * risk
       *
       * Leaving an engine unconfigured is intentional and safe.
       * The scanner will return:
       *
       * status: "EVIDENCE_UNAVAILABLE"
       * score: 50
       * availability.available: false
       *
       * It will not fabricate evidence.
       */
    },
  });


/**
 * ============================================================
 * STARTUP
 * ============================================================
 *
 * Existing checkpoint:
 *   restore -> reconcile -> READY
 *
 * No checkpoint:
 *   initialize a clean fresh-start runtime -> READY
 *
 * A missing checkpoint is therefore not an error.
 */

export async function startCryptoRuntimeServices() {
  let recovery =
    null;

  try {
    const checkpointExists =
      typeof cryptoPaperStateStore
        .exists ===
      "function"
        ? await cryptoPaperStateStore
            .exists()
        : false;


    /**
     * --------------------------------------------------------
     * EXISTING SESSION
     * --------------------------------------------------------
     */

    if (checkpointExists) {
      recovery =
        await cryptoPaperRecoveryRuntime
          .recover();
    }


    /**
     * --------------------------------------------------------
     * FRESH START
     * --------------------------------------------------------
     *
     * Important:
     *
     * Do not leave recovery state at INITIAL.
     *
     * There is nothing to restore or reconcile on a genuinely
     * new paper account, so explicitly mark recovery READY.
     */

    else if (
      typeof cryptoPaperRecoveryRuntime
        .initializeFreshStart ===
      "function"
    ) {
      recovery =
        cryptoPaperRecoveryRuntime
          .initializeFreshStart();
    }


    /**
     * Defensive fallback.
     *
     * This should not normally be reached once the recovery
     * runtime exposes initializeFreshStart().
     */

    else {
      recovery = {
        approved:
          false,

        status:
          "FRESH_START_INITIALIZATION_UNAVAILABLE",

        blocker:
          "RECOVERY_RUNTIME_FRESH_START_METHOD_MISSING",

        executionAuthority:
          false,

        liveExecution:
          false,
      };
    }


    /**
     * Only begin normal checkpoint activity after startup
     * recovery/fresh initialization has completed.
     */

    cryptoPaperAutoCheckpointManager
      .startPeriodicCheckpointing();


    console.log(
      "[AEMA_CRYPTO_RUNTIME_READY]",
      {
        recovery:
          recovery?.status ??
          null,

        recoveryState:
          cryptoPaperRecoveryRuntime
            .getRecoveryState?.()
            ?.state ??
          null,

        recoveryReady:
          cryptoPaperRecoveryRuntime
            .getRecoveryState?.()
            ?.ready ===
          true,

        checkpointExists,

        checkpointPath,

        startingEquity,

        liveExecution:
          false,

        executionAuthority:
          false,
      },
    );


    return {
      ...recovery,

      checkpointExists,

      recovery:
        cryptoPaperRecoveryRuntime
          .getRecoveryState?.() ??
        null,

      executionAuthority:
        false,

      liveExecution:
        false,
    };
  } catch (error) {
    console.error(
      "[AEMA_CRYPTO_RUNTIME_START_FAILED]",
      error instanceof Error
        ? {
            name:
              error.name,

            message:
              error.message,

            stack:
              error.stack,
          }
        : error,
    );


    return {
      approved:
        false,

      status:
        "CRYPTO_RUNTIME_START_FAILED",

      blocker:
        error instanceof Error
          ? error.message
          : String(error),

      executionAuthority:
        false,

      liveExecution:
        false,
    };
  }
}


/**
 * ============================================================
 * SHUTDOWN
 * ============================================================
 */

export async function stopCryptoRuntimeServices() {
  try {
    const checkpoint =
      await cryptoPaperAutoCheckpointManager
        .checkpointBeforeShutdown({
          metadata: {
            source:
              "SERVER_SHUTDOWN",
          },
        });


    return {
      ...checkpoint,

      executionAuthority:
        false,

      liveExecution:
        false,
    };
  } catch (error) {
    console.error(
      "[AEMA_CRYPTO_RUNTIME_SHUTDOWN_FAILED]",
      error instanceof Error
        ? {
            name:
              error.name,

            message:
              error.message,

            stack:
              error.stack,
          }
        : error,
    );


    return {
      approved:
        false,

      status:
        "CRYPTO_RUNTIME_SHUTDOWN_FAILED",

      blocker:
        error instanceof Error
          ? error.message
          : String(error),

      executionAuthority:
        false,

      liveExecution:
        false,
    };
  }
}


/**
 * ============================================================
 * SHARED CONTAINER EXPORT
 * ============================================================
 */

export default {
  ledger:
    cryptoPaperLedger,

  runtime:
    cryptoPaperRuntime,

  exchange:
    cryptoPaperExchange,

  stateStore:
    cryptoPaperStateStore,

  checkpointManager:
    cryptoPaperCheckpointManager,

  autoCheckpointManager:
    cryptoPaperAutoCheckpointManager,

  recoveryRuntime:
    cryptoPaperRecoveryRuntime,

  supervisor:
    cryptoTradingRuntimeSupervisor,

  apiService:
    cryptoRuntimeApiService,

  scannerService:
    cryptoScannerService,


  start:
    startCryptoRuntimeServices,

  stop:
    stopCryptoRuntimeServices,

  paperExecution:
    true,

  executionAuthority:
    false,

  liveExecution:
    false,
};