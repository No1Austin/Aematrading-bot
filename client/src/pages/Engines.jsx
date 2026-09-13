// client/src/pages/Engines.jsx

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  BarChart3,
  Building2,
  CalendarDays,
  ChartNoAxesCombined,
  CheckCircle2,
  CircleGauge,
  Database,
  Flag,
  Globe2,
  Info,
  Landmark,
  Layers3,
  MessageSquareText,
  RefreshCw,
  Scale,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  Users,
} from "lucide-react";

import Sidebar from "../components/Sidebar.jsx";
import EngineCard from "../components/EngineCard.jsx";
import EngineDetailModal from "../components/EngineDetailModal.jsx";
import {
  getLatestStockAnalysis,
  subscribeLatestStockAnalysis,
} from "../services/api.js";

/**
 * ============================================================
 * FRONTEND ENGINE CONTRACT
 * ============================================================
 *
 * The backend tradeScoringEngine is the scoring authority.
 *
 * Directional 100-point architecture:
 *   Technical      30
 *   Fundamental    30
 *   Macro          10
 *   Events         10
 *   Institutional   7.5
 *   Historical      5
 *   Social          5
 *   Country         2.5
 *                  -----
 *                  100
 *
 * Liquidity, Risk/Reward and Consensus remain visible, but they
 * are NOT directional score allocations.
 */

const DIRECTIONAL_ENGINE_DEFINITIONS = [
  {
    id: "technical",
    scorecardKey: "TECHNICAL",
    keys: ["technical"],
    name: "Technical Engine",
    Icon: ChartNoAxesCombined,
    maximum: 30,
  },
  {
    id: "fundamental",
    scorecardKey: "COMPANY",
    keys: ["company", "fundamental", "fundamentals"],
    name: "Fundamental Engine",
    Icon: Building2,
    maximum: 30,
  },
  {
    id: "macro",
    scorecardKey: "MACRO_REGIME",
    keys: ["macro", "marketRegime", "regime", "macroRegime", "macroeconomic"],
    name: "Macro / Market Regime Engine",
    Icon: Globe2,
    maximum: 10,
  },
  {
    id: "events",
    scorecardKey: "EVENTS",
    keys: ["events", "event", "eventRisk"],
    name: "Events Engine",
    Icon: CalendarDays,
    maximum: 10,
  },
  {
    id: "institutional",
    scorecardKey: "INSTITUTIONAL",
    keys: ["institutional", "institutionalPosition"],
    name: "Institutional Engine",
    Icon: Landmark,
    maximum: 7.5,
  },
  {
    id: "historical",
    scorecardKey: "HISTORICAL",
    keys: ["historical", "historicalAnalogue", "historicalPattern", "historyOutcome"],
    name: "Historical Pattern Engine",
    Icon: Database,
    maximum: 5,
  },
  {
    id: "social",
    scorecardKey: "SOCIAL",
    keys: ["social", "socialSentiment", "sentiment"],
    name: "Social Sentiment Engine",
    Icon: MessageSquareText,
    maximum: 5,
  },
  {
    id: "country",
    scorecardKey: "COUNTRY",
    keys: ["country", "countrySector", "countryRisk", "economicExposure"],
    name: "Country & Sector Engine",
    Icon: Flag,
    maximum: 2.5,
  },
];

const SUPPORTING_ENGINE_DEFINITIONS = [
  {
    id: "liquidity",
    scorecardKey: "LIQUIDITY",
    keys: ["liquidity", "liquidityExecution"],
    name: "Liquidity Gate",
    Icon: Activity,
    maximum: null,
    role: "Execution gate",
  },
  {
    id: "riskReward",
    scorecardKey: "RISK_REWARD",
    keys: ["riskReward", "riskRewardGeometry"],
    name: "Risk / Reward Gate",
    Icon: Scale,
    maximum: null,
    role: "Execution gate",
  },
  {
    id: "consensus",
    scorecardKey: "CONSENSUS",
    keys: ["consensus", "crossEngineConsensus"],
    name: "Cross-Engine Consensus",
    Icon: Users,
    maximum: null,
    role: "Confirmation",
  },
  {
    id: "scoring",
    scorecardKey: null,
    keys: ["scoring", "tradeScoring", "researchScoring"],
    name: "Research Scoring Engine",
    Icon: Target,
    maximum: 100,
    role: "Aggregate score",
  },
  {
    id: "decisionGate",
    scorecardKey: null,
    keys: ["decisionGate", "researchConfidenceGate", "gate"],
    name: "Research Confidence Gate",
    Icon: ShieldCheck,
    maximum: null,
    role: "Decision gate",
  },
];

