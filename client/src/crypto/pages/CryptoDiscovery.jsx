import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity, BarChart3, ChevronDown, ChevronUp, CircleDollarSign,
  Compass, Database, ExternalLink, Filter, Flame, Layers3, Moon,
  RefreshCw, Search, ShieldCheck, Sparkles, Sun, TrendingUp, Users,
} from "lucide-react";
import CryptoSidebar from "../components/CryptoSidebar.jsx";
import WorkspaceJumpButton from "../../components/WorkspaceJumpButton.jsx";
import { getCryptoDiscovery } from "../services/cryptoApi.js";
import "./CryptoDashboard.css";
import "./CryptoDiscovery.css";

const TABS = [
  ["overall", "Overall"], ["cex", "CEX"], ["dex", "DEX"],
  ["emerging", "Emerging DEX"], ["undervalued", "Undervalued"], ["queue", "Research Queue"],
];

const n = (v) => Number.isFinite(Number(v)) ? Number(v) : null;
const first = (...v) => v.find((x) => x !== undefined && x !== null);
const arr = (...v) => v.find(Array.isArray) ?? [];
const text = (v, fallback = "—") => v === undefined || v === null || v === "" ? fallback : String(v);
const fmt = (v, digits = 2) => n(v) === null ? "—" : new Intl.NumberFormat("en-US", { maximumFractionDigits: digits }).format(n(v));
const money = (v) => {
  const x = n(v); if (x === null) return "—";
  if (Math.abs(x) >= 1e9) return `$${(x / 1e9).toFixed(2)}B`;
  if (Math.abs(x) >= 1e6) return `$${(x / 1e6).toFixed(2)}M`;
  if (Math.abs(x) >= 1e3) return `$${(x / 1e3).toFixed(1)}K`;
  return `$${x.toLocaleString("en-US", { maximumFractionDigits: x < 1 ? 6 : 2 })}`;
};
const pct = (v) => n(v) === null ? "—" : `${n(v) > 0 ? "+" : ""}${n(v).toFixed(2)}%`;
const tone = (v) => n(v) > 0 ? "positive" : n(v) < 0 ? "negative" : "neutral";
const scoreTone = (v) => n(v) === null ? "muted" : n(v) >= 75 ? "strong" : n(v) >= 60 ? "watch" : "weak";

function normalizeCandidate(raw = {}, index = 0) {
  const m = raw.measurements ?? raw.market ?? raw.asset ?? {};
  const intel = raw.intelligence ?? raw.discoveryIntelligence ?? raw.discovery ?? {};
  const gpt = raw.gptIntelligence ?? raw.gpt ?? raw.intelligence?.gpt ?? {};
  const venues = raw.venues ?? m.venues ?? {};
  const cexCount = first(raw.cexCount, m.cexCount, venues.cexCount, 0);
  const dexCount = first(raw.dexCount, m.dexCount, venues.dexCount, 0);
  const marketType = first(raw.marketType, raw.candidateType, cexCount > 0 ? "CEX" : dexCount > 0 ? "DEX" : "UNKNOWN");
  return {
    id: first(raw.assetId, raw.id, m.assetId, raw.contractAddress, `${raw.symbol ?? "asset"}-${index}`),
    symbol: text(first(raw.symbol, m.symbol, raw.asset?.symbol), "?"),
    name: text(first(raw.name, m.name, raw.asset?.name), "Unknown asset"),
    score: first(raw.discoveryScore, raw.discoveryScannerScore, raw.scannerScore, raw.qualificationScore, raw.score),
    edge: first(raw.directionEdge, raw.edge),
    direction: text(first(raw.preferredDirection, raw.direction, raw.bias, raw.signal), "NEUTRAL"),
    price: first(raw.priceUsd, raw.price, m.priceUsd, m.price),
    volume: first(raw.volume24hUsd, raw.volume24h, m.volume24hUsd, m.volume24h),
    liquidity: (() => {
      const value = n(first(raw.liquidityUsd, raw.dexLiquidityUsd, m.liquidityUsd, m.dexLiquidityUsd));
      return value !== null && value > 0 ? value : null;
    })(),
    change24h: first(raw.change24hPercent, raw.priceChange24hPercent, raw.change24h, m.change24hPercent, m.priceChange24hPercent),
    cexCount: n(cexCount) ?? 0, dexCount: n(dexCount) ?? 0,
    marketType: text(marketType).toUpperCase(),
    qualified: Boolean(first(raw.qualified, raw.eligible, true)),
    highInterest: Boolean(raw.highInterest),
    researchOnly: Boolean(first(raw.researchOnly, raw.policy?.researchOnly, (n(cexCount) ?? 0) === 0 && (n(dexCount) ?? 0) > 0)),
    volumeQuality: raw.deterministicIntelligence?.volumeQuality ?? intel.volumeQuality ?? {},
    liquidityIntel: raw.deterministicIntelligence?.liquidity ?? intel.liquidity ?? {},
    emerging: raw.deterministicIntelligence?.emergingProject ?? intel.emergingProject ?? raw.emergingProject ?? {},
    integrity: raw.deterministicIntelligence?.projectIntegrity ?? intel.projectIntegrity ?? raw.projectIntegrity ?? {},
    trend: raw.trendIntelligence ?? {},
    activity: raw.activity ?? {},
    news: gpt.news ?? raw.news ?? {},
    events: gpt.events ?? raw.events ?? {},
    narrative: gpt.socialNarrative ?? gpt.narrative ?? raw.socialNarrative ?? raw.narrative ?? {},
    valuation: raw.engines?.valuation ?? raw.valuation ?? raw.research?.valuation ?? null,
    marketCap: first(
      raw.engines?.valuation?.current?.marketCapUsd,
      raw.valuation?.current?.marketCapUsd,
      raw.marketCapUsd,
      raw.marketCap,
      m.marketCapUsd,
      m.marketCap
    ),
    fdv: first(
      raw.engines?.valuation?.current?.fdvUsd,
      raw.valuation?.current?.fdvUsd,
      raw.fdvUsd,
      raw.fullyDilutedValuationUsd,
      m.fdvUsd
    ),
    valuationCandidate: Boolean(
      first(
        raw.engines?.valuation?.screening?.valuationCandidate,
        raw.valuation?.screening?.valuationCandidate,
        false
      )
    ),
    valuationLabel: text(
      first(
        raw.engines?.valuation?.screening?.label,
        raw.valuation?.screening?.label
      ),
      "NOT_EVALUATED"
    ),
    valuationSignals: arr(
      raw.engines?.valuation?.screening?.signals,
      raw.valuation?.screening?.signals
    ),
    sources: arr(gpt.sources, raw.sources, intel.sources), raw,
  };
}

