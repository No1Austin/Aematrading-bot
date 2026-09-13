// client/src/pages/Research.jsx

import {
  useMemo,
  useState,
} from "react";

import {
  AlertTriangle,
  ArrowUpRight,
  BadgeCheck,
  BarChart3,
  BookOpen,
  Building2,
  CheckCircle2,
  ExternalLink,
  FileSearch,
  Globe2,
  Landmark,
  LoaderCircle,
  Newspaper,
  Scale,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Users,
} from "lucide-react";

import Sidebar from
  "../components/Sidebar.jsx";

import {
  apiFetch,
} from "../services/api.js";

import "./Research.css";

/**
 * ============================================================
 * RESEARCH PAGE
 * ============================================================
 *
 * PURPOSE
 * -------
 *
 * Dedicated company due-diligence workspace.
 *
 * This page is intentionally separate from:
 *
 * - Markets / scanner watchlist
 * - deep-research trading queue
 * - positions
 * - dashboard engine summaries
 *
 * Backend source of truth:
 *
 * companyResearchCoordinator.js
 *
 * Expected response:
 *
 * {
 *   success,
 *   approved,
 *   service: "COMPANY_RESEARCH",
 *   status,
 *   symbol,
 *   company,
 *   summary,
 *   fundamentals,
 *   news,
 *   social,
 *   website,
 *   legal,
 *   webIntelligence,
 *   evidence,
 *   providers,
 *   warnings,
 *   errors,
 *   timestamp
 * }
 *
 * IMPORTANT
 * ---------
 *
 * This page is RESEARCH ONLY.
 * It does not place trades and does not interpret research as
 * execution permission.
 */

const RESEARCH_ENDPOINT =
  "/api/research/company";

/**
 * ============================================================
 * BASIC HELPERS
 * ============================================================
 */

function asArray(
  value,
) {
  return Array.isArray(
    value,
  )
    ? value
    : [];
}

function asObject(
  value,
) {
  return (
    value &&
    typeof value ===
      "object" &&
    !Array.isArray(
      value,
    )
  )
    ? value
    : {};
}

function safeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) {
    return value.map(item => safeText(item, "")).filter(Boolean).join(" · ") || fallback;
  }
  if (typeof value === "object") {
    return (
      safeText(value.publisher, "") ||
      safeText(value.name, "") ||
      safeText(value.sourceName, "") ||
      safeText(value.title, "") ||
      safeText(value.label, "") ||
      safeText(value.domain, "") ||
      safeText(value.url, "") ||
      fallback
    );
  }
  return fallback;
}

