// client/src/crypto/pages/CryptoPositions.jsx

import {
  ArrowDownRight,
  ArrowUpRight,
  Moon,
  RefreshCw,
  Sun,
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
  getCryptoPositions,
} from "../services/cryptoApi.js";

import "./CryptoPositions.css";


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


function formatNumber(
  value,
  maximumFractionDigits = 6,
) {
  return new Intl.NumberFormat(
    "en-CA",
    {
      maximumFractionDigits,
    },
  ).format(
    numberOrZero(value),
  );
}


function normalizeDirection(
  direction,
) {
  const normalized =
    String(
      direction ?? "",
    )
      .trim()
      .toUpperCase();

  if (
    normalized === "LONG" ||
    normalized === "SHORT"
  ) {
    return normalized;
  }

  return "FLAT";
}


function directionTone(
  direction,
) {
  const normalized =
    normalizeDirection(
      direction,
    );

  if (
    normalized === "LONG"
  ) {
    return "bull";
  }

  if (
    normalized === "SHORT"
  ) {
    return "bear";
  }

  return "neutral";
}


function PositionDirection({
  direction,
}) {
  const normalized =
    normalizeDirection(
      direction,
    );

  const tone =
    directionTone(
      normalized,
    );

  return (
    <span
      className={`crypto-positions-direction ${tone}`}
    >
      {tone === "bull" ? (
        <ArrowUpRight
          size={13}
        />
      ) : null}

      {tone === "bear" ? (
        <ArrowDownRight
          size={13}
        />
      ) : null}

      {normalized}
    </span>
  );
}


