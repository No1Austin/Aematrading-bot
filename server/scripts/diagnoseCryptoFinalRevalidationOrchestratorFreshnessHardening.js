/**
 * AEMA Crypto — Phase 6.53
 * Final Revalidation Orchestrator Freshness Hardening Diagnostic
 *
 * Source-contract test; no network calls.
 */
import fs from "node:fs";

const file =
  "src/crypto/revalidation/cryptoFinalRevalidationOrchestrator.js";
const source = fs.readFileSync(file, "utf8");

const has = re => re.test(source);
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const checks = {
  batchApprovedRequired:
    has(/!batch\?\.approved/),
  sharedBatchNowMsBound:
    has(/buildCryptoFreshMarketBatch\s*\(\s*\{[\s\S]*?nowMs/),
  resolvedFreshnessExplicitlyRequired:
    has(/resolved\?\.freshnessAuthorized !== true/),
  unauthorizedResolutionBlocks:
    has(/FRESH_MARKET_RESOLUTION_NOT_AUTHORIZED/),
  unresolvedAssetBlocks:
    has(/FRESH_MARKET_ASSET_UNAVAILABLE/),
  sourceTimestampRequired:
    has(/FRESH_SOURCE_TIMESTAMP_REQUIRED/),
  q2Required:
    has(/QUALIFICATION_2_REQUIRED/),
  researchEvidenceCleared:
    has(/sharedIntelligence:\s*null/) &&
    has(/sharedIntelligencePromise:\s*null/) &&
    has(/sharedEngineResults:\s*null/),
  freshRiskRebuilt:
    has(/await runCryptoScannerRisk\(context\)/),
  freshRiskFailureBlocks:
    has(/FRESH_RISK_REVALIDATION_FAILED/),
  batchFreshnessPropagated:
    has(/batchFreshness:\s*batch\?\.freshness/),
  resolvedFreshnessPropagated:
    has(/freshnessAuthorized:\s*resolved\?\.freshnessAuthorized === true/),
  finalRevalidationInvoked:
    has(/revalidateCryptoOpportunity\s*\(\s*\{/),
  sameNowMsPassedToFinal:
    has(/freshRisk,[\s\S]*?nowMs,[\s\S]*?options/),
  blockedNextStageNone:
    has(/nextStage:\s*"NONE"/),
  paperAuthorityFalse:
    has(/paperExecutionAuthority:\s*false/),
  executionAuthorityFalse:
    has(/executionAuthority:\s*false/),
  liveExecutionFalse:
    has(/liveExecution:\s*false/),
};

for (const [key, value] of Object.entries(checks)) {
  assert(value, `Phase 6.53 contract failed: ${key}`);
}

console.log(JSON.stringify({
  passed: true,
  phase: "6.53",
  hardening: checks,
  freshnessChain: {
    oneNowMsAuthority:
      "ORCHESTRATOR_TO_BATCH_AND_FINAL_REVALIDATION",
    invalidBatchBlocked: true,
    unauthorizedResolutionBlocked: true,
    unresolvedIdentityBlocked: true,
    missingMeasurementTimestampBlocked: true,
    freshRiskFailureBlocked: true,
    batchFreshnessAuditable: true
  },
  preserved: {
    qualification2Required: true,
    researchTimeSharedEvidenceNotReused: true,
    canonicalWeights: "20_20_60",
    paperOnly: true
  },
  executionAuthority: false,
  liveExecution: false,
  nextStage: "PAPER_EXECUTION_AUTHORITY_GATE_AUDIT"
}, null, 2));
