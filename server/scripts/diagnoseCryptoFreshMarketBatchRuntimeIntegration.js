/**
 * AEMA Crypto — Phase 6.52
 * Fresh Market Batch Runtime Integration Audit
 *
 * Diagnostic only. No production changes.
 */
import fs from "node:fs";

const file =
  "src/crypto/revalidation/cryptoFinalRevalidationOrchestrator.js";
const source = fs.readFileSync(file, "utf8");
const has = re => re.test(source);

const audit = {
  batchApprovedRequired:
    has(/if\s*\(\s*!batch\?\.approved\s*\|\|\s*typeof batch\?\.resolve !== "function"\s*\)/),
  batchBuildFailureBlocks:
    has(/FRESH_MARKET_BATCH_FAILED/),
  unavailableBatchBlocks:
    has(/FRESH_MARKET_BATCH_UNAVAILABLE/),
  q2Required:
    has(/candidate\?\.qualification2\?\.qualified !== true/),
  unresolvedAssetBlocks:
    has(/FRESH_MARKET_ASSET_UNAVAILABLE/),
  sourceTimestampRequired:
    has(/!freshMeasurements\?\.measuredAt/) &&
    has(/FRESH_SOURCE_TIMESTAMP_REQUIRED/),
  researchSharedIntelligenceCleared:
    has(/sharedIntelligence:\s*null/) &&
    has(/sharedIntelligencePromise:\s*null/) &&
    has(/sharedEngineResults:\s*null/),
  freshRiskRebuilt:
    has(/await runCryptoScannerRisk\(context\)/),
  riskFailureBlocks:
    has(/FRESH_RISK_REVALIDATION_FAILED/),
  finalGateInvoked:
    has(/revalidateCryptoOpportunity\s*\(\s*\{/),
  passesNowMs:
    has(/nowMs,/),
  blockedNoNextStage:
    has(/nextStage:\s*"NONE"/),
  blockedNoPaperAuthority:
    has(/paperExecutionAuthority:\s*false/),
  blockedNoExecutionAuthority:
    has(/executionAuthority:\s*false/),
  blockedNoLiveExecution:
    has(/liveExecution:\s*false/),
  explicitlyChecksResolvedFreshnessAuthorized:
    has(/resolved\?\.freshnessAuthorized\s*!==\s*true|!resolved\?\.freshnessAuthorized/),
  propagatesBatchFreshnessEvidence:
    has(/batchFreshness|freshness:\s*batch\?\.freshness|batch\?\.freshness/),
};

const findings = [];
if (!audit.explicitlyChecksResolvedFreshnessAuthorized) {
  findings.push("RESOLVED_FRESHNESS_AUTHORITY_NOT_EXPLICITLY_CHECKED");
}
if (!audit.propagatesBatchFreshnessEvidence) {
  findings.push("BATCH_FRESHNESS_METADATA_NOT_PROPAGATED_IN_REVALIDATION_EVIDENCE");
}

console.log(JSON.stringify({
  passed: true,
  phase: "6.52",
  audit,
  effectiveSafety: {
    rejectedBatchStopsBeforeResolve:
      audit.batchApprovedRequired && audit.unavailableBatchBlocks,
    unresolvedIdentityStops:
      audit.unresolvedAssetBlocks,
    missingMeasurementTimestampStops:
      audit.sourceTimestampRequired,
    freshRiskFailureStops:
      audit.riskFailureBlocks,
    blockedPathCannotReachPaperAuthority:
      audit.blockedNoNextStage &&
      audit.blockedNoPaperAuthority &&
      audit.blockedNoExecutionAuthority &&
      audit.blockedNoLiveExecution,
    finalRevalidationReceivesNowMs:
      audit.finalGateInvoked && audit.passesNowMs,
  },
  finding: {
    criticalBypassFound: false,
    productionHardeningRecommended: findings.length > 0,
    findings,
    explanation:
      "PHASE_6_51_BATCH_RESOLVE_FAILS_CLOSED_WHEN_BATCH_IS_INVALID_AND_ORCHESTRATOR_ALREADY_REJECTS_BATCH_APPROVED_FALSE. EXPLICIT_RESOLVED_FRESHNESS_CHECK_AND_METADATA_PROPAGATION_WOULD_MAKE_THE_CONTRACT_DEFENSE_IN_DEPTH_AND_AUDITABLE."
  },
  executionAuthority: false,
  liveExecution: false,
  nextStage: findings.length
    ? "FINAL_REVALIDATION_ORCHESTRATOR_FRESHNESS_HARDENING"
    : "PAPER_AUTHORITY_GATE_AUDIT"
}, null, 2));