function normalizePayload(payload = {}) {
  const root = payload.discovery ?? payload.data ?? payload;
  const groups = root.candidates ?? root.lists ?? root;
  const overall = arr(root.top20Overall);
  const cex = arr(root.top20Cex);
  const dex = arr(root.top20Dex);
  const emerging = arr(root.emergingDexTrends);
  const queue = arr(root.researchQueue);
  const norm = (xs) => xs.map(normalizeCandidate);

  const normalizedOverall = norm(overall);
  const normalizedCex = norm(cex);
  const normalizedDex = norm(dex);
  const normalizedEmerging = norm(emerging);
  const normalizedQueue = norm(queue);

  /*
   * Valuation is research depth only (0% canonical weight).
   * Discovery only labels an asset as a relative-value candidate when
   * the backend valuation engine explicitly flags it. We do not infer
   * "undervalued" merely from a small market cap.
   */
  const undervaluedSource = arr(
    root.undervaluedTokens,
    root.relativeValueCandidates,
    root.valuationCandidates
  );

  const normalizedUndervalued = undervaluedSource.length
    ? norm(undervaluedSource)
    : [...normalizedOverall, ...normalizedCex, ...normalizedDex]
        .filter((item, index, all) =>
          item.valuationCandidate &&
          all.findIndex((other) => other.id === item.id) === index
        )
        .sort((a, b) => (n(b.score) ?? -1) - (n(a.score) ?? -1));

  return {
    root,
    overall: normalizedOverall,
    cex: normalizedCex,
    dex: normalizedDex,
    emerging: normalizedEmerging,
    undervalued: normalizedUndervalued,
    queue: normalizedQueue,
  };
}

function Metric({ icon: Icon, label, value, detail }) {
  return <article className="crypto-discovery-metric"><span className="crypto-discovery-metric-icon"><Icon size={17}/></span><div><span>{label}</span><strong>{value}</strong><small>{detail}</small></div></article>;
}

function Evidence({ label, bucket }) {
  const available = bucket?.available === true || n(bucket?.score) !== null;
  return <div className="crypto-discovery-evidence"><span>{label}</span><strong className={available ? scoreTone(bucket?.score) : "muted"}>{available ? `${fmt(bucket?.score, 0)}/100` : "Unavailable"}</strong></div>;
}

