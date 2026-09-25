// client/src/crypto/pages/CryptoEngines.jsx

import {
  Activity,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  BrainCircuit,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Database,
  Droplets,
  Gauge,
  Globe2,
  Layers3,
  Megaphone,
  Moon,
  Network,
  Newspaper,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Sun,
  Target,
  TrendingUp,
  X,
} from "lucide-react";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import CryptoSidebar from
  "../components/CryptoSidebar.jsx";

import WorkspaceJumpButton from
  "../../components/WorkspaceJumpButton.jsx";

import CexDiscoveryTerminal from "./CexDiscoveryTerminal.jsx";

import "./CryptoEngines.css";


const ENGINE_STORAGE_KEY =
  "aema-crypto-last-scan";

const ENGINE_QUERY_STORAGE_KEY =
  "aema-crypto-last-scan-query";


const ENGINE_DEFINITIONS = [
  {
    key: "technical",
    label: "Technical",
    icon: BarChart3,
    role: "CANONICAL",
    weight: "20%",
    description:
      "Price movement, multi-timeframe structure, directional conviction and technical market behaviour.",
  },
  {
    key: "fundamental",
    label: "Fundamental",
    icon: Database,
    role: "CANONICAL",
    weight: "20%",
    description:
      "Protocol usage, token economics, liquidity quality, adoption, valuation, project quality and decentralization.",
  },
  {
    key: "supporting",
    label: "Supporting",
    icon: Layers3,
    role: "CANONICAL",
    weight: "60%",
    description:
      "Canonical supporting intelligence built from attributable Narrative and News evidence.",
  },
  {
    key: "momentum",
    label: "Momentum",
    icon: Activity,
    role: "DIAGNOSTIC",
    description:
      "Trend strength, velocity, directional movement and multi-timeframe price behaviour.",
  },
  {
    key: "liquidity",
    label: "Liquidity",
    icon: Droplets,
    role: "DIAGNOSTIC",
    description:
      "Trading volume, liquidity quality, spread and market execution conditions.",
  },
  {
    key: "onChain",
    label: "On-Chain",
    icon: Network,
    role: "DIAGNOSTIC",
    description:
      "Blockchain, protocol, holder, network and attributable on-chain evidence.",
  },
  {
    key: "narrative",
    label: "Narrative",
    icon: Megaphone,
    role: "SUPPORTING",
    weight: "50% of Supporting",
    description:
      "Current market narrative, attention, thematic relevance and sentiment evidence.",
  },
  {
    key: "news",
    label: "News",
    icon: Newspaper,
    role: "SUPPORTING",
    weight: "50% of Supporting",
    description:
      "Current news, catalysts, developments and event-driven directional evidence.",
  },
  {
    key: "risk",
    label: "Risk",
    icon: ShieldCheck,
    role: "SAFETY",
    description:
      "Composite safety-quality assessment. A higher score represents healthier, lower-risk conditions.",
  },
  {
    key: "marketStructure",
    label: "Market Structure",
    icon: Gauge,
    role: "DIAGNOSTIC",
    description:
      "Market structure and price behaviour used as supporting diagnostic evidence.",
  },
];


const FUNDAMENTAL_CRITERIA = [
  ["Network / Protocol Usage", "20%"],
  ["Token Economics", "20%"],
  ["Liquidity & Market Quality", "15%"],
  ["Adoption & Ecosystem", "15%"],
  ["Valuation", "10%"],
  ["Project / Development Quality", "10%"],
  ["Security & Decentralization", "10%"],
];


function finite(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : null;
}


function clampScore(value) {
  const number = finite(value);

  if (number === null) {
    return null;
  }

  return Math.max(
    0,
    Math.min(100, number),
  );
}


function percentage(value) {
  const number = finite(value);

  if (number === null) {
    return null;
  }

  if (
    number >= 0 &&
    number <= 1
  ) {
    return Math.round(
      number * 100,
    );
  }

  return Math.round(
    Math.max(
      0,
      Math.min(100, number),
    ),
  );
}


function formatScore(value) {
  const score =
    clampScore(value);

  if (score === null) {
    return "—";
  }

  return Number.isInteger(score)
    ? String(score)
    : score.toFixed(1);
}


function scoreTone(score) {
  const value =
    clampScore(score);

  if (value === null) {
    return "unavailable";
  }

  if (value >= 70) {
    return "positive";
  }

  if (value <= 40) {
    return "negative";
  }

  return "neutral";
}


function scoreLabel(score) {
  const value =
    clampScore(score);

  if (value === null) {
    return "Unavailable";
  }

  if (value >= 80) {
    return "Strong";
  }

  if (value >= 65) {
    return "Positive";
  }

  if (value >= 45) {
    return "Neutral";
  }

  return "Weak";
}


function readStoredResult() {
  try {
    const raw =
      localStorage.getItem(
        ENGINE_STORAGE_KEY,
      );

    return raw
      ? JSON.parse(raw)
      : null;
  } catch {
    return null;
  }
}


function readStoredQuery() {
  try {
    return (
      localStorage.getItem(
        ENGINE_QUERY_STORAGE_KEY,
      ) ?? ""
    );
  } catch {
    return "";
  }
}


