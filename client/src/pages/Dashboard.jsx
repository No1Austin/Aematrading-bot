// client/src/pages/Dashboard.jsx

import {
  useEffect,
  useMemo,
  useState,
} from "react";


import WorkspaceJumpButton
  from "../components/WorkspaceJumpButton.jsx";
import {
  Activity,
  CircleDollarSign,
  Shield,
  Wallet,
} from "lucide-react";

import Sidebar from
  "../components/Sidebar.jsx";

import TopBar from
  "../components/TopBar.jsx";


import EngineBreakdown from
  "../components/EngineBreakdown.jsx";

import InstitutionalPanel from
  "../components/InstitutionalPanel.jsx";

import MarketScannerTable from
  "../components/MarketScannerTable.jsx";

import {
  analyzeStock,
  getLatestStockAnalysis,
  saveLatestStockAnalysis,
  subscribeLatestStockAnalysis,
} from "../services/api.js";

import "./Dashboard.css";

/**
 * ============================================================
 * HELPERS
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

function numberOrZero(
  value,
) {
  return (
    numberOrNull(
      value,
    ) ??
    0
  );
}

function formatNumber(
  value,
  digits = 2,
) {
  const number =
    numberOrNull(
      value,
    );

  return number === null
    ? "—"
    : number.toFixed(
        digits,
      );
}

function formatScore100(
  value,
) {
  const number =
    numberOrNull(
      value,
    );

  return number === null
    ? "—"
    : `${number.toFixed(2)}/100`;
}

function percentFromSupport(
  value,
) {
  const number =
    Number(value);

  if (
    !Number.isFinite(
      number,
    )
  ) {
    return null;
  }

  return Math.round(
    Math.max(
      0,
      Math.min(
        1,
        number,
      ),
    ) * 10000,
  ) / 100;
}

/**
 * ============================================================
 * CANONICAL SCORECARD MAPPING
 * ============================================================
 *
 * IMPORTANT
 * ---------
 * The trade-scoring engine is the authority for the percentage
 * displayed in Dashboard's Engine Breakdown.
 *
 * Raw engines do not all expose directionalSupport in the same
 * shape. The scoring engine has already normalized them into the
 * exact LONG/SHORT support that contributed to the final score.
 *
 * This prevents valid engines such as Technical, Company and
 * Social from incorrectly appearing as 0%.
 */

const ENGINE_SCORECARD_KEYS = Object.freeze({
  technical:
    "TECHNICAL",

  macro:
    "MACRO_REGIME",

  fundamental:
    "COMPANY",

  country:
    "COUNTRY",

  social:
    "SOCIAL",

  events:
    "EVENTS",

  historical:
    "HISTORICAL",

  institutional:
    "INSTITUTIONAL",

  liquidity:
    "LIQUIDITY",

  riskReward:
    "RISK_REWARD",

  consensus:
    "CONSENSUS",
});

function getScoringResult(
  result,
) {
  return (
    result
      ?.analysis
      ?.results
      ?.scoring ??
    null
  );
}

function getPreferredSide(
  result,
) {
  const value =
    result
      ?.finalDecision
      ?.preferredSide ??
    getScoringResult(
      result,
    )
      ?.preferredSide ??
    null;

  const normalized =
    String(
      value ?? "",
    )
      .trim()
      .toUpperCase();

  if (
    normalized === "LONG" ||
    normalized === "SHORT"
  ) {
    return normalized;
  }

  return null;
}

function getPreferredScorecard(
  result,
  side,
) {
  const scoring =
    getScoringResult(
      result,
    );

  const normalizedSide =
    String(
      side ??
      scoring
        ?.preferredSide ??
      "",
    )
      .trim()
      .toUpperCase();

  const sideKey =
    normalizedSide ===
    "SHORT"
      ? "short"
      : normalizedSide ===
        "LONG"
        ? "long"
        : null;

  if (!sideKey) {
    return {};
  }

  const direct =
    scoring
      ?.scorecard
      ?.[sideKey];

  if (
    direct &&
    typeof direct ===
      "object"
  ) {
    return direct;
  }

  const components =
    scoring
      ?.[sideKey]
      ?.components;

  if (
    !Array.isArray(
      components,
    )
  ) {
    return {};
  }

  return Object.fromEntries(
    components
      .filter(
        component =>
          component &&
          typeof component ===
            "object" &&
          component.name,
      )
      .map(
        component => [
          String(
            component.name,
          )
            .trim()
            .toUpperCase(),
          {
            points:
              component
                ?.points ??
              null,

            maximum:
              component
                ?.maximumPoints ??
              null,

            support:
              component
                ?.support ??
              null,

            available:
              component
                ?.available ===
              true,

            status:
              component
                ?.engineStatus ??
              null,

            source:
              component
                ?.source ??
              null,

            required:
              component
                ?.required ===
              true,
          },
        ],
      ),
  );
}

