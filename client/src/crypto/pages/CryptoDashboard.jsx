import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  CircleDollarSign,
  Clock3,
  RefreshCw,
  Moon,
  Sun,
  ShieldCheck,
  TrendingUp,
  WalletCards,
} from "lucide-react";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import CryptoSidebar from
  "../components/CryptoSidebar.jsx";

import WorkspaceJumpButton from
  "../../components/WorkspaceJumpButton.jsx";

  
import {
  getCryptoWorkspaceSnapshot,
} from "../services/cryptoApi.js";

import "./CryptoDashboard.css";


function numberOrZero(
  value,
) {
  const number =
    Number(value);

  return Number.isFinite(number)
    ? number
    : 0;
}


function formatCurrency(
  value,
) {
  return new Intl.NumberFormat(
    "en-CA",
    {
      style:
        "currency",

      currency:
        "CAD",

      maximumFractionDigits:
        2,
    },
  ).format(
    numberOrZero(value),
  );
}


function formatPercent(
  value,
) {
  const number =
    numberOrZero(value);

  const prefix =
    number > 0
      ? "+"
      : "";

  return `${prefix}${number.toFixed(2)}%`;
}


function pnlClass(
  value,
) {
  const number =
    numberOrZero(value);

  if (number > 0) {
    return "positive";
  }

  if (number < 0) {
    return "negative";
  }

  return "neutral";
}


function statusClass(
  state,
) {
  const normalized =
    String(
      state ?? "",
    )
      .trim()
      .toUpperCase();

  if (
    normalized === "NORMAL" ||
    normalized === "READY" ||
    normalized === "HEALTHY"
  ) {
    return "healthy";
  }

  if (
    normalized === "DEGRADED"
  ) {
    return "warning";
  }

  if (
    normalized === "SAFE_MODE" ||
    normalized === "HALTED" ||
    normalized === "FAILED"
  ) {
    return "danger";
  }

  return "neutral";
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
      className={`crypto-metric-card ${tone}`}
    >
      <div
        className="crypto-metric-icon"
      >
        <Icon size={18} />
      </div>

      <div
        className="crypto-metric-content"
      >
        <span>
          {label}
        </span>

        <strong>
          {value}
        </strong>

        {detail ? (
          <small>
            {detail}
          </small>
        ) : null}
      </div>
    </article>
  );
}


function EmptyState({
  title,
  message,
}) {
  return (
    <div
      className="crypto-empty-state"
    >
      <div
        className="crypto-empty-dot"
      />

      <strong>
        {title}
      </strong>

      <span>
        {message}
      </span>
    </div>
  );
}


