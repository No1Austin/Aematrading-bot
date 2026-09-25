import {
  Activity,
  AlertTriangle,
  BarChart3,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock3,
  Database,
  ArrowRightLeft,
  Building2,
  CircleDollarSign,
  Droplets,
  Network,
  Target,
  Gauge,
  Layers3,
  Moon,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Sun,
  TrendingDown,
  TrendingUp,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";

import CryptoSidebar from "../components/CryptoSidebar.jsx";
import WorkspaceJumpButton from "../../components/WorkspaceJumpButton.jsx";
import "./CryptoResearch.css";

const API_BASE =
  String(import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000").replace(/\/$/, "");

const RESEARCH_CACHE_KEY = "aema-crypto-research-cache-v1";
const RESEARCH_ASSET_KEY = "aema-crypto-research-last-asset";

function readResearchCache() {
  try {
    const raw = window.sessionStorage.getItem(RESEARCH_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

const EMPTY_ENGINES = {
  technical: null,
  fundamental: null,
  supporting: null,
  momentum: null,
  liquidity: null,
  onChain: null,
  narrative: null,
  news: null,
  risk: null,
};

const ENGINE_META = {
  technical: { label: "Technical", icon: BarChart3 },
  fundamental: { label: "Fundamental", icon: Database },
  supporting: { label: "Supporting", icon: Layers3 },
  momentum: { label: "Momentum", icon: TrendingUp },
  liquidity: { label: "Liquidity", icon: Activity },
  onChain: { label: "On-Chain", icon: Database },
  narrative: { label: "Narrative", icon: Sparkles },
  news: { label: "News", icon: BookOpen },
  risk: { label: "Risk", icon: ShieldCheck },
};

const finite = value => {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const first = (...values) =>
  values.find(value => value !== undefined && value !== null);

const percent = value => {
  const n = finite(value);
  if (n === null) return null;
  return n >= 0 && n <= 1 ? n * 100 : n;
};

const scoreText = value => {
  const n = finite(value);
  return n === null ? "—" : n.toFixed(1);
};

const percentText = value => {
  const n = percent(value);
  return n === null ? "—" : `${n.toFixed(0)}%`;
};

const money = value => {
  const n = finite(value);
  if (n === null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: n < 1 ? 6 : 2,
  }).format(n);
};

const compact = value => {
  const n = finite(value);
  if (n === null) return "—";
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(n);
};

const text = value => String(value ?? "").trim();

function normalizeStatus(value) {
  return text(value || "UNKNOWN").toUpperCase();
}

function toneFromScore(value) {
  const n = finite(value);
  if (n === null) return "muted";
  if (n >= 60) return "bull";
  if (n <= 40) return "bear";
  return "neutral";
}

function statusTone(status) {
  const s = normalizeStatus(status);
  if (["READY", "COMPLETE", "APPROVED", "HEALTHY"].includes(s)) return "healthy";
  if (["FAILED", "ERROR", "HALTED"].includes(s)) return "danger";
  if (["EVIDENCE_UNAVAILABLE", "INSUFFICIENT_EVIDENCE", "NO_TRADE"].includes(s)) return "warning";
  return "neutral";
}

function getEngine(source, key) {
  const aliases = {
    technical: ["technical", "technicalEngine"],
    fundamental: ["fundamental", "fundamentalEngine"],
    supporting: ["supporting", "supportingIntelligence"],
    momentum: ["momentum", "momentumEngine"],
    liquidity: ["liquidity", "liquidityEngine"],
    onChain: ["onChain", "onchain", "on_chain", "onChainEngine"],
    narrative: ["narrative", "socialNarrative", "social"],
    news: ["news", "newsIntelligence"],
    risk: ["risk", "riskEngine"],
  };
  const roots = [
    source?.engines,
    source?.diagnostics?.engines,
    source?.research?.engines,
    source?.research?.diagnostics?.engines,
    source?.deepResearch?.engines,
    source,
  ].filter(Boolean);

  for (const root of roots) {
    for (const alias of aliases[key] ?? [key]) {
      if (root?.[alias]) return root[alias];
    }
  }
  return null;
}

function extractPayload(raw) {
  const data = raw?.data ?? raw?.result ?? raw ?? {};
  const research =
    data?.research ??
    data?.deepResearch ??
    data?.analysis ??
    data?.researchResult ??
    data;

  const engines = {};
  Object.keys(EMPTY_ENGINES).forEach(key => {
    engines[key] = getEngine(research, key) ?? getEngine(data, key);
  });

  const q2 =
    research?.q2 ??
    research?.Q2 ??
    data?.q2 ??
    data?.Q2 ??
    research?.qualification ??
    null;

  const valuation =
    data?.engines?.valuation ??
    research?.engines?.valuation ??
    data?.valuation ??
    research?.valuation ??
    data?.valuationResearch ??
    null;

  const exchange =
    data?.exchangeIntelligence ??
    research?.exchangeIntelligence ??
    null;

  const asset =
    data?.asset ??
    data?.candidate ??
    research?.asset ??
    {};

  return { data, research, engines, q2, valuation, asset };
}

async function requestResearch(symbol, { signal } = {}) {
  const query = text(symbol).toUpperCase();
  const response = await fetch(`${API_BASE}/api/crypto/scanner/engines`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify({ query }),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      body?.error ??
      body?.message ??
      `Research request failed (${response.status})`,
    );
  }
  return body;
}

async function requestExchangeIntelligence(symbol, { signal } = {}) {
  const query = text(symbol).toUpperCase();
  const response = await fetch(
    `${API_BASE}/api/crypto/research/exchange-intelligence?symbol=${encodeURIComponent(query)}`,
    { signal },
  );

  const body = await response.json().catch(() => ({}));
  if (!response.ok && response.status !== 422) {
    throw new Error(
      body?.error ??
      body?.message ??
      `Exchange intelligence request failed (${response.status})`,
    );
  }
  return body;
}

function ScoreRing({ value, label = "Research Score" }) {
  const n = finite(value);
  const safe = n === null ? 0 : Math.max(0, Math.min(100, n));
  return (
    <div
      className={`crypto-research-score-ring ${toneFromScore(n)}`}
      style={{ "--research-score": `${safe * 3.6}deg` }}
    >
      <div className="crypto-research-score-ring__inner">
        <strong>{n === null ? "—" : safe.toFixed(1)}</strong>
        <span>{label}</span>
      </div>
    </div>
  );
}

function MiniMetric({ label, value, tone = "" }) {
  return (
    <div className="crypto-research-mini-metric">
      <span>{label}</span>
      <strong className={tone}>{value}</strong>
    </div>
  );
}

function EngineCard({ engineKey, engine, expanded, onToggle }) {
  const meta = ENGINE_META[engineKey];
  const Icon = meta.icon;
  const available =
    first(engine?.availability?.available, engine?.available) === true ||
    ["READY", "COMPLETE"].includes(normalizeStatus(engine?.status));
  const score = available ? finite(engine?.score) : null;
  const confidence = available ? first(engine?.confidence, engine?.details?.confidence) : null;
  const coverage = available ? first(engine?.coverage, engine?.details?.coverage) : null;
  const reason =
    engine?.reason ??
    engine?.availability?.reason ??
    engine?.details?.reason ??
    null;
  const evidenceCount =
    first(
      engine?.availability?.evidenceCount,
      engine?.evidenceCount,
      Array.isArray(engine?.evidence) ? engine.evidence.length : null,
    );

  return (
    <article className={`crypto-research-engine-card ${available ? "" : "unavailable"}`}>
      <button
        type="button"
        className="crypto-research-engine-card__button"
        onClick={onToggle}
        aria-expanded={expanded}
      >
        <span className="crypto-research-engine-icon"><Icon size={17} /></span>
        <span className="crypto-research-engine-name">
          <strong>{meta.label}</strong>
          <small>{normalizeStatus(engine?.status)}</small>
        </span>
        <span className={`crypto-research-engine-score ${toneFromScore(score)}`}>
          {scoreText(score)}
        </span>
        {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>

      <div className="crypto-research-engine-bars">
        <div>
          <span>Confidence</span>
          <strong>{percentText(confidence)}</strong>
        </div>
        <div>
          <span>Coverage</span>
          <strong>{percentText(coverage)}</strong>
        </div>
      </div>

      {expanded ? (
        <div className="crypto-research-engine-detail">
          <div className="crypto-research-detail-grid">
            <MiniMetric label="Available" value={available ? "YES" : "NO"} />
            <MiniMetric label="Evidence" value={evidenceCount ?? "—"} />
            <MiniMetric label="Source" value={engine?.source ?? engine?.availability?.source ?? "—"} />
            <MiniMetric label="Reason" value={reason ?? "—"} />
          </div>
          {engine?.details ? (
            <details className="crypto-research-raw">
              <summary>Engine details</summary>
              <pre>{JSON.stringify(engine.details, null, 2)}</pre>
            </details>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

function EvidenceRow({ label, value, status }) {
  return (
    <div className="crypto-research-evidence-row">
      <span>{label}</span>
      <strong className={statusTone(status)}>{value}</strong>
    </div>
  );
}


function FeasibilityBadge({ value }) {
  const status = normalizeStatus(value);
  return (
    <span className={`crypto-research-feasibility ${status.toLowerCase()}`}>
      {status || "—"}
    </span>
  );
}

function MarketTable({ markets = [], title, emptyText, kind = "market" }) {
  const [showAll, setShowAll] = useState(false);
  const allRows = Array.isArray(markets) ? markets : [];
  const rows = showAll ? allRows : allRows.slice(0, 6);
  const verifiedCount = allRows.filter(m => m.identity?.verified === true).length;

  return (
    <article className={`crypto-research-market-table-card ${kind}`}>
      <div className="crypto-research-subheading">
        <div>
          <span className="crypto-research-subheading-kicker">{kind === "dex" ? "ON-CHAIN VENUES" : "CENTRALIZED VENUES"}</span>
          <h3>{title}</h3>
        </div>
        <div className="crypto-research-table-summary">
          {kind === "dex" ? <span>{verifiedCount} verified</span> : null}
          <strong>{allRows.length}</strong>
          <span>markets</span>
        </div>
      </div>
      {rows.length ? (
        <>
          <div className="crypto-research-table-wrap">
            <table className="crypto-research-table">
              <thead>
                <tr>
                  <th>Venue</th><th>Pair</th><th>Price</th><th>24H Volume</th>
                  <th>Liquidity</th><th>Identity</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((market, index) => {
                  const verified = market.identity?.verified === true;
                  return (
                    <tr key={`${market.venue}-${market.productId ?? market.marketId ?? index}`} className={verified ? "is-verified" : "is-unverified"}>
                      <td><strong className="crypto-research-venue">{market.venue ?? "—"}</strong></td>
                      <td><span className="crypto-research-pair">{market.baseSymbol ?? "—"}<em>/</em>{market.quoteSymbol ?? "—"}</span></td>
                      <td>{money(market.priceUsd ?? market.price)}</td>
                      <td>{compact(market.volume24hUsd)}</td>
                      <td>{market.venueType === "DEX" ? compact(market.liquidityUsd) : "—"}</td>
                      <td>
                        <span className={`crypto-research-identity ${verified ? "verified" : market.venueType === "CEX" ? "canonical" : "unverified"}`}>
                          <span className="crypto-research-identity-dot" />
                          {verified ? "VERIFIED" : market.venueType === "CEX" ? "CANONICAL" : "UNVERIFIED"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {allRows.length > 6 ? (
            <button type="button" className="crypto-research-table-toggle" onClick={() => setShowAll(v => !v)}>
              {showAll ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}
              {showAll ? "Show fewer markets" : `View all ${allRows.length} markets`}
            </button>
          ) : null}
        </>
      ) : <div className="crypto-research-inline-empty"><Database size={18}/><span>{emptyText}</span></div>}
    </article>
  );
}

function ArbitragePanel({ arbitrage }) {
  if (!arbitrage) {
    return <div className="crypto-research-inline-empty"><ArrowRightLeft size={18}/><span>Arbitrage intelligence not returned.</span></div>;
  }
  const routes = Array.isArray(arbitrage.routes) ? arbitrage.routes : [];
  const identity = arbitrage.identityFilter ?? {};
  return (
    <>
      <div className="crypto-research-detail-grid crypto-research-arb-metrics">
        <MiniMetric label="Status" value={arbitrage.status ?? "—"} />
        <MiniMetric label="Observed" value={arbitrage.observedCount ?? routes.length ?? "—"} />
        <MiniMetric label="Depth Confirmed" value={arbitrage.depthConfirmedCount ?? 0} />
        <MiniMetric label="Cost Adjusted" value={arbitrage.costAdjustedCount ?? 0} />
        <MiniMetric label="Eligible Markets" value={identity.eligibleMarketCount ?? "—"} />
        <MiniMetric label="Excluded DEX" value={identity.excludedDexMarketCount ?? "—"} />
      </div>
      {routes.length ? (
        <div className="crypto-research-arb-list">
          {routes.slice(0, 10).map((route, index) => (
            <div className="crypto-research-arb-route" key={route.id ?? index}>
              <div>
                <strong>{route.type ?? route.routeType ?? "ARBITRAGE"}</strong>
                <span>{route.status ?? "OBSERVED"}</span>
              </div>
              <div>
                <span>{route.buy?.venue ?? route.buyVenue ?? "—"}</span>
                <ArrowRightLeft size={14}/>
                <span>{route.sell?.venue ?? route.sellVenue ?? "—"}</span>
              </div>
              <div>
                <strong>{route.spreadPct != null ? `${Number(route.spreadPct).toFixed(3)}%` : "—"}</strong>
                <small>{route.executable === true ? "EXECUTABLE EVIDENCE" : "RESEARCH ONLY"}</small>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="crypto-research-inline-empty">
          <ArrowRightLeft size={18}/>
          <div><strong>No verified dislocation</strong><span>Unverified ticker matches and incomplete cost/depth evidence are excluded fail-closed.</span></div>
        </div>
      )}
    </>
  );
}

function ValuationPanel({ valuation, currentPrice, marketCap }) {
  if (!valuation) {
    return (
      <div className="crypto-research-inline-empty">
        <Database size={18}/>
        <div><strong>Valuation not returned</strong><span>The UI will not fabricate missing valuation evidence.</span></div>
      </div>
    );
  }

  const current = valuation.current ?? {};
  const screening = valuation.screening ?? {};
  const scenarios = Array.isArray(valuation.scenarios) ? valuation.scenarios : [];
  const available = valuation?.availability?.available !== false &&
    !["EVIDENCE_UNAVAILABLE", "INSUFFICIENT_EVIDENCE"].includes(normalizeStatus(valuation.status));

  if (!available) {
    return (
      <div className="crypto-research-inline-empty">
        <AlertTriangle size={18}/>
        <div><strong>Valuation evidence unavailable</strong><span>{valuation?.availability?.reason ?? valuation?.status ?? "Insufficient market-cap evidence"}</span></div>
      </div>
    );
  }

  return (
    <>
      <div className="crypto-research-valuation-grid">
        <MiniMetric label="Current Price" value={money(first(current.priceUsd, currentPrice))} />
        <MiniMetric label="Market Cap" value={compact(first(current.marketCapUsd, marketCap))} />
        <MiniMetric label="FDV" value={compact(current.fdvUsd)} />
        <MiniMetric label="24H Volume" value={compact(current.volume24hUsd)} />
        <MiniMetric label="Volume / MC" value={current.volumeToMarketCap == null ? "—" : `${(Number(current.volumeToMarketCap) * 100).toFixed(2)}%`} />
        <MiniMetric label="Dilution Risk" value={valuation?.dilution?.risk ?? "—"} />
        <MiniMetric label="Candidate" value={screening.valuationCandidate === true ? "YES" : screening.valuationCandidate === false ? "NO" : "—"} />
        <MiniMetric label="Authority" value="0% CANONICAL" />
      </div>

      <div className="crypto-research-scaler">
        <div className="crypto-research-subheading">
          <h3>Market-Cap Scaler</h3>
          <span>Research-depth scenarios</span>
        </div>
        <div className="crypto-research-table-wrap">
          <table className="crypto-research-table">
            <thead><tr><th>Multiple</th><th>Implied Price</th><th>Required Market Cap</th><th>MC Increase</th><th>Implied FDV</th><th>Feasibility</th></tr></thead>
            <tbody>
              {scenarios.map(s => (
                <tr key={s.multiplier}>
                  <td><strong>{s.multiplier}×</strong></td>
                  <td>{money(s.impliedPriceUsd)}</td>
                  <td>{compact(s.requiredMarketCapUsd)}</td>
                  <td>{compact(s.impliedMarketCapIncreaseUsd)}</td>
                  <td>{compact(s.impliedFdvUsd)}</td>
                  <td><FeasibilityBadge value={s.feasibility}/></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="crypto-research-screening-note">
        <Target size={16}/>
        <div>
          <strong>{screening.label ?? "VALUATION SCREEN"}</strong>
          <span>{screening.note ?? "Relative-value research only."}</span>
        </div>
      </div>
    </>
  );
}

export default function CryptoResearch() {
  const [theme, setTheme] = useState(() => {
    const saved = window.localStorage.getItem("aema-crypto-theme");
    if (saved === "dark" || saved === "light") return saved;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });
  const [searchParams, setSearchParams] = useSearchParams();
  const cachedAtMount = useMemo(() => readResearchCache(), []);
  const urlAsset = text(searchParams.get("asset")).toUpperCase();
  const storedAsset = text(window.sessionStorage.getItem(RESEARCH_ASSET_KEY)).toUpperCase();
  const initialAsset = urlAsset || text(cachedAtMount?.symbol).toUpperCase() || storedAsset;

  const [query, setQuery] = useState(initialAsset);
  const [lastSymbol, setLastSymbol] = useState(
    text(cachedAtMount?.symbol).toUpperCase() === initialAsset ? initialAsset : ""
  );
  const [raw, setRaw] = useState(
    text(cachedAtMount?.symbol).toUpperCase() === initialAsset
      ? cachedAtMount?.raw ?? null
      : null
  );
  const [exchangeIntelligence, setExchangeIntelligence] = useState(
    text(cachedAtMount?.symbol).toUpperCase() === initialAsset
      ? cachedAtMount?.exchangeIntelligence ?? null
      : null
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(() => {
    if (
      text(cachedAtMount?.symbol).toUpperCase() === initialAsset &&
      cachedAtMount?.updatedAt
    ) {
      const parsed = new Date(cachedAtMount.updatedAt);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
    return null;
  });
  const [expanded, setExpanded] = useState({ technical: true });
  const restoredRef = useRef(false);

  useEffect(() => {
    window.localStorage.setItem("aema-crypto-theme", theme);
  }, [theme]);

  const payload = useMemo(() => extractPayload(raw), [raw]);
  const { research, engines, q2, valuation, asset } = payload;

  const researchScore = first(
    research?.researchScore,
    research?.score,
    raw?.researchScore,
  );
  const researchConfidence = first(
    research?.researchConfidence,
    research?.confidence,
    raw?.researchConfidence,
  );
  const researchCoverage = first(
    research?.researchCoverage,
    research?.coverage,
    raw?.researchCoverage,
  );

  const q2Decision = first(
    q2?.decision,
    q2?.status,
    q2?.result,
    research?.q2Decision,
  );

  const currentPrice = first(
    asset?.price,
    asset?.currentPrice,
    research?.price,
    raw?.price,
    valuation?.current?.priceUsd,
    valuation?.currentPrice,
  );
  const marketCap = first(
    asset?.marketCap,
    research?.marketCap,
    raw?.marketCap,
    valuation?.current?.marketCapUsd,
    valuation?.marketCap,
  );

  const runResearch = useCallback(async (symbol, { updateUrl = true } = {}) => {
    const clean = text(symbol).toUpperCase();
    if (!clean) {
      setError("Enter a crypto symbol such as BTC, ETH or SOL.");
      return;
    }

    if (updateUrl) {
      setSearchParams({ asset: clean }, { replace: true });
    }
    window.sessionStorage.setItem(RESEARCH_ASSET_KEY, clean);

    const controller = new AbortController();
    setLoading(true);
    setError(null);
    try {
      const [researchResult, exchangeResult] = await Promise.allSettled([
        requestResearch(clean, { signal: controller.signal }),
        requestExchangeIntelligence(clean, { signal: controller.signal }),
      ]);

      if (researchResult.status === "rejected") {
        throw researchResult.reason;
      }

      const result = researchResult.value;
      const exchangeData =
        exchangeResult.status === "fulfilled" ? exchangeResult.value : null;
      const updatedAt = new Date();

      setRaw(result);
      setExchangeIntelligence(exchangeData);
      setLastSymbol(clean);
      setQuery(clean);
      setLastUpdated(updatedAt);

      window.sessionStorage.setItem(
        RESEARCH_CACHE_KEY,
        JSON.stringify({
          symbol: clean,
          raw: result,
          exchangeIntelligence: exchangeData,
          updatedAt: updatedAt.toISOString(),
        }),
      );
    } catch (requestError) {
      setError(requestError?.message ?? "Unable to run crypto research.");
    } finally {
      setLoading(false);
    }
  }, [setSearchParams]);

  // Restore research when the user returns to this page. Cached results render
  // immediately; if the URL asset has no matching cache, research is reloaded.
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;

    if (!initialAsset) return;

    setQuery(initialAsset);
    window.sessionStorage.setItem(RESEARCH_ASSET_KEY, initialAsset);

    const cachedSymbol = text(cachedAtMount?.symbol).toUpperCase();
    if (cachedSymbol === initialAsset && cachedAtMount?.raw) {
      if (!urlAsset) {
        setSearchParams({ asset: initialAsset }, { replace: true });
      }
      return;
    }

    void runResearch(initialAsset, { updateUrl: !urlAsset });
  }, [initialAsset, cachedAtMount, runResearch, setSearchParams, urlAsset]);

  const submit = event => {
    event.preventDefault();
    void runResearch(query);
  };

  const engineKeys = [
    "technical",
    "fundamental",
    "supporting",
    "momentum",
    "liquidity",
    "onChain",
    "narrative",
    "news",
    "risk",
  ];

  const availableCount = engineKeys.filter(key => {
    const engine = engines[key];
    return (
      first(engine?.availability?.available, engine?.available) === true ||
      ["READY", "COMPLETE"].includes(normalizeStatus(engine?.status))
    );
  }).length;

  return (
    <div className={`crypto-shell crypto-theme-${theme}`}>
      <CryptoSidebar />

      <main className="crypto-research-page">
        <section className="crypto-research-header">
          <div className="crypto-research-heading">
            <span className="crypto-research-eyebrow">AEMA Crypto Intelligence</span>
            <h1>Crypto Research</h1>
            <p>
              Deep research workspace for one asset at a time. Review canonical
              research, engine evidence, coverage, Q2 qualification and valuation
              context without creating execution authority.
            </p>
          </div>

          <div className="crypto-research-header-actions">
            <div className="crypto-research-workspace-jump">
              <WorkspaceJumpButton target="stocks" />
            </div>

            <div className="crypto-research-paper-pill">
              <span className="crypto-research-runtime-dot" />
              PAPER
            </div>

            <button
              type="button"
              className="crypto-research-theme-toggle"
              onClick={() => setTheme(current => current === "dark" ? "light" : "dark")}
              aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
            >
              {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
            </button>

            <button
              type="button"
              className="crypto-research-refresh-button"
              disabled={loading || !lastSymbol}
              onClick={() => void runResearch(lastSymbol)}
            >
              <RefreshCw size={16} className={loading ? "spin" : ""} />
              <span>Refresh</span>
            </button>
          </div>
        </section>

        <section className="crypto-research-safety-strip">
          <div>
            <span>Workspace</span>
            <strong>RESEARCH</strong>
          </div>
          <div>
            <span>Execution</span>
            <strong>DISABLED</strong>
          </div>
          <div>
            <span>Mode</span>
            <strong>PAPER</strong>
          </div>
          <div>
            <span>Evidence Engines</span>
            <strong>{raw ? `${availableCount}/${engineKeys.length}` : "—"}</strong>
          </div>
        </section>

        <form className="crypto-research-search" onSubmit={submit}>
          <div className="crypto-research-search__input">
            <Search size={19} />
            <input
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Research a crypto asset — BTC, ETH, SOL..."
              autoComplete="off"
              spellCheck="false"
            />
            {query ? (
              <button type="button" onClick={() => setQuery("")} aria-label="Clear search">
                <XCircle size={17} />
              </button>
            ) : null}
          </div>
          <button type="submit" className="crypto-research-run-button" disabled={loading}>
            {loading ? <RefreshCw size={17} className="spin" /> : <Sparkles size={17} />}
            {loading ? "Researching…" : "Run Research"}
          </button>
        </form>

        {error ? (
          <section className="crypto-research-error">
            <AlertTriangle size={17} />
            <div>
              <strong>Research unavailable</strong>
              <span>{error}</span>
            </div>
          </section>
        ) : null}

        {!raw && !loading ? (
          <section className="crypto-research-welcome">
            <div className="crypto-research-welcome-icon"><Search size={26} /></div>
            <span>Deep Research Workspace</span>
            <h2>Enter an asset to inspect the complete research stack.</h2>
            <p>
              AEMA will display only evidence returned by the backend. Missing evidence
              remains unavailable — it is never converted into a neutral analytical score.
            </p>
            <div className="crypto-research-quick-assets">
              {["BTC", "ETH", "SOL"].map(symbol => (
                <button key={symbol} type="button" onClick={() => void runResearch(symbol)}>
                  {symbol}
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {loading && !raw ? (
          <section className="crypto-research-loading">
            <RefreshCw size={22} className="spin" />
            <strong>Running deep research</strong>
            <span>Collecting market, fundamental and supporting evidence…</span>
          </section>
        ) : null}

        {raw ? (
          <>
            <section className="crypto-research-overview">
              <article className="crypto-research-score-panel">
                <div className="crypto-research-panel-heading">
                  <div>
                    <span>Canonical Research</span>
                    <h2>{lastSymbol || "Asset"} Research Score</h2>
                  </div>
                  <Gauge size={20} />
                </div>

                <div className="crypto-research-score-layout">
                  <ScoreRing value={researchScore} />
                  <div className="crypto-research-score-stats">
                    <MiniMetric label="Confidence" value={percentText(researchConfidence)} />
                    <MiniMetric label="Coverage" value={percentText(researchCoverage)} />
                    <MiniMetric label="Current Price" value={money(currentPrice)} />
                    <MiniMetric label="Market Cap" value={compact(marketCap)} />
                  </div>
                </div>
              </article>

              <article className="crypto-research-q2-panel">
                <div className="crypto-research-panel-heading">
                  <div>
                    <span>Qualification Gate</span>
                    <h2>Q2 Decision</h2>
                  </div>
                  <ShieldCheck size={20} />
                </div>

                <div className={`crypto-research-decision ${statusTone(q2Decision)}`}>
                  {q2Decision ?? "NOT RETURNED"}
                </div>

                <div className="crypto-research-q2-grid">
                  <MiniMetric
                    label="Long Support"
                    value={scoreText(first(q2?.long?.mandatoryDirectional, q2?.long?.score, q2?.longSupport))}
                  />
                  <MiniMetric
                    label="Short Support"
                    value={scoreText(first(q2?.short?.mandatoryDirectional, q2?.short?.score, q2?.shortSupport))}
                  />
                  <MiniMetric
                    label="Technical Coverage"
                    value={percentText(first(q2?.mandatory?.technical?.coverage, q2?.technicalCoverage))}
                  />
                  <MiniMetric
                    label="Fundamental Coverage"
                    value={percentText(first(q2?.mandatory?.fundamental?.coverage, q2?.fundamentalCoverage))}
                  />
                </div>

                <div className="crypto-research-authority-note">
                  <ShieldCheck size={15} />
                  Research only. No live execution authority.
                </div>
              </article>
            </section>

            <section className="crypto-research-canonical">
              <div className="crypto-research-section-heading">
                <div>
                  <span>Canonical 20 / 20 / 60</span>
                  <h2>Research Pillars</h2>
                </div>
                <Layers3 size={20} />
              </div>

              <div className="crypto-research-pillar-grid">
                {[
                  ["technical", "Technical", "20%"],
                  ["fundamental", "Fundamental", "20%"],
                  ["supporting", "Supporting", "60%"],
                ].map(([key, label, weight]) => {
                  const engine = engines[key];
                  const available =
                    first(engine?.availability?.available, engine?.available) === true ||
                    ["READY", "COMPLETE"].includes(normalizeStatus(engine?.status));
                  return (
                    <article key={key} className="crypto-research-pillar">
                      <div className="crypto-research-pillar-top">
                        <span>{label}</span>
                        <strong>{weight}</strong>
                      </div>
                      <div className={`crypto-research-pillar-score ${toneFromScore(available ? engine?.score : null)}`}>
                        {available ? scoreText(engine?.score) : "—"}
                      </div>
                      <div className="crypto-research-pillar-meta">
                        <span>Confidence {available ? percentText(engine?.confidence) : "—"}</span>
                        <span>Coverage {available ? percentText(engine?.coverage) : "—"}</span>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>

            <section className="crypto-research-engines-section">
              <div className="crypto-research-section-heading">
                <div>
                  <span>Evidence Diagnostics</span>
                  <h2>Individual Engines</h2>
                </div>
                <strong className="crypto-research-count-pill">{availableCount}/{engineKeys.length}</strong>
              </div>

              <div className="crypto-research-engine-grid">
                {engineKeys.map(key => (
                  <EngineCard
                    key={key}
                    engineKey={key}
                    engine={engines[key]}
                    expanded={Boolean(expanded[key])}
                    onToggle={() =>
                      setExpanded(current => ({ ...current, [key]: !current[key] }))
                    }
                  />
                ))}
              </div>
            </section>

            <section className="crypto-research-exchange-section">
              <div className="crypto-research-section-heading">
                <div>
                  <span>Market Intelligence</span>
                  <h2>Exchanges, Liquidity & Arbitrage</h2>
                </div>
                <ArrowRightLeft size={20}/>
              </div>

              {exchangeIntelligence ? (
                <>
                  <div className="crypto-research-market-overview">
                    <MiniMetric label="CEX Markets" value={exchangeIntelligence?.summary?.cexMarketCount ?? "—"} />
                    <MiniMetric label="DEX Markets" value={exchangeIntelligence?.summary?.dexMarketCount ?? "—"} />
                    <MiniMetric label="Trusted Markets" value={exchangeIntelligence?.liquidityTrust?.trustedMarketCount ?? "—"} />
                    <MiniMetric label="Verified DEX" value={exchangeIntelligence?.identity?.verifiedDexMarketCount ?? "—"} />
                    <MiniMetric label="Trusted 24H Volume" value={compact(exchangeIntelligence?.liquidity?.volume24hUsd)} />
                    <MiniMetric label="Trusted DEX Liquidity" value={compact(exchangeIntelligence?.liquidity?.dexLiquidityUsd)} />
                  </div>

                  <div className="crypto-research-trust-note">
                    <ShieldCheck size={16}/>
                    <div>
                      <strong>Canonical identity boundary</strong>
                      <span>
                        Trusted liquidity uses verified canonical markets only.
                        Raw ticker-discovery liquidity is diagnostic and non-authoritative.
                      </span>
                    </div>
                  </div>

                  <div className="crypto-research-market-tables">
                    <MarketTable
                      title="Centralized Exchanges"
                      kind="cex"
                      markets={exchangeIntelligence?.cexMarkets}
                      emptyText="No CEX markets returned."
                    />
                    <MarketTable
                      title="Decentralized Exchanges"
                      kind="dex"
                      markets={exchangeIntelligence?.dexMarkets}
                      emptyText="No DEX markets returned."
                    />
                  </div>

                  <article className="crypto-research-panel crypto-research-arbitrage-panel">
                    <div className="crypto-research-panel-heading">
                      <div><span>Cross-Venue Research</span><h2>Arbitrage Intelligence</h2></div>
                      <ArrowRightLeft size={20}/>
                    </div>
                    <ArbitragePanel arbitrage={exchangeIntelligence?.arbitrage}/>
                  </article>

                  <article className="crypto-research-panel crypto-research-liquidity-panel">
                    <div className="crypto-research-panel-heading">
                      <div><span>Liquidity Integrity</span><h2>Trusted vs Raw Discovery</h2></div>
                      <Droplets size={20}/>
                    </div>
                    <div className="crypto-research-detail-grid">
                      <MiniMetric label="Trusted Volume" value={compact(exchangeIntelligence?.liquidity?.volume24hUsd)} />
                      <MiniMetric label="Raw Discovery Volume" value={compact(exchangeIntelligence?.rawDiscoveryLiquidity?.volume24hUsd)} />
                      <MiniMetric label="Trusted DEX Liquidity" value={compact(exchangeIntelligence?.liquidity?.dexLiquidityUsd)} />
                      <MiniMetric label="Raw DEX Liquidity" value={compact(exchangeIntelligence?.rawDiscoveryLiquidity?.dexLiquidityUsd)} />
                      <MiniMetric label="Excluded Markets" value={exchangeIntelligence?.liquidityTrust?.excludedMarketCount ?? "—"} />
                      <MiniMetric label="Unverified DEX Excluded" value={exchangeIntelligence?.liquidityTrust?.unverifiedDexExcluded ?? "—"} />
                    </div>
                  </article>
                </>
              ) : (
                <div className="crypto-research-inline-empty">
                  <Building2 size={18}/>
                  <div>
                    <strong>Exchange intelligence unavailable</strong>
                    <span>The scanner research is available, but the exchange-intelligence endpoint did not return data.</span>
                  </div>
                </div>
              )}
            </section>

            <section className="crypto-research-lower-grid">
              <article className="crypto-research-panel">
                <div className="crypto-research-panel-heading">
                  <div>
                    <span>Evidence Integrity</span>
                    <h2>Research Coverage</h2>
                  </div>
                  <CheckCircle2 size={20} />
                </div>
                <EvidenceRow label="Canonical Research" value={scoreText(researchScore)} status="READY" />
                <EvidenceRow label="Research Confidence" value={percentText(researchConfidence)} status="READY" />
                <EvidenceRow label="Research Coverage" value={percentText(researchCoverage)} status="READY" />
                <EvidenceRow
                  label="On-Chain"
                  value={normalizeStatus(engines?.onChain?.status)}
                  status={engines?.onChain?.status}
                />
                <EvidenceRow
                  label="Narrative"
                  value={normalizeStatus(engines?.narrative?.status)}
                  status={engines?.narrative?.status}
                />
                <EvidenceRow
                  label="News"
                  value={normalizeStatus(engines?.news?.status)}
                  status={engines?.news?.status}
                />
              </article>

              <article className="crypto-research-panel">
                <div className="crypto-research-panel-heading">
                  <div>
                    <span>Relative Value</span>
                    <h2>Valuation Context</h2>
                  </div>
                  <TrendingDown size={20} />
                </div>

                <ValuationPanel
                  valuation={valuation}
                  currentPrice={currentPrice}
                  marketCap={marketCap}
                />
              </article>
            </section>

            <footer className="crypto-research-footer">
              <span>{lastSymbol} research workspace</span>
              <span>Paper execution only</span>
              <span>Live execution disabled</span>
              <span>
                {lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString()}` : "Not yet refreshed"}
              </span>
            </footer>
          </>
        ) : null}
      </main>
    </div>
  );
}
