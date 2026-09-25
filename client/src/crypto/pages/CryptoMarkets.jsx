import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Bitcoin,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Database,
  Moon,
  RefreshCw,
  Search,
  Sun,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import CryptoSidebar
  from "../components/CryptoSidebar.jsx";

import WorkspaceJumpButton
  from "../../components/WorkspaceJumpButton.jsx";

import {
  getCryptoMarketsOverview,
} from "../services/cryptoApi.js";

import "./CryptoMarkets.css";

const PAGE_SIZE = 20;

function finite(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? parsed
    : null;
}

function formatMoney(value) {
  const parsed = finite(value);

  if (parsed === null) {
    return "—";
  }

  if (Math.abs(parsed) < 1) {
    return new Intl.NumberFormat(
      "en-US",
      {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 6,
      },
    ).format(parsed);
  }

  return new Intl.NumberFormat(
    "en-US",
    {
      style: "currency",
      currency: "USD",
      notation:
        Math.abs(parsed) >= 100000
          ? "compact"
          : "standard",
      maximumFractionDigits: 2,
    },
  ).format(parsed);
}

function formatCompactMoney(value) {
  const parsed = finite(value);

  if (parsed === null) {
    return "—";
  }

  return new Intl.NumberFormat(
    "en-US",
    {
      style: "currency",
      currency: "USD",
      notation: "compact",
      maximumFractionDigits: 2,
    },
  ).format(parsed);
}

function formatPercent(value) {
  const parsed = finite(value);

  if (parsed === null) {
    return "—";
  }

  return `${parsed > 0 ? "+" : ""}${parsed.toFixed(2)}%`;
}

function normalizeAsset(
  asset = {},
  index = 0,
) {
  return {
    id:
      asset.assetId ??
      asset.id ??
      asset.symbol ??
      `asset-${index}`,

    symbol:
      String(
        asset.symbol ??
        "—",
      ).toUpperCase(),

    name:
      asset.name ??
      asset.symbol ??
      "Unknown asset",

    price:
      finite(asset.price) ??
      finite(asset.currentPrice) ??
      finite(asset.current_price),

    change24h:
      finite(asset.change24h) ??
      finite(asset.priceChange24h) ??
      finite(asset.change_24h) ??
      finite(
        asset.price_change_percentage_24h,
      ),

    marketCap:
      finite(asset.marketCap) ??
      finite(asset.market_cap),

    volume24h:
      finite(asset.volume24h) ??
      finite(asset.totalVolume24h) ??
      finite(asset.total_volume),

    rank:
      finite(asset.rank) ??
      finite(asset.marketCapRank) ??
      finite(asset.market_cap_rank),

    venue:
      asset.venue ??
      asset.primaryVenue ??
      asset.venues?.primaryVenue ??
      null,

    marketType:
      asset.marketType ??
      asset.market_type ??
      null,
  };
}