function candidateFromResult(
  result,
) {
  if (!result) {
    return null;
  }

  /*
   * Scanner/engine responses keep the research contract at the root.
   * Never reduce that response to result.asset: doing so discards pillars,
   * engines, researchScore, confidence, coverage and qualification data.
   */
  if (
    result?.pillars ||
    result?.engines ||
    result?.researchScore !== undefined ||
    result?.canonicalScore !== undefined
  ) {
    return result;
  }

  const directCandidates = [
    result?.candidate,
    result?.selectedCandidate,
    result?.result,
  ];

  for (
    const candidate
    of directCandidates
  ) {
    if (
      candidate &&
      typeof candidate ===
        "object"
    ) {
      return candidate;
    }
  }

  const arrays = [
    result?.selectedCandidates,
    result?.candidates,
    result?.results,
    result?.qualifiedCandidates,
    result?.deepResearchCandidates,
    result?.researchedCandidates,
  ];

  for (
    const collection
    of arrays
  ) {
    if (
      Array.isArray(collection) &&
      collection.length
    ) {
      return collection[0];
    }
  }

  return result;
}


function engineObject(
  candidate,
  key,
) {
  if (!candidate) {
    return null;
  }

  if (
    key === "technical"
  ) {
    return (
      candidate?.pillars
        ?.technical ??
      candidate?.technical ??
      candidate?.engineResults
        ?.technical ??
      null
    );
  }

  if (
    key === "fundamental"
  ) {
    return (
      candidate?.pillars
        ?.fundamental ??
      candidate?.fundamental ??
      candidate?.engineResults
        ?.fundamental ??
      null
    );
  }

  if (
    key === "supporting"
  ) {
    return (
      candidate?.pillars
        ?.supporting ??
      candidate?.supporting ??
      null
    );
  }

  return (
    candidate?.engines?.[key] ??
    candidate?.engineResults?.[key] ??
    candidate?.[key] ??
    null
  );
}


function engineScore(
  candidate,
  key,
) {
  const engine =
    engineObject(
      candidate,
      key,
    );

  if (
    typeof engine ===
    "number"
  ) {
    return clampScore(engine);
  }

  return clampScore(
    engine?.score ??
    engine?.qualityScore ??
    engine?.overallScore ??
    engine?.totalScore ??
    null,
  );
}


function researchScore(
  candidate,
) {
  return clampScore(
    candidate?.researchScore ??
    candidate?.canonicalScore ??
    null,
  );
}


function readDirection(
  candidate,
) {
  const decision =
    candidate?.qualification2
      ?.decision ??
    candidate?.qualification2Readiness
      ?.decision ??
    candidate?.finalDecision ??
    candidate?.preferredDirection ??
    candidate?.direction ??
    "NO_TRADE";

  const normalized =
    String(decision)
      .trim()
      .toUpperCase();

  if (
    normalized === "LONG" ||
    normalized === "BUY"
  ) {
    return "LONG";
  }

  if (
    normalized === "SHORT" ||
    normalized === "SELL"
  ) {
    return "SHORT";
  }

  return "NO_TRADE";
}


function assetIdentity(
  candidate,
  query,
) {
  const asset =
    candidate?.asset ??
    candidate ?? {};

  return {
    symbol:
      String(
        asset?.symbol ??
        candidate?.symbol ??
        query ??
        "TOKEN",
      )
        .toUpperCase(),

    name:
      asset?.name ??
      candidate?.name ??
      asset?.symbol ??
      candidate?.symbol ??
      query ??
      "Crypto Asset",

    marketType:
      String(
        candidate?.marketType ??
        candidate?.candidateType ??
        asset?.marketType ??
        asset?.candidateType ??
        "CRYPTO",
      )
        .toUpperCase(),

    venue:
      candidate?.venue ??
      candidate?.exchange ??
      asset?.venue ??
      asset?.exchange ??
      null,

    price:
      finite(
        candidate?.priceUsd ??
        candidate?.price ??
        asset?.priceUsd ??
        asset?.price,
      ),
  };
}


function flattenEvidence(
  value,
  prefix = "",
  depth = 0,
) {
  if (
    value == null ||
    depth > 3
  ) {
    return [];
  }

  if (
    typeof value ===
      "string" ||
    typeof value ===
      "number" ||
    typeof value ===
      "boolean"
  ) {
    return [
      {
        label:
          prefix || "Value",
        value,
      },
    ];
  }

  if (
    Array.isArray(value)
  ) {
    return value
      .slice(0, 12)
      .flatMap(
        (
          item,
          index,
        ) =>
          flattenEvidence(
            item,
            prefix
              ? `${prefix} ${index + 1}`
              : `Evidence ${index + 1}`,
            depth + 1,
          ),
      );
  }

  if (
    typeof value ===
    "object"
  ) {
    return Object
      .entries(value)
      .filter(
        ([
          key,
        ]) =>
          ![
            "executionAuthority",
            "liveExecution",
            "paperExecution",
          ].includes(key),
      )
      .slice(0, 20)
      .flatMap(
        ([
          key,
          nested,
        ]) => {
          const label =
            key
              .replace(
                /([A-Z])/g,
                " $1",
              )
              .replace(
                /[_-]/g,
                " ",
              )
              .replace(
                /\b\w/g,
                letter =>
                  letter
                    .toUpperCase(),
              );

          if (
            nested == null
          ) {
            return [];
          }

          if (
            typeof nested ===
              "object"
          ) {
            return flattenEvidence(
              nested,
              label,
              depth + 1,
            );
          }

          return [
            {
              label,
              value:
                nested,
            },
          ];
        },
      );
  }

  return [];
}



