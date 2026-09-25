// client/src/pages/Positions.jsx

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  BriefcaseBusiness,
  CircleDollarSign,
  Database,
  Moon,
  RefreshCw,
  Search,
  Sun,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";

import Sidebar from "../components/Sidebar.jsx";

import {
  getPositions,
  getPositionsStatus,
} from "../services/api.js";

import "./Positions.css";

function finite(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function firstFinite(...values) {
  for (const value of values) {
    const n = finite(value);
    if (n !== null) return n;
  }
  return null;
}

function money(value) {
  const n = finite(value);
  if (n === null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(n);
}

function number(value, digits = 2) {
  const n = finite(value);
  return n === null ? "—" : n.toLocaleString("en-US", {
    maximumFractionDigits: digits,
  });
}

function percent(value) {
  const n = finite(value);
  return n === null ? "—" : `${n > 0 ? "+" : ""}${n.toFixed(2)}%`;
}

function dateTime(value) {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString();
}

function extractPositions(payload) {
  const candidates = [
    payload?.positions,
    payload?.data?.positions,
    payload?.openPositions,
    payload?.data?.openPositions,
    payload?.cryptoPositions,
    payload?.data?.cryptoPositions,
    payload?.portfolio?.positions,
    payload?.data?.portfolio?.positions,
    payload?.items,
    payload?.data?.items,
    payload?.results,
    payload?.data?.results,
    Array.isArray(payload?.data) ? payload.data : null,
    Array.isArray(payload) ? payload : null,
  ];

  return candidates.find(Array.isArray) ?? [];
}

function normalizePosition(position = {}, index = 0) {
  const quantity = firstFinite(
    position.qty,
    position.quantity,
    position.shares,
    position.size,
  );

  const currentPrice = firstFinite(
    position.currentPrice,
    position.current_price,
    position.marketPrice,
    position.market_price,
    position.price,
    position.lastPrice,
  );

  const averageEntryPrice = firstFinite(
    position.avgEntryPrice,
    position.avg_entry_price,
    position.averageEntryPrice,
    position.entryPrice,
    position.entry_price,
    position.costBasisPerShare,
  );

  const marketValue = firstFinite(
    position.marketValue,
    position.market_value,
    position.currentValue,
    quantity !== null && currentPrice !== null
      ? quantity * currentPrice
      : null,
  );

  const costBasis = firstFinite(
    position.costBasis,
    position.cost_basis,
    position.totalCost,
    quantity !== null && averageEntryPrice !== null
      ? quantity * averageEntryPrice
      : null,
  );

  const unrealizedPnl = firstFinite(
    position.unrealizedPnl,
    position.unrealized_pl,
    position.unrealizedPL,
    position.pnl,
    marketValue !== null && costBasis !== null
      ? marketValue - costBasis
      : null,
  );

  const unrealizedPnlPercent = firstFinite(
    position.unrealizedPnlPercent,
    position.unrealized_plpc !== undefined
      ? Number(position.unrealized_plpc) * 100
      : null,
    position.unrealizedPLPercent,
    position.pnlPercent,
    position.pnlPct,
    costBasis && unrealizedPnl !== null
      ? (unrealizedPnl / Math.abs(costBasis)) * 100
      : null,
  );

  const side = String(
    position.side ??
    position.direction ??
    (quantity !== null && quantity < 0 ? "SHORT" : "LONG"),
  ).toUpperCase();

  return {
    id:
      position.id ??
      position.positionId ??
      position.assetId ??
      position.symbol ??
      `position-${index}`,
    symbol: String(
      position.symbol ??
      position.ticker ??
      position.pair ??
      position.tokenSymbol ??
      position.assetSymbol ??
      "—"
    ).toUpperCase(),
    name:
      position.name ??
      position.tokenName ??
      position.assetName ??
      position.baseAsset ??
      position.coin ??
      null,
    side,
    quantity,
    averageEntryPrice,
    currentPrice,
    marketValue,
    costBasis,
    unrealizedPnl,
    unrealizedPnlPercent,
    dayPnl: firstFinite(
      position.dayPnl,
      position.day_pl,
      position.dayPL,
      position.todaysPnl,
    ),
    dayPnlPercent: firstFinite(
      position.dayPnlPercent,
      position.day_plpc !== undefined
        ? Number(position.day_plpc) * 100
        : null,
      position.dayPLPercent,
    ),
    openedAt:
      position.openedAt ??
      position.opened_at ??
      position.createdAt ??
      position.entryTime ??
      null,
    status: String(position.status ?? "OPEN").toUpperCase(),
    raw: position,
  };
}

function MetricCard({ icon: Icon, label, value, detail, tone = "" }) {
  return (
    <article className={`positions-metric ${tone}`}>
      <div className="positions-metric__top">
        <span>{label}</span>
        <div className="positions-metric__icon">
          <Icon size={17} />
        </div>
      </div>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

export default function Positions() {
  const [positionsPayload, setPositionsPayload] = useState(null);
  const [statusPayload, setStatusPayload] = useState(null);
  const [query, setQuery] = useState("");
  const [sideFilter, setSideFilter] = useState("ALL");
  const [sort, setSort] = useState("VALUE");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  const [theme, setTheme] = useState(() => {
    const saved = window.localStorage.getItem("aema-crypto-positions-theme");
    if (saved === "dark" || saved === "light") return saved;
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  });

  useEffect(() => {
    window.localStorage.setItem("aema-crypto-positions-theme", theme);
  }, [theme]);

  const loadPositions = useCallback(async ({ manual = false } = {}) => {
    try {
      manual ? setRefreshing(true) : setLoading(true);
      setError(null);

      const [positionsResult, statusResult] = await Promise.allSettled([
        getPositions(),
        getPositionsStatus(),
      ]);

      if (positionsResult.status === "rejected") {
        throw positionsResult.reason;
      }

      setPositionsPayload(positionsResult.value ?? null);
      setStatusPayload(
        statusResult.status === "fulfilled"
          ? statusResult.value
          : null,
      );
      setLastUpdated(new Date());
    } catch (requestError) {
      setError(
        requestError?.payload?.error ??
        requestError?.message ??
        "Unable to load positions.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadPositions();
  }, [loadPositions]);

  const positions = useMemo(
    () => extractPositions(positionsPayload).map(normalizePosition),
    [positionsPayload],
  );

  const totals = useMemo(() => {
    return positions.reduce(
      (acc, position) => {
        if (position.marketValue !== null) {
          acc.marketValue += position.marketValue;
          acc.marketValueCount += 1;
        }
        if (position.costBasis !== null) {
          acc.costBasis += position.costBasis;
          acc.costBasisCount += 1;
        }
        if (position.unrealizedPnl !== null) {
          acc.unrealizedPnl += position.unrealizedPnl;
          acc.pnlCount += 1;
        }
        if (position.dayPnl !== null) {
          acc.dayPnl += position.dayPnl;
          acc.dayPnlCount += 1;
        }
        if (position.side.includes("SHORT")) acc.short += 1;
        else acc.long += 1;
        return acc;
      },
      {
        marketValue: 0,
        marketValueCount: 0,
        costBasis: 0,
        costBasisCount: 0,
        unrealizedPnl: 0,
        pnlCount: 0,
        dayPnl: 0,
        dayPnlCount: 0,
        long: 0,
        short: 0,
      },
    );
  }, [positions]);

  const totalPnlPercent =
    totals.costBasisCount && totals.costBasis !== 0
      ? (totals.unrealizedPnl / Math.abs(totals.costBasis)) * 100
      : null;

  const visiblePositions = useMemo(() => {
    const needle = query.trim().toUpperCase();

    return positions
      .filter((position) => {
        const matchesQuery =
          !needle ||
          position.symbol.includes(needle) ||
          String(position.name ?? "").toUpperCase().includes(needle);

        const matchesSide =
          sideFilter === "ALL" ||
          position.side.includes(sideFilter);

        return matchesQuery && matchesSide;
      })
      .sort((a, b) => {
        if (sort === "PNL") {
          return (b.unrealizedPnl ?? -Infinity) - (a.unrealizedPnl ?? -Infinity);
        }
        if (sort === "PNL_PERCENT") {
          return (b.unrealizedPnlPercent ?? -Infinity) -
            (a.unrealizedPnlPercent ?? -Infinity);
        }
        if (sort === "SYMBOL") {
          return a.symbol.localeCompare(b.symbol);
        }
        return (b.marketValue ?? -Infinity) - (a.marketValue ?? -Infinity);
      });
  }, [positions, query, sideFilter, sort]);

  const backendState = String(
    statusPayload?.status ??
    statusPayload?.state ??
    positionsPayload?.status ??
    (error ? "UNAVAILABLE" : loading ? "LOADING" : "CONNECTED"),
  ).toUpperCase();

  const metrics = [
    {
      icon: Wallet,
      label: "Market Value",
      value: totals.marketValueCount ? money(totals.marketValue) : "—",
      detail: `${positions.length} open position${positions.length === 1 ? "" : "s"}`,
    },
    {
      icon: CircleDollarSign,
      label: "Unrealized P/L",
      value: totals.pnlCount ? money(totals.unrealizedPnl) : "—",
      detail: totalPnlPercent === null ? "Backend position P/L" : percent(totalPnlPercent),
      tone: totals.pnlCount
        ? totals.unrealizedPnl >= 0
          ? "positive"
          : "negative"
        : "",
    },
    {
      icon: Activity,
      label: "Day P/L",
      value: totals.dayPnlCount ? money(totals.dayPnl) : "—",
      detail: totals.dayPnlCount ? "Current session" : "No day P/L supplied",
      tone: totals.dayPnlCount
        ? totals.dayPnl >= 0
          ? "positive"
          : "negative"
        : "",
    },
    {
      icon: BriefcaseBusiness,
      label: "Exposure",
      value: `${totals.long} LONG · ${totals.short} SHORT`,
      detail: "Open position direction",
    },
  ];

  return (
    <div className={`positions-shell positions-theme-${theme}`}>
      <Sidebar />

      <main className="positions-page">
        <section className="positions-header">
          <div className="positions-heading">
            <span className="positions-eyebrow">AEMA Crypto Intelligence</span>
            <h1>Positions</h1>
            <p>
              Live crypto exposure and open-position performance from the positions backend. No token, price, quantity, P/L, or market value is manufactured in the UI.
            </p>
          </div>

          <div className="positions-header__actions">
            <button
              type="button"
              className="positions-theme-toggle"
              onClick={() =>
                setTheme((current) => current === "dark" ? "light" : "dark")
              }
              aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
              title={theme === "dark" ? "Light theme" : "Dark theme"}
            >
              {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
            </button>

            <button
              type="button"
              className="positions-refresh"
              onClick={() => void loadPositions({ manual: true })}
              disabled={refreshing}
            >
              <RefreshCw size={16} className={refreshing ? "positions-spin" : ""} />
              <span>{refreshing ? "Refreshing" : "Refresh"}</span>
            </button>
          </div>
        </section>

        {error ? (
          <section className="positions-error">
            <div>
              <strong>Position data unavailable</strong>
              <span>{error}</span>
            </div>
            <button type="button" onClick={() => void loadPositions({ manual: true })}>
              Try again
            </button>
          </section>
        ) : null}

        <section className="positions-status-strip">
          <div>
            <span>Data State</span>
            <strong className={
              error
                ? "danger"
                : loading
                  ? "warning"
                  : "healthy"
            }>
              {backendState}
            </strong>
          </div>
          <div>
            <span>Open Positions</span>
            <strong>{positions.length}</strong>
          </div>
          <div>
            <span>LONG / SHORT</span>
            <strong>{totals.long} / {totals.short}</strong>
          </div>
          <div>
            <span>Last Refresh</span>
            <strong>{lastUpdated ? lastUpdated.toLocaleTimeString() : "—"}</strong>
          </div>
        </section>

        <section className="positions-metrics">
          {metrics.map((metric) => (
            <MetricCard key={metric.label} {...metric} />
          ))}
        </section>

        <section className="positions-allocation-grid">
          <article className="positions-panel">
            <div className="positions-panel__heading">
              <div>
                <span>PORTFOLIO DIRECTION</span>
                <h2>Exposure Mix</h2>
              </div>
              <BarChart3 size={18} />
            </div>

            <div className="positions-exposure">
              <div className="positions-exposure__bar">
                <span
                  className="positions-exposure__long"
                  style={{
                    width: positions.length
                      ? `${(totals.long / positions.length) * 100}%`
                      : "0%",
                  }}
                />
                <span
                  className="positions-exposure__short"
                  style={{
                    width: positions.length
                      ? `${(totals.short / positions.length) * 100}%`
                      : "0%",
                  }}
                />
              </div>

              <div className="positions-exposure__legend">
                <div>
                  <i className="long" />
                  <span>LONG</span>
                  <strong>{totals.long}</strong>
                </div>
                <div>
                  <i className="short" />
                  <span>SHORT</span>
                  <strong>{totals.short}</strong>
                </div>
              </div>
            </div>
          </article>

          <article className="positions-panel">
            <div className="positions-panel__heading">
              <div>
                <span>PORTFOLIO RESULT</span>
                <h2>Unrealized Performance</h2>
              </div>
              {totals.unrealizedPnl >= 0
                ? <TrendingUp size={18} className="position-up" />
                : <TrendingDown size={18} className="position-down" />}
            </div>

            <div className="positions-performance">
              <strong className={
                totals.pnlCount
                  ? totals.unrealizedPnl >= 0
                    ? "position-up"
                    : "position-down"
                  : ""
              }>
                {totals.pnlCount ? money(totals.unrealizedPnl) : "—"}
              </strong>
              <span>
                {totalPnlPercent === null
                  ? "Awaiting usable backend P/L data"
                  : `${percent(totalPnlPercent)} vs aggregate cost basis`}
              </span>
            </div>
          </article>
        </section>

        <section className="positions-table-card">
          <div className="positions-toolbar">
            <div className="positions-toolbar__heading">
              <span>OPEN PORTFOLIO</span>
              <h2>Current Positions</h2>
              <p>{visiblePositions.length} positions in the current view</p>
            </div>

            <div className="positions-toolbar__actions">
              <div className="positions-filter-tabs">
                {["ALL", "LONG", "SHORT"].map((value) => (
                  <button
                    type="button"
                    key={value}
                    className={sideFilter === value ? "active" : ""}
                    onClick={() => setSideFilter(value)}
                  >
                    {value}
                  </button>
                ))}
              </div>

              <label className="positions-search">
                <Search size={16} />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search token or symbol"
                  aria-label="Search positions"
                />
              </label>

              <select
                value={sort}
                onChange={(event) => setSort(event.target.value)}
                aria-label="Sort positions"
              >
                <option value="VALUE">Market value</option>
                <option value="PNL">P/L</option>
                <option value="PNL_PERCENT">P/L %</option>
                <option value="SYMBOL">Symbol</option>
              </select>
            </div>
          </div>

          <div className="positions-table-wrap">
            <table className="positions-table">
              <thead>
                <tr>
                  <th>Token</th>
                  <th>Side</th>
                  <th>Quantity</th>
                  <th>Avg Entry</th>
                  <th>Current</th>
                  <th>Market Value</th>
                  <th>Unrealized P/L</th>
                  <th>P/L %</th>
                  <th>Day P/L</th>
                  <th>Status</th>
                </tr>
              </thead>

              <tbody>
                {visiblePositions.map((position) => (
                  <tr key={position.id}>
                    <td>
                      <div className="positions-symbol">
                        <div className="positions-symbol__mark">
                          {position.symbol.slice(0, 1)}
                        </div>
                        <div>
                          <strong>{position.symbol}</strong>
                          <span>{position.name ?? "Crypto position"}</span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className={`positions-side ${position.side.includes("SHORT") ? "short" : "long"}`}>
                        {position.side.includes("SHORT")
                          ? <ArrowDownRight size={13} />
                          : <ArrowUpRight size={13} />}
                        {position.side}
                      </span>
                    </td>
                    <td>{number(position.quantity, 6)}</td>
                    <td>{money(position.averageEntryPrice)}</td>
                    <td>{money(position.currentPrice)}</td>
                    <td className="positions-number">{money(position.marketValue)}</td>
                    <td className={
                      position.unrealizedPnl === null
                        ? ""
                        : position.unrealizedPnl >= 0
                          ? "position-up"
                          : "position-down"
                    }>
                      {money(position.unrealizedPnl)}
                    </td>
                    <td className={
                      position.unrealizedPnlPercent === null
                        ? ""
                        : position.unrealizedPnlPercent >= 0
                          ? "position-up"
                          : "position-down"
                    }>
                      {percent(position.unrealizedPnlPercent)}
                    </td>
                    <td className={
                      position.dayPnl === null
                        ? ""
                        : position.dayPnl >= 0
                          ? "position-up"
                          : "position-down"
                    }>
                      {money(position.dayPnl)}
                    </td>
                    <td>
                      <span className="positions-status">{position.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {loading ? (
              <div className="positions-loading">
                <RefreshCw size={19} className="positions-spin" />
                <strong>Loading positions</strong>
                <span>Reading the positions backend…</span>
              </div>
            ) : null}

            {!loading && visiblePositions.length === 0 ? (
              <div className="positions-empty">
                <Database size={19} />
                <strong>No open positions in this view</strong>
                <span>
                  The page does not create placeholder positions. Only backend
                  positions are displayed.
                </span>
              </div>
            ) : null}
          </div>
        </section>

        <footer className="positions-footer">
          <span>Crypto portfolio · Backend is the source of truth</span>
          <span>
            {lastUpdated
              ? `Updated ${dateTime(lastUpdated)}`
              : "Awaiting position refresh"}
          </span>
        </footer>
      </main>
    </div>
  );
}
