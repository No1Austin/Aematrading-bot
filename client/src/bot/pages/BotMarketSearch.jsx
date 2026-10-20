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

const STRATEGIES = [
  "TREND_PULLBACK", "BREAKOUT_RETEST", "LIQUIDITY_SWEEP",
  "MOMENTUM_BREAKOUT", "RANGE_ROTATION",
];

function readableReason(value) {
  if (Array.isArray(value)) return value.map(readableReason).filter(Boolean).join(" · ");
  if (typeof value === "string") return value;
  if (value && typeof value === "object") return value.code || value.reason || value.message || JSON.stringify(value);
  return "";
}

function candidateReasons(candidate) {
  const sources = [
    candidate?.blockers, candidate?.reasons, candidate?.rejectionReasons,
    candidate?.directionDecision?.blockers,
    candidate?.diagnosticSetup?.blockers,
    candidate?.diagnosticSetup?.reasons,
    candidate?.strategySelection?.reasons,
  ];
  return sources.map(readableReason).filter(Boolean).join(" · ") || "No rejection detail supplied by backend";
}

function ResearchDiagnostics({ result, setups, noSetup }) {
  const [open, setOpen] = useState(false);
  const candidates = [...setups, ...noSetup];
  const observed = STRATEGIES.map(id => ({
    id,
    selected: candidates.filter(c => {
      const s = c?.diagnosticSetup ?? c?.setup ?? c;
      const strategy = s?.strategy?.id ?? s?.strategy ?? c?.strategy ?? s?.strategySelection?.selectedStrategy;
      return strategy === id || strategy?.id === id;
    }).length,
    eligible: candidates.filter(c => {
      const s = c?.diagnosticSetup ?? c?.setup ?? c;
      const arr = s?.regime?.eligibleStrategies ?? c?.regime?.eligibleStrategies ?? c?.strategySelection?.eligibleStrategies;
      return Array.isArray(arr) && arr.some(v => v === id || v?.id === id);
    }).length,
  }));
  const counts = result?.counts || {};
  return (
    <section className="research-diagnostics">
      <button type="button" className="research-diagnostics-toggle" onClick={() => setOpen(v => !v)} aria-expanded={open}>
        <span><Activity size={17} /> <strong>Pipeline & strategy diagnostics</strong></span>
        {open ? <ChevronUp size={17} /> : <ChevronDown size={17} />}
      </button>
      {open && <div className="research-diagnostics-content">
        <p>Counts are reported by the backend. Strategy observations below reflect only candidates included in this response; zero does not mean a strategy was never evaluated.</p>
        <div className="research-diagnostics-grid">
          {Object.entries(counts).map(([key,value]) => <div key={key}><small>{key.replace(/([A-Z])/g," $1")}</small><strong>{typeof value === "number" || typeof value === "string" ? value : "—"}</strong></div>)}
        </div>
        <h3>Five-strategy visibility</h3>
        <div className="research-strategy-grid">
          {observed.map(item => <div key={item.id}><strong>{item.id.replaceAll("_", " ")}</strong><span>Eligible in returned candidates: {item.eligible}</span><span>Selected in returned candidates: {item.selected}</span></div>)}
        </div>
        <div className="research-diagnostics-footer">Returned: {setups.length} qualified · {noSetup.length} no-setup candidates. Full strategy evaluation requires backend diagnostics.</div>
      </div>}
    </section>
  );
}


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

  const developingSetups = noSetup.filter(candidate => {
    const status =
      candidate?.diagnosticSetup?.lifecycleStatus ??
      candidate?.diagnosticSetup?.lifecycle?.status ??
      candidate?.lifecycleStatus ??
      candidate?.lifecycle?.status ??
      null;

    return [
      "FORMING",
      "PLANNED",
      "WAITING_FOR_ENTRY",
      "ENTRY_READY",
    ].includes(status);
  });


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


            <ResearchDiagnostics result={result} setups={setups} noSetup={noSetup} />

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
                  No qualified setup was returned. Check the pipeline
                  diagnostics and candidate rejection reasons to determine
                  whether this reflects market conditions or an engine issue.
                </p>

              </section>

            )}


            {/* =============================================
                DEVELOPING / PLANNED SETUPS
                ============================================= */}

            {developingSetups.length > 0 && (
              <>
                <div className="search-section-title lifecycle-title">
                  <div>
                    <span>SETUP ENGINE WATCHLIST</span>
                    <h2>
                      {developingSetups.length} developing setup{developingSetups.length === 1 ? "" : "s"}
                    </h2>
                  </div>
                  <Activity size={19} />
                </div>

                <section className="lifecycle-list">
                  {developingSetups.map((candidate, index) => (
                    <LifecycleCard
                      key={`${candidate?.symbol || "developing"}-${index}`}
                      candidate={candidate}
                    />
                  ))}
                </section>
              </>
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
   V4 LIFECYCLE / DEVELOPING SETUP CARD
   ========================================================= */

// Display only rejection evidence actually supplied by the search API.
// Do not infer approval from lifecycle readiness or a high quality score.
function setupBlockerLabels(candidate) {
  const setup = candidate?.diagnosticSetup ?? candidate?.setup ?? {};
  const raw = [candidate?.blockers, setup?.blockers, setup?.setupQuality?.blockers]
    .flatMap(value => Array.isArray(value) ? value : value ? [value] : []);
  return [...new Set(raw.map(value => {
    if (typeof value === "string") return value;
    if (value && typeof value === "object") {
      return value.reason ?? value.code ?? value.message ?? null;
    }
    return null;
  }).filter(value => typeof value === "string" && value.trim()))];
}

function LifecycleCard({ candidate }) {
  const setup = candidate?.diagnosticSetup ?? candidate?.setup ?? candidate;
  const lifecycle = setup?.lifecycle ?? candidate?.lifecycle ?? {};
  const status = setup?.lifecycleStatus ?? lifecycle?.status ?? "FORMING";
  const direction = directionOf(candidate);
  const strategy =
    setup?.strategy?.id ??
    setup?.strategy ??
    candidate?.strategy ??
    setup?.strategySelection?.selectedStrategy ??
    "Not selected yet";
  const regime = setup?.marketRegime ?? candidate?.regime ?? "—";
  const entryZone = setup?.entryZone;
  const zoneLow = finite(entryZone?.low ?? entryZone?.min ?? entryZone?.lower);
  const zoneHigh = finite(entryZone?.high ?? entryZone?.max ?? entryZone?.upper);
  const preferredEntry = finite(setup?.entry ?? entryZone?.preferredEntry ?? entryZone?.preferred);
  const currentPrice = finite(
    lifecycle?.currentPrice ??
    setup?.entryQuality?.currentPrice ??
    setup?.structure?.current?.close
  );
  const targets = Array.isArray(setup?.targets) ? setup.targets : [];
  const eligible =
    setup?.regime?.eligibleStrategies ??
    candidate?.strategySelection?.eligibleStrategies ??
    [];

  const blockers = setupBlockerLabels(candidate);
  // Lifecycle status describes entry timing, not final qualification.
  // This card is sourced from noSetup, which contains unapproved candidates.
  const qualification = "NOT QUALIFIED";
  const statusText = String(status).replaceAll("_", " ");
  const explanation =
    status === "FORMING"
      ? "Potential setup conditions are developing, but a complete structural entry, stop and targets are not ready yet."
      : status === "PLANNED" || status === "WAITING_FOR_ENTRY"
        ? "A structural entry is planned; the final research qualification has not passed."
        : status === "ENTRY_READY"
          ? "Price has reached the planned entry area, but this candidate has not passed final research qualification."
          : lifecycle?.reason || "Setup Engine lifecycle update.";

  return (
    <article className={`lifecycle-card ${direction.toLowerCase()}`}>
      <div className="lifecycle-card-head">
        <div>
          <span className={`direction ${direction === "BULL" ? "bull" : direction === "BEAR" ? "bear" : "neutral"}`}>
            {direction}
          </span>
          <h3>{candidate?.symbol || setup?.symbol || "Unknown symbol"}</h3>
          <small>{regime} · {String(strategy).replaceAll("_", " ")}</small>
        </div>
        <div className={`lifecycle-badge ${status.toLowerCase().replaceAll("_", "-")}`}>
          <span>SETUP STATUS</span>
          <strong>{statusText}</strong>
        </div>
      </div>

      <div className="lifecycle-qualification" role="status">
        <div className="lifecycle-qualification-head">
          <span>FINAL QUALIFICATION</span>
          <strong>{qualification}</strong>
        </div>
        {blockers.length ? (
          <div className="lifecycle-blockers">
            <span>BACKEND REJECTION REASONS</span>
            <ul>{blockers.map(reason => <li key={reason}>{reason.replaceAll("_", " ")}</li>)}</ul>
          </div>
        ) : (
          <p className="lifecycle-blockers-unavailable">
            The backend did not return a specific blocker for this candidate.
            Review the full rejection diagnostics; entry readiness is not approval.
          </p>
        )}
      </div>
      <p className="lifecycle-explanation">{explanation}</p>

      {eligible.length > 0 && !setup?.strategy?.id && (
        <div className="lifecycle-mechanics">
          <span>WATCHING FOR</span>
          <strong>{eligible.map(x => String(x).replaceAll("_", " ")).join(" · ")}</strong>
        </div>
      )}

      <div className="lifecycle-levels">
        <Level l="Current" v={fmt(currentPrice, 8)} />
        <Level
          l="Entry zone"
          v={zoneLow !== null && zoneHigh !== null ? `${fmt(zoneLow, 8)} – ${fmt(zoneHigh, 8)}` : "Not ready"}
        />
        <Level l="Preferred entry" v={preferredEntry === null ? "Not ready" : fmt(preferredEntry, 8)} />
        <Level l="Stop / invalidation" v={fmt(setup?.stop ?? setup?.invalidation, 8)} />
        <Level l="TP1" v={fmt(targets?.[0], 8)} />
        <Level l="TP2 / TP3" v={targets.length > 1 ? targets.slice(1, 3).map(x => fmt(x, 8)).join(" / ") : "Not ready"} />
      </div>

      <div className="lifecycle-meta">
        <span>Class <strong>{setup?.setupClass ?? "—"}</strong></span>
        <span>Quality <strong>{setup?.setupQualityScore ?? "—"}</strong></span>
        <span>Research only · execution disabled</span>
      </div>
    </article>
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

                  {candidateReasons(candidate)}

                </small>

              </div>

            )
          )}

        </div>

      )}

    </section>

  );
}