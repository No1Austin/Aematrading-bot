/**
 * ============================================================
 * AEMA CRYPTO — CANDIDATE ACTION POLICY
 * ============================================================
 *
 * PURPOSE
 * -------
 * Make research eligibility, bot eligibility and execution
 * eligibility separate concepts.
 *
 * POLICY
 * ------
 *
 * CEX candidate
 *   discovery -> qualification -> deep research
 *   -> may progress to bot after deep research approval
 *
 * Emerging candidate
 *   discovery -> qualification -> deep research/watchlist
 *   -> NEVER progresses to bot
 *   -> NEVER progresses to execution
 *
 * IMPORTANT
 * ---------
 * This is server-side policy. UI state must never be the thing
 * that decides whether a candidate can reach the bot.
 */

export const CRYPTO_CANDIDATE_TYPE =
  Object.freeze({
    CEX:
      "CEX",

    EMERGING:
      "EMERGING",

    UNKNOWN:
      "UNKNOWN",
  });

export const CRYPTO_ACTION_POLICY =
  Object.freeze({
    BOT_ELIGIBLE_AFTER_RESEARCH:
      "BOT_ELIGIBLE_AFTER_RESEARCH",

    RESEARCH_ONLY:
      "RESEARCH_ONLY",

    BLOCKED:
      "BLOCKED",
  });

export const CRYPTO_POLICY_REASON =
  Object.freeze({
    CEX_REQUIRES_DEEP_RESEARCH:
      "CEX_REQUIRES_DEEP_RESEARCH",

    CEX_DEEP_RESEARCH_APPROVED:
      "CEX_DEEP_RESEARCH_APPROVED",

    EMERGING_RESEARCH_ONLY:
      "EMERGING_RESEARCH_ONLY",

    NO_SUPPORTED_VENUE:
      "NO_SUPPORTED_VENUE",

    NOT_QUALIFIED:
      "NOT_QUALIFIED",

    DEEP_RESEARCH_NOT_APPROVED:
      "DEEP_RESEARCH_NOT_APPROVED",

    EXECUTION_REQUIRES_BOT_APPROVAL:
      "EXECUTION_REQUIRES_BOT_APPROVAL",
  });

function finite(
  value,
) {
  const number =
    Number(value);

  return Number.isFinite(number)
    ? number
    : 0;
}

/**
 * CEX takes precedence.
 *
 * If a token trades on both CEX and DEX, it is still a CEX
 * candidate and may later reach the bot after research approval.
 *
 * DEX-only / new-pool projects are treated as Emerging.
 */
export function classifyCryptoCandidate(
  candidate,
) {
  const cexCount =
    finite(
      candidate
        ?.venues
        ?.cexCount ??
      candidate
        ?.cexCount,
    );

  const dexCount =
    finite(
      candidate
        ?.venues
        ?.dexCount ??
      candidate
        ?.dexCount,
    );

  if (
    cexCount >
    0
  ) {
    return CRYPTO_CANDIDATE_TYPE.CEX;
  }

  if (
    dexCount >
    0
  ) {
    return CRYPTO_CANDIDATE_TYPE.EMERGING;
  }

  return CRYPTO_CANDIDATE_TYPE.UNKNOWN;
}

export function buildCryptoCandidatePolicy(
  candidate,
) {
  const candidateType =
    classifyCryptoCandidate(
      candidate,
    );

  const qualified =
    candidate?.qualified ===
    true;

  if (
    candidateType ===
    CRYPTO_CANDIDATE_TYPE.EMERGING
  ) {
    return {
      candidateType,

      actionPolicy:
        CRYPTO_ACTION_POLICY
          .RESEARCH_ONLY,

      deepResearchEligible:
        qualified,

      botEligible:
        false,

      executionEligible:
        false,

      policyReason:
        CRYPTO_POLICY_REASON
          .EMERGING_RESEARCH_ONLY,
    };
  }

  if (
    candidateType ===
    CRYPTO_CANDIDATE_TYPE.CEX
  ) {
    return {
      candidateType,

      actionPolicy:
        CRYPTO_ACTION_POLICY
          .BOT_ELIGIBLE_AFTER_RESEARCH,

      deepResearchEligible:
        qualified,

      /*
       * Scanner qualification is NOT enough to reach the bot.
       * Deep research must approve the candidate later.
       */
      botEligible:
        false,

      executionEligible:
        false,

      policyReason:
        qualified
          ? CRYPTO_POLICY_REASON
              .CEX_REQUIRES_DEEP_RESEARCH
          : CRYPTO_POLICY_REASON
              .NOT_QUALIFIED,
    };
  }

  return {
    candidateType:
      CRYPTO_CANDIDATE_TYPE.UNKNOWN,

    actionPolicy:
      CRYPTO_ACTION_POLICY.BLOCKED,

    deepResearchEligible:
      false,

    botEligible:
      false,

    executionEligible:
      false,

    policyReason:
      CRYPTO_POLICY_REASON
        .NO_SUPPORTED_VENUE,
  };
}

