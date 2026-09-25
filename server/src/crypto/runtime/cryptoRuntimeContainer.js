/**
 * ============================================================
 * AEMA CRYPTO — SHARED RUNTIME CONTAINER
 * Phase 6.56
 * ============================================================
 *
 * One shared paper state graph plus canonical scan -> authorized
 * paper execution wiring. PAPER ONLY.
 */
import resolveCryptoScannerAsset
  from "../scanner/cryptoScannerAssetResolver.js";
import createCryptoPaperAccountLedger
  from "../trading/account/cryptoPaperAccountLedger.js";
import createCryptoPaperTradingRuntime
  from "../trading/runtime/cryptoPaperTradingRuntime.js";
import createPaperCryptoExchangeAdapter
  from "../trading/execution/paperCryptoExchangeAdapter.js";
import executeAuthorizedCryptoPaperCandidates
  from "../execution/cryptoAuthorizedPaperOrderExecutor.js";
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
import scanCryptoMarket
  from "../scanner/cryptoScanner.js";
import {
  runCryptoScannerMomentum,
  runCryptoScannerLiquidity,
  runCryptoScannerOnChain,
  runCryptoScannerNarrative,
  runCryptoScannerNews,
  runCryptoScannerRisk,
} from "../scanner/cryptoScannerEngineAdapters.js";

const envNumber = (name, fallback) => {
  const n = Number(process.env[name]);
  return Number.isFinite(n) ? n : fallback;
};

const startingEquity =
  Math.max(1, envNumber("AEMA_CRYPTO_PAPER_STARTING_EQUITY", 10_000));

const checkpointPath =
  process.env.AEMA_CRYPTO_CHECKPOINT_PATH ??
  "data/crypto-paper/runtime-checkpoint.json";

const maximumOrdersPerScan =
  Math.max(0, Math.trunc(envNumber("AEMA_CRYPTO_MAX_PAPER_ORDERS_PER_SCAN", 1)));

const maximumPositionNotionalPercent =
  Math.min(
    100,
    Math.max(
      0.01,
      envNumber("AEMA_CRYPTO_MAX_POSITION_NOTIONAL_PERCENT", 2),
    ),
  );

export const cryptoPaperLedger =
  createCryptoPaperAccountLedger({ startingEquity });

export const cryptoPaperRuntime =
  createCryptoPaperTradingRuntime();

export const cryptoPaperExchange =
  createPaperCryptoExchangeAdapter({
    defaultPrice: 100,
    defaultFillRatio: 1,
  });

export const cryptoPaperStateStore =
  createCryptoPaperStateStore({ filePath: checkpointPath });

export const cryptoPaperCheckpointManager =
  createCryptoPaperCheckpointManager({
    stateStore: cryptoPaperStateStore,
    ledger: cryptoPaperLedger,
    statefulRuntime: cryptoPaperRuntime,
    exchangeAdapter: cryptoPaperExchange,
  });

export const cryptoPaperAutoCheckpointManager =
  createCryptoPaperAutoCheckpointManager({
    checkpointManager: cryptoPaperCheckpointManager,
    periodicIntervalMs: 60_000,
  });

export const cryptoPaperRecoveryRuntime =
  createCryptoPaperRecoveryRuntime({
    checkpointManager: cryptoPaperCheckpointManager,
    ledger: cryptoPaperLedger,
    statefulRuntime: cryptoPaperRuntime,
    exchangeAdapter: cryptoPaperExchange,
    maximumCheckpointAgeMs: 24 * 60 * 60 * 1000,
  });

export const cryptoTradingRuntimeSupervisor =
  createCryptoTradingRuntimeSupervisor({
    recoveryRuntime: cryptoPaperRecoveryRuntime,
    autoCheckpointManager: cryptoPaperAutoCheckpointManager,
    maximumMarketDataAgeMs: 60_000,
    maximumRepeatedFailures: 3,
  });

export const cryptoRuntimeApiService =
  createCryptoRuntimeApiService({
    ledger: cryptoPaperLedger,
    statefulRuntime: cryptoPaperRuntime,
    exchangeAdapter: cryptoPaperExchange,
    supervisor: cryptoTradingRuntimeSupervisor,
    recoveryRuntime: cryptoPaperRecoveryRuntime,
    autoCheckpointManager: cryptoPaperAutoCheckpointManager,
  });

export const cryptoScannerService =
  createCryptoScannerService({
    resolveAsset: resolveCryptoScannerAsset,
    engines: {
      momentum: runCryptoScannerMomentum,
      liquidity: runCryptoScannerLiquidity,
      onChain: runCryptoScannerOnChain,
      narrative: runCryptoScannerNarrative,
      news: runCryptoScannerNews,
      risk: runCryptoScannerRisk,
    },
  });

/**
 * Canonical end-to-end PAPER entry point.
 *
 * `executePaperOrders` defaults true for this shared-runtime trading path.
 * Set false for research/API calls that must never mutate paper state.
 */