function normalizeScorecardEntry(
  entry,
) {
  if (
    !entry ||
    typeof entry !==
      "object"
  ) {
    return {
      available:
        false,

      support:
        null,

      percent:
        null,

      points:
        null,

      maximum:
        null,

      status:
        "UNAVAILABLE",

      source:
        null,

      required:
        false,
    };
  }

  const support =
    Number.isFinite(
      Number(
        entry
          ?.support,
      ),
    )
      ? Number(
          entry.support,
        )
      : null;

  const available =
    entry
      ?.available ===
    true;

  return {
    available,

    support,

    // Display the scoring authority's directional support even when
    // evidence availability is false. The backend may intentionally
    // emit a neutral midpoint (0.50) for unavailable evidence while
    // keeping `available: false` as explicit provenance metadata.
    // Do not collapse that valid neutral contribution to N/A/0 here.
    percent:
      support !== null
        ? percentFromSupport(
            support,
          )
        : null,

    points:
      Number.isFinite(
        Number(
          entry
            ?.points,
        ),
      )
        ? Number(
            entry.points,
          )
        : null,

    maximum:
      Number.isFinite(
        Number(
          entry
            ?.maximum,
        ),
      )
        ? Number(
            entry.maximum,
          )
        : null,

    status:
      entry
        ?.status ??
      (
        available
          ? "AVAILABLE"
          : "UNAVAILABLE"
      ),

    source:
      entry
        ?.source ??
      null,

    required:
      entry
        ?.required ===
      true,
  };
}

/**
 * Resolve analysis results from live and persisted response shapes.
 * No values are fabricated here.
 */
function getAnalysisResults(
  result,
) {
  return (
    result?.analysis?.results ??
    result?.runnerResult?.analysis?.results ??
    result?.runnerResult?.results ??
    result?.result?.analysis?.results ??
    result?.result?.runnerResult?.analysis?.results ??
    null
  );
}

function getCompanyFundamentals(
  result,
) {
  return (
    getAnalysisResults(
      result,
    )?.company ??
    null
  );
}

function getEconomicExposure(
  result,
) {
  return (
    getAnalysisResults(
      result,
    )?.economicExposure ??
    null
  );
}

function buildEngineData(
  result,
  side,
) {
  const scorecard =
    getPreferredScorecard(
      result,
      side,
    );

  const values = {};
  const meta = {};

  for (
    const [
      clientKey,
      scorecardKey,
    ]
    of Object.entries(
      ENGINE_SCORECARD_KEYS,
    )
  ) {
    const normalized =
      normalizeScorecardEntry(
        scorecard
          ?.[scorecardKey],
      );

    values[
      clientKey
    ] =
      normalized.percent;

    meta[
      clientKey
    ] =
      normalized;
  }


  return {
    values,
    meta,
  };
}

function buildEngines(
  result,
  side,
) {
  return buildEngineData(
    result,
    side,
  ).values;
}

function buildEngineMeta(
  result,
  side,
) {
  return buildEngineData(
    result,
    side,
  ).meta;
}

function getProviderDiagnostics(
  result,
) {
  return (
    result
      ?.providers ??
    result
      ?.runnerResult
      ?.providers ??
    result
      ?.result
      ?.providers ??
    result
      ?.result
      ?.runnerResult
      ?.providers ??
    null
  );
}

function normalizeConfidencePercent(
  value,
) {
  const number =
    numberOrNull(
      value,
    );

  if (number === null) {
    return null;
  }

  /**
   * Support both common backend contracts:
   *
   * 0..1   -> fractional confidence
   * 0..100 -> percentage confidence
   *
   * Anything outside those ranges is treated as unavailable
   * instead of creating a misleading percentage.
   */
  if (
    number >= 0 &&
    number <= 1
  ) {
    return Math.round(
      number * 10000,
    ) / 100;
  }

  if (
    number >= 0 &&
    number <= 100
  ) {
    return Math.round(
      number * 100,
    ) / 100;
  }

  return null;
}

