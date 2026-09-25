/**
 * ============================================================
 * AEMA CRYPTO
 * EXECUTABLE OPPORTUNITY COORDINATOR
 * ============================================================
 *
 * Purpose:
 * - operate after Q2 + final revalidation
 * - evaluate every candidate through the existing trading
 *   intelligence pipeline
 * - attach the resulting entry gate / futures risk plan
 * - compare only genuinely executable LONG/SHORT setups
 * - select the strongest current opportunity(s)
 *
 * IMPORTANT:
 * - this module DOES NOT execute orders
 * - this module DOES NOT grant paper execution authority
 * - this module DOES NOT grant live execution authority
 * - research score is not the trade decision
 */

import {
  runCryptoTradingIntelligencePipeline,
} from "./cryptoTradingIntelligencePipeline.js";

import {
  getCryptoFuturesExecutionMarket,
} from "../../data/providers/cryptoFuturesExecutionMarketProvider.js";

import {
  buildCryptoPreEntrySetup,
} from "../risk/cryptoPreEntrySetupBuilder.js";

import {
  selectExecutableCryptoOpportunities,
} from "../../opportunity/cryptoExecutableOpportunitySelector.js";


function upper(value) {
  return String(value ?? "")
    .trim()
    .toUpperCase();
}


function getSymbol(candidate = {}) {
  return upper(
    candidate?.symbol ??
    candidate?.asset?.symbol ??
    candidate?.freshRevalidationEvidence
      ?.measurements?.symbol,
  );
}


function isFinalRevalidated(candidate = {}) {
  return (
    candidate?.qualification2?.qualified === true &&
    candidate?.finalRevalidation?.approved === true &&
    upper(candidate?.finalRevalidation?.status) ===
      "REVALIDATED"
  );
}


function getFinalDirection(candidate = {}) {
  return upper(
    candidate?.finalRevalidation?.decision,
  );
}


function getTradingDirection(
  tradingIntelligence = {},
) {
  return upper(
    tradingIntelligence
      ?.entryGate
      ?.direction ??
    tradingIntelligence
      ?.decision
      ?.preferredDirection ??
    tradingIntelligence
      ?.decision
      ?.direction,
  );
}


function directionsAgree({
  candidate,
  tradingIntelligence,
} = {}) {
  const finalDirection =
    getFinalDirection(candidate);

  const tradingDirection =
    getTradingDirection(
      tradingIntelligence,
    );

  const entryDirection =
    upper(
      tradingIntelligence
        ?.entryGate
        ?.direction,
    );

  const valid =
    value =>
      value === "LONG" ||
      value === "SHORT";

  return {
    approved:
      valid(finalDirection) &&
      valid(tradingDirection) &&
      valid(entryDirection) &&
      finalDirection === tradingDirection &&
      tradingDirection === entryDirection,

    finalDirection,
    tradingDirection,
    entryDirection,
  };
}


function normalizeProviderResult(
  value,
  fallback,
) {
  return value === undefined || value === null
    ? fallback
    : value;
}


async function resolveProvider(
  provider,
  context,
  fallback,
) {
  if (typeof provider !== "function") {
    return fallback;
  }

  const value =
    await provider(context);

  return normalizeProviderResult(
    value,
    fallback,
  );
}


/**
 * Evaluate one candidate without executing it.
 */