function firstFinite(...values) {
  for (const value of values) {
    const number = finite(value);
    if (number !== null) return number;
  }
  return null;
}

function formatMoney(value) {
  const number = finite(value);
  if (number === null) return "—";

  const absolute = Math.abs(number);
  if (absolute >= 1e12) return `$${(number / 1e12).toFixed(2)}T`;
  if (absolute >= 1e9) return `$${(number / 1e9).toFixed(2)}B`;
  if (absolute >= 1e6) return `$${(number / 1e6).toFixed(2)}M`;
  if (absolute >= 1e3) return `$${(number / 1e3).toFixed(2)}K`;

  return number.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: absolute < 1 ? 8 : 2,
  });
}

function formatNumber(value) {
  const number = finite(value);
  if (number === null) return "—";

  const absolute = Math.abs(number);
  if (absolute >= 1e12) return `${(number / 1e12).toFixed(2)}T`;
  if (absolute >= 1e9) return `${(number / 1e9).toFixed(2)}B`;
  if (absolute >= 1e6) return `${(number / 1e6).toFixed(2)}M`;
  if (absolute >= 1e3) return `${(number / 1e3).toFixed(2)}K`;

  return number.toLocaleString(undefined, {
    maximumFractionDigits: absolute < 1 ? 8 : 2,
  });
}

