// client/src/components/EngineBreakdown.jsx

import { useMemo, useState } from "react";
import {
  Activity,
  BarChart3,
  Building2,
  CalendarDays,
  ChevronRight,
  Database,
  Flag,
  Globe2,
  Landmark,
  MessageSquareText,
  Scale,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";

/**
 * ============================================================
 * ENGINE BREAKDOWN
 * ============================================================
 *
 * Directional score:
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
 * Liquidity, Risk/Reward and Consensus are intentionally shown
 * as supporting/gating intelligence rather than directional
 * point allocations.
 */

const ENGINE_DEFINITIONS = [
  {
    key: "technical",
    label: "Technical",
    maximum: 30,
    directional: true,
    Icon: BarChart3,
  },
  {
    key: "fundamental",
    label: "Fundamental",
    maximum: 30,
    directional: true,
    Icon: Building2,
  },
  {
    key: "macro",
    label: "Macro",
    maximum: 10,
    directional: true,
    Icon: Globe2,
  },
  {
    key: "events",
    label: "Events",
    maximum: 10,
    directional: true,
    Icon: CalendarDays,
  },
  {
    key: "institutional",
    label: "Institutional",
    maximum: 7.5,
    directional: true,
    Icon: Landmark,
  },
  {
    key: "historical",
    label: "Historical",
    maximum: 5,
    directional: true,
    Icon: Database,
  },
  {
    key: "social",
    label: "Social",
    maximum: 5,
    directional: true,
    Icon: MessageSquareText,
  },
  {
    key: "country",
    label: "Country / Sector",
    maximum: 2.5,
    directional: true,
    Icon: Flag,
  },
  {
    key: "liquidity",
    label: "Liquidity",
    maximum: null,
    directional: false,
    role: "Execution gate",
    Icon: Activity,
  },
  {
    key: "riskReward",
    label: "Risk / Reward",
    maximum: null,
    directional: false,
    role: "Execution gate",
    Icon: Scale,
  },
  {
    key: "consensus",
    label: "Consensus",
    maximum: null,
    directional: false,
    role: "Confirmation",
    Icon: Users,
  },
];

function finite(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function clamp(value, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value));
}

function formatPercent(value) {
  const number = finite(value);
  if (number === null) return "N/A";

  return `${number.toFixed(
    Number.isInteger(number) ? 0 : 2,
  )}%`;
}

function formatPoints(value) {
  const number = finite(value);
  if (number === null) return "—";

  return number.toFixed(
    Number.isInteger(number) ? 0 : 2,
  );
}

function statusLabel(meta) {
  const status =
    meta?.status ??
    (meta?.available === true ? "AVAILABLE" : "UNAVAILABLE");

  return String(status)
    .replaceAll("_", " ")
    .trim();
}

function statusClass(meta) {
  if (meta?.available !== true) return "insufficient";

  const status = String(meta?.status ?? "").toUpperCase();

  if (
    status.includes("ERROR") ||
    status.includes("BLOCK") ||
    status.includes("FREEZE")
  ) {
    return "blocked";
  }

  if (
    status.includes("INSUFFICIENT") ||
    status.includes("UNAVAILABLE")
  ) {
    return "insufficient";
  }

  return "complete";
}

function getFundamentalPillars(fundamentals) {
  if (!fundamentals || typeof fundamentals !== "object") return [];

  const candidates = [
    ["Valuation", fundamentals?.valuation],
    ["Profitability", fundamentals?.profitability],
    ["Growth", fundamentals?.growth],
    ["Balance sheet", fundamentals?.balanceSheet],
    ["Cash flow", fundamentals?.cashFlow],
    ["Capital allocation", fundamentals?.capitalAllocation],
    ["Forward outlook", fundamentals?.forwardData ?? fundamentals?.forward],
    ["Quality", fundamentals?.quality],
    ["Coverage", fundamentals?.coverage ?? fundamentals?.coveragePercent],
    ["Sector", fundamentals?.sector],
    ["Industry", fundamentals?.industry],
  ];

  return candidates
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .slice(0, 10);
}