function formatInstitutionalSourceStatus({
  source,
  providerDiagnostic,
  type,
} = {}) {
  if (
    source &&
    typeof source ===
      "object"
  ) {
    const explicitStatus =
      source
        ?.status ??
      source
        ?.providerStatus ??
      null;

    if (explicitStatus) {
      return String(
        explicitStatus,
      )
        .replaceAll(
          "_",
          " ",
        );
    }

    if (
      source
        ?.approved ===
      true
    ) {
      return "AVAILABLE";
    }

    if (
      type === "SEC" &&
      Number(
        source
          ?.managerCount ??
        0,
      ) === 0
    ) {
      return "NO MANAGER EVIDENCE";
    }

    if (
      type === "SEC" &&
      Number(
        source
          ?.institutionsEvaluated ??
        0,
      ) === 0
    ) {
      return "NO POSITION EVIDENCE";
    }

    if (
      source
        ?.approved ===
      false
    ) {
      return "UNAVAILABLE";
    }
  }

  /**
   * The institutional provider diagnostic describes whether
   * the service itself was supplied/run. It is a legitimate
   * fallback when source-specific diagnostics are absent.
   */
  if (
    providerDiagnostic &&
    typeof providerDiagnostic ===
      "object"
  ) {
    if (
      providerDiagnostic
        ?.supplied ===
      false
    ) {
      return "NOT CONFIGURED";
    }

    if (
      providerDiagnostic
        ?.error
    ) {
      return "ERROR";
    }

    if (
      providerDiagnostic
        ?.status
    ) {
      return String(
        providerDiagnostic.status,
      )
        .replaceAll(
          "_",
          " ",
        );
    }

    if (
      providerDiagnostic
        ?.approved ===
      true
    ) {
      return "AVAILABLE";
    }
  }

  return "—";
}

function buildInstitutional(
  result,
) {
  /**
   * Overall institutional bias/confidence comes from the
   * Institutional Position Engine.
   */
  const institutional =
    getAnalysisResults(
      result,
    )
      ?.institutional ??
    null;

  /**
   * Source health comes from the institutional evidence
   * provider diagnostics, NOT from market quote freshness and
   * NOT from the overall Institutional Position Engine status.
   */
  const providers =
    getProviderDiagnostics(
      result,
    );

  const institutionalProvider =
    providers
      ?.institutional ??
    null;

  const providerSources =
    providers
      ?.institutionalSources ??
    null;

  /**
   * When the runner has not surfaced providerSources directly,
   * use the real source evidence retained by the institutional
   * engine. No source values are manufactured here.
   */
  const evidenceSources =
    institutional
      ?.evidence
      ?.sources ??
    null;

  const secSource =
    providerSources
      ?.sec ??
    evidenceSources
      ?.sec ??
    null;

  const finraSource =
    providerSources
      ?.finra ??
    evidenceSources
      ?.finra ??
    null;

  const signal =
    institutional
      ?.signal ??
    institutional
      ?.direction ??
    null;

  const confidence =
    normalizeConfidencePercent(
      institutional
        ?.confidence,
    );

  return {
    bias:
      signal
        ? String(signal)
            .replaceAll(
              "_",
              " ",
            )
        : "—",

    confidence,

    /**
     * Overall engine state is exposed separately so the UI can
     * distinguish "engine insufficient" from "SEC unavailable".
     */
    engineStatus:
      institutional
        ?.status ??
      "—",

    secStatus:
      formatInstitutionalSourceStatus({
        source:
          secSource,

        providerDiagnostic:
          institutionalProvider,

        type:
          "SEC",
      }),

    finraStatus:
      formatInstitutionalSourceStatus({
        source:
          finraSource,

        providerDiagnostic:
          institutionalProvider,

        type:
          "FINRA",
      }),

    secAvailable:
      secSource
        ?.approved ===
      true,

    finraAvailable:
      finraSource
        ?.approved ===
      true,

    providerStatus:
      institutionalProvider
        ?.status ??
      null,
  };
}

function getReferencePrice(
  result,
) {
  return numberOrNull(
    result
      ?.market
      ?.latestQuote
      ?.midpoint ??
    result
      ?.market
      ?.latestBar
      ?.close ??
    result
      ?.bootstrap
      ?.market
      ?.latestBar
      ?.close,
  );
}


