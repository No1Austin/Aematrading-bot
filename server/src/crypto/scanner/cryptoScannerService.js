/**
 * ============================================================
 * AEMA CRYPTO
 * CRYPTO TOKEN SCANNER SERVICE
 * Phase 5.32
 * ============================================================
 *
 * Purpose:
 * - accept a crypto symbol, pair, or contract-address query
 * - run the asset through configured research engines
 * - preserve evidence availability explicitly
 * - never fabricate market / on-chain / news data
 * - use neutral midpoint scoring only when evidence is unavailable
 * - aggregate engine results into one research score
 *
 * IMPORTANT:
 * - research only
 * - no execution authority
 * - no live execution
 */

const DEFAULT_NEUTRAL_SCORE = 50;

const DEFAULT_ENGINE_WEIGHTS = {
  momentum: 0.20,
  liquidity: 0.20,
  onChain: 0.18,
  narrative: 0.12,
  news: 0.12,
  risk: 0.18,
};

const ENGINE_KEYS =
  Object.freeze([
    "momentum",
    "liquidity",
    "onChain",
    "narrative",
    "news",
    "risk",
  ]);


function nowIso() {
  return new Date()
    .toISOString();
}


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


function clampScore(
  value,
  fallback = DEFAULT_NEUTRAL_SCORE,
) {
  const number =
    finite(
      value,
      fallback,
    );

  return Math.max(
    0,
    Math.min(
      100,
      number,
    ),
  );
}


function normalizeQuery(
  value,
) {
  return String(
    value ?? "",
  )
    .trim();
}


function normalizeSymbol(
  value,
) {
  return String(
    value ?? "",
  )
    .trim()
    .toUpperCase();
}