/**
 * Apply policy metadata to a candidate.
 */
export function applyCryptoCandidatePolicy(
  candidate,
) {
  return {
    ...candidate,

    ...buildCryptoCandidatePolicy(
      candidate,
    ),
  };
}

/**
 * ============================================================
 * BOT SUBMISSION GATE
 * ============================================================
 *
 * This should be called by the crypto deep-research coordinator
 * immediately before any candidate is submitted to the bot.
 */
export function evaluateCryptoBotSubmission({
  candidate,
  deepResearchApproved =
    false,
} = {}) {
  const policy =
    buildCryptoCandidatePolicy(
      candidate,
    );

  if (
    policy.candidateType ===
    CRYPTO_CANDIDATE_TYPE.EMERGING
  ) {
    return {
      allowed:
        false,

      candidateType:
        policy.candidateType,

      reason:
        CRYPTO_POLICY_REASON
          .EMERGING_RESEARCH_ONLY,
    };
  }

  if (
    policy.candidateType !==
    CRYPTO_CANDIDATE_TYPE.CEX
  ) {
    return {
      allowed:
        false,

      candidateType:
        policy.candidateType,

      reason:
        CRYPTO_POLICY_REASON
          .NO_SUPPORTED_VENUE,
    };
  }

  if (
    candidate?.qualified !==
    true
  ) {
    return {
      allowed:
        false,

      candidateType:
        policy.candidateType,

      reason:
        CRYPTO_POLICY_REASON
          .NOT_QUALIFIED,
    };
  }

  if (
    deepResearchApproved !==
    true
  ) {
    return {
      allowed:
        false,

      candidateType:
        policy.candidateType,

      reason:
        CRYPTO_POLICY_REASON
          .DEEP_RESEARCH_NOT_APPROVED,
    };
  }

  return {
    allowed:
      true,

    candidateType:
      policy.candidateType,

    reason:
      CRYPTO_POLICY_REASON
        .CEX_DEEP_RESEARCH_APPROVED,
  };
}

/**
 * Throws when a caller attempts to bypass policy.
 */
export function assertCryptoBotSubmissionAllowed(
  options = {},
) {
  const result =
    evaluateCryptoBotSubmission(
      options,
    );

  if (
    result.allowed !==
    true
  ) {
    const error =
      new Error(
        `Crypto bot submission blocked: ${result.reason}`,
      );

    error.code =
      "CRYPTO_BOT_SUBMISSION_BLOCKED";

    error.reason =
      result.reason;

    error.candidateType =
      result.candidateType;

    throw error;
  }

  return result;
}

/**
 * ============================================================
 * EXECUTION GATE
 * ============================================================
 *
 * Emerging candidates can never execute.
 *
 * CEX candidates still require:
 * - qualification
 * - deep research approval
 * - bot approval
 * - risk approval
 */
export function evaluateCryptoExecution({
  candidate,
  deepResearchApproved =
    false,
  botApproved =
    false,
  riskApproved =
    false,
} = {}) {
  const botGate =
    evaluateCryptoBotSubmission({
      candidate,
      deepResearchApproved,
    });

  if (
    botGate.allowed !==
    true
  ) {
    return {
      allowed:
        false,

      reason:
        botGate.reason,
    };
  }

  if (
    botApproved !==
      true ||
    riskApproved !==
      true
  ) {
    return {
      allowed:
        false,

      reason:
        CRYPTO_POLICY_REASON
          .EXECUTION_REQUIRES_BOT_APPROVAL,
    };
  }

  return {
    allowed:
      true,

    reason:
      "EXECUTION_POLICY_APPROVED",
  };
}

export default {
  classifyCryptoCandidate,
  buildCryptoCandidatePolicy,
  applyCryptoCandidatePolicy,
  evaluateCryptoBotSubmission,
  assertCryptoBotSubmissionAllowed,
  evaluateCryptoExecution,
};
