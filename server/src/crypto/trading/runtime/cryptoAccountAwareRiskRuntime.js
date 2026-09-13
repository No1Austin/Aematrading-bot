/**
 * ============================================================
 * AEMA CRYPTO
 * ACCOUNT-AWARE RISK RUNTIME
 * Phase 5.26
 * ============================================================
 *
 * Purpose:
 * - bridge Phase 5.25 paper-account truth into risk management
 * - use evolving account equity for futures position sizing
 * - use real account drawdown for portfolio-risk controls
 * - use real ledger positions for portfolio exposure
 *
 * IMPORTANT
 * ---------
 * This module does NOT:
 * - place orders
 * - call an exchange
 * - enable live execution
 *
 * Financial source of truth:
 * cryptoPaperAccountLedger
 */

import buildCryptoFuturesRiskPlan
  from "../risk/cryptoFuturesRiskManager.js";

import evaluateCryptoPortfolioRisk
  from "../risk/cryptoPortfolioRiskManager.js";

import {
  buildCryptoPaperAccountSnapshot,
  buildCryptoPaperRiskContext,
} from "./cryptoPaperAccountSnapshot.js";


const finite = (
  value,
  fallback = null,
) => {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return fallback;
  }

  const number =
    Number(value);

  return Number.isFinite(number)
    ? number
    : fallback;
};


const upper = (
  value,
  fallback = "",
) => {
  const text =
    String(value ?? "")
      .trim()
      .toUpperCase();

  return text || fallback;
};