function CandidateRow({ item, rank, expanded, onToggle }) {
  const sources = arr(item.sources, item.news?.sources, item.events?.sources, item.narrative?.sources);
  return <>
    <div className="crypto-discovery-row">
      <div className="crypto-discovery-rank">{rank}</div>
      <div className="crypto-discovery-asset"><span className="crypto-discovery-token-mark">{item.symbol.slice(0, 1)}</span><div><strong>{item.symbol}</strong><span>{item.name}</span></div></div>
      <div className="crypto-discovery-score"><strong className={scoreTone(item.score)}>{n(item.score) === null ? "—" : fmt(item.score, 1)}</strong><span>Discovery</span></div>
      <div className="crypto-discovery-market"><strong>{item.marketType}</strong><span>{item.cexCount} CEX · {item.dexCount} DEX</span></div>
      <div className="crypto-discovery-number"><strong>{money(item.volume)}</strong><span>24H volume</span></div>
      <div className="crypto-discovery-number"><strong>{money(item.liquidity)}</strong><span>Liquidity</span></div>
      <div className={`crypto-discovery-number ${tone(item.change24h)}`}><strong>{pct(item.change24h)}</strong><span>24H</span></div>
      <div className="crypto-discovery-policy">{item.researchOnly ? <span className="research-only">RESEARCH ONLY</span> : <span className="qualified">QUALIFIED</span>}</div>
      <button className="crypto-discovery-expand" type="button" onClick={onToggle} aria-label={`Open ${item.symbol} evidence`}>{expanded ? <ChevronUp size={16}/> : <ChevronDown size={16}/>}</button>
    </div>
    {expanded ? <div className="crypto-discovery-detail">
      <div className="crypto-discovery-evidence-grid"><Evidence label="News" bucket={item.news}/><Evidence label="Events" bucket={item.events}/><Evidence label="Narrative" bucket={item.narrative}/><Evidence label="Integrity" bucket={item.integrity}/></div>
      <div className="crypto-discovery-detail-copy"><div><span>Direction</span><strong>{item.direction}</strong></div><div><span>Direction edge</span><strong>{n(item.edge) === null ? "—" : fmt(item.edge, 1)}</strong></div><div><span>Market price</span><strong>{money(item.price)}</strong></div><div><span>Evidence policy</span><strong>{item.researchOnly ? "No execution authority" : "Deep research eligible"}</strong></div></div>
      {item.valuation ? <div className="crypto-discovery-valuation">
        <div className="crypto-discovery-valuation-head"><div><span>VALUATION ENGINE · 0% CANONICAL WEIGHT</span><strong>{item.valuationCandidate ? "Relative-value candidate" : "Not flagged"}</strong></div><span className={item.valuationCandidate ? "flagged" : "neutral"}>{item.valuationLabel.replaceAll("_", " ")}</span></div>
        <div className="crypto-discovery-valuation-grid">
          <div><span>Market Cap</span><strong>{money(item.marketCap)}</strong></div>
          <div><span>FDV</span><strong>{money(item.fdv)}</strong></div>
          <div><span>Volume / MC</span><strong>{n(item.valuation?.current?.volumeToMarketCap) === null ? "—" : `${(n(item.valuation.current.volumeToMarketCap) * 100).toFixed(2)}%`}</strong></div>
          <div><span>Dilution Risk</span><strong>{text(item.valuation?.dilution?.risk)}</strong></div>
        </div>
        {item.valuationSignals.length ? <div className="crypto-discovery-valuation-signals">{item.valuationSignals.map((signal) => <span key={signal}>{String(signal).replaceAll("_", " ")}</span>)}</div> : null}
        <small>Screening signal only. A low market cap alone is not treated as evidence that a token is undervalued.</small>
      </div> : null}
      {sources.length ? <div className="crypto-discovery-sources"><span>Evidence sources</span><div>{sources.slice(0, 6).map((s, i) => { const url = typeof s === "string" ? s : s?.url; const label = typeof s === "string" ? `Source ${i + 1}` : s?.title ?? s?.domain ?? `Source ${i + 1}`; return url ? <a key={`${url}-${i}`} href={url} target="_blank" rel="noreferrer">{label}<ExternalLink size={11}/></a> : null; })}</div></div> : null}
    </div> : null}
  </>;
}