export default function CryptoDashboard() {
  const [
    snapshot,
    setSnapshot,
  ] =
    useState(null);

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
    [
      theme,
    ],
  );


  const loadDashboard =
    useCallback(
      async ({
        manual = false,
      } = {}) => {
        try {
          if (manual) {
            setRefreshing(
              true,
            );
          } else {
            setLoading(
              true,
            );
          }

          setError(
            null,
          );

          const result =
            await getCryptoWorkspaceSnapshot({
              tradeLimit:
                10,
            });

          setSnapshot(
            result,
          );

          setLastUpdated(
            new Date(),
          );
        } catch (requestError) {
          setError(
            requestError
              ?.message ??
            "Unable to load crypto workspace.",
          );
        } finally {
          setLoading(
            false,
          );

          setRefreshing(
            false,
          );
        }
      },
      [],
    );


  useEffect(
    () => {
      void loadDashboard();
    },
    [
      loadDashboard,
    ],
  );


  const dashboard =
    snapshot
      ?.dashboard ??
    null;


  const account =
    dashboard
      ?.account
      ?.account ??
    {};


  const positions =
    dashboard
      ?.positions
      ?.positions ??
    [];


  const orders =
    dashboard
      ?.openOrders
      ?.orders ??
    [];


  const trades =
    snapshot
      ?.trades
      ?.trades ??
    [];


  const supervisor =
    dashboard
      ?.health
      ?.supervisor ??
    {};


  const persistence =
    dashboard
      ?.persistence
      ?.persistence ??
    {};


  const recovery =
    dashboard
      ?.recovery
      ?.recovery ??
    {};


  const runtime =
    dashboard
      ?.runtime
      ?.runtime ??
    {};


  const runtimeState =
    supervisor
      ?.supervisorState ??
    "UNKNOWN";


  const recoveryState =
    recovery
      ?.state ??
    "UNKNOWN";


  const metrics =
    useMemo(
      () => [
        {
          icon:
            WalletCards,

          label:
            "Account Equity",

          value:
            formatCurrency(
              account?.equity,
            ),

          detail:
            `Starting ${formatCurrency(
              account?.startingEquity,
            )}`,
        },

        {
          icon:
            TrendingUp,

          label:
            "Total Return",

          value:
            formatPercent(
              account?.returnPercent,
            ),

          detail:
            formatCurrency(
              account?.returnUsd,
            ),

          tone:
            pnlClass(
              account?.returnUsd,
            ),
        },

        {
          icon:
            ArrowUpRight,

          label:
            "Realized P&L",

          value:
            formatCurrency(
              account?.realizedPnl,
            ),

          detail:
            `${numberOrZero(
              account?.closedTrades,
            )} closed trades`,

          tone:
            pnlClass(
              account?.realizedPnl,
            ),
        },

        {
          icon:
            Activity,

          label:
            "Unrealized P&L",

          value:
            formatCurrency(
              account?.unrealizedPnl,
            ),

          detail:
            `${positions.length} open positions`,

          tone:
            pnlClass(
              account?.unrealizedPnl,
            ),
        },

        {
          icon:
            ArrowDownRight,

          label:
            "Drawdown",

          value:
            formatPercent(
              account?.drawdownPercent,
            ),

          detail:
            formatCurrency(
              account?.drawdownUsd,
            ),

          tone:
            numberOrZero(
              account?.drawdownPercent,
            ) > 0
              ? "negative"
              : "neutral",
        },

        {
          icon:
            CircleDollarSign,

          label:
            "Fees + Funding",

          value:
            formatCurrency(
              numberOrZero(
                account?.tradingFees,
              ) -
              numberOrZero(
                account?.fundingPnl,
              ),
            ),

          detail:
            `${formatCurrency(
              account?.tradingFees,
            )} fees`,
        },
      ],
      [
        account,
        positions.length,
      ],
    );


  if (loading) {
    return (
      <div
        className={`crypto-shell crypto-theme-${theme}`}
      >
        <CryptoSidebar />

        <main
          className="crypto-dashboard-page"
        >
          <div
            className="crypto-loading-state"
          >
            <RefreshCw
              className="spin"
              size={22}
            />

            <strong>
              Loading crypto workspace
            </strong>

            <span>
              Reading live paper-runtime state…
            </span>
          </div>
        </main>
      </div>
    );
  }


  return (
    <div
      className={`crypto-shell crypto-theme-${theme}`}
    >
      <CryptoSidebar />

      <main
        className="crypto-dashboard-page"
      >
        <section
          className="crypto-dashboard-header"
        >
          <div className="crypto-dashboard-heading">
            <span
              className="crypto-eyebrow"
            >
              AEMA Crypto Intelligence
            </span>

            <h1>
              Crypto Research Dashboard
            </h1>

            <p>
              Crypto market research, account performance, portfolio activity,
              runtime health and paper execution state in one professional workspace.
            </p>
          </div>

          <div
  className="crypto-header-actions"
>
  <div className="crypto-workspace-jump">
    <WorkspaceJumpButton
      target="stocks"
    />
  </div>

  <div
    className={`crypto-runtime-pill ${statusClass(
      runtimeState,
    )}`}
  >
    <span
      className="crypto-runtime-dot"
    />

    {runtimeState}
  </div>


  <button
    type="button"
    className="crypto-theme-toggle"
    onClick={() =>
      setTheme(current =>
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
    className="crypto-refresh-button"
    onClick={() =>
      void loadDashboard({
        manual: true,
      })
    }
    disabled={
      refreshing
    }
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
      Refresh
    </span>
  </button>
</div>
        </section>


        {error ? (
          <section
            className="crypto-error-banner"
          >
            <strong>
              Unable to refresh workspace
            </strong>

            <span>
              {error}
            </span>
          </section>
        ) : null}


        <section
          className="crypto-system-strip"
        >
          <div>
            <span>
              Runtime
            </span>

            <strong
              className={statusClass(
                runtimeState,
              )}
            >
              {runtimeState}
            </strong>
          </div>

          <div>
            <span>
              Recovery
            </span>

            <strong
              className={statusClass(
                recoveryState,
              )}
            >
              {recoveryState}
            </strong>
          </div>

          <div>
            <span>
              Persistence
            </span>

            <strong
              className={
                persistence
                  ?.dirty
                  ? "warning"
                  : "healthy"
              }
            >
              {persistence
                ?.dirty
                ? "DIRTY"
                : "SYNCED"}
            </strong>
          </div>

          <div>
            <span>
              Mode
            </span>

            <strong>
              PAPER
            </strong>
          </div>
        </section>


        <section
          className="crypto-metrics-grid"
        >
          {metrics.map(
            metric => (
              <MetricCard
                key={
                  metric.label
                }
                {...metric}
              />
            ),
          )}
        </section>


        <section
          className="crypto-dashboard-grid"
        >
          <article
            className="crypto-panel crypto-panel--runtime"
          >
            <div
              className="crypto-panel-heading"
            >
              <div>
                <span>
                  Runtime & Safety
                </span>

                <h2>
                  System Control
                </h2>
              </div>

              <ShieldCheck
                size={20}
              />
            </div>

            <div
              className="crypto-runtime-grid"
            >
              <div>
                <span>
                  Supervisor
                </span>

                <strong
                  className={statusClass(
                    runtimeState,
                  )}
                >
                  {runtimeState}
                </strong>
              </div>

              <div>
                <span>
                  Recovery
                </span>

                <strong
                  className={statusClass(
                    recoveryState,
                  )}
                >
                  {recoveryState}
                </strong>
              </div>

              <div>
                <span>
                  Runtime Cycle
                </span>

                <strong>
                  {numberOrZero(
                    runtime?.cycle,
                  )}
                </strong>
              </div>

              <div>
                <span>
                  Checkpoints
                </span>

                <strong>
                  {numberOrZero(
                    persistence
                      ?.checkpointCount,
                  )}
                </strong>
              </div>

              <div>
                <span>
                  Live Execution
                </span>

                <strong>
                  DISABLED
                </strong>
              </div>

              <div>
                <span>
                  Execution Authority
                </span>

                <strong>
                  NONE
                </strong>
              </div>
            </div>
          </article>


          <article
            className="crypto-panel"
          >
            <div
              className="crypto-panel-heading"
            >
              <div>
                <span>
                  Portfolio
                </span>

                <h2>
                  Active Positions
                </h2>
              </div>

              <strong
                className="crypto-count-pill"
              >
                {positions.length}
              </strong>
            </div>

            {positions.length === 0 ? (
              <EmptyState
                title="No active positions"
                message="The paper runtime currently has no active crypto exposure."
              />
            ) : (
              <div
                className="crypto-mobile-card-stack"
              >
                {positions.map(
                  position => (
                    <div
                      key={
                        position
                          ?.symbol
                      }
                      className="crypto-position-card"
                    >
                      <div>
                        <strong>
                          {position
                            ?.symbol}
                        </strong>

                        <span
                          className={
                            position?.direction === "LONG"
                              ? "bull"
                              : position?.direction === "SHORT"
                                ? "bear"
                                : "neutral"
                          }
                        >
                          {position
                            ?.direction}
                        </span>
                      </div>

                      <div>
                        <span>
                          Quantity
                        </span>

                        <strong>
                          {numberOrZero(
                            position
                              ?.quantity,
                          )}
                        </strong>
                      </div>

                      <div>
                        <span>
                          Entry
                        </span>

                        <strong>
                          {formatCurrency(
                            position
                              ?.averageEntryPrice,
                          )}
                        </strong>
                      </div>
                    </div>
                  ),
                )}
              </div>
            )}
          </article>
        </section>


        <section
          className="crypto-dashboard-grid crypto-dashboard-grid--lower"
        >
          <article
            className="crypto-panel"
          >
            <div
              className="crypto-panel-heading"
            >
              <div>
                <span>
                  Execution
                </span>

                <h2>
                  Pending Orders
                </h2>
              </div>

              <strong
                className="crypto-count-pill"
              >
                {orders.length}
              </strong>
            </div>

            {orders.length === 0 ? (
              <EmptyState
                title="No pending orders"
                message="There are no pending paper orders at the moment."
              />
            ) : (
              <div
                className="crypto-mobile-card-stack"
              >
                {orders.map(
                  order => (
                    <div
                      key={
                        order
                          ?.orderId ??
                        order
                          ?.clientOrderId
                      }
                      className="crypto-order-card"
                    >
                      <div>
                        <strong>
                          {order
                            ?.symbol}
                        </strong>

                        <span>
                          {order
                            ?.status}
                        </span>
                      </div>

                      <div>
                        <span>
                          Filled
                        </span>

                        <strong>
                          {numberOrZero(
                            order
                              ?.filledQuantity,
                          )}
                        </strong>
                      </div>

                      <div>
                        <span>
                          Remaining
                        </span>

                        <strong>
                          {numberOrZero(
                            order
                              ?.remainingQuantity,
                          )}
                        </strong>
                      </div>
                    </div>
                  ),
                )}
              </div>
            )}
          </article>


          <article
            className="crypto-panel"
          >
            <div
              className="crypto-panel-heading"
            >
              <div>
                <span>
                  Activity
                </span>

                <h2>
                  Recent Activity
                </h2>
              </div>

              <Clock3
                size={19}
              />
            </div>

            {trades.length === 0 ? (
              <EmptyState
                title="No trade history"
                message="Completed paper executions will appear here."
              />
            ) : (
              <div
                className="crypto-mobile-card-stack"
              >
                {trades
                  .slice(
                    -6,
                  )
                  .reverse()
                  .map(
                    trade => (
                      <div
                        key={
                          trade
                            ?.id ??
                          trade
                            ?.fillId ??
                          `${trade?.symbol}-${trade?.createdAt}`
                        }
                        className="crypto-trade-card"
                      >
                        <div>
                          <strong>
                            {trade
                              ?.symbol ??
                            "—"}
                          </strong>

                          <span>
                            {trade
                              ?.type ??
                            trade
                              ?.intent ??
                            "TRADE"}
                          </span>
                        </div>

                        <div>
                          <span>
                            Quantity
                          </span>

                          <strong>
                            {numberOrZero(
                              trade
                                ?.quantity ??
                              trade
                                ?.filledQuantity,
                            )}
                          </strong>
                        </div>

                        <div>
                          <span>
                            P&L
                          </span>

                          <strong
                            className={pnlClass(
                              trade
                                ?.realizedPnl,
                            )}
                          >
                            {formatCurrency(
                              trade
                                ?.realizedPnl,
                            )}
                          </strong>
                        </div>
                      </div>
                    ),
                  )}
              </div>
            )}
          </article>
        </section>


        <footer
          className="crypto-dashboard-footer"
        >
          <span>
            Crypto research workspace
          </span>

          <span>
            Paper execution only
          </span>

          <span>
            Live execution disabled
          </span>

          <span>
            {lastUpdated
              ? `Updated ${lastUpdated.toLocaleTimeString()}`
              : "Not yet refreshed"}
          </span>
        </footer>
      </main>
    </div>
  );
}