function ValuationLab({ candidate }) {
  const [multiple, setMultiple] = useState(2);

  if (!candidate) return null;

  const asset = candidate?.asset ?? {};
  const market = candidate?.market ?? candidate?.marketData ?? {};
  const valuation =
    candidate?.valuation ??
    candidate?.valuationLab ??
    candidate?.marketCapAnalysis ??
    candidate?.marketCap ??
    {};

  const price = firstFinite(
    candidate?.priceUsd,
    candidate?.price,
    asset?.priceUsd,
    asset?.price,
    market?.priceUsd,
    market?.price,
    valuation?.currentPrice,
  );

  const marketCap = firstFinite(
    candidate?.marketCapUsd,
    candidate?.marketCap,
    asset?.marketCapUsd,
    asset?.marketCap,
    market?.marketCapUsd,
    market?.marketCap,
    valuation?.currentMarketCap,
  );

  const fdv = firstFinite(
    candidate?.fullyDilutedValuation,
    candidate?.fdv,
    asset?.fullyDilutedValuation,
    asset?.fdv,
    market?.fullyDilutedValuation,
    market?.fdv,
    valuation?.fdv,
  );

  const volume24h = firstFinite(
    candidate?.volume24h,
    candidate?.volume24hUsd,
    asset?.volume24h,
    asset?.volume24hUsd,
    market?.volume24h,
    market?.volume24hUsd,
    valuation?.volume24h,
  );

  const circulatingSupply = firstFinite(
    candidate?.circulatingSupply,
    asset?.circulatingSupply,
    market?.circulatingSupply,
    valuation?.circulatingSupply,
  );

  const totalSupply = firstFinite(
    candidate?.totalSupply,
    asset?.totalSupply,
    market?.totalSupply,
    valuation?.totalSupply,
  );

  const maxSupply = firstFinite(
    candidate?.maxSupply,
    asset?.maxSupply,
    market?.maxSupply,
    valuation?.maxSupply,
  );

  const marketCapRank = firstFinite(
    candidate?.marketCapRank,
    candidate?.rank,
    asset?.marketCapRank,
    asset?.rank,
    market?.marketCapRank,
    market?.rank,
    valuation?.marketCapRank,
  );

  const volumeToMarketCap =
    marketCap !== null && marketCap > 0 && volume24h !== null
      ? (volume24h / marketCap) * 100
      : null;

  const circulatingPercent =
    circulatingSupply !== null &&
    totalSupply !== null &&
    totalSupply > 0
      ? (circulatingSupply / totalSupply) * 100
      : null;

  const fdvToMarketCap =
    fdv !== null && marketCap !== null && marketCap > 0
      ? fdv / marketCap
      : null;

  const impliedPrice =
    price !== null ? price * multiple : null;

  const requiredMarketCap =
    marketCap !== null ? marketCap * multiple : null;

  const marketCapIncrease =
    marketCap !== null
      ? requiredMarketCap - marketCap
      : null;

  const impliedFdv =
    fdv !== null
      ? fdv * multiple
      : totalSupply !== null && impliedPrice !== null
        ? totalSupply * impliedPrice
        : null;

  const dilutionRisk =
    fdvToMarketCap === null
      ? null
      : fdvToMarketCap <= 1.15
        ? "LOW"
        : fdvToMarketCap <= 1.75
          ? "MODERATE"
          : "HIGH";

  const scenarioLabel =
    multiple <= 1.5
      ? "CONSERVATIVE"
      : multiple <= 3
        ? "MODERATE"
        : multiple <= 5
          ? "AMBITIOUS"
          : "HIGH EXPANSION";

  const hasCoreData =
    price !== null || marketCap !== null || fdv !== null;

  return (
    <section className="crypto-valuation-panel">
      <div className="crypto-valuation-heading">
        <div>
          <span>VALUATION LAB</span>
          <h2>Market-Cap &amp; Valuation</h2>
        </div>

        <div className="crypto-valuation-heading-side">
          <span className="crypto-valuation-zero">
            0% CANONICAL WEIGHT
          </span>
          <p>
            Explore implied token price and valuation scenarios without
            changing the canonical research score.
          </p>
        </div>
      </div>

      {!hasCoreData ? (
        <div className="crypto-valuation-unavailable">
          Market-cap valuation data was not returned for this token.
          No values are estimated or fabricated.
        </div>
      ) : (
        <>
          <div className="crypto-valuation-current-grid">
            <Metric label="Current Price" value={formatMoney(price)} />
            <Metric label="Market Cap" value={formatMoney(marketCap)} />
            <Metric label="FDV" value={formatMoney(fdv)} />
            <Metric label="24H Volume" value={formatMoney(volume24h)} />
            <Metric
              label="Circulating Supply"
              value={formatNumber(circulatingSupply)}
            />
            <Metric
              label="Volume / Market Cap"
              value={
                volumeToMarketCap === null
                  ? "—"
                  : `${volumeToMarketCap.toFixed(2)}%`
              }
            />
          </div>

          <div className="crypto-valuation-scaler">
            <div className="crypto-valuation-subheading">
              <div>
                <span>MARKET-CAP SCALER</span>
                <h3>Select a valuation multiple</h3>
              </div>

              <span className="crypto-valuation-selected">
                {multiple}× selected
              </span>
            </div>

            <div className="crypto-valuation-multipliers">
              {[1, 1.5, 2, 3, 5, 10].map(value => (
                <button
                  key={value}
                  type="button"
                  className={multiple === value ? "active" : ""}
                  aria-pressed={multiple === value}
                  onClick={() => setMultiple(value)}
                >
                  {value}×
                </button>
              ))}
            </div>

            <div className="crypto-valuation-scenario">
              <div className="crypto-valuation-scenario-main">
                <span>IMPLIED TOKEN PRICE AT {multiple}×</span>
                <strong>{formatMoney(impliedPrice)}</strong>
                <small>
                  Current price: {formatMoney(price)}
                </small>

                <div className="crypto-valuation-scenario-badge">
                  <span />
                  {scenarioLabel}
                </div>
              </div>

              <div className="crypto-valuation-scenario-metrics">
                <Metric
                  label="Required Market Cap"
                  value={formatMoney(requiredMarketCap)}
                />
                <Metric
                  label="Market-Cap Increase"
                  value={formatMoney(marketCapIncrease)}
                />
                <Metric
                  label="Implied FDV"
                  value={formatMoney(impliedFdv)}
                />
                <Metric
                  label="Multiple"
                  value={`${multiple}×`}
                />
              </div>
            </div>
          </div>

          <div className="crypto-valuation-relative">
            <div className="crypto-valuation-subheading">
              <div>
                <span>RELATIVE VALUE SCREEN</span>
                <h3>Valuation context</h3>
              </div>
            </div>

            <div className="crypto-valuation-relative-grid">
              <div className="crypto-valuation-context-card">
                <div className="crypto-valuation-context-title">
                  VALUATION CONTEXT
                </div>

                <Metric
                  label="Dilution Risk"
                  value={dilutionRisk ?? "—"}
                />
                <Metric
                  label="Circulating %"
                  value={
                    circulatingPercent === null
                      ? "—"
                      : `${circulatingPercent.toFixed(1)}%`
                  }
                />
                <Metric
                  label="FDV / Market Cap"
                  value={
                    fdvToMarketCap === null
                      ? "—"
                      : `${fdvToMarketCap.toFixed(2)}×`
                  }
                />
                <Metric
                  label="Market Cap Rank"
                  value={
                    marketCapRank === null
                      ? "—"
                      : `#${Math.round(marketCapRank)}`
                  }
                />
              </div>

              <div className="crypto-valuation-screen-card">
                <span>SCREENING RESULT</span>
                <strong>
                  {dilutionRisk === null
                    ? "INSUFFICIENT DATA"
                    : dilutionRisk === "HIGH"
                      ? "DILUTION WATCH"
                      : "NOT FLAGGED"}
                </strong>
                <p>
                  {dilutionRisk === null
                    ? "The backend did not return enough supply and valuation data to evaluate dilution."
                    : dilutionRisk === "HIGH"
                      ? "FDV is materially above current market capitalization. Review unlocks and future supply before interpreting the scenario."
                      : "The current FDV-to-market-cap relationship does not trigger the high-dilution screen."}
                </p>

                {dilutionRisk && (
                  <span className={`crypto-valuation-risk risk-${dilutionRisk.toLowerCase()}`}>
                    {dilutionRisk} DILUTION
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="crypto-valuation-note">
            <CircleAlert size={16} />
            <p>
              Valuation context only. The scaler applies the selected multiple
              to backend-supplied market data. It does not predict that the
              token will reach the displayed price or market capitalization and
              does not affect the canonical research score.
            </p>
          </div>
        </>
      )}
    </section>
  );
}


function DirectionBadge({
  direction,
}) {
  const Icon =
    direction === "LONG"
      ? ArrowUpRight
      : direction === "SHORT"
        ? ArrowDownRight
        : ArrowRight;

  return (
    <span
      className={`crypto-engine-direction ${direction.toLowerCase()}`}
    >
      <Icon size={14} />
      {direction}
    </span>
  );
}


function ScoreRing({
  score,
  size = "normal",
}) {
  const normalized =
    clampScore(score);

  const degrees =
    normalized === null
      ? 0
      : normalized * 3.6;

  return (
    <div
      className={[
        "crypto-engine-score-ring",
        `tone-${scoreTone(normalized)}`,
        size === "large"
          ? "large"
          : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{
        "--engine-score-angle":
          `${degrees}deg`,
      }}
    >
      <div
        className="crypto-engine-score-ring-inner"
      >
        <strong>
          {formatScore(normalized)}
        </strong>

        <span>
          {normalized === null
            ? "N/A"
            : "/100"}
        </span>
      </div>
    </div>
  );
}


function Metric({
  label,
  value,
}) {
  return (
    <div
      className="crypto-engine-metric"
    >
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}


function EngineCard({
  definition,
  candidate,
  onOpen,
}) {
  const {
    icon: Icon,
  } = definition;

  const engine =
    engineObject(
      candidate,
      definition.key,
    );

  const score =
    engineScore(
      candidate,
      definition.key,
    );

  const confidence =
    percentage(
      engine?.confidence,
    );

  const coverage =
    percentage(
      engine?.coverage,
    );

  const available =
    score !== null;

  return (
    <button
      type="button"
      className={[
        "crypto-engine-card",
        `tone-${scoreTone(score)}`,
        !available
          ? "is-unavailable"
          : "",
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={() =>
        onOpen(definition)
      }
    >
      <div
        className="crypto-engine-card-top"
      >
        <div
          className="crypto-engine-card-icon"
        >
          <Icon size={19} />
        </div>

        <div
          className="crypto-engine-card-tags"
        >
          <span
            className={`crypto-engine-role role-${definition.role.toLowerCase()}`}
          >
            {definition.role}
          </span>

          {definition.weight && (
            <span
              className="crypto-engine-weight"
            >
              {definition.weight}
            </span>
          )}
        </div>
      </div>

      <div
        className="crypto-engine-card-main"
      >
        <div>
          <h3>
            {definition.label}
          </h3>

          <p>
            {definition.description}
          </p>
        </div>

        <div
          className="crypto-engine-card-score"
        >
          <strong>
            {formatScore(score)}
          </strong>

          <span>
            {available
              ? "/100"
              : "Unavailable"}
          </span>
        </div>
      </div>

      <div
        className="crypto-engine-card-footer"
      >
        <div
          className="crypto-engine-card-meta"
        >
          <span
            className={`crypto-engine-signal tone-${scoreTone(score)}`}
          >
            {scoreLabel(score)}
          </span>

          {confidence !== null && (
            <span>
              {confidence}% confidence
            </span>
          )}

          {coverage !== null && (
            <span>
              {coverage}% coverage
            </span>
          )}
        </div>

        <span
          className="crypto-engine-view"
        >
          View criteria
          <ChevronRight
            size={15}
          />
        </span>
      </div>
    </button>
  );
}


function CriteriaDrawer({
  definition,
  candidate,
  onClose,
}) {
  if (!definition) {
    return null;
  }

  const {
    icon: Icon,
  } = definition;

  const engine =
    engineObject(
      candidate,
      definition.key,
    );

  const score =
    engineScore(
      candidate,
      definition.key,
    );

  const confidence =
    percentage(
      engine?.confidence,
    );

  const coverage =
    percentage(
      engine?.coverage,
    );

  const direction =
    String(
      engine?.direction ??
      engine?.preferredDirection ??
      "",
    )
      .toUpperCase();

  const directionalSupport =
    engine?.directionalSupport;

  const evidenceSources = [
    engine?.components,
    engine?.criteria,
    engine?.metrics,
    engine?.evidence,
    engine?.availability,
    engine?.details,
    engine?.breakdown,
  ];

  const evidence =
    evidenceSources
      .flatMap(
        source =>
          flattenEvidence(
            source,
          ),
      )
      .filter(
        (
          item,
          index,
          array,
        ) =>
          array.findIndex(
            other =>
              other.label ===
                item.label &&
              String(
                other.value,
              ) ===
                String(
                  item.value,
                ),
          ) === index,
      )
      .slice(0, 30);

  return (
    <div
      className="crypto-engine-drawer-shell"
      role="presentation"
      onMouseDown={event => {
        if (
          event.target ===
          event.currentTarget
        ) {
          onClose();
        }
      }}
    >
      <aside
        className="crypto-engine-drawer"
        aria-label={`${definition.label} engine criteria`}
      >
        <div
          className="crypto-engine-drawer-header"
        >
          <div
            className="crypto-engine-drawer-title"
          >
            <span
              className="crypto-engine-drawer-icon"
            >
              <Icon size={20} />
            </span>

            <div>
              <span
                className="crypto-engine-eyebrow"
              >
                ENGINE ANALYSIS
              </span>

              <h2>
                {definition.label}
              </h2>
            </div>
          </div>

          <button
            type="button"
            className="crypto-engine-drawer-close"
            onClick={onClose}
            aria-label="Close engine details"
          >
            <X size={19} />
          </button>
        </div>

        <div
          className="crypto-engine-drawer-score"
        >
          <ScoreRing
            score={score}
            size="large"
          />

          <div
            className="crypto-engine-drawer-score-copy"
          >
            <span
              className={`crypto-engine-role role-${definition.role.toLowerCase()}`}
            >
              {definition.role}
            </span>

            {definition.weight && (
              <strong>
                {definition.weight}
              </strong>
            )}

            <p>
              {definition.description}
            </p>
          </div>
        </div>

        <div
          className="crypto-engine-drawer-metrics"
        >
          <Metric
            label="Score"
            value={
              score === null
                ? "Unavailable"
                : `${formatScore(score)}/100`
            }
          />

          <Metric
            label="Confidence"
            value={
              confidence === null
                ? "—"
                : `${confidence}%`
            }
          />

          <Metric
            label="Coverage"
            value={
              coverage === null
                ? "—"
                : `${coverage}%`
            }
          />

          <Metric
            label="Status"
            value={
              engine?.status ??
              (
                score === null
                  ? "UNAVAILABLE"
                  : "READY"
              )
            }
          />
        </div>

        {(
          direction === "LONG" ||
          direction === "SHORT"
        ) && (
          <section
            className="crypto-engine-drawer-section"
          >
            <div
              className="crypto-engine-section-heading"
            >
              <Target size={16} />

              <h3>
                Direction
              </h3>
            </div>

            <DirectionBadge
              direction={direction}
            />
          </section>
        )}

        {directionalSupport && (
          <section
            className="crypto-engine-drawer-section"
          >
            <div
              className="crypto-engine-section-heading"
            >
              <TrendingUp
                size={16}
              />

              <h3>
                Directional support
              </h3>
            </div>

            <div
              className="crypto-engine-direction-bars"
            >
              <div>
                <span>
                  LONG
                </span>

                <strong>
                  {percentage(
                    directionalSupport
                      ?.long,
                  ) ?? 0}%
                </strong>
              </div>

              <div>
                <span>
                  SHORT
                </span>

                <strong>
                  {percentage(
                    directionalSupport
                      ?.short,
                  ) ?? 0}%
                </strong>
              </div>
            </div>
          </section>
        )}

        {definition.key ===
          "fundamental" && (
          <section
            className="crypto-engine-drawer-section"
          >
            <div
              className="crypto-engine-section-heading"
            >
              <Layers3
                size={16}
              />

              <h3>
                Fundamental framework
              </h3>
            </div>

            <div
              className="crypto-engine-criteria-list"
            >
              {FUNDAMENTAL_CRITERIA.map(
                ([
                  label,
                  weight,
                ]) => (
                  <div
                    key={label}
                    className="crypto-engine-criterion"
                  >
                    <span>
                      {label}
                    </span>

                    <strong>
                      {weight}
                    </strong>
                  </div>
                ),
              )}
            </div>
          </section>
        )}

        {definition.key ===
          "supporting" && (
          <section
            className="crypto-engine-drawer-section"
          >
            <div
              className="crypto-engine-section-heading"
            >
              <BrainCircuit
                size={16}
              />

              <h3>
                Canonical composition
              </h3>
            </div>

            <div
              className="crypto-engine-criteria-list"
            >
              <div
                className="crypto-engine-criterion"
              >
                <span>
                  Narrative
                </span>
                <strong>
                  50%
                </strong>
              </div>

              <div
                className="crypto-engine-criterion"
              >
                <span>
                  News
                </span>
                <strong>
                  50%
                </strong>
              </div>
            </div>

            <p
              className="crypto-engine-policy-note"
            >
              Momentum, Liquidity,
              On-Chain and Risk remain
              visible diagnostics but
              are excluded from the
              canonical Supporting score
              to prevent correlated
              evidence from being counted
              twice.
            </p>
          </section>
        )}

        {definition.key ===
          "risk" && (
          <div
            className="crypto-engine-risk-note"
          >
            <ShieldCheck
              size={17}
            />

            <div>
              <strong>
                Risk score semantics
              </strong>

              <p>
                A higher Risk Engine
                score represents
                healthier, lower-risk
                conditions. It does not
                mean the asset is more
                dangerous.
              </p>
            </div>
          </div>
        )}

        <section
          className="crypto-engine-drawer-section"
        >
          <div
            className="crypto-engine-section-heading"
          >
            <Database size={16} />

            <h3>
              Engine evidence
            </h3>
          </div>

          {evidence.length ? (
            <div
              className="crypto-engine-evidence-list"
            >
              {evidence.map(
                (
                  item,
                  index,
                ) => (
                  <div
                    key={`${item.label}-${index}`}
                    className="crypto-engine-evidence-row"
                  >
                    <span>
                      {item.label}
                    </span>

                    <strong>
                      {typeof item.value ===
                      "boolean"
                        ? item.value
                          ? "Yes"
                          : "No"
                        : String(
                            item.value,
                          )}
                    </strong>
                  </div>
                ),
              )}
            </div>
          ) : (
            <div
              className="crypto-engine-empty-evidence"
            >
              <CircleAlert
                size={17}
              />

              <p>
                No additional structured
                evidence was returned by
                this engine for the
                current token.
              </p>
            </div>
          )}
        </section>

        {engine?.summary && (
          <section
            className="crypto-engine-drawer-section"
          >
            <div
              className="crypto-engine-section-heading"
            >
              <Sparkles size={16} />

              <h3>
                Engine summary
              </h3>
            </div>

            <p
              className="crypto-engine-drawer-summary"
            >
              {String(
                engine.summary,
              )}
            </p>
          </section>
        )}

        <div
          className="crypto-engine-drawer-footer"
        >
          <ShieldCheck size={15} />
          Research intelligence only •
          Paper execution architecture
        </div>
      </aside>
    </div>
  );
}


export default function CryptoEngines() {
  const [
    theme,
    setTheme,
  ] = useState(() => {
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

  const [
    query,
    setQuery,
  ] = useState(
    () =>
      readStoredQuery(),
  );

  const [
    result,
    setResult,
  ] = useState(
    () =>
      readStoredResult(),
  );

  const [
    loading,
    setLoading,
  ] = useState(false);

  const [
    error,
    setError,
  ] = useState("");

  const [
    selectedEngine,
    setSelectedEngine,
  ] = useState(null);


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


  const candidate =
    useMemo(
      () =>
        candidateFromResult(
          result,
        ),
      [
        result,
      ],
    );


  const identity =
    useMemo(
      () =>
        assetIdentity(
          candidate,
          query,
        ),
      [
        candidate,
        query,
      ],
    );


  const totalScore =
    researchScore(
      candidate,
    );

  const confidence =
    percentage(
      candidate
        ?.researchConfidence,
    );

  const coverage =
    percentage(
      candidate
        ?.researchCoverage,
    );

  const direction =
    readDirection(
      candidate,
    );


  const canonicalEngines =
    ENGINE_DEFINITIONS.filter(
      engine =>
        engine.role ===
        "CANONICAL",
    );

  const researchEngines =
    ENGINE_DEFINITIONS.filter(
      engine =>
        engine.role !==
        "CANONICAL",
    );


  function refreshFromScanner() {
    setLoading(true);
    setError("");

    try {
      const nextResult =
        readStoredResult();
      const nextQuery =
        readStoredQuery();

      setResult(nextResult);
      setQuery(nextQuery);

      if (!nextResult) {
        setError(
          "No Scanner result is available yet. Scan a token first, then return to Engines.",
        );
      }
    } finally {
      setLoading(false);
    }
  }


  return (
    <div
      className={`crypto-shell crypto-theme-${theme} crypto-engines-page`}
    >
      <CryptoSidebar />

      <main
        className="crypto-engines-main"
      >
        <div
          className="crypto-engines-content"
        >
          <header
            className="crypto-engines-header"
          >
            <div>
              <div
                className="crypto-engines-eyebrow"
              >
                <span
                  className="crypto-engines-live-dot"
                />

                AEMA CRYPTO INTELLIGENCE
              </div>

              <h1>
                Research Engines
              </h1>

              <p>
                Inspect how AEMA's
                research engines evaluate
                an asset, how much
                evidence is available and
                which engines contribute
                to the canonical research
                score.
              </p>
            </div>

            <div
              className="crypto-engines-header-actions"
            >
              <span
                className="crypto-engines-paper-badge"
              >
                PAPER
              </span>

              <div
                className="crypto-engines-workspace-jump"
              >
                <WorkspaceJumpButton
                  target="stocks"
                />
              </div>

              <button
                type="button"
                className="crypto-engines-theme-toggle"
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
                className="crypto-engines-refresh-button"
                onClick={
                  refreshFromScanner
                }
                disabled={
                  loading
                }
              >
                <RefreshCw
                  size={16}
                  className={
                    loading
                      ? "crypto-engines-spin"
                      : ""
                  }
                />

                Refresh
              </button>
            </div>
          </header>


          <CexDiscoveryTerminal />

          {error && (
            <div
              className="crypto-engines-error"
            >
              <CircleAlert
                size={18}
              />

              <span>
                {error}
              </span>
            </div>
          )}


          {!candidate ? (
            <section
              className="crypto-engines-empty"
            >
              <div
                className="crypto-engines-empty-icon"
              >
                <BrainCircuit
                  size={34}
                />
              </div>

              <h2>
                Engine Intelligence
              </h2>

              <p>
                Search a cryptocurrency
                to run the AEMA research
                architecture and inspect
                every available engine.
              </p>

              <div
                className="crypto-engines-architecture"
              >
                <span>
                  Technical
                  <strong>20%</strong>
                </span>

                <ChevronRight
                  size={16}
                />

                <span>
                  Fundamental
                  <strong>20%</strong>
                </span>

                <ChevronRight
                  size={16}
                />

                <span>
                  Supporting
                  <strong>60%</strong>
                </span>
              </div>
            </section>
          ) : (
            <>
              <section
                className="crypto-engines-overview"
              >
                <div
                  className="crypto-engines-asset"
                >
                  <div
                    className="crypto-engines-asset-icon"
                  >
                    {identity.symbol
                      .slice(0, 1)}
                  </div>

                  <div>
                    <div
                      className="crypto-engines-asset-title"
                    >
                      <h2>
                        {identity.name}
                      </h2>

                      <strong>
                        {identity.symbol}
                      </strong>
                    </div>

                    <div
                      className="crypto-engines-asset-meta"
                    >
                      <span>
                        {identity.marketType}
                      </span>

                      {identity.venue && (
                        <span>
                          {String(
                            identity.venue,
                          ).toUpperCase()}
                        </span>
                      )}

                      {identity.price !==
                        null && (
                        <span>
                          $
                          {identity.price
                            .toLocaleString(
                              undefined,
                              {
                                maximumFractionDigits:
                                  identity.price <
                                  1
                                    ? 8
                                    : 2,
                              },
                            )}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div
                  className="crypto-engines-total-score"
                >
                  <div>
                    <span>
                      CANONICAL RESEARCH
                    </span>

                    <h3>
                      Total Score
                    </h3>
                  </div>

                  <ScoreRing
                    score={
                      totalScore
                    }
                    size="large"
                  />
                </div>

                <div
                  className="crypto-engines-overview-metrics"
                >
                  <Metric
                    label="Direction"
                    value={
                      <DirectionBadge
                        direction={
                          direction
                        }
                      />
                    }
                  />

                  <Metric
                    label="Confidence"
                    value={
                      confidence ===
                      null
                        ? "—"
                        : `${confidence}%`
                    }
                  />

                  <Metric
                    label="Coverage"
                    value={
                      coverage ===
                      null
                        ? "—"
                        : `${coverage}%`
                    }
                  />

                  <Metric
                    label="Qualification 2"
                    value={
                      candidate
                        ?.qualification2
                        ?.qualified ===
                      true
                        ? "PASSED"
                        : candidate
                            ?.qualification2
                            ?.qualified ===
                          false
                          ? "NOT PASSED"
                          : "—"
                    }
                  />
                </div>
              </section>


              <section
                className="crypto-engines-section"
              >
                <div
                  className="crypto-engines-section-header"
                >
                  <div>
                    <span>
                      RESEARCH ARCHITECTURE
                    </span>

                    <h2>
                      Canonical Research
                    </h2>
                  </div>

                  <p>
                    These three pillars
                    determine the canonical
                    research score.
                  </p>
                </div>

                <div
                  className="crypto-engines-canonical-grid"
                >
                  {canonicalEngines.map(
                    definition => (
                      <EngineCard
                        key={
                          definition.key
                        }
                        definition={
                          definition
                        }
                        candidate={
                          candidate
                        }
                        onOpen={
                          setSelectedEngine
                        }
                      />
                    ),
                  )}
                </div>
              </section>


              <section
                className="crypto-engines-section"
              >
                <div
                  className="crypto-engines-section-header"
                >
                  <div>
                    <span>
                      ENGINE MATRIX
                    </span>

                    <h2>
                      Individual Engines
                    </h2>
                  </div>

                  <p>
                    Click any engine to
                    inspect its available
                    criteria and evidence.
                  </p>
                </div>

                <div
                  className="crypto-engines-grid"
                >
                  {researchEngines.map(
                    definition => (
                      <EngineCard
                        key={
                          definition.key
                        }
                        definition={
                          definition
                        }
                        candidate={
                          candidate
                        }
                        onOpen={
                          setSelectedEngine
                        }
                      />
                    ),
                  )}
                </div>
              </section>


              <section
                className="crypto-engines-summary"
              >
                <div
                  className="crypto-engines-summary-header"
                >
                  <div
                    className="crypto-engines-summary-icon"
                  >
                    <Sparkles
                      size={20}
                    />
                  </div>

                  <div>
                    <span>
                      RESEARCH OUTPUT
                    </span>

                    <h2>
                      Research Summary
                    </h2>
                  </div>

                  <DirectionBadge
                    direction={
                      direction
                    }
                  />
                </div>

                <div
                  className="crypto-engines-summary-scoreboard"
                >
                  <Metric
                    label="Research Score"
                    value={
                      totalScore ===
                      null
                        ? "—"
                        : `${formatScore(totalScore)}/100`
                    }
                  />

                  <Metric
                    label="Confidence"
                    value={
                      confidence ===
                      null
                        ? "—"
                        : `${confidence}%`
                    }
                  />

                  <Metric
                    label="Coverage"
                    value={
                      coverage ===
                      null
                        ? "—"
                        : `${coverage}%`
                    }
                  />

                  <Metric
                    label="Next Stage"
                    value={
                      candidate
                        ?.qualification2
                        ?.nextStage ??
                      candidate
                        ?.qualification2Readiness
                        ?.nextStage ??
                      "—"
                    }
                  />
                </div>

                <div
                  className="crypto-engines-summary-body"
                >
                  <div
                    className="crypto-engines-summary-copy"
                  >
                    <h3>
                      Engine consensus
                    </h3>

                    <p>
                      {totalScore ===
                      null
                        ? "The current research result does not contain enough canonical evidence to calculate a complete research score."
                        : direction ===
                          "LONG"
                          ? `Available research evidence currently supports a LONG direction with a canonical score of ${formatScore(totalScore)}/100.`
                          : direction ===
                            "SHORT"
                            ? `Available research evidence currently supports a SHORT direction with a canonical score of ${formatScore(totalScore)}/100.`
                            : `The current research result is NO_TRADE with a canonical score of ${formatScore(totalScore)}/100. The architecture has not authorized a directional conclusion.`}
                    </p>
                  </div>

                  <div
                    className="crypto-engines-summary-safety"
                  >
                    <ShieldCheck
                      size={18}
                    />

                    <div>
                      <strong>
                        Paper architecture
                      </strong>

                      <span>
                        Live execution
                        disabled
                      </span>
                    </div>
                  </div>
                </div>
              </section>

              <ValuationLab
                candidate={candidate}
              />
            </>
          )}
        </div>
      </main>

      <CriteriaDrawer
        definition={
          selectedEngine
        }
        candidate={
          candidate
        }
        onClose={() =>
          setSelectedEngine(
            null,
          )
        }
      />
    </div>
  );
}