const ENGINE_DEFINITIONS = [
  ...DIRECTIONAL_ENGINE_DEFINITIONS,
  ...SUPPORTING_ENGINE_DEFINITIONS,
];

const TERMINAL_GOOD_STATUSES = new Set([
  "COMPLETE",
  "PARTIAL",
  "SIDEWAYS",
  "BELOW_THRESHOLD",
  "APPROVED",
  "READY",
  "ALLOW",
  "AVAILABLE",
]);

function finite(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function clamp(value, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value));
}

function titleize(value) {
  return String(value ?? "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replaceAll("_", " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function displayValue(value) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "YES" : "NO";

  if (typeof value === "number") {
    return Number.isInteger(value)
      ? String(value)
      : value.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
  }

  if (typeof value === "string") return value;

  if (Array.isArray(value)) {
    return value.length
      ? `${value.length} item${value.length === 1 ? "" : "s"}`
      : "None";
  }

  return "Available in raw engine result";
}

function pickResult(results, keys) {
  for (const key of keys) {
    if (results?.[key] !== undefined && results?.[key] !== null) {
      return results[key];
    }
  }
  return null;
}

function getPreferredSide(result) {
  const side =
    result?.finalDecision?.preferredSide ??
    result?.runnerResult?.finalDecision?.preferredSide ??
    getAnalysisResults(result)?.scoring?.preferredSide ??
    result?.analysis?.preferredSide ??
    "LONG";

  return String(side).toUpperCase() === "SHORT" ? "SHORT" : "LONG";
}

function getAnalysisResults(result) {
  return (
    result?.analysis?.results ??
    result?.runnerResult?.analysis?.results ??
    result?.runnerResult?.results ??
    result?.result?.analysis?.results ??
    result?.result?.runnerResult?.analysis?.results ??
    null
  );
}

function getScoring(result) {
  return getAnalysisResults(result)?.scoring ?? null;
}

function getScorecard(result, side) {
  const scoring = getScoring(result);
  const sideKey = side === "SHORT" ? "short" : "long";

  if (scoring?.scorecard?.[sideKey]) {
    return scoring.scorecard[sideKey];
  }

  const components = scoring?.[sideKey]?.components;
  if (!Array.isArray(components)) return {};

  return Object.fromEntries(
    components
      .filter((component) => component?.name)
      .map((component) => [
        String(component.name).trim().toUpperCase(),
        {
          points: component?.points ?? null,
          maximum: component?.maximumPoints ?? null,
          support: component?.support ?? null,
          available: component?.available === true,
          status: component?.engineStatus ?? null,
          source: component?.source ?? null,
          required: component?.required === true,
        },
      ]),
  );
}

function normalizeSupport(value) {
  const number = finite(value);
  if (number === null) return null;
  return clamp(number <= 1 ? number * 100 : number);
}

function supportForSide(raw, side) {
  const key = side === "SHORT" ? "short" : "long";

  const candidates = [
    raw?.directionalSupport?.[key],
    raw?.support?.[key],
    raw?.directionalScores?.[key],
    raw?.scores?.[key],
    side === "SHORT" ? raw?.bearishSupport : raw?.bullishSupport,
  ];

  for (const candidate of candidates) {
    const normalized = normalizeSupport(candidate);
    if (normalized !== null) return normalized;
  }

  return null;
}

function scorecardSupport(entry) {
  if (!entry) return null;

  // The backend scoring engine is authoritative. `available: false`
  // means the underlying evidence is unavailable; it does NOT mean a
  // backend-supplied support value should be discarded. In particular,
  // the scoring contract may intentionally use 0.50 as the neutral
  // midpoint while preserving unavailable/stale metadata separately.
  return normalizeSupport(entry?.support);
}

function inferDirection(raw, side, percent) {
  const explicit =
    raw?.direction ??
    raw?.signal ??
    raw?.bias ??
    raw?.preferredSide ??
    raw?.regime ??
    raw?.liquidityStatus;

  if (explicit) return String(explicit).toUpperCase();
  if (percent === null) return "UNKNOWN";
  if (percent >= 60) return side;
  if (percent <= 40) return side === "LONG" ? "SHORT" : "LONG";
  return "NEUTRAL";
}

function inferStatus(raw, scorecardEntry) {
  if (scorecardEntry?.status) {
    return String(scorecardEntry.status).toUpperCase();
  }

  if (!raw) return "UNAVAILABLE";

  return String(
    raw?.status ??
      raw?.executionDecision ??
      (raw?.approved === true ? "COMPLETE" : "AVAILABLE"),
  ).toUpperCase();
}

function collectStrings(raw, fields) {
  const values = [];

  for (const field of fields) {
    const candidate = raw?.[field];

    if (Array.isArray(candidate)) {
      for (const item of candidate) {
        if (typeof item === "string" && item.trim()) {
          values.push(item.trim());
        } else if (item && typeof item === "object") {
          const text =
            item.message ??
            item.reason ??
            item.summary ??
            item.description ??
            item.label;

          if (text) values.push(String(text));
        }
      }
    } else if (typeof candidate === "string" && candidate.trim()) {
      values.push(candidate.trim());
    }
  }

  return [...new Set(values)].slice(0, 12);
}

function buildBreakdown(raw, side, scorecardEntry, definition) {
  const rows = [];
  const add = (label, value) => {
    if (value === undefined || value === null || value === "") return;
    rows.push({ label, value: displayValue(value) });
  };

  if (definition.maximum !== null && definition.id !== "scoring") {
    add("Directional allocation", `${definition.maximum} pts`);
  } else if (definition.role) {
    add("Role", definition.role);
  }

  if (scorecardEntry) {
    add("Scoring status", scorecardEntry.status);
    add("Scoring source", scorecardEntry.source);

    const support = scorecardSupport(scorecardEntry);
    if (support !== null) {
      add(`${side === "SHORT" ? "Short" : "Long"} support`, `${support.toFixed(1)}%`);
    }

    const points = finite(scorecardEntry.points);
    const maximum = finite(scorecardEntry.maximum ?? scorecardEntry.maximumPoints);

    if (points !== null) add("Point contribution", points);
    if (maximum !== null) add("Maximum points", maximum);
  }

  if (!raw) {
    if (!rows.length) add("Data", "No engine result received");
    return rows;
  }

  add("Engine status", raw.status);
  add("Direction", raw.direction ?? raw.signal ?? raw.bias);
  add("Preferred side", raw.preferredSide);
  add("Confidence", raw.confidence);
  add("Quality score", raw.qualityScore);

  const rawSupport = supportForSide(raw, side);
  if (!scorecardEntry && rawSupport !== null) {
    add(`${side === "SHORT" ? "Short" : "Long"} support`, `${rawSupport.toFixed(1)}%`);
  }

  const usefulNested = [
    ["Trend", raw.trend?.direction ?? raw.trend?.status ?? raw.trend],
    ["RSI", raw.indicators?.rsi?.value ?? raw.indicators?.rsi],
    ["MACD", raw.indicators?.macd?.analysis?.direction ?? raw.indicators?.macd?.analysis ?? raw.macd?.direction],
    ["VWAP", raw.indicators?.vwap ?? raw.vwap],
    ["ATR %", raw.indicators?.atr?.percent ?? raw.atr?.percent],
    ["Regime", raw.regime],
    ["Liquidity", raw.liquidityStatus],
    ["Execution decision", raw.executionDecision],
    ["Spread %", raw.spread?.spreadPercent],
    ["Relative volume", raw.volume?.relativeVolume],
    ["Participation", raw.participation?.participationRate],
    ["Slippage bps", raw.slippage?.estimatedSlippageBasisPoints],
    ["Analogue count", raw.analogueCount ?? raw.analogues?.length],
    ["Coverage", raw.coverage ?? raw.coveragePercent],
    ["Decision", raw.decision],
    ["Trade eligible", raw.tradeEligible],
  ];

  for (const [label, value] of usefulNested) add(label, value);

  if (rows.length < 7) {
    for (const [key, value] of Object.entries(raw)) {
      if (rows.length >= 10) break;
      if (
        [
          "warnings",
          "errors",
          "reasons",
          "evidence",
          "summary",
          "directionalSupport",
        ].includes(key)
      ) {
        continue;
      }

      if (["string", "number", "boolean"].includes(typeof value)) {
        add(titleize(key), value);
      }
    }
  }

  return rows.slice(0, 10);
}

function buildEngine(definition, results, result, side, scorecard) {
  const raw = pickResult(results, definition.keys);
  const scorecardEntry = definition.scorecardKey
    ? scorecard?.[definition.scorecardKey] ?? null
    : null;

  let percent = scorecardSupport(scorecardEntry);

  if (percent === null && definition.maximum === null) {
    percent = supportForSide(raw, side);
  }

  if (definition.id === "liquidity") {
    const quality = finite(raw?.qualityScore);
    if (quality !== null) {
      percent = clamp(quality <= 1 ? quality * 100 : quality);
    }
  }

  if (definition.id === "scoring") {
    const aggregateScore = finite(
      raw?.preferredScore ??
        result?.finalDecision?.preferredScore ??
        raw?.score,
    );

    if (aggregateScore !== null) {
      percent = clamp(aggregateScore <= 1 ? aggregateScore * 100 : aggregateScore);
    }
  }

  if (definition.id === "decisionGate") {
    const gateScore = finite(
      raw?.confidenceScore ??
        result?.finalDecision?.preferredScore,
    );

    if (gateScore !== null) {
      percent = clamp(gateScore <= 1 ? gateScore * 100 : gateScore);
    }
  }

  const scorecardPoints = finite(scorecardEntry?.points);
  const rawPoints = finite(
    raw?.pointContribution ??
      raw?.weightedContribution ??
      raw?.contribution?.points,
  );

  const score =
    scorecardPoints ??
    (definition.maximum === null ? rawPoints : null) ??
    (percent !== null && definition.maximum !== null
      ? (percent / 100) * definition.maximum
      : null);

  const evidence = collectStrings(raw, [
    "reasons",
    "evidence",
    "positiveEvidence",
    "signals",
  ]);

  if (!evidence.length && raw?.summary) {
    evidence.push(String(raw.summary));
  }

  const warnings = collectStrings(raw, [
    "warnings",
    "errors",
    "blockers",
  ]);

  if (!raw && !scorecardEntry) {
    warnings.push("This engine did not return a result in the latest analysis.");
  }

  if (scorecardEntry?.available === false && definition.maximum !== null) {
    const suppliedSupport = scorecardSupport(scorecardEntry);
    const suppliedPoints = finite(scorecardEntry?.points);

    warnings.push(
      suppliedSupport !== null || suppliedPoints !== null
        ? "Directional evidence is unavailable; the displayed contribution is the backend scoring engine's neutral/fallback contribution, not observed evidence."
        : "Directional evidence is unavailable and the scoring engine did not supply a fallback contribution.",
    );
  }

  return {
    id: definition.id,
    name: definition.name,
    icon: <definition.Icon size={19} />,
    score,
    maximum: definition.maximum,
    percent: percent === null ? null : Math.round(percent),
    direction: inferDirection(raw, side, percent),
    status: inferStatus(raw, scorecardEntry),
    weightLabel:
      definition.maximum === null
        ? definition.role ?? "Gate"
        : `${definition.maximum} pts`,
    sparkline: [],
    breakdown: buildBreakdown(
      raw,
      side,
      scorecardEntry,
      definition,
    ),
    evidence,
    warnings,
    raw,
    scorecardEntry,
    directional: definition.maximum !== null && definition.id !== "scoring",
  };
}

function summarizeEngines(engines) {
  let bullish = 0;
  let bearish = 0;
  let neutral = 0;
  let insufficient = 0;
  let complete = 0;

  for (const engine of engines) {
    const status = String(engine.status ?? "").toUpperCase();
    const direction = String(engine.direction ?? "").toUpperCase();

    const missing =
      status.includes("INSUFFICIENT") ||
      status === "UNAVAILABLE" ||
      status === "ERROR";

    if (missing) {
      insufficient += 1;
    } else if (
      TERMINAL_GOOD_STATUSES.has(status) ||
      engine.raw ||
      engine.scorecardEntry
    ) {
      complete += 1;
    }

    if (
      direction.includes("BULL") ||
      direction === "LONG" ||
      direction.includes("ACCUMULATION")
    ) {
      bullish += 1;
    } else if (
      direction.includes("BEAR") ||
      direction === "SHORT" ||
      direction.includes("DISTRIBUTION")
    ) {
      bearish += 1;
    } else {
      neutral += 1;
    }
  }

  return {
    bullish,
    bearish,
    neutral,
    insufficient,
    complete,
    total: engines.length,
  };
}

function companyName(result, symbol) {
  return (
    result?.company?.name ??
    result?.company?.companyName ??
    result?.analysis?.company?.name ??
    result?.analysis?.company?.companyName ??
    result?.analysis?.results?.company?.companyName ??
    result?.analysis?.results?.company?.name ??
    symbol
  );
}

export default function Engines() {
  const [latest, setLatest] = useState(() => getLatestStockAnalysis());
  const [selectedEngine, setSelectedEngine] = useState(null);
  const [order, setOrder] = useState(() =>
    ENGINE_DEFINITIONS.map((item) => item.id),
  );
  const [draggedIndex, setDraggedIndex] = useState(null);

  useEffect(
    () => subscribeLatestStockAnalysis(setLatest),
    [],
  );

  const result = latest?.result ?? null;
  const results = getAnalysisResults(result) ?? {};
  const side = getPreferredSide(result);
  const scorecard = getScorecard(result, side);

  const generatedEngines = useMemo(
    () =>
      ENGINE_DEFINITIONS.map((definition) =>
        buildEngine(
          definition,
          results,
          result,
          side,
          scorecard,
        ),
      ),
    [results, result, side, scorecard],
  );

  const engines = useMemo(() => {
    const map = new Map(
      generatedEngines.map((engine) => [engine.id, engine]),
    );

    return order.map((id) => map.get(id)).filter(Boolean);
  }, [generatedEngines, order]);

  const directionalEngines = useMemo(
    () => engines.filter((engine) => engine.directional),
    [engines],
  );

  const summary = useMemo(
    () => summarizeEngines(directionalEngines),
    [directionalEngines],
  );

  const scoring = results?.scoring ?? null;

  const overallScore = finite(
    result?.finalDecision?.preferredScore ??
      scoring?.preferredScore ??
      scoring?.score,
  );

  const normalizedOverall =
    overallScore === null
      ? null
      : clamp(overallScore <= 1 ? overallScore * 100 : overallScore);

  const minimumScore =
    finite(
      result?.finalDecision?.minimumRequiredScore ??
        scoring?.minimumRequiredScore,
    ) ?? 80;

  const coveragePercent = summary.total
    ? Math.round((summary.complete / summary.total) * 100)
    : 0;

  const symbol = String(
    result?.symbol ??
      latest?.symbol ??
      "",
  ).toUpperCase();

  const name = companyName(result, symbol);

  const decision =
    result?.finalDecision?.decision ??
    scoring?.status ??
    "ANALYSIS ONLY";

  function moveEngine(fromIndex, toIndex) {
    if (fromIndex === null || fromIndex === toIndex) return;

    setOrder((current) => {
      const next = [...current];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  }

  function resetLayout() {
    setOrder(ENGINE_DEFINITIONS.map((item) => item.id));
  }

  if (!result) {
    return (
      <div className="app-shell">
        <Sidebar />

        <main className="main-content engines-page">
          <header className="engines-page-header">
            <div className="engines-header-copy">
              <div className="engines-kicker">
                <span className="engines-kicker-icon">
                  <Sparkles size={13} />
                </span>

                <span>Multi-engine stock intelligence</span>
              </div>

              <h1>Research Engines</h1>

              <p className="engines-subtitle">
                No completed stock analysis loaded
              </p>
            </div>
          </header>

          <section className="research-score-hero engine-empty-state">
            <CircleGauge size={28} />

            <h2>Run a stock analysis from Dashboard</h2>

            <p>
              Engine cards are populated from the latest backend analysis.
              No placeholder stock or fabricated score is used.
            </p>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <Sidebar />

      <main className="main-content engines-page">
        <header className="engines-page-header">
          <div className="engines-header-copy">
            <div className="engines-kicker">
              <span className="engines-kicker-icon">
                <Sparkles size={13} />
              </span>

              <span>Live multi-engine stock intelligence</span>
            </div>

            <h1>Research Engines</h1>

            <p className="engines-subtitle">
              <strong>{symbol}</strong>
              <span> • </span>
              {name}
              <span> • </span>
              Latest completed analysis
            </p>
          </div>

          <div className="engines-header-actions">
            <button
              className="engine-reset-button secondary-action"
              type="button"
              onClick={resetLayout}
            >
              <RefreshCw size={15} strokeWidth={2} />
              <span>Reset layout</span>
            </button>
          </div>
        </header>

        <section className="research-score-hero overall-engine-score">
          <div className="research-score-main overall-score-top">
            <div className="research-score-copy">
              <div className="research-score-label">
                <CircleGauge size={15} />
                <span>Directional research confidence</span>
              </div>

              <div className="research-score-number">
                <strong>
                  {normalizedOverall === null
                    ? "—"
                    : normalizedOverall.toFixed(2)}
                </strong>
                <span>/100</span>
              </div>

              <div className="research-score-state">
                {side === "SHORT"
                  ? <TrendingDown size={14} />
                  : <TrendingUp size={14} />}

                <span>{side} preferred bias</span>
              </div>
            </div>

            <div className="research-score-status overall-score-decision">
              <span
                className={`research-status-pill ${
                  side === "SHORT" ? "bearish" : "bullish"
                }`}
              >
                {side}
              </span>

              <span className="research-status-pill neutral">
                {decision}
              </span>

              <span className="research-status-pill analysis">
                Analysis only
              </span>
            </div>
          </div>

          <div className="research-score-progress">
            <div className="research-score-track overall-score-track">
              <div
                className="research-score-fill overall-score-fill"
                style={{ width: `${normalizedOverall ?? 0}%` }}
              />

              <span
                className="research-threshold-marker"
                style={{ left: `${clamp(minimumScore)}%` }}
              />
            </div>

            <div className="research-score-scale">
              <span>0</span>
              <span className="research-threshold-label">
                Research threshold · {minimumScore}
              </span>
              <span>100</span>
            </div>
          </div>

          <div className="research-summary-grid">
            <div className="research-summary-item">
              <span className="research-summary-icon positive">
                <TrendingUp size={15} />
              </span>

              <div>
                <span>Bullish directional engines</span>
                <strong>{summary.bullish}</strong>
              </div>
            </div>

            <div className="research-summary-item">
              <span className="research-summary-icon">
                <Layers3 size={15} />
              </span>

              <div>
                <span>Directional engines received</span>
                <strong>
                  {summary.complete}/{summary.total}
                </strong>
              </div>
            </div>

            <div className="research-summary-item">
              <span className="research-summary-icon complete">
                <CheckCircle2 size={15} />
              </span>

              <div>
                <span>Directional coverage</span>
                <strong>{coveragePercent}%</strong>
              </div>
            </div>

            <div className="research-summary-item">
              <span className="research-summary-icon warning">
                <Info size={15} />
              </span>

              <div>
                <span>Directional data gaps</span>
                <strong>{summary.insufficient}</strong>
              </div>
            </div>
          </div>

          <div className="research-score-footer overall-score-bottom">
            <div className="research-direction-summary">
              <span className="research-direction bullish">
                Bullish {summary.bullish}
              </span>

              <span className="research-direction neutral">
                Neutral {summary.neutral}
              </span>

              <span className="research-direction bearish">
                Bearish {summary.bearish}
              </span>

              <span className="research-direction limited">
                Limited data {summary.insufficient}
              </span>
            </div>

            <div className="research-disclaimer">
              <Info size={12} />
              <span>Research signal — not investment advice</span>
            </div>
          </div>
        </section>

        <div className="engine-section-heading">
          <div>
            <div className="engine-section-title">
              <BarChart3 size={17} strokeWidth={2} />
              <h2>Engine Analysis</h2>
            </div>

            <p>
              The eight directional engines use the backend 100-point
              scorecard. Supporting gates remain visible without receiving
              directional points.
            </p>
          </div>

          <span className="engine-count-badge">
            {directionalEngines.length} directional ·{" "}
            {engines.length - directionalEngines.length} supporting
          </span>
        </div>

        <section className="engine-grid">
          {engines.map((engine, index) => (
            <EngineCard
              key={engine.id}
              engine={engine}
              onOpen={setSelectedEngine}
              onDragStart={() => setDraggedIndex(index)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => {
                moveEngine(draggedIndex, index);
                setDraggedIndex(null);
              }}
            />
          ))}
        </section>

        <div className="engine-grid-hint">
          <span className="engine-grid-hint-desktop">
            Drag to rearrange
          </span>

          <span className="engine-grid-hint-separator"> • </span>

          <span>
            Tap any engine to inspect the actual returned evidence
          </span>
        </div>
      </main>

      <EngineDetailModal
        engine={selectedEngine}
        onClose={() => setSelectedEngine(null)}
      />
    </div>
  );
}
