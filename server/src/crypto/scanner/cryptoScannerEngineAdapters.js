/**
 * ============================================================
 * AEMA CRYPTO
 * SCANNER ENGINE ADAPTERS
 * Phase 6.50 — fail-proof on-chain handoff + GPT scanner timeout 45s
 * ============================================================
 *
 * Purpose:
 * - adapt existing public crypto analysis engines to the
 *   normalized Crypto Scanner contract
 * - preserve evidence availability explicitly
 * - convert engine confidence from 0..1 to scanner 0..100
 * - reuse existing measurement generation
 *
 * IMPORTANT:
 * - research only
 * - no trading-engine imports
 * - no execution authority
 * - no fabricated evidence
 */

import runCryptoTechnicalEngine
  from "../analysis/cryptoTechnicalEngine.js";

import runCryptoMarketStructureEngine
  from "../analysis/cryptoMarketStructureEngine.js";

import runCryptoLiquidityEngine
  from "../analysis/cryptoLiquidityEngine.js";

import {
  buildCryptoMeasurement,
} from "./cryptoMeasurementProvider.js";

import runCryptoOnChainEngine
  from "../analysis/cryptoOnChainEngine.js";

import runCryptoSocialNarrativeEngine
  from "../analysis/cryptoSocialNarrativeEngine.js";

import runCryptoEventIntelligenceEngine
  from "../analysis/cryptoEventIntelligenceEngine.js";

import runCryptoNewsIntelligenceEngine
  from "../analysis/cryptoNewsIntelligenceEngine.js";

import runCryptoRiskEngine
  from "../analysis/cryptoRiskEngine.js";

import runCryptoFundamentalEngine
  from "../analysis/cryptoFundamentalEngine.js";

import {
  getCryptoFundamentalEvidence,
} from "../data/providers/cryptoFundamentalEvidenceProvider.js";

import {
  getCryptoGptIntelligence,
} from "../intelligence/cryptoGptIntelligenceProvider.js";


import {
  buildOnChainSupportingIntelligenceFromEvidence,
} from "../research/cryptoSupportingIntelligenceContext.js";


const NEUTRAL_SCORE =
  50;


function finite(
  value,
  fallback = null,
) {
  const number =
    Number(value);

  return Number.isFinite(number)
    ? number
    : fallback;
}


function clamp(
  value,
  minimum = 0,
  maximum = 100,
) {
  const number =
    finite(
      value,
      minimum,
    );

  return Math.min(
    maximum,
    Math.max(
      minimum,
      number,
    ),
  );
}


function clone(
  value,
) {
  if (
    value === undefined
  ) {
    return undefined;
  }

  return JSON.parse(
    JSON.stringify(value),
  );
}


function normalizeDirection(
  value,
) {
  const normalized =
    String(
      value ?? "",
    )
      .trim()
      .toUpperCase();

  if (
    normalized === "SHORT"
  ) {
    return "SHORT";
  }

  return "LONG";
}


function engineIsAvailable(
  result,
) {
  return Boolean(
    result &&
    result
      ?.approved === true &&
    String(
      result
        ?.status ??
      "",
    )
      .toUpperCase() ===
      "COMPLETE" &&
    Number.isFinite(
      Number(
        result
          ?.score,
      ),
    ),
  );
}


function scannerConfidence(
  engineConfidence,
) {
  if (
    engineConfidence === null ||
    engineConfidence === undefined ||
    engineConfidence === ""
  ) {
    return 0;
  }

  const value =
    finite(
      engineConfidence,
      null,
    );

  if (value === null) {
    return 0;
  }

  /**
   * Analysis engines may expose confidence either as:
   * - normalized 0..1
   * - scanner-native 0..100
   *
   * Confidence is evidence certainty. It must never be derived
   * from the engine score.
   */
  if (
    value >= 0 &&
    value <= 1
  ) {
    return clamp(
      value * 100,
    );
  }

  return clamp(
    value,
  );
}


