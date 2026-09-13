// client/src/pages/Markets.jsx

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  CheckCircle2,
  CircleDot,
  Clock3,
  ExternalLink,
  Gauge,
  LoaderCircle,
  Newspaper,
  Radar,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

import Sidebar from
  "../components/Sidebar.jsx";

import {
  getMarketNews,
  getMarketOverview,
  getScannerSnapshot,
} from "../services/api.js";

import "./Markets.css";


/* ============================================================
 * 01. BASIC FORMATTERS
 * ============================================================
 */

function numberOrNull(
  value,
) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const number =
    Number(value);

  return Number.isFinite(
    number,
  )
    ? number
    : null;
}

function formatPrice(
  value,
) {
  const number =
    numberOrNull(
      value,
    );

  if (
    number === null
  ) {
    return "—";
  }

  return `$${number.toLocaleString(
    "en-CA",
    {
      minimumFractionDigits:
        2,

      maximumFractionDigits:
        2,
    },
  )}`;
}

function formatPercent(
  value,
) {
  const number =
    numberOrNull(
      value,
    );

  if (
    number === null
  ) {
    return "—";
  }

  return `${number >= 0 ? "+" : ""}${number.toFixed(
    2,
  )}%`;
}

function formatVolume(
  value,
) {
  const number =
    numberOrNull(
      value,
    );

  if (
    number === null
  ) {
    return "—";
  }

  return new Intl.NumberFormat(
    "en-CA",
    {
      notation:
        "compact",

      maximumFractionDigits:
        1,
    },
  ).format(
    number,
  );
}

function normalizeStatusLabel(
  value,
  fallback = null,
) {
  const resolved =
    value ??
    fallback;

  if (
    resolved === null ||
    resolved === undefined ||
    String(
      resolved,
    ).trim() ===
      ""
  ) {
    return "—";
  }

  return String(
    resolved,
  )
    .trim()
    .toUpperCase()
    .replaceAll(
      "_",
      " ",
    );
}


/* ============================================================
 * 02. CANDIDATE NORMALIZATION
 * ============================================================
 */

function normalizeCandidate(
  candidate = {},
) {
  const measurements =
    candidate
      ?.measurements &&
    typeof candidate
      .measurements ===
      "object"
      ? candidate.measurements
      : {};

  const symbol =
    String(
      candidate
        ?.symbol ??
      "",
    )
      .trim()
      .toUpperCase();

  const side =
    candidate
      ?.preferredDirection ??
    candidate
      ?.preferredSide ??
    candidate
      ?.side ??
    candidate
      ?.direction ??
    null;

  const status =
    candidate
      ?.discoveryStatus ??
    candidate
      ?.researchStatus ??
    candidate
      ?.scannerStatus ??
    candidate
      ?.status ??
    candidate
      ?.stage ??
    candidate
      ?.registryStatus ??
    null;

  const researchStatus =
    candidate
      ?.researchStatus ??
    candidate
      ?.research
      ?.status ??
    candidate
      ?.deepResearchResult
      ?.status ??
    null;

  const reason =
    candidate
      ?.reason ??
    candidate
      ?.summary ??
    candidate
      ?.qualificationReason ??
    (
      Array.isArray(
        candidate
          ?.scannerReasons,
      ) &&
      candidate
        .scannerReasons
        .length >
        0
        ? candidate
            .scannerReasons
            .join(
              ", ",
            )
        : null
    ) ??
    (
      Array.isArray(
        candidate
          ?.reasons,
      ) &&
      candidate
        .reasons
        .length >
        0
        ? candidate
            .reasons
            .join(
              ", ",
            )
        : null
    ) ??
    null;

  return {
    symbol,

    name:
      candidate
        ?.name ??
      candidate
        ?.companyName ??
      null,

    score:
      numberOrNull(
        candidate
          ?.scannerScore ??
        candidate
          ?.score ??
        candidate
          ?.preliminaryScore ??
        candidate
          ?.qualificationScore ??
        candidate
          ?.finalScore,
      ),

    qualified:
      candidate
        ?.qualified ===
      true
        ? true
        : candidate
            ?.qualified ===
          false
          ? false
          : null,

    eligible:
      candidate
        ?.eligible ===
      true
        ? true
        : candidate
            ?.eligible ===
          false
          ? false
          : null,

    researchStatus:
      researchStatus
        ? String(
            researchStatus,
          )
            .trim()
            .toUpperCase()
        : null,

    deepScore:
      numberOrNull(
        candidate
          ?.deepScore ??
        candidate
          ?.research
          ?.deepScore ??
        candidate
          ?.researchResult
          ?.deepScore ??
        candidate
          ?.deepResearchResult
          ?.deepScore,
      ),

    raw:
      candidate,

    price:
      numberOrNull(
        candidate
          ?.price ??
        candidate
          ?.lastPrice ??
        candidate
          ?.latestPrice ??
        candidate
          ?.close ??
        measurements
          ?.price,
      ),

    change1h:
      numberOrNull(
        candidate
          ?.change60mPercent ??
        measurements
          ?.change60mPercent,
      ),

    change15m:
      numberOrNull(
        candidate
          ?.change15mPercent ??
        measurements
          ?.change15mPercent,
      ),

    change5m:
      numberOrNull(
        candidate
          ?.change5mPercent ??
        measurements
          ?.change5mPercent,
      ),

    relativeVolume:
      numberOrNull(
        candidate
          ?.relativeVolume ??
        measurements
          ?.relativeVolume,
      ),

    side,

    status,

    directionEdge:
      numberOrNull(
        candidate
          ?.directionEdge,
      ),

    reason,
  };
}


/* ============================================================
 * 03. SCANNER SNAPSHOT EXTRACTION
 * ============================================================
 *
 * FAIL-SAFE CONTRACT
 * ------------------
 *
 * The current backend snapshot shape is:
 *
 * {
 *   scanner: {
 *     lastResult: {
 *       watchlistCandidates,
 *       scannerCandidates,
 *       selectedCandidates,
 *       candidates
 *     }
 *   },
 *   candidates,
 *   qualifiedCandidates,
 *   researchProgress,
 *   registry
 * }
 *
 * Older builds exposed some of these fields at different nesting
 * levels. The helpers below accept both shapes, but always prefer
 * the current public API fields first.
 *
 * IMPORTANT:
 *
 * - candidates              = public market watchlist
 * - qualifiedCandidates     = strict scanner-qualified subset
 * - researchProgress        = deep-research queue / results
 * - selectedCandidates      = deep-research selection, NOT the
 *                              public watchlist
 */

