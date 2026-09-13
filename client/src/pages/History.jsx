import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  RefreshCw,
  Search,
  Target,
  Trophy,
  X,
} from "lucide-react";

import Sidebar from
  "../components/Sidebar.jsx";

import {
  getTradeHistory,
} from "../services/api.js";

import "./History.css";

function numberOrNull(
  value,
) {
  const number =
    Number(value);

  return Number.isFinite(
    number,
  )
    ? number
    : null;
}

function formatMoney(
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
      style:
        "currency",

      currency:
        "CAD",

      minimumFractionDigits:
        2,

      maximumFractionDigits:
        2,
    },
  ).format(
    number,
  );
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

function formatR(
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
  )}R`;
}

function formatDateTime(
  value,
) {
  if (!value) {
    return "—";
  }

  const date =
    new Date(
      value,
    );

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return "—";
  }

  return date.toLocaleString();
}

function formatDuration(
  milliseconds,
) {
  const value =
    numberOrNull(
      milliseconds,
    );

  if (
    value === null ||
    value < 0
  ) {
    return "—";
  }

  const minutes =
    Math.floor(
      value /
      60_000,
    );

  if (
    minutes <
    60
  ) {
    return `${minutes}m`;
  }

  const hours =
    Math.floor(
      minutes /
      60,
    );

  const remainder =
    minutes %
    60;

  if (
    hours <
    24
  ) {
    return `${hours}h ${remainder}m`;
  }

  const days =
    Math.floor(
      hours /
      24,
    );

  return `${days}d ${hours % 24}h`;
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  className = "",
}) {
  return (
    <div
      className={`history-summary-card ${className}`}
    >
      <Icon size={18} />

      <span>
        {label}
      </span>

      <strong>
        {value}
      </strong>
    </div>
  );
}

function TradeReplay({
  trade,
  onClose,
}) {
  if (!trade) {
    return null;
  }

  const entry =
    trade
      ?.entry ??
    {};

  const exit =
    trade
      ?.exit ??
    {};

  const performance =
    trade
      ?.performance ??
    {};

  const intelligence =
    trade
      ?.intelligence ??
    {};

  return (
    <div
      className="history-modal-backdrop"
      onClick={
        onClose
      }
    >
      <div
        className="history-replay"
        onClick={
          event =>
            event.stopPropagation()
        }
      >
        <div className="history-replay-header">
          <div>
            <span>
              Trade Replay
            </span>

            <div className="history-replay-title">
              <h2>
                {trade.symbol}
              </h2>

              <span
                className={`history-side ${String(
                  trade.side ??
                  "",
                ).toLowerCase()}`}
              >
                {trade.side}
              </span>

              <span
                className={`history-result ${String(
                  trade.result ??
                  "",
                ).toLowerCase()}`}
              >
                {trade.result}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={
              onClose
            }
          >
            <X size={18} />
          </button>
        </div>

        <div className="history-replay-performance">
          <div>
            <span>
              Realized P&L
            </span>

            <strong
              className={
                Number(
                  performance
                    ?.realizedPnL ??
                  0,
                ) >=
                0
                  ? "history-positive"
                  : "history-negative"
              }
            >
              {formatMoney(
                performance
                  ?.realizedPnL,
              )}
            </strong>
          </div>

          <div>
            <span>
              Return
            </span>

            <strong>
              {formatPercent(
                performance
                  ?.returnPercent,
              )}
            </strong>
          </div>

          <div>
            <span>
              R Result
            </span>

            <strong>
              {formatR(
                performance
                  ?.rMultiple,
              )}
            </strong>
          </div>

          <div>
            <span>
              Duration
            </span>

            <strong>
              {formatDuration(
                trade
                  ?.durationMs,
              )}
            </strong>
          </div>
        </div>

        <div className="history-replay-columns">
          <section>
            <h3>
              Entry
            </h3>

            <div className="history-detail-row">
              <span>
                Price
              </span>

              <strong>
                {formatMoney(
                  entry
                    ?.price,
                )}
              </strong>
            </div>

            <div className="history-detail-row">
              <span>
                Shares
              </span>

              <strong>
                {entry
                  ?.shares ??
                  "—"}
              </strong>
            </div>

            <div className="history-detail-row">
              <span>
                Time
              </span>

              <strong>
                {formatDateTime(
                  entry
                    ?.timestamp,
                )}
              </strong>
            </div>

            <div className="history-detail-row">
              <span>
                Bot Score
              </span>

              <strong>
                {numberOrNull(
                  entry
                    ?.score,
                ) ===
                null
                  ? "—"
                  : Number(
                      entry
                        .score,
                    ).toFixed(
                      1,
                    )}
              </strong>
            </div>

            <div className="history-detail-row">
              <span>
                Initial Stop
              </span>

              <strong>
                {formatMoney(
                  entry
                    ?.stopPrice,
                )}
              </strong>
            </div>

            <div className="history-detail-row">
              <span>
                Target
              </span>

              <strong>
                {formatMoney(
                  entry
                    ?.targetPrice,
                )}
              </strong>
            </div>
          </section>

          <section>
            <h3>
              Exit
            </h3>

            <div className="history-detail-row">
              <span>
                Price
              </span>

              <strong>
                {formatMoney(
                  exit
                    ?.price,
                )}
              </strong>
            </div>

            <div className="history-detail-row">
              <span>
                Time
              </span>

              <strong>
                {formatDateTime(
                  exit
                    ?.timestamp,
                )}
              </strong>
            </div>

            <div className="history-detail-row">
              <span>
                Reason
              </span>

              <strong>
                {exit
                  ?.reason ??
                  "—"}
              </strong>
            </div>

            <div className="history-detail-row">
              <span>
                Peak R
              </span>

              <strong>
                {formatR(
                  performance
                    ?.peakR,
                )}
              </strong>
            </div>

            <div className="history-detail-row">
              <span>
                Best Price
              </span>

              <strong>
                {formatMoney(
                  performance
                    ?.bestPrice,
                )}
              </strong>
            </div>
          </section>
        </div>

        <section className="history-intelligence">
          <div className="history-section-heading">
            <BarChart3 size={17} />

            <h3>
              Entry Intelligence
            </h3>
          </div>

          <div className="history-intelligence-grid">
            {Object.entries(
              intelligence,
            ).map(
              ([
                key,
                value,
              ]) => (
                <div
                  key={
                    key
                  }
                >
                  <span>
                    {key.replaceAll(
                      "_",
                      " ",
                    )}
                  </span>

                  <strong>
                    {numberOrNull(
                      value
                        ?.score ??
                      value
                        ?.finalScore ??
                      value
                        ?.overallScore,
                    ) ===
                    null
                      ? value
                          ?.status ??
                        value
                          ?.decision ??
                        "Available"
                      : Number(
                          value
                            ?.score ??
                          value
                            ?.finalScore ??
                          value
                            ?.overallScore,
                        ).toFixed(
                          1,
                        )}
                  </strong>
                </div>
              ),
            )}
          </div>
        </section>

        <section className="history-learning">
          <h3>
            What the Bot Learned
          </h3>

          {trade
            ?.learning ? (
            <pre>
              {JSON.stringify(
                trade.learning,
                null,
                2,
              )}
            </pre>
          ) : (
            <p>
              No learning summary is stored for this trade yet.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}

export default function History() {
  const [
    data,
    setData,
  ] =
    useState(
      null,
    );

  const [
    loading,
    setLoading,
  ] =
    useState(
      true,
    );

  const [
    error,
    setError,
  ] =
    useState(
      null,
    );

  const [
    filter,
    setFilter,
  ] =
    useState(
      "ALL",
    );

  const [
    search,
    setSearch,
  ] =
    useState(
      "",
    );

  const [
    selectedTrade,
    setSelectedTrade,
  ] =
    useState(
      null,
    );

  async function loadHistory() {
    setLoading(
      true,
    );

    setError(
      null,
    );

    try {
      const result =
        await getTradeHistory(
          500,
        );

      setData(
        result,
      );
    } catch (
      requestError
    ) {
      setError(
        requestError
          ?.message ??
        "Unable to load trade history.",
      );
    } finally {
      setLoading(
        false,
      );
    }
  }

  useEffect(
    () => {
      loadHistory();
    },
    [],
  );

  const trades =
    useMemo(
      () =>
        Array.isArray(
          data
            ?.trades,
        )
          ? data.trades
          : [],
      [
        data,
      ],
    );

  const filteredTrades =
    useMemo(
      () => {
        const query =
          search
            .trim()
            .toUpperCase();

        return trades.filter(
          trade => {
            const matchesSearch =
              !query ||
              String(
                trade
                  ?.symbol ??
                "",
              )
                .toUpperCase()
                .includes(
                  query,
                );

            if (
              !matchesSearch
            ) {
              return false;
            }

            switch (
              filter
            ) {
              case "WIN":
                return trade.result ===
                  "WIN";

              case "LOSS":
                return trade.result ===
                  "LOSS";

              case "LONG":
                return trade.side ===
                  "LONG";

              case "SHORT":
                return trade.side ===
                  "SHORT";

              default:
                return true;
            }
          },
        );
      },
      [
        trades,
        filter,
        search,
      ],
    );

  const summary =
    data
      ?.summary ??
    {};

  return (
    <div className="app-shell">
      <Sidebar />

      <main className="main-content history-page">
        <div className="history-header">
          <div>
            <p className="eyebrow">
              Bot performance record
            </p>

            <h1>
              Trade History
            </h1>

            <p>
              Closed positions, outcomes, entry intelligence and
              historical learning.
            </p>
          </div>

          <button
            className="history-refresh"
            type="button"
            onClick={
              loadHistory
            }
            disabled={
              loading
            }
          >
            <RefreshCw
              size={16}
              className={
                loading
                  ? "history-spin"
                  : ""
              }
            />

            Refresh
          </button>
        </div>

        <div className="history-summary-grid">
          <SummaryCard
            icon={
              Activity
            }
            label="Total Trades"
            value={
              summary
                ?.totalTrades ??
              0
            }
          />

          <SummaryCard
            icon={
              Trophy
            }
            label="Win Rate"
            value={
              numberOrNull(
                summary
                  ?.winRate,
              ) ===
              null
                ? "—"
                : `${Number(
                    summary
                      .winRate,
                  ).toFixed(
                    1,
                  )}%`
            }
          />

          <SummaryCard
            icon={
              CircleDollarSign
            }
            label="Realized P&L"
            value={
              formatMoney(
                summary
                  ?.realizedPnL,
              )
            }
            className={
              Number(
                summary
                  ?.realizedPnL ??
                0,
              ) >=
              0
                ? "positive"
                : "negative"
            }
          />

          <SummaryCard
            icon={
              Target
            }
            label="Average R"
            value={
              formatR(
                summary
                  ?.averageR,
              )
            }
          />

          <SummaryCard
            icon={
              BarChart3
            }
            label="Profit Factor"
            value={
              numberOrNull(
                summary
                  ?.profitFactor,
              ) ===
              null
                ? "—"
                : Number(
                    summary
                      .profitFactor,
                  ).toFixed(
                    2,
                  )
            }
          />
        </div>

        <section className="history-card">
          <div className="history-toolbar">
            <div className="history-filter-buttons">
              {[
                [
                  "ALL",
                  "All",
                ],
                [
                  "WIN",
                  "Winners",
                ],
                [
                  "LOSS",
                  "Losers",
                ],
                [
                  "LONG",
                  "Long",
                ],
                [
                  "SHORT",
                  "Short",
                ],
              ].map(
                ([
                  value,
                  label,
                ]) => (
                  <button
                    key={
                      value
                    }
                    type="button"
                    className={
                      filter ===
                      value
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

            <div className="history-search">
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
                placeholder="Search symbol..."
              />
            </div>
          </div>

          {error && (
            <div className="history-error">
              {error}
            </div>
          )}

          {loading &&
          !data ? (
            <div className="history-empty">
              Loading trade history...
            </div>
          ) : filteredTrades.length ===
            0 ? (
            <div className="history-empty-state">
              <Clock3
                size={28}
              />

              <h2>
                No Completed Trades Yet
              </h2>

              <p>
                Closed bot positions will appear here with their
                performance, entry reasoning and learning history.
              </p>
            </div>
          ) : (
            <div className="history-table-wrap">
              <table className="history-table">
                <thead>
                  <tr>
                    <th>
                      Symbol
                    </th>

                    <th>
                      Side
                    </th>

                    <th>
                      Entry
                    </th>

                    <th>
                      Exit
                    </th>

                    <th>
                      P&L
                    </th>

                    <th>
                      Return
                    </th>

                    <th>
                      R
                    </th>

                    <th>
                      Score
                    </th>

                    <th>
                      Duration
                    </th>

                    <th>
                      Exit Reason
                    </th>

                    <th>
                      Result
                    </th>

                    <th />
                  </tr>
                </thead>

                <tbody>
                  {filteredTrades.map(
                    trade => (
                      <tr
                        key={
                          trade.id ??
                          `${trade.symbol}-${trade?.exit?.timestamp}`
                        }
                        onClick={() =>
                          setSelectedTrade(
                            trade,
                          )
                        }
                      >
                        <td>
                          <strong>
                            {trade.symbol}
                          </strong>
                        </td>

                        <td>
                          <span
                            className={`history-side ${String(
                              trade.side ??
                              "",
                            ).toLowerCase()}`}
                          >
                            {trade.side ??
                              "—"}
                          </span>
                        </td>

                        <td>
                          {formatMoney(
                            trade
                              ?.entry
                              ?.price,
                          )}
                        </td>

                        <td>
                          {formatMoney(
                            trade
                              ?.exit
                              ?.price,
                          )}
                        </td>

                        <td
                          className={
                            Number(
                              trade
                                ?.performance
                                ?.realizedPnL ??
                              0,
                            ) >=
                            0
                              ? "history-positive"
                              : "history-negative"
                          }
                        >
                          {formatMoney(
                            trade
                              ?.performance
                              ?.realizedPnL,
                          )}
                        </td>

                        <td>
                          {formatPercent(
                            trade
                              ?.performance
                              ?.returnPercent,
                          )}
                        </td>

                        <td>
                          {formatR(
                            trade
                              ?.performance
                              ?.rMultiple,
                          )}
                        </td>

                        <td>
                          {numberOrNull(
                            trade
                              ?.entry
                              ?.score,
                          ) ===
                          null
                            ? "—"
                            : Number(
                                trade
                                  .entry
                                  .score,
                              ).toFixed(
                                1,
                              )}
                        </td>

                        <td>
                          {formatDuration(
                            trade
                              ?.durationMs,
                          )}
                        </td>

                        <td>
                          {trade
                            ?.exit
                            ?.reason ??
                            "—"}
                        </td>

                        <td>
                          <span
                            className={`history-result ${String(
                              trade.result ??
                              "",
                            ).toLowerCase()}`}
                          >
                            {trade.result ??
                              "—"}
                          </span>
                        </td>

                        <td>
                          <ChevronRight
                            size={15}
                          />
                        </td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <TradeReplay
          trade={
            selectedTrade
          }
          onClose={() =>
            setSelectedTrade(
              null,
            )
          }
        />
      </main>
    </div>
  );
}