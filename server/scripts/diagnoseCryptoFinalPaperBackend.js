/**
 * AEMA CRYPTO — Phase 6.57 Final Paper Backend Contract Diagnostic
 *
 * Diagnostic correction:
 * The previous diagnostic compared the first occurrence of the text
 * "exchange.submitOrder", which appears in the capability/type guard
 * before the real submission call. That created two false negatives.
 *
 * This version compares the actual call sites.
 */
import fs from "node:fs";

const read = path => fs.readFileSync(path, "utf8");

const gate =
  read("src/crypto/execution/cryptoPaperExecutionAuthorityGate.js");

const executor =
  read("src/crypto/execution/cryptoAuthorizedPaperOrderExecutor.js");

const container =
  read("src/crypto/runtime/cryptoRuntimeContainer.js");

const exchange =
  read("src/crypto/trading/execution/paperCryptoExchangeAdapter.js");

const scanner =
  read("src/crypto/scanner/cryptoScanner.js");

const beginCycleCall =
  executor.indexOf("runtime.beginCycle({");

const registerOrderCall =
  executor.indexOf("runtime.registerOrder({");

const submitOrderCall =
  executor.indexOf("await exchange.submitOrder({");

const checks = {
  futureTimestampRejectedAtFinalPaperGate:
    /REVALIDATION_TIMESTAMP_IN_FUTURE/.test(gate) &&
    /maximumFutureClockSkewMs/.test(gate),

  finalRevalidationProgressionRequired:
    /FINAL_REVALIDATION_PROGRESSION_REQUIRED/.test(gate),

  explicitFreshnessAuthorityRequired:
    /FRESH_REVALIDATION_AUTHORITY_REQUIRED/.test(gate),

  finalDecisionIsAuthoritative:
    /candidate\?\.finalRevalidation\?\.decision/.test(gate) &&
    !/finalRevalidation\?\.decision\s*\?\?[\s\S]*qualification2/.test(gate),

  cexOnly:
    /CEX_EXECUTION_REQUIRED/.test(gate),

  paperRuntimeOnly:
    /runtime\.paperOnly !== true/.test(gate),

  noLiveAuthorityInGate:
    /executionAuthority:\s*false/.test(gate) &&
    /liveExecution:\s*false/.test(gate),

  executorRequiresAuthority:
    /PAPER_EXECUTION_AUTHORITY_REQUIRED/.test(executor),

  executorRequiresFreshness:
    /FRESHNESS_AUTHORITY_REQUIRED/.test(executor),

  executorUsesFreshPrice:
    /freshRevalidationEvidence\?\.measurements\?\.priceUsd/.test(executor),

  executorCapsTotalSymbolNotional:
    /POSITION_NOTIONAL_LIMIT_REACHED/.test(executor) &&
    /existingNotionalUsd/.test(executor),

  executorDefaultOneOrderPerScan:
    /maximumOrdersPerScan = 1/.test(executor),

  exchangeMustBePaper:
    /exchange\.paperExecution !== true/.test(executor) &&
    /exchange\.liveExecution === true/.test(executor),

  runtimeCycleBeforeSubmit:
    beginCycleCall >= 0 &&
    submitOrderCall >= 0 &&
    beginCycleCall < submitOrderCall,

  runtimeOrderRegisteredBeforeSubmit:
    registerOrderCall >= 0 &&
    submitOrderCall >= 0 &&
    registerOrderCall < submitOrderCall,

  actualExchangeFillsOnlyToLedger:
    /newFillsSince/.test(executor) &&
    /ledger\.applyFill/.test(executor),

  exchangeTruthAdopted:
    /runtime\.adoptExchangePosition/.test(executor),

  deterministicClientOrderId:
    /buildClientOrderId/.test(executor),

  adapterPaperOnly:
    /paperExecution:\s*true/.test(exchange) &&
    /liveExecution:\s*false/.test(exchange),

  scannerAlreadyProducesAuthorizedCandidates:
    /paperAuthorizedCandidates/.test(scanner),

  sharedContainerInjectsSingleAuthorities:
    /paperLedger:\s*cryptoPaperLedger/.test(container) &&
    /paperRuntime:\s*cryptoPaperRuntime/.test(container) &&
    /runtimeSupervisor:\s*cryptoTradingRuntimeSupervisor/.test(container),

  sharedContainerExecutesOnlyAuthorizedCandidates:
    /candidates:\s*scan\?\.paperAuthorizedCandidates/.test(container),

  requestCanDisablePaperMutation:
    /executePaperOrders = true/.test(container) &&
    /PAPER_EXECUTION_DISABLED_FOR_REQUEST/.test(container),

  noLiveAuthorityInFinalContainer:
    /liveExecution:\s*false/.test(container),
};

const failed =
  Object.entries(checks)
    .filter(([, ok]) => !ok)
    .map(([name]) => name);

console.log(JSON.stringify({
  passed:
    failed.length === 0,

  phase:
    "6.57",

  diagnosticCorrection:
    "REAL_SUBMIT_CALL_SITE_USED_IN_ORDERING_CHECK",

  callOrdering: {
    beginCycleCallFound:
      beginCycleCall >= 0,

    registerOrderCallFound:
      registerOrderCall >= 0,

    submitOrderCallFound:
      submitOrderCall >= 0,

    beginCycleBeforeSubmit:
      beginCycleCall >= 0 &&
      submitOrderCall >= 0 &&
      beginCycleCall < submitOrderCall,

    registerOrderBeforeSubmit:
      registerOrderCall >= 0 &&
      submitOrderCall >= 0 &&
      registerOrderCall < submitOrderCall,
  },

  checks,
  failed,

  architecture:
    "DISCOVERY_Q1_RANKING_DEEP_RESEARCH_Q2_FINAL_REVALIDATION_PAPER_AUTHORITY_SIZING_ORDER_PAPER_EXCHANGE_FILL_LEDGER_RUNTIME",

  canonicalResearchWeights:
    "20_20_60_UNCHANGED",

  paperOnly:
    true,

  executionAuthority:
    false,

  liveExecution:
    false,

  nextStage:
    failed.length === 0
      ? "FRONTEND"
      : "FIX_FAILED_BACKEND_CONTRACTS",
}, null, 2));

if (failed.length > 0) {
  process.exitCode = 1;
}
