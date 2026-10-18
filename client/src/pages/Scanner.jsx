import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getScannerSnapshot,
  getStockCandles,
  analyzeStock,
  runScannerOnce,
  startScanner,
  stopScanner,
} from "../services/api";
import Sidebar from "../components/Sidebar.jsx";
import TradingChart from "../components/scanner/TradingChart.jsx";
import "./Scanner.css";

import "../components/StockExecutiveFinish.css";
const EMPTY = Object.freeze([]);

function finite(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function first(...values) {
  return values.find((value) => value !== null && value !== undefined);
}

function firstArray(...values) {
  return values.find(Array.isArray) ?? EMPTY;
}

function formatNumber(value) {
  const parsed = finite(value);
  return parsed === null ? "—" : parsed.toLocaleString();
}

function formatScore(value) {
  const parsed = finite(value);
  return parsed === null ? "—" : parsed.toFixed(1);
}

function formatPrice(value) {
  const parsed = finite(value);
  if (parsed === null) return "—";
  return parsed.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });
}

function formatPercent(value) {
  const parsed = finite(value);
  if (parsed === null) return "—";
  return `${parsed > 0 ? "+" : ""}${parsed.toFixed(2)}%`;
}

function formatCompact(value) {
  const parsed = finite(value);
  if (parsed === null) return "—";
  return new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(parsed);
}