function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function formatEngineName(value) {
  return String(value ?? "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replaceAll("_", " ")
    .trim()
    .replace(/\b\w/g, character => character.toUpperCase());
}

function getGaugeState(
  score,
  direction,
  hasResult,
) {
  const normalizedScore =
    numberOrNull(
      score,
    );

  const normalizedDirection =
    String(
      direction ?? "",
    )
      .trim()
      .toUpperCase();

  if (
    !hasResult ||
    normalizedScore === null ||
    (
      normalizedDirection !== "LONG" &&
      normalizedDirection !== "SHORT"
    )
  ) {
    return {
      value: null,
      label: "Awaiting analysis",
      tone: "neutral",
    };
  }

  const boundedScore =
    clamp(
      normalizedScore,
      0,
      100,
    );

  const value =
    normalizedDirection === "SHORT"
      ? 50 - boundedScore / 2
      : 50 + boundedScore / 2;

  if (value <= 20) {
    return {
      value,
      label: "Strong sell",
      tone: "strong-sell",
    };
  }

  if (value <= 40) {
    return {
      value,
      label: "Sell",
      tone: "sell",
    };
  }

  if (value < 60) {
    return {
      value,
      label: "Neutral",
      tone: "neutral",
    };
  }

  if (value < 80) {
    return {
      value,
      label: "Buy",
      tone: "buy",
    };
  }

  return {
    value,
    label: "Strong buy",
    tone: "strong-buy",
  };
}

function formatEngineSupport(
  selected,
  key,
) {
  const metadata =
    selected
      ?.engineMeta
      ?.[key];

  // Availability describes evidence quality/provenance; it must not
  // erase a backend-supplied neutral midpoint contribution.
  const value =
    Number(
      selected
        ?.engines
        ?.[key],
    );

  return Number.isFinite(
    value,
  )
    ? `${value.toFixed(
        value % 1 === 0
          ? 0
          : 2,
      )}%`
    : "N/A";
}


function MarketGauge({
  symbol,
  score,
  direction,
  price,
  change,
  hasResult,
  marketClosed,
  decision,
  riskStatus,
}) {
  const gauge =
    getGaugeState(
      score,
      direction,
      hasResult,
    );

  const angle =
    gauge.value === null
      ? 0
      : -90 +
        (
          gauge.value /
          100
        ) * 180;

  const normalizedChange =
    numberOrNull(
      change,
    );

  return (
    <section className={`panel market-gauge-card ${marketClosed ? "is-off-session" : "is-live-session"}`}>
      <div className="market-gauge-head">
        <div>
          <p className="eyebrow">Current setup</p>
          <div className="market-gauge-symbol-row">
            <h2>{symbol}</h2>
            <span className={`market-bias market-bias--${String(direction ?? "neutral").toLowerCase()}`}>
              {hasResult && direction
                ? direction
                : "WAITING"}
            </span>
          </div>
        </div>

        <div className="market-gauge-head-meta">
          <span>{marketClosed ? "OFF SESSION" : "LIVE SESSION"}</span>
          <strong>
            {hasResult
              ? formatScore100(
                  score,
                )
              : "—"}
          </strong>
        </div>
      </div>

      <div className="market-gauge-layout">
        <div className="market-gauge-visual">
          <span className="gauge-label gauge-label--strong-sell">Strong sell</span>
          <span className="gauge-label gauge-label--sell">Sell</span>
          <span className="gauge-label gauge-label--neutral">Neutral</span>
          <span className="gauge-label gauge-label--buy">Buy</span>
          <span className="gauge-label gauge-label--strong-buy">Strong buy</span>

          <svg
            className="market-gauge-svg"
            viewBox="0 0 360 220"
            role="img"
            aria-label={`${symbol} setup gauge: ${gauge.label}`}
          >
            <path className="gauge-base" d="M 42 178 A 138 138 0 0 1 318 178" pathLength="100" />
            <path className="gauge-zone gauge-zone--strong-sell" d="M 42 178 A 138 138 0 0 1 318 178" pathLength="100" />
            <path className="gauge-zone gauge-zone--sell" d="M 42 178 A 138 138 0 0 1 318 178" pathLength="100" />
            <path className="gauge-zone gauge-zone--neutral" d="M 42 178 A 138 138 0 0 1 318 178" pathLength="100" />
            <path className="gauge-zone gauge-zone--buy" d="M 42 178 A 138 138 0 0 1 318 178" pathLength="100" />
            <path className="gauge-zone gauge-zone--strong-buy" d="M 42 178 A 138 138 0 0 1 318 178" pathLength="100" />

            <g
              className="gauge-needle-group"
              style={{
                transform:
                  gauge.value ===
                  null
                    ? "rotate(0deg)"
                    : `rotate(${angle}deg)`,
                opacity:
                  gauge.value ===
                  null
                    ? 0
                    : 1,
              }}
            >
              <line className="gauge-needle-shadow" x1="180" y1="178" x2="180" y2="80" />
              <line className="gauge-needle" x1="180" y1="178" x2="180" y2="80" />
            </g>

            <circle className="gauge-hub-ring" cx="180" cy="178" r="10" />
            <circle className="gauge-hub" cx="180" cy="178" r="5.5" />
          </svg>

          <div className={`market-gauge-verdict market-gauge-verdict--${gauge.tone}`}>
            {gauge.label}
          </div>
        </div>

        <div className="market-gauge-market-data">
          <div className="market-data-block market-data-block--price">
            <span>Reference price</span>
            <strong>
              {hasResult &&
              numberOrNull(
                price,
              ) !== null
                ? `$${formatNumber(
                    price,
                    2,
                  )}`
                : "—"}
            </strong>

            <small
              className={
                normalizedChange ===
                null
                  ? ""
                  : normalizedChange <
                    0
                    ? "negative"
                    : "positive"
              }
            >
              {hasResult &&
              normalizedChange !==
                null
                ? `${
                    normalizedChange >=
                    0
                      ? "+"
                      : ""
                  }${normalizedChange.toFixed(
                    2,
                  )}%`
                : "Change unavailable"}
            </small>
          </div>

          <div className="market-data-block">
            <span>Research decision</span>
            <strong>{decision ?? "PENDING"}</strong>
            <small>Decision from the existing analysis engine</small>
          </div>

          <div className="market-data-block">
            <span>Risk status</span>
            <strong>{riskStatus ?? "PENDING"}</strong>
            <small>Current server-side risk evaluation</small>
          </div>
        </div>
      </div>
    </section>
  );
}


function classToken(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
}) {
  return (
    <div className={`stat-card stat-card--${classToken(label)} stat-card-value--${classToken(value)}`}>
      <div className="stat-icon">
        <Icon size={19} />
      </div>

      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{sub}</small>
      </div>
    </div>
  );
}