function asArray(
  value,
) {
  return Array.isArray(
    value,
  )
    ? value
    : [];
}

function firstNonEmptyArray(
  values,
) {
  for (
    const value
    of values
  ) {
    if (
      Array.isArray(
        value,
      ) &&
      value.length >
        0
    ) {
      return value;
    }
  }

  return [];
}

function normalizeSymbolKey(
  value,
) {
  return String(
    value ??
    "",
  )
    .trim()
    .toUpperCase();
}

function mergeCandidateArrays(
  arrays,
  limit =
    20,
) {
  const bySymbol =
    new Map();

  for (
    const source
    of arrays
  ) {
    if (
      !Array.isArray(
        source,
      )
    ) {
      continue;
    }

    for (
      const candidate
      of source
    ) {
      const symbol =
        normalizeSymbolKey(
          candidate
            ?.symbol,
        );

      if (
        !symbol
      ) {
        continue;
      }

      const previous =
        bySymbol.get(
          symbol,
        );

      bySymbol.set(
        symbol,
        previous
          ? {
              ...candidate,
              ...previous,
              symbol,
            }
          : {
              ...candidate,
              symbol,
            },
      );
    }
  }

  return [
    ...bySymbol.values(),
  ]
    .sort(
      (
        a,
        b,
      ) => {
        const rankA =
          numberOrNull(
            a?.rank,
          );

        const rankB =
          numberOrNull(
            b?.rank,
          );

        if (
          rankA !==
            null &&
          rankB !==
            null &&
          rankA !==
            rankB
        ) {
          return rankA -
            rankB;
        }

        const scoreA =
          numberOrNull(
            a
              ?.scannerScore ??
            a
              ?.score,
          ) ??
          -Infinity;

        const scoreB =
          numberOrNull(
            b
              ?.scannerScore ??
            b
              ?.score,
          ) ??
          -Infinity;

        return scoreB -
          scoreA;
      },
    )
    .slice(
      0,
      limit,
    );
}

function getLastDiscoveryResult(
  snapshot,
) {
  return (
    snapshot
      ?.scanner
      ?.lastResult ??
    snapshot
      ?.lastResult ??
    snapshot
      ?.data
      ?.scanner
      ?.lastResult ??
    snapshot
      ?.data
      ?.lastResult ??
    snapshot
      ?.snapshot
      ?.scanner
      ?.lastResult ??
    snapshot
      ?.snapshot
      ?.lastResult ??
    null
  );
}

function extractCandidates(
  snapshot,
) {
  const lastResult =
    getLastDiscoveryResult(
      snapshot,
    );

  /**
   * The direct API candidates array is authoritative.
   *
   * If it is absent because an older backend is running, merge the
   * available watchlist/scanner arrays rather than taking
   * selectedCandidates first. selectedCandidates is usually only
   * the strict qualified/deep-research subset.
   */
  const direct =
    firstNonEmptyArray([
      snapshot
        ?.candidates,

      snapshot
        ?.data
        ?.candidates,

      snapshot
        ?.snapshot
        ?.candidates,
    ]);

  const fallback =
    mergeCandidateArrays(
      [
        lastResult
          ?.watchlistCandidates,

        lastResult
          ?.scannerCandidates,

        lastResult
          ?.candidates,

        snapshot
          ?.registry
          ?.candidates,

        lastResult
          ?.selectedCandidates,
      ],
      20,
    );

  const found =
    direct.length >
      0
      ? direct
      : fallback;

  return found
    .map(
      normalizeCandidate,
    )
    .filter(
      candidate =>
        candidate.symbol &&
        candidate.symbol !==
          "UNKNOWN",
    )
    .slice(
      0,
      20,
    );
}

function extractQualifiedCandidates(
  snapshot,
) {
  const lastResult =
    getLastDiscoveryResult(
      snapshot,
    );

  const publicCandidates =
    extractCandidates(
      snapshot,
    );

  const direct =
    firstNonEmptyArray([
      snapshot
        ?.qualifiedCandidates,

      snapshot
        ?.researchProgress
        ?.candidates,

      snapshot
        ?.data
        ?.qualifiedCandidates,

      snapshot
        ?.data
        ?.researchProgress
        ?.candidates,

      snapshot
        ?.snapshot
        ?.qualifiedCandidates,

      snapshot
        ?.snapshot
        ?.researchProgress
        ?.candidates,

      lastResult
        ?.qualifiedCandidates,

      lastResult
        ?.selectedCandidates,
    ]);

  const fallback =
    publicCandidates
      .filter(
        candidate =>
          candidate
            ?.qualified ===
          true,
      )
      .map(
        candidate =>
          candidate.raw ??
          candidate,
      );

  const found =
    direct.length >
      0
      ? direct
      : fallback;

  const bySymbol =
    new Map();

  for (
    const candidate
    of found
  ) {
    const normalized =
      normalizeCandidate(
        candidate,
      );

    if (
      !normalized.symbol ||
      normalized.symbol ===
        "UNKNOWN"
    ) {
      continue;
    }

    bySymbol.set(
      normalized.symbol,
      normalized,
    );
  }

  return [
    ...bySymbol.values(),
  ];
}

function deriveResearchProgressFromCandidates(
  candidates,
) {
  const runningStates =
    new Set([
      "RUNNING",
      "RESEARCHING",
      "IN_PROGRESS",
      "PROCESSING",
    ]);

  const failedStates =
    new Set([
      "ERROR",
      "FAILED",
      "REJECTED",
    ]);

  const running =
    candidates.filter(
      candidate =>
        runningStates.has(
          candidate
            .researchStatus,
        ),
    );

  const queued =
    candidates.filter(
      candidate =>
        candidate
          .researchStatus ===
        "QUEUED",
    );

  const completed =
    candidates.filter(
      candidate =>
        candidate
          .researchStatus ===
        "COMPLETE",
    );

  const failed =
    candidates.filter(
      candidate =>
        failedStates.has(
          candidate
            .researchStatus,
        ),
    );

  return {
    current:
      running[0]
        ?.raw ??
      running[0] ??
      null,

    running:
      running.map(
        candidate =>
          candidate.raw ??
          candidate,
      ),

    queued:
      queued.map(
        candidate =>
          candidate.raw ??
          candidate,
      ),

    completed:
      completed.map(
        candidate =>
          candidate.raw ??
          candidate,
      ),

    failed:
      failed.map(
        candidate =>
          candidate.raw ??
          candidate,
      ),

    candidates:
      candidates.map(
        candidate =>
          candidate.raw ??
          candidate,
      ),

    counts: {
      total:
        candidates.length,

      running:
        running.length,

      queued:
        queued.length,

      completed:
        completed.length,

      failed:
        failed.length,
    },

    derived:
      true,
  };
}