async function evaluateCandidate({
  candidate,

  market = {},
  account = {},

  finalIntelligence = null,
  engineContext = {},
  executionContext = {},
  entryRiskContext = {},
  riskContext = {},
  engineOverrides = {},

  decisionOptions = {},
  entryPolicy = null,
  futuresRiskPolicy = null,

  finalIntelligenceProvider = null,
  engineContextProvider = null,
  executionContextProvider = null,
  entryRiskContextProvider = null,
  riskContextProvider = null,
  engineOverridesProvider = null,
} = {}) {
  const symbol =
    getSymbol(candidate);

  if (!symbol) {
    return {
      candidate,

      approved: false,

      status:
        "TRADING_INTELLIGENCE_EVALUATION_BLOCKED",

      blocker:
        "SYMBOL_REQUIRED",

      tradingIntelligence:
        null,

      executionAuthority:
        false,

      liveExecution:
        false,
    };
  }

  if (!isFinalRevalidated(candidate)) {
    return {
      candidate,

      approved: false,

      status:
        "TRADING_INTELLIGENCE_EVALUATION_BLOCKED",

      blocker:
        "FINAL_REVALIDATION_REQUIRED",

      symbol,

      tradingIntelligence:
        null,

      executionAuthority:
        false,

      liveExecution:
        false,
    };
  }

  const providerContext = {
    symbol,
    candidate,
    market,
    account,
  };

  try {
    /*
     * Resolve non-execution providers first.
     *
     * Execution evidence is handled separately below because the
     * canonical futures provider + pre-entry setup builder must run
     * BEFORE the Entry Qualification Gate.
     */
    const [
      providedFinalIntelligence,
      providedEngineContext,
      providedRiskContext,
      providedEngineOverrides,
    ] =
      await Promise.all([
        resolveProvider(
          finalIntelligenceProvider,
          providerContext,
          finalIntelligence,
        ),

        resolveProvider(
          engineContextProvider,
          providerContext,
          engineContext,
        ),

        resolveProvider(
          riskContextProvider,
          providerContext,
          riskContext,
        ),

        resolveProvider(
          engineOverridesProvider,
          providerContext,
          engineOverrides,
        ),
      ]);

    /*
     * ============================================================
     * FRESH FUTURES EXECUTION EVIDENCE
     * ============================================================
     *
     * If an explicit executionContextProvider is supplied, preserve
     * that override path. Otherwise use the canonical Binance USD-M
     * futures execution-market provider.
     *
     * No missing evidence is manufactured.
     */
    let executionMarketEvidence = null;

    if (typeof executionContextProvider === "function") {
      const externalExecutionContext =
        await resolveProvider(
          executionContextProvider,
          providerContext,
          executionContext,
        );

      executionMarketEvidence = {
        approved:
          externalExecutionContext?.approved === true ||
          (
            Number.isFinite(
              Number(
                externalExecutionContext?.spreadPercent,
              ),
            ) &&
            Number.isFinite(
              Number(
                externalExecutionContext?.liquidityScore,
              ),
            )
          ),

        status:
          externalExecutionContext?.status ??
          "EXTERNAL_EXECUTION_CONTEXT",

        symbol,

        market: {
          ...(market ?? {}),
          ...(externalExecutionContext?.market ?? {}),
        },

        executionContext:
          externalExecutionContext?.executionContext ??
          externalExecutionContext ??
          {},

        setupEvidence:
          externalExecutionContext?.setupEvidence ??
          {},

        evidence:
          externalExecutionContext?.evidence ??
          {},

        executionAuthority: false,
        liveExecution: false,
      };
    } else {
      executionMarketEvidence =
        await getCryptoFuturesExecutionMarket(
          candidate,
        );
    }

    if (executionMarketEvidence?.approved !== true) {
      return {
        candidate: {
          ...candidate,
          executionMarketEvidence,
        },

        approved: false,

        status:
          "TRADING_INTELLIGENCE_EVALUATION_BLOCKED",

        blocker:
          "FUTURES_EXECUTION_MARKET_EVIDENCE_REQUIRED",

        symbol,

        executionMarketEvidence,

        tradingIntelligence: null,

        executionAuthority: false,
        liveExecution: false,
      };
    }

    /*
     * The final-revalidated direction is the only direction supplied
     * to the pre-entry setup builder. The setup layer does not choose
     * LONG versus SHORT.
     */
    const finalDirection =
      getFinalDirection(candidate);

    const preEntrySetup =
      buildCryptoPreEntrySetup({
        candidate,
        direction: finalDirection,
        executionMarket:
          executionMarketEvidence,
      });

    if (preEntrySetup?.approved !== true) {
      return {
        candidate: {
          ...candidate,
          executionMarketEvidence,
          preEntrySetup,
        },

        approved: false,

        status:
          "TRADING_INTELLIGENCE_EVALUATION_BLOCKED",

        blocker:
          preEntrySetup?.reason ??
          "PRE_ENTRY_SETUP_REQUIRED",

        symbol,

        executionMarketEvidence,
        preEntrySetup,

        tradingIntelligence: null,

        executionAuthority: false,
        liveExecution: false,
      };
    }

    /*
     * Explicit entryRiskContextProvider remains supported as an
     * override/augmentation point, but the evidence-backed setup is
     * the canonical base contract.
     */
    const externalEntryRiskContext =
      await resolveProvider(
        entryRiskContextProvider,
        {
          ...providerContext,
          executionMarketEvidence,
          preEntrySetup,
        },
        entryRiskContext,
      );

    const providedExecutionContext = {
      ...(executionMarketEvidence?.executionContext ?? {}),
      ...(preEntrySetup?.executionContext ?? {}),
    };

    const providedEntryRiskContext = {
      ...(preEntrySetup?.entryRiskContext ?? {}),
      ...(externalEntryRiskContext ?? {}),
    };

    const resolvedMarket = {
      ...(market ?? {}),
      ...(executionMarketEvidence?.market ?? {}),
      entryPrice:
        preEntrySetup?.entryPrice ??
        executionMarketEvidence?.market?.markPrice ??
        market?.entryPrice ??
        null,
    };

    /*
     * Ensure the final futures risk manager receives the same real
     * stop/ATR evidence that qualified the pre-entry setup.
     */
    const resolvedRiskContext = {
      ...(providedRiskContext ?? {}),
      entryPrice:
        preEntrySetup?.entryPrice ??
        providedRiskContext?.entryPrice ??
        null,
      atr:
        preEntrySetup?.atr ??
        providedRiskContext?.atr ??
        null,
      atrPercent:
        preEntrySetup?.atrPercent ??
        providedRiskContext?.atrPercent ??
        null,
      structuralStopPrice:
        preEntrySetup?.entryRiskContext
          ?.structuralStopPrice ??
        providedRiskContext
          ?.structuralStopPrice ??
        null,
    };

    const tradingIntelligence =
      await runCryptoTradingIntelligencePipeline({
        candidate,

        // Deliberately evaluate as a new-entry candidate.
        // Existing open positions belong to the management path,
        // not cross-candidate entry selection.
        position: null,

        entryEngines: null,
        existingRiskPlan: null,

        finalIntelligence:
          providedFinalIntelligence,

        market:
          resolvedMarket,

        account,

        executionContext:
          providedExecutionContext ?? {},

        entryRiskContext:
          providedEntryRiskContext ?? {},

        riskContext:
          resolvedRiskContext,

        engineContext:
          providedEngineContext ?? {},

        engineOverrides:
          providedEngineOverrides ?? {},

        decisionOptions,

        entryPolicy,

        futuresRiskPolicy,
      });

    const directionAgreement =
      directionsAgree({
        candidate,
        tradingIntelligence,
      });

    const enrichedCandidate = {
      ...candidate,

      tradingIntelligence,

      /**
       * Compatibility aliases.
       *
       * The selector reads tradingIntelligence directly,
       * while these fields make the evaluated candidate easier
       * to inspect elsewhere without changing authority.
       */
      entryQualification:
        tradingIntelligence?.entryGate ??
        candidate?.entryQualification ??
        null,

      riskPlan:
        tradingIntelligence?.riskPlan ??
        candidate?.riskPlan ??
        null,

      tradingDecision:
        tradingIntelligence?.decision ??
        null,

      directionAgreement,

      executionMarketEvidence,

      preEntrySetup,
    };

    const entryApproved =
      tradingIntelligence
        ?.entryGate
        ?.approved === true;

    const riskApproved =
      tradingIntelligence
        ?.riskPlan
        ?.approved === true;

    const directionApproved =
      directionAgreement?.approved === true &&
      tradingIntelligence
        ?.directionAgreement
        ?.approved === true;

    const executionEvidencePresent =
      executionMarketEvidence?.approved === true &&
      preEntrySetup?.approved === true &&
      Number.isFinite(
        Number(
          providedExecutionContext
            ?.spreadPercent,
        ),
      ) &&
      Number.isFinite(
        Number(
          providedExecutionContext
            ?.liquidityScore,
        ),
      ) &&
      providedExecutionContext
        ?.venueHealthy === true &&
      providedExecutionContext
        ?.orderBookHealthy === true;

    const entryRiskEvidencePresent =
      preEntrySetup?.approved === true &&
      Number.isFinite(
        Number(
          providedEntryRiskContext
            ?.riskReward,
        ),
      ) &&
      Number.isFinite(
        Number(
          providedEntryRiskContext
            ?.stopDistancePercent,
        ),
      ) &&
      Number.isFinite(
        Number(
          providedEntryRiskContext
            ?.targetDistancePercent,
        ),
      );

    const riskPlanEvidencePresent =
      Number.isFinite(
        Number(
          tradingIntelligence
            ?.riskPlan
            ?.entryPrice,
        ),
      ) &&
      Number.isFinite(
        Number(
          tradingIntelligence
            ?.riskPlan
            ?.accountEquity,
        ),
      ) &&
      tradingIntelligence
        ?.riskPlan
        ?.evidence
        ?.stopEvidenceAvailable === true;

    const fullyExecutable =
      entryApproved &&
      riskApproved &&
      directionApproved &&
      executionEvidencePresent &&
      entryRiskEvidencePresent &&
      riskPlanEvidencePresent;

    let blocker = null;

    if (!directionApproved) {
      blocker =
        "DIRECTION_REVALIDATION_INTELLIGENCE_CONFLICT";
    } else if (!executionEvidencePresent) {
      blocker =
        "EXECUTION_EVIDENCE_REQUIRED";
    } else if (!entryRiskEvidencePresent) {
      blocker =
        "ENTRY_RISK_EVIDENCE_REQUIRED";
    } else if (!entryApproved) {
      blocker =
        "ENTRY_GATE_NOT_APPROVED";
    } else if (!riskApproved) {
      blocker =
        "FUTURES_RISK_PLAN_NOT_APPROVED";
    } else if (!riskPlanEvidencePresent) {
      blocker =
        "FUTURES_RISK_EVIDENCE_REQUIRED";
    }

    return {
      candidate:
        enrichedCandidate,

      approved:
        fullyExecutable,

      status:
        fullyExecutable
          ? "TRADING_INTELLIGENCE_ENTRY_EXECUTABLE"
          : "TRADING_INTELLIGENCE_ENTRY_BLOCKED",

      blocker,

      symbol,

      directionAgreement,

      executionMarketEvidence,

      preEntrySetup,

      evidence: {
        executionEvidencePresent,
        entryRiskEvidencePresent,
        riskPlanEvidencePresent,
        failClosed:
          true,
      },

      tradingIntelligence,

      executionAuthority:
        false,

      liveExecution:
        false,
    };
  } catch (error) {
    return {
      candidate,

      approved: false,

      status:
        "TRADING_INTELLIGENCE_EVALUATION_FAILED",

      blocker:
        error?.message ??
        "TRADING_INTELLIGENCE_EVALUATION_FAILED",

      symbol,

      error: {
        name:
          error?.name ??
          "Error",

        message:
          error?.message ??
          String(error),
      },

      tradingIntelligence:
        null,

      executionAuthority:
        false,

      liveExecution:
        false,
    };
  }
}