function clone(value) {
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


function normalizeLedgerPosition(
  position,
) {
  if (!position) {
    return null;
  }

  const symbol =
    upper(
      position.symbol,
    );

  const direction =
    upper(
      position.direction,
      "FLAT",
    );

  const quantity =
    Math.max(
      0,
      finite(
        position.quantity,
        0,
      ),
    );

  if (
    !symbol ||
    quantity <= 0 ||
    ![
      "LONG",
      "SHORT",
    ].includes(direction)
  ) {
    return null;
  }

  const currentPrice =
    finite(
      position.currentPrice ??
      position.markPrice ??
      position.averageEntryPrice,
      0,
    );

  const notionalUsd =
    (
      currentPrice > 0 &&
      quantity > 0
    )
      ? currentPrice *
        quantity
      : 0;

  return {
    symbol,

    direction,

    quantity,

    exposure:
      finite(
        position.exposure,
        1,
      ),

    leverage:
      finite(
        position.leverage,
        1,
      ),

    notionalUsd,

    currentPrice,

    averageEntryPrice:
      finite(
        position.averageEntryPrice,
        null,
      ),

    unrealizedPnl:
      finite(
        position.unrealizedPnl,
        0,
      ),

    theme:
      position.theme ??
      null,

    systemicDependency:
      finite(
        position.systemicDependency,
        0,
      ),

    correlations:
      clone(
        position.correlations ??
        {},
      ),
  };
}


/**
 * ============================================================
 * ACCOUNT-AWARE CONTEXT BUILDER
 * ============================================================
 */

export function buildAccountAwareRiskContext({
  ledger,

  marketPrices = {},

  direction = null,

  entryPrice = null,

  entryQualification = null,

  liveMonitor = null,

  atr = null,

  atrPercent = null,

  structuralStopPrice = null,

  requestedLeverage = null,

  volatilityScore = null,

  volatilityState = null,

  marketStress = false,

  marketRegime = null,

  additionalContext = {},
} = {}) {
  if (!ledger) {
    throw new Error(
      "PAPER_ACCOUNT_LEDGER_REQUIRED",
    );
  }

  const account =
    buildCryptoPaperAccountSnapshot({
      ledger,

      marketPrices,
    });

  const riskContext =
    buildCryptoPaperRiskContext({
      ledger,

      marketPrices,

      marketStress,
    });

  return {
    ...additionalContext,

    /**
     * Account truth
     */

    accountEquity:
      account.equity,

    startingEquity:
      account.startingEquity,

    peakEquity:
      account.peakEquity,

    realizedPnl:
      account.realizedPnl,

    unrealizedPnl:
      account.unrealizedPnl,

    tradingFees:
      account.tradingFees,

    fundingPnl:
      account.fundingPnl,

    portfolioDrawdownPercent:
      account.drawdownPercent,

    drawdownPercent:
      account.drawdownPercent,

    /**
     * Futures-risk inputs
     */

    direction,

    entryPrice,

    entryQualification,

    liveMonitor,

    atr,

    atrPercent,

    structuralStopPrice,

    requestedLeverage,

    volatilityScore,

    volatilityState,

    /**
     * Portfolio-risk inputs
     */

    positions:
      riskContext
        .positions
        .map(
          normalizeLedgerPosition,
        )
        .filter(Boolean),

    marketStress:
      Boolean(
        marketStress,
      ),

    marketRegime,

    /**
     * Audit/debug
     */

    accountSnapshot:
      account,

    paperExecution:
      true,

    liveExecution:
      false,

    executionAuthority:
      false,
  };
}


/**
 * ============================================================
 * FUTURES RISK USING REAL ACCOUNT EQUITY
 * ============================================================
 */

export function buildAccountAwareFuturesRiskPlan({
  ledger,

  marketPrices = {},

  direction,

  entryPrice,

  entryQualification = null,

  liveMonitor = null,

  atr = null,

  atrPercent = null,

  structuralStopPrice = null,

  requestedLeverage = null,

  volatilityScore = null,

  volatilityState = null,

  marketStress = false,

  marketRegime = null,

  policyOverrides = {},

  additionalContext = {},
} = {}) {
  const context =
    buildAccountAwareRiskContext({
      ledger,

      marketPrices,

      direction,

      entryPrice,

      entryQualification,

      liveMonitor,

      atr,

      atrPercent,

      structuralStopPrice,

      requestedLeverage,

      volatilityScore,

      volatilityState,

      marketStress,

      marketRegime,

      additionalContext,
    });

  const riskPlan =
    buildCryptoFuturesRiskPlan(
      context,
      policyOverrides,
    );

  return {
    ...riskPlan,

    accountEquityUsed:
      context.accountEquity,

    portfolioDrawdownPercent:
      context
        .portfolioDrawdownPercent,

    paperExecution:
      true,

    liveExecution:
      false,

    executionAuthority:
      false,
  };
}


/**
 * ============================================================
 * PORTFOLIO RISK USING REAL LEDGER POSITIONS / DRAWDOWN
 * ============================================================
 */

export async function evaluateAccountAwarePortfolioRisk({
  ledger,

  marketPrices = {},

  action,

  lifecycle = null,

  direction = null,

  candidate = null,

  requestedExposure = null,

  riskPlan = null,

  marketStress = false,

  marketRegime = null,

  limits = {},

  additionalContext = {},
} = {}) {
  const context =
    buildAccountAwareRiskContext({
      ledger,

      marketPrices,

      direction,

      marketStress,

      marketRegime,

      additionalContext,
    });

  const portfolioResult =
    await evaluateCryptoPortfolioRisk({
      ...additionalContext,

      action,

      lifecycle,

      direction,

      candidate,

      requestedExposure,

      riskPlan,

      positions:
        context.positions,

      portfolioDrawdownPercent:
        context
          .portfolioDrawdownPercent,

      marketStress:
        context.marketStress,

      marketRegime:
        context.marketRegime,

      limits,
    });

  return {
    ...portfolioResult,

    accountEquityUsed:
      context.accountEquity,

    portfolioDrawdownPercent:
      context
        .portfolioDrawdownPercent,

    ledgerPositionCount:
      context.positions.length,

    paperExecution:
      true,

    liveExecution:
      false,

    executionAuthority:
      false,
  };
}


/**
 * ============================================================
 * COMBINED ENTRY RISK EVALUATION
 * ============================================================
 *
 * Intended runtime order:
 *
 * 1. futures risk sizes using current equity
 * 2. portfolio risk evaluates whether new exposure is allowed
 */

export async function evaluateAccountAwareEntryRisk({
  ledger,

  marketPrices = {},

  direction,

  entryPrice,

  entryQualification,

  lifecycle,

  candidate,

  requestedExposure = null,

  atr = null,

  atrPercent = null,

  structuralStopPrice = null,

  requestedLeverage = null,

  volatilityScore = null,

  volatilityState = null,

  marketStress = false,

  marketRegime = null,

  futuresPolicyOverrides = {},

  portfolioLimits = {},

  additionalContext = {},
} = {}) {
  const futuresRiskPlan =
    buildAccountAwareFuturesRiskPlan({
      ledger,

      marketPrices,

      direction,

      entryPrice,

      entryQualification,

      atr,

      atrPercent,

      structuralStopPrice,

      requestedLeverage,

      volatilityScore,

      volatilityState,

      marketStress,

      marketRegime,

      policyOverrides:
        futuresPolicyOverrides,

      additionalContext,
    });

  const portfolioRisk =
    await evaluateAccountAwarePortfolioRisk({
      ledger,

      marketPrices,

      action:
        lifecycle?.action ??
        "OPEN_POSITION",

      lifecycle,

      direction,

      candidate,

      requestedExposure:
        requestedExposure ??
        lifecycle
          ?.targetExposure,

      riskPlan:
        futuresRiskPlan,

      marketStress,

      marketRegime,

      limits:
        portfolioLimits,

      additionalContext,
    });

  return {
    approved:
      futuresRiskPlan
        ?.approved === true &&
      portfolioRisk
        ?.approved === true,

    futuresRiskPlan,

    portfolioRisk,

    accountEquityUsed:
      futuresRiskPlan
        ?.accountEquityUsed,

    portfolioDrawdownPercent:
      portfolioRisk
        ?.portfolioDrawdownPercent,

    paperExecution:
      true,

    liveExecution:
      false,

    executionAuthority:
      false,
  };
}


export default {
  buildAccountAwareRiskContext,

  buildAccountAwareFuturesRiskPlan,

  evaluateAccountAwarePortfolioRisk,

  evaluateAccountAwareEntryRisk,

  paperExecution:
    true,

  liveExecution:
    false,

  executionAuthority:
    false,
};