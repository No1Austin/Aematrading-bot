/**
 * AEMA Crypto — Phase 6.54
 * Paper Execution Authority Gate Audit
 *
 * Diagnostic only. No production changes.
 */
import fs from "node:fs";

const file =
  "src/crypto/execution/cryptoPaperExecutionAuthorityGate.js";
const source = fs.readFileSync(file, "utf8");
const has = re => re.test(source);

const audit = {
  cexOnly:
    has(/candidateType !== CRYPTO_CANDIDATE_TYPE\.CEX/),
  q2Required:
    has(/candidate\?\.qualification2\?\.qualified !== true/),
  finalRevalidationRequired:
    has(/candidate\?\.finalRevalidation\?\.approved !== true/),
  directionalDecisionRequired:
    has(/decision !== "LONG" && decision !== "SHORT"/),
  paperLedgerRequired:
    has(/PAPER_LEDGER_UNAVAILABLE/),
  paperRuntimeRequired:
    has(/runtime\.paperOnly !== true/) &&
    has(/runtime\.liveExecutionEnabled === true/),
  supervisorRequired:
    has(/RUNTIME_SUPERVISOR_UNAVAILABLE/) &&
    has(/supervisor\.liveExecutionEnabled === true/),
  accountEquityGate:
    has(/ACCOUNT_EQUITY_UNAVAILABLE_OR_NONPOSITIVE/),
  drawdownGate:
    has(/ACCOUNT_DRAWDOWN_LIMIT_EXCEEDED/),
  openPositionLimit:
    has(/MAXIMUM_OPEN_POSITIONS_REACHED/),
  directFlipBlocked:
    has(/DIRECT_POSITION_FLIP_BLOCKED/),
  exitPendingBlocked:
    has(/EXIT_PENDING_CANNOT_INCREASE_RISK/),
  activeOrderBlocked:
    has(/ACTIVE_ORDER_ALREADY_EXISTS/),
  sourceTimestampRequired:
    has(/freshRevalidationEvidence[\s\S]*?measurements[\s\S]*?measuredAt/) &&
    has(/REVALIDATION_TIMESTAMP_REQUIRED/),
  staleRevalidationRejected:
    has(/REVALIDATION_EXPIRED/),
  supervisorIndependentGate:
    has(/supervisor\.evaluateAction\s*\(/),
  paperOnlyGrant:
    has(/nextStage:\s*"PAPER_ORDER_CONSTRUCTION"/) &&
    has(/paperExecutionAuthority:\s*true/),
  neverLiveAuthority:
    has(/executionAuthority:\s*false/) &&
    has(/liveExecution:\s*false/),

  // Phase 6.49 established a bounded future-clock-skew contract.
  // This gate must not silently turn a future timestamp into age 0.
  clampsFutureTimestampToZero:
    has(/Math\.max\(\s*0\s*,\s*nowMs\s*-\s*measuredMs\s*\)/),
  explicitlyRejectsFutureTimestamp:
    has(/TIMESTAMP_IN_FUTURE|REVALIDATION_TIMESTAMP_IN_FUTURE|futureSkewMs|maxFutureClockSkewMs/),

  explicitlyRequiresFinalNextStage:
    has(/finalRevalidation\?\.nextStage[\s\S]*?PAPER|PAPER_EXECUTION_AUTHORITY/),
  explicitlyRequiresFreshnessAuthorized:
    has(/freshnessAuthorized\s*!==\s*true|freshnessAuthorized\s*===\s*true/),
  explicitlyRejectsResearchOnly:
    has(/researchOnly\s*===\s*true|researchOnly\s*!==\s*false/),
};

const findings=[];

if (
  audit.clampsFutureTimestampToZero &&
  !audit.explicitlyRejectsFutureTimestamp
) {
  findings.push("FUTURE_REVALIDATION_TIMESTAMP_CAN_BE_CLAMPED_TO_AGE_ZERO");
}

if (!audit.explicitlyRequiresFreshnessAuthorized) {
  findings.push("FRESHNESS_AUTHORIZATION_NOT_RECHECKED_AT_PAPER_GATE");
}

if (!audit.explicitlyRequiresFinalNextStage) {
  findings.push("FINAL_REVALIDATION_NEXT_STAGE_NOT_EXPLICITLY_REQUIRED");
}

const critical =
  findings.includes(
    "FUTURE_REVALIDATION_TIMESTAMP_CAN_BE_CLAMPED_TO_AGE_ZERO",
  );

console.log(JSON.stringify({
  passed: true,
  phase: "6.54",
  audit,
  effectiveSafety: {
    cexOnly: audit.cexOnly,
    q2AndFinalRevalidationRequired:
      audit.q2Required && audit.finalRevalidationRequired,
    longShortOnly: audit.directionalDecisionRequired,
    runtimeMustBePaperOnly: audit.paperRuntimeRequired,
    accountAndRuntimeRiskGates:
      audit.accountEquityGate &&
      audit.drawdownGate &&
      audit.openPositionLimit &&
      audit.directFlipBlocked &&
      audit.exitPendingBlocked &&
      audit.activeOrderBlocked,
    supervisorIsFinalRuntimeHealthAuthority:
      audit.supervisorIndependentGate,
    liveExecutionCannotBeGranted:
      audit.neverLiveAuthority
  },
  finding: {
    productionFixRequired: findings.length > 0,
    criticalFreshnessDefectFound: critical,
    findings,
    explanation:
      critical
        ? "THE PAPER GATE REINTRODUCES THE SAME FUTURE-TIMESTAMP CLAMP DEFECT FIXED IN FINAL REVALIDATION 6.49. A FUTURE measuredAt BECOMES ageMs=0 UNLESS THIS GATE APPLIES THE SAME BOUNDED CLOCK-SKEW POLICY."
        : "NO CRITICAL FUTURE-TIMESTAMP DEFECT DETECTED."
  },
  executionAuthority: false,
  liveExecution: false,
  nextStage: critical
    ? "PAPER_EXECUTION_GATE_FUTURE_TIMESTAMP_FIX"
    : findings.length
      ? "PAPER_EXECUTION_GATE_CONTRACT_HARDENING"
      : "PAPER_ORDER_CONSTRUCTION_AUDIT"
}, null, 2));
