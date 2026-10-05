import {
  Activity,
  AlertTriangle,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";

import {
  useCallback,
  useEffect,
  useState,
} from "react";

import BotSidebar from "../components/BotSidebar.jsx";

import {
  getBotMonitors,
  refreshBotMonitor,
} from "../services/botApi.js";

import {
  fmt,
  pct,
} from "../components/ResearchUi.jsx";

import "./BotMonitoring.css";


export default function BotMonitoring() {

  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");


  /* =======================================================
     LOAD MONITORS
     ======================================================= */

  const load = useCallback(async () => {

    try {

      const response =
        await getBotMonitors();

      setRows(
        Array.isArray(response?.monitors)
          ? response.monitors
          : []
      );

      setError("");

    } catch (e) {

      setError(
        e?.message ||
        "Unable to load monitored setups."
      );

    }

  }, []);


  useEffect(() => {
    load();
  }, [load]);


  /* =======================================================
     REFRESH ONE MONITOR
     ======================================================= */

  const refresh = async (id) => {

    try {

      setBusy(id);
      setError("");

      await refreshBotMonitor(
        id,
        {}
      );

      await load();

    } catch (e) {

      setError(
        e?.message ||
        "Unable to refresh monitoring evidence."
      );

    } finally {

      setBusy("");

    }

  };


  /* =======================================================
     PAGE
     ======================================================= */

  return (

    <div className="bot-app">

      <BotSidebar />

      <main className="monitoring-page">

        <header>

          <div>

            <span>
              THESIS MONITORING
            </span>

            <h1>
              Monitored Setups
            </h1>

            <p>
              Compare refreshed market evidence with the
              original setup. Monitoring does not place orders.
            </p>

          </div>


          <button onClick={load}>

            <RefreshCw size={15} />

            Refresh list

          </button>

        </header>


        {error && (

          <div className="monitor-error">

            <AlertTriangle size={15} />

            {error}

          </div>

        )}


        {!rows.length ? (

          <section className="monitor-empty">

            <Activity size={36} />

            <h2>
              No monitored setups yet
            </h2>

            <p>
              Run Search Market, open a qualified setup
              and choose Monitor setup.
            </p>

          </section>

        ) : (

          <section className="monitor-list">

            {rows.map((monitor, index) => (

              <MonitorCard
                key={
                  monitor?.id ||
                  monitor?.monitorId ||
                  index
                }
                m={monitor}
                busy={busy}
                refresh={refresh}
              />

            ))}

          </section>

        )}

      </main>

    </div>

  );
}


/* =========================================================
   MONITOR CARD
   ========================================================= */

function MonitorCard({
  m,
  busy,
  refresh,
}) {

  const id =
    m?.id ??
    m?.monitorId;


  const state =
    String(
      m?.status ??
      m?.state ??
      "ACTIVE"
    ).toUpperCase();


  /*
   * ORIGINAL SEARCH-MARKET SNAPSHOT
   */

  const original =
    m?.original ?? {};

  const setup =
    original?.setup ?? {};

  const originalDirection =
    original?.directionDecision ?? {};


  /*
   * LATEST MONITORING OBSERVATION
   *
   * This only exists after Refresh evidence has
   * successfully completed at least once.
   */

  const latest =
    m?.lastObservation ?? null;

  const latestDirection =
    latest?.directionDecision ?? null;


  /*
   * Direction stored internally by the setup builder
   * is currently LONG / SHORT.
   *
   * The private research UI should present BULL / BEAR.
   */

  const internalDirection =
    setup?.direction ??
    originalDirection?.rawDirection ??
    null;


  const displayDirection =
    internalDirection === "LONG"
      ? "BULL"
      : internalDirection === "SHORT"
        ? "BEAR"
        : "NO SETUP";


  /*
   * ORIGINAL VALUES
   */

  const entry =
    setup?.entry;

  const stop =
    setup?.stop;

  const target =
    setup?.target;

  const originalConfidence =
    originalDirection?.confidence;

  const originalSeparation =
    originalDirection?.separation;


  /*
   * CURRENT VALUES
   */

  const currentPrice =
    latest?.markPrice;

  const currentConfidence =
    latestDirection?.confidence;

  const currentSeparation =
    latestDirection?.separation;


  const changes =
    latest?.changes ?? {};


  return (

    <article className="monitor-card">

      {/* =================================================
          HEADER
          ================================================= */}

      <div className="monitor-head">

        <div>

          <span
            className={
              `monitor-state ${state.toLowerCase()}`
            }
          >

            {state}

          </span>


          <h2>
            {m?.symbol || "Unknown"}
          </h2>


          <small>
            {displayDirection}
          </small>

        </div>


        <ShieldCheck size={18} />

      </div>


      {/* =================================================
          ORIGINAL SETUP
          ================================================= */}

      <div className="monitor-metrics">

        <M
          l="Entry"
          v={fmt(entry, 8)}
        />

        <M
          l="Stop"
          v={fmt(stop, 8)}
        />

        <M
          l="Target"
          v={fmt(target, 8)}
        />

        <M
          l="Original confidence"
          v={pct(originalConfidence)}
        />

      </div>


      {/* =================================================
          CURRENT EVIDENCE
          ================================================= */}

      <div className="monitor-metrics">

        <M
          l="Current"
          v={
            latest
              ? fmt(currentPrice, 8)
              : "Refresh required"
          }
        />

        <M
          l="Current confidence"
          v={
            latest
              ? pct(currentConfidence)
              : "Refresh required"
          }
        />

        <M
          l="Current separation"
          v={
            latest
              ? pct(currentSeparation)
              : "Refresh required"
          }
        />

        <M
          l="Original separation"
          v={pct(originalSeparation)}
        />

      </div>


      {/* =================================================
          THESIS CHANGE
          ================================================= */}

      {latest && (

        <div className="monitor-metrics">

          <M
            l="Confidence change"
            v={
              Number.isFinite(
                Number(changes?.confidence)
              )
                ? `${Number(
                    changes.confidence
                  ) >= 0 ? "+" : ""}${fmt(
                    changes.confidence,
                    2
                  )}`
                : "Unavailable"
            }
          />


          <M
            l="Separation change"
            v={
              Number.isFinite(
                Number(changes?.separation)
              )
                ? `${Number(
                    changes.separation
                  ) >= 0 ? "+" : ""}${fmt(
                    changes.separation,
                    2
                  )}`
                : "Unavailable"
            }
          />


          <M
            l="Direction changed"
            v={
              changes?.directionChanged === true
                ? "YES"
                : changes?.directionChanged === false
                  ? "NO"
                  : "Unavailable"
            }
          />


          <M
            l="Near stop"
            v={
              changes?.nearStop === true
                ? "YES"
                : changes?.nearStop === false
                  ? "NO"
                  : "Unavailable"
            }
          />

        </div>

      )}


      {/* =================================================
          REFRESH
          ================================================= */}

      <button
        disabled={
          !id ||
          busy === id
        }
        onClick={() =>
          refresh(id)
        }
      >

        <RefreshCw size={14} />

        {busy === id
          ? "Refreshing evidence…"
          : latest
            ? "Refresh evidence again"
            : "Refresh evidence"}

      </button>

    </article>

  );
}


/* =========================================================
   METRIC
   ========================================================= */

function M({
  l,
  v,
}) {

  return (

    <div>

      <span>
        {l}
      </span>

      <strong>
        {v}
      </strong>

    </div>

  );
}