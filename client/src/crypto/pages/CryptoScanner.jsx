// client/src/crypto/pages/CryptoScanner.jsx

import {
  Activity,
  BarChart3,
  CandlestickChart,
  ChevronRight,
  Clock3,
  Droplets,
  Gauge,
  Globe2,
  Megaphone,
  Moon,
  Newspaper,
  Radar,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Sun,
  Waves,
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

import "./CryptoScanner.css";


const ENGINE_DEFINITIONS = [
  {
    key:
      "momentum",

    label:
      "Momentum",

    icon:
      Activity,

    description:
      "Trend strength, velocity and multi-timeframe price behavior.",
  },

  {
    key:
      "liquidity",

    label:
      "Liquidity",

    icon:
      Droplets,

    description:
      "Depth, spread, volume quality and execution conditions.",
  },

  {
    key:
      "onChain",

    label:
      "On-Chain",

    icon:
      Globe2,

    description:
      "Wallet, holder, flow and blockchain activity evidence.",
  },

  {
    key:
      "narrative",

    label:
      "Narrative",

    icon:
      Megaphone,

    description:
      "Narrative strength, market attention and thematic relevance.",
  },

  {
    key:
      "news",

    label:
      "News",

    icon:
      Newspaper,

    description:
      "Current catalysts, events and information risk.",
  },

  {
    key:
      "risk",

    label:
      "Risk",

    icon:
      ShieldCheck,

    description:
      "Volatility, concentration, contract and structural risk.",
  },
];


function normalizeScore(
  value,
) {
  const number =
    Number(value);

  if (
    !Number.isFinite(number)
  ) {
    return null;
  }

  return Math.max(
    0,
    Math.min(
      100,
      number,
    ),
  );
}


function scoreTone(
  score,
) {
  if (
    score == null
  ) {
    return "neutral";
  }

  if (
    score >= 70
  ) {
    return "bull";
  }

  if (
    score <= 40
  ) {
    return "bear";
  }

  return "warning";
}


function scoreLabel(
  score,
) {
  if (
    score == null
  ) {
    return "Unavailable";
  }

  if (
    score >= 80
  ) {
    return "Strong";
  }

  if (
    score >= 65
  ) {
    return "Positive";
  }

  if (
    score >= 45
  ) {
    return "Neutral";
  }

  return "Weak";
}


function readEngineScore(
  result,
  key,
) {
  return normalizeScore(
    result
      ?.engines
      ?.[key]
      ?.score ??
    result
      ?.scores
      ?.[key] ??
    result
      ?.[key]
      ?.score,
  );
}


export default function CryptoScanner() {
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

  const [
    query,
    setQuery,
  ] =
    useState("");

  const [
    scanning,
    setScanning,
  ] =
    useState(false);

  const [
    error,
    setError,
  ] =
    useState(null);

  const [
    result,
    setResult,
  ] =
    useState(null);

  const [
    timeframe,
    setTimeframe,
  ] =
    useState("1H");


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


  const scanToken =
    useCallback(
      async event => {
        event
          ?.preventDefault?.();

        const symbol =
          query
            .trim();

        if (
          !symbol
        ) {
          setError(
            "Enter a token symbol, pair or contract address.",
          );

          return;
        }

        try {
          setScanning(
            true,
          );

          setError(
            null,
          );

          const response =
            await fetch(
              "/api/crypto/scanner/scan",
              {
                method:
                  "POST",

                headers: {
                  "Content-Type":
                    "application/json",
                },

                body:
                  JSON.stringify({
                    query:
                      symbol,
                  }),
              },
            );

          const body =
            await response
              .json()
              .catch(
                () => ({}),
              );

          if (
            !response.ok ||
            body
              ?.approved === false
          ) {
            throw new Error(
              body
                ?.error ??
              body
                ?.message ??
              body
                ?.blocker ??
              `Scanner request failed (${response.status}).`,
            );
          }

          setResult(
            body,
          );
        } catch (requestError) {
          setResult(
            null,
          );

          setError(
            requestError
              ?.message ??
            "Unable to scan this token.",
          );
        } finally {
          setScanning(
            false,
          );
        }
      },
      [
        query,
      ],
    );


  const overallScore =
    normalizeScore(
      result
        ?.overallScore ??
      result
        ?.score ??
      result
        ?.researchScore,
    );


  const overallTone =
    scoreTone(
      overallScore,
    );


  const normalizedSymbol =
    result
      ?.symbol ??
    result
      ?.asset
      ?.symbol ??
    query
      .trim()
      .toUpperCase();


  const engineRows =
    useMemo(
      () =>
        ENGINE_DEFINITIONS
          .map(
            engine => ({
              ...engine,

              score:
                readEngineScore(
                  result,
                  engine.key,
                ),
            }),
          ),
      [
        result,
      ],
    );


  return (
    <div
      className={`crypto-scanner-shell crypto-theme-${theme}`}
    >
      <CryptoSidebar />

      <main
        className="crypto-scanner-page"
      >
        <section
          className="crypto-scanner-header"
        >
          <div
            className="crypto-scanner-heading"
          >
            <span
              className="crypto-scanner-eyebrow"
            >
              AEMA Crypto Intelligence
            </span>

            <h1>
              Token Scanner
            </h1>

            <p>
              Scan a token, trading pair or contract
              against AEMA&apos;s crypto research engines
              and inspect the evidence in one workspace.
            </p>
          </div>

          <div
            className="crypto-scanner-header-actions"
          >
            <div
              className="crypto-scanner-workspace-jump"
            >
              <WorkspaceJumpButton
                target="stocks"
              />
            </div>

            <button
              type="button"
              className="crypto-scanner-theme-toggle"
              onClick={() =>
                setTheme(
                  current =>
                    current ===
                    "dark"
                      ? "light"
                      : "dark",
                )
              }
              aria-label={
                theme === "dark"
                  ? "Switch to light theme"
                  : "Switch to dark theme"
              }
            >
              {theme === "dark" ? (
                <Sun size={17} />
              ) : (
                <Moon size={17} />
              )}
            </button>
          </div>
        </section>


        <section
          className="crypto-scanner-search-panel"
        >
          <form
            className="crypto-scanner-search"
            onSubmit={
              scanToken
            }
          >
            <div
              className="crypto-scanner-search-input-wrap"
            >
              <Search
                size={18}
              />

              <input
                value={
                  query
                }
                onChange={
                  event =>
                    setQuery(
                      event
                        .target
                        .value,
                    )
                }
                placeholder="BTC, ETHUSDT, SOL, or contract address"
                autoComplete="off"
              />
            </div>

            <button
              type="submit"
              disabled={
                scanning
              }
            >
              {scanning ? (
                <RefreshCw
                  size={16}
                  className="spin"
                />
              ) : (
                <Radar
                  size={16}
                />
              )}

              <span>
                {scanning
                  ? "Scanning"
                  : "Run Scan"}
              </span>
            </button>
          </form>

          <div
            className="crypto-scanner-search-meta"
          >
            <span>
              CEX + DEX compatible
            </span>

            <span>
              Multi-engine research
            </span>

            <span>
              No execution authority
            </span>
          </div>
        </section>


        {error ? (
          <section
            className="crypto-scanner-error"
          >
            <strong>
              Scan unavailable
            </strong>

            <span>
              {error}
            </span>
          </section>
        ) : null}


        <section
          className="crypto-scanner-overview"
        >
          <article
            className="crypto-scanner-score-card"
          >
            <div
              className="crypto-scanner-card-heading"
            >
              <div>
                <span>
                  Research Score
                </span>

                <h2>
                  {normalizedSymbol ||
                    "No asset selected"}
                </h2>
              </div>

              <Sparkles
                size={19}
              />
            </div>

            <div
              className={`crypto-scanner-score ${overallTone}`}
            >
              <strong>
                {overallScore == null
                  ? "—"
                  : Math.round(
                      overallScore,
                    )}
              </strong>

              <span>
                /100
              </span>
            </div>

            <div
              className="crypto-scanner-score-footer"
            >
              <span>
                Signal
              </span>

              <strong
                className={
                  overallTone
                }
              >
                {scoreLabel(
                  overallScore,
                )}
              </strong>
            </div>
          </article>


          <article
            className="crypto-scanner-chart-panel"
          >
            <div
              className="crypto-scanner-card-heading"
            >
              <div>
                <span>
                  Technical View
                </span>

                <h2>
                  Analysis Chart
                </h2>
              </div>

              <CandlestickChart
                size={19}
              />
            </div>

            <div
              className="crypto-scanner-chart-toolbar"
            >
              {[
                "5M",
                "15M",
                "1H",
                "4H",
                "1D",
              ].map(
                item => (
                  <button
                    key={
                      item
                    }
                    type="button"
                    className={
                      timeframe ===
                      item
                        ? "active"
                        : ""
                    }
                    onClick={() =>
                      setTimeframe(
                        item,
                      )
                    }
                  >
                    {item}
                  </button>
                ),
              )}

              <span
                className="crypto-scanner-toolbar-divider"
              />

              <button
                type="button"
              >
                Indicators
              </button>

              <button
                type="button"
              >
                Draw
              </button>
            </div>

            <div
              className="crypto-scanner-chart-placeholder"
            >
              <BarChart3
                size={26}
              />

              <strong>
                {result
                  ? `${normalizedSymbol} chart`
                  : "Select an asset to begin"}
              </strong>

              <span>
                The interactive candlestick chart
                and drawing tools will mount here.
              </span>
            </div>
          </article>
        </section>


        <section
          className="crypto-scanner-engines"
        >
          <div
            className="crypto-scanner-section-heading"
          >
            <div>
              <span>
                Engine Analysis
              </span>

              <h2>
                Research Engines
              </h2>
            </div>

            <Gauge
              size={19}
            />
          </div>

          <div
            className="crypto-scanner-engine-grid"
          >
            {engineRows.map(
              ({
                key,
                label,
                icon: Icon,
                description,
                score,
              }) => {
                const tone =
                  scoreTone(
                    score,
                  );

                return (
                  <article
                    key={
                      key
                    }
                    className="crypto-scanner-engine-card"
                  >
                    <div
                      className="crypto-scanner-engine-top"
                    >
                      <span
                        className="crypto-scanner-engine-icon"
                      >
                        <Icon
                          size={17}
                        />
                      </span>

                      <span
                        className={`crypto-scanner-engine-score ${tone}`}
                      >
                        {score == null
                          ? "—"
                          : Math.round(
                              score,
                            )}
                      </span>
                    </div>

                    <strong>
                      {label}
                    </strong>

                    <p>
                      {description}
                    </p>

                    <div
                      className="crypto-scanner-engine-footer"
                    >
                      <span>
                        {scoreLabel(
                          score,
                        )}
                      </span>

                      <ChevronRight
                        size={14}
                      />
                    </div>
                  </article>
                );
              },
            )}
          </div>
        </section>


        <section
          className="crypto-scanner-lower-grid"
        >
          <article
            className="crypto-scanner-panel"
          >
            <div
              className="crypto-scanner-card-heading"
            >
              <div>
                <span>
                  Discovery
                </span>

                <h2>
                  Market Context
                </h2>
              </div>

              <Waves
                size={19}
              />
            </div>

            <div
              className="crypto-scanner-context-grid"
            >
              <div>
                <span>
                  Venue
                </span>

                <strong>
                  {result
                    ?.venue ??
                  result
                    ?.market
                    ?.venue ??
                  "—"}
                </strong>
              </div>

              <div>
                <span>
                  Market Type
                </span>

                <strong>
                  {result
                    ?.marketType ??
                  result
                    ?.market
                    ?.type ??
                  "—"}
                </strong>
              </div>

              <div>
                <span>
                  Availability
                </span>

                <strong>
                  {result
                    ?.availability
                    ?.status ??
                  "—"}
                </strong>
              </div>

              <div>
                <span>
                  Last Scan
                </span>

                <strong>
                  {result
                    ? new Date()
                        .toLocaleTimeString()
                    : "—"}
                </strong>
              </div>
            </div>
          </article>


          <article
            className="crypto-scanner-panel"
          >
            <div
              className="crypto-scanner-card-heading"
            >
              <div>
                <span>
                  Integrity
                </span>

                <h2>
                  Research State
                </h2>
              </div>

              <ShieldCheck
                size={19}
              />
            </div>

            <div
              className="crypto-scanner-integrity-list"
            >
              <div>
                <span>
                  Data availability
                </span>

                <strong>
                  {result
                    ?.availability
                    ?.status ??
                  "Not scanned"}
                </strong>
              </div>

              <div>
                <span>
                  Evidence completeness
                </span>

                <strong>
                  {result
                    ?.availability
                    ?.completeness ??
                  "—"}
                </strong>
              </div>

              <div>
                <span>
                  Execution authority
                </span>

                <strong>
                  NONE
                </strong>
              </div>
            </div>
          </article>
        </section>
      </main>
    </div>
  );
}
