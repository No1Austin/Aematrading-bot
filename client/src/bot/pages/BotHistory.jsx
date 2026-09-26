import {CircleHelp, History, TrendingUp, TrendingDown} from "lucide-react";
import {useCallback, useEffect, useMemo, useState} from "react";
import BotSidebar from "../components/BotSidebar.jsx";
import {getBotHistory, getTradeExplanation} from "../services/botApi.js";
import "./BotHistory.css";

const numeric = v => v !== null && v !== undefined && v !== "" && Number.isFinite(Number(v)) ? Number(v) : null;
const money = (value, currency) => new Intl.NumberFormat("en-CA", {style:"currency", currency, maximumFractionDigits:2}).format(value);
const direction = side => side === "LONG" ? "Bullish Direction" : side === "SHORT" ? "Bearish Direction" : "—";
const dateValue = row => {
  const t = Date.parse(row.closedAt ?? row.exitAt ?? "");
  return Number.isFinite(t) ? t : 0;
};

// All charts use actual API rows; no mock results and no extra chart dependency.
function PerformanceChart({trades, convert, currency}) {
  const points = useMemo(() => {
    let running = 0;
    return [...trades].sort((a,b) => dateValue(a)-dateValue(b)).map((row,index) => {
      running += row.net;
      return {index:index+1, value:convert(running), symbol:row.symbol};
    });
  }, [trades, convert]);
  if (!points.length) return <div className="history-chart-empty">No closed trades with recorded P&L to graph.</div>;
  const w=760,h=235,pad={left:68,right:18,top:20,bottom:35};
  const values=points.map(p=>p.value);
  const lo=Math.min(0,...values),hi=Math.max(0,...values);
  const span=Math.max(hi-lo,0.01);
  const x=i=>pad.left+(points.length===1?(w-pad.left-pad.right)/2:i*(w-pad.left-pad.right)/(points.length-1));
  const y=v=>pad.top+(hi-v)*(h-pad.top-pad.bottom)/span;
  const coords=points.map((p,i)=>`${x(i)},${y(p.value)}`).join(" ");
  const ticks=[0,1,2,3,4].map(i=>lo+(hi-lo)*i/4);
  return <div className="history-svg-wrap"><svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`Cumulative realized P&L in ${currency} across ${points.length} trades`}>
    {ticks.map((v,i)=><g key={i}><line x1={pad.left} x2={w-pad.right} y1={y(v)} y2={y(v)} stroke="#26333e" strokeDasharray="3 5"/><text x={pad.left-10} y={y(v)+4} textAnchor="end" fill="#8e9aaa" fontSize="11">{Math.round(v).toLocaleString("en-CA")}</text></g>)}
    <line x1={pad.left} x2={w-pad.right} y1={y(0)} y2={y(0)} stroke="#8994a2" strokeDasharray="5 4"/>
    {points.length>1?<polyline fill="none" stroke="#e0b94e" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" points={coords}/>:null}
    {points.map((p,i)=><circle key={i} cx={x(i)} cy={y(p.value)} r={points.length>80?1.5:3} fill={p.value>=0?"#43cb9b":"#ef7777"}><title>{`Trade ${p.index}: ${p.symbol} — ${money(p.value,currency)}`}</title></circle>)}
    <text x={pad.left} y={h-7} fill="#8e9aaa" fontSize="11">Trade 1</text><text x={w-pad.right} y={h-7} textAnchor="end" fill="#8e9aaa" fontSize="11">Trade {points.length}</text>
  </svg></div>;
}
function OutcomeChart({wins,losses,even}) {
  const items=[{label:"Wins",value:wins,color:"#43cb9b"},{label:"Losses",value:losses,color:"#ef7777"},{label:"Breakeven",value:even,color:"#8e9aaa"}];
  const max=Math.max(1,...items.map(x=>x.value));
  return <div className="history-outcomes" role="img" aria-label={`${wins} wins, ${losses} losses and ${even} breakeven trades`}>
    {items.map(item=><div className="history-outcome" key={item.label}><div className="history-outcome-label"><span>{item.label}</span><strong>{item.value}</strong></div><div className="history-outcome-track"><div style={{width:`${item.value/max*100}%`,background:item.color}}/></div></div>)}
  </div>;
}

