// client/src/crypto/pages/CryptoHealth.jsx

import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Database,
  Gauge,
  HeartPulse,
  Moon,
  RefreshCw,
  RotateCcw,
  ServerCog,
  ShieldCheck,
  Sun,
  Wifi,
  XCircle,
  Zap,
} from "lucide-react";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import CryptoSidebar from "../components/CryptoSidebar.jsx";

import {
  getCryptoDashboard,
  getCryptoDiscoveryStatus,
  getCryptoPersistence,
  getCryptoRecovery,
  getCryptoRuntimeHealth,
  getCryptoRuntimeState,
  getCryptoScannerStatus,
} from "../services/cryptoApi.js";

import "./CryptoHealth.css";

const POLL_MS = 5000;

const ENGINE_EXPLANATIONS = [
  ["Momentum", "Measures trend, momentum and price-behaviour evidence used by the crypto research pipeline."],
  ["Liquidity", "Evaluates whether available market liquidity is sufficient for reliable analysis and safe execution."],
  ["On-Chain", "Uses blockchain evidence when it is actually available. Missing evidence must remain unavailable rather than manufactured."],
  ["Narrative", "Measures observable market narrative and token-specific information used by the research system."],
  ["News", "Evaluates relevant news/event evidence and its directional significance."],
  ["Risk", "Evaluates risk constraints independently from directional research conviction."],
];

function upper(value, fallback="UNKNOWN") {
  const v=String(value ?? "").trim().toUpperCase();
  return v || fallback;
}

function num(value) {
  const n=Number(value);
  return Number.isFinite(n) ? n : null;
}

function time(value) {
  if (!value) return "—";
  const d=new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleTimeString();
}

function age(value) {
  if (!value) return null;
  const t=new Date(value).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Date.now()-t);
}

function tone(status) {
  const s=upper(status);
  if (["HEALTHY","READY","RUNNING","NORMAL","ACTIVE","ONLINE","CONNECTED","RECOVERED","OK"].includes(s)) return "healthy";
  if (["DEGRADED","PARTIAL","STALE","WARNING","RECOVERING"].includes(s)) return "warning";
  if (["SAFE_MODE","HALTED","FAILED","ERROR","OFFLINE","UNAVAILABLE","DISCONNECTED","BLOCKED"].includes(s)) return "danger";
  return "neutral";
}

function first(...values) {
  return values.find(v => v !== undefined && v !== null) ?? null;
}

function statusOf(value, fallback="UNKNOWN") {
  if (typeof value === "string") return upper(value, fallback);
  return upper(first(
    value?.status,
    value?.state,
    value?.health,
    value?.supervisorState,
    value?.runtimeState,
  ), fallback);
}

function extractEngineRows(dashboard) {
  const candidates=[
    dashboard?.engines,
    dashboard?.engineHealth,
    dashboard?.health?.engines,
    dashboard?.research?.engines,
    dashboard?.scanner?.engines,
  ];
  const source=candidates.find(v => v && typeof v === "object") ?? null;
  if (!source) return [];

  if (Array.isArray(source)) {
    return source.map((item,index)=>({
      name:item?.name ?? item?.engine ?? `Engine ${index+1}`,
      status:statusOf(item),
      reason:first(item?.reason,item?.message,item?.error),
      raw:item,
    }));
  }

  return Object.entries(source).map(([name,item])=>({
    name,
    status:statusOf(item),
    reason:first(item?.reason,item?.message,item?.error),
    raw:item,
  }));
}

function StatusPill({status}) {
  const s=upper(status);
  return <span className={`ch-status ${tone(s)}`}><i />{s}</span>;
}

function HealthCard({icon:Icon,label,status,detail}) {
  return (
    <article className="ch-health-card">
      <div className={`ch-health-icon ${tone(status)}`}><Icon size={17}/></div>
      <div className="ch-health-copy">
        <span>{label}</span>
        <strong>{upper(status)}</strong>
        <small>{detail || "Backend state"}</small>
      </div>
      <StatusPill status={status}/>
    </article>
  );
}