function extractResearchProgress(
  snapshot,
) {
  if (!snapshot) {
    return null;
  }

  const direct =
    snapshot
      ?.researchProgress ??
    snapshot
      ?.data
      ?.researchProgress ??
    snapshot
      ?.snapshot
      ?.researchProgress ??
    getLastDiscoveryResult(
      snapshot,
    )
      ?.researchProgress ??
    null;

  if (
    direct &&
    typeof direct ===
      "object"
  ) {
    return direct;
  }

  /**
   * Fail-soft fallback:
   * If /research-progress is unavailable or an older backend does not
   * publish it, derive queue counts from qualified candidate statuses.
   */
  return deriveResearchProgressFromCandidates(
    extractQualifiedCandidates(
      snapshot,
    ),
  );
}

function extractScannerDiagnostics(
  snapshot,
) {
  if (!snapshot) {
    return {
      status: null,
      active: null,
      runningCycle: null,
      cycleCount: null,
      universe: null,
      warmed: null,
      measured: null,
      researchable: null,
      highConviction: null,
      selected: null,
      maximumCandidates: null,
      errors: null,
      warnings: null,
      lastCycleStartedAt: null,
      lastCycleCompletedAt: null,
      nextCycleAt: null,
    };
  }

  const scannerState =
    snapshot
      ?.scanner ??
    snapshot
      ?.data
      ?.scanner ??
    snapshot
      ?.snapshot
      ?.scanner ??
    {};

  const lastResult =
    getLastDiscoveryResult(
      snapshot,
    ) ??
    {};

  const marketData =
    lastResult
      ?.marketData ??
    {};

  const scannerResult =
    lastResult
      ?.scanner ??
    {};

  const publicCandidates =
    extractCandidates(
      snapshot,
    );

  const qualifiedCandidates =
    extractQualifiedCandidates(
      snapshot,
    );

  const selectedCandidates =
    asArray(
      lastResult
        ?.selectedCandidates,
    );

  return {
    status:
      scannerState
        ?.status ??
      lastResult
        ?.status ??
      snapshot
        ?.status ??
      null,

    active:
      typeof scannerState
        ?.active ===
      "boolean"
        ? scannerState.active
        : null,

    runningCycle:
      typeof scannerState
        ?.runningCycle ===
      "boolean"
        ? scannerState.runningCycle
        : null,

    cycleCount:
      numberOrNull(
        scannerState
          ?.cycleCount,
      ),

    universe:
      numberOrNull(
        lastResult
          ?.universe
          ?.assetCount ??
        marketData
          ?.assetsRequested ??
        snapshot
          ?.universe
          ?.assetCount,
      ),

    warmed:
      numberOrNull(
        marketData
          ?.warmed,
      ),

    measured:
      numberOrNull(
        lastResult
          ?.measurements
          ?.built ??
        marketData
          ?.measured,
      ),

    researchable:
      numberOrNull(
        scannerResult
          ?.researchable ??
        marketData
          ?.researchable,
      ) ??
      (
        publicCandidates.length >
        0
          ? publicCandidates.length
          : null
      ),

    highConviction:
      numberOrNull(
        scannerResult
          ?.qualified ??
        marketData
          ?.qualified,
      ) ??
      (
        qualifiedCandidates.length >
        0
          ? qualifiedCandidates.length
          : null
      ),

    selected:
      lastResult
        ?.selectedCandidates
        ? selectedCandidates.length
        : null,

    maximumCandidates:
      numberOrNull(
        scannerState
          ?.discoveryOptions
          ?.maximumCandidates,
      ),

    errors:
      Array.isArray(
        lastResult
          ?.errors,
      )
        ? lastResult.errors.length
        : null,

    warnings:
      Array.isArray(
        lastResult
          ?.warnings,
      )
        ? lastResult.warnings.length
        : null,

    lastCycleStartedAt:
      scannerState
        ?.lastCycleStartedAt ??
      null,

    lastCycleCompletedAt:
      scannerState
        ?.lastCycleCompletedAt ??
      null,

    nextCycleAt:
      scannerState
        ?.nextCycleAt ??
      null,
  };
}


/* ============================================================
 * 04. RESEARCH ENGINE HELPERS
 * ============================================================
 */

function getFinalDecision(
  candidate,
) {
  const raw =
    candidate
      ?.raw ??
    candidate ??
    {};

  return (
    raw
      ?.research
      ?.analysis
      ?.finalDecision ??
    raw
      ?.research
      ?.finalDecision ??
    raw
      ?.researchResult
      ?.analysis
      ?.finalDecision ??
    raw
      ?.researchResult
      ?.finalDecision ??
    raw
      ?.analysis
      ?.finalDecision ??
    raw
      ?.finalDecision ??
    null
  );
}

function getEngineScore(
  candidate,
) {
  const decision =
    getFinalDecision(
      candidate,
    );

  return numberOrNull(
    decision
      ?.preferredScore ??
    candidate
      ?.deepScore,
  );
}

function researchStatusIcon(
  status,
) {
  const normalized =
    String(
      status ??
      "",
    )
      .trim()
      .toUpperCase();

  if (
    normalized ===
    "COMPLETE"
  ) {
    return CheckCircle2;
  }

  if (
    [
      "RUNNING",
      "RESEARCHING",
      "IN_PROGRESS",
      "PROCESSING",
    ].includes(
      normalized,
    )
  ) {
    return LoaderCircle;
  }

  return CircleDot;
}


/* ============================================================
 * 05. SESSION / NEWS HELPERS
 * ============================================================
 */

function deriveMarketSessionLabel(
  overview,
) {
  const timestamp =
    overview
      ?.gainers?.[0]
      ?.dailyTimestamp ??
    overview
      ?.losers?.[0]
      ?.dailyTimestamp ??
    null;

  if (!timestamp) {
    return "MARKET DATA";
  }

  const date =
    new Date(
      timestamp,
    );

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return "MARKET DATA";
  }

  return `LAST SESSION · ${date.toLocaleDateString(
    undefined,
    {
      month:
        "short",

      day:
        "numeric",
    },
  )}`;
}