function evidenceConfidence(
  result,
) {
  const candidates = [
    result?.evidenceConfidence,
    result?.sourceConfidence,
    result?.providerConfidence,
    result?.evidence?.confidence,
    result?.evidence?.evidenceConfidence,
    result?.evidence?.sourceConfidence,
    result?.evidence?.providerConfidence,
    result?.evidence?.intelligence?.confidence,
    result?.evidence?.finalIntelligence?.confidence,
  ];

  for (const candidate of candidates) {
    if (
      candidate !== null &&
      candidate !== undefined &&
      candidate !== "" &&
      Number.isFinite(Number(candidate))
    ) {
      return scannerConfidence(candidate);
    }
  }

  return scannerConfidence(
    result?.confidence,
  );
}


function unavailableResult({
  source,
  reason,
  evidence = {},
} = {}) {
  return {
    approved:
      true,

    status:
      "EVIDENCE_UNAVAILABLE",

    score:
      NEUTRAL_SCORE,

    confidence:
      0,

    coverage:
      0,

    evidenceCoverage:
      0,

    direction:
      "NEUTRAL",

    directionStrength:
      null,

    bullishStrength:
      null,

    bearishStrength:
      null,

    directionalCoverage:
      0,

    availability: {
      available:
        false,

      source:
        source ??
        null,

      reason:
        reason ??
        "EVIDENCE_UNAVAILABLE",

      evidenceCount:
        0,
    },

    summary:
      null,

    evidence:
      [
        {
          source:
            source ??
            null,

          available:
            false,

          details:
            clone(
              evidence,
            ),
        },
      ],

    warnings: [
      reason ??
      "EVIDENCE_UNAVAILABLE",
    ],

    errors:
      [],
  };
}


function normalizeAnalysisEngineResult({
  source,
  result,
} = {}) {
  if (
    !engineIsAvailable(
      result,
    )
  ) {
    return unavailableResult({
      source,

      reason:
        result
          ?.warnings
          ?.[0] ??
        result
          ?.status ??
        "EVIDENCE_UNAVAILABLE",

      evidence:
        result
          ?.evidence ??
        {},
    });
  }

  const evidenceObject =
    result
      ?.evidence &&
    typeof result
      .evidence ===
      "object"
      ? result
          .evidence
      : {};

  return {
    approved:
      true,

    status:
      "READY",

    score:
      clamp(
        result
          ?.score,
      ),

    confidence:
      evidenceConfidence(
        result,
      ),

    /*
     * Phase 6.29:
     * Preserve the canonical engine contract required by
     * Qualification 2. These fields must remain top-level;
     * nesting them only inside evidence makes Q2 unable to
     * enforce real coverage and directional requirements.
     */
    coverage:
      result?.coverage ??
      result?.evidenceCoverage ??
      result?.evidence?.coverage ??
      null,

    evidenceCoverage:
      result?.evidenceCoverage ??
      result?.evidence?.evidenceCoverage ??
      null,

    direction:
      result?.direction ??
      "NEUTRAL",

    directionStrength:
      result?.directionStrength ??
      result?.evidence?.directionStrength ??
      null,

    bullishStrength:
      result?.bullishStrength ??
      result?.evidence?.bullishStrength ??
      null,

    bearishStrength:
      result?.bearishStrength ??
      result?.evidence?.bearishStrength ??
      null,

    directionalCoverage:
      result?.directionalCoverage ??
      result?.evidence?.directionalCoverage ??
      null,

    availability: {
      available:
        true,

      source,

      reason:
        null,

      evidenceCount:
        Math.max(
          1,
          Object.keys(
            evidenceObject,
          ).length,
        ),
    },

    summary:
      null,

    evidence: [
      {
        source,

        available:
          true,

        engine:
          result
            ?.engine ??
          source,

        direction:
          result
            ?.direction ??
          null,

        directionalSupport:
          clone(
            result
              ?.directionalSupport,
          ),

        details:
          clone(
            evidenceObject,
          ),
      },
    ],

    q2Contract: {
      phase:
        "6.29",

      topLevelCoveragePreserved:
        true,

      topLevelDirectionalStrengthsPreserved:
        true,

      executionAuthority:
        false,
    },

    warnings:
      Array.isArray(
        result
          ?.warnings,
      )
        ? clone(
            result
              .warnings,
          )
        : [],

    errors:
      Array.isArray(
        result
          ?.errors,
      )
        ? clone(
            result
              .errors,
          )
        : [],
  };
}