function safeUrl(value) {
  if (!value) return null;
  if (typeof value === "object") {
    return safeUrl(value.url ?? value.sourceUrl ?? value.link ?? value.href);
  }
  const candidate = String(value).trim();
  if (!candidate) return null;
  try {
    const parsed = new URL(candidate);
    return ["http:", "https:"].includes(parsed.protocol) ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function sourceDescriptor(value) {
  if (!value) return { label: "Unknown source", url: null };
  if (typeof value !== "object" || Array.isArray(value)) {
    return { label: safeText(value, "Unknown source"), url: safeUrl(value) };
  }
  return {
    label:
      safeText(value.publisher, "") ||
      safeText(value.sourceName, "") ||
      safeText(value.name, "") ||
      safeText(value.domain, "") ||
      "Unknown source",
    url: safeUrl(value),
  };
}

function numberOrNull(
  value,
) {
  const number =
    Number(
      value,
    );

  return Number.isFinite(
    number,
  )
    ? number
    : null;
}

function normalizeSymbol(
  value,
) {
  return String(
    value ??
    "",
  )
    .trim()
    .toUpperCase()
    .replace(
      /[^A-Z0-9.\-]/g,
      "",
    )
    .slice(
      0,
      20,
    );
}

function normalizeLabel(
  value,
  fallback = "UNKNOWN",
) {
  const normalized =
    String(
      value ??
      fallback,
    )
      .trim()
      .replaceAll(
        "_",
        " ",
      );

  return normalized ||
    fallback;
}

function formatPercentFromRatio(
  value,
) {
  const number =
    numberOrNull(
      value,
    );

  if (
    number ===
    null
  ) {
    return "—";
  }

  return `${(
    number *
    100
  ).toFixed(
    2,
  )}%`;
}

function formatMoney(
  value,
  currency =
    "USD",
) {
  const number =
    numberOrNull(
      value,
    );

  if (
    number ===
    null
  ) {
    return "—";
  }

  try {
    return new Intl.NumberFormat(
      "en-US",
      {
        style:
          "currency",

        currency:
          currency ||
          "USD",

        notation:
          Math.abs(
            number,
          ) >=
          1_000_000
            ? "compact"
            : "standard",

        maximumFractionDigits:
          2,
      },
    ).format(
      number,
    );
  } catch {
    return number.toLocaleString();
  }
}

function formatDate(
  value,
) {
  if (
    !value
  ) {
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
    return String(
      value,
    );
  }

  return date.toLocaleDateString(
    undefined,
    {
      year:
        "numeric",

      month:
        "short",

      day:
        "numeric",
    },
  );
}

function domainFromUrl(
  value,
) {
  if (
    !value
  ) {
    return null;
  }

  try {
    return new URL(
      value,
    )
      .hostname
      .replace(
        /^www\./,
        "",
      );
  } catch {
    return null;
  }
}

/**
 * ============================================================
 * RESPONSE NORMALIZATION
 * ============================================================
 */

function normalizeResearchResult(
  raw,
) {
  const root =
    asObject(
      raw,
    );

  const company =
    asObject(
      root.company,
    );

  const fundamentals =
    asObject(
      root.fundamentals,
    );

  const website =
    asObject(
      root.website,
    );

  const legal =
    asObject(
      root.legal,
    );

  const web =
    asObject(
      root.webIntelligence,
    );

  const social =
    asObject(
      root.social,
    );

  const summary =
    asObject(
      root.summary,
    );

  const providers =
    asObject(
      root.providers,
    );

  const news =
    asArray(
      root.news,
    );

  const evidence =
    asArray(
      root.evidence,
    );

  return {
    raw:
      root,

    success:
      root.success ===
        true ||
      root.approved ===
        true,

    approved:
      root.approved ===
      true,

    status:
      String(
        root.status ??
        "UNKNOWN",
      )
        .trim()
        .toUpperCase(),

    symbol:
      normalizeSymbol(
        root.symbol ??
        company.symbol,
      ),

    company: {
      symbol:
        normalizeSymbol(
          company.symbol ??
          root.symbol,
        ),

      name:
        company.name ??
        company.companyName ??
        null,

      sector:
        company.sector ??
        null,

      industry:
        company.industry ??
        null,

      country:
        company.countryCode ??
        company.country ??
        null,

      exchange:
        company.exchange ??
        null,

      currency:
        company.currency ??
        "USD",

      officialWebsite:
        company.officialWebsite ??
        website.officialWebsite ??
        website.website ??
        null,

      domain:
        company.domain ??
        website.domain ??
        domainFromUrl(
          company.officialWebsite ??
          website.officialWebsite ??
          website.website,
        ),

      logo:
        company.logo ??
        null,

      marketCapitalization:
        numberOrNull(
          company.marketCapitalization,
        ),

      ipoDate:
        company.ipoDate ??
        null,

      shareOutstanding:
        numberOrNull(
          company.shareOutstanding,
        ),
    },

    summary: {
      hasFundamentals:
        summary.hasFundamentals ===
        true,

      newsCount:
        numberOrNull(
          summary.newsCount,
        ) ??
        news.length,

      evidenceCount:
        numberOrNull(
          summary.evidenceCount,
        ) ??
        evidence.length,

      positiveMentions:
        numberOrNull(
          summary.positiveMentions,
        ) ??
        numberOrNull(
          web
            ?.summary
            ?.positiveMentions,
        ) ??
        0,

      negativeMentions:
        numberOrNull(
          summary.negativeMentions,
        ) ??
        numberOrNull(
          web
            ?.summary
            ?.negativeMentions,
        ) ??
        0,

      legalIssues:
        numberOrNull(
          summary.legalIssues,
        ) ??
        numberOrNull(
          legal
            ?.summary
            ?.lawsuits,
        ) ??
        0,

      regulatoryIssues:
        numberOrNull(
          summary.regulatoryIssues,
        ) ??
        numberOrNull(
          legal
            ?.summary
            ?.regulatoryActions,
        ) ??
        0,

      controversies:
        numberOrNull(
          summary.controversies,
        ) ??
        0,

      criticalIssues:
        numberOrNull(
          summary.criticalIssues,
        ) ??
        0,
    },

    fundamentals,

    website,

    legal,

    webIntelligence:
      web,

    social,

    news,

    evidence,

    providers,

    warnings:
      asArray(
        root.warnings,
      ),

    errors:
      asArray(
        root.errors,
      ),

    timestamp:
      root.timestamp ??
      root.fetchedAt ??
      null,
  };
}

/**
 * ============================================================
 * DATA EXTRACTION HELPERS
 * ============================================================
 */

function getWebResults(
  research,
) {
  const web =
    asObject(
      research
        ?.webIntelligence,
    );

  return asArray(
    web.results ??
    web.items ??
    web.data,
  );
}

function getLegalItems(
  research,
) {
  const legal =
    asObject(
      research
        ?.legal,
    );

  return asArray(
    legal.items ??
    legal.results ??
    legal.data,
  );
}

function getWebsitePages(
  research,
) {
  const website =
    asObject(
      research
        ?.website,
    );

  return asArray(
    website.pages ??
    website.results ??
    website.evidence ??
    website.items,
  );
}

function getProviderRows(
  research,
) {
  const providers =
    asObject(
      research
        ?.providers,
    );

  return Object.entries(
    providers,
  )
    .map(
      (
        [
          key,
          value,
        ],
      ) => {
        const provider =
          asObject(
            value,
          );

        return {
          key,

          name:
            normalizeLabel(
              key,
            ),

          approved:
            provider.approved ===
            true,

          status:
            String(
              provider.status ??
              "UNKNOWN",
            )
              .trim()
              .toUpperCase(),
        };
      },
    );
}

/**
 * ============================================================
 * PRESENTATION COMPONENTS
 * ============================================================
 */

function SectionHeader({
  icon: Icon,
  eyebrow,
  title,
  subtitle,
  action = null,
}) {
  return (
    <div className="research-section-header">
      <div>
        {eyebrow && (
          <span className="research-eyebrow">
            {eyebrow}
          </span>
        )}

        <div className="research-section-title-row">
          <span className="research-section-icon">
            <Icon
              size={16}
            />
          </span>

          <h2>
            {title}
          </h2>
        </div>

        {subtitle && (
          <p>
            {subtitle}
          </p>
        )}
      </div>

      {action}
    </div>
  );
}

function MetricCard({
  label,
  value,
  subtext = null,
}) {
  return (
    <div className="research-metric-card">
      <span>
        {label}
      </span>

      <strong>
        {value}
      </strong>

      {subtext && (
        <small>
          {subtext}
        </small>
      )}
    </div>
  );
}

function StatusPill({
  value,
}) {
  const normalized =
    String(
      value ??
      "UNKNOWN",
    )
      .trim()
      .toUpperCase();

  const tone =
    normalized.includes(
      "COMPLETE",
    ) ||
    normalized.includes(
      "PRIMARY",
    )
      ? "positive"
      : normalized.includes(
          "ERROR",
        ) ||
        normalized.includes(
          "FAILED",
        ) ||
        normalized.includes(
          "CRITICAL",
        )
        ? "negative"
        : normalized.includes(
            "PARTIAL",
          ) ||
          normalized.includes(
            "WARNING",
          )
          ? "warning"
          : "neutral";

  return (
    <span
      className={`research-status-pill ${tone}`}
    >
      {normalizeLabel(
        normalized,
      )}
    </span>
  );
}

function EmptyState({
  icon: Icon =
    FileSearch,
  title,
  text,
}) {
  return (
    <div className="research-empty">
      <span className="research-empty-icon">
        <Icon
          size={22}
        />
      </span>

      <strong>
        {title}
      </strong>

      <p>
        {text}
      </p>
    </div>
  );
}

function SourceLink({
  url,
  children =
    "Open source",
}) {
  if (
    !url
  ) {
    return null;
  }

  return (
    <a
      className="research-source-link"
      href={
        url
      }
      target="_blank"
      rel="noreferrer"
      title={domainFromUrl(url) ?? "Open source"}
    >
      {children}

      <ExternalLink
        size={11}
      />
    </a>
  );
}

/**
 * ============================================================
 * COMPANY HERO
 * ============================================================
 */

function CompanyHero({
  research,
}) {
  const company =
    research.company;

  return (
    <section className={`research-company-hero research-company-hero--${String(research.status ?? "unknown").toLowerCase()}`}>
      <div className="research-company-main">
        <div className="research-company-logo">
          {company.logo ? (
            <img
              src={
                company.logo
              }
              alt={`${company.name ?? company.symbol ?? research.symbol} logo`}
            />
          ) : (
            <Building2
              size={24}
            />
          )}
        </div>

        <div>
          <div className="research-company-symbol-row">
            <h1>
              {company.name ??
                company.symbol ??
                research.symbol}
            </h1>

            <StatusPill
              value={
                research.status
              }
            />
          </div>

          <p className="research-company-meta">
            {[
              company.symbol,
              company.exchange,
              company.industry,
              company.country,
            ]
              .filter(
                Boolean,
              )
              .join(
                " · ",
              )}
          </p>

          {company.officialWebsite && (
            <SourceLink
              url={
                company.officialWebsite
              }
            >
              {company.domain ??
                "Official website"}
            </SourceLink>
          )}
        </div>
      </div>

      <div className="research-company-stats">
        <MetricCard
          label="Market cap"
          value={
            formatMoney(
              company.marketCapitalization,
              company.currency,
            )
          }
        />

        <MetricCard
          label="IPO"
          value={
            formatDate(
              company.ipoDate,
            )
          }
        />

        <MetricCard
          label="Evidence"
          value={
            research
              .summary
              .evidenceCount
          }
        />

        <MetricCard
          label="News"
          value={
            research
              .summary
              .newsCount
          }
        />
      </div>
    </section>
  );
}

/**
 * ============================================================
 * FUNDAMENTALS
 * ============================================================
 */

function FundamentalsSection({
  research,
}) {
  const fundamentals =
    research.fundamentals;

  const revenue =
    asObject(
      fundamentals.revenue,
    );

  const earnings =
    asObject(
      fundamentals.earnings,
    );

  const freeCashFlow =
    asObject(
      fundamentals.freeCashFlow,
    );

  const margins =
    asObject(
      fundamentals.margins,
    );

  const debt =
    asObject(
      fundamentals.debt,
    );

  return (
    <section className="research-card">
      <SectionHeader
        icon={BarChart3}
        eyebrow="Financial evidence"
        title="Fundamentals"
        subtitle="Company financial performance from available fundamental providers."
      />

      <div className="research-metrics-grid">
        <MetricCard
          label="Revenue growth"
          value={
            formatPercentFromRatio(
              revenue.growth,
            )
          }
          subtext={
            revenue.periodEnd
              ? `Period ${formatDate(
                  revenue.periodEnd,
                )}`
              : null
          }
        />

        <MetricCard
          label="EPS growth"
          value={
            formatPercentFromRatio(
              earnings.epsGrowth,
            )
          }
        />

        <MetricCard
          label="Free cash flow"
          value={
            formatMoney(
              freeCashFlow.value,
              research
                .company
                .currency,
            )
          }
        />

        <MetricCard
          label="Operating margin"
          value={
            formatPercentFromRatio(
              margins.operatingMargin,
            )
          }
        />

        <MetricCard
          label="Net margin"
          value={
            formatPercentFromRatio(
              margins.netMargin,
            )
          }
        />

        <MetricCard
          label="Debt / equity"
          value={
            numberOrNull(
              debt.debtToEquity,
            ) ===
            null
              ? "—"
              : numberOrNull(
                  debt.debtToEquity,
                ).toFixed(
                  3,
                )
          }
        />
      </div>
    </section>
  );
}

/**
 * ============================================================
 * INTELLIGENCE OVERVIEW
 * ============================================================
 */

function IntelligenceSummary({
  research,
}) {
  const summary =
    research.summary;

  return (
    <section className="research-card">
      <SectionHeader
        icon={Sparkles}
        eyebrow="Research pulse"
        title="Intelligence Summary"
        subtitle="A compact view of the evidence discovered across research providers."
      />

      <div className="research-summary-grid">
        <MetricCard
          label="Positive mentions"
          value={
            summary.positiveMentions
          }
        />

        <MetricCard
          label="Negative mentions"
          value={
            summary.negativeMentions
          }
        />

        <MetricCard
          label="Legal issues"
          value={
            summary.legalIssues
          }
        />

        <MetricCard
          label="Regulatory issues"
          value={
            summary.regulatoryIssues
          }
        />

        <MetricCard
          label="Controversies"
          value={
            summary.controversies
          }
        />

        <MetricCard
          label="Critical issues"
          value={
            summary.criticalIssues
          }
        />
      </div>
    </section>
  );
}

/**
 * ============================================================
 * LATEST DEVELOPMENTS / WEB INTELLIGENCE
 * ============================================================
 */

function WebIntelligenceSection({
  research,
}) {
  const results =
    getWebResults(
      research,
    );

  const [
    filter,
    setFilter,
  ] =
    useState(
      "ALL",
    );

  const categories =
    useMemo(
      () => {
        const unique =
          [
            ...new Set(
              results
                .map(
                  item =>
                    String(
                      item
                        ?.type ??
                      "OTHER",
                    )
                      .trim()
                      .toUpperCase(),
                ),
            ),
          ];

        return [
          "ALL",
          ...unique,
        ]
          .slice(
            0,
            10,
          );
      },
      [
        results,
      ],
    );

  const filtered =
    useMemo(
      () =>
        filter ===
        "ALL"
          ? results
          : results.filter(
              item =>
                String(
                  item
                    ?.type ??
                  "OTHER",
                )
                  .trim()
                  .toUpperCase() ===
                filter,
            ),
      [
        results,
        filter,
      ],
    );

  return (
    <section className="research-card">
      <SectionHeader
        icon={Globe2}
        eyebrow="Public web"
        title="Latest Developments & Web Intelligence"
        subtitle="Company-specific developments, positive and negative coverage, allegations, products, executives and other material mentions."
        action={
          <span className="research-count">
            {results.length}
          </span>
        }
      />

      {categories.length >
        1 && (
        <div className="research-filter-row">
          {categories.map(
            item => (
              <button
                type="button"
                key={
                  item
                }
                className={
                  filter ===
                  item
                    ? "active"
                    : ""
                }
                onClick={() =>
                  setFilter(
                    item,
                  )
                }
              >
                {normalizeLabel(
                  item,
                )}
              </button>
            ),
          )}
        </div>
      )}

      {filtered.length ===
      0 ? (
        <EmptyState
          icon={Globe2}
          title="No web intelligence available"
          text="No current public-web research items were returned for this company."
        />
      ) : (
        <div className="research-feed">
          {filtered.map(
            (
              item,
              index,
            ) => {
              const sentiment =
                String(
                  item
                    ?.sentiment ??
                  "NEUTRAL",
                )
                  .trim()
                  .toUpperCase();

              return (
                <article
                  className="research-feed-item"
                  key={
                    item.id ??
                    item.url ??
                    `${item.title}-${index}`
                  }
                >
                  <div className="research-feed-top">
                    <div className="research-feed-tags">
                      <StatusPill
                        value={
                          item.type
                        }
                      />

                      <StatusPill
                        value={
                          item
                            .verificationStatus ??
                          item.authority
                        }
                      />

                      <span
                        className={`research-sentiment ${sentiment.toLowerCase()}`}
                      >
                        {sentiment ===
                        "POSITIVE" ? (
                          <TrendingUp
                            size={12}
                          />
                        ) : sentiment ===
                          "NEGATIVE" ? (
                          <TrendingDown
                            size={12}
                          />
                        ) : (
                          <BookOpen
                            size={12}
                          />
                        )}

                        {sentiment}
                      </span>
                    </div>

                    {numberOrNull(
                      item.confidence,
                    ) !==
                      null && (
                      <span className="research-confidence">
                        {(
                          numberOrNull(
                            item.confidence,
                          ) *
                          100
                        ).toFixed(
                          0,
                        )}
                        % confidence
                      </span>
                    )}
                  </div>

                  <h3>
                    {item.title ??
                      "Untitled research finding"}
                  </h3>

                  {item.summary && (
                    <p>
                      {item.summary}
                    </p>
                  )}

                  <div className="research-feed-footer">
                    <span>
                      {sourceDescriptor(item.sourceName ?? item.source).label}
                    </span>

                    <SourceLink
                      url={
                        item.url ??
                        item.sourceUrl
                      }
                    >
                      Read source
                    </SourceLink>
                  </div>
                </article>
              );
            },
          )}
        </div>
      )}
    </section>
  );
}

/**
 * ============================================================
 * LEGAL / REGULATORY
 * ============================================================
 */

function LegalSection({
  research,
}) {
  const legal =
    research.legal;

  const summary =
    asObject(
      legal.summary,
    );

  const items =
    getLegalItems(
      research,
    );

  return (
    <section className="research-card">
      <SectionHeader
        icon={Scale}
        eyebrow="Legal due diligence"
        title="Legal & Regulatory Intelligence"
        subtitle="Lawsuits, investigations, allegations, regulatory actions and verified findings."
        action={
          <StatusPill
            value={
              summary.overallRisk ??
              legal.status ??
              "UNKNOWN"
            }
          />
        }
      />

      <div className="research-legal-summary">
        <MetricCard
          label="Lawsuits"
          value={
            numberOrNull(
              summary.lawsuits,
            ) ??
            0
          }
        />

        <MetricCard
          label="Investigations"
          value={
            numberOrNull(
              summary.investigations,
            ) ??
            0
          }
        />

        <MetricCard
          label="Regulatory actions"
          value={
            numberOrNull(
              summary.regulatoryActions,
            ) ??
            0
          }
        />

        <MetricCard
          label="Confirmed findings"
          value={
            numberOrNull(
              summary.confirmedFindings,
            ) ??
            0
          }
        />
      </div>

      {items.length ===
      0 ? (
        <EmptyState
          icon={ShieldCheck}
          title="No verified legal items returned"
          text="The legal intelligence provider did not return company-specific legal or regulatory items in this research run."
        />
      ) : (
        <div className="research-legal-list">
          {items.map(
            (
              item,
              index,
            ) => (
              <article
                className="research-legal-item"
                key={
                  item.id ??
                  item.sourceUrl ??
                  `${item.title}-${index}`
                }
              >
                <div className="research-legal-item-head">
                  <div>
                    <StatusPill
                      value={
                        item.category ??
                        "LEGAL"
                      }
                    />

                    <StatusPill
                      value={
                        item.state ??
                        item.status ??
                        "UNKNOWN"
                      }
                    />
                  </div>

                  <StatusPill
                    value={
                      item.severity ??
                      "UNKNOWN"
                    }
                  />
                </div>

                <h3>
                  {item.title ??
                    "Legal research item"}
                </h3>

                {item.summary && (
                  <p>
                    {item.summary}
                  </p>
                )}

                <div className="research-feed-footer">
                  <span>
                    {sourceDescriptor(item.sourceName ?? item.source).label}
                  </span>

                  <SourceLink
                    url={
                      item.sourceUrl ??
                      item.url
                    }
                  >
                    View source
                  </SourceLink>
                </div>
              </article>
            ),
          )}
        </div>
      )}
    </section>
  );
}

/**
 * ============================================================
 * NEWS
 * ============================================================
 */

function NewsSection({
  research,
}) {
  const news =
    research.news;

  return (
    <section className="research-card">
      <SectionHeader
        icon={Newspaper}
        eyebrow="Recent coverage"
        title="Company News"
        subtitle="Recent company-specific news returned by the research coordinator."
        action={
          <span className="research-count">
            {news.length}
          </span>
        }
      />

      {news.length ===
      0 ? (
        <EmptyState
          icon={Newspaper}
          title="No recent company news"
          text="No approved company-specific news items were returned in this research run."
        />
      ) : (
        <div className="research-news-grid">
          {news.map(
            (
              item,
              index,
            ) => (
              <article
                className="research-news-card"
                key={
                  item.id ??
                  item.url ??
                  `${item.headline}-${index}`
                }
              >
                <div className="research-news-meta">
                  <span>
                    {sourceDescriptor(item.source ?? item.sourceName).label}
                  </span>

                  <span>
                    {formatDate(
                      item.createdAt ??
                      item.datetime ??
                      item.publishedAt,
                    )}
                  </span>
                </div>

                <h3>
                  {item.headline ??
                    item.title ??
                    "Company news"}
                </h3>

                {(
                  item.summary ??
                  item.description
                ) && (
                  <p>
                    {item.summary ??
                      item.description}
                  </p>
                )}

                <SourceLink
                  url={
                    item.url
                  }
                >
                  Read article
                </SourceLink>
              </article>
            ),
          )}
        </div>
      )}
    </section>
  );
}

/**
 * ============================================================
 * COMPANY WEBSITE
 * ============================================================
 */

function WebsiteSection({
  research,
}) {
  const website =
    research.website;

  const pages =
    getWebsitePages(
      research,
    );

  return (
    <section className="research-card">
      <SectionHeader
        icon={Building2}
        eyebrow="Primary source"
        title="Official Company Website"
        subtitle="Research gathered from the verified company domain and available official pages."
        action={
          <SourceLink
            url={
              website.officialWebsite ??
              research
                .company
                .officialWebsite
            }
          >
            Visit company
          </SourceLink>
        }
      />

      <div className="research-website-summary">
        <MetricCard
          label="Verified domain"
          value={
            website.domain ??
            research
              .company
              .domain ??
            "—"
          }
        />

        <MetricCard
          label="Pages researched"
          value={
            numberOrNull(
              website.pageCount,
            ) ??
            pages.length
          }
        />

        <MetricCard
          label="Company"
          value={
            website.companyName ??
            research
              .company
              .name ??
            "—"
          }
        />
      </div>

      {pages.length >
        0 && (
        <div className="research-website-pages">
          {pages
            .slice(
              0,
              12,
            )
            .map(
              (
                page,
                index,
              ) => (
                <article
                  key={
                    page.url ??
                    `${page.title}-${index}`
                  }
                >
                  <Globe2
                    size={14}
                  />

                  <div>
                    <strong>
                      {page.title ??
                        page.url ??
                        "Official page"}
                    </strong>

                    {page.summary && (
                      <p>
                        {page.summary}
                      </p>
                    )}

                    <SourceLink
                      url={
                        page.url
                      }
                    >
                      Open page
                    </SourceLink>
                  </div>
                </article>
              ),
            )}
        </div>
      )}
    </section>
  );
}

/**
 * ============================================================
 * PROVIDERS / EVIDENCE
 * ============================================================
 */

function EvidenceSection({
  research,
}) {
  const providerRows =
    getProviderRows(
      research,
    );

  const evidence =
    research.evidence;

  return (
    <section className="research-card">
      <SectionHeader
        icon={BadgeCheck}
        eyebrow="Traceability"
        title="Sources & Evidence"
        subtitle="Provider health and evidence retained by the research coordinator."
      />

      {providerRows.length >
        0 && (
        <div className="research-provider-grid">
          {providerRows.map(
            provider => (
              <div
                className="research-provider-row"
                key={
                  provider.key
                }
              >
                <div>
                  {provider.approved ? (
                    <CheckCircle2
                      size={14}
                    />
                  ) : (
                    <AlertTriangle
                      size={14}
                    />
                  )}

                  <span>
                    {provider.name}
                  </span>
                </div>

                <StatusPill
                  value={
                    provider.status
                  }
                />
              </div>
            ),
          )}
        </div>
      )}

      <div className="research-evidence-count">
        <FileSearch
          size={16}
        />

        <strong>
          {evidence.length}
        </strong>

        <span>
          evidence records retained
        </span>
      </div>
    </section>
  );
}

/**
 * ============================================================
 * WARNINGS
 * ============================================================
 */

function LimitationsSection({
  research,
}) {
  if (
    research.warnings.length ===
      0 &&
    research.errors.length ===
      0
  ) {
    return null;
  }

  return (
    <section className="research-card research-limitations-card">
      <SectionHeader
        icon={ShieldAlert}
        eyebrow="Research limitations"
        title="Warnings & Provider Limitations"
        subtitle="Missing sources and provider failures are shown explicitly rather than hidden."
      />

      {research.warnings.map(
        (
          warning,
          index,
        ) => (
          <div
            className="research-warning-row"
            key={`warning-${index}`}
          >
            <AlertTriangle
              size={14}
            />

            <span>
              {safeText(warning, "Research provider returned a warning.")}
            </span>
          </div>
        ),
      )}

      {research.errors.map(
        (
          error,
          index,
        ) => (
          <div
            className="research-warning-row error"
            key={`error-${index}`}
          >
            <ShieldAlert
              size={14}
            />

            <span>
              {safeText(error, "Research provider returned an error.")}
            </span>
          </div>
        ),
      )}
    </section>
  );
}

/**
 * ============================================================
 * MAIN PAGE
 * ============================================================
 */

export default function Research() {
  const [
    symbol,
    setSymbol,
  ] =
    useState(
      "",
    );

  const [
    research,
    setResearch,
  ] =
    useState(
      null,
    );

  const [
    loading,
    setLoading,
  ] =
    useState(
      false,
    );

  const [
    error,
    setError,
  ] =
    useState(
      null,
    );

  const normalizedSymbol =
    normalizeSymbol(
      symbol,
    );

  async function runResearch(
    event,
  ) {
    event
      ?.preventDefault?.();

    if (
      !normalizedSymbol
    ) {
      setError(
        "Enter a stock symbol to begin company research.",
      );

      return;
    }

    setLoading(
      true,
    );

    setError(
      null,
    );

    try {
      /**
       * Dedicated research endpoint.
       *
       * This should be backed by:
       * server/src/research/companyResearchCoordinator.js
       *
       * The backend route can accept this POST body:
       *
       * {
       *   symbol: "AAPL"
       * }
       */
      const result =
        await apiFetch(
          RESEARCH_ENDPOINT,
          {
            method:
              "POST",

            body: {
              symbol:
                normalizedSymbol,
            },

            timeoutMs:
              90_000,
          },
        );

      const normalized =
        normalizeResearchResult(
          result,
        );

      if (
        !normalized.symbol
      ) {
        throw new Error(
          "Research completed but returned no company symbol.",
        );
      }

      setResearch(
        normalized,
      );
    } catch (
      requestError
    ) {
      setError(
        requestError
          ?.message ??
        "Unable to complete company research.",
      );
    } finally {
      setLoading(
        false,
      );
    }
  }

  return (
    <div className="app-shell">
      <Sidebar />

      <main className="main-content research-page" aria-busy={loading}>
        <header className="research-header">
          <div>
            <div className="research-kicker">
              <Sparkles
                size={13}
              />

              <span>
                Company due diligence
              </span>
            </div>

            <h1>
              Research
            </h1>

            <p>
              Investigate a public company across fundamentals, official sources,
              recent developments, legal and regulatory matters, web intelligence,
              controversies, allegations and supporting evidence.
            </p>
          </div>
        </header>

        <section className="research-search-card">
          <form
            className="research-search-form"
            onSubmit={
              runResearch
            }
          >
            <div className="research-search-input">
              <Search
                size={18}
              />

              <input
                value={
                  symbol
                }
                onChange={
                  event =>
                    setSymbol(
                      normalizeSymbol(
                        event
                          .target
                          .value,
                      ),
                    )
                }
                placeholder="Enter a stock symbol — e.g. AAPL, TSLA, NVDA"
                aria-label="Stock symbol"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck="false"
                maxLength={20}
              />
            </div>

            <button
              type="submit"
              className="research-run-button"
              disabled={
                loading ||
                !normalizedSymbol
              }
            >
              {loading ? (
                <>
                  <LoaderCircle
                    size={16}
                    className="research-spin"
                  />

                  Researching…
                </>
              ) : (
                <>
                  <FileSearch
                    size={16}
                  />

                  Research company
                </>
              )}
            </button>
          </form>

          <div className="research-search-note">
            <ShieldCheck
              size={13}
            />

            <span>
              Research only — findings are evidence and context, not investment advice or trade execution.
            </span>
          </div>
        </section>

        {error && (
          <div className="research-error" role="alert">
            <AlertTriangle
              size={16}
            />

            <span>
              {safeText(error, "Research provider returned an error.")}
            </span>
          </div>
        )}

        {loading && (
          <section className="research-loading-card" aria-live="polite">
            <LoaderCircle
              size={26}
              className="research-spin"
            />

            <div>
              <strong>
                Building research dossier for {normalizedSymbol}
              </strong>

              <p>
                Checking company identity, fundamentals, official website,
                news, legal and regulatory intelligence, public-web evidence,
                sentiment and source quality.
              </p>
            </div>
          </section>
        )}

        {!loading &&
          !research &&
          !error && (
          <section className="research-welcome">
            <div className="research-welcome-icon">
              <FileSearch
                size={30}
              />
            </div>

            <h2>
              Start with a company symbol
            </h2>

            <p>
              The research engine will build a structured company dossier instead
              of reusing dashboard or scanner data.
            </p>

            <div className="research-welcome-grid">
              <div>
                <BarChart3
                  size={18}
                />

                <strong>
                  Fundamentals
                </strong>

                <span>
                  Revenue, earnings, cash flow, margins and debt.
                </span>
              </div>

              <div>
                <Globe2
                  size={18}
                />

                <strong>
                  Public intelligence
                </strong>

                <span>
                  Latest developments, positive and negative mentions.
                </span>
              </div>

              <div>
                <Scale
                  size={18}
                />

                <strong>
                  Legal & regulatory
                </strong>

                <span>
                  Lawsuits, investigations, allegations and official actions.
                </span>
              </div>

              <div>
                <Building2
                  size={18}
                />

                <strong>
                  Official sources
                </strong>

                <span>
                  Verified company website, newsroom and available investor information.
                </span>
              </div>
            </div>
          </section>
        )}

        {!loading &&
          research && (
          <div className={`research-results research-results--${String(research.status ?? "unknown").toLowerCase()}`}>
            <CompanyHero
              research={
                research
              }
            />

            <IntelligenceSummary
              research={
                research
              }
            />

            <div className="research-two-column">
              <FundamentalsSection
                research={
                  research
                }
              />

              <WebsiteSection
                research={
                  research
                }
              />
            </div>

            <WebIntelligenceSection
              research={
                research
              }
            />

            <LegalSection
              research={
                research
              }
            />

            <NewsSection
              research={
                research
              }
            />

            <EvidenceSection
              research={
                research
              }
            />

            <LimitationsSection
              research={
                research
              }
            />

            <div className="research-footer-note">
              <ShieldCheck
                size={14}
              />

              <span>
                Research generated from available evidence. Allegations and search-result leads should not be treated as confirmed findings unless corroborated by authoritative sources.
              </span>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
