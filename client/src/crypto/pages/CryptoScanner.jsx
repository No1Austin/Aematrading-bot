// client/src/crypto/pages/CryptoScanner.jsx

import {
  Activity,
  CandlestickChart,
  ChevronRight,
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
  Sun,
  Waves,
} from "lucide-react";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  scanCryptoToken,
} from "../services/cryptoApi.js";

import CryptoSidebar from
  "../components/CryptoSidebar.jsx";

import WorkspaceJumpButton from
  "../../components/WorkspaceJumpButton.jsx";

import "./CryptoScanner.css";


const CRYPTO_SCAN_STORAGE_KEY =
  "aema-crypto-last-scan";

const CRYPTO_SCAN_QUERY_STORAGE_KEY =
  "aema-crypto-last-scan-query";

const CRYPTO_SCAN_TIMEFRAME_STORAGE_KEY =
  "aema-crypto-last-scan-timeframe";


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


function readStoredJson(
  key,
) {
  try {
    const raw =
      window.localStorage.getItem(
        key,
      );

    return raw
      ? JSON.parse(
          raw,
        )
      : null;
  } catch {
    return null;
  }
}


function normalizeBaseSymbol(
  value,
) {
  const upper =
    String(
      value ??
      "",
    )
      .trim()
      .toUpperCase()
      .replace(
        /[^A-Z0-9]/g,
        "",
      );

  if (!upper) {
    return "";
  }

  const knownQuotes = [
    "USDT",
    "USDC",
    "USD",
    "CAD",
    "EUR",
    "GBP",
    "BTC",
    "ETH",
  ];

  for (
    const quote
    of knownQuotes
  ) {
    if (
      upper.endsWith(
        quote,
      ) &&
      upper.length >
        quote.length
    ) {
      return upper.slice(
        0,
        -quote.length,
      );
    }
  }

  return upper;
}


function buildTradingViewSymbol(
  result,
  fallbackQuery,
) {
  const rawSymbol =
    result
      ?.symbol ??
    result
      ?.asset
      ?.symbol ??
    fallbackQuery;

  const baseSymbol =
    normalizeBaseSymbol(
      rawSymbol,
    );

  if (!baseSymbol) {
    return null;
  }

  const primaryVenue =
    String(
      result
        ?.venue ??
      result
        ?.asset
        ?.venues
        ?.primaryVenue ??
      "",
    )
      .trim()
      .toUpperCase();

  if (
    primaryVenue ===
    "COINBASE"
  ) {
    return `COINBASE:${baseSymbol}USD`;
  }

  if (
    primaryVenue ===
    "KRAKEN"
  ) {
    return `KRAKEN:${baseSymbol}USD`;
  }

  if (
    primaryVenue ===
    "BINANCE"
  ) {
    return `BINANCE:${baseSymbol}USDT`;
  }

  return `BINANCE:${baseSymbol}USDT`;
}


function timeframeToTradingViewInterval(
  timeframe,
) {
  switch (
    timeframe
  ) {
    case "5M":
      return "5";

    case "15M":
      return "15";

    case "4H":
      return "240";

    case "1D":
      return "D";

    case "1H":
    default:
      return "60";
  }
}