function makeAnalysisContext(
  scannerContext = {},
) {
  const asset =
    scannerContext
      ?.asset ??
    null;

  const measurements =
    scannerContext
      ?.measurements ??
    (
      asset
        ? buildCryptoMeasurement(
            asset,
          )
        : {}
    );

  const venueCount =
    finite(
      measurements
        ?.venueCount,
      0,
    );

  const cexCount =
    finite(
      measurements
        ?.cexCount,
      0,
    );

  const dexCount =
    finite(
      measurements
        ?.dexCount,
      0,
    );

  return {
    ...scannerContext,

    asset,

    measurements,

    preferredDirection:
      normalizeDirection(
        scannerContext
          ?.preferredDirection,
      ),

    venues: {
      ...(
        scannerContext
          ?.venues ??
        {}
      ),

      venueCount:
        scannerContext
          ?.venues
          ?.venueCount ??
        venueCount,

      cexCount:
        scannerContext
          ?.venues
          ?.cexCount ??
        cexCount,

      dexCount:
        scannerContext
          ?.venues
          ?.dexCount ??
        dexCount,
    },
  };
}


function combineAvailableResults({
  source,
  results,
  weights,
} = {}) {
  const available =
    results
      .map(
        (
          result,
          index,
        ) => ({
          result,
          weight:
            weights
              ?.[index] ??
            1,
        }),
      )
      .filter(
        item =>
          item
            .result
            ?.availability
            ?.available ===
          true,
      );

  if (
    available.length ===
    0
  ) {
    return unavailableResult({
      source,

      reason:
        "MOMENTUM_EVIDENCE_UNAVAILABLE",
    });
  }

  const totalWeight =
    available.reduce(
      (
        total,
        item,
      ) =>
        total +
        item.weight,
      0,
    );

  const score =
    available.reduce(
      (
        total,
        item,
      ) =>
        total +
        (
          item
            .result
            .score *
          item
            .weight
        ),
      0,
    ) /
    totalWeight;

  const confidence =
    available.reduce(
      (
        total,
        item,
      ) =>
        total +
        (
          item
            .result
            .confidence *
          item
            .weight
        ),
      0,
    ) /
    totalWeight;

  return {
    approved:
      true,

    status:
      "READY",

    score:
      clamp(
        score,
      ),

    confidence:
      clamp(
        confidence,
      ),

    availability: {
      available:
        true,

      source,

      reason:
        null,

      evidenceCount:
        available.reduce(
          (
            total,
            item,
          ) =>
            total +
            (
              item
                .result
                ?.availability
                ?.evidenceCount ??
              0
            ),
          0,
        ),
    },

    summary:
      null,

    evidence:
      available.flatMap(
        item =>
          item
            .result
            ?.evidence ??
          [],
      ),

    warnings:
      results.flatMap(
        result =>
          result
            ?.warnings ??
          [],
      ),

    errors:
      results.flatMap(
        result =>
          result
            ?.errors ??
          [],
      ),
  };
}


/**
 * ============================================================
 * TECHNICAL PILLAR ADAPTER — Phase 6.8
 * ============================================================
 *
 * Technical is now a first-class 20% Deep Research pillar.
 * It is deliberately separate from the legacy public Momentum
 * adapter so Deep Research does not count technical evidence twice.
 */