function Heartbeat({state,alive}) {
  const t=alive ? tone(state) : "danger";
  return (
    <div className={`ch-heartbeat ${t} ${alive ? "beating" : "flat"}`}>
      <div className="ch-heartbeat-head">
        <div>
          <span>SYSTEM HEARTBEAT</span>
          <strong>{alive ? upper(state,"OPERATIONAL") : "CONNECTION LOST"}</strong>
        </div>
        <div className="ch-heart-icon"><HeartPulse size={25}/></div>
      </div>
      <div className="ch-ecg" aria-label={`System heartbeat ${alive ? "active" : "stopped"}`}>
        <svg viewBox="0 0 900 100" preserveAspectRatio="none">
          <path className="ch-ecg-gridline" d="M0 50 H900"/>
          <path
            className="ch-ecg-path"
            d={alive
              ? "M0 50 H90 L105 50 L120 40 L136 63 L151 10 L170 87 L190 50 H300 L315 50 L330 40 L346 63 L361 10 L380 87 L400 50 H510 L525 50 L540 40 L556 63 L571 10 L590 87 L610 50 H720 L735 50 L750 40 L766 63 L781 10 L800 87 L820 50 H900"
              : "M0 50 H900"}
          />
        </svg>
      </div>
      <div className="ch-heartbeat-foot">
        <span><i className="ch-live-dot"/>Continuous health polling</span>
        <span>{alive ? "Backend responding" : "Backend heartbeat unavailable"}</span>
      </div>
    </div>
  );
}