function formatNewsAge(
  timestamp,
) {
  if (!timestamp) {
    return "Unknown";
  }

  const created =
    new Date(
      timestamp,
    );

  const difference =
    Date.now() -
    created.getTime();

  if (
    !Number.isFinite(
      difference,
    )
  ) {
    return "Unknown";
  }

  const minutes =
    Math.floor(
      difference /
      60_000,
    );

  if (
    minutes < 1
  ) {
    return "Just now";
  }

  if (
    minutes < 60
  ) {
    return `${minutes}m`;
  }

  const hours =
    Math.floor(
      minutes / 60,
    );

  if (
    hours < 24
  ) {
    return `${hours}h`;
  }

  return `${Math.floor(
    hours / 24,
  )}d`;
}


/* ============================================================
 * 06. SECTION TITLE
 * ============================================================
 */

function SectionTitle({
  icon: Icon,
  eyebrow,
  title,
  subtitle,
  action,
}) {
  return (
    <div className="markets-section-title">
      <div className="markets-section-copy">
        {eyebrow && (
          <span className="markets-section-eyebrow">
            {eyebrow}
          </span>
        )}

        <div className="markets-title-row">
          <span className="markets-title-icon">
            <Icon
              size={16}
              strokeWidth={2.1}
            />
          </span>

          <h2>
            {title}
          </h2>
        </div>

        <p>
          {subtitle}
        </p>
      </div>

      {action}
    </div>
  );
}


/* ============================================================
 * 07. RESEARCH POOL - DESKTOP TABLE
 * ============================================================
 */

