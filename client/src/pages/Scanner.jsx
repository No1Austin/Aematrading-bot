import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getScannerSnapshot,
  runScannerOnce,
  startScanner,
  stopScanner,
} from "../services/api";
import "./Scanner.css";

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
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(true);
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
    loadSnapshot();

    const timer = window.setInterval(
      () => loadSnapshot({ silent: true }),
      Math.max(5000, pollMs),
    );

    return () => {
      mounted.current = false;
      window.clearInterval(timer);
    };
  }, [loadSnapshot, pollMs]);

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
    <main className="stock-scanner-page">
      <div className="stock-scanner">
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
          <div className="scanner-ranking">
            <div className="scanner-section-heading">
              <div>
                <span>GLOBAL RANKING</span>
                <h2>Researchable Market Map</h2>
              </div>
              <small>{candidates.length} returned</small>
            </div>

            {loading ? (
              <div className="scanner-empty">
                <div className="scanner-radar is-active"><i /></div>
                <strong>Loading scanner snapshot…</strong>
              </div>
            ) : candidates.length ? (
              <div className="scanner-ranking__rows">
                {candidates.slice(0, 20).map((candidate, index) => {
                  const score = finite(candidate.score);
                  const width =
                    score === null ? 0 : Math.max(0, Math.min(100, score));

                  return (
                    <button
                      type="button"
                      key={candidate.id}
                      className={`scanner-ranking__row ${
                        selected?.id === candidate.id ? "is-selected" : ""
                      }`}
                      onClick={() => setSelected(candidate)}
                    >
                      <span className="scanner-ranking__rank">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <strong>{candidate.symbol ?? "—"}</strong>
                      <span className="scanner-ranking__track">
                        <i style={{ width: `${width}%` }} />
                      </span>
                      <b>{formatScore(candidate.score)}</b>
                      <StatusBadge value={candidate.direction} />
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="scanner-empty">
                <div className={`scanner-radar ${runningOnce ? "is-active" : ""}`}>
                  <i />
                </div>
                <strong>
                  {runningOnce
                    ? "Scanning the market…"
                    : "No scanner candidates returned"}
                </strong>
                <p>
                  No placeholder stocks are generated. Results appear only when
                  the backend returns candidates.
                </p>
              </div>
            )}
          </div>

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
                Market Candidates <small>{visible.length}</small>
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
    </main>
  );
}