function normalizeOverview(
  payload = {},
) {
  const source =
    payload?.data ??
    payload?.overview ??
    payload;

  const rawAssets =
    source?.assets ??
    source?.markets ??
    source?.coins ??
    source?.results ??
    source?.universe ??
    [];

  const assets =
    Array.isArray(rawAssets)
      ? rawAssets.map(
          normalizeAsset,
        )
      : [];

  const derivedMarketCap =
    assets.reduce(
      (sum, asset) =>
        sum +
        (
          finite(asset.marketCap) ??
          0
        ),
      0,
    );

  const derivedVolume =
    assets.reduce(
      (sum, asset) =>
        sum +
        (
          finite(asset.volume24h) ??
          0
        ),
      0,
    );

  const btc =
    assets.find(
      asset =>
        asset.symbol === "BTC",
    );

  return {
    assets,

    totalMarketCap:
      finite(source?.totalMarketCap) ??
      finite(source?.total_market_cap) ??
      (
        derivedMarketCap > 0
          ? derivedMarketCap
          : null
      ),

    volume24h:
      finite(source?.volume24h) ??
      finite(source?.totalVolume24h) ??
      finite(source?.total_volume_24h) ??
      (
        derivedVolume > 0
          ? derivedVolume
          : null
      ),

    btcDominance:
      finite(source?.btcDominance) ??
      finite(source?.btc_dominance) ??
      (
        btc?.marketCap &&
        derivedMarketCap > 0
          ? (
              btc.marketCap /
              derivedMarketCap
            ) * 100
          : null
      ),

    marketChange24h:
      finite(source?.marketChange24h) ??
      finite(source?.market_change_24h),

    updatedAt:
      source?.updatedAt ??
      source?.timestamp ??
      null,
  };
}

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
  tone = "neutral",
}) {
  return (
    <article
      className={`crypto-market-metric ${tone}`}
    >
      <div className="crypto-market-metric__top">
        <span>{label}</span>

        <div className="crypto-market-metric__icon">
          <Icon size={17} />
        </div>
      </div>

      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

function MoverList({
  title,
  icon: Icon,
  assets,
  direction,
}) {
  return (
    <article className="crypto-market-panel">
      <div className="crypto-market-panel__heading">
        <div>
          <span>24H MOVERS</span>
          <h2>{title}</h2>
        </div>

        <Icon
          size={18}
          className={
            direction === "up"
              ? "market-up"
              : "market-down"
          }
        />
      </div>

      <div className="crypto-market-mover-list">
        {assets.length ? (
          assets.map(
            (asset, index) => (
              <div
                className="crypto-market-mover"
                key={asset.id}
              >
                <span className="crypto-market-rank">
                  {index + 1}
                </span>

                <div className="crypto-market-symbol">
                  <div className="crypto-market-symbol__mark">
                    {asset.symbol.slice(0, 1)}
                  </div>

                  <div>
                    <strong>{asset.symbol}</strong>
                    <span>{asset.name}</span>
                  </div>
                </div>

                <div className="crypto-market-mover__price">
                  <strong>
                    {formatMoney(asset.price)}
                  </strong>

                  <span
                    className={
                      direction === "up"
                        ? "market-up"
                        : "market-down"
                    }
                  >
                    {direction === "up" ? (
                      <ArrowUpRight size={13} />
                    ) : (
                      <ArrowDownRight size={13} />
                    )}

                    {formatPercent(
                      asset.change24h,
                    )}
                  </span>
                </div>
              </div>
            ),
          )
        ) : (
          <div className="crypto-market-empty">
            No mover data available.
          </div>
        )}
      </div>
    </article>
  );
}

export default function CryptoMarkets() {
  const [
    overview,
    setOverview,
  ] =
    useState(
      () =>
        normalizeOverview(),
    );

  const [
    query,
    setQuery,
  ] =
    useState("");

  const [
    sort,
    setSort,
  ] =
    useState("marketCap");

  const [
    filter,
    setFilter,
  ] =
    useState("all");

  const [
    page,
    setPage,
  ] =
    useState(1);

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    refreshing,
    setRefreshing,
  ] =
    useState(false);

  const [
    error,
    setError,
  ] =
    useState(null);

  const [
    lastUpdated,
    setLastUpdated,
  ] =
    useState(null);

  const [
    theme,
    setTheme,
  ] =
    useState(() => {
      const savedTheme =
        window.localStorage.getItem(
          "aema-crypto-theme",
        );

      if (
        savedTheme === "dark" ||
        savedTheme === "light"
      ) {
        return savedTheme;
      }

      return window.matchMedia(
        "(prefers-color-scheme: dark)",
      ).matches
        ? "dark"
        : "light";
    });

  useEffect(
    () => {
      window.localStorage.setItem(
        "aema-crypto-theme",
        theme,
      );
    },
    [theme],
  );

  const loadMarkets =
    useCallback(
      async ({
        manual = false,
      } = {}) => {
        try {
          if (manual) {
            setRefreshing(true);
          } else {
            setLoading(true);
          }

          setError(null);

          const payload =
            await getCryptoMarketsOverview();

          setOverview(
            normalizeOverview(
              payload,
            ),
          );

          setLastUpdated(
            new Date(),
          );
        } catch (requestError) {
          setError(
            requestError?.message ??
            "Unable to load crypto markets.",
          );
        } finally {
          setLoading(false);
          setRefreshing(false);
        }
      },
      [],
    );

  useEffect(
    () => {
      void loadMarkets();
    },
    [loadMarkets],
  );

  useEffect(
    () => {
      setPage(1);
    },
    [
      query,
      sort,
      filter,
    ],
  );

  const filteredAssets =
    useMemo(
      () => {
        const needle =
          query
            .trim()
            .toLowerCase();

        return overview.assets
          .filter(
            asset => {
              const matchesQuery =
                !needle ||
                asset.symbol
                  .toLowerCase()
                  .includes(
                    needle,
                  ) ||
                asset.name
                  .toLowerCase()
                  .includes(
                    needle,
                  );

              if (!matchesQuery) {
                return false;
              }

              if (
                filter === "gainers"
              ) {
                return (
                  asset.change24h ??
                  0
                ) > 0;
              }

              if (
                filter === "losers"
              ) {
                return (
                  asset.change24h ??
                  0
                ) < 0;
              }

              return true;
            },
          )
          .sort(
            (a, b) => {
              if (
                sort === "change"
              ) {
                return (
                  b.change24h ??
                  -Infinity
                ) - (
                  a.change24h ??
                  -Infinity
                );
              }

              if (
                sort === "volume"
              ) {
                return (
                  b.volume24h ??
                  -Infinity
                ) - (
                  a.volume24h ??
                  -Infinity
                );
              }

              if (
                sort === "price"
              ) {
                return (
                  b.price ??
                  -Infinity
                ) - (
                  a.price ??
                  -Infinity
                );
              }

              return (
                b.marketCap ??
                -Infinity
              ) - (
                a.marketCap ??
                -Infinity
              );
            },
          );
      },
      [
        overview.assets,
        query,
        sort,
        filter,
      ],
    );

  const gainers =
    useMemo(
      () =>
        overview.assets
          .filter(
            asset =>
              (
                asset.change24h ??
                0
              ) > 0,
          )
          .sort(
            (a, b) =>
              b.change24h -
              a.change24h,
          )
          .slice(0, 5),
      [overview.assets],
    );

  const losers =
    useMemo(
      () =>
        overview.assets
          .filter(
            asset =>
              (
                asset.change24h ??
                0
              ) < 0,
          )
          .sort(
            (a, b) =>
              a.change24h -
              b.change24h,
          )
          .slice(0, 5),
      [overview.assets],
    );

  const totalPages =
    Math.max(
      1,
      Math.ceil(
        filteredAssets.length /
        PAGE_SIZE,
      ),
    );

  const currentPage =
    Math.min(
      page,
      totalPages,
    );

  const visibleAssets =
    filteredAssets.slice(
      (
        currentPage -
        1
      ) * PAGE_SIZE,
      currentPage *
        PAGE_SIZE,
    );

  const positiveCount =
    overview.assets.filter(
      asset =>
        (
          asset.change24h ??
          0
        ) > 0,
    ).length;

  const negativeCount =
    overview.assets.filter(
      asset =>
        (
          asset.change24h ??
          0
        ) < 0,
    ).length;

  const marketBreadth =
    positiveCount +
      negativeCount >
    0
      ? (
          positiveCount /
          (
            positiveCount +
            negativeCount
          )
        ) * 100
      : null;

  const metrics = [
    {
      icon:
        CircleDollarSign,
      label:
        "Total Market Cap",
      value:
        formatCompactMoney(
          overview.totalMarketCap,
        ),
      detail:
        "Tracked market capitalization",
    },
    {
      icon:
        BarChart3,
      label:
        "24H Volume",
      value:
        formatCompactMoney(
          overview.volume24h,
        ),
      detail:
        "Aggregate trading activity",
    },
    {
      icon:
        Bitcoin,
      label:
        "BTC Dominance",
      value:
        overview.btcDominance ===
        null
          ? "—"
          : `${overview.btcDominance.toFixed(
              2,
            )}%`,
      detail:
        "Bitcoin share of tracked cap",
    },
    {
      icon:
        Activity,
      label:
        "Market Breadth",
      value:
        marketBreadth === null
          ? "—"
          : `${marketBreadth.toFixed(
              1,
            )}%`,
      detail:
        `${positiveCount} advancing · ${negativeCount} declining`,
      tone:
        marketBreadth === null
          ? "neutral"
          : marketBreadth >= 50
            ? "positive"
            : "negative",
    },
  ];

  return (
    <div
      className={`crypto-shell crypto-theme-${theme}`}
    >
      <CryptoSidebar />

      <main className="crypto-markets-page">
        <section className="crypto-markets-header">
          <div className="crypto-markets-heading">
            <span className="crypto-markets-eyebrow">
              AEMA Crypto Intelligence
            </span>

            <h1>
              Crypto Markets
            </h1>

            <p>
              A clean market intelligence view of the assets
              feeding AEMA's crypto research and qualification
              pipeline.
            </p>
          </div>

          <div className="crypto-markets-header__actions">
            <div className="crypto-markets-workspace-jump">
              <WorkspaceJumpButton
                target="stocks"
              />
            </div>

            <button
              type="button"
              className="crypto-markets-theme-toggle"
              onClick={() =>
                setTheme(
                  current =>
                    current === "dark"
                      ? "light"
                      : "dark",
                )
              }
              aria-label={
                theme === "dark"
                  ? "Switch to light theme"
                  : "Switch to dark theme"
              }
              title={
                theme === "dark"
                  ? "Light theme"
                  : "Dark theme"
              }
            >
              {theme === "dark" ? (
                <Sun size={17} />
              ) : (
                <Moon size={17} />
              )}
            </button>

            <button
              type="button"
              className="crypto-markets-refresh"
              onClick={() =>
                void loadMarkets({
                  manual: true,
                })
              }
              disabled={refreshing}
            >
              <RefreshCw
                size={16}
                className={
                  refreshing
                    ? "spin"
                    : ""
                }
              />

              <span>
                {refreshing
                  ? "Refreshing"
                  : "Refresh"}
              </span>
            </button>
          </div>
        </section>

        {error ? (
          <section className="crypto-markets-error">
            <div>
              <strong>
                Market data unavailable
              </strong>

              <span>
                {error}
              </span>
            </div>

            <button
              type="button"
              onClick={() =>
                void loadMarkets({
                  manual: true,
                })
              }
            >
              Try again
            </button>
          </section>
        ) : null}

        <section className="crypto-markets-status-strip">
          <div>
            <span>
              Data State
            </span>

            <strong
              className={
                error
                  ? "danger"
                  : loading
                    ? "warning"
                    : "healthy"
              }
            >
              {error
                ? "UNAVAILABLE"
                : loading
                  ? "LOADING"
                  : "CONNECTED"}
            </strong>
          </div>

          <div>
            <span>
              Assets
            </span>

            <strong>
              {overview.assets.length}
            </strong>
          </div>

          <div>
            <span>
              Market Scope
            </span>

            <strong>
              CEX + DEX
            </strong>
          </div>

          <div>
            <span>
              Purpose
            </span>

            <strong>
              RESEARCH
            </strong>
          </div>
        </section>

        <section className="crypto-market-metrics">
          {metrics.map(
            metric => (
              <MetricCard
                key={metric.label}
                {...metric}
              />
            ),
          )}
        </section>

        <section className="crypto-market-movers">
          <MoverList
            title="Top Gainers"
            icon={TrendingUp}
            assets={gainers}
            direction="up"
          />

          <MoverList
            title="Top Losers"
            icon={TrendingDown}
            assets={losers}
            direction="down"
          />
        </section>

        <section className="crypto-market-table-card">
          <div className="crypto-market-toolbar">
            <div className="crypto-market-toolbar__heading">
              <span>
                MARKET UNIVERSE
              </span>

              <h2>
                Market Overview
              </h2>

              <p>
                {filteredAssets.length}
                {" "}
                assets in the current view
              </p>
            </div>

            <div className="crypto-market-toolbar__actions">
              <div className="crypto-market-filter-tabs">
                {[
                  ["all", "All"],
                  ["gainers", "Gainers"],
                  ["losers", "Losers"],
                ].map(
                  ([value, label]) => (
                    <button
                      type="button"
                      key={value}
                      className={
                        filter === value
                          ? "active"
                          : ""
                      }
                      onClick={() =>
                        setFilter(
                          value,
                        )
                      }
                    >
                      {label}
                    </button>
                  ),
                )}
              </div>

              <label className="crypto-market-search">
                <Search size={16} />

                <input
                  value={query}
                  onChange={
                    event =>
                      setQuery(
                        event.target.value,
                      )
                  }
                  placeholder="Search symbol or asset"
                  aria-label="Search crypto markets"
                />
              </label>

              <select
                value={sort}
                onChange={
                  event =>
                    setSort(
                      event.target.value,
                    )
                }
                aria-label="Sort crypto markets"
              >
                <option value="marketCap">
                  Market cap
                </option>

                <option value="volume">
                  24H volume
                </option>

                <option value="change">
                  24H change
                </option>

                <option value="price">
                  Price
                </option>
              </select>
            </div>
          </div>

          <div className="crypto-market-table-wrap">
            <table className="crypto-market-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Asset</th>
                  <th>Price</th>
                  <th>24H</th>
                  <th>Market Cap</th>
                  <th>24H Volume</th>
                  <th>Market</th>
                </tr>
              </thead>

              <tbody>
                {visibleAssets.map(
                  (
                    asset,
                    index,
                  ) => (
                    <tr key={asset.id}>
                      <td className="crypto-market-table__rank">
                        {asset.rank ??
                          (
                            currentPage -
                            1
                          ) *
                            PAGE_SIZE +
                            index +
                            1}
                      </td>

                      <td>
                        <div className="crypto-market-symbol">
                          <div className="crypto-market-symbol__mark">
                            {asset.symbol.slice(
                              0,
                              1,
                            )}
                          </div>

                          <div>
                            <strong>
                              {asset.symbol}
                            </strong>

                            <span>
                              {asset.name}
                            </span>
                          </div>
                        </div>
                      </td>

                      <td className="crypto-market-table__number">
                        {formatMoney(
                          asset.price,
                        )}
                      </td>

                      <td>
                        <span
                          className={`crypto-market-change ${
                            (
                              asset.change24h ??
                              0
                            ) > 0
                              ? "market-up"
                              : (
                                  asset.change24h ??
                                  0
                                ) < 0
                                ? "market-down"
                                : "market-neutral"
                          }`}
                        >
                          {(
                            asset.change24h ??
                            0
                          ) > 0 ? (
                            <ArrowUpRight
                              size={13}
                            />
                          ) : (
                            (
                              asset.change24h ??
                              0
                            ) < 0 ? (
                              <ArrowDownRight
                                size={13}
                              />
                            ) : null
                          )}

                          {formatPercent(
                            asset.change24h,
                          )}
                        </span>
                      </td>

                      <td className="crypto-market-table__number">
                        {formatCompactMoney(
                          asset.marketCap,
                        )}
                      </td>

                      <td className="crypto-market-table__number">
                        {formatCompactMoney(
                          asset.volume24h,
                        )}
                      </td>

                      <td>
                        <div className="crypto-market-tags">
                          {asset.marketType ? (
                            <span>
                              {asset.marketType}
                            </span>
                          ) : null}

                          {asset.venue ? (
                            <span>
                              {asset.venue}
                            </span>
                          ) : null}

                          {!asset.marketType &&
                          !asset.venue ? (
                            <span>
                              —
                            </span>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>

            {loading ? (
              <div className="crypto-market-loading">
                <RefreshCw
                  size={19}
                  className="spin"
                />

                <strong>
                  Loading crypto markets
                </strong>

                <span>
                  Reading real market data…
                </span>
              </div>
            ) : null}

            {!loading &&
            visibleAssets.length === 0 ? (
              <div className="crypto-market-empty crypto-market-empty--table">
                <Database size={19} />

                <strong>
                  No assets in this view
                </strong>

                <span>
                  Adjust the market filter or search term.
                </span>
              </div>
            ) : null}
          </div>

          <div className="crypto-market-pagination">
            <span>
              Showing{" "}
              {filteredAssets.length
                ? (
                    currentPage -
                    1
                  ) *
                    PAGE_SIZE +
                  1
                : 0}
              –
              {Math.min(
                currentPage *
                  PAGE_SIZE,
                filteredAssets.length,
              )}{" "}
              of{" "}
              {filteredAssets.length}
            </span>

            <div>
              <button
                type="button"
                disabled={
                  currentPage <= 1
                }
                onClick={() =>
                  setPage(
                    current =>
                      Math.max(
                        1,
                        current - 1,
                      ),
                  )
                }
                aria-label="Previous page"
              >
                <ChevronLeft
                  size={16}
                />
              </button>

              <strong>
                {currentPage} /{" "}
                {totalPages}
              </strong>

              <button
                type="button"
                disabled={
                  currentPage >=
                  totalPages
                }
                onClick={() =>
                  setPage(
                    current =>
                      Math.min(
                        totalPages,
                        current + 1,
                      ),
                  )
                }
                aria-label="Next page"
              >
                <ChevronRight
                  size={16}
                />
              </button>
            </div>
          </div>
        </section>

        <footer className="crypto-markets-footer">
          <span>
            Research display only · No execution authority
          </span>

          <span>
            {lastUpdated
              ? `Updated ${lastUpdated.toLocaleTimeString()}`
              : overview.updatedAt
                ? `Source ${new Date(
                    overview.updatedAt,
                  ).toLocaleString()}`
                : "Awaiting market refresh"}
          </span>
        </footer>
      </main>
    </div>
  );
}