const initialState = {
  symbol: "—",
  score: null,
  direction: null,
  price: null,
  change: null,
  engines: Object.fromEntries(
    Object.keys(
      ENGINE_SCORECARD_KEYS,
    ).map(
      key => [
        key,
        null,
      ],
    ),
  ),
  engineMeta: {},
  institutional: {
    bias: "—",
    confidence: null,
    engineStatus: "—",
    secStatus: "—",
    finraStatus: "—",
    secAvailable: false,
    finraAvailable: false,
    providerStatus: null,
  },
};

/**
 * ============================================================
 * DASHBOARD
 * ============================================================
 */

export default function Dashboard() {
  const [
    persistedAnalysis,
  ] =
    useState(
      () =>
        getLatestStockAnalysis(),
    );

  const persistedResult =
    persistedAnalysis
      ?.result ??
    null;

  const persistedSymbol =
    String(
      persistedResult
        ?.symbol ??
      persistedResult
        ?.analysis
        ?.symbol ??
      "",
    )
      .trim()
      .toUpperCase();

  const persistedPreferredSide =
    getPreferredSide(
      persistedResult,
    );

  const [
    query,
    setQuery,
  ] =
    useState(
      persistedSymbol,
    );

  const [
    selected,
    setSelected,
  ] =
    useState(
      () => {
        if (!persistedResult) {
          return initialState;
        }

        return {
          symbol:
            persistedSymbol,

          score:
            numberOrNull(
              persistedResult
                ?.finalDecision
                ?.preferredScore ??
              persistedResult
                ?.analysis
                ?.results
                ?.scoring
                ?.preferredScore,
            ),

          direction:
            persistedPreferredSide,

          price:
            getReferencePrice(
              persistedResult,
            ),

          change:
            numberOrNull(
              persistedResult
                ?.market
                ?.changePercent ??
              persistedResult
                ?.market
                ?.percentChange ??
              persistedResult
                ?.market
                ?.change,
            ),

          engines:
            buildEngines(
              persistedResult,
              persistedPreferredSide,
            ),

          engineMeta:
            buildEngineMeta(
              persistedResult,
              persistedPreferredSide,
            ),

          institutional:
            buildInstitutional(
              persistedResult,
            ),
        };
      },
    );

  const [
    result,
    setResult,
  ] =
    useState(
      persistedResult,
    );

  const [
    loading,
    setLoading,
  ] =
    useState(
      false,
    );

  const [
    error,
    setError,
  ] =
    useState(
      null,
    );

  useEffect(
    () => {
      function applyPersistedAnalysis(
        payload,
      ) {
        const nextResult =
          payload
            ?.result ??
          null;

        if (!nextResult) {
          return;
        }

        const nextSymbol =
          String(
            nextResult
              ?.symbol ??
            nextResult
              ?.analysis
              ?.symbol ??
            "",
          )
            .trim()
            .toUpperCase();

        const preferredSide =
          getPreferredSide(
            nextResult,
          );

        const score =
          numberOrNull(
            nextResult
              ?.finalDecision
              ?.preferredScore ??
            nextResult
              ?.analysis
              ?.results
              ?.scoring
              ?.preferredScore,
          );

        setResult(
          nextResult,
        );

        if (nextSymbol) {
          setQuery(
            nextSymbol,
          );
        }

        setSelected({
          symbol:
            nextSymbol ||
            "—",

          score,

          direction:
            preferredSide,

          price:
            getReferencePrice(
              nextResult,
            ),

          change:
            numberOrNull(
              nextResult
                ?.market
                ?.changePercent ??
              nextResult
                ?.market
                ?.percentChange ??
              nextResult
                ?.market
                ?.change,
            ),

          engines:
            buildEngines(
              nextResult,
              preferredSide,
            ),

          engineMeta:
            buildEngineMeta(
              nextResult,
              preferredSide,
            ),

          institutional:
            buildInstitutional(
              nextResult,
            ),
        });
      }

      const latest =
        getLatestStockAnalysis();

      if (
        latest
          ?.result &&
        latest.result !==
          result
      ) {
        applyPersistedAnalysis(
          latest,
        );
      }

      return subscribeLatestStockAnalysis(
        applyPersistedAnalysis,
      );
    },
    [],
  );

  /**
   * Market session and quote freshness are independent.
   *
   * NEVER infer "market closed" from a stale/missing quote.
   * UNKNOWN remains UNKNOWN instead of being mislabeled CLOSED.
   */
  const marketSessionStatus =
    result
      ?.market
      ?.session
      ?.status ??
    null;

  const marketClosed =
    marketSessionStatus ===
      "CLOSED"
      ? true
      : marketSessionStatus ===
          "OPEN"
        ? false
        : null;

  const quoteFresh =
    result
      ?.market
      ?.quoteFresh === true;

  const finalDecision =
    result
      ?.finalDecision ??
    null;

  /**
   * ============================================================
   * CURRENT SETUP INTELLIGENCE
   * ============================================================
   *
   * IMPORTANT:
   *
   * Everything below is derived only from data this Dashboard
   * already receives. No synthetic entry, stop or target levels
   * are invented here.
   */

  const scoringResult =
    result
      ?.analysis
      ?.results
      ?.scoring ??
    null;

  const minimumRequiredScoreRaw =
    finalDecision
      ?.minimumRequiredScore ??
    scoringResult
      ?.minimumRequiredScore ??
    null;

  const minimumRequiredScore =
    minimumRequiredScoreRaw === null ||
    minimumRequiredScoreRaw === undefined
      ? null
      : numberOrZero(minimumRequiredScoreRaw);

  const scoreGap =
    minimumRequiredScore === null
      ? null
      : selected.score - minimumRequiredScore;

  const engineEntries =
    Object.entries(
      selected.engines,
    )
      .map(
        ([
          key,
          value,
        ]) => ({
          key,

          value:
            numberOrNull(
              value,
            ),

          available:
            selected
              ?.engineMeta
              ?.[key]
              ?.available ===
            true,
        }),
      )
      .filter(
        engine =>
          engine.available &&
          engine.value !==
            null,
      );

  const engineAverage =
    engineEntries.length > 0
      ? Math.round(
          engineEntries.reduce(
            (total, engine) => total + engine.value,
            0,
          ) / engineEntries.length,
        )
      : null;

  const strongestEngine =
    engineEntries.length > 0
      ? engineEntries.reduce(
          (strongest, engine) =>
            engine.value > strongest.value
              ? engine
              : strongest,
        )
      : null;

  const weakestEngine =
    engineEntries.length > 0
      ? engineEntries.reduce(
          (weakest, engine) =>
            engine.value < weakest.value
              ? engine
              : weakest,
        )
      : null;

  const setupReadiness =
    !result
      ? "—"
      : finalDecision
          ?.tradeEligible ===
        true
        ? "QUALIFIED"
        : finalDecision
            ?.decision ??
          finalDecision
            ?.riskStatus ??
          "—";

  const marketContext =
    marketClosed === null
      ? "—"
      : marketClosed
        ? "OFF SESSION"
        : "LIVE";

  const researchEligibility =
    finalDecision
      ?.tradeEligible ===
    true
      ? "PASSED"
      : finalDecision
        ? "BLOCKED"
        : "—";

  const scannerRows =
    useMemo(
      () => [
        {
          symbol:
            selected.symbol,

          name:
            selected.symbol,

          score:
            selected.score,

          direction:
            selected.direction,

          price:
            selected.price,
        },
      ],
      [
        selected,
      ],
    );

  async function runSearch() {
    const symbol =
      String(
        query ??
        "",
      )
        .trim()
        .toUpperCase();

    if (!symbol) {
      setError(
        "Enter a stock symbol.",
      );

      return;
    }

    setLoading(
      true,
    );

    setError(
      null,
    );

    try {
      const response =
        await analyzeStock(
          symbol,
          {
            useLiveSocial:
              true,

            clientTimeoutMs:
              90_000,
          },
        );

      setResult(
        response,
      );

      saveLatestStockAnalysis(
        response,
      );

      const preferredSide =
        getPreferredSide(
          response,
        );

      const score =
        numberOrNull(
          response
            ?.finalDecision
            ?.preferredScore ??
          response
            ?.analysis
            ?.results
            ?.scoring
            ?.preferredScore,
        );

      setSelected({
        symbol:
          response
            ?.symbol ??
          symbol,

        score,

        direction:
          preferredSide,

        price:
          getReferencePrice(
            response,
          ),

        change:
          numberOrNull(
            response
              ?.market
              ?.changePercent ??
            response
              ?.market
              ?.percentChange ??
            response
              ?.market
              ?.change,
          ),

        engines:
          buildEngines(
            response,
            preferredSide,
          ),

        engineMeta:
          buildEngineMeta(
            response,
            preferredSide,
          ),

        institutional:
          buildInstitutional(
            response,
          ),
      });
    } catch (
      requestError
    ) {
      setError(
        requestError
          ?.message ??
        "Stock analysis failed.",
      );
    } finally {
      setLoading(
        false,
      );
    }
  }

  return (
    <div className="app-shell">
      <Sidebar />

      <main className="main-content dashboard-page">
        <TopBar
          query={
            query
          }
          onQueryChange={
            setQuery
          }
          onSearch={
            runSearch
          }
        />

        {loading && (
          <div
            className="authority-banner auto dashboard-banner"
          >
            <strong>
              ANALYZING {query.toUpperCase()}
            </strong>

            <span>
              Loading market history and engine intelligence...
            </span>
          </div>
        )}

        {error && (
          <div
            className="authority-banner manual dashboard-banner"
          >
            <strong>
              ANALYSIS ERROR
            </strong>

            <span>
              {error}
            </span>
          </div>
        )}

        <div className="status-strip">
          <div>
            <span
              className={`status-dot ${
                marketClosed
                  ? "paper"
                  : "online"
              }`}
            />

            Market

            <strong>
              {marketClosed ===
              null
                ? "AWAITING"
                : marketClosed
                  ? "CLOSED"
                  : "OPEN"}
            </strong>
          </div>

          <div>
            <span
              className={`status-dot ${
                result
                  ? "online"
                  : "paper"
              }`}
            />

            Analysis API

            <strong>
              {result
                ? "CONNECTED"
                : "AWAITING"}
            </strong>
          </div>

          <div>
            <span
              className={`status-dot ${
                result
                  ?.bootstrap
                  ?.historical
                  ?.provider ===
                "ALPACA"
                  ? "online"
                  : "paper"
              }`}
            />

            Market data

            <strong>
              {result
                ?.bootstrap
                ?.historical
                ?.provider ??
                "AWAITING"}
            </strong>
          </div>

          <div>
            <span
              className={`status-dot ${
                result
                  ?.executionReady ===
                true
                  ? "online"
                  : "paper"
              }`}
            />

            Mode

            <strong>
              {result
                ? (
                    result
                      ?.executionReady ===
                    true
                      ? "EXECUTION READY"
                      : "ANALYSIS ONLY"
                  )
                : "AWAITING"}
            </strong>
          </div>
        </div>

        <section className="stats-grid">
          <StatCard
            label="Symbol"
            value={
              selected.symbol
            }
            sub={
              marketClosed
                ? "Historical analysis"
                : "Live analysis"
            }
            icon={
              Wallet
            }
          />

          <StatCard
            label="Preferred score"
            value={
              formatScore100(
                selected.score,
              )
            }
            sub={
              selected.direction ??
              "—"
            }
            icon={
              Activity
            }
          />

          <StatCard
            label="Trade eligibility"
            value={
              !finalDecision
                ? "—"
                : finalDecision
                    ?.tradeEligible ===
                  true
                  ? "ELIGIBLE"
                  : "BLOCKED"
            }
            sub={
              finalDecision
                ?.decision ??
              "Awaiting analysis"
            }
            icon={
              Shield
            }
          />

          <StatCard
            label="Execution"
            value={
              !result
                ? "—"
                : result
                    ?.executionReady ===
                  true
                  ? "READY"
                  : "DISABLED"
            }
            sub={
              !result
                ? "Awaiting analysis"
                : result
                    ?.executionReady ===
                  true
                  ? "Execution prerequisites satisfied"
                  : "Analysis only"
            }
            icon={
              CircleDollarSign
            }
          />
        </section>

        {marketClosed &&
          result && (
          <div
            className="authority-banner manual dashboard-banner"
          >
            <strong>
              MARKET CLOSED — ANALYSIS ONLY
            </strong>

            <span>
              Historical analysis is available, but liquidity,
              live risk/reward and execution remain disabled
              until a fresh market quote becomes available.
            </span>
          </div>
        )}

        <section className="dashboard-grid top-grid">
          <MarketGauge
            symbol={selected.symbol}
            score={selected.score}
            direction={selected.direction}
            price={selected.price}
            change={selected.change}
            hasResult={Boolean(result)}
            marketClosed={Boolean(marketClosed)}
            decision={finalDecision?.decision}
            riskStatus={finalDecision?.riskStatus}
          />

          <InstitutionalPanel
            institutional={
              selected.institutional
            }
          />
        </section>

        <section className="dashboard-grid lower-grid">
          <EngineBreakdown
            engines={
              selected.engines
            }
            meta={
              selected.engineMeta
            }
            preferredSide={
              selected.direction
            }
            backendScore={
              selected.score
            }
            fundamentals={
              getCompanyFundamentals(
                result,
              )
            }
            economicExposure={
              getEconomicExposure(
                result,
              )
            }
            companyProvider={
              result
                ?.providers
                ?.company ??
              null
            }
          />

          <section className="panel trade-plan">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">
                  Consolidated engine view
                </p>

                <h2>
                  Current Setup
                </h2>
              </div>

              <Activity
                size={20}
              />
            </div>

            <div className="trade-plan-grid">
              <div>
                <span>
                  Preferred bias
                </span>

                <strong>
                  {selected.direction ??
                    "—"}
                </strong>
              </div>

              <div>
                <span>
                  Research score
                </span>

                <strong>
                  {formatScore100(
                    selected.score,
                  )}
                </strong>
              </div>

              <div>
                <span>
                  Setup readiness
                </span>

                <strong>
                  {setupReadiness}
                </strong>
              </div>

              <div>
                <span>
                  Research decision
                </span>

                <strong>
                  {finalDecision
                    ?.decision ??
                    "—"}
                </strong>
              </div>

              <div>
                <span>
                  Risk status
                </span>

                <strong>
                  {finalDecision
                    ?.riskStatus ??
                    "—"}
                </strong>
              </div>

              <div>
                <span>
                  Research eligibility
                </span>

                <strong>
                  {researchEligibility}
                </strong>
              </div>

              <div>
                <span>
                  Technical support
                </span>

                <strong>
                  {formatEngineSupport(
                    selected,
                    "technical",
                  )}
                </strong>
              </div>

              <div>
                <span>
                  Fundamental support
                </span>

                <strong>
                  {formatEngineSupport(
                    selected,
                    "fundamental",
                  )}
                </strong>
              </div>

              <div>
                <span>
                  Liquidity quality
                </span>

                <strong>
                  {formatEngineSupport(
                    selected,
                    "liquidity",
                  )}
                </strong>
              </div>

              <div>
                <span>
                  Risk / reward support
                </span>

                <strong>
                  {formatEngineSupport(
                    selected,
                    "riskReward",
                  )}
                </strong>
              </div>

              <div>
                <span>
                  Institutional support
                </span>

                <strong>
                  {formatEngineSupport(
                    selected,
                    "institutional",
                  )}
                </strong>
              </div>

              <div>
                <span>
                  Average engine support
                </span>

                <strong>
                  {engineAverage ===
                  null
                    ? "—"
                    : `${engineAverage}%`}
                </strong>
              </div>

              <div>
                <span>
                  Strongest engine
                </span>

                <strong>
                  {strongestEngine
                    ? `${formatEngineName(strongestEngine.key)} ${strongestEngine.value}%`
                    : "—"}
                </strong>
              </div>

              <div>
                <span>
                  Weakest engine
                </span>

                <strong>
                  {weakestEngine
                    ? `${formatEngineName(weakestEngine.key)} ${weakestEngine.value}%`
                    : "—"}
                </strong>
              </div>

              <div>
                <span>
                  Market context
                </span>

                <strong>
                  {marketContext}
                </strong>
              </div>
            </div>

            {result ? (
              finalDecision?.tradeEligible === true ? (
                <button
                  className="primary-action"
                  type="button"
                  disabled
                >
                  Research gate passed
                  {scoreGap !== null && (
                    <>
                      {" "}· {Math.abs(scoreGap).toFixed(1)} pts above threshold
                    </>
                  )}
                </button>
              ) : (
                <button
                  className="manual-action"
                  type="button"
                  disabled
                >
                  Research gate not cleared
                  {scoreGap !== null && (
                    <>
                      {" "}· {Math.abs(scoreGap).toFixed(1)} pts below threshold
                    </>
                  )}
                </button>
              )
            ) : (
              <button
                className="manual-action"
                type="button"
                disabled
              >
                Run analysis to build current setup
              </button>
            )}

            <p className="action-note">
              {result
                ? `${engineEntries.length} engines currently report usable support.${
                    engineAverage !== null
                      ? ` Average support: ${engineAverage}%.`
                      : ""
                  } ${
                    strongestEngine
                      ? `Strongest: ${formatEngineName(strongestEngine.key)} ${strongestEngine.value}%.`
                      : ""
                  } ${
                    minimumRequiredScore !== null
                      ? `Server research threshold: ${minimumRequiredScore.toFixed(0)}/100.`
                      : ""
                  }`
                : "Search a stock symbol to populate the setup from live and historical research-engine data."}
            </p>

            <p className="action-note">
              This section summarizes research evidence only. It does
              not submit, authorize, or execute stock orders.
            </p>
          </section>
        </section>

        <MarketScannerTable
          rows={
            scannerRows
          }
          selectedSymbol={
            selected.symbol
          }
          onSelect={() => {}}
        />

        {result
          ?.warnings
          ?.length >
          0 && (
          <section className="panel dashboard-warning-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">
                  Diagnostics
                </p>

                <h2>
                  Engine Warnings
                </h2>
              </div>
            </div>

            <div className="dashboard-warning-list">
              {result
                .warnings
                .map(
                  (
                    warning,
                    index,
                  ) => (
                    <div
                      className="institutional-note"
                      key={`${index}-${warning}`}
                    >
                      <p>
                        {warning}
                      </p>
                    </div>
                  ),
                )}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}