function CandidateTable({
  candidates,
  loading,
}) {
  if (loading) {
    return (
      <div className="markets-empty markets-loading-state">
        <span className="markets-inline-loader" />

        <strong>
          Updating research pool
        </strong>

        <span>
          Reading the latest market discovery snapshot...
        </span>
      </div>
    );
  }

  if (
    !candidates.length
  ) {
    return (
      <div className="markets-empty markets-empty-pool">
        <span className="markets-empty-icon">
          <Radar size={22} />
        </span>

        <strong>
          No current market-watch candidates
        </strong>

        <span>
          The latest scanner snapshot does not currently contain a public watchlist. Existing qualified research results remain available in the research pipeline when present.
        </span>
      </div>
    );
  }

  return (
    <>
      <div className="markets-table-wrap">
        <table className="markets-table">
          <thead>
            <tr>
              <th>
                Symbol
              </th>

              <th>
                Price
              </th>

              <th>
                1H
              </th>

              <th>
                Discovery
              </th>

              <th>
                Bias
              </th>

              <th>
                Qualification
              </th>

              <th>
                Why watched
              </th>
            </tr>
          </thead>

          <tbody>
            {candidates.map(
              candidate => (
                <tr
                  key={
                    candidate.symbol
                  }
                >
                  <td>
                    <div className="market-symbol-cell">
                      <strong>
                        {candidate.symbol}
                      </strong>

                      <span>
                        {candidate.name ??
                          "—"}
                      </span>
                    </div>
                  </td>

                  <td className="market-number-cell">
                    {formatPrice(
                      candidate.price,
                    )}
                  </td>

                  <td
                    className={`market-number-cell ${
                      candidate.change1h ===
                      null
                        ? ""
                        : candidate.change1h >=
                            0
                          ? "market-positive"
                          : "market-negative"
                    }`}
                  >
                    {formatPercent(
                      candidate.change1h,
                    )}
                  </td>

                  <td>
                    <div className="market-score-cell">
                      <strong>
                        {candidate.score ===
                        null
                          ? "—"
                          : candidate.score.toFixed(
                              1,
                            )}
                      </strong>

                      <span>
                        /100
                      </span>
                    </div>
                  </td>

                  <td>
                    <span
                      className={`market-chip ${
                        String(
                          candidate.side,
                        )
                          .toUpperCase()
                          .includes(
                            "SHORT",
                          )
                          ? "bearish"
                          : String(
                                candidate.side,
                              )
                              .toUpperCase()
                              .includes(
                                "LONG",
                              )
                            ? "bullish"
                            : "neutral"
                      }`}
                    >
                      {normalizeStatusLabel(
                        candidate.side,
                        "WATCH",
                      )}
                    </span>
                  </td>

                  <td>
                    <span
                      className={`market-status ${
                        candidate.qualified
                          ? "strong"
                          : "researchable"
                      }`}
                    >
                      {candidate.qualified ===
                        true
                          ? "QUALIFIED"
                          : candidate.qualified ===
                              false
                            ? "REJECTED"
                            : "—"}
                    </span>
                  </td>

                  <td>
                    <span className="why-monitored">
                      {candidate.reason ??
                        "—"}
                    </span>
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>

      <div className="market-candidate-mobile-list">
        {candidates.map(
          candidate => (
            <article
              className="market-candidate-mobile-card"
              key={
                candidate.symbol
              }
            >
              <div className="market-candidate-mobile-top">
                <div>
                  <div className="market-candidate-symbol-row">
                    <strong>
                      {candidate.symbol}
                    </strong>

                    <span
                      className={`market-chip ${
                        String(
                          candidate.side,
                        )
                          .toUpperCase()
                          .includes(
                            "SHORT",
                          )
                          ? "bearish"
                          : String(
                                candidate.side,
                              )
                              .toUpperCase()
                              .includes(
                                "LONG",
                              )
                            ? "bullish"
                            : "neutral"
                      }`}
                    >
                      {normalizeStatusLabel(
                        candidate.side,
                        "WATCH",
                      )}
                    </span>
                  </div>

                  <span className="market-candidate-name">
                    {candidate.name ??
                      "—"}
                  </span>
                </div>

                <div className="market-candidate-mobile-price">
                  <strong>
                    {formatPrice(
                      candidate.price,
                    )}
                  </strong>

                  <span
                    className={
                      candidate.change1h ===
                      null
                        ? ""
                        : candidate.change1h >=
                            0
                          ? "market-positive"
                          : "market-negative"
                    }
                  >
                    {formatPercent(
                      candidate.change1h,
                    )}
                  </span>
                </div>
              </div>

              <div className="market-candidate-mobile-metrics">
                <div>
                  <span>
                    Discovery
                  </span>

                  <strong>
                    {candidate.score ===
                    null
                      ? "—"
                      : candidate.score.toFixed(
                          1,
                        )}
                  </strong>
                </div>

                <div>
                  <span>
                    Edge
                  </span>

                  <strong>
                    {candidate.directionEdge ===
                    null
                      ? "—"
                      : candidate.directionEdge.toFixed(
                          1,
                        )}
                  </strong>
                </div>

                <div>
                  <span>
                    Qualification
                  </span>

                  <strong>
                    {candidate.qualified ===
                    true
                      ? "QUALIFIED"
                      : candidate.qualified ===
                          false
                        ? "REJECTED"
                        : "—"}
                  </strong>
                </div>
              </div>

              <p className="market-candidate-mobile-reason">
                {candidate.reason ??
                  "—"}
              </p>
            </article>
          ),
        )}
      </div>
    </>
  );
}


/* ============================================================
 * 08. QUALIFIED / DEEP RESEARCH PANEL
 * ============================================================
 */

function QualifiedPanel({
  candidates,
  progress,
  loading,
}) {
  const currentSymbol =
    progress
      ?.current
      ?.symbol ??
    null;

  return (
    <section className="market-card qualified-card">
      <SectionTitle
        icon={ShieldCheck}
        eyebrow="Deep research queue"
        title="Research Pipeline"
        subtitle="Scanner-selected candidates moving through the deeper research engines."
        action={
          <span className="monitored-count">
            {candidates.length}
          </span>
        }
      />

      {loading ? (
        <div className="markets-empty">
          Updating research queue...
        </div>
      ) : candidates.length ===
        0 ? (
        <div className="markets-empty">
          No deep-research candidates are available yet.
        </div>
      ) : (
        <div className="qualified-list">
          {candidates.map(
            (
              candidate,
              index,
            ) => {
              const StatusIcon =
                researchStatusIcon(
                  candidate
                    .researchStatus,
                );

              const isCurrent =
                candidate
                  .symbol ===
                currentSymbol;

              const engineScore =
                getEngineScore(
                  candidate,
                );

              return (
                <div
                  className={`qualified-row ${
                    isCurrent
                      ? "is-current"
                      : ""
                  }`}
                  key={
                    candidate.symbol
                  }
                >
                  <div className="qualified-rank">
                    {index + 1}
                  </div>

                  <div className="qualified-identity">
                    <strong>
                      {candidate.symbol}
                    </strong>

                    <span>
                      Discovery{" "}
                      {candidate.score ===
                      null
                        ? "—"
                        : candidate.score.toFixed(
                            1,
                          )}
                    </span>
                  </div>

                  <div className="qualified-state">
                    <StatusIcon
                      size={14}
                      className={
                        isCurrent
                          ? "markets-spin"
                          : ""
                      }
                    />

                    <span>
                      {normalizeStatusLabel(
                        candidate
                          .researchStatus,
                      )}
                    </span>
                  </div>

                  <div className="qualified-engine-score">
                    <span>
                      Engine
                    </span>

                    <strong>
                      {engineScore ===
                      null
                        ? "—"
                        : engineScore.toFixed(
                            1,
                          )}
                    </strong>
                  </div>
                </div>
              );
            },
          )}
        </div>
      )}

      <div className="research-queue-summary">
        <span>
          Running{" "}
          <strong>
            {numberOrNull(
              progress
                ?.counts
                ?.running,
            ) ??
              "—"}
          </strong>
        </span>

        <span>
          Queued{" "}
          <strong>
            {numberOrNull(
              progress
                ?.counts
                ?.queued,
            ) ??
              "—"}
          </strong>
        </span>

        <span>
          Complete{" "}
          <strong>
            {numberOrNull(
              progress
                ?.counts
                ?.completed,
            ) ??
              "—"}
          </strong>
        </span>
      </div>
    </section>
  );
}


/* ============================================================
 * 09. ENGINE EVALUATION PANEL
 * ============================================================
 */

function EngineEvaluationPanel({
  qualifiedCandidates,
  progress,
}) {
  const currentRaw =
    progress
      ?.current ??
    null;

  const current =
    currentRaw
      ? normalizeCandidate(
          currentRaw,
        )
      : qualifiedCandidates.find(
          candidate =>
            candidate
              .researchStatus ===
            "COMPLETE",
        ) ??
        qualifiedCandidates[0] ??
        null;

  if (!current) {
    return (
      <section className="market-card engine-market-card">
        <SectionTitle
          icon={BarChart3}
          eyebrow="Deep engines"
          title="Engine Evaluation"
          subtitle="Deep-research output will appear here when a candidate is processed."
        />

        <div className="markets-empty">
          Waiting for research-engine output.
        </div>
      </section>
    );
  }

  const decision =
    getFinalDecision(
      current,
    );

  const preferredScore =
    numberOrNull(
      decision
        ?.preferredScore,
    );

  const minimumRequiredScore =
    numberOrNull(
      decision
        ?.minimumRequiredScore,
    );

  const finalStatus =
    decision
      ?.status ??
    current
      ?.researchStatus ??
    null;

  const finalDecision =
    decision
      ?.decision ??
    null;

  const preferredSide =
    decision
      ?.preferredSide ??
    current
      ?.side ??
    null;

  const reasons =
    Array.isArray(
      decision
        ?.reasons,
    )
      ? decision.reasons
      : [];

  return (
    <section className="market-card engine-market-card">
      <SectionTitle
        icon={Gauge}
        eyebrow="Deep engines"
        title="Engine Evaluation"
        subtitle={
          progress
            ?.current
            ?.symbol
            ? `Currently researching ${progress.current.symbol}`
            : `Latest evaluation: ${current.symbol}`
        }
      />

      <div className="engine-market-head">
        <div>
          <span>
            Symbol
          </span>

          <strong>
            {current.symbol}
          </strong>
        </div>

        <div>
          <span>
            Bias
          </span>

          <strong>
            {normalizeStatusLabel(
              preferredSide,
            )}
          </strong>
        </div>

        <div>
          <span>
            Engine Score
          </span>

          <strong>
            {preferredScore ===
            null
              ? "—"
              : `${preferredScore.toFixed(
                  1,
                )}/100`}
          </strong>
        </div>

        <div>
          <span>
            Threshold
          </span>

          <strong>
            {minimumRequiredScore ===
            null
              ? "—"
              : minimumRequiredScore}
          </strong>
        </div>
      </div>

      <div className="engine-market-result">
        <div>
          <span>
            Decision
          </span>

          <strong>
            {normalizeStatusLabel(
              finalDecision,
            )}
          </strong>
        </div>

        <div>
          <span>
            Status
          </span>

          <strong>
            {normalizeStatusLabel(
              finalStatus,
            )}
          </strong>
        </div>

        <div>
          <span>
            Research
          </span>

          <strong>
            {normalizeStatusLabel(
              current
                .researchStatus,
            )}
          </strong>
        </div>
      </div>

      {reasons.length >
        0 && (
        <div className="engine-market-reasons">
          <span>
            Research rationale
          </span>

          <p>
            {reasons
              .slice(
                0,
                3,
              )
              .join(
                " · ",
              )}
          </p>
        </div>
      )}
    </section>
  );
}


/* ============================================================
 * 10. MOVERS PANEL
 * ============================================================
 */

function MoversPanel({
  title,
  rows,
  type,
  sessionLabel,
}) {
  const isGainer =
    type ===
    "gainer";

  const Icon =
    isGainer
      ? ArrowUpRight
      : ArrowDownRight;

  return (
    <section
      className={`market-card movers-card ${
        isGainer
          ? "gainers-card"
          : "losers-card"
      }`}
    >
      <SectionTitle
        icon={Icon}
        eyebrow={
          isGainer
            ? "Strength"
            : "Weakness"
        }
        title={title}
        subtitle={
          sessionLabel
        }
      />

      <div className="movers-list">
        {rows.length ===
        0 ? (
          <div className="markets-empty">
            No market movers available.
          </div>
        ) : (
          rows.map(
            (
              row,
              index,
            ) => (
              <div
                className="mover-row mover-row-expanded"
                key={
                  row.symbol
                }
              >
                <div className="mover-rank">
                  {index + 1}
                </div>

                <div className="mover-content">
                  <div className="mover-main">
                    <div>
                      <strong>
                        {row.symbol}
                      </strong>

                      <span>
                        {row.name ??
                          ""}
                      </span>
                    </div>

                    <div className="mover-price-block">
                      <strong>
                        {formatPrice(
                          row.price,
                        )}
                      </strong>

                      <span
                        className={
                          isGainer
                            ? "market-positive"
                            : "market-negative"
                        }
                      >
                        {formatPercent(
                          row.changePercent,
                        )}
                      </span>
                    </div>
                  </div>

                  <div className="mover-details">
                    <div>
                      <span>
                        Volume
                      </span>

                      <strong>
                        {formatVolume(
                          row.volume,
                        )}
                      </strong>
                    </div>

                    <div>
                      <span>
                        Prev Close
                      </span>

                      <strong>
                        {formatPrice(
                          row.previousClose,
                        )}
                      </strong>
                    </div>

                    <div>
                      <span>
                        High
                      </span>

                      <strong>
                        {formatPrice(
                          row.dailyHigh,
                        )}
                      </strong>
                    </div>

                    <div>
                      <span>
                        Low
                      </span>

                      <strong>
                        {formatPrice(
                          row.dailyLow,
                        )}
                      </strong>
                    </div>

                    <div>
                      <span>
                        Shortable
                      </span>

                      <strong>
                        {row.shortable
                          ? "YES"
                          : "NO"}
                      </strong>
                    </div>

                    <div>
                      <span>
                        Exchange
                      </span>

                      <strong>
                        {row.exchange ??
                          "—"}
                      </strong>
                    </div>
                  </div>
                </div>
              </div>
            ),
          )
        )}
      </div>
    </section>
  );
}


/* ============================================================
 * 11. NEWS RAIL
 * ============================================================
 */

function NewsRail({
  news,
}) {
  const [
    filter,
    setFilter,
  ] =
    useState(
      "ALL",
    );

  const filteredNews =
    useMemo(
      () => {
        if (
          filter ===
          "ALL"
        ) {
          return news;
        }

        if (
          filter ===
          "EARNINGS"
        ) {
          return news.filter(
            item =>
              `${item.headline ?? ""} ${item.summary ?? ""}`
                .toUpperCase()
                .includes(
                  "EARN",
                ),
          );
        }

        if (
          filter ===
          "MACRO"
        ) {
          return news.filter(
            item => {
              const text =
                `${item.headline ?? ""} ${item.summary ?? ""}`
                  .toUpperCase();

              return (
                text.includes(
                  "FED",
                ) ||
                text.includes(
                  "INFLATION",
                ) ||
                text.includes(
                  "INTEREST RATE",
                ) ||
                text.includes(
                  "GDP",
                ) ||
                text.includes(
                  "ECONOMY",
                ) ||
                text.includes(
                  "JOBS",
                )
              );
            },
          );
        }

        return news;
      },
      [
        news,
        filter,
      ],
    );

  return (
    <aside className="market-news-rail">
      <SectionTitle
        icon={Newspaper}
        eyebrow="Information flow"
        title="Market News"
        subtitle="Recent headlines that may affect equities and market sentiment."
      />

      <div className="news-filter-row">
        {[
          "ALL",
          "EARNINGS",
          "MACRO",
        ].map(
          item => (
            <button
              key={item}
              className={`news-filter ${
                filter ===
                item
                  ? "active"
                  : ""
              }`}
              type="button"
              onClick={() =>
                setFilter(
                  item,
                )
              }
            >
              {item ===
              "ALL"
                ? "All"
                : item ===
                    "EARNINGS"
                  ? "Earnings"
                  : "Macro"}
            </button>
          ),
        )}
      </div>

      <div className="news-list">
        {filteredNews.length ===
        0 ? (
          <div className="markets-empty">
            No matching market news available.
          </div>
        ) : (
          filteredNews.map(
            item => (
              <article
                className="news-item"
                key={
                  item.id
                }
              >
                <div className="news-item-top">
                  <div className="news-symbols">
                    {(
                      item
                        ?.symbols ??
                      []
                    )
                      .slice(
                        0,
                        4,
                      )
                      .map(
                        symbol => (
                          <span
                            className="news-symbol"
                            key={
                              symbol
                            }
                          >
                            {symbol}
                          </span>
                        ),
                      )}
                  </div>

                  <span className="news-tag">
                    {String(
                      item.source ??
                      "—",
                    )
                      .trim()
                      .toUpperCase()}
                  </span>
                </div>

                <h3>
                  {item.headline}
                </h3>

                {item.summary && (
                  <p className="news-summary">
                    {item.summary}
                  </p>
                )}

                <div className="news-meta">
                  <span>
                    {item.author ??
                      item.source ??
                      "—"}
                  </span>

                  <span>
                    <Clock3
                      size={11}
                    />

                    {formatNewsAge(
                      item.createdAt,
                    )}
                  </span>
                </div>

                {item.url && (
                  <a
                    className="news-link"
                    href={
                      item.url
                    }
                    target="_blank"
                    rel="noreferrer"
                  >
                    Read story

                    <ExternalLink
                      size={10}
                    />
                  </a>
                )}
              </article>
            ),
          )
        )}
      </div>
    </aside>
  );
}


/* ============================================================
 * 12. PAGE
 * ============================================================
 */

export default function Markets() {
  const [
    overview,
    setOverview,
  ] =
    useState(
      null,
    );

  const [
    scannerSnapshot,
    setScannerSnapshot,
  ] =
    useState(
      null,
    );

  const [
    marketNews,
    setMarketNews,
  ] =
    useState(
      [],
    );

  const [
    loading,
    setLoading,
  ] =
    useState(
      true,
    );

  const [
    refreshing,
    setRefreshing,
  ] =
    useState(
      false,
    );

  const [
    scannerWarning,
    setScannerWarning,
  ] =
    useState(
      null,
    );

  const requestInFlight =
    useRef(
      false,
    );

  const hasLoadedOnce =
    useRef(
      false,
    );

  const [
    error,
    setError,
  ] =
    useState(
      null,
    );

  const [
    search,
    setSearch,
  ] =
    useState(
      "",
    );

  const monitored =
    useMemo(
      () =>
        extractCandidates(
          scannerSnapshot,
        ),
      [
        scannerSnapshot,
      ],
    );

  const qualifiedCandidates =
    useMemo(
      () =>
        extractQualifiedCandidates(
          scannerSnapshot,
        ),
      [
        scannerSnapshot,
      ],
    );

  const researchProgress =
    useMemo(
      () =>
        extractResearchProgress(
          scannerSnapshot,
        ),
      [
        scannerSnapshot,
      ],
    );

  const diagnostics =
    useMemo(
      () =>
        extractScannerDiagnostics(
          scannerSnapshot,
        ),
      [
        scannerSnapshot,
      ],
    );

  const filtered =
    useMemo(
      () => {
        const query =
          search
            .trim()
            .toUpperCase();

        if (!query) {
          return monitored;
        }

        return monitored.filter(
          item =>
            item.symbol.includes(
              query,
            ) ||
            item.name
              .toUpperCase()
              .includes(
                query,
              ),
        );
      },
      [
        monitored,
        search,
      ],
    );

  const gainers =
    Array.isArray(
      overview
        ?.gainers,
    )
      ? overview.gainers
      : [];

  const losers =
    Array.isArray(
      overview
        ?.losers,
    )
      ? overview.losers
      : [];

  const sessionLabel =
    deriveMarketSessionLabel(
      overview,
    );

  const bullishCount =
    monitored.filter(
      item =>
        String(
          item.side,
        )
          .toUpperCase()
          .includes(
            "LONG",
          ),
    ).length;

  const bearishCount =
    monitored.filter(
      item =>
        String(
          item.side,
        )
          .toUpperCase()
          .includes(
            "SHORT",
          ),
    ).length;

  const loadMarkets =
    useCallback(
      async ({
        manual =
          false,
      } = {}) => {
        /**
         * Prevent overlapping 15-second polls. A slow upstream provider
         * must never create a stack of concurrent market requests.
         */
        if (
          requestInFlight
            .current
        ) {
          return;
        }

        requestInFlight
          .current =
          true;

        if (
          !hasLoadedOnce
            .current
        ) {
          setLoading(
            true,
          );
        } else if (
          manual
        ) {
          setRefreshing(
            true,
          );
        }

        setError(
          null,
        );

        const [
          marketResult,
          scannerResult,
          newsResult,
        ] =
          await Promise.allSettled([
            getMarketOverview(
              10,
            ),

            getScannerSnapshot(
              20,
            ),

            getMarketNews({
              limit:
                20,
            }),
          ]);

        /**
         * Each section is independent.
         *
         * A scanner API failure must not erase market movers/news.
         * A news failure must not erase scanner candidates.
         */
        if (
          marketResult.status ===
          "fulfilled"
        ) {
          setOverview(
            marketResult.value ??
            null,
          );
        }

        if (
          scannerResult.status ===
          "fulfilled"
        ) {
          const nextSnapshot =
            scannerResult.value ??
            null;

          /**
           * Some API helpers resolve HTTP errors instead of throwing.
           * Treat an explicit approved:false payload as a degraded
           * scanner response and preserve the last known-good snapshot.
           */
          if (
            nextSnapshot
              ?.approved ===
            false
          ) {
            setScannerWarning(
              nextSnapshot
                ?.error ??
              "Scanner snapshot is temporarily unavailable.",
            );
          } else {
            setScannerSnapshot(
              nextSnapshot,
            );

            setScannerWarning(
              null,
            );
          }
        } else {
          setScannerWarning(
            scannerResult
              .reason
              ?.message ??
            "Scanner snapshot is temporarily unavailable.",
          );
        }

        if (
          newsResult.status ===
          "fulfilled"
        ) {
          const nextNews =
            newsResult
              .value;

          setMarketNews(
            Array.isArray(
              nextNews
                ?.news,
            )
              ? nextNews.news
              : Array.isArray(
                  nextNews,
                )
                ? nextNews
                : [],
          );
        }

        /**
         * Surface a page-level error only when every independent market
         * source failed. Otherwise keep the functioning sections alive.
         */
        const failures =
          [
            marketResult,
            scannerResult,
            newsResult,
          ].filter(
            result =>
              result.status ===
              "rejected",
          );

        if (
          failures.length ===
          3
        ) {
          setError(
            failures[0]
              ?.reason
              ?.message ??
            "Unable to load market data.",
          );
        }

        hasLoadedOnce
          .current =
          true;

        setLoading(
          false,
        );

        setRefreshing(
          false,
        );

        requestInFlight
          .current =
          false;
      },
      [],
    );

  useEffect(
    () => {
      void loadMarkets();

      /**
       * Polling is intentionally slower than the UI animation cadence.
       * The request-in-flight guard prevents overlap if an upstream call
       * takes longer than the interval.
       */
      const timer =
        setInterval(
          () => {
            void loadMarkets();
          },
          15_000,
        );

      return () =>
        clearInterval(
          timer,
        );
    },
    [
      loadMarkets,
    ],
  );


  return (
    <div className="app-shell">
      <Sidebar />

      <main className="main-content markets-page">
        {/* ===================================================
            HEADER
        ==================================================== */}
        <header className="markets-header">
          <div>
            <div className="markets-kicker">
              <Sparkles
                size={13}
              />

              <span>
                Market intelligence
              </span>
            </div>

            <h1>
              Markets
            </h1>

            <p>
              Discovery candidates, market movers, scanner health,
              deep-research progress, and market-moving headlines.
            </p>
          </div>

          <div className="markets-header-actions">
            <label className="markets-search">
              <Search
                size={15}
              />

              <input
                value={
                  search
                }
                onChange={
                  event =>
                    setSearch(
                      event
                        .target
                        .value,
                    )
                }
                placeholder="Search research pool..."
                aria-label="Search research pool"
              />

              {search && (
                <button
                  type="button"
                  className="markets-search-clear"
                  aria-label="Clear search"
                  onClick={() =>
                    setSearch(
                      "",
                    )
                  }
                >
                  ×
                </button>
              )}
            </label>

            <button
              className="markets-refresh"
              type="button"
              onClick={() =>
                loadMarkets({
                  manual:
                    true,
                })
              }
              disabled={
                loading ||
                refreshing
              }
            >
              <RefreshCw
                size={15}
                className={
                  loading ||
                  refreshing
                    ? "markets-spin"
                    : ""
                }
              />

              <span>
                Refresh
              </span>
            </button>
          </div>
        </header>

        {/* ===================================================
            MARKET / SCANNER HEALTH
        ==================================================== */}
        <section className="market-health-strip">
          <div className="market-health-primary">
            <span className="market-health-icon">
              <Activity
                size={16}
              />
            </span>

            <div>
              <span>
                Discovery scanner
              </span>

              <strong>
                {normalizeStatusLabel(
                  diagnostics.status,
                )}
              </strong>
            </div>

            <span
              className={`market-health-dot ${
                diagnostics.errors ===
                null ||
                diagnostics.errors >
                  0
                  ? "warning"
                  : "healthy"
              }`}
            />
          </div>

          <div className="market-health-stat">
            <span>
              Universe
            </span>

            <strong>
              {numberOrNull(
                diagnostics.universe ??
                overview
                  ?.universe
                  ?.assetCount,
              ) ??
                "—"}
            </strong>
          </div>

          <div className="market-health-stat">
            <span>
              Warmed
            </span>

            <strong>
              {diagnostics.warmed ??
                "—"}
            </strong>
          </div>

          <div className="market-health-stat">
            <span>
              Measured
            </span>

            <strong>
              {diagnostics.measured ??
                "—"}
            </strong>
          </div>

          <div className="market-health-stat">
            <span>
              Selected
            </span>

            <strong>
              {scannerSnapshot
                ? monitored.length
                : "—"}
              <small>
                /{diagnostics.maximumCandidates ??
                  "—"}
              </small>
            </strong>
          </div>
        </section>

        {error && (
          <div className="markets-error">
            <ShieldCheck
              size={15}
            />

            <span>
              {error}
            </span>
          </div>
        )}

        {scannerWarning && (
          <div className="markets-error markets-warning">
            <ShieldCheck
              size={15}
            />

            <span>
              Scanner data is temporarily degraded. Showing the last known-good research state where available.{" "}
              {scannerWarning}
            </span>
          </div>
        )}

        {/* ===================================================
            MAIN GRID
        ==================================================== */}
        <div className="markets-layout">
          <div className="markets-main-column">
            {/* ===============================================
                RESEARCH POOL
            ================================================ */}
            <section className="market-card monitored-card">
              <SectionTitle
                icon={Radar}
                eyebrow="Discovery scanner"
                title="Market Research Pool"
                subtitle="The strongest market-wide candidates currently selected for deeper research."
                action={
                  <div className="monitored-count">
                    <CircleDot
                      size={10}
                    />

                    {scannerSnapshot
                      ? monitored.length
                      : "—"}

                    <span>
                      /{diagnostics.maximumCandidates ??
                        "—"}
                    </span>
                  </div>
                }
              />

              <div className="market-pool-context">
                <div>
                  <TrendingUp
                    size={13}
                  />

                  <span>
                    Bullish bias
                  </span>

                  <strong>
                    {scannerSnapshot
                      ? bullishCount
                      : "—"}
                  </strong>
                </div>

                <div>
                  <TrendingDown
                    size={13}
                  />

                  <span>
                    Bearish bias
                  </span>

                  <strong>
                    {scannerSnapshot
                      ? bearishCount
                      : "—"}
                  </strong>
                </div>

                <div>
                  <Gauge
                    size={13}
                  />

                  <span>
                    High conviction
                  </span>

                  <strong>
                    {diagnostics.highConviction ??
                      "—"}
                  </strong>
                </div>
              </div>

              <CandidateTable
                candidates={
                  filtered
                }
                loading={
                  loading
                }
              />
            </section>

            {/* ===============================================
                MOVERS
            ================================================ */}
            <div className="movers-grid">
              <MoversPanel
                title="Top Gainers"
                rows={
                  gainers
                }
                type="gainer"
                sessionLabel={
                  sessionLabel
                }
              />

              <MoversPanel
                title="Top Losers"
                rows={
                  losers
                }
                type="loser"
                sessionLabel={
                  sessionLabel
                }
              />
            </div>

            {/* ===============================================
                MARKET ACTIVITY
            ================================================ */}
            <section className="market-card market-summary-card">
              <SectionTitle
                icon={BarChart3}
                eyebrow="Research pulse"
                title="Market Activity"
                subtitle="A concise view of discovery activity and current research positioning."
              />

              <div className="market-summary-grid">
                <div>
                  <span>
                    Research Pool
                  </span>

                  <strong>
                    {scannerSnapshot
                      ? monitored.length
                      : "—"}
                  </strong>

                  <small>
                    selected candidates
                  </small>
                </div>

                <div>
                  <span>
                    Bullish Bias
                  </span>

                  <strong className="market-positive">
                    {bullishCount}
                  </strong>

                  <small>
                    discovery lean
                  </small>
                </div>

                <div>
                  <span>
                    Bearish Bias
                  </span>

                  <strong className="market-negative">
                    {bearishCount}
                  </strong>

                  <small>
                    discovery lean
                  </small>
                </div>

                <div>
                  <span>
                    High Conviction
                  </span>

                  <strong>
                    {diagnostics.highConviction ??
                      "—"}
                  </strong>

                  <small>
                    scanner-qualified
                  </small>
                </div>
              </div>
            </section>
          </div>

          {/* ===============================================
              SIDE COLUMN
          ================================================ */}
          <div className="markets-side-column">
            <QualifiedPanel
              candidates={
                qualifiedCandidates
              }
              progress={
                researchProgress
              }
              loading={
                loading
              }
            />

            <EngineEvaluationPanel
              qualifiedCandidates={
                qualifiedCandidates
              }
              progress={
                researchProgress
              }
            />

            <NewsRail
              news={
                marketNews
              }
            />
          </div>
        </div>
      </main>
    </div>
  );
}