function TradingViewCryptoChart({
  result,
  query,
  timeframe,
  theme,
}) {
  const containerRef =
    useRef(null);

  const tradingViewSymbol =
    useMemo(
      () =>
        buildTradingViewSymbol(
          result,
          query,
        ),
      [
        result,
        query,
      ],
    );

  const interval =
    timeframeToTradingViewInterval(
      timeframe,
    );


  useEffect(
    () => {
      const container =
        containerRef.current;

      if (
        !container ||
        !tradingViewSymbol
      ) {
        return undefined;
      }

      container.replaceChildren();

      /*
       * Keep the TradingView script attached to its own mount node.
       * If React cleans up while the async script is still loading,
       * the script retains a valid parent and cannot call querySelector
       * on null after it finishes downloading.
       */
      const mountRoot =
        document.createElement(
          "div",
        );

      mountRoot.className =
        "tradingview-widget-container";

      mountRoot.style.height =
        "100%";

      mountRoot.style.width =
        "100%";

      const widgetRoot =
        document.createElement(
          "div",
        );

      widgetRoot.className =
        "tradingview-widget-container__widget";

      widgetRoot.style.height =
        "100%";

      widgetRoot.style.width =
        "100%";

      mountRoot.appendChild(
        widgetRoot,
      );

      const script =
        document.createElement(
          "script",
        );

      script.src =
        "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";

      script.type =
        "text/javascript";

      script.async =
        true;

      script.text =
        JSON.stringify({
          autosize:
            true,

          symbol:
            tradingViewSymbol,

          interval,

          timezone:
            "Etc/UTC",

          theme:
            theme === "light"
              ? "light"
              : "dark",

          style:
            "1",

          locale:
            "en",

          allow_symbol_change:
            false,

          calendar:
            false,

          support_host:
            "https://www.tradingview.com",

          // Keep TradingView's native drawing/analysis toolbar visible.
          hide_side_toolbar:
            false,

          // Keep the date-range/navigation controls.
          withdateranges:
            true,

          // Keep the native snapshot control available.
          save_image:
            true,

          // Keep the right-side information panels available.
          details:
            true,

          hotlist:
            true,

          // Publishing remains disabled; this is a research workspace.
          enable_publishing:
            false,
        });

      mountRoot.appendChild(
        script,
      );

      container.appendChild(
        mountRoot,
      );

      return () => {
        if (
          mountRoot.parentNode ===
          container
        ) {
          container.removeChild(
            mountRoot,
          );
        }
      };
    },
    [
      tradingViewSymbol,
      interval,
      theme,
    ],
  );


  if (
    !result ||
    !tradingViewSymbol
  ) {
    return (
      <div
        className="crypto-scanner-chart-placeholder"
      >
        <CandlestickChart
          size={26}
        />

        <strong>
          Select an asset to begin
        </strong>

        <span>
          Run a token scan to load its
          interactive market chart.
        </span>
      </div>
    );
  }


  return (
    <div
      className="crypto-scanner-live-chart"
      style={{
        width:
          "100%",

        height:
          "100%",
      }}
    >
      <div
        ref={
          containerRef
        }
        className="tradingview-widget-container"
        style={{
          width:
            "100%",

          height:
            "100%",
        }}
      />
    </div>
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
    useState(() =>
      window.localStorage.getItem(
        CRYPTO_SCAN_QUERY_STORAGE_KEY,
      ) ??
      "",
    );


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
    useState(() =>
      readStoredJson(
        CRYPTO_SCAN_STORAGE_KEY,
      ),
    );


  const [
    timeframe,
    setTimeframe,
  ] =
    useState(() =>
      window.localStorage.getItem(
        CRYPTO_SCAN_TIMEFRAME_STORAGE_KEY,
      ) ??
      "1H",
    );


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


  useEffect(
    () => {
      window.localStorage.setItem(
        CRYPTO_SCAN_TIMEFRAME_STORAGE_KEY,
        timeframe,
      );
    },
    [
      timeframe,
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

        if (!symbol) {
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

          const body =
            await scanCryptoToken(
              symbol,
            );

          setResult(
            body,
          );

          window.localStorage.setItem(
            CRYPTO_SCAN_STORAGE_KEY,
            JSON.stringify(
              body,
            ),
          );

          window.localStorage.setItem(
            CRYPTO_SCAN_QUERY_STORAGE_KEY,
            symbol,
          );
        } catch (
          requestError
        ) {
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


  const lastScanTime =
    result
      ?.timestamp
      ? new Date(
          result.timestamp,
        )
          .toLocaleTimeString()
      : "—";


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
                <Sun
                  size={17}
                />
              ) : (
                <Moon
                  size={17}
                />
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

              <div
                className="crypto-scanner-chart-summary"
              >
                <div
                  className="crypto-scanner-chart-score"
                >
                  <span>
                    Research Score
                  </span>

                  <strong
                    className={
                      overallTone
                    }
                  >
                    {overallScore == null
                      ? "—"
                      : Math.round(
                          overallScore,
                        )}

                    <small>
                      /100
                    </small>
                  </strong>
                </div>

                <div
                  className="crypto-scanner-chart-signal"
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

                <CandlestickChart
                  size={19}
                />
              </div>
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
                title="Use the chart toolbar to add indicators"
              >
                Indicators
              </button>

              <button
                type="button"
                title="Use the chart drawing toolbar"
              >
                Draw
              </button>
            </div>

            <TradingViewCryptoChart
              result={
                result
              }
              query={
                query
              }
              timeframe={
                timeframe
              }
              theme={
                theme
              }
            />
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
                  result
                    ?.asset
                    ?.venues
                    ?.primaryVenue ??
                  "—"}
                </strong>
              </div>

              <div>
                <span>
                  Market Type
                </span>

                <strong>
                  {result
                    ?.marketType &&
                  result
                    .marketType !==
                    "UNKNOWN"
                    ? result
                        .marketType
                    : (
                        (
                          result
                            ?.asset
                            ?.venues
                            ?.dexCount ??
                          0
                        ) > 0
                          ? "DEX / MULTI-VENUE"
                          : (
                              result
                                ?.asset
                                ?.venues
                                ?.cexCount ??
                              0
                            ) > 0
                            ? "CEX"
                            : "—"
                      )}
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
                  {lastScanTime}
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
                    ?.completeness !=
                  null
                    ? `${result
                        .availability
                        .completeness}%`
                    : "—"}
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