function displayDetail(value) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "YES" : "NO";

  if (typeof value === "number") {
    return Number.isInteger(value)
      ? String(value)
      : value.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
  }

  if (typeof value === "string") return value;

  if (Array.isArray(value)) {
    return value.length
      ? `${value.length} item${value.length === 1 ? "" : "s"}`
      : "None";
  }

  if (typeof value === "object") {
    const preferred =
      value?.status ??
      value?.direction ??
      value?.signal ??
      value?.score ??
      value?.value ??
      value?.percent ??
      value?.percentage ??
      value?.summary ??
      value?.label;

    if (preferred !== undefined && preferred !== null) {
      return displayDetail(preferred);
    }

    return "Available";
  }

  return String(value);
}

function FundamentalModal({
  fundamentals,
  economicExposure,
  companyProvider,
  onClose,
}) {
  const pillars = getFundamentalPillars(fundamentals);

  return (
    <div
      className="engine-detail-overlay"
      role="presentation"
      onMouseDown={onClose}
    >
      <section
        className="engine-detail-modal fundamental-detail-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Fundamental analysis details"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="engine-detail-header">
          <div>
            <p className="eyebrow">30-point research pillar</p>
            <h2>Fundamental Analysis</h2>
          </div>

          <button
            className="engine-detail-close"
            type="button"
            onClick={onClose}
            aria-label="Close fundamental analysis"
          >
            <X size={18} />
          </button>
        </div>

        <div className="fundamental-detail-summary">
          <div>
            <span>Directional allocation</span>
            <strong>30 / 100 pts</strong>
          </div>

          <div>
            <span>Provider</span>
            <strong>
              {companyProvider?.status ??
                companyProvider?.provider ??
                (companyProvider ? "AVAILABLE" : "—")}
            </strong>
          </div>
        </div>

        <div className="fundamental-pillar-grid">
          {pillars.length ? (
            pillars.map(([label, value]) => (
              <div
                className="fundamental-pillar-card"
                key={label}
              >
                <span>{label}</span>
                <strong>{displayDetail(value)}</strong>
              </div>
            ))
          ) : (
            <div className="institutional-note">
              <p>
                No detailed fundamental pillar payload was returned in the
                latest analysis.
              </p>
            </div>
          )}
        </div>

        {economicExposure && (
          <div className="fundamental-economic-context">
            <h3>Economic exposure</h3>
            <p>{displayDetail(economicExposure)}</p>
          </div>
        )}

        <p className="action-note">
          Fundamental points are taken from the backend COMPANY scorecard
          component. The frontend does not manufacture missing evidence.
        </p>
      </section>
    </div>
  );
}

