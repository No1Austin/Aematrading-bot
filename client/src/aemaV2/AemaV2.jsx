import {useState} from 'react';
import './aemaV2.css';
import './refineEntry.css';
const fmt = x => typeof x==='number' && Number.isFinite(x) ? x.toLocaleString(undefined,{maximumFractionDigits:8}) : '—';
export default function AemaV2(){
 const [market,setMarket]=useState('crypto'),[symbol,setSymbol]=useState('BTC_USDT');
 const [data,setData]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [refining,setRefining]=useState(false),[refinement,setRefinement]=useState(null),[refineError,setRefineError]=useState('');
 function reset(){setData(null);setRefinement(null);setRefineError('');setError('');}
 async function post(path,body){const r=await fetch(`/api/crypto/bot/v2/${path}`,{method:'POST',credentials:'include',
   headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
   const x=await r.json();if(!r.ok)throw Error(x.error||`HTTP ${r.status}`);return x;}
 async function run(){setBusy(true);reset();try{setData(await post('analyze',{market,symbol:symbol.trim().toUpperCase()}));}
  catch(e){setError(e.message)}finally{setBusy(false)}}
 async function refine(){if(!data?.setupId)return;setRefining(true);setRefineError('');setRefinement(null);
  try{setRefinement(await post('refine-entry',{setupId:data.setupId}));}
  catch(e){setRefineError(e.message)}finally{setRefining(false)}}
 const primary=data?.diagnostics?.primary,entry=data?.diagnostics?.entry,context=data?.diagnostics?.context;
 return <main className="aema-v2"><header><div><small>AEMA / V2 RESEARCH</small><h1>Market Intelligence V2</h1><p>Independent candle decisions · no live execution</p></div><span className="v2-badge">RESEARCH ONLY</span></header>
 <section className="v2-panel"><div className="v2-tabs"><button className={market==='crypto'?'active':''} onClick={()=>{setMarket('crypto');setSymbol('BTC_USDT');reset()}}>Crypto futures</button><button className={market==='stocks'?'active':''} onClick={()=>{setMarket('stocks');setSymbol('AAPL');reset()}}>Stocks</button></div>
 <label>Symbol<input value={symbol} onChange={e=>{setSymbol(e.target.value);reset()}} placeholder={market==='crypto'?'BTC_USDT':'AAPL'}/></label>
 <button className="v2-run" disabled={busy||refining||!symbol.trim()} onClick={run}>{busy?'Analyzing…':'Analyze market'}</button>{error&&<p role="alert" className="v2-error">{error}</p>}</section>
 {data&&<section className="v2-panel"><div className="v2-summary"><div><small>MARKET</small><strong>{data.symbol}</strong></div><div><small>DIRECTION</small><strong>{data.direction??'WAIT'}</strong></div><div><small>STATUS</small><strong>{data.status}</strong></div></div><p>{data.reason}</p>
 <div className="v2-summary">{[['15M PRIMARY',primary?.direction],['5M ENTRY',entry?.direction],['1H CONTEXT',context?.direction]].map(([k,v])=><div key={k}><small>{k}</small><strong>{v??'NEUTRAL / N/A'}</strong></div>)}</div>
 <div className="v2-summary">{[['ENTRY REFERENCE',data.entryReference??data.entry],['STOP REFERENCE',data.stopReference??data.stop],['TARGET (UNVALIDATED)',data.targetIllustration??data.target]].map(([k,v])=><div key={k}><small>{k}</small><strong>{fmt(v)}</strong></div>)}</div>
 {data.setupId&&<div className="v2-refine-actions"><button className="v2-run" disabled={busy||refining} onClick={refine}>{refining?'Refining with fresh candles…':'✦ Refine Entry'}</button><small>Optional analysis · original setup remains unchanged</small></div>}
 {refineError&&<p role="alert" className="v2-error">{refineError}</p>}
 {refinement&&<section className="v2-refine-result" aria-live="polite"><h3>Refinement: {refinement.decision}</h3><p>{refinement.reason?.replaceAll('_',' ')}</p>
 <div className="v2-summary"><div><small>ORIGINAL ENTRY</small><strong>{fmt(refinement.original?.entry)}</strong></div><div><small>FRESH ENTRY</small><strong>{fmt(refinement.current?.entry)}</strong></div><div><small>PROPOSED PULLBACK</small><strong>{fmt(refinement.refined?.entry)}</strong></div></div>
 {refinement.refined&&<><div className="v2-summary"><div><small>PROPOSED STOP</small><strong>{fmt(refinement.refined.stop)}</strong></div><div><small>PROPOSED TARGET</small><strong>{fmt(refinement.refined.target)}</strong></div><div><small>EST. NET R:R</small><strong>{fmt(refinement.refined.estimatedNetRR)}</strong></div></div><p>Hypothetical limit entry only. It may never fill; reconfirm before using.</p></>}
 <p>No values are automatically applied or traded. New candle data may invalidate the original setup.</p></section>}
 <p>Research only. No setup has been validated for trading.</p><details><summary>Full candle diagnostics</summary><pre>{JSON.stringify(data,null,2)}</pre></details></section>}</main>;
}