export default function CryptoPositions() {
  const [
    positions,
    setPositions,
  ] =
    useState([]);

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


  const loadPositions =
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

          const response =
            await getCryptoPositions();

          setPositions(
            Array.isArray(
              response
                ?.positions,
            )
              ? response.positions
              : [],
          );

          setLastUpdated(
            new Date(),
          );
        } catch (requestError) {
          setError(
            requestError
              ?.message ??
            "Unable to load crypto positions.",
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
      void loadPositions();
    },
    [
      loadPositions,
    ],
  );


  const summary =
    useMemo(
      () => {
        let longCount =
          0;

        let shortCount =
          0;

        let totalQuantity =
          0;

        let totalExposure =
          0;

        for (
          const position
          of positions
        ) {
          const direction =
            normalizeDirection(
              position
                ?.direction,
            );

          if (
            direction ===
            "LONG"
          ) {
            longCount += 1;
          }

          if (
            direction ===
            "SHORT"
          ) {
            shortCount += 1;
          }

          totalQuantity +=
            numberOrZero(
              position
                ?.quantity,
            );

          totalExposure +=
            numberOrZero(
              position
                ?.exposure,
            );
        }

        return {
          longCount,
          shortCount,
          totalQuantity,
          totalExposure,
        };
      },
      [
        positions,
      ],
    );


  if (loading) {
    return (
      <div
        className={`crypto-positions-shell crypto-theme-${theme}`}
      >
        <CryptoSidebar />

        <main
          className="crypto-positions-page"
        >
          <div
            className="crypto-positions-loading"
          >
            <RefreshCw
              size={22}
              className="spin"
            />

            <strong>
              Loading active positions
            </strong>

            <span>
              Reading current crypto exposure…
            </span>
          </div>
        </main>
      </div>
    );
  }


  return (
    <div
      className={`crypto-positions-shell crypto-theme-${theme}`}
    >
      <CryptoSidebar />

      <main
        className="crypto-positions-page"
      >
        <section
          className="crypto-positions-header"
        >
          <div
            className="crypto-positions-heading"
          >
            <span
              className="crypto-positions-eyebrow"
            >
              AEMA Crypto Intelligence
            </span>

            <h1>
              Active Positions
            </h1>

            <p>
              Monitor current crypto exposure,
              direction, entry state and protective
              levels from the paper runtime.
            </p>
          </div>

          <div
            className="crypto-positions-header-actions"
          >
            <div
              className="crypto-positions-workspace-jump"
            >
              <WorkspaceJumpButton
                target="stocks"
              />
            </div>

            <button
              type="button"
              className="crypto-positions-theme-toggle"
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
              className="crypto-positions-refresh"
              onClick={() =>
                void loadPositions({
                  manual:
                    true,
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
            className="crypto-positions-error"
          >
            <strong>
              Unable to refresh positions
            </strong>

            <span>
              {error}
            </span>
          </section>
        ) : null}


        <section
          className="crypto-positions-summary"
        >
          <article
            className="crypto-positions-stat"
          >
            <span>
              Open Positions
            </span>

            <strong>
              {positions.length}
            </strong>

            <small>
              Current runtime exposure
            </small>
          </article>

          <article
            className="crypto-positions-stat"
          >
            <span>
              Long
            </span>

            <strong
              className="bull"
            >
              {summary.longCount}
            </strong>

            <small>
              Bullish positions
            </small>
          </article>

          <article
            className="crypto-positions-stat"
          >
            <span>
              Short
            </span>

            <strong
              className="bear"
            >
              {summary.shortCount}
            </strong>

            <small>
              Bearish positions
            </small>
          </article>

          <article
            className="crypto-positions-stat"
          >
            <span>
              Total Quantity
            </span>

            <strong>
              {formatNumber(
                summary
                  .totalQuantity,
                6,
              )}
            </strong>

            <small>
              Across all positions
            </small>
          </article>

          <article
            className="crypto-positions-stat"
          >
            <span>
              Total Exposure
            </span>

            <strong>
              {formatNumber(
                summary
                  .totalExposure,
                4,
              )}
            </strong>

            <small>
              Runtime exposure value
            </small>
          </article>
        </section>


        <section
          className="crypto-positions-panel"
        >
          <div
            className="crypto-positions-panel-heading"
          >
            <div>
              <span>
                Portfolio
              </span>

              <h2>
                Position Book
              </h2>
            </div>

            <div
              className="crypto-positions-panel-meta"
            >
              <span>
                {positions.length}
              </span>

              <WalletCards
                size={19}
              />
            </div>
          </div>


          {positions.length === 0 ? (
            <div
              className="crypto-positions-empty"
            >
              <div
                className="crypto-positions-empty-dot"
              />

              <strong>
                No active positions
              </strong>

              <span>
                The crypto paper runtime currently
                has no open exposure.
              </span>
            </div>
          ) : (
            <>
              <div
                className="crypto-positions-table-wrap"
              >
                <table
                  className="crypto-positions-table"
                >
                  <thead>
                    <tr>
                      <th>
                        Asset
                      </th>

                      <th>
                        Direction
                      </th>

                      <th>
                        Quantity
                      </th>

                      <th>
                        Entry
                      </th>

                      <th>
                        Exposure
                      </th>

                      <th>
                        Stop
                      </th>

                      <th>
                        Lifecycle
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {positions.map(
                      (
                        position,
                        index,
                      ) => (
                        <tr
                          key={
                            position
                              ?.symbol ??
                            `position-${index}`
                          }
                        >
                          <td>
                            <div
                              className="crypto-positions-asset"
                            >
                              <strong>
                                {position
                                  ?.symbol ??
                                "—"}
                              </strong>

                              <span>
                                Crypto
                              </span>
                            </div>
                          </td>

                          <td>
                            <PositionDirection
                              direction={
                                position
                                  ?.direction
                              }
                            />
                          </td>

                          <td>
                            {formatNumber(
                              position
                                ?.quantity,
                            )}
                          </td>

                          <td>
                            {position
                              ?.averageEntryPrice !=
                            null
                              ? formatCurrency(
                                  position
                                    ?.averageEntryPrice,
                                )
                              : "—"}
                          </td>

                          <td>
                            {formatNumber(
                              position
                                ?.exposure,
                              4,
                            )}
                          </td>

                          <td>
                            {position
                              ?.stopPrice !=
                            null
                              ? formatCurrency(
                                  position
                                    ?.stopPrice,
                                )
                              : "—"}
                          </td>

                          <td>
                            <span
                              className="crypto-positions-state"
                            >
                              {position
                                ?.lifecycleState ??
                              "OPEN"}
                            </span>
                          </td>
                        </tr>
                      ),
                    )}
                  </tbody>
                </table>
              </div>


              <div
                className="crypto-positions-mobile-list"
              >
                {positions.map(
                  (
                    position,
                    index,
                  ) => (
                    <article
                      key={
                        position
                          ?.symbol ??
                        `mobile-position-${index}`
                      }
                      className="crypto-position-mobile-card"
                    >
                      <div
                        className="crypto-position-mobile-head"
                      >
                        <div>
                          <strong>
                            {position
                              ?.symbol ??
                            "—"}
                          </strong>

                          <span>
                            {position
                              ?.lifecycleState ??
                            "OPEN"}
                          </span>
                        </div>

                        <PositionDirection
                          direction={
                            position
                              ?.direction
                          }
                        />
                      </div>

                      <div
                        className="crypto-position-mobile-grid"
                      >
                        <div>
                          <span>
                            Quantity
                          </span>

                          <strong>
                            {formatNumber(
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
                            {position
                              ?.averageEntryPrice !=
                            null
                              ? formatCurrency(
                                  position
                                    ?.averageEntryPrice,
                                )
                              : "—"}
                          </strong>
                        </div>

                        <div>
                          <span>
                            Exposure
                          </span>

                          <strong>
                            {formatNumber(
                              position
                                ?.exposure,
                              4,
                            )}
                          </strong>
                        </div>

                        <div>
                          <span>
                            Stop
                          </span>

                          <strong>
                            {position
                              ?.stopPrice !=
                            null
                              ? formatCurrency(
                                  position
                                    ?.stopPrice,
                                )
                              : "—"}
                          </strong>
                        </div>
                      </div>
                    </article>
                  ),
                )}
              </div>
            </>
          )}
        </section>


        <footer
          className="crypto-positions-footer"
        >
          <span>
            Crypto research workspace
          </span>

          <span>
            Paper execution only
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