export default function CryptoHealth() {
  const [data,setData]=useState({
    health:null,runtime:null,scanner:null,discovery:null,
    persistence:null,recovery:null,dashboard:null,
  });
  const [loading,setLoading]=useState(true);
  const [refreshing,setRefreshing]=useState(false);
  const [lastSuccess,setLastSuccess]=useState(null);
  const [errors,setErrors]=useState([]);
  const requestRef=useRef(false);

  const [theme,setTheme]=useState(()=>{
    const saved=window.localStorage.getItem("aema-crypto-theme");
    if (saved==="dark" || saved==="light") return saved;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });

  useEffect(()=>{
    window.localStorage.setItem("aema-crypto-theme",theme);
  },[theme]);

  const load=useCallback(async ({manual=false}={})=>{
    if (requestRef.current) return;
    requestRef.current=true;
    manual ? setRefreshing(true) : setLoading(true);

    const calls=[
      ["health",getCryptoRuntimeHealth],
      ["runtime",getCryptoRuntimeState],
      ["scanner",getCryptoScannerStatus],
      ["discovery",getCryptoDiscoveryStatus],
      ["persistence",getCryptoPersistence],
      ["recovery",getCryptoRecovery],
      ["dashboard",getCryptoDashboard],
    ];

    const results=await Promise.allSettled(calls.map(([,fn])=>fn()));
    const next={};
    const nextErrors=[];

    results.forEach((result,index)=>{
      const key=calls[index][0];
      if (result.status==="fulfilled") next[key]=result.value;
      else nextErrors.push({
        component:key,
        message:result.reason?.message ?? "Request failed",
        status:result.reason?.status ?? null,
      });
    });

    if (Object.keys(next).length) {
      setData(previous=>({...previous,...next}));
      setLastSuccess(new Date());
    }
    setErrors(nextErrors);
    setLoading(false);
    setRefreshing(false);
    requestRef.current=false;
  },[]);

  useEffect(()=>{
    void load();
    const timer=setInterval(()=>void load(),POLL_MS);
    return ()=>clearInterval(timer);
  },[load]);

  const supervisor=first(
    data.health?.supervisor,
    data.health?.health?.supervisor,
    data.dashboard?.health?.supervisor,
    data.dashboard?.dashboard?.health?.supervisor,
  ) ?? {};

  const runtime=first(
    data.runtime?.runtime,
    data.runtime,
    data.dashboard?.runtime?.runtime,
    data.dashboard?.dashboard?.runtime?.runtime,
  ) ?? {};

  const persistence=first(
    data.persistence?.persistence,
    data.persistence,
    data.dashboard?.persistence?.persistence,
    data.dashboard?.dashboard?.persistence?.persistence,
  ) ?? {};

  const recovery=first(
    data.recovery?.recovery,
    data.recovery,
    data.dashboard?.recovery?.recovery,
    data.dashboard?.dashboard?.recovery?.recovery,
  ) ?? {};

  const scanner=first(
    data.scanner?.scanner,
    data.scanner,
  ) ?? {};

  const discovery=first(
    data.discovery?.discovery,
    data.discovery,
  ) ?? {};

  const dashboardRoot=first(data.dashboard?.dashboard,data.dashboard) ?? {};

  const systemState=upper(first(
    supervisor?.supervisorState,
    data.health?.state,
    data.health?.status,
    runtime?.state,
    runtime?.status,
  ));

  const heartbeatAge=lastSuccess ? Date.now()-lastSuccess.getTime() : Infinity;
  const alive=heartbeatAge < POLL_MS*3 && errors.length < 7;

  const components=useMemo(()=>[
    {
      icon:ServerCog,
      label:"Runtime Supervisor",
      status:first(supervisor?.supervisorState,data.health?.state,data.health?.status),
      detail:`Evaluations ${num(supervisor?.evaluationCount) ?? "—"} · Blocked ${num(supervisor?.blockedCount) ?? "—"}`,
    },
    {
      icon:RadarIcon,
      label:"Scanner",
      status:first(scanner?.status,scanner?.state),
      detail:`Cycles ${num(scanner?.cycleCount) ?? "—"} · Last ${time(scanner?.lastCycleCompletedAt)}`,
    },
    {
      icon:CompassIcon,
      label:"Discovery",
      status:first(discovery?.status,discovery?.state),
      detail:first(discovery?.message, discovery?.reason, "Continuous crypto discovery"),
    },
    {
      icon:Database,
      label:"Persistence",
      status:first(persistence?.state,persistence?.status,persistence?.healthy === true ? "HEALTHY" : null),
      detail:`Checkpoints ${num(persistence?.checkpointCount) ?? "—"}`,
    },
    {
      icon:RotateCcw,
      label:"Recovery",
      status:first(recovery?.state,recovery?.status),
      detail:first(recovery?.message,recovery?.reason,"Crash/restart recovery state"),
    },
    {
      icon:Wifi,
      label:"Market Data",
      status:first(
        supervisor?.lastHealth?.marketData?.status,
        supervisor?.lastHealth?.marketDataFresh === true ? "HEALTHY" : null,
        supervisor?.marketDataFresh === true ? "HEALTHY" : null,
        supervisor?.marketDataFresh === false ? "STALE" : null,
      ),
      detail:`Age ${num(first(supervisor?.marketDataAgeMs,supervisor?.lastHealth?.marketDataAgeMs)) ?? "—"} ms`,
    },
  ],[supervisor,scanner,discovery,persistence,recovery]);

  const engineRows=useMemo(()=>extractEngineRows(dashboardRoot),[dashboardRoot]);

  const incidents=useMemo(()=>{
    const rows=[...errors.map(e=>({
      severity:"HIGH",
      component:e.component,
      title:"Backend request failed",
      detail:e.message,
    }))];

    const transitions=Array.isArray(supervisor?.transitionHistory)
      ? supervisor.transitionHistory.slice(-8).reverse()
      : [];

    transitions.forEach(item=>{
      const next=upper(item?.to);
      if (!["NORMAL","HEALTHY","READY"].includes(next)) {
        rows.push({
          severity:next==="HALTED" || next==="SAFE_MODE" ? "HIGH" : "MEDIUM",
          component:"Runtime Supervisor",
          title:`State changed to ${next}`,
          detail:Array.isArray(item?.reasons) ? item.reasons.join(" · ") : "Supervisor transition",
          at:item?.at,
        });
      }
    });

    if (scanner?.lastError) rows.push({
      severity:"HIGH",
      component:"Scanner",
      title:"Scanner reported an error",
      detail:String(scanner.lastError),
    });

    return rows;
  },[errors,supervisor,scanner]);

  const pipeline=[
    ["Universe / Discovery",statusOf(discovery)],
    ["Scanner",statusOf(scanner)],
    ["Research Engines",engineRows.length ? (engineRows.some(e=>tone(e.status)==="danger") ? "DEGRADED" : "READY") : "UNKNOWN"],
    ["Risk Validation",first(supervisor?.lastHealth?.state,supervisor?.supervisorState,"UNKNOWN")],
    ["Execution Supervisor",first(supervisor?.supervisorState,"UNKNOWN")],
    ["Persistence",statusOf(persistence)],
    ["Recovery",statusOf(recovery)],
  ];

  return (
    <div className={`crypto-shell crypto-theme-${theme}`}>
      <CryptoSidebar/>

      <main className="crypto-health-page">
        <header className="ch-header">
          <div>
            <span className="ch-kicker"><ShieldCheck size={13}/>SYSTEM CONTROL ROOM</span>
            <h1>Risk & Health</h1>
            <p>Continuous runtime monitoring, execution safeguards, engine transparency and malfunction detection.</p>
          </div>

          <div className="ch-actions">
            <button className="ch-icon-button" onClick={()=>setTheme(t=>t==="dark"?"light":"dark")} aria-label="Switch theme">
              {theme==="dark" ? <Sun size={17}/> : <Moon size={17}/>}
            </button>
            <button className="ch-refresh" disabled={refreshing} onClick={()=>void load({manual:true})}>
              <RefreshCw size={15} className={refreshing ? "spin":""}/>
              {refreshing ? "Refreshing" : "Refresh"}
            </button>
          </div>
        </header>

        <Heartbeat state={systemState} alive={alive}/>

        <section className="ch-summary-grid">
          <div><span>Supervisor</span><StatusPill status={supervisor?.supervisorState}/></div>
          <div><span>Execution Mode</span><strong>PAPER</strong></div>
          <div><span>Live Execution</span><strong className="ch-danger-text">DISABLED</strong></div>
          <div><span>Last Heartbeat</span><strong>{lastSuccess ? time(lastSuccess) : "—"}</strong></div>
        </section>

        <section className="ch-section">
          <div className="ch-section-head">
            <div><span>CONTINUOUS MONITORING</span><h2>System Components</h2></div>
            <Activity size={18}/>
          </div>
          <div className="ch-health-grid">
            {components.map(item=><HealthCard key={item.label} {...item}/>)}
          </div>
        </section>

        <section className="ch-two-column">
          <article className="ch-panel">
            <div className="ch-section-head">
              <div><span>CONTROL FLOW</span><h2>Trading System Pipeline</h2></div>
              <Zap size={18}/>
            </div>
            <div className="ch-pipeline">
              {pipeline.map(([label,status],index)=>(
                <div className="ch-pipeline-row" key={label}>
                  <div className={`ch-pipeline-node ${tone(status)}`}>{index+1}</div>
                  <div><strong>{label}</strong><span>{upper(status)}</span></div>
                  <StatusPill status={status}/>
                </div>
              ))}
            </div>
          </article>

          <article className="ch-panel">
            <div className="ch-section-head">
              <div><span>RISK AUTHORITY</span><h2>Execution Safeguards</h2></div>
              <ShieldCheck size={18}/>
            </div>
            <div className="ch-risk-list">
              <div><span>New / increased exposure</span><strong>{["NORMAL","HEALTHY","READY"].includes(upper(supervisor?.supervisorState)) ? "SUPERVISED" : "BLOCKED / REVIEW"}</strong></div>
              <div><span>Risk-reducing actions</span><strong>PROTECTED PATH</strong></div>
              <div><span>Emergency close</span><strong>PROTECTED PATH</strong></div>
              <div><span>Protective stop actions</span><strong>PROTECTED PATH</strong></div>
              <div><span>Live execution authority</span><strong className="ch-danger-text">NONE</strong></div>
              <div><span>Repeated failures</span><strong>{num(supervisor?.repeatedFailureCount) ?? "—"}</strong></div>
              <div><span>Hard failure</span><strong>{supervisor?.hardFailure === true ? "YES" : supervisor?.hardFailure === false ? "NO" : "—"}</strong></div>
            </div>
          </article>
        </section>

        <section className="ch-section">
          <div className="ch-section-head">
            <div><span>ENGINE MONITOR</span><h2>Research Engine Health</h2></div>
            <Gauge size={18}/>
          </div>

          {engineRows.length ? (
            <div className="ch-engine-grid">
              {engineRows.map(engine=>(
                <article className="ch-engine-card" key={engine.name}>
                  <div><strong>{engine.name}</strong><StatusPill status={engine.status}/></div>
                  <p>{engine.reason || "Backend engine state reported without an active malfunction."}</p>
                </article>
              ))}
            </div>
          ) : (
            <div className="ch-engine-grid">
              {ENGINE_EXPLANATIONS.map(([name,description])=>(
                <article className="ch-engine-card" key={name}>
                  <div><strong>{name}</strong><StatusPill status="UNKNOWN"/></div>
                  <p>{description}</p>
                  <small>No engine-health record was exposed by the current dashboard response.</small>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="ch-section">
          <div className="ch-section-head">
            <div><span>MALFUNCTION DETECTION</span><h2>Active Incidents</h2></div>
            <AlertTriangle size={18}/>
          </div>

          {incidents.length ? (
            <div className="ch-incidents">
              {incidents.map((incident,index)=>(
                <article className="ch-incident" key={`${incident.component}-${index}`}>
                  <div className="ch-incident-icon"><XCircle size={17}/></div>
                  <div>
                    <span>{incident.severity} · {incident.component}</span>
                    <strong>{incident.title}</strong>
                    <p>{incident.detail || "No additional diagnostic detail supplied."}</p>
                  </div>
                  <time>{time(incident.at)}</time>
                </article>
              ))}
            </div>
          ) : (
            <div className="ch-no-incidents">
              <CheckCircle2 size={19}/>
              <div><strong>No active malfunction detected from the connected health endpoints</strong><span>This statement reflects the backend evidence currently exposed to this page.</span></div>
            </div>
          )}
        </section>

        <section className="ch-section">
          <div className="ch-section-head">
            <div><span>ARCHITECTURE & SAFEGUARDS</span><h2>How the Trading System Protects Itself</h2></div>
            <ServerCog size={18}/>
          </div>
          <div className="ch-explain-grid">
            <article><strong>Fail-Closed Supervision</strong><p>Unsafe runtime health blocks actions that create or increase exposure rather than treating missing evidence as permission.</p></article>
            <article><strong>Risk Reduction Preserved</strong><p>Reduction, close, emergency-close and protective actions remain a distinct protected path in the runtime supervisor.</p></article>
            <article><strong>Freshness Monitoring</strong><p>Market-data freshness and age are inputs to runtime health so stale information can degrade or block risk-increasing actions.</p></article>
            <article><strong>Crash Recovery</strong><p>Persistence and recovery are monitored separately so runtime state can be restored and health can be inspected after interruption.</p></article>
            <article><strong>Engine Transparency</strong><p>Unavailable engine evidence is shown as unavailable/unknown rather than being displayed as a healthy green component.</p></article>
            <article><strong>Paper Execution Boundary</strong><p>This workspace exposes paper execution only. The frontend does not grant live execution authority.</p></article>
          </div>
        </section>

        <footer className="ch-footer">
          <span>Polling every {POLL_MS/1000}s · Backend is the source of truth</span>
          <span>{errors.length ? `${errors.length} endpoint warning${errors.length===1?"":"s"}` : "All requested health endpoints responding"}</span>
        </footer>
      </main>
    </div>
  );
}

// Local aliases keep the visual intent obvious without adding new dependencies.
function RadarIcon(props){ return <Activity {...props}/>; }
function CompassIcon(props){ return <Gauge {...props}/>; }