export default function EngineBreakdown({
  engines = {},
  meta = {},
  preferredSide = null,
  fundamentals = null,
  economicExposure = null,
  companyProvider = null,
  backendScore = null,
}) {
  const [showFundamentals, setShowFundamentals] = useState(false);

  const rows = useMemo(
    () =>
      ENGINE_DEFINITIONS.map((definition) => {
        const metadata = meta?.[definition.key] ?? {};
        const percent = finite(engines?.[definition.key]);

        const maximum =
          finite(metadata?.maximum) ??
          definition.maximum;

        const points =
          finite(metadata?.points) ??
          (
            definition.directional &&
            percent !== null &&
            maximum !== null
              ? (clamp(percent) / 100) * maximum
              : null
          );

        return {
          ...definition,
          metadata,
          percent,
          maximum,
          points,
        };
      }),
    [engines, meta],
  );

  const directionalRows = rows.filter((row) => row.directional);
  const supportingRows = rows.filter((row) => !row.directional);

  // Backend scorecard points are authoritative even when evidence is
  // unavailable. The backend intentionally applies a neutral 50% fallback
  // while preserving available:false for provenance/coverage. Never filter
  // score contributions by availability here.
  const awardedPoints = directionalRows.reduce(
    (total, row) => total + (finite(row.points) ?? 0),
    0,
  );

  const authoritativeTotal =
    finite(backendScore) ?? awardedPoints;

  const scoreMismatch =
    finite(backendScore) !== null &&
    Math.abs(authoritativeTotal - awardedPoints) > 0.011;

  return (
    <>
      <section className="panel engine-breakdown">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">
              Backend scoring authority
            </p>

            <h2>Engine Breakdown</h2>
          </div>

          <div className="engine-breakdown-total">
            <span>{preferredSide ?? "—"}</span>
            <strong>{formatPoints(authoritativeTotal)} / 100</strong>
          </div>
        </div>

        <div className="engine-breakdown-architecture">
          <span>Technical 30</span>
          <span>Fundamental 30</span>
          <span>Macro 10</span>
          <span>Events 10</span>
          <span>Institutional 7.5</span>
          <span>Historical 5</span>
          <span>Social 5</span>
          <span>Country 2.5</span>
        </div>

        <div className="engine-breakdown-list">
          {directionalRows.map((row) => {
            const Icon = row.Icon;
            const available = row.metadata?.available === true;

            return (
              <article
                className={`engine-breakdown-row ${
                  !available ? "is-unavailable" : ""
                }`}
                key={row.key}
              >
                <div className="engine-breakdown-row-main">
                  <div className="engine-breakdown-icon">
                    <Icon size={17} />
                  </div>

                  <div className="engine-breakdown-copy">
                    <div className="engine-breakdown-title-row">
                      <strong>{row.label}</strong>

                      <span
                        className={`engine-status ${statusClass(
                          row.metadata,
                        )}`}
                      >
                        {statusLabel(row.metadata)}
                      </span>
                    </div>

                    <div className="engine-breakdown-support-row">
                      <span>
                        {available
                          ? "Directional support"
                          : "Directional evidence"}
                      </span>

                      <strong>
                        {row.percent !== null
                          ? formatPercent(row.percent)
                          : "N/A"}
                      </strong>
                    </div>

                    <div className="engine-breakdown-progress">
                      <span
                        style={{
                          width: `${
                            row.percent !== null
                              ? clamp(row.percent)
                              : 0
                          }%`,
                        }}
                      />
                    </div>
                  </div>
                </div>

                <div className="engine-breakdown-points">
                  <strong>
                    {finite(row.points) !== null
                      ? formatPoints(row.points)
                      : "—"}
                  </strong>

                  <span>
                    / {formatPoints(row.maximum)} pts
                  </span>
                </div>

                {row.key === "fundamental" && (
                  <button
                    className="engine-breakdown-detail-button"
                    type="button"
                    onClick={() => setShowFundamentals(true)}
                  >
                    View fundamental pillars
                    <ChevronRight size={15} />
                  </button>
                )}
              </article>
            );
          })}
        </div>

        <div className="engine-breakdown-supporting-heading">
          <div>
            <ShieldCheck size={16} />
            <strong>Supporting / gating intelligence</strong>
          </div>

          <span>Not included in the 100 directional points</span>
        </div>

        <div className="engine-breakdown-list engine-breakdown-list--supporting">
          {supportingRows.map((row) => {
            const Icon = row.Icon;
            const available = row.metadata?.available === true;

            return (
              <article
                className={`engine-breakdown-row engine-breakdown-row--supporting ${
                  !available ? "is-unavailable" : ""
                }`}
                key={row.key}
              >
                <div className="engine-breakdown-row-main">
                  <div className="engine-breakdown-icon">
                    <Icon size={17} />
                  </div>

                  <div className="engine-breakdown-copy">
                    <div className="engine-breakdown-title-row">
                      <strong>{row.label}</strong>

                      <span
                        className={`engine-status ${statusClass(
                          row.metadata,
                        )}`}
                      >
                        {statusLabel(row.metadata)}
                      </span>
                    </div>

                    <div className="engine-breakdown-support-row">
                      <span>{row.role}</span>

                      <strong>
                        {row.percent !== null
                          ? formatPercent(row.percent)
                          : "N/A"}
                      </strong>
                    </div>
                  </div>
                </div>

                <div className="engine-breakdown-points">
                  <strong>Gate</strong>
                  <span>No directional points</span>
                </div>
              </article>
            );
          })}
        </div>

        <p className="action-note">
          Missing evidence remains explicitly unavailable for coverage, but a
          backend-supplied neutral fallback contribution is still displayed and
          counted. Points are never redistributed and supporting gates do not
          inflate the 100-point research score.
        </p>

        {scoreMismatch && (
          <p className="action-note engine-score-warning">
            Score diagnostic: backend total {formatPoints(authoritativeTotal)}
            /100 differs from visible scorecard sum {formatPoints(awardedPoints)}
            /100. The backend total remains authoritative.
          </p>
        )}
      </section>

      {showFundamentals && (
        <FundamentalModal
          fundamentals={fundamentals}
          economicExposure={economicExposure}
          companyProvider={companyProvider}
          onClose={() => setShowFundamentals(false)}
        />
      )}
    </>
  );
}