function formatTimestamp(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function normalizedStatus(value) {
  return String(value ?? "UNKNOWN").trim().toUpperCase();
}

function toneFor(value) {
  const status = normalizedStatus(value);
  if (/RUNNING|READY|COMPLETE|QUALIFIED|LONG|BUY|BULL/.test(status)) return "positive";
  if (/ERROR|FAILED|BLOCKED|STOPPED|SHORT|SELL|BEAR/.test(status)) return "negative";
  if (/PARTIAL|WATCH|SCANNING|STARTING|WARM/.test(status)) return "warning";
  return "neutral";
}

function StatusBadge({ value }) {
  return (
    <span className={`scanner-badge scanner-badge--${toneFor(value)}`}>
      {normalizedStatus(value).replaceAll("_", " ")}
    </span>
  );
}

function StatCard({ label, value, note }) {
  return (
    <div className="scanner-stat">
      <span className="scanner-stat__label">{label}</span>
      <strong className="scanner-stat__value">{value}</strong>
      <small className="scanner-stat__note">{note || "\u00A0"}</small>
    </div>
  );
}

function normalizeCandidate(row, index) {
  const measurements = row?.measurements ?? {};
  const market = row?.market ?? row?.marketData ?? row?.snapshot ?? {};
  const finalDecision = row?.finalDecision ?? {};
  const score = first(
    row?.scannerScore,
    row?.score,
    row?.researchScore,
    row?.deepScore,
  );

  return {
    id: row?.id ?? row?.symbol ?? `scanner-row-${index}`,
    raw: row,
    symbol: row?.symbol ?? row?.ticker ?? null,
    name: row?.name ?? row?.companyName ?? null,
    score,
    longScore: first(row?.longScannerScore, row?.longScore),
    shortScore: first(row?.shortScannerScore, row?.shortScore),
    edge: first(row?.directionEdge, row?.edge),
    direction: first(
      row?.preferredDirection,
      row?.direction,
      finalDecision?.direction,
    ),
    status: first(
      row?.scannerStatus,
      row?.researchStatus,
      row?.status,
    ),
    price: first(
      row?.price,
      row?.lastPrice,
      measurements?.price,
      measurements?.lastPrice,
      market?.price,
      market?.lastPrice,
    ),
    changePercent: first(
      row?.changePercent,
      row?.changePct,
      measurements?.changePercent,
      measurements?.changePct,
      market?.changePercent,
      market?.changePct,
    ),
    volume: first(
      row?.volume,
      row?.volumeToday,
      measurements?.volume,
      measurements?.volumeToday,
      market?.volume,
    ),
    relativeVolume: first(
      row?.relativeVolume,
      measurements?.relativeVolume,
      measurements?.rvol,
    ),
    volatility: first(
      row?.volatility,
      measurements?.volatility,
      measurements?.atrPercent,
    ),
    deepScore: row?.deepScore ?? null,
    researchStatus: row?.researchStatus ?? null,
    scanCount: row?.scanCount ?? null,
    lastSeenAt: row?.lastSeenAt ?? null,
    reasons: firstArray(
      row?.scannerReasons,
      row?.reasons,
      finalDecision?.reasons,
    ),
  };
}

function getScannerObject(snapshot) {
  return snapshot?.scanner ?? snapshot?.state ?? snapshot?.scannerState ?? {};
}

function getRegistryObject(snapshot) {
  return snapshot?.registry ?? snapshot?.registryStats ?? {};
}

function getProgressObject(snapshot) {
  return snapshot?.researchProgress ?? snapshot?.research ?? {};
}

function metric(snapshot, ...keys) {
  const scanner = getScannerObject(snapshot);
  const registry = getRegistryObject(snapshot);
  const progress = getProgressObject(snapshot);
  const sources = [
    snapshot,
    snapshot?.stats,
    scanner,
    scanner?.stats,
    scanner?.lastCycleResult,
    scanner?.lastCycleResult?.stats,
    registry,
    progress,
  ].filter(Boolean);

  for (const key of keys) {
    for (const source of sources) {
      if (source?.[key] !== null && source?.[key] !== undefined) {
        return source[key];
      }
    }
  }
  return null;
}

export default function Scanner({
  onOpenResearch,
  pollMs = 15000,
  limit = 20,
}) {
  const mounted = useRef(true);
  const [lightTheme, setLightTheme] = useState(() => localStorage.getItem("aema-stock-theme") === "light");
  const [showDiscovery, setShowDiscovery] = useState(false);
  useEffect(() => {
    document.documentElement.classList.toggle("aema-stock-light", lightTheme);
    localStorage.setItem("aema-stock-theme", lightTheme ? "light" : "dark");
  }, [lightTheme]);
  const [snapshot, setSnapshot] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem("aema:stock:scanner:snapshot") || "null"); }
    catch { return null; }
  });
  const [chartSymbol, setChartSymbol] = useState(() => localStorage.getItem("aema:stock:chart:symbol") || "AAPL");
  const [symbolInput, setSymbolInput] = useState(chartSymbol);
  const [chartData, setChartData] = useState([]);
  const [chartLoading, setChartLoading] = useState(false);
  const [chartError, setChartError] = useState("");
  const [analysis, setAnalysis] = useState(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [runningOnce, setRunningOnce] = useState(false);
  const [lifecycleBusy, setLifecycleBusy] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [view, setView] = useState("ALL");
  const [sort, setSort] = useState("SCORE");
  const [selected, setSelected] = useState(null);

  const loadSnapshot = useCallback(async ({ silent = false } = {}) => {
    try {
      if (!silent) setLoading(true);
      const response = await getScannerSnapshot({ limit });
      if (!mounted.current) return;
      setSnapshot(response ?? null);
      try { sessionStorage.setItem("aema:stock:scanner:snapshot", JSON.stringify(response ?? null)); } catch {}
      setError("");
    } catch (requestError) {
      if (!mounted.current) return;
      setError(
        requestError?.payload?.error ??
        requestError?.message ??
        "Unable to load scanner snapshot.",
      );
    } finally {
      if (mounted.current && !silent) setLoading(false);
    }
  }, [limit]);

  useEffect(() => {
    mounted.current = true;
    if (!snapshot) loadSnapshot();
    return () => { mounted.current = false; };
    // Initial snapshot is loaded only when no cached result exists.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const key = `aema:stock:candles:${chartSymbol}`;
    try {
      const cached = JSON.parse(localStorage.getItem(key) || "null");
      if (cached) { setChartData(cached); setChartError(""); return; }
    } catch {}
    let active = true;
    setChartLoading(true);
    getStockCandles(chartSymbol, {limit: 500}).then(data => {
      if (!active) return;
      setChartData(data);
      try { localStorage.setItem(key, JSON.stringify(data)); } catch {}
      setChartError("");
    }).catch(e => { if (active) setChartError(e?.message || "Chart data unavailable"); })
      .finally(() => { if (active) setChartLoading(false); });
    return () => { active = false; };
  }, [chartSymbol]);

  const searchChart = (event) => {
    event.preventDefault();
    const next = symbolInput.trim().toUpperCase();
    if (!/^[A-Z][A-Z0-9.\-]{0,11}$/.test(next)) { setChartError("Enter a valid stock ticker."); return; }
    setChartSymbol(next);
    setAnalysis(null);
    localStorage.setItem("aema:stock:chart:symbol", next);
  };

  const refreshChart = async () => {
    setChartLoading(true); setChartError("");
    try {
      const data = await getStockCandles(chartSymbol, {limit: 500});
      setChartData(data);
      try { localStorage.setItem(`aema:stock:candles:${chartSymbol}`, JSON.stringify(data)); } catch {}
    } catch(e) { setChartError(e?.message || "Chart refresh failed"); }
    finally { setChartLoading(false); }
  };

  const researchChart = async () => {
    setAnalysisLoading(true); setChartError("");
    try { setAnalysis(await analyzeStock(chartSymbol, {useLiveSocial: true, clientTimeoutMs: 90000})); }
    catch(e) { setChartError(e?.message || "Research unavailable"); }
    finally { setAnalysisLoading(false); }
  };

  const scanner = getScannerObject(snapshot);
  const scannerStatus = first(
    scanner?.status,
    snapshot?.status,
    "UNKNOWN",
  );

  const isScannerRunning = /RUNNING|STARTING|SCANNING/.test(
    normalizedStatus(scannerStatus),
  );

  const candidatesRaw = firstArray(
    snapshot?.candidates,
    snapshot?.watchlist,
    snapshot?.registry?.candidates,
  );

  const qualifiedRaw = firstArray(
    snapshot?.qualifiedCandidates,
    snapshot?.qualified,
  );

  const candidates = useMemo(
    () => candidatesRaw.map(normalizeCandidate),
    [candidatesRaw],
  );

  const qualifiedSymbols = useMemo(
    () => new Set(
      qualifiedRaw
        .map((item) => String(item?.symbol ?? "").toUpperCase())
        .filter(Boolean),
    ),
    [qualifiedRaw],
  );

  const visible = useMemo(() => {
    const search = query.trim().toUpperCase();

    const filtered = candidates.filter((candidate) => {
      if (
        search &&
        !`${candidate.symbol ?? ""} ${candidate.name ?? ""}`
          .toUpperCase()
          .includes(search)
      ) {
        return false;
      }

      if (view === "QUALIFIED") {
        return (
          qualifiedSymbols.has(String(candidate.symbol ?? "").toUpperCase()) ||
          /QUALIFIED/.test(normalizedStatus(candidate.status))
        );
      }

      if (view === "LONG") {
        return /LONG|BUY|BULL/.test(normalizedStatus(candidate.direction));
      }

      if (view === "SHORT") {
        return /SHORT|SELL|BEAR/.test(normalizedStatus(candidate.direction));
      }

      return true;
    });

    return [...filtered].sort((a, b) => {
      if (sort === "EDGE") {
        return (finite(b.edge) ?? -Infinity) - (finite(a.edge) ?? -Infinity);
      }
      if (sort === "LONG") {
        return (finite(b.longScore) ?? -Infinity) - (finite(a.longScore) ?? -Infinity);
      }
      if (sort === "SHORT") {
        return (finite(b.shortScore) ?? -Infinity) - (finite(a.shortScore) ?? -Infinity);
      }
      if (sort === "RVOL") {
        return (finite(b.relativeVolume) ?? -Infinity) - (finite(a.relativeVolume) ?? -Infinity);
      }
      return (finite(b.score) ?? -Infinity) - (finite(a.score) ?? -Infinity);
    });
  }, [candidates, qualifiedSymbols, query, sort, view]);

  useEffect(() => {
    if (!selected && visible.length) {
      setSelected(visible[0]);
    }
  }, [selected, visible]);

  const handleRunOnce = async () => {
    if (runningOnce) return;
    setRunningOnce(true);
    setError("");

    try {
      await runScannerOnce({});
      await loadSnapshot({ silent: true });
    } catch (requestError) {
      setError(
        requestError?.payload?.error ??
        requestError?.message ??
        "The scanner cycle failed.",
      );
    } finally {
      if (mounted.current) setRunningOnce(false);
    }
  };

  const handleLifecycle = async () => {
    if (lifecycleBusy) return;
    setLifecycleBusy(true);
    setError("");

    try {
      if (isScannerRunning) {
        await stopScanner({ waitForCurrentCycle: true });
      } else {
        await startScanner({});
      }
      await loadSnapshot({ silent: true });
    } catch (requestError) {
      setError(
        requestError?.payload?.error ??
        requestError?.message ??
        "Unable to change scanner state.",
      );
    } finally {
      if (mounted.current) setLifecycleBusy(false);
    }
  };

  const universe = metric(snapshot, "universe", "universeCount", "universeSize");
  const warmed = metric(snapshot, "warmed", "warmedCount", "marketDataReady");
  const measured = metric(snapshot, "measured", "measuredCount", "measurementsBuilt");
  const researchable = metric(snapshot, "researchable", "researchableCount");
  const qualified = first(
    metric(snapshot, "qualified", "qualifiedCount"),
    qualifiedRaw.length,
  );
  const watchlist = first(
    metric(snapshot, "watchlist", "watchlistCount"),
    candidates.length,
  );
  const deepResearch = metric(
    snapshot,
    "selectedForDeepResearch",
    "deepResearchSelected",
    "researchSelected",
  );

  const cycleCount = first(
    scanner?.cycleCount,
    snapshot?.cycleCount,
    metric(snapshot, "cycleCount"),
  );

  const lastCompleted = first(
    scanner?.lastCycleCompletedAt,
    snapshot?.lastCycleCompletedAt,
    metric(snapshot, "lastCycleCompletedAt", "completedAt"),
  );

  const pipeline = [
    { label: "Universe", value: universe },
    { label: "Market Data", value: warmed },
    { label: "Measurements", value: measured },
    { label: "Researchable", value: researchable },
    { label: "Watchlist", value: watchlist },
    { label: "Deep Research", value: deepResearch },
  ];

  return (
    <div className="app-shell">
      <Sidebar />
      <main className="main-content stock-scanner-page">
      <div className="stock-scanner">
        <div className="scanner-executive-bar">
          <div className="scanner-executive-brand"><span className="scanner-executive-monogram">A</span><div><span className="scanner-executive-kicker">AEMA / EQUITIES</span><strong>Stock Intelligence Terminal</strong></div></div>
          <div className="scanner-executive-controls">
            <span className="scanner-executive-market">● US STOCKS</span>
            <button type="button" className="scanner-theme-toggle" aria-label={lightTheme ? "Switch to dark background" : "Switch to light background"} aria-pressed={lightTheme} onClick={() => setLightTheme(v => !v)}>
              <span aria-hidden="true">{lightTheme ? "☾" : "☀"}</span><span>{lightTheme ? "Dark mode" : "Light mode"}</span>
            </button>
          </div>
        </div>
        <section className="aema-terminal" aria-label="Stock chart trading terminal">
          <div className="aema-terminal__heading">
            <div><span className="aema-terminal__eyebrow">AEMA STOCK TERMINAL</span><h2>Analyze the market. Own the insight.</h2><p>Institutional-style charting, technical indicators and AEMA research in one focused workspace.</p></div>
            <form onSubmit={searchChart} className="aema-terminal__search">
              <input aria-label="Stock ticker" value={symbolInput} onChange={e=>setSymbolInput(e.target.value)} placeholder="AAPL, TSLA, NVDA" />
              <button type="submit">Open chart</button>
            </form>
          </div>
          <div className="aema-terminal__actions">
            <span className="aema-terminal__symbol">{chartSymbol}</span>
            <button type="button" onClick={refreshChart} disabled={chartLoading}>{chartLoading ? "Loading candles…" : "Refresh chart"}</button>
            <button type="button" className="aema-terminal__research" onClick={researchChart} disabled={analysisLoading}>{analysisLoading ? "Analyzing…" : "Run AEMA Research"}</button>
          </div>
          {chartError && <p role="alert" className="aema-terminal__error">{chartError}</p>}
          <div className="aema-terminal__workstation">
            <div className="aema-terminal__chart-pane">
              <TradingChart symbol={chartSymbol} candles={Array.isArray(chartData) ? chartData : (chartData?.candles ?? chartData?.bars ?? chartData?.data ?? [])} loading={chartLoading} lightTheme={lightTheme}/>
            </div>
            <aside className="aema-terminal__depth-pane" aria-label="Stock market depth and trade analysis">
              <div className="aema-terminal__depth-head"><span className="aema-terminal__eyebrow">MARKET DEPTH</span><span className="aema-terminal__depth-symbol">{chartSymbol}</span></div>
              <h3>Level 2 Order Book</h3>
              <div className="aema-terminal__depth-columns"><span>Bid size</span><span>Bid price</span><span>Ask price</span><span>Ask size</span></div>
              <div className="aema-terminal__depth-empty"><strong>Depth feed not connected</strong><p>Real stock bid/ask levels require a licensed Level 2 market-data feed. No simulated orders are displayed.</p></div>
              <div className="aema-terminal__depth-head"><span className="aema-terminal__eyebrow">ANALYSIS TOOLS</span></div>
              <p className="aema-terminal__depth-hint">Use the chart toolbar to enable SMA 20, EMA 20, VWAP and Volume, select a timeframe, and inspect candles with the crosshair.</p>
              <button type="button" className="aema-terminal__research aema-terminal__depth-action" onClick={researchChart} disabled={analysisLoading}>{analysisLoading ? "Analyzing…" : `Analyze ${chartSymbol}`}</button>
            </aside>
          </div>
          {analysis && <div className="aema-terminal__result"><strong>Research result · {chartSymbol}</strong><pre>{JSON.stringify(analysis, null, 2)}</pre></div>}
          <p className="aema-terminal__footnote">Previously loaded candles are retained on this device. Refresh chart and Run AEMA Research are separate manual requests. Intraday timeframe accuracy depends on the source candle resolution.</p>
        </section>
        <div className="scanner-discovery-switch">
          <div><span className="scanner-discovery-eyebrow">DISCOVERY ENGINE</span><h2>Market opportunities</h2><p>Scan the stock universe, review qualified candidates and inspect research signals.</p></div>
          <button type="button" className="scanner-discovery-button" onClick={() => setShowDiscovery(v => !v)} aria-expanded={showDiscovery}>{showDiscovery ? "Hide discovery" : "Explore candidates"} <span aria-hidden="true">{showDiscovery ? "−" : "+"}</span></button>
        </div>
        <div className={showDiscovery ? "scanner-discovery-content is-open" : "scanner-discovery-content"}>
        <header className="stock-scanner__header">
          <div>
            <div className="stock-scanner__eyebrow">
              <span className="stock-scanner__pulse" />
              AEMA MARKET INTELLIGENCE
            </div>
            <h1>Stock Scanner</h1>
            <p>
              Market-wide discovery, ranking and research handoff from the
              canonical scanner backend.
            </p>
          </div>

          <div className="stock-scanner__actions">
            <div className="stock-scanner__status">
              <span>Scanner</span>
              <StatusBadge value={scannerStatus} />
            </div>

            <button
              className="scanner-button scanner-button--secondary"
              type="button"
              onClick={handleLifecycle}
              disabled={lifecycleBusy || runningOnce}
            >
              {lifecycleBusy
                ? "Updating…"
                : isScannerRunning
                  ? "Stop Scanner"
                  : "Start Scanner"}
            </button>

            <button
              className={`scanner-button scanner-button--primary ${
                runningOnce ? "is-running" : ""
              }`}
              type="button"
              onClick={handleRunOnce}
              disabled={runningOnce || lifecycleBusy}
            >
              <span className="scanner-button__loader"><i /></span>
              <span>{runningOnce ? "Running Scan" : "Run Scan"}</span>
            </button>
          </div>
        </header>

        {error ? (
          <div className="stock-scanner__error">
            <strong>Scanner request failed</strong>
            <span>{error}</span>
          </div>
        ) : null}

        <section className="stock-scanner__stats">
          <StatCard label="Universe" value={formatNumber(universe)} note="Market universe" />
          <StatCard label="Measured" value={formatNumber(measured)} note="Measurement-ready" />
          <StatCard label="Researchable" value={formatNumber(researchable)} note="Usable candidates" />
          <StatCard label="Qualified" value={formatNumber(qualified)} note="Strict scanner gate" />
          <StatCard label="Watchlist" value={formatNumber(watchlist)} note="Ranked research pool" />
          <StatCard
            label="Cycle"
            value={formatNumber(cycleCount)}
            note={lastCompleted ? `Last ${formatTimestamp(lastCompleted)}` : "No completed timestamp"}
          />
        </section>

        <section className="scanner-pipeline">
          <div className="scanner-section-heading">
            <div>
              <span>DISCOVERY PIPELINE</span>
              <h2>Market → Research</h2>
            </div>
            <small>Backend state only</small>
          </div>

          <div className="scanner-pipeline__flow">
            {pipeline.map((item, index) => (
              <React.Fragment key={item.label}>
                <div className="scanner-pipeline__stage">
                  <span>{item.label}</span>
                  <strong>{formatNumber(item.value)}</strong>
                </div>
                {index < pipeline.length - 1 ? (
                  <div className="scanner-pipeline__arrow" aria-hidden="true">
                    <i />
                  </div>
                ) : null}
              </React.Fragment>
            ))}
          </div>
        </section>

        <section className="scanner-workspace">
          <aside className="scanner-inspector">
            <div className="scanner-section-heading">
              <div>
                <span>CANDIDATE INSPECTOR</span>
                <h2>{selected?.symbol ?? "Select a stock"}</h2>
              </div>
            </div>

            {selected ? (
              <div className="scanner-inspector__body">
                <div className="scanner-inspector__identity">
                  <div className="scanner-inspector__mark">
                    {String(selected.symbol ?? "?").slice(0, 2)}
                  </div>
                  <div>
                    <strong>{selected.symbol ?? "—"}</strong>
                    <span>{selected.name ?? "Scanner candidate"}</span>
                  </div>
                </div>

                <div className="scanner-inspector__grid">
                  <StatCard label="Price" value={formatPrice(selected.price)} />
                  <StatCard label="Change" value={formatPercent(selected.changePercent)} />
                  <StatCard label="Volume" value={formatCompact(selected.volume)} />
                  <StatCard label="Rel. Volume" value={formatScore(selected.relativeVolume)} />
                </div>

                <div className="scanner-inspector__line">
                  <span>Scanner score</span>
                  <strong>{formatScore(selected.score)}</strong>
                </div>
                <div className="scanner-inspector__line">
                  <span>LONG score</span>
                  <strong>{formatScore(selected.longScore)}</strong>
                </div>
                <div className="scanner-inspector__line">
                  <span>SHORT score</span>
                  <strong>{formatScore(selected.shortScore)}</strong>
                </div>
                <div className="scanner-inspector__line">
                  <span>Direction edge</span>
                  <strong>{formatScore(selected.edge)}</strong>
                </div>
                <div className="scanner-inspector__line">
                  <span>Preferred direction</span>
                  <StatusBadge value={selected.direction} />
                </div>
                <div className="scanner-inspector__line">
                  <span>Scanner status</span>
                  <StatusBadge value={selected.status} />
                </div>
                <div className="scanner-inspector__line">
                  <span>Research</span>
                  <StatusBadge value={selected.researchStatus} />
                </div>

                {selected.reasons.length ? (
                  <div className="scanner-inspector__reasons">
                    <span>Scanner evidence</span>
                    {selected.reasons.slice(0, 4).map((reason, index) => (
                      <p key={`${selected.id}-reason-${index}`}>{String(reason)}</p>
                    ))}
                  </div>
                ) : null}

                {typeof onOpenResearch === "function" ? (
                  <button
                    type="button"
                    className="scanner-inspector__research"
                    onClick={() => onOpenResearch(selected.raw)}
                  >
                    Open Stock Research
                  </button>
                ) : null}
              </div>
            ) : (
              <div className="scanner-inspector__empty">
                Select a stock from the ranking or scanner table to inspect its
                backend measurements and scanner decision.
              </div>
            )}
          </aside>
        </section>

        <section className="scanner-results">
          <div className="scanner-results__header">
            <div>
              <span>SCANNER RESULTS</span>
              <h2>
                Stock Candidates <small>{visible.length}</small>
              </h2>
            </div>

            <div className="scanner-results__controls">
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Filter symbol or company"
                aria-label="Filter scanner results"
              />

              <select value={view} onChange={(event) => setView(event.target.value)}>
                <option value="ALL">All candidates</option>
                <option value="QUALIFIED">Qualified</option>
                <option value="LONG">Long direction</option>
                <option value="SHORT">Short direction</option>
              </select>

              <select value={sort} onChange={(event) => setSort(event.target.value)}>
                <option value="SCORE">Scanner score</option>
                <option value="EDGE">Direction edge</option>
                <option value="LONG">LONG score</option>
                <option value="SHORT">SHORT score</option>
                <option value="RVOL">Relative volume</option>
              </select>
            </div>
          </div>

          <div className="scanner-results__table-wrap">
            <table className="scanner-results__table">
              <thead>
                <tr>
                  <th>Stock</th>
                  <th>Price</th>
                  <th>Change</th>
                  <th>Scanner</th>
                  <th>LONG</th>
                  <th>SHORT</th>
                  <th>Edge</th>
                  <th>Rel. Vol</th>
                  <th>Direction</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((candidate) => (
                  <tr
                    key={candidate.id}
                    onClick={() => setSelected(candidate)}
                    className={selected?.id === candidate.id ? "is-selected" : ""}
                  >
                    <td>
                      <strong>{candidate.symbol ?? "—"}</strong>
                      <span>{candidate.name ?? ""}</span>
                    </td>
                    <td>{formatPrice(candidate.price)}</td>
                    <td className={(finite(candidate.changePercent) ?? 0) < 0 ? "is-down" : "is-up"}>
                      {formatPercent(candidate.changePercent)}
                    </td>
                    <td><strong>{formatScore(candidate.score)}</strong></td>
                    <td>{formatScore(candidate.longScore)}</td>
                    <td>{formatScore(candidate.shortScore)}</td>
                    <td>{formatScore(candidate.edge)}</td>
                    <td>{formatScore(candidate.relativeVolume)}</td>
                    <td><StatusBadge value={candidate.direction} /></td>
                    <td><StatusBadge value={candidate.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>

            {!loading && visible.length === 0 ? (
              <div className="scanner-results__empty">
                No backend candidates match the current filters.
              </div>
            ) : null}
          </div>
        </section>
        </div>
      </div>
      </main>
    </div>
  );
}