/**
 * ============================================================
 * COORDINATE EXECUTABLE OPPORTUNITY SELECTION
 * ============================================================
 *
 * This is intentionally evaluation + selection only.
 *
 * It must be called BEFORE:
 *   cryptoPaperExecutionAuthorityGate
 *   paper order construction
 *   paper execution
 */
export async function coordinateCryptoExecutableOpportunities({
  candidates = [],

  market = {},
  account = {},

  finalIntelligence = null,
  engineContext = {},
  executionContext = {},
  entryRiskContext = {},
  riskContext = {},
  engineOverrides = {},

  decisionOptions = {},
  entryPolicy = null,
  futuresRiskPolicy = null,

  finalIntelligenceProvider = null,
  marketProvider = null,
  accountProvider = null,
  engineContextProvider = null,
  executionContextProvider = null,
  entryRiskContextProvider = null,
  riskContextProvider = null,
  engineOverridesProvider = null,

  selectorOptions = {},
  maximumSelections = 1,
} = {}) {
  const input =
    Array.isArray(candidates)
      ? candidates
      : [];

  if (input.length === 0) {
    return {
      approved: false,

      status:
        "NO_EXECUTABLE_QUALIFIED_OPPORTUNITY",

      decision:
        "NO_TRADE",

      reason:
        "NO_FINAL_REVALIDATED_CANDIDATES",

      counts: {
        received: 0,
        evaluated: 0,
        intelligenceApproved: 0,
        selected: 0,
      },

      evaluations: [],
      evaluatedCandidates: [],
      selected: [],
      selectedCandidates: [],

      nextStage:
        "NONE",

      paperExecutionAuthority:
        false,

      executionAuthority:
        false,

      liveExecution:
        false,
    };
  }

  const evaluations = [];

  /**
   * Evaluate sequentially by default.
   *
   * This avoids creating a sudden burst of exchange/API/model
   * calls and makes evaluation order deterministic.
   */
  for (const candidate of input) {
    const symbol =
      getSymbol(candidate);

    const providerContext = {
      symbol,
      candidate,
      market,
      account,
    };

    const [
      candidateMarket,
      candidateAccount,
    ] =
      await Promise.all([
        resolveProvider(
          marketProvider,
          providerContext,
          market,
        ),

        resolveProvider(
          accountProvider,
          providerContext,
          account,
        ),
      ]);

    const evaluation =
      await evaluateCandidate({
        candidate,

        market:
          candidateMarket ?? {},

        account:
          candidateAccount ?? {},

        finalIntelligence,
        engineContext,
        executionContext,
        entryRiskContext,
        riskContext,
        engineOverrides,

        decisionOptions,
        entryPolicy,
        futuresRiskPolicy,

        finalIntelligenceProvider,
        engineContextProvider,
        executionContextProvider,
        entryRiskContextProvider,
        riskContextProvider,
        engineOverridesProvider,
      });

    evaluations.push(
      evaluation,
    );
  }

  /**
   * Pass ALL evaluated candidates to the selector.
   *
   * The selector remains responsible for hard eligibility.
   * This is important because rejected candidates should remain
   * visible in diagnostics rather than silently disappearing.
   */
  const evaluatedCandidates =
    evaluations.map(
      evaluation =>
        evaluation?.candidate,
    );

  const executableEvaluatedCandidates =
    evaluations
      .filter(
        evaluation =>
          evaluation?.approved === true,
      )
      .map(
        evaluation =>
          evaluation?.candidate,
      )
      .filter(Boolean);

  const selection =
    selectExecutableCryptoOpportunities({
      candidates:
        executableEvaluatedCandidates,

      maximumSelections,

      ...selectorOptions,
    });

  const selected =
    Array.isArray(
      selection?.selected,
    )
      ? selection.selected
      : [];

  const selectedCandidates =
    selected
      .map(
        item =>
          item?.candidate,
      )
      .filter(Boolean);

  const intelligenceApprovedCount =
    evaluations.filter(
      evaluation =>
        evaluation?.approved === true,
    ).length;

  if (
    selection?.approved !== true ||
    selectedCandidates.length === 0
  ) {
    return {
      approved: false,

      status:
        "NO_EXECUTABLE_QUALIFIED_OPPORTUNITY",

      decision:
        "NO_TRADE",

      reason:
        selection?.status ??
        "NO_EXECUTABLE_QUALIFIED_OPPORTUNITY",

      counts: {
        received:
          input.length,

        evaluated:
          evaluations.length,

        intelligenceApproved:
          intelligenceApprovedCount,

        executable:
          selection
            ?.counts
            ?.executable ??
          0,

        selected:
          0,
      },

      evaluations,

      evaluatedCandidates,

      executableEvaluatedCandidates,

      selection,

      selected: [],

      selectedCandidates: [],

      nextStage:
        "NONE",

      paperExecutionAuthority:
        false,

      executionAuthority:
        false,

      liveExecution:
        false,
    };
  }

  return {
    approved: true,

    status:
      "EXECUTABLE_OPPORTUNITY_COORDINATED",

    decision:
      selection?.decision ??
      (
        selected.length === 1
          ? selected[0]?.direction
          : "MULTIPLE"
      ),

    counts: {
      received:
        input.length,

      evaluated:
        evaluations.length,

      intelligenceApproved:
        intelligenceApprovedCount,

      executable:
        selection
          ?.counts
          ?.executable ??
        selected.length,

      selected:
        selected.length,
    },

    evaluations,

    evaluatedCandidates,

    executableEvaluatedCandidates,

    selection,

    selected,

    selectedCandidates,

    bestOpportunity:
      selected[0] ??
      null,

    bestCandidate:
      selectedCandidates[0] ??
      null,

    nextStage:
      "PAPER_EXECUTION_AUTHORITY_GATE",

    /**
     * The coordinator selects.
     * It does NOT authorize.
     */
    paperExecutionAuthority:
      false,

    executionAuthority:
      false,

    liveExecution:
      false,
  };
}


export {
  evaluateCandidate as
    evaluateCryptoExecutableCandidate,
};


export default
  coordinateCryptoExecutableOpportunities;
