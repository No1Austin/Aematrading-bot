// server/src/execution/manualEntryOverrideCoordinator.js

import evaluateRiskApproval from "../risk/tradeRiskAdapter.js";

import {
  executeApprovedPaperTrade,
} from "./paperExecutionCoordinator.js";

export const MANUAL_OVERRIDE_STATUS = Object.freeze({
  APPROVED: "APPROVED",
  EXECUTED: "EXECUTED",
  BLOCKED: "BLOCKED",
  INVALID: "INVALID",
  ERROR: "ERROR",
});

export const DEFAULT_MANUAL_OVERRIDE_CONFIG = Object.freeze({
  /**
   * Score-authority split:
   *
   * 0 <= score < autonomous threshold
   *   -> HUMAN may explicitly authorize a one-time entry.
   *
   * score >= autonomous threshold
   *   -> normal autonomous execution path.
   *
   * The score itself therefore never blocks a manual override
   * merely because it is "too low". Mechanical safety/risk
   * protections remain separate and continue to apply.
   */
  minimumOverrideScore: 0,
  requireCompletedAnalysis: true,
  requireRequiredEngines: true,
});

function nowIso() {
  return new Date().toISOString();
}

function normalizeSymbol(value) {
  return String(value ?? "").trim().toUpperCase();
}

function normalizeSide(value) {
  const side = String(value ?? "").trim().toUpperCase();
  return side === "LONG" || side === "SHORT" ? side : null;
}

function isFiniteNumber(value) {
  return value !== null &&
    value !== undefined &&
    value !== "" &&
    Number.isFinite(Number(value));
}

function blocked({
  symbol = null,
  score = null,
  reasons = [],
  status = MANUAL_OVERRIDE_STATUS.BLOCKED,
} = {}) {
  return {
    approved: false,
    engine: "MANUAL_ENTRY_OVERRIDE",
    status,
    symbol,
    score,
    entryAuthorized: false,
    executed: false,
    position: null,
    riskApproval: null,
    reasons,
    warnings: [],
    errors: [],
    timestamp: nowIso(),
  };
}

export function evaluateManualEntryOverride({
  analysis,
  account = null,
  configOverrides = {},
} = {}) {
  try {
    const config = {
      ...DEFAULT_MANUAL_OVERRIDE_CONFIG,
      ...configOverrides,
    };

    if (!analysis || typeof analysis !== "object") {
      return blocked({
        status: MANUAL_OVERRIDE_STATUS.INVALID,
        reasons: [
          "A completed trading analysis is required before a manual override can be considered.",
        ],
      });
    }

    const scoring = analysis?.results?.scoring ?? null;

    const symbol = normalizeSymbol(
      analysis?.symbol ??
      analysis?.finalDecision?.symbol ??
      scoring?.symbol,
    );

    const score = isFiniteNumber(scoring?.preferredScore)
      ? Number(scoring.preferredScore)
      : isFiniteNumber(analysis?.finalDecision?.preferredScore)
        ? Number(analysis.finalDecision.preferredScore)
        : null;

    const side = normalizeSide(
      scoring?.preferredSide ??
      analysis?.finalDecision?.preferredSide,
    );

    const autonomousThreshold =
      isFiniteNumber(scoring?.minimumRequiredScore)
        ? Number(scoring.minimumRequiredScore)
        : 80;

    const reasons = [];

    if (
      config.requireCompletedAnalysis &&
      analysis?.approved !== true
    ) {
      reasons.push(
        "Trading analysis did not complete successfully.",
      );
    }

    if (!symbol) {
      reasons.push("A valid trade symbol is required.");
    }

    if (!side) {
      reasons.push(
        "The analysis did not produce a valid LONG or SHORT preferred side.",
      );
    }

    if (score === null) {
      reasons.push(
        "The analysis did not produce a valid preferred score.",
      );
    }

    if (
      score !== null &&
      score >= autonomousThreshold
    ) {
      reasons.push(
        "Candidate already meets the autonomous score threshold; use the normal execution path instead.",
      );
    }

    /**
     * Manual score authority covers the full below-threshold band.
     *
     * With the normal 80-point autonomous threshold:
     *
     *   0–79.999...  -> HUMAN OVERRIDE ELIGIBLE
     *   80–100       -> AUTONOMOUS PATH
     *
     * We still reject malformed scores outside the logical
     * scoring range because those indicate bad analysis data,
     * not a legitimate low-conviction trade.
     */
    if (
      score !== null &&
      (
        score < 0 ||
        score > 100
      )
    ) {
      reasons.push(
        "Trade score must be between 0 and 100.",
      );
    }

    const events = analysis?.results?.events ?? null;

    if (
      scoring?.eventFreeze === true ||
      events?.eventFreeze?.active === true
    ) {
      reasons.push(
        "Event freeze is active and cannot be manually overridden.",
      );
    }

    if (scoring?.ambiguous === true) {
      reasons.push(
        "Directional ambiguity is active and cannot be manually overridden.",
      );
    }

    if (
      config.requireRequiredEngines &&
      scoring?.requiredEnginesReady === false
    ) {
      reasons.push(
        "Required scoring engines are unavailable; manual override is blocked.",
      );
    }

    if (
      scoring?.approved === false ||
      scoring?.status === "ERROR"
    ) {
      reasons.push(
        "Trade scoring is unavailable or failed; manual override is blocked.",
      );
    }

    if (account?.tradingBlocked === true) {
      reasons.push("Account trading is blocked.");
    }

    if (account?.accountBlocked === true) {
      reasons.push("Account is blocked.");
    }

    if (
      side === "SHORT" &&
      account?.shortingEnabled === false
    ) {
      reasons.push(
        "Account does not permit short selling.",
      );
    }

    if (
      Array.isArray(account?.openPositions) &&
      account.openPositions.length > 0
    ) {
      reasons.push(
        "An open position already exists; manual override cannot create a second position through this coordinator.",
      );
    }

    if (reasons.length > 0) {
      return blocked({
        symbol: symbol || null,
        score,
        reasons,
      });
    }

    return {
      approved: true,
      engine: "MANUAL_ENTRY_OVERRIDE",
      status: MANUAL_OVERRIDE_STATUS.APPROVED,
      symbol,
      side,
      score,
      autonomousThreshold,
      autonomousApproved: false,
      entryAuthorized: true,
      executed: false,
      overrideScope: "ONE_ENTRY_ONLY",
      managementAfterEntry: "BOT",
      reasons: [
        `Human accepted a ${score}/100 setup inside the manual-entry band below the autonomous ${autonomousThreshold}/100 threshold.`,
        "Override applies only to this entry. Global engine thresholds remain unchanged.",
        "Trade-level risk approval is still required before execution.",
      ],
      warnings: [
        "Manual entry authorization does not disable stop-loss, trailing protection, thesis monitoring, or forced exit logic.",
      ],
      errors: [],
      timestamp: nowIso(),
    };
  } catch (error) {
    return {
      approved: false,
      engine: "MANUAL_ENTRY_OVERRIDE",
      status: MANUAL_OVERRIDE_STATUS.ERROR,
      symbol: null,
      score: null,
      entryAuthorized: false,
      executed: false,
      position: null,
      riskApproval: null,
      reasons: [],
      warnings: ["Manual override evaluation failed safely."],
      errors: [
        error instanceof Error ? error.message : String(error),
      ],
      timestamp: nowIso(),
    };
  }
}