export default function CryptoDiscovery() {
  const [theme, setTheme] = useState(() => localStorage.getItem("aema-crypto-theme") || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
  const [payload, setPayload] = useState(null); const [loading, setLoading] = useState(true); const [refreshing, setRefreshing] = useState(false); const [error, setError] = useState(null);
  const [tab, setTab] = useState("overall"); const [query, setQuery] = useState(""); const [expanded, setExpanded] = useState(null); const [updated, setUpdated] = useState(null);
  useEffect(() => localStorage.setItem("aema-crypto-theme", theme), [theme]);
  const load = useCallback(async (manual = false) => { try { manual ? setRefreshing(true) : setLoading(true); setError(null); const data = await getCryptoDiscovery({ refresh: manual }); setPayload(data); setUpdated(new Date()); } catch (e) { setError(e?.message ?? "Unable to load crypto discovery."); } finally { setLoading(false); setRefreshing(false); } }, []);
  useEffect(() => { void load(false); }, [load]);
  const data = useMemo(() => normalizePayload(payload ?? {}), [payload]);
  const current = data[tab] ?? [];
  const filtered = useMemo(() => { const q = query.trim().toLowerCase(); return q ? current.filter((x) => `${x.symbol} ${x.name} ${x.marketType}`.toLowerCase().includes(q)) : current; }, [current, query]);
  const universeCount = data.root?.universe?.assetCount ?? 0;
  const qualifiedCount = data.root?.qualification?.qualified ?? 0;
  const cexQualifiedCount = data.root?.qualification?.cexQualified ?? 0;
  const dexQualifiedCount = data.root?.qualification?.dexQualified ?? 0;
  const gptCount = data.root?.gpt?.shortlisted ?? 0;

  return <div className={`crypto-shell crypto-theme-${theme}`}><CryptoSidebar/><main className="crypto-discovery-page">
    <section className="crypto-discovery-header"><div><span className="crypto-eyebrow">AEMA Crypto Intelligence</span><h1>Crypto Discovery</h1><p>Qualification command center for high-quality CEX candidates, DEX opportunities and emerging market intelligence before six-engine deep research.</p></div><div className="crypto-header-actions"><div className="crypto-workspace-jump"><WorkspaceJumpButton target="stocks"/></div><button className="crypto-theme-toggle" type="button" onClick={() => setTheme(x => x === "dark" ? "light" : "dark")}>{theme === "dark" ? <Sun size={17}/> : <Moon size={17}/>}</button><button className="crypto-refresh-button" type="button" disabled={refreshing} onClick={() => void load(true)}><RefreshCw size={16} className={refreshing ? "spin" : ""}/>Refresh</button></div></section>
    {error ? <section className="crypto-error-banner"><strong>Discovery unavailable</strong><span>{error}</span></section> : null}
    <section className="crypto-discovery-pipeline"><div className="active"><Database size={15}/><span>Universe</span></div><i/><div><Filter size={15}/><span>Cheap Filter</span></div><i/><div><ShieldCheck size={15}/><span>Qualification</span></div><i/><div><Sparkles size={15}/><span>Intelligence</span></div><i/><div><Activity size={15}/><span>Deep Research</span></div></section>
    <section className="crypto-discovery-metrics"><Metric icon={Database} label="Universe" value={fmt(universeCount, 0)} detail="CEX + DEX assets"/><Metric icon={ShieldCheck} label="Qualified" value={fmt(qualifiedCount, 0)} detail="Passed hard eligibility"/><Metric icon={BarChart3} label="CEX qualified" value={fmt(cexQualifiedCount, 0)} detail={`${data.cex.length} in top shortlist`}/><Metric icon={Layers3} label="DEX qualified" value={fmt(dexQualifiedCount, 0)} detail={`${data.dex.length} in top shortlist`}/><Metric icon={Flame} label="Emerging DEX" value={data.emerging.length} detail="Research-only trends"/><Metric icon={CircleDollarSign} label="Relative value" value={data.undervalued.length} detail="Valuation engine flags"/><Metric icon={Sparkles} label="Intel enriched" value={gptCount} detail="News · events · narrative"/></section>
    <section className="crypto-discovery-workspace"><div className="crypto-discovery-toolbar"><div className="crypto-discovery-tabs">{TABS.map(([id,label]) => <button key={id} className={tab === id ? "active" : ""} onClick={() => {setTab(id); setExpanded(null);}}>{label}<span>{data[id]?.length ?? 0}</span></button>)}</div><label className="crypto-discovery-search"><Search size={15}/><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter symbol or project"/></label></div>
      <div className="crypto-discovery-table-head"><span>#</span><span>Asset</span><span>Score</span><span>Market</span><span>Volume</span><span>Liquidity</span><span>24H</span><span>Policy</span><span/></div>
      {loading ? <div className="crypto-discovery-loading"><RefreshCw className="spin" size={22}/><strong>Running discovery pipeline</strong><span>Loading qualified market candidates…</span></div> : filtered.length ? <div className="crypto-discovery-list">{filtered.map((item, i) => <CandidateRow key={`${item.id}-${i}`} item={item} rank={i+1} expanded={expanded === `${item.id}-${i}`} onToggle={() => setExpanded(expanded === `${item.id}-${i}` ? null : `${item.id}-${i}`)}/>)}</div> : <div className="crypto-discovery-empty"><Compass size={24}/><strong>No candidates in this view</strong><span>No real candidates were returned for the selected discovery category.</span></div>}
    </section>
    <footer className="crypto-discovery-footer"><span><CircleDollarSign size={12}/> Research display only · no execution authority</span><span>{updated ? `Updated ${updated.toLocaleTimeString()}` : "Waiting for discovery data"}</span></footer>
  </main></div>;
}