export async function scanCryptoMarketWithSharedRuntime(
  options = {},
) {
  const {
    executePaperOrders = true,
    paperExecutionOptions = {},
    ...scannerOptions
  } = options ?? {};

  const scan =
    await scanCryptoMarket({
      ...scannerOptions,
      paperLedger: cryptoPaperLedger,
      paperRuntime: cryptoPaperRuntime,
      runtimeSupervisor: cryptoTradingRuntimeSupervisor,
    });

  if (executePaperOrders !== true) {
    return {
      ...scan,
      paperExecution: {
        approved: true,
        status: "PAPER_EXECUTION_DISABLED_FOR_REQUEST",
        attempted: 0,
        executed: 0,
        results: [],
        executionAuthority: false,
        liveExecution: false,
      },
    };
  }

  const paperExecution =
    await executeAuthorizedCryptoPaperCandidates({
      candidates: scan?.paperAuthorizedCandidates ?? [],
      ledger: cryptoPaperLedger,
      runtime: cryptoPaperRuntime,
      exchange: cryptoPaperExchange,
      maximumOrdersPerScan:
        paperExecutionOptions?.maximumOrdersPerScan ??
        maximumOrdersPerScan,
      maximumPositionNotionalPercent:
        paperExecutionOptions?.maximumPositionNotionalPercent ??
        maximumPositionNotionalPercent,
    });

  return {
    ...scan,
    orchestration:
      "DISCOVERY_Q1_RANKING_DEEP_RESEARCH_Q2_FINAL_REVALIDATION_PAPER_AUTHORITY_PAPER_EXECUTION",
    paperExecution,
    paperExecutionCompleted: true,
    executionAuthority: false,
    liveExecution: false,
  };
}

export async function startCryptoRuntimeServices() {
  let recovery = null;

  try {
    const checkpointExists =
      typeof cryptoPaperStateStore.exists === "function"
        ? await cryptoPaperStateStore.exists()
        : false;

    if (checkpointExists) {
      recovery = await cryptoPaperRecoveryRuntime.recover();
    } else if (
      typeof cryptoPaperRecoveryRuntime.initializeFreshStart === "function"
    ) {
      recovery = cryptoPaperRecoveryRuntime.initializeFreshStart();
    } else {
      recovery = {
        approved: false,
        status: "FRESH_START_INITIALIZATION_UNAVAILABLE",
        blocker: "RECOVERY_RUNTIME_FRESH_START_METHOD_MISSING",
        executionAuthority: false,
        liveExecution: false,
      };
    }

    cryptoPaperAutoCheckpointManager.startPeriodicCheckpointing();

    console.log("[AEMA_CRYPTO_RUNTIME_READY]", {
      recovery: recovery?.status ?? null,
      recoveryState:
        cryptoPaperRecoveryRuntime.getRecoveryState?.()?.state ?? null,
      recoveryReady:
        cryptoPaperRecoveryRuntime.getRecoveryState?.()?.ready === true,
      checkpointExists,
      checkpointPath,
      startingEquity,
      maximumOrdersPerScan,
      maximumPositionNotionalPercent,
      liveExecution: false,
      executionAuthority: false,
    });

    return {
      ...recovery,
      checkpointExists,
      recovery: cryptoPaperRecoveryRuntime.getRecoveryState?.() ?? null,
      executionAuthority: false,
      liveExecution: false,
    };
  } catch (error) {
    console.error(
      "[AEMA_CRYPTO_RUNTIME_START_FAILED]",
      error instanceof Error
        ? { name: error.name, message: error.message, stack: error.stack }
        : error,
    );

    return {
      approved: false,
      status: "CRYPTO_RUNTIME_START_FAILED",
      blocker: error instanceof Error ? error.message : String(error),
      executionAuthority: false,
      liveExecution: false,
    };
  }
}

export async function stopCryptoRuntimeServices() {
  try {
    const checkpoint =
      await cryptoPaperAutoCheckpointManager.checkpointBeforeShutdown({
        metadata: { source: "SERVER_SHUTDOWN" },
      });

    return {
      ...checkpoint,
      executionAuthority: false,
      liveExecution: false,
    };
  } catch (error) {
    console.error(
      "[AEMA_CRYPTO_RUNTIME_SHUTDOWN_FAILED]",
      error instanceof Error
        ? { name: error.name, message: error.message, stack: error.stack }
        : error,
    );

    return {
      approved: false,
      status: "CRYPTO_RUNTIME_SHUTDOWN_FAILED",
      blocker: error instanceof Error ? error.message : String(error),
      executionAuthority: false,
      liveExecution: false,
    };
  }
}

export default {
  ledger: cryptoPaperLedger,
  runtime: cryptoPaperRuntime,
  exchange: cryptoPaperExchange,
  stateStore: cryptoPaperStateStore,
  checkpointManager: cryptoPaperCheckpointManager,
  autoCheckpointManager: cryptoPaperAutoCheckpointManager,
  recoveryRuntime: cryptoPaperRecoveryRuntime,
  supervisor: cryptoTradingRuntimeSupervisor,
  apiService: cryptoRuntimeApiService,
  scannerService: cryptoScannerService,
  scanMarket: scanCryptoMarketWithSharedRuntime,
  start: startCryptoRuntimeServices,
  stop: stopCryptoRuntimeServices,
  paperExecution: true,
  executionAuthority: false,
  liveExecution: false,
};
