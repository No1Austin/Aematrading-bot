/**
 * AEMA CRYPTO — PHASE 6.18 SHARED RUNTIME WIRING DIAGNOSTIC
 *
 * No market request.
 * No order construction.
 * No exchange submission.
 */

import runtimeContainer, {
  cryptoPaperLedger,
  cryptoPaperRuntime,
  cryptoTradingRuntimeSupervisor,
  scanCryptoMarketWithSharedRuntime,
} from "../src/crypto/runtime/cryptoRuntimeContainer.js";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

assert(
  runtimeContainer.ledger === cryptoPaperLedger,
  "Container ledger is not the shared ledger",
);

assert(
  runtimeContainer.runtime === cryptoPaperRuntime,
  "Container runtime is not the shared runtime",
);

assert(
  runtimeContainer.supervisor === cryptoTradingRuntimeSupervisor,
  "Container supervisor is not the shared supervisor",
);

assert(
  runtimeContainer.scanMarket === scanCryptoMarketWithSharedRuntime,
  "Container scanMarket is not the Phase 6.18 shared scanner entry point",
);

assert(
  runtimeContainer.liveExecution === false,
  "Live execution must remain disabled",
);

assert(
  runtimeContainer.executionAuthority === false,
  "Container must not expose general execution authority",
);

assert(
  runtimeContainer.paperExecution === true,
  "Paper execution mode must remain enabled",
);

console.log(
  JSON.stringify(
    {
      passed: true,
      phase: "6.18",
      sharedLedger: true,
      sharedRuntime: true,
      sharedSupervisor: true,
      canonicalScannerEntryPoint: true,
      paperExecution: true,
      executionAuthority: false,
      liveExecution: false,
      nextStage:
        "END_TO_END_SCANNER_AUTHORITY_DIAGNOSTIC",
    },
    null,
    2,
  ),
);
