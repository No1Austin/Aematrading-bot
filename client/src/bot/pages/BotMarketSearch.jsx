import {
  Activity,
  AlertTriangle,
  Calculator,
  ChevronDown,
  ChevronUp,
  Eye,
  Radar,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";

import { useEffect, useState } from "react";

import BotSidebar from "../components/BotSidebar.jsx";

import {
  calculateSetupScenario,
  monitorSetup,
  searchBotMarket,
} from "../services/botApi.js";

import {
  directionOf,
  finite,
  fmt,
  money,
  pct,
  scoreOf,
  setupIdOf,
  setupOf,
} from "../components/ResearchUi.jsx";

import "./BotMarketSearch.css";


/* =========================================================
   SESSION STORAGE
   ========================================================= */

const SEARCH_STORAGE_KEY = "aema-private-market-search";
const SETUP_UI_STORAGE_KEY = "aema-private-market-search-ui";


function loadStoredSearch() {
  try {
    const saved = sessionStorage.getItem(SEARCH_STORAGE_KEY);

    if (!saved) {
      return null;
    }

    return JSON.parse(saved);
  } catch (error) {
    console.error(
      "[AEMA BOT] Failed to restore previous market search:",
      error
    );

    return null;
  }
}


function saveStoredSearch(result) {
  try {
    sessionStorage.setItem(
      SEARCH_STORAGE_KEY,
      JSON.stringify(result)
    );
  } catch (error) {
    console.error(
      "[AEMA BOT] Failed to save market search:",
      error
    );
  }
}


function loadSetupUiState() {
  try {
    const saved = sessionStorage.getItem(
      SETUP_UI_STORAGE_KEY
    );

    if (!saved) {
      return {};
    }

    return JSON.parse(saved);
  } catch {
    return {};
  }
}


function saveSetupUiState(setupId, state) {
  if (!setupId) {
    return;
  }

  try {
    const current = loadSetupUiState();

    current[setupId] = {
      ...(current[setupId] || {}),
      ...state,
    };

    sessionStorage.setItem(
      SETUP_UI_STORAGE_KEY,
      JSON.stringify(current)
    );
  } catch (error) {
    console.error(
      "[AEMA BOT] Failed to save setup UI state:",
      error
    );
  }
}


function clearSetupUiState() {
  try {
    sessionStorage.removeItem(
      SETUP_UI_STORAGE_KEY
    );
  } catch {
    // Nothing required.
  }
}


/* =========================================================
   HELPERS
   ========================================================= */

const count = (x, k) =>
  x?.counts?.[k] ?? "—";


/* =========================================================
   MARKET SEARCH PAGE
   ========================================================= */

export default function BotMarketSearch() {

  /*
   * IMPORTANT:
   *
   * Search results are initialized from sessionStorage.
   *
   * This means navigating to:
   *
   * Monitoring
   * Legacy Controls
   * Legacy History
   *
   * will NOT destroy the latest search.
   */

  const [result, setResult] = useState(
    () => loadStoredSearch()
  );

  const [busy, setBusy] = useState(false);

  const [error, setError] = useState("");


  /* -------------------------------------------------------
     MARKET SEARCH
     ------------------------------------------------------- */

  const run = async () => {

    setBusy(true);
    setError("");

    try {

      const data = await searchBotMarket({});

      /*
       * Only replace the existing search AFTER
       * the new search successfully completes.
       *
       * Therefore, if the request fails, the previous
       * market search remains visible.
       */

      setResult(data);

      saveStoredSearch(data);

      /*
       * A new market search represents a new research
       * snapshot, so old card/scenario UI state should
       * not carry into the new search.
       */

      clearSetupUiState();

    } catch (e) {

      const message =
        e?.message === "BOT_RUNTIME_BUSY_RETRY"
          ? "Position manager is busy. Try Search Market again in a moment."
          : e?.message || "Market search failed.";

      setError(message);

    } finally {

      setBusy(false);

    }
  };


  /* -------------------------------------------------------
     RESULTS
     ------------------------------------------------------- */

  const setups =
    Array.isArray(result?.setups)
      ? result.setups
      : [];

  const noSetup =
    Array.isArray(result?.noSetup)
      ? result.noSetup
      : [];


  return (
    <div className="bot-app">

      <BotSidebar />

      <main className="market-search">

        {/* =================================================
            HEADER
            ================================================= */}

        <header className="market-search-head">

          <div>

            <span>
              ON-DEMAND FUTURES RESEARCH
            </span>

            <h1>
              Search Market
            </h1>

            <p>
              Searches only when you request it.
              It does not place an order.
            </p>

          </div>


          <button
            className="search-market-button"
            disabled={busy}
            onClick={run}
          >

            {busy ? (
              <RefreshCw
                className="spin"
                size={18}
              />
            ) : (
              <Radar size={18} />
            )}

            {busy
              ? "Researching market…"
              : result
                ? "Search Market Again"
                : "Search Market"}

          </button>

        </header>


        {/* =================================================
            ERROR
            ================================================= */}

        {error && (

          <div className="search-error">

            <AlertTriangle size={16} />

            <div>

              <strong>
                Search failed
              </strong>

              <span>
                {error}
              </span>

            </div>

          </div>

        )}


        {/* =================================================
            EMPTY STATE
            ================================================= */}

        {!result && !busy && (

          <section className="search-empty">

            <Radar size={42} />

            <h2>
              Ready for a new market search
            </h2>

            <p>
              The existing automatic AEMA discovery engine
              remains separate. This button starts the private
              futures setup pipeline.
            </p>

          </section>

        )}


        {/* =================================================
            SEARCH IN PROGRESS
            ================================================= */}

        {busy && (

          <section className="search-progress">

            <div className="search-pulse">

              <Radar size={30} />

            </div>

            <div>

              <span>
                RESEARCH IN PROGRESS
              </span>

              <h2>
                Evaluating futures opportunities
              </h2>

              <p>
                Universe → eligibility → Top 20 →
                engines → direction → setup quality.
              </p>

              {result && (
                <small>
                  Your previous search is being preserved
                  until this search completes.
                </small>
              )}

            </div>

          </section>

        )}


        {/* =================================================
            KEEP OLD RESULT VISIBLE WHILE NEW SEARCH RUNS
            ================================================= */}

        {result && (

          <>

            {/* =============================================
                SEARCH SUMMARY
                ============================================= */}

            <section className="search-summary">

              <div>

                <span>
                  SEARCH STATUS
                </span>

                <strong>
                  {result.status || "COMPLETE"}
                </strong>

              </div>


              <Metric
                l="Universe"
                v={count(result, "universe")}
              />


              <Metric
                l="Eligible"
                v={count(result, "hardEligible")}
              />


              <Metric
                l="Top 20"
                v={count(result, "top20")}
              />


              <Metric
                l="Researched"
                v={count(result, "researchCompleted")}
              />


              <Metric
                l="Direction qualified"
                v={count(result, "directionQualified")}
              />


              <Metric
                l="Qualified setups"
                v={count(result, "qualifiedSetups")}
              />

            </section>


            {/* =============================================
                QUALIFIED RESULTS TITLE
                ============================================= */}

            <div className="search-section-title">

              <div>

                <span>
                  QUALIFIED RESULTS
                </span>

                <h2>

                  {setups.length
                    ? `${setups.length} setup${
                        setups.length === 1
                          ? ""
                          : "s"
                      } found`
                    : "No qualified setup"}

                </h2>

              </div>

              <ShieldCheck size={19} />

            </div>


            {/* =============================================
                QUALIFIED SETUPS
                ============================================= */}

            {setups.length ? (

              <section className="setup-list">

                {setups.map((candidate, index) => (

                  <SetupCard
                    key={
                      setupIdOf(candidate) ||
                      `${candidate?.symbol || "setup"}-${index}`
                    }
                    candidate={candidate}
                  />

                ))}

              </section>

            ) : (

              <section className="no-qualified">

                <ShieldCheck size={30} />

                <h3>
                  No setup passed every gate.
                </h3>

                <p>
                  This is a successful research outcome,
                  not an engine failure. Review rejected
                  candidates below without weakening
                  thresholds yet.
                </p>

              </section>

            )}


            {/* =============================================
                REJECTED CANDIDATES
                ============================================= */}

            <Rejected rows={noSetup} />

          </>

        )}

      </main>

    </div>
  );
}


/* =========================================================
   SUMMARY METRIC
   ========================================================= */

function Metric({ l, v }) {

  return (
    <article>

      <span>
        {l}
      </span>

      <strong>
        {v}
      </strong>

    </article>
  );
}


/* =========================================================
   SETUP CARD
   ========================================================= */

function SetupCard({ candidate }) {

  const setup = setupOf(candidate);

  const id = setupIdOf(candidate);

  const direction =
    directionOf(candidate);


  /*
   * Restore this setup's UI state.
   */

  const savedUi =
    id
      ? loadSetupUiState()[id] || {}
      : {};


  const [open, setOpen] =
    useState(Boolean(savedUi.open));


  const [capital, setCapital] =
    useState(
      savedUi.capital ?? "1000"
    );


  const [lev, setLev] =
    useState(
      savedUi.leverage ?? "2"
    );


  const [scenario, setScenario] =
    useState(
      savedUi.scenario ?? null
    );


  const [msg, setMsg] =
    useState(
      savedUi.message ?? ""
    );


  const [busy, setBusy] =
    useState("");


  /* -------------------------------------------------------
     SAVE CARD STATE
     ------------------------------------------------------- */

  useEffect(() => {

    if (!id) {
      return;
    }

    saveSetupUiState(
      id,
      {
        open,
        capital,
        leverage: lev,
        scenario,
        message: msg,
      }
    );

  }, [
    id,
    open,
    capital,
    lev,
    scenario,
    msg,
  ]);


  /* -------------------------------------------------------
     POSITION CALCULATOR
     ------------------------------------------------------- */

  const calc = async () => {

    if (!id) {

      setMsg(
        "Setup ID unavailable in backend response."
      );

      return;
    }


    try {

      setBusy("calc");

      setMsg("");


      const response =
        await calculateSetupScenario(
          id,
          {
            capitalUsd:
              Number(capital),

            leverage:
              Number(lev),
          }
        );


      setScenario(
        response?.scenario ??
        response
      );

    } catch (e) {

      setMsg(
        e?.message ||
        "Unable to calculate position scenario."
      );

    } finally {

      setBusy("");

    }
  };


  /* -------------------------------------------------------
     MONITOR SETUP
     ------------------------------------------------------- */

  const monitor = async () => {

    if (!id) {

      setMsg(
        "Setup ID unavailable in backend response."
      );

      return;
    }


    try {

      setBusy("monitor");

      setMsg("");


      await monitorSetup(
        id,
        {
          capitalUsd:
            Number(capital),

          leverage:
            Number(lev),
        }
      );


      setMsg(
        "Monitoring started."
      );

    } catch (e) {

      setMsg(
        e?.message ||
        "Unable to start monitoring."
      );

    } finally {

      setBusy("");

    }
  };


  return (

    <article
      className={
        `setup-card ${
          direction
            .toLowerCase()
            .replaceAll(" ", "-")
        }`
      }
    >

      {/* ===============================================
          SETUP HEADER
          =============================================== */}

      <div className="setup-top">

        <div>

          <span
            className={
              `direction ${
                direction === "BULL"
                  ? "bull"
                  : direction === "BEAR"
                    ? "bear"
                    : "neutral"
              }`
            }
          >

            {direction}

          </span>


          <h3>

            {candidate?.symbol ||
              setup?.symbol ||
              "Unknown symbol"}

          </h3>


          <small>

            {setup?.exchange ||
              candidate?.exchange ||
              "BYBIT"}

            {" · "}

            PERPETUAL

          </small>

        </div>


        <div className="setup-score">

          <span>
            SETUP QUALITY
          </span>

          <strong>

            {scoreOf(candidate) ?? "—"}

          </strong>

        </div>

      </div>


      {/* ===============================================
          SETUP LEVELS
          =============================================== */}

      <div className="setup-levels">

        <Level
          l="Entry"
          v={fmt(
            setup?.entry ??
            setup?.entryPrice,
            8
          )}
        />


        <Level
          l="Stop"
          v={fmt(
            setup?.stop ??
            setup?.stopPrice,
            8
          )}
        />


        <Level
          l="Target"
          v={fmt(
            setup?.target ??
            setup?.targetPrice,
            8
          )}
        />


        <Level
          l="Risk : Reward"
          v={
            finite(
              setup?.riskReward
            ) === null

              ? "Unavailable"

              : `${fmt(
                  setup?.riskReward,
                  2
                )} R`
          }
        />


        <Level
          l="Spread"
          v={pct(
            setup?.spreadPercent
          )}
        />


        <Level
          l="Confidence"
          v={pct(
            candidate
              ?.directionDecision
              ?.confidence ??
            candidate?.confidence
          )}
        />

      </div>


      {/* ===============================================
          EXPAND BUTTON
          =============================================== */}

      <button
        className="setup-expand"
        onClick={() =>
          setOpen(value => !value)
        }
      >

        {open ? (
          <ChevronUp size={15} />
        ) : (
          <ChevronDown size={15} />
        )}


        {open
          ? "Hide scenario"
          : "Position scenario & monitoring"}

      </button>


      {/* ===============================================
          SCENARIO PANEL
          =============================================== */}

      {open && (

        <div className="scenario-panel">

          <div className="scenario-inputs">

            <label>

              Trade capital (USD)

              <input
                type="number"
                min="0"
                step="10"
                value={capital}
                onChange={e =>
                  setCapital(
                    e.target.value
                  )
                }
              />

            </label>


            <label>

              Leverage

              <input
                type="number"
                min="1"
                step="1"
                value={lev}
                onChange={e =>
                  setLev(
                    e.target.value
                  )
                }
              />

            </label>


            <button
              onClick={calc}
              disabled={
                busy === "calc"
              }
            >

              <Calculator size={15} />

              {busy === "calc"
                ? "Calculating…"
                : "Calculate"}

            </button>


            <button
              className="monitor-button"
              onClick={monitor}
              disabled={
                busy === "monitor"
              }
            >

              <Eye size={15} />

              {busy === "monitor"
                ? "Starting…"
                : "Monitor setup"}

            </button>

          </div>


          {/* =============================================
              CALCULATED POSITION
              ============================================= */}

          {scenario && (
  <div className="scenario-results">

    <Level
      l="Exposure"
      v={money(scenario?.exposureUsd)}
    />

    <Level
      l="Quantity"
      v={fmt(scenario?.quantity, 8)}
    />

    <Level
      l="Loss at stop"
      v={money(scenario?.stop?.netPnlUsd)}
    />

    <Level
      l="Profit at target"
      v={money(scenario?.targets?.[0]?.netPnlUsd)}
    />

    <Level
      l="Estimated fees"
      v={money(scenario?.targets?.[0]?.estimatedFeesUsd)}
    />

    <Level
      l="Capital impact"
      v={pct(scenario?.targets?.[0]?.capitalImpactPercent)}
    />

  </div>
)}
          {msg && (

            <div className="scenario-message">

              {msg}

            </div>

          )}

        </div>

      )}

    </article>
  );
}


/* =========================================================
   LEVEL
   ========================================================= */

function Level({ l, v }) {

  return (

    <div className="setup-level">

      <span>
        {l}
      </span>

      <strong>
        {v}
      </strong>

    </div>

  );
}


/* =========================================================
   REJECTED / NO SETUP
   ========================================================= */

function Rejected({ rows }) {

  const [open, setOpen] =
    useState(false);


  if (!rows.length) {
    return null;
  }


  return (

    <section className="rejected">

      <button
        onClick={() =>
          setOpen(value => !value)
        }
      >

        <div>

          <span>
            REJECTED / NO SETUP
          </span>

          <strong>

            {rows.length} candidates

          </strong>

        </div>


        {open ? (
          <ChevronUp size={17} />
        ) : (
          <ChevronDown size={17} />
        )}

      </button>


      {open && (

        <div className="rejected-list">

          {rows.map(
            (candidate, index) => (

              <div
                key={
                  `${
                    candidate?.symbol ||
                    "candidate"
                  }-${index}`
                }
              >

                <strong>

                  {candidate?.symbol ||
                    "Unknown"}

                </strong>


                <span>

                  {directionOf(
                    candidate
                  )}

                </span>


                <small>

                  {(
                    candidate?.blockers ||
                    candidate?.reasons ||
                    candidate
                      ?.directionDecision
                      ?.blockers ||
                    [
                      "Did not pass setup qualification",
                    ]
                  ).join(" · ")}

                </small>

              </div>

            )
          )}

        </div>

      )}

    </section>

  );
}