export function executeManualPaperEntryOverride({
  analysis,
  account,
  currentPrice,
  orderType,
  limitPrice = null,
  slippagePercent = null,
  metadata = {},
  configOverrides = {},
} = {}) {
  try {
    const eligibility = evaluateManualEntryOverride({
      analysis,
      account,
      configOverrides,
    });

    if (eligibility?.approved !== true) {
      return eligibility;
    }

    const { symbol, side, score } = eligibility;

    const technical = analysis?.results?.technical ?? null;
    const liquidity = analysis?.results?.liquidity ?? null;
    const marketRegime = analysis?.results?.marketRegime ?? null;
    const scoring = analysis?.results?.scoring ?? null;
    const consensus = analysis?.results?.consensus ?? null;
    const historyOutcome = analysis?.results?.historyOutcome ?? null;
    const macro = analysis?.results?.macro ?? null;
    const country = analysis?.results?.country ?? null;
    const company = analysis?.results?.company ?? null;
    const events = analysis?.results?.events ?? null;

    const manualDecisionGate = {
      approved: true,
      engine: "MANUAL_ENTRY_OVERRIDE",
      status: "HUMAN_OVERRIDE_RISK_REVIEW",
      decision: "HUMAN_OVERRIDE",
      canProceedToRiskManager: true,
      side,
      score,
      reasons: [
        "Human manually accepted this below-threshold candidate for one-time risk review.",
      ],
      warnings: [
        "Autonomous score threshold was bypassed for this entry only.",
      ],
      timestamp: nowIso(),
    };

    const riskApproval = evaluateRiskApproval({
      symbol,
      decisionGate: manualDecisionGate,

      accountBalance: account?.balance,
      accountEquity: account?.equity,
      accountRiskPercent: account?.riskPercent,
      buyingPower: account?.buyingPower,
      accountStatus: account?.status,
      tradingBlocked: account?.tradingBlocked === true,
      accountBlocked: account?.accountBlocked === true,
      shortingEnabled: account?.shortingEnabled === true,
      dailyPnL: account?.dailyPnL,
      dailyLossLimit: account?.dailyLossLimit,
      openPositions: Array.isArray(account?.openPositions)
        ? account.openPositions
        : [],
      portfolioExposure: isFiniteNumber(account?.portfolioExposure)
        ? Number(account.portfolioExposure)
        : null,

      atr: technical?.indicators?.atr?.value ?? null,
      liquidity,
      marketRegime,

      additionalContext: {
        scoring,
        consensus,
        historyOutcome,
        macro,
        country,
        company,
        events,
        manualOverride: {
          active: true,
          scope: "ONE_ENTRY_ONLY",
          scoreAtEntry: score,
          autonomousThreshold: eligibility.autonomousThreshold,
        },
      },
    });

    if (riskApproval?.canExecute !== true) {
      return {
        approved: false,
        engine: "MANUAL_ENTRY_OVERRIDE",
        status: MANUAL_OVERRIDE_STATUS.BLOCKED,
        symbol,
        side,
        score,
        entryAuthorized: true,
        riskApproved: false,
        executed: false,
        position: null,
        riskApproval,
        reasons: [
          "Human accepted the entry score, but the normal trade-risk layer rejected execution.",
          ...(Array.isArray(riskApproval?.reasons)
            ? riskApproval.reasons
            : []),
        ],
        warnings: [
          "Manual override cannot bypass trade-level risk controls.",
        ],
        errors: [],
        timestamp: nowIso(),
      };
    }

    const tradeFingerprint =
      analysis?.results?.tradeFingerprint ?? null;

    const execution = executeApprovedPaperTrade({
      symbol,
      riskApproval,
      currentPrice,
      orderType,
      limitPrice,
      slippagePercent,
      intelligence: {
        technical,
        macro,
        marketRegime,
        events,
        company,
        country,
        social: analysis?.results?.social ?? null,
        historical: analysis?.results?.historical ?? null,
        institutional: analysis?.results?.institutional ?? null,
        liquidity,
        consensus,
      },
      metadata: {
        ...metadata,
        timestamp:
          metadata?.timestamp ??
          analysis?.finalDecision?.timestamp ??
          nowIso(),
        entryMode: "HUMAN_OVERRIDE",
        entryAuthorization: {
          mode: "HUMAN_OVERRIDE",
          scope: "ONE_ENTRY_ONLY",
          autonomousApproved: false,
          humanApproved: true,
          scoreAtEntry: score,
          autonomousThreshold: eligibility.autonomousThreshold,
          approvedAt: nowIso(),
        },
        managementMode: "BOT",
        managedByBot: true,
        tradeFingerprint,
        entryFingerprint:
          tradeFingerprint?.fingerprint ?? null,
      },
    });

    if (
      execution?.approved !== true ||
      !execution?.position
    ) {
      return {
        approved: false,
        engine: "MANUAL_ENTRY_OVERRIDE",
        status: MANUAL_OVERRIDE_STATUS.BLOCKED,
        symbol,
        side,
        score,
        entryAuthorized: true,
        riskApproved: true,
        executed: false,
        position: null,
        riskApproval,
        execution,
        reasons: [
          "Risk approval succeeded, but the normal paper execution layer did not open the position.",
        ],
        warnings: [],
        errors: execution?.errors ?? [],
        timestamp: nowIso(),
      };
    }

    return {
      approved: true,
      engine: "MANUAL_ENTRY_OVERRIDE",
      status: MANUAL_OVERRIDE_STATUS.EXECUTED,
      symbol,
      side,
      score,
      entryAuthorized: true,
      riskApproved: true,
      executed: true,
      overrideScope: "ONE_ENTRY_ONLY",
      managementMode: "BOT",
      position: {
        ...execution.position,
        entryMode: "HUMAN_OVERRIDE",
        managementMode: "BOT",
        managedByBot: true,
      },
      riskApproval,
      execution,
      reasons: [
        "Human override was accepted for this entry only.",
        "Normal trade risk approval passed.",
        "Position has been handed to the normal bot position-management pipeline.",
      ],
      warnings: [
        "The bot may reduce or exit this position if trailing, stop-loss, thesis, market-risk, or other exit conditions trigger.",
      ],
      errors: [],
      timestamp: nowIso(),
    };
  } catch (error) {
    return {
      approved: false,
      engine: "MANUAL_ENTRY_OVERRIDE",
      status: MANUAL_OVERRIDE_STATUS.ERROR,
      symbol: normalizeSymbol(analysis?.symbol) || null,
      entryAuthorized: false,
      executed: false,
      position: null,
      riskApproval: null,
      reasons: [],
      warnings: [
        "Manual paper-entry override failed safely. No position should be created from this result.",
      ],
      errors: [
        error instanceof Error ? error.message : String(error),
      ],
      timestamp: nowIso(),
    };
  }
}

export default executeManualPaperEntryOverride;
