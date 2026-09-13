// client/src/pages/Positions.jsx

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  BriefcaseBusiness,
  CircleDollarSign,
  Clock3,
  Info,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

import Sidebar from
  "../components/Sidebar.jsx";

import {
  getOpenPositions,
} from "../services/api.js";

import "./Positions.css";

/* =========================================================
   FORMATTERS
   ========================================================= */

function numberOrNull(value) {
  const number =
    Number(value);

  return Number.isFinite(number)
    ? number
    : null;
}

function formatMoney(value) {
  const number =
    numberOrNull(value);

  if (number === null) {
    return "Unavailable";
  }

  return new Intl.NumberFormat(
    "en-CA",
    {
      style: "currency",
      currency: "CAD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    },
  ).format(number);
}

function formatPercent(value) {
  const number =
    numberOrNull(value);

  if (number === null) {
    return "Unavailable";
  }

  return `${
    number >= 0 ? "+" : ""
  }${number.toFixed(2)}%`;
}

function formatR(value) {
  const number =
    numberOrNull(value);

  if (number === null) {
    return "Unavailable";
  }

  return `${number.toFixed(2)}R`;
}

function formatDateTime(value) {
  if (!value) {
    return "Unavailable";
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return "Unavailable";
  }

  return date.toLocaleString(
    "en-CA",
    {
      dateStyle: "medium",
      timeStyle: "short",
    },
  );
}

/* =========================================================
   STATUS BADGES
   ========================================================= */

function ActionBadge({
  action,
}) {
  const normalized =
    String(
      action ??
      "UNKNOWN",
    ).toUpperCase();

  return (
    <span
      className={`research-position-action ${normalized.toLowerCase()}`}
    >
      {normalized}
    </span>
  );
}

function ConditionStatus({
  value,
}) {
  if (value === true) {
    return (
      <span className="research-condition-status valid">
        VALID
      </span>
    );
  }

  if (value === false) {
    return (
      <span className="research-condition-status invalid">
        WEAKENING
      </span>
    );
  }

  return (
    <span className="research-condition-status unknown">
      UNKNOWN
    </span>
  );
}

/* =========================================================
   METRIC
   ========================================================= */

function PositionMetric({
  label,
  value,
}) {
  return (
    <div className="research-position-metric">
      <span>
        {label}
      </span>

      <strong>
        {value}
      </strong>
    </div>
  );
}

/* =========================================================
   POSITION CARD
   ========================================================= */

function PositionCard({
  position,
}) {
  const performance =
    position?.performance ?? {};

  const risk =
    position?.risk ?? {};

  const management =
    position?.management ?? {};

  const thesis =
    position?.thesis ?? {};

  const entry =
    position?.entry ?? {};

  const market =
    position?.market ?? {};

  const pnl =
    numberOrNull(
      performance
        ?.unrealizedPnL,
    );

  const positive =
    pnl !== null &&
    pnl >= 0;

  const TrendIcon =
    positive
      ? TrendingUp
      : TrendingDown;

  const side =
    String(
      position.side ??
      "UNKNOWN",
    ).toUpperCase();

  return (
    <article className="research-position-card">
      {/* ===================================================
          CARD HEADER
      ==================================================== */}
      <div className="research-position-header">
        <div className="research-position-identity">
          <div className="research-position-symbol-row">
            <h2>
              {position.symbol}
            </h2>

            <span
              className={`research-position-side ${side.toLowerCase()}`}
            >
              {side}
            </span>
          </div>

          <div className="research-position-opened">
            <Clock3
              size={12}
              strokeWidth={2}
            />

            <span>
              Research position opened{" "}
              {formatDateTime(
                entry?.openedAt,
              )}
            </span>
          </div>
        </div>

        <ActionBadge
          action={
            management?.action ??
            management?.status ??
            "UNKNOWN"
          }
        />
      </div>

      {/* ===================================================
          P&L HERO
      ==================================================== */}
      <div
        className={`research-position-performance ${
          positive
            ? "positive"
            : "negative"
        }`}
      >
        <div className="research-position-performance-icon">
          <TrendIcon
            size={21}
            strokeWidth={2.1}
          />
        </div>

        <div className="research-position-performance-copy">
          <span>
            Model performance
          </span>

          <div className="research-position-performance-value">
            <strong>
              {formatMoney(
                performance
                  ?.unrealizedPnL,
              )}
            </strong>

            <small>
              {formatPercent(
                performance
                  ?.unrealizedPnLPercent,
              )}
            </small>
          </div>
        </div>
      </div>

      {/* ===================================================
          CORE METRICS
      ==================================================== */}
      <div className="research-position-metrics-grid">
        <PositionMetric
          label="Entry"
          value={
            formatMoney(
              entry?.price,
            )
          }
        />

        <PositionMetric
          label="Current"
          value={
            formatMoney(
              market?.currentPrice,
            )
          }
        />

        <PositionMetric
          label="Shares"
          value={
            entry?.shares ??
            "Unavailable"
          }
        />

        <PositionMetric
          label="Position value"
          value={
            formatMoney(
              market
                ?.currentPositionValue,
            )
          }
        />

        <PositionMetric
          label="Initial risk level"
          value={
            formatMoney(
              risk?.initialStop,
            )
          }
        />

        <PositionMetric
          label="Current risk level"
          value={
            formatMoney(
              risk?.currentStop,
            )
          }
        />

        <PositionMetric
          label="Research target"
          value={
            formatMoney(
              risk?.target,
            )
          }
        />

        <PositionMetric
          label="Entry score"
          value={
            risk
              ?.intelligenceScore ??
            "Unavailable"
          }
        />
      </div>

      {/* ===================================================
          RESEARCH MONITORING
      ==================================================== */}
      <div className="research-position-detail-grid">
        <section className="research-position-section">
          <div className="research-position-section-heading">
            <Activity
              size={15}
              strokeWidth={2.1}
            />

            <div>
              <strong>
                Model Monitoring
              </strong>

              <span>
                Current research state
              </span>
            </div>
          </div>

          <div className="research-detail-list">
            <div className="research-detail-row">
              <span>
                Model signal
              </span>

              <strong>
                {management
                  ?.action ??
                  "Unavailable"}
              </strong>
            </div>

            <div className="research-detail-row">
              <span>
                Current R
              </span>

              <strong>
                {formatR(
                  performance
                    ?.currentR,
                )}
              </strong>
            </div>

            <div className="research-detail-row">
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

            <div className="research-detail-row">
              <span>
                Research exposure
              </span>

              <strong>
                {numberOrNull(
                  management
                    ?.exposureMultiplier,
                ) === null
                  ? "Unavailable"
                  : `${(
                      Number(
                        management
                          .exposureMultiplier,
                      ) * 100
                    ).toFixed(0)}%`}
              </strong>
            </div>

            <div className="research-detail-row">
              <span>
                Risk monitoring
              </span>

              <strong>
                {management
                  ?.trailingActive ===
                true
                  ? "ACTIVE"
                  : management
                      ?.trailingActive ===
                    false
                    ? "INACTIVE"
                    : "Unavailable"}
              </strong>
            </div>
          </div>
        </section>

        {/* =================================================
            RESEARCH THESIS
        ================================================== */}
        <section className="research-position-section">
          <div className="research-position-section-heading">
            <ShieldCheck
              size={15}
              strokeWidth={2.1}
            />

            <div>
              <strong>
                Research Thesis
              </strong>

              <span>
                Evidence persistence
              </span>
            </div>
          </div>

          <div className="research-detail-list">
            <div className="research-detail-row">
              <span>
                Thesis status
              </span>

              <strong>
                {thesis
                  ?.status ??
                  "Unavailable"}
              </strong>
            </div>

            <div className="research-detail-row">
              <span>
                Conditions
              </span>

              <ConditionStatus
                value={
                  thesis
                    ?.conditionsPersist
                }
              />
            </div>

            <div className="research-detail-row">
              <span>
                Exposure outlook
              </span>

              <strong>
                {thesis
                  ?.exposureAction ??
                  "NONE"}
              </strong>
            </div>

            <div className="research-detail-row">
              <span>
                Thesis invalidated
              </span>

              <strong>
                {management
                  ?.shouldExit
                  ? "YES"
                  : "NO"}
              </strong>
            </div>

            <div className="research-detail-row">
              <span>
                Invalidation reason
              </span>

              <strong>
                {management
                  ?.exitReason ??
                  "None"}
              </strong>
            </div>
          </div>
        </section>
      </div>

      {/* ===================================================
          RESEARCH REASONING
      ==================================================== */}
      <div className="research-position-reasons-grid">
        <section className="research-reason-card">
          <div className="research-reason-heading">
            <Sparkles
              size={14}
              strokeWidth={2}
            />

            <h3>
              Initial Research Thesis
            </h3>
          </div>

          {(
            thesis
              ?.entryReasons ??
            []
          ).length > 0 ? (
            <ul>
              {thesis
                .entryReasons
                .map(
                  (
                    reason,
                    index,
                  ) => (
                    <li
                      key={`${index}-${String(
                        reason,
                      )}`}
                    >
                      {String(
                        reason,
                      )}
                    </li>
                  ),
                )}
            </ul>
          ) : (
            <p>
              Initial research reasoning is not available
              in the current record.
            </p>
          )}
        </section>

        <section className="research-reason-card">
          <div className="research-reason-heading">
            <Activity
              size={14}
              strokeWidth={2}
            />

            <h3>
              Current Research Conditions
            </h3>
          </div>

          {(
            thesis
              ?.currentReasons ??
            []
          ).length > 0 ? (
            <ul>
              {thesis
                .currentReasons
                .map(
                  (
                    reason,
                    index,
                  ) => (
                    <li
                      key={`${index}-${String(
                        reason,
                      )}`}
                    >
                      {String(
                        reason,
                      )}
                    </li>
                  ),
                )}
            </ul>
          ) : (
            <p>
              Current research reasoning is unavailable.
            </p>
          )}
        </section>
      </div>

      {/* ===================================================
          WARNINGS
      ==================================================== */}
      {(
        management
          ?.warnings ??
        []
      ).length > 0 && (
        <div className="research-position-warning">
          <div className="research-warning-heading">
            <Info
              size={14}
              strokeWidth={2}
            />

            <strong>
              Research limitations
            </strong>
          </div>

          {management
            .warnings
            .map(
              (
                warning,
                index,
              ) => (
                <p
                  key={`${index}-${warning}`}
                >
                  {warning}
                </p>
              ),
            )}
        </div>
      )}

      <div className="research-position-disclaimer">
        Research simulation data only — not investment advice.
      </div>
    </article>
  );
}

/* =========================================================
   PAGE
   ========================================================= */

export default function Positions() {
  const [
    data,
    setData,
  ] =
    useState(null);

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    error,
    setError,
  ] =
    useState(null);

  async function loadPositions() {
    setLoading(true);
    setError(null);

    try {
      const result =
        await getOpenPositions();

      setData(result);
    } catch (
      requestError
    ) {
      setError(
        requestError
          ?.message ??
        "Unable to load research positions.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(
    () => {
      loadPositions();

      const timer =
        setInterval(
          loadPositions,
          10_000,
        );

      return () =>
        clearInterval(timer);
    },
    [],
  );

  const positions =
    useMemo(
      () =>
        Array.isArray(
          data?.positions,
        )
          ? data.positions
          : [],
      [data],
    );

  const summary =
    data?.summary ?? {};

  return (
    <div className="app-shell">
      <Sidebar />

      <main className="main-content positions-page">
        {/* ===============================================
            HEADER
        ================================================ */}
        <header className="positions-header">
          <div>
            <div className="positions-kicker">
              <BriefcaseBusiness
                size={14}
              />

              <span>
                Model tracking
              </span>
            </div>

            <h1>
              Research Positions
            </h1>

            <p>
              Track model-selected positions and monitor how
              the original research thesis evolves over time.
            </p>
          </div>

          <button
            className="positions-refresh"
            type="button"
            onClick={
              loadPositions
            }
            disabled={
              loading
            }
          >
            <RefreshCw
              size={15}
              className={
                loading
                  ? "positions-spin"
                  : ""
              }
            />

            <span>
              Refresh
            </span>
          </button>
        </header>

        {/* ===============================================
            SUMMARY
        ================================================ */}
        <section className="positions-summary">
          <div className="positions-summary-card">
            <span className="positions-summary-icon">
              <Activity size={17} />
            </span>

            <div>
              <span>
                Tracked positions
              </span>

              <strong>
                {summary
                  ?.openPositionCount ??
                  0}
              </strong>
            </div>
          </div>

          <div className="positions-summary-card">
            <span className="positions-summary-icon">
              <CircleDollarSign
                size={17}
              />
            </span>

            <div>
              <span>
                Model value
              </span>

              <strong>
                {formatMoney(
                  summary
                    ?.totalMarketValue,
                )}
              </strong>
            </div>
          </div>

          <div className="positions-summary-card positive">
            <span className="positions-summary-icon">
              <ArrowUpRight
                size={17}
              />
            </span>

            <div>
              <span>
                Bullish
              </span>

              <strong>
                {summary
                  ?.longPositions ??
                  0}
              </strong>
            </div>
          </div>

          <div className="positions-summary-card negative">
            <span className="positions-summary-icon">
              <ArrowDownRight
                size={17}
              />
            </span>

            <div>
              <span>
                Bearish
              </span>

              <strong>
                {summary
                  ?.shortPositions ??
                  0}
              </strong>
            </div>
          </div>

          <div className="positions-summary-card performance">
            <span className="positions-summary-icon">
              <Target size={17} />
            </span>

            <div>
              <span>
                Model P&L
              </span>

              <strong>
                {formatMoney(
                  summary
                    ?.totalUnrealizedPnL,
                )}
              </strong>
            </div>
          </div>
        </section>

        {/* ===============================================
            ERROR
        ================================================ */}
        {error && (
          <div className="positions-error">
            <Info size={16} />

            <span>
              {error}
            </span>
          </div>
        )}

        {/* ===============================================
            LOADING / EMPTY / LIST
        ================================================ */}
        {loading &&
        !data ? (
          <div className="positions-loading">
            <RefreshCw
              size={22}
              className="positions-spin"
            />

            <strong>
              Loading research positions
            </strong>

            <span>
              Retrieving the latest model state...
            </span>
          </div>
        ) : positions.length ===
          0 ? (
          <div className="positions-empty-state">
            <div className="positions-empty-icon">
              <Activity
                size={24}
              />
            </div>

            <h2>
              No Research Positions
            </h2>

            <p>
              There are currently no active positions being
              tracked by the research model.
            </p>

            <span>
              Session:{" "}
              {data
                ?.session
                ?.status ??
                "Unavailable"}
            </span>
          </div>
        ) : (
          <div className="positions-list">
            {positions.map(
              (position) => (
                <PositionCard
                  key={
                    position.id ??
                    position.symbol
                  }
                  position={
                    position
                  }
                />
              ),
            )}
          </div>
        )}
      </main>
    </div>
  );
}