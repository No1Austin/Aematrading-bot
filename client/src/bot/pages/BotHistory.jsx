import {CircleHelp,History} from "lucide-react";
import {useEffect,useMemo,useState} from "react";
import BotSidebar from "../components/BotSidebar.jsx";
import {getBotHistory,getTradeExplanation} from "../services/botApi.js";
import "./BotHistory.css";

const numeric = value => value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value)) ? Number(value) : null;
const usd = value => new Intl.NumberFormat("en-CA",{style:"currency",currency:"USD"}).format(value);
const cad = value => new Intl.NumberFormat("en-CA",{style:"currency",currency:"CAD"}).format(value);
const direction = side => side === "LONG" ? "Bullish Direction" : side === "SHORT" ? "Bearish Direction" : "—";

export default function BotHistory(){
  const [rows,setRows]=useState([]);
  const [err,setErr]=useState("");
  const [ex,setEx]=useState(null);
  const [rateInput,setRateInput]=useState("");
  const [rateDate,setRateDate]=useState("");
  const rate=numeric(rateInput);
  const validRate=rate!==null&&rate>0&&Boolean(rateDate);
  const load=()=>getBotHistory().then(data=>setRows(Array.isArray(data.trades)?data.trades:[])).catch(error=>setErr(error.message));
  useEffect(()=>{load()},[]);
  const stats=useMemo(()=>{
    const known=rows.map(row=>({...row,net:numeric(row.realizedPnlUsd)})).filter(row=>row.net!==null);
    const wins=known.filter(row=>row.net>0),losses=known.filter(row=>row.net<0),even=known.filter(row=>row.net===0);
    const sum=items=>items.reduce((total,row)=>total+row.net,0);
    return {wins:wins.length,losses:losses.length,even:even.length,unknown:rows.length-known.length,
      grossWins:sum(wins),grossLosses:sum(losses),net:sum(known),known:known.length};
  },[rows]);
  const display=amount=>validRate?cad(amount*rate):usd(amount);
  const explain=async id=>{try{setEx(await getTradeExplanation(id))}catch(error){setErr(error.message)}};
  let cumulative=0;
  return <div className="bot-app"><BotSidebar/><main className="bot-main history-page">
    <header><div><span>COMPLETED PAPER TRADES</span><h1>Trade History</h1><p>Closed positions, realized outcomes and their recorded decision evidence.</p></div><b><i/>PAPER · LIVE DISABLED</b></header>
    {err&&<div className="bot-error">{err}</div>}
    <section className="history-currency"><div><strong>Display currency</strong><p>Ledger remains in USD. Enter a verified USD → CAD rate and its date to view a CAD estimate.</p></div>
      <label>1 USD in CAD<input type="number" min="0.000001" step="0.0001" value={rateInput} onChange={event=>setRateInput(event.target.value)} placeholder="Enter verified rate"/></label>
      <label>Rate date<input type="date" value={rateDate} onChange={event=>setRateDate(event.target.value)}/></label>
      <span className="history-rate-status">{validRate?`CAD estimate at ${rate} (${rateDate})`:"Showing original USD amounts"}</span>
    </section>
    <section className="history-stats" aria-label="Closed trade performance">
      <div><span>Gross winning trades</span><strong className="bull">{display(stats.grossWins)}</strong><small>{stats.wins} winning positions</small></div>
      <div><span>Gross losing trades</span><strong className="bear">{display(stats.grossLosses)}</strong><small>{stats.losses} losing positions</small></div>
      <div><span>Net closed-position P&L</span><strong className={stats.net>=0?"bull":"bear"}>{display(stats.net)}</strong><small>From returned history rows only</small></div>
      <div><span>Win rate</span><strong>{stats.wins+stats.losses?`${(100*stats.wins/(stats.wins+stats.losses)).toFixed(1)}%`:"—"}</strong><small>{stats.even} breakeven · {stats.unknown} without P&L</small></div>
      <div><span>Average win</span><strong>{stats.wins?display(stats.grossWins/stats.wins):"—"}</strong></div>
      <div><span>Average loss</span><strong>{stats.losses?display(stats.grossLosses/stats.losses):"—"}</strong></div>
    </section>
    <p className="history-disclaimer">CAD values are estimates using one manually entered rate, not historical transaction-date conversions. This summary covers closed positions returned by History; partial exits, fees or funding are included only if the API includes them in each trade's realized P&L. Reconcile with the ledger before treating it as full account P&L.</p>
    <section className="history-panel"><div className="panel-head"><div><span>LEDGER</span><h2>Completed Trades</h2></div><button type="button" className="history-refresh" onClick={load}>Refresh <History size={16}/></button></div>
      {rows.length?<div className="history-table"><div className="history-row head"><span>Symbol</span><span>Direction</span><span>Entry</span><span>Exit</span><span>Realized P&L</span><span>Running P&L*</span><span>Reason</span><span></span></div>
        {[...rows].sort((a,b)=>new Date(a.closedAt??a.exitAt??0)-new Date(b.closedAt??b.exitAt??0)).map(row=>{
          const pnl=numeric(row.realizedPnlUsd);if(pnl!==null)cumulative+=pnl;
          return <div className="history-row" key={row.id}><strong>{row.symbol}</strong><span className={row.direction==="LONG"?"bull":"bear"}>{direction(row.direction)}</span><span>{numeric(row.entryPrice)??"—"}</span><span>{numeric(row.exitPrice)??"—"}</span><b className={pnl!==null&&pnl>=0?"bull":"bear"}>{pnl===null?"—":display(pnl)}</b><span>{pnl===null?"—":display(cumulative)}</span><span>{row.exitReason||"CLOSED"}</span><button type="button" onClick={()=>explain(row.id)}><CircleHelp size={13}/>Explain</button></div>;
        })}</div>:<div className="bot-empty">No completed paper trades yet.</div>}
      <p className="history-disclaimer">*Running P&L sums available closed-position rows in chronological order; it is not account equity.</p>
    </section>
    {ex&&<div className="history-modal" onMouseDown={event=>event.target===event.currentTarget&&setEx(null)}><article><button className="history-close" onClick={()=>setEx(null)}>×</button><span>TRADE EXPLANATION</span><h2>{ex.symbol} · {direction(ex.direction)}</h2>{ex.evidenceMissing?<div className="history-warning">Original entry evidence is unavailable. No explanation has been invented.</div>:<><h3>Entry evidence</h3><pre>{JSON.stringify(ex.entrySnapshot,null,2)}</pre></>}<h3>Direction decision</h3><pre>{JSON.stringify(ex.entryDirectionDecision,null,2)}</pre><h3>Position management</h3><pre>{JSON.stringify(ex.consistencyHistory||[],null,2)}</pre><h3>Recorded result</h3><pre>{JSON.stringify(ex.result,null,2)}</pre></article></div>}
  </main></div>;
}