export async function runCryptoScannerTechnical(
  scannerContext = {},
) {
  const context =
    makeAnalysisContext(
      scannerContext,
    );

  const result =
    await runCryptoTechnicalEngine(
      context,
    );

  return normalizeAnalysisEngineResult({
    source:
      "CRYPTO_TECHNICAL",

    result,
  });
}


/**
 * ============================================================
 * FUNDAMENTAL PILLAR ADAPTER — Phase 6.8
 * ============================================================
 *
 * Builds normalized evidence from shared/cached providers, then runs
 * the canonical seven-pillar Fundamental Engine.
 *
 * Missing evidence remains unavailable. No neutral evidence is invented.
 * This adapter has no execution authority.
 */
export async function runCryptoScannerFundamental(
  scannerContext = {},
) {
  const context =
    makeAnalysisContext(
      scannerContext,
    );

  /*
   * Fast-fail before entering the GPT provider when no OpenAI credential is
   * configured. Missing optional GPT evidence must never hold the scanner's
   * critical path open for provider timeout/retry windows.
   */
  const hasOpenAiCredential =
    Boolean(
      String(
        process.env.OPENAI_API_KEY ??
        process.env.OPENAI_API_KEY_CRYPTO ??
        "",
      ).trim(),
    );

  if (!hasOpenAiCredential) {
    return {
      intelligence: null,
      error: "OPENAI_API_KEY_REQUIRED",
      shared: false,
      fastFail: true,
    };
  }

  const asset =
    context?.asset ??
    null;

  if (!asset) {
    return unavailableResult({
      source:
        "CRYPTO_FUNDAMENTAL",

      reason:
        "CRYPTO_ASSET_REQUIRED",
    });
  }

  try {
    const fundamentalEvidence =
      scannerContext?.sharedFundamentalEvidence ??
      await getCryptoFundamentalEvidence(
        asset,
        {
          refresh:
            false,
        },
      );

    const result =
      await runCryptoFundamentalEngine(
        asset,
        {
          fundamentalEvidence,
        },
      );

    if (
      result?.available !== true ||
      !Number.isFinite(
        Number(
          result?.score,
        ),
      )
    ) {
      return unavailableResult({
        source:
          "CRYPTO_FUNDAMENTAL",

        reason:
          result?.status ??
          "FUNDAMENTAL_EVIDENCE_UNAVAILABLE",

        evidence: {
          coverage:
            result?.coverage ??
            0,

          unavailable:
            result?.evidence
              ?.unavailable ??
            [],
        },
      });
    }

    return {
      approved:
        true,

      status:
        "READY",

      score:
        clamp(
          result.score,
        ),

      confidence:
        scannerConfidence(
          result.confidence,
        ),

      availability: {
        available:
          true,

        source:
          "CRYPTO_FUNDAMENTAL",

        reason:
          null,

        evidenceCount:
          Object.values(
            result?.pillars ??
            {},
          )
            .filter(
              pillar =>
                pillar?.available ===
                true,
            )
            .length,
      },

      direction:
        result?.direction ??
        "NEUTRAL",

      directionStrength:
        result?.directionStrength ??
        0,

      bullishStrength:
        result?.bullishStrength ??
        null,

      bearishStrength:
        result?.bearishStrength ??
        null,

      coverage:
        result?.coverage ??
        0,

      pillars:
        clone(
          result?.pillars ??
          {},
        ),

      summary:
        null,

      evidence: [
        {
          source:
            "CRYPTO_FUNDAMENTAL",

          available:
            true,

          engine:
            "CRYPTO_FUNDAMENTAL",

          direction:
            result?.direction ??
            "NEUTRAL",

          details:
            clone(
              result?.evidence ??
              {},
            ),
        },
      ],

      warnings:
        [],

      errors:
        [],

      researchOnly:
        true,

      executionAuthority:
        false,

      liveExecution:
        false,
    };
  } catch (error) {
    return unavailableResult({
      source:
        "CRYPTO_FUNDAMENTAL",

      reason:
        error instanceof Error
          ? `FUNDAMENTAL_ENGINE_FAILED:${error.message}`
          : "FUNDAMENTAL_ENGINE_FAILED",
    });
  }
}