export default function BotHistory(){
  const [rows,setRows]=useState([]);
  const [err,setErr]=useState("");
  const [loading,setLoading]=useState(false);
  const [ex,setEx]=useState(null);
  const [rateInput,setRateInput]=useState("");
  const [rateDate,setRateDate]=useState("");
  const [filter,setFilter]=useState("ALL");
  const rate=numeric(rateInput);
  const validRate=rate!==null&&rate>0&&Boolean(rateDate);
  const currency=validRate?"CAD":"USD";
  const convert=useCallback(amount=>validRate?amount*rate:amount,[validRate,rate]);
  const display=amount=>money(convert(amount),currency);
  const load=useCallback(async()=>{
    setLoading(true);setErr("");
    try {const data=await getBotHistory();setRows(Array.isArray(data?.trades)?data.trades:[]);}
    catch(error){setErr(error?.message||"Unable to load trade history.");}
    finally{setLoading(false);}
  },[]);
  useEffect(()=>{load();},[load]);
  const sorted=useMemo(()=>[...rows].sort((a,b)=>dateValue(a)-dateValue(b)),[rows]);
  const enriched=useMemo(()=>{
    let running=0;
    return sorted.map(row=>{const net=numeric(row.realizedPnlUsd);if(net!==null)running+=net;return {...row,net,running:net===null?null:running};});
  },[sorted]);
  const stats=useMemo(()=>{
    const known=enriched.filter(row=>row.net!==null);
    const wins=known.filter(row=>row.net>0),losses=known.filter(row=>row.net<0),even=known.filter(row=>row.net===0);
    const sum=items=>items.reduce((total,row)=>total+row.net,0);
    return {wins:wins.length,losses:losses.length,even:even.length,unknown:rows.length-known.length,
      grossWins:sum(wins),grossLosses:sum(losses),net:sum(known),known:known.length,chartRows:known};
  },[enriched,rows.length]);
  const filtered=useMemo(()=>enriched.filter(row=>filter==="ALL"||(filter==="WINS"&&row.net>0)||(filter==="LOSSES"&&row.net<0)||(filter==="EVEN"&&row.net===0)||(filter==="UNKNOWN"&&row.net===null)),[enriched,filter]);
  const explain=async id=>{setErr("");try{setEx(await getTradeExplanation(id));}catch(error){setErr(error?.message||"Explanation unavailable.");}};
  const winRate=stats.wins+stats.losses?100*stats.wins/(stats.wins+stats.losses):null;
  return <div className="bot-app"><BotSidebar/><main className="bot-main history-page">
    <header className="history-header"><div><span>COMPLETED PAPER TRADES</span><h1>Trade History</h1><p>Closed positions, win/loss analytics and recorded decision evidence.</p></div><b><i/>PAPER · LIVE DISABLED</b></header>
    {err&&<div className="bot-error" role="alert">{err}</div>}
    <section className="history-currency"><div><strong>Display currency</strong><p>Ledger stays in USD. Enter a verified USD → CAD rate and date for estimated CAD charts and totals.</p></div>
      <label>1 USD in CAD<input type="number" min="0.000001" step="0.0001" value={rateInput} onChange={e=>setRateInput(e.target.value)} placeholder="Enter verified rate"/></label>
      <label>Rate date<input type="date" value={rateDate} onChange={e=>setRateDate(e.target.value)}/></label>
      <span className="history-rate-status">{validRate?`CAD estimate: 1 USD = ${rate} CAD (${rateDate})`:"Showing original USD amounts"}</span>
    </section>
    <section className="history-stats" aria-label="Closed trade performance">
      <div><span>Gross winning trades</span><strong className="bull">{display(stats.grossWins)}</strong><small>{stats.wins} winning positions</small></div>
      <div><span>Gross losing trades</span><strong className="bear">{display(stats.grossLosses)}</strong><small>{stats.losses} losing positions</small></div>
      <div><span>Net closed-position P&L</span><strong className={stats.net>=0?"bull":"bear"}>{display(stats.net)}</strong><small>Returned history rows only</small></div>
      <div><span>Win rate</span><strong>{winRate===null?"—":`${winRate.toFixed(1)}%`}</strong><small>{stats.wins} wins / {stats.losses} losses</small></div>
      <div><span>Average win</span><strong>{stats.wins?display(stats.grossWins/stats.wins):"—"}</strong><small>Winning positions only</small></div>
      <div><span>Average loss</span><strong>{stats.losses?display(stats.grossLosses/stats.losses):"—"}</strong><small>{stats.even} even · {stats.unknown} missing P&L</small></div>
    </section>
    <section className="history-graphs" aria-label="Performance graphs">
      <div className="history-panel"><div className="panel-head"><div><span>TRADE OUTCOMES</span><h2>Wins vs. Losses</h2></div><div className="history-graph-icon"><TrendingUp size={19}/></div></div><OutcomeChart wins={stats.wins} losses={stats.losses} even={stats.even}/><p className="history-graph-note">Counts of closed positions; missing P&L excluded.</p></div>
      <div className="history-panel"><div className="panel-head"><div><span>REALIZED PERFORMANCE · {currency}</span><h2>Cumulative Profit & Loss</h2></div><div className="history-graph-icon"><TrendingDown size={19}/></div></div><PerformanceChart trades={stats.chartRows} convert={convert} currency={currency}/><p className="history-graph-note">Running sum of recorded closed-position P&L, not account equity.</p></div>
    </section>
    <p className="history-disclaimer">CAD figures use one manually entered rate, not transaction-date exchange rates. Partial exits, fees and funding appear only if included in the API's realizedPnlUsd per closed trade. Verify completeness against the reconciled ledger. Win rate excludes breakeven trades and records with missing P&L.</p>
    <section className="history-panel"><div className="panel-head"><div><span>LEDGER</span><h2>Completed Trades</h2></div><div className="history-actions"><label htmlFor="history-filter">Filter</label><select id="history-filter" value={filter} onChange={e=>setFilter(e.target.value)}><option value="ALL">All trades</option><option value="WINS">Wins</option><option value="LOSSES">Losses</option><option value="EVEN">Breakeven</option><option value="UNKNOWN">Missing P&L</option></select><button type="button" className="history-refresh" onClick={load} disabled={loading}>{loading?"Loading…":"Refresh"} <History size={16}/></button></div></div>
      {filtered.length?<div className="history-table"><div className="history-row head"><span>Symbol</span><span>Direction</span><span>Entry</span><span>Exit</span><span>Realized P&L</span><span>Running P&L*</span><span>Reason</span><span>Details</span></div>
        {filtered.map((row,index)=><div className="history-row" key={row.id??`${row.symbol}-${index}`}><strong>{row.symbol}</strong><span className={row.direction==="LONG"?"bull":"bear"}>{direction(row.direction)}</span><span>{numeric(row.entryPrice)??"—"}</span><span>{numeric(row.exitPrice)??"—"}</span><b className={row.net===null?"":row.net>=0?"bull":"bear"}>{row.net===null?"—":display(row.net)}</b><span>{row.running===null?"—":display(row.running)}</span><span>{row.exitReason||"CLOSED"}</span><button type="button" onClick={()=>explain(row.id)} disabled={!row.id}><CircleHelp size={13}/> Explain</button></div>)}
      </div>:<div className="bot-empty">{loading?"Loading trade history…":rows.length?"No trades match this filter.":"No completed paper trades yet."}</div>}
      <p className="history-disclaimer">*Running P&L includes all earlier known rows, even when a filter is active. It is not account equity.</p>
    </section>
    {ex&&<div className="history-modal" onMouseDown={event=>event.target===event.currentTarget&&setEx(null)}><article role="dialog" aria-modal="true" aria-label="Trade explanation"><button type="button" className="history-close" onClick={()=>setEx(null)} aria-label="Close explanation">×</button><span>TRADE EXPLANATION</span><h2>{ex.symbol} · {direction(ex.direction)}</h2>{ex.evidenceMissing?<div className="history-warning">Original entry evidence is unavailable. No explanation has been invented.</div>:<><h3>Entry evidence</h3><pre>{JSON.stringify(ex.entrySnapshot,null,2)}</pre></>}<h3>Direction decision</h3><pre>{JSON.stringify(ex.entryDirectionDecision,null,2)}</pre><h3>Position management</h3><pre>{JSON.stringify(ex.consistencyHistory||[],null,2)}</pre><h3>Recorded result</h3><pre>{JSON.stringify(ex.result,null,2)}</pre></article></div>}
  </main></div>;
}