function normalizeStatus(
  value,
) {
  return String(
    value ?? "",
  )
    .trim()
    .toUpperCase();
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


function isContractLike(
  query,
) {
  const value =
    normalizeQuery(
      query,
    );

  if (
    !value
  ) {
    return false;
  }

  if (
    /^0x[a-fA-F0-9]{40}$/.test(
      value,
    )
  ) {
    return true;
  }

  if (
    value.length >= 32 &&
    !/\s/.test(value)
  ) {
    return true;
  }

  return false;
}


function inferSymbol(
  query,
) {
  const normalized =
    normalizeQuery(
      query,
    );

  if (
    !normalized
  ) {
    return "";
  }

  if (
    isContractLike(
      normalized,
    )
  ) {
    return normalized;
  }

  return normalizeSymbol(
    normalized
      .replace(
        /[^A-Za-z0-9/_-]/g,
        "",
      ),
  );
}


function availabilityRecord({
  available = false,
  source = null,
  reason = null,
  evidenceCount = 0,
} = {}) {
  return {
    available:
      Boolean(
        available,
      ),

    source:
      source ??
      null,

    reason:
      reason ??
      (
        available
          ? null
          : "EVIDENCE_UNAVAILABLE"
      ),

    evidenceCount:
      Math.max(
        0,
        Number(
          evidenceCount,
        ) || 0,
      ),
  };
}


function unavailableEngineResult({
  key,
  reason =
    "ENGINE_NOT_CONFIGURED",
} = {}) {
  return {
    key,

    approved:
      true,

    status:
      "EVIDENCE_UNAVAILABLE",

    score:
      DEFAULT_NEUTRAL_SCORE,

    availability:
      availabilityRecord({
        available:
          false,

        reason,

        evidenceCount:
          0,
      }),

    confidence:
      0,

    summary:
      null,

    evidence:
      [],

    warnings: [
      reason,
    ],

    errors:
      [],
  };
}


function normalizeEngineResult({
  key,
  result,
} = {}) {
  if (
    !result ||
    typeof result !==
      "object"
  ) {
    return unavailableEngineResult({
      key,
      reason:
        "ENGINE_RETURNED_NO_RESULT",
    });
  }

  const available =
    result
      ?.availability
      ?.available === true ||
    result
      ?.available === true ||
    normalizeStatus(
      result
        ?.status,
    ) ===
      "READY";

  const score =
    available
      ? clampScore(
          result
            ?.score,
        )
      : DEFAULT_NEUTRAL_SCORE;

  return {
    key,

    approved:
      result
        ?.approved !== false,

    status:
      available
        ? (
            result
              ?.status ??
            "READY"
          )
        : "EVIDENCE_UNAVAILABLE",

    score,

    availability:
      availabilityRecord({
        available,

        source:
          result
            ?.availability
            ?.source ??
          result
            ?.source ??
          null,

        reason:
          available
            ? null
            : (
                result
                  ?.availability
                  ?.reason ??
                result
                  ?.blocker ??
                result
                  ?.reason ??
                "EVIDENCE_UNAVAILABLE"
              ),

        evidenceCount:
          result
            ?.availability
            ?.evidenceCount ??
          result
            ?.evidence
            ?.length ??
          0,
      }),

    confidence:
      available
        ? clampScore(
            result
              ?.confidence ??
            0,
            0,
          )
        : 0,

    summary:
      result
        ?.summary ??
      null,

    evidence:
      Array.isArray(
        result
          ?.evidence,
      )
        ? clone(
            result
              .evidence,
          )
        : [],

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


function normalizeWeights(
  weights = {},
) {
  const output = {};

  let total =
    0;

  for (
    const key
    of ENGINE_KEYS
  ) {
    const weight =
      Math.max(
        0,
        finite(
          weights
            ?.[key],
          DEFAULT_ENGINE_WEIGHTS[
            key
          ],
        ),
      );

    output[
      key
    ] =
      weight;

    total +=
      weight;
  }

  if (
    total <= 0
  ) {
    return {
      ...DEFAULT_ENGINE_WEIGHTS,
    };
  }

  for (
    const key
    of ENGINE_KEYS
  ) {
    output[
      key
    ] =
      output[
        key
      ] / total;
  }

  return output;
}


function aggregateScores({
  engines,
  weights,
} = {}) {
  let weightedScore =
    0;

  let weightedAvailableScore =
    0;

  let availableWeight =
    0;

  let availableCount =
    0;

  for (
    const key
    of ENGINE_KEYS
  ) {
    const engine =
      engines
        ?.[key] ??
      unavailableEngineResult({
        key,
      });

    const weight =
      weights
        ?.[key] ??
      0;

    weightedScore +=
      engine.score *
      weight;

    if (
      engine
        ?.availability
        ?.available === true
    ) {
      weightedAvailableScore +=
        engine.score *
        weight;

      availableWeight +=
        weight;

      availableCount +=
        1;
    }
  }

  const evidenceAdjustedScore =
    availableWeight > 0
      ? (
          weightedAvailableScore /
          availableWeight
        )
      : DEFAULT_NEUTRAL_SCORE;

  return {
    overallScore:
      clampScore(
        weightedScore,
      ),

    evidenceAdjustedScore:
      clampScore(
        evidenceAdjustedScore,
      ),

    availableEngineCount:
      availableCount,

    totalEngineCount:
      ENGINE_KEYS.length,

    availableWeight:
      Number(
        availableWeight
          .toFixed(6),
      ),
  };
}


function classifyBias(
  score,
) {
  if (
    score >= 70
  ) {
    return "BULLISH";
  }

  if (
    score <= 40
  ) {
    return "BEARISH";
  }

  return "NEUTRAL";
}


function classifyConfidence({
  availableEngineCount,
  averageConfidence,
} = {}) {
  if (
    availableEngineCount >= 5 &&
    averageConfidence >= 70
  ) {
    return "HIGH";
  }

  if (
    availableEngineCount >= 3 &&
    averageConfidence >= 40
  ) {
    return "MODERATE";
  }

  return "LOW";
}


async function safelyRunEngine({
  key,
  engine,
  context,
} = {}) {
  if (
    typeof engine !==
      "function"
  ) {
    return unavailableEngineResult({
      key,
      reason:
        "ENGINE_NOT_CONFIGURED",
    });
  }

  try {
    const result =
      await engine(
        context,
      );

    return normalizeEngineResult({
      key,
      result,
    });
  } catch (error) {
    return unavailableEngineResult({
      key,

      reason:
        error instanceof Error
          ? `ENGINE_FAILED:${error.message}`
          : "ENGINE_FAILED",
    });
  }
}


export function createCryptoScannerService({
  engines = {},
  engineWeights =
    DEFAULT_ENGINE_WEIGHTS,
  resolveAsset = null,
  resolveMarketContext = null,
} = {}) {
  const weights =
    normalizeWeights(
      engineWeights,
    );


  async function resolveContext({
    query,
  } = {}) {
    let asset =
      null;

    let market =
      null;

    if (
      typeof resolveAsset ===
      "function"
    ) {
      try {
        asset =
          await resolveAsset({
            query,
          });
      } catch {
        asset =
          null;
      }
    }

    if (
      typeof resolveMarketContext ===
      "function"
    ) {
      try {
        market =
          await resolveMarketContext({
            query,
            asset,
          });
      } catch {
        market =
          null;
      }
    }

    const symbol =
      normalizeSymbol(
        asset
          ?.symbol ??
        market
          ?.symbol ??
        inferSymbol(
          query,
        ),
      );

    return {
      query,

      symbol,

      asset:
        clone(
          asset,
        ),

      market:
        clone(
          market,
        ),

      marketType:
        market
          ?.type ??
        asset
          ?.marketType ??
        (
          isContractLike(
            query,
          )
            ? "DEX"
            : "UNKNOWN"
        ),

      venue:
        market
          ?.venue ??
        asset
          ?.venue ??
        null,

      requestedAt:
        nowIso(),
    };
  }


  async function scan({
    query,
    metadata = {},
  } = {}) {
    const normalizedQuery =
      normalizeQuery(
        query,
      );

    if (
      !normalizedQuery
    ) {
      return {
        approved:
          false,

        status:
          "CRYPTO_SCAN_REJECTED",

        blocker:
          "QUERY_REQUIRED",

        executionAuthority:
          false,

        liveExecution:
          false,
      };
    }

    const context =
      await resolveContext({
        query:
          normalizedQuery,
      });

    const entries =
      await Promise.all(
        ENGINE_KEYS.map(
          async key => [
            key,
            await safelyRunEngine({
              key,

              engine:
                engines
                  ?.[key],

              context: {
                ...context,

                metadata:
                  clone(
                    metadata,
                  ),
              },
            }),
          ],
        ),
      );

    const engineResults =
      Object.fromEntries(
        entries,
      );

    const aggregate =
      aggregateScores({
        engines:
          engineResults,

        weights,
      });

    const availableConfidences =
      ENGINE_KEYS
        .map(
          key =>
            engineResults[
              key
            ],
        )
        .filter(
          engine =>
            engine
              ?.availability
              ?.available ===
            true,
        )
        .map(
          engine =>
            finite(
              engine
                ?.confidence,
              0,
            ),
        );

    const averageConfidence =
      availableConfidences
        .length > 0
        ? (
            availableConfidences
              .reduce(
                (
                  total,
                  value,
                ) =>
                  total +
                  value,
                0,
              ) /
            availableConfidences
              .length
          )
        : 0;

    const completeness =
      (
        aggregate
          .availableEngineCount /
        aggregate
          .totalEngineCount
      ) * 100;

    const overallScore =
      aggregate
        .overallScore;

    return {
      approved:
        true,

      status:
        "CRYPTO_SCAN_COMPLETE",

      timestamp:
        nowIso(),

      query:
        normalizedQuery,

      symbol:
        context
          .symbol,

      asset:
        context
          .asset,

      market:
        context
          .market,

      marketType:
        context
          .marketType,

      venue:
        context
          .venue,

      overallScore,

      evidenceAdjustedScore:
        aggregate
          .evidenceAdjustedScore,

      bias:
        classifyBias(
          overallScore,
        ),

      confidence:
        classifyConfidence({
          availableEngineCount:
            aggregate
              .availableEngineCount,

          averageConfidence,
        }),

      confidenceScore:
        Number(
          averageConfidence
            .toFixed(2),
        ),

      engines:
        engineResults,

      weights,

      availability: {
        status:
          aggregate
            .availableEngineCount ===
          aggregate
            .totalEngineCount
            ? "COMPLETE"
            : aggregate
                .availableEngineCount >
              0
              ? "PARTIAL"
              : "UNAVAILABLE",

        availableEngineCount:
          aggregate
            .availableEngineCount,

        totalEngineCount:
          aggregate
            .totalEngineCount,

        completeness:
          Number(
            completeness
              .toFixed(2),
          ),

        unavailableEngines:
          ENGINE_KEYS.filter(
            key =>
              engineResults[
                key
              ]
                ?.availability
                ?.available !==
              true,
          ),
      },

      warnings:
        ENGINE_KEYS.flatMap(
          key =>
            engineResults[
              key
            ]
              ?.warnings ??
            [],
        ),

      errors:
        ENGINE_KEYS.flatMap(
          key =>
            engineResults[
              key
            ]
              ?.errors ??
            [],
        ),

      paperExecution:
        true,

      liveExecution:
        false,

      executionAuthority:
        false,
    };
  }


  function getCapabilities() {
    return {
      approved:
        true,

      status:
        "CRYPTO_SCANNER_CAPABILITIES_READY",

      engines:
        ENGINE_KEYS.map(
          key => ({
            key,

            configured:
              typeof engines
                ?.[key] ===
              "function",

            weight:
              weights[
                key
              ],
          }),
        ),

      neutralUnavailableScore:
        DEFAULT_NEUTRAL_SCORE,

      paperExecution:
        true,

      liveExecution:
        false,

      executionAuthority:
        false,
    };
  }


  return {
    scan,
    getCapabilities,

    engineKeys: [
      ...ENGINE_KEYS,
    ],

    weights:
      clone(
        weights,
      ),

    paperExecution:
      true,

    liveExecution:
      false,

    executionAuthority:
      false,
  };
}


export default createCryptoScannerService;