/**
 * ============================================================
 * MOMENTUM ADAPTER
 * ============================================================
 *
 * Public research momentum combines:
 * - Technical Engine
 * - Market Structure Engine
 *
 * Technical is weighted slightly higher because it is the
 * direct price/momentum evidence source.
 */

export async function runCryptoScannerMomentum(
  scannerContext = {},
) {
  const context =
    makeAnalysisContext(
      scannerContext,
    );

  /*
   * Phase 6.23:
   * Prefer canonical/shared results produced earlier in this research cycle.
   * Fall back to engine execution only for callers that do not provide them.
   */
  const sharedTechnical =
    scannerContext
      ?.sharedEngineResults
      ?.technical ??
    null;

  const sharedMarketStructure =
    scannerContext
      ?.sharedEngineResults
      ?.marketStructure ??
    null;

  const technicalNormalized =
    sharedTechnical ??
    normalizeAnalysisEngineResult({
      source:
        "CRYPTO_TECHNICAL",

      result:
        await runCryptoTechnicalEngine(
          context,
        ),
    });

  const structureNormalized =
    sharedMarketStructure ??
    normalizeAnalysisEngineResult({
      source:
        "CRYPTO_MARKET_STRUCTURE",

      result:
        await runCryptoMarketStructureEngine(
          context,
        ),
    });

  return combineAvailableResults({
    source:
      "AEMA_CRYPTO_MOMENTUM_ADAPTER",

    results: [
      technicalNormalized,
      structureNormalized,
    ],

    weights: [
      0.65,
      0.35,
    ],
  });
}


/**
 * ============================================================
 * MARKET STRUCTURE SHARED ADAPTER — Phase 6.23
 * ============================================================
 *
 * Exposed so scanner orchestration can execute Market Structure once and
 * share the normalized result with Momentum and Risk.
 */
export async function runCryptoScannerMarketStructure(
  scannerContext = {},
) {
  const context =
    makeAnalysisContext(
      scannerContext,
    );

  const result =
    await runCryptoMarketStructureEngine(
      context,
    );

  return normalizeAnalysisEngineResult({
    source:
      "CRYPTO_MARKET_STRUCTURE",

    result,
  });
}


/**
 * ============================================================
 * LIQUIDITY ADAPTER
 * ============================================================
 */

export async function runCryptoScannerLiquidity(
  scannerContext = {},
) {
  const context =
    makeAnalysisContext(
      scannerContext,
    );

  const result =
    await runCryptoLiquidityEngine(
      context,
    );

  return normalizeAnalysisEngineResult({
    source:
      "CRYPTO_LIQUIDITY",

    result,
  });
}


/**
 * ============================================================
 * ON-CHAIN ADAPTER
 * ============================================================
 *
 * Reuses the existing cached bulk fundamental snapshot and the
 * existing AEMA supporting-intelligence scoring layer.
 *
 * No candidate-specific provider request is introduced here.
 * No evidence is fabricated when fundamental/on-chain data is
 * unavailable.
 */

