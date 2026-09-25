/**
 * AEMA CRYPTO — PAPER EXECUTION AUTHORITY GATE
 * Phase 6.54
 *
 * Final permission boundary before paper-order construction.
 * PAPER ONLY. No order construction/submission and no live authority.
 */
import {
  classifyCryptoCandidate,
  CRYPTO_CANDIDATE_TYPE,
} from "../policy/cryptoCandidateActionPolicy.js";

const DEFAULT_MAX_FUTURE_CLOCK_SKEW_MS = 5_000;

function finite(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function upper(value) {
  return String(value ?? "").trim().toUpperCase();
}

function isoMs(value) {
  const ms = Date.parse(value ?? "");
  return Number.isFinite(ms) ? ms : null;
}

function block(reason, context = {}, detail = null) {
  return {
    approved: false,
    status: "PAPER_EXECUTION_AUTHORITY_BLOCKED",
    reason,
    detail,
    action: context.action ?? "OPEN_POSITION",
    decision: context.decision ?? "NO_TRADE",
    symbol: context.symbol ?? null,
    candidateType: context.candidateType ?? "UNKNOWN",
    account: context.account ?? null,
    runtime: context.runtime ?? null,
    supervisor: context.supervisor ?? null,
    nextStage: "NONE",
    paperExecutionAuthority: false,
    executionAuthority: false,
    liveExecution: false,
  };
}

export function evaluateCryptoPaperExecutionAuthority({
  candidate,
  ledger,
  runtime,
  supervisor,
  nowMs = Date.now(),
  maximumRevalidationAgeMs = 120_000,
  maximumFutureClockSkewMs = DEFAULT_MAX_FUTURE_CLOCK_SKEW_MS,
  maximumDrawdownPercent = 25,
  maximumOpenPositions = 10,
} = {}) {
  const symbol = upper(
    candidate?.symbol ??
    candidate?.asset?.symbol ??
    candidate?.freshRevalidationEvidence?.measurements?.symbol,
  );

  // Final revalidation is authoritative. Never fall back to Q2 here.
  const decision = upper(candidate?.finalRevalidation?.decision);

  const candidateType = classifyCryptoCandidate(candidate);
  const context = { symbol, decision, candidateType };

  if (candidateType !== CRYPTO_CANDIDATE_TYPE.CEX) {
    return block("CEX_EXECUTION_REQUIRED", context);
  }

  if (candidate?.researchOnly === true && candidateType !== CRYPTO_CANDIDATE_TYPE.CEX) {
    return block("RESEARCH_ONLY_CANDIDATE_BLOCKED", context);
  }

  if (candidate?.qualification2?.qualified !== true) {
    return block("QUALIFICATION_2_REQUIRED", context);
  }

  if (
    candidate?.finalRevalidation?.approved !== true ||
    upper(candidate?.finalRevalidation?.status) !== "REVALIDATED"
  ) {
    return block("FINAL_REVALIDATION_REQUIRED", context);
  }

  if (
    upper(candidate?.finalRevalidation?.nextStage) !==
    "PAPER_EXECUTION_AUTHORITY_GATE"
  ) {
    return block("FINAL_REVALIDATION_PROGRESSION_REQUIRED", context);
  }

  if (
    candidate?.freshRevalidationEvidence?.freshnessAuthorized !== true ||
    candidate?.freshRevalidationEvidence?.batchFreshness?.authorized !== true
  ) {
    return block("FRESH_REVALIDATION_AUTHORITY_REQUIRED", context);
  }

  if (decision !== "LONG" && decision !== "SHORT") {
    return block("DIRECTIONAL_DECISION_REQUIRED", context);
  }

  if (!symbol) {
    return block("SYMBOL_REQUIRED", context);
  }

  if (
    !ledger ||
    typeof ledger.getSnapshot !== "function" ||
    typeof ledger.getOpenPositions !== "function" ||
    typeof ledger.getPosition !== "function"
  ) {
    return block("PAPER_LEDGER_UNAVAILABLE", context);
  }

  if (
    !runtime ||
    typeof runtime.getSymbolState !== "function" ||
    runtime.paperOnly !== true ||
    runtime.liveExecutionEnabled === true
  ) {
    return block("PAPER_RUNTIME_UNAVAILABLE", context);
  }

  if (
    !supervisor ||
    typeof supervisor.evaluateAction !== "function" ||
    supervisor.liveExecutionEnabled === true
  ) {
    return block("RUNTIME_SUPERVISOR_UNAVAILABLE", context);
  }

  const account = ledger.getSnapshot();
  const openPositions = ledger.getOpenPositions();
  const position = ledger.getPosition(symbol);
  const runtimeState = runtime.getSymbolState(symbol);

  context.account = {
    equity: finite(account?.equity),
    drawdownPercent: finite(account?.drawdownPercent),
    openPositionCount: Array.isArray(openPositions) ? openPositions.length : null,
  };

  context.runtime = {
    currentDirection: upper(runtimeState?.position?.direction || "FLAT"),
    quantity: finite(runtimeState?.position?.quantity),
    exposure: finite(runtimeState?.position?.exposure),
    exitPending: runtimeState?.position?.exitPending === true,
    activeOrderStatus: upper(runtimeState?.activeOrder?.status) || null,
  };

  const equity = finite(account?.equity);
  if (equity === null || equity <= 0) {
    return block("ACCOUNT_EQUITY_UNAVAILABLE_OR_NONPOSITIVE", context);
  }

  const drawdown = finite(account?.drawdownPercent);
  if (drawdown !== null && drawdown > maximumDrawdownPercent) {
    return block("ACCOUNT_DRAWDOWN_LIMIT_EXCEEDED", context);
  }

  if (
    Array.isArray(openPositions) &&
    openPositions.length >= maximumOpenPositions &&
    !(position && finite(position?.quantity) > 0)
  ) {
    return block("MAXIMUM_OPEN_POSITIONS_REACHED", context);
  }

  const currentDirection = upper(runtimeState?.position?.direction || "FLAT");
  if (currentDirection !== "FLAT" && currentDirection !== decision) {
    return block("DIRECT_POSITION_FLIP_BLOCKED", context);
  }

  if (runtimeState?.position?.exitPending === true) {
    return block("EXIT_PENDING_CANNOT_INCREASE_RISK", context);
  }

  const activeStatus = upper(runtimeState?.activeOrder?.status);
  if (["CREATED", "SUBMITTED", "ACKNOWLEDGED", "PARTIALLY_FILLED"].includes(activeStatus)) {
    return block("ACTIVE_ORDER_ALREADY_EXISTS", context);
  }

  const measuredAt =
    candidate?.freshRevalidationEvidence?.measurements?.measuredAt ?? null;
  const measuredMs = isoMs(measuredAt);

  if (measuredMs === null) {
    return block("REVALIDATION_TIMESTAMP_REQUIRED", context);
  }

  const signedAgeMs = nowMs - measuredMs;
  const futureSkewMs = signedAgeMs < 0 ? Math.abs(signedAgeMs) : 0;
  const ageMs = Math.max(0, signedAgeMs);

  if (futureSkewMs > maximumFutureClockSkewMs) {
    return block(
      "REVALIDATION_TIMESTAMP_IN_FUTURE",
      context,
      { futureSkewMs, maximumFutureClockSkewMs },
    );
  }

  if (ageMs > maximumRevalidationAgeMs) {
    return block(
      "REVALIDATION_EXPIRED",
      context,
      { ageMs, maximumRevalidationAgeMs },
    );
  }

  const action =
    currentDirection === decision && finite(runtimeState?.position?.quantity) > 0
      ? "ADD_EXPOSURE"
      : "OPEN_POSITION";

  context.action = action;

  const supervisorDecision = supervisor.evaluateAction({
    action,
    marketDataFresh: true,
    marketDataAgeMs: ageMs,
  });

  context.supervisor = {
    approved: supervisorDecision?.approved === true,
    status: supervisorDecision?.status ?? null,
    supervisorState: supervisorDecision?.supervisorState ?? null,
    blocker: supervisorDecision?.blocker ?? null,
    reason: supervisorDecision?.reason ?? null,
  };

  if (supervisorDecision?.approved !== true) {
    return block(
      supervisorDecision?.blocker || "RUNTIME_SUPERVISOR_BLOCKED",
      context,
    );
  }

  return {
    approved: true,
    status: "PAPER_EXECUTION_AUTHORITY_GRANTED",
    reason: "ALL_PAPER_EXECUTION_GATES_PASSED",
    symbol,
    decision,
    action,
    candidateType,
    measuredAt,
    revalidationAgeMs: ageMs,
    signedRevalidationAgeMs: signedAgeMs,
    futureSkewMs,
    maximumFutureClockSkewMs,
    account: context.account,
    runtime: context.runtime,
    supervisor: context.supervisor,
    nextStage: "PAPER_ORDER_CONSTRUCTION",
    paperExecutionAuthority: true,
    executionAuthority: false,
    liveExecution: false,
  };
}

export function evaluateCryptoPaperExecutionAuthorities({
  candidates = [],
  ledger,
  runtime,
  supervisor,
  ...options
} = {}) {
  return (Array.isArray(candidates) ? candidates : []).map(candidate => ({
    candidate,
    paperExecutionGate: evaluateCryptoPaperExecutionAuthority({
      candidate,
      ledger,
      runtime,
      supervisor,
      ...options,
    }),
  }));
}

export default evaluateCryptoPaperExecutionAuthority;