export async function runCryptoScannerOnChain(
  scannerContext = {},
) {
  const context = makeAnalysisContext(scannerContext);
  const asset = context?.asset ?? null;

  if (!asset) {
    return unavailableResult({
      source: "CRYPTO_ON_CHAIN",
      reason: "CRYPTO_ASSET_REQUIRED",
    });
  }

  let fundamentalEvidence =
    scannerContext?.sharedFundamentalEvidence ??
    context?.sharedFundamentalEvidence ??
    null;

  let evidenceOrigin = fundamentalEvidence
    ? "SHARED_FUNDAMENTAL_EVIDENCE"
    : "PROVIDER_FETCH";

  if (!fundamentalEvidence) {
    try {
      fundamentalEvidence = await getCryptoFundamentalEvidence(
        asset,
        { refresh: false },
      );
    } catch (error) {
      return unavailableResult({
        source: "CRYPTO_ON_CHAIN",
        reason: "FUNDAMENTAL_EVIDENCE_UNAVAILABLE",
        evidence: {
          evidenceOrigin,
          assetId: asset?.assetId ?? asset?.id ?? null,
          symbol: asset?.symbol ?? null,
          error: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }

  let derived;
  try {
    derived =
      buildOnChainSupportingIntelligenceFromEvidence(
        fundamentalEvidence,
      );
  } catch (error) {
    return unavailableResult({
      source: "CRYPTO_ON_CHAIN",
      reason: "ON_CHAIN_EVIDENCE_NORMALIZATION_FAILED",
      evidence: {
        evidenceOrigin,
        assetId: asset?.assetId ?? asset?.id ?? null,
        symbol: asset?.symbol ?? null,
        error: error instanceof Error ? error.message : String(error),
        providerKeys: Object.keys(
          fundamentalEvidence?.providers ?? {},
        ),
      },
    });
  }

  if (!derived?.onChain) {
    return unavailableResult({
      source: "CRYPTO_ON_CHAIN",
      reason:
        derived?.diagnostics?.reason ??
        "APPLICABLE_ON_CHAIN_EVIDENCE_REQUIRED",
      evidence: {
        evidenceOrigin,
        assetId: asset?.assetId ?? asset?.id ?? null,
        symbol: asset?.symbol ?? null,
        fundamentalStatus: fundamentalEvidence?.status ?? null,
        ...clone(derived?.diagnostics ?? {}),
        families: clone(derived?.families ?? {}),
        freshness: clone(derived?.freshness ?? {}),
      },
    });
  }

  let result;
  try {
    result = await runCryptoOnChainEngine(
      context,
      {
        supportingIntelligence: {
          onChain: derived.onChain,
        },
        freshness: derived.freshness,
      },
    );
  } catch (error) {
    return unavailableResult({
      source: "CRYPTO_ON_CHAIN",
      reason: "ON_CHAIN_ENGINE_FAILED",
      evidence: {
        evidenceOrigin,
        assetId: asset?.assetId ?? asset?.id ?? null,
        symbol: asset?.symbol ?? null,
        error: error instanceof Error ? error.message : String(error),
        diagnostics: clone(derived?.diagnostics ?? {}),
        families: clone(derived?.families ?? {}),
      },
    });
  }

  const normalized = normalizeAnalysisEngineResult({
    source: "CRYPTO_ON_CHAIN",
    result,
  });

  /*
   * Preserve provider/family diagnostics even on success so future provider
   * regressions can be diagnosed from a single scanner response.
   */
  normalized.onChainDiagnostics = {
    evidenceOrigin,
    assetId: asset?.assetId ?? asset?.id ?? null,
    symbol: asset?.symbol ?? null,
    ...clone(derived?.diagnostics ?? {}),
    freshness: clone(derived?.freshness ?? {}),
  };

  return normalized;
}

/**
 * ============================================================
 * SHARED GPT INTELLIGENCE
 * ============================================================
 *
 * One cached provider snapshot feeds News, Events and
 * Social/Narrative. The provider performs no execution actions.
 */

async function getScannerGptIntelligence(
  context,
) {
  /**
   * Phase 5.50:
   * Prefer one scan-level GPT intelligence snapshot supplied by
   * the scanner service. Narrative, News and Risk/Event evidence
   * all consume the same immutable research result.
   */
  const sharedIntelligence =
    context
      ?.sharedIntelligence
      ?.gpt ??
    context
      ?.gptIntelligence ??
    null;

  if (sharedIntelligence) {
    return {
      intelligence:
        sharedIntelligence,
      error:
        null,
      shared:
        true,
    };
  }

  /*
   * Scanner-level orchestration passes the same promise to every
   * GPT-backed adapter. Awaiting it here does not create another
   * provider request.
   */
  if (
    context?.sharedIntelligencePromise &&
    typeof context.sharedIntelligencePromise.then ===
      "function"
  ) {
    const shared =
      await context.sharedIntelligencePromise;

    return {
      intelligence:
        shared?.intelligence ??
        null,
      error:
        shared?.error ??
        (
          shared?.approved === false
            ? "GPT_INTELLIGENCE_UNAVAILABLE"
            : null
        ),
      shared:
        true,
    };
  }

  const asset =
    context?.asset ??
    null;

  if (!asset) {
    return {
      intelligence:
        null,

      error:
        "CRYPTO_ASSET_REQUIRED",
    };
  }

  try {
    const timeoutMs =
      Math.max(
        1000,
        Number(
          process.env.CRYPTO_GPT_SCANNER_TIMEOUT_MS ??
          45000,
        ) || 45000,
      );

    let timeoutId = null;

    const timeoutPromise =
      new Promise((_, reject) => {
        timeoutId =
          setTimeout(
            () =>
              reject(
                new Error(
                  "GPT_INTELLIGENCE_TIMEOUT",
                ),
              ),
            timeoutMs,
          );
      });

    const intelligence =
      await Promise.race([
        getCryptoGptIntelligence(
          asset,
          {
            refresh:
              false,
          },
        ),
        timeoutPromise,
      ]).finally(() => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
      });

    return {
      intelligence,
      error:
        null,
    };
  } catch (error) {
    return {
      intelligence:
        null,

      error:
        error instanceof Error
          ? error.message
          : String(
              error,
            ),
    };
  }
}


/**
 * ============================================================
 * SOCIAL / NARRATIVE ADAPTER
 * ============================================================
 */

export async function runCryptoScannerNarrative(
  scannerContext = {},
) {
  const context =
    makeAnalysisContext(
      scannerContext,
    );

  const {
    intelligence,
    error,
  } =
    await getScannerGptIntelligence(
      context,
    );

  if (!intelligence) {
    return unavailableResult({
      source:
        "CRYPTO_SOCIAL_NARRATIVE",

      reason:
        error ??
        "GPT_INTELLIGENCE_UNAVAILABLE",
    });
  }

  const result =
    await runCryptoSocialNarrativeEngine(
      context,
      {
        finalIntelligence:
          intelligence,
      },
    );

  return normalizeAnalysisEngineResult({
    source:
      "CRYPTO_SOCIAL_NARRATIVE",

    result,
  });
}


/**
 * ============================================================
 * NEWS ADAPTER
 * ============================================================
 */

export async function runCryptoScannerNews(
  scannerContext = {},
) {
  const context =
    makeAnalysisContext(
      scannerContext,
    );

  const {
    intelligence,
    error,
  } =
    await getScannerGptIntelligence(
      context,
    );

  if (!intelligence) {
    return unavailableResult({
      source:
        "CRYPTO_NEWS_INTELLIGENCE",

      reason:
        error ??
        "GPT_INTELLIGENCE_UNAVAILABLE",
    });
  }

  const result =
    await runCryptoNewsIntelligenceEngine(
      context,
      {
        finalIntelligence:
          intelligence,
      },
    );

  return normalizeAnalysisEngineResult({
    source:
      "CRYPTO_NEWS_INTELLIGENCE",

    result,
  });
}


/**
 * ============================================================
 * EVENT INTELLIGENCE ADAPTER
 * ============================================================
 *
 * This is intentionally exported separately from scanner "risk".
 * Event sentiment is evidence for risk, but it is not equivalent
 * to a complete risk engine. We therefore do not mislabel an
 * event score as a risk score.
 */

export async function runCryptoScannerEvents(
  scannerContext = {},
) {
  const context =
    makeAnalysisContext(
      scannerContext,
    );

  const {
    intelligence,
    error,
  } =
    await getScannerGptIntelligence(
      context,
    );

  if (!intelligence) {
    return unavailableResult({
      source:
        "CRYPTO_EVENT_INTELLIGENCE",

      reason:
        error ??
        "GPT_INTELLIGENCE_UNAVAILABLE",
    });
  }

  const result =
    await runCryptoEventIntelligenceEngine(
      context,
      {
        finalIntelligence:
          intelligence,
      },
    );

  return normalizeAnalysisEngineResult({
    source:
      "CRYPTO_EVENT_INTELLIGENCE",

    result,
  });
}


/**
 * ============================================================
 * RISK ADAPTER
 * ============================================================
 *
 * Events are internal evidence for Risk. They are not exposed as
 * a seventh public scanner engine.
 */

export async function runCryptoScannerRisk(
  scannerContext = {},
) {
  const context =
    makeAnalysisContext(
      scannerContext,
    );

  const {
    intelligence,
    error,
  } =
    await getScannerGptIntelligence(
      context,
    );

  /**
   * Risk may still be computed from deterministic evidence if
   * GPT is unavailable. Missing GPT evidence is never fabricated.
   */
  const sharedLiquidity =
    scannerContext
      ?.sharedEngineResults
      ?.liquidity ??
    null;

  const sharedOnChain =
    scannerContext
      ?.sharedEngineResults
      ?.onChain ??
    null;

  const sharedMarketStructure =
    scannerContext
      ?.sharedEngineResults
      ?.marketStructure ??
    null;

  const [
    liquidity,
    onChain,
    marketStructure,
  ] =
    await Promise.all([
      sharedLiquidity
        ? Promise.resolve(
            sharedLiquidity,
          )
        : runCryptoScannerLiquidity(
            scannerContext,
          ),

      sharedOnChain
        ? Promise.resolve(
            sharedOnChain,
          )
        : runCryptoScannerOnChain(
            scannerContext,
          ),

      sharedMarketStructure
        ? Promise.resolve(
            sharedMarketStructure,
          )
        : runCryptoMarketStructureEngine(
            context,
          ).then(
            result =>
              normalizeAnalysisEngineResult({
                source:
                  "CRYPTO_MARKET_STRUCTURE",

                result,
              }),
          ),
    ]);

  let projectIntegrity =
    context
      ?.supportingIntelligence
      ?.projectIntegrity ??
    context
      ?.projectIntegrity ??
    null;

  /**
   * Preserve the GPT failure as explicit evidence metadata while
   * allowing deterministic risk evidence to continue.
   */
  const finalIntelligence =
    intelligence ?? {
      events: {
        available:
          false,

        score:
          null,

        evidence:
          [],

        warnings: [
          error ??
          "GPT_INTELLIGENCE_UNAVAILABLE",
        ],
      },
    };

  const result =
    await runCryptoRiskEngine(
      context,
      {
        finalIntelligence,

        liquidityResult:
          liquidity,

        onChainResult:
          onChain,

        projectIntegrity,

        marketStructure:
          marketStructure
            ?.availability
            ?.available === true
            ? {
                score:
                  marketStructure
                    ?.score,

                evidence:
                  marketStructure
                    ?.evidence,
              }
            : null,
      },
    );

  return normalizeAnalysisEngineResult({
    source:
      "CRYPTO_RISK",

    result,
  });
}


export default {
  technical:
    runCryptoScannerTechnical,

  fundamental:
    runCryptoScannerFundamental,

  momentum:
    runCryptoScannerMomentum,

  marketStructure:
    runCryptoScannerMarketStructure,

  liquidity:
    runCryptoScannerLiquidity,

  onChain:
    runCryptoScannerOnChain,

  narrative:
    runCryptoScannerNarrative,

  news:
    runCryptoScannerNews,

  risk:
    runCryptoScannerRisk,
};
