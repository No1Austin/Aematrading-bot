import {
  Activity, AlertTriangle, ArrowDownRight, ArrowUpRight, CheckCircle2,
  ChevronDown, ChevronRight, Database, ExternalLink, Flame, Gauge, Moon,
  RefreshCw, Search, ShieldAlert, ShieldCheck, Sun, Waves, X, Zap,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import CryptoSidebar from "../components/CryptoSidebar.jsx";
import { getEmergingDexResearch, getSolanaEmergingDexOnChain } from "../services/cryptoApi.js";
import "./CryptoEmergingDex.css";

const EMERGING_DEX_SNAPSHOT_KEY = "aema-emerging-dex-snapshot-v1";

function readSavedSnapshot(){
  try {
    const raw = sessionStorage.getItem(EMERGING_DEX_SNAPSHOT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function candidateCountFromPayload(value){
  const direct = Array.isArray(value?.candidates) ? value.candidates.length : 0;
  const ready = Array.isArray(value?.researchReady) ? value.researchReady.length : 0;
  const top = Array.isArray(value?.topCandidates) ? value.topCandidates.length : 0;
  return Math.max(direct, ready, top, Number(value?.summary?.candidateCount) || 0);
}

const NETWORKS = [
  { key: "ALL", label: "All" }, { key: "solana", label: "Solana" },
  { key: "base", label: "Base" }, { key: "eth", label: "Ethereum" },
  { key: "bsc", label: "BSC" }, { key: "arbitrum", label: "Arbitrum" },
];

const finite = v => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v))) ? null : Number(v);
const arr = v => Array.isArray(v) ? v : [];
const score = v => finite(v) === null ? "—" : finite(v).toFixed(2);
const money = v => {
  const n = finite(v); if (n === null) return "—";
  if (Math.abs(n) > 0 && Math.abs(n) < .01) return `$${n.toLocaleString("en-US", { maximumSignificantDigits: 6 })}`;
  return new Intl.NumberFormat("en-US", { style:"currency", currency:"USD", notation:Math.abs(n)>=1e6?"compact":"standard", maximumFractionDigits:2 }).format(n);
};
const pct = v => finite(v) === null ? "—" : `${finite(v)>0?"+":""}${finite(v).toFixed(2)}%`;
const normNet = v => { const n=String(v??"").toLowerCase(); return n==="ethereum"?"eth":(n==="bnb"||n==="bnb-chain")?"bsc":n; };
const netLabel = v => ({solana:"Solana",base:"Base",eth:"Ethereum",bsc:"BSC",arbitrum:"Arbitrum"}[normNet(v)] ?? v ?? "Unknown");
const dirClass = v => String(v??"NEUTRAL").toUpperCase()==="BULL"?"bull":String(v??"").toUpperCase()==="BEAR"?"bear":"neutral";
const riskClass = v => finite(v)===null?"unknown":finite(v)>=60?"high":finite(v)>=35?"medium":"low";
const scoreClass = v => finite(v)===null?"unknown":finite(v)>=65?"strong":finite(v)>=55?"moderate":"watch";
const keyFor = (a,i=0) => a?.id ?? `${a?.network??"unknown"}:${a?.contractAddress??a?.symbol??i}`;
const shortContract = v => { const s=String(v??""); return !s?"—":s.length<=15?s:`${s.slice(0,7)}…${s.slice(-5)}`; };
function poolAge(a){ const x=finite(a?.poolAgeHours)??finite(a?.emergingDex?.metrics?.poolAgeHours); if(x!==null)return x; const c=a?.poolCreatedAt??a?.createdAt??a?.pairCreatedAt;if(!c)return null;const t=new Date(c).getTime();return Number.isFinite(t)?Math.max(0,(Date.now()-t)/3600000):null; }
const ageLabel=h=>finite(h)===null?"—":finite(h)<1?`${Math.max(1,Math.round(finite(h)*60))}m`:finite(h)<24?`${finite(h).toFixed(1)}h`:`${(finite(h)/24).toFixed(1)}d`;

function Metric({icon:Icon,label,value,detail,tone=""}){return <article className={`emerging-metric ${tone}`}><div className="emerging-metric-top"><span>{label}</span><div className="emerging-metric-icon"><Icon size={17}/></div></div><strong>{value}</strong><small>{detail}</small></article>}
function Direction({value}){const d=String(value??"NEUTRAL").toUpperCase();return <span className={`emerging-direction ${dirClass(d)}`}>{d==="BULL"?<ArrowUpRight size={13}/>:d==="BEAR"?<ArrowDownRight size={13}/>:<Activity size={12}/>} {d}</span>}
function ScoreBar({label,value}){const n=finite(value);return <div className="emerging-score-row"><div className="emerging-score-row-heading"><span>{label}</span><strong>{n===null?"Not measured":n.toFixed(1)}</strong></div><div className="emerging-score-track"><span style={{width:`${n===null?0:Math.min(100,Math.max(0,n))}%`}}/></div></div>}
function Evidence({title,values,type="reason"}){const items=arr(values);return <section className="emerging-evidence-section"><h4>{title}</h4>{items.length?<div className="emerging-evidence-list">{items.map((x,i)=><div className={`emerging-evidence ${type}`} key={`${String(x)}-${i}`}>{type==="warning"?<AlertTriangle size={14}/>:<CheckCircle2 size={14}/>}<span>{String(x)}</span></div>)}</div>:<p className="emerging-unavailable">No {title.toLowerCase()} were supplied by the research engine.</p>}</section>}

function OnChain({asset,result,loading,error,onRun}){
  if(normNet(asset?.network)!=="solana") return <section className="emerging-onchain-card unavailable"><div className="emerging-panel-heading"><div><span>ON-CHAIN INTELLIGENCE</span><h3>Wallet & holder research</h3></div><ShieldCheck size={18}/></div><p>On-chain research is not connected for this network yet.</p></section>;
  if(!result) return <section className="emerging-onchain-card"><div className="emerging-panel-heading"><div><span>SOLANA ON-CHAIN</span><h3>Wallet & holder research</h3></div><Waves size={18}/></div><p>Run the backend Solana research layer to inspect holder concentration, material wallet flow and token authority evidence. This does not change the production Emerging DEX score.</p>{error?<div className="emerging-inline-error"><AlertTriangle size={14}/><span>{error}</span></div>:null}<button className="emerging-onchain-button" onClick={onRun} disabled={loading}>{loading?<RefreshCw size={15} className="emerging-spin"/>:<Zap size={15}/>} {loading?"Running research":"Run On-chain Research"}</button></section>;
  const r=result?.onChain??result; const market=finite(r?.marketScore??r?.scores?.marketScore); const whale=finite(r?.whaleFlowScore??r?.whaleScore??r?.scores?.whaleScore); const preview=finite(r?.previewScore??r?.researchPreview?.score??r?.combinedPreview?.score); const wallets=finite(r?.materialFlowWallets??r?.walletIntelligence?.materialFlowWallets); const conf=finite(r?.onChainConfidence??r?.evidenceCompleteness);
  return <section className="emerging-onchain-card completed"><div className="emerging-panel-heading"><div><span>SOLANA ON-CHAIN</span><h3>Research evidence</h3></div><ShieldCheck size={18}/></div><div className="emerging-onchain-grid"><div><span>Market score</span><strong>{score(market)}</strong></div><div><span>Whale flow</span><strong>{score(whale)}</strong></div><div><span>Material wallets</span><strong>{wallets??"—"}</strong></div><div><span>Evidence coverage</span><strong>{conf===null?"—":`${conf.toFixed(1)}%`}</strong></div></div>{preview!==null?<div className="emerging-preview"><span>Experimental on-chain research preview</span><strong>{preview.toFixed(2)}</strong><small>Experimental evidence only. The production Emerging DEX score above remains unchanged.</small></div>:null}<button className="emerging-onchain-button secondary" onClick={onRun} disabled={loading}><RefreshCw size={14} className={loading?"emerging-spin":""}/> Re-run research</button></section>;
}

function Drawer({asset,onClose,onChainResult,onChainLoading,onChainError,onRunOnChain}){
 if(!asset)return null; const e=asset?.emergingDex??{}; const comps=Object.entries(e?.components??{}).map(([k,v])=>[k,typeof v==="object"?finite(v?.score??v?.value):finite(v)]).filter(([,v])=>v!==null);
 return <><button className="emerging-drawer-backdrop" onClick={onClose} aria-label="Close token research"/><aside className="emerging-drawer"><header className="emerging-drawer-header"><div className="emerging-token-heading"><div className="emerging-token-mark">{String(asset?.symbol??"?").slice(0,1).toUpperCase()}</div><div><div className="emerging-token-title-line"><h2>{asset?.symbol??"Unknown"}</h2><Direction value={e?.direction}/></div><p>{asset?.name??"Emerging DEX asset"}</p></div></div><button className="emerging-close" onClick={onClose}><X size={19}/></button></header><div className="emerging-drawer-body">
 <section className="emerging-primary-score"><div><span>Emerging DEX Score</span><strong className={scoreClass(e?.score)}>{score(e?.score)}</strong><small>{e?.grade?`Grade ${e.grade}`:"Research score"}</small></div><div><span>Risk Score</span><strong className={riskClass(e?.riskScore)}>{score(e?.riskScore)}</strong><small>Higher means more observed risk</small></div><div><span>Data Quality</span><strong>{score(e?.dataQualityScore)}</strong><small>Evidence coverage</small></div></section>
 <section className="emerging-detail-grid"><div><span>Price</span><strong>{money(asset?.priceUsd)}</strong></div><div><span>Market Cap</span><strong>{money(asset?.marketCapUsd)}</strong></div><div><span>FDV</span><strong>{money(asset?.fdvUsd)}</strong></div><div><span>Liquidity</span><strong>{money(asset?.liquidityUsd)}</strong></div><div><span>Volume 24H</span><strong>{money(asset?.volume24hUsd)}</strong></div><div><span>Pool Age</span><strong>{ageLabel(poolAge(asset))}</strong></div></section>
 <section className="emerging-activity-card"><div className="emerging-panel-heading"><div><span>MARKET ACTIVITY</span><h3>Volume & momentum</h3></div><Activity size={18}/></div><div className="emerging-activity-grid"><div><span>5M volume</span><strong>{money(asset?.volume5mUsd)}</strong></div><div><span>1H volume</span><strong>{money(asset?.volume1hUsd)}</strong></div><div><span>6H volume</span><strong>{money(asset?.volume6hUsd)}</strong></div><div><span>24H volume</span><strong>{money(asset?.volume24hUsd)}</strong></div><div><span>5M change</span><strong>{pct(asset?.priceChange5mPercent??asset?.change5mPercent)}</strong></div><div><span>1H change</span><strong>{pct(asset?.priceChange1hPercent??asset?.change1hPercent)}</strong></div><div><span>6H change</span><strong>{pct(asset?.priceChange6hPercent??asset?.change6hPercent)}</strong></div><div><span>24H change</span><strong>{pct(asset?.priceChange24hPercent??asset?.change24hPercent)}</strong></div></div></section>
 {comps.length?<section className="emerging-components-card"><div className="emerging-panel-heading"><div><span>SCORE EXPLANATION</span><h3>Engine components</h3></div><Gauge size={18}/></div><div className="emerging-score-list">{comps.map(([k,v])=><ScoreBar key={k} label={k.replace(/([A-Z])/g," $1").replace(/^./,c=>c.toUpperCase())} value={v}/>)}</div></section>:null}
 <Evidence title="Research reasons" values={e?.reasons}/><Evidence title="Warnings" values={e?.warnings} type="warning"/><OnChain asset={asset} result={onChainResult} loading={onChainLoading} error={onChainError} onRun={onRunOnChain}/><section className="emerging-contract-card"><div><span>Network</span><strong>{netLabel(asset?.network)}</strong></div><div><span>Contract</span><code>{asset?.contractAddress??"Unavailable"}</code></div>{asset?.url?<a href={asset.url} target="_blank" rel="noreferrer">View market source <ExternalLink size={13}/></a>:null}</section>
 </div></aside></>;
}

export default function CryptoEmergingDex(){
 const savedSnapshot=useMemo(()=>readSavedSnapshot(),[]);
 const [payload,setPayload]=useState(()=>savedSnapshot?.payload??null),[loading,setLoading]=useState(()=>!savedSnapshot?.payload),[refreshing,setRefreshing]=useState(false),[error,setError]=useState(""),[query,setQuery]=useState(""),[network,setNetwork]=useState("ALL"),[sort,setSort]=useState("SCORE"),[selected,setSelected]=useState(null),[onChainResults,setOnChainResults]=useState({}),[onChainLoading,setOnChainLoading]=useState(false),[onChainError,setOnChainError]=useState(""),[lastUpdated,setLastUpdated]=useState(()=>savedSnapshot?.savedAt?new Date(savedSnapshot.savedAt):null),[coverageOpen,setCoverageOpen]=useState(false);
 const [theme,setTheme]=useState(()=>{const s=localStorage.getItem("aema-emerging-dex-theme");return s==="dark"||s==="light"?s:(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light")});
 useEffect(()=>localStorage.setItem("aema-emerging-dex-theme",theme),[theme]);
 const load=useCallback(async({manual=false}={})=>{
   try{
     manual?setRefreshing(true):setLoading(true);
     setError("");
     const r=await getEmergingDexResearch();
     const current=readSavedSnapshot();
     const currentCount=candidateCountFromPayload(current?.payload);
     const nextCount=candidateCountFromPayload(r);

     // A temporary provider/rate-limit failure must not erase a good research snapshot.
     if(manual && currentCount>0 && nextCount===0){
       setPayload(current.payload);
       setLastUpdated(current?.savedAt?new Date(current.savedAt):null);
       setError("Refresh incomplete — displaying the previous successful research snapshot.");
       return;
     }

     const savedAt=new Date().toISOString();
     setPayload(r??null);
     setLastUpdated(new Date(savedAt));
     sessionStorage.setItem(EMERGING_DEX_SNAPSHOT_KEY,JSON.stringify({payload:r??null,savedAt}));
   }catch(e){
     const current=readSavedSnapshot();
     if(current?.payload){
       setPayload(current.payload);
       setLastUpdated(current?.savedAt?new Date(current.savedAt):null);
       setError("Refresh unavailable — displaying the previous successful research snapshot.");
     }else{
       setError(e?.data?.error??e?.message??"Unable to load Emerging DEX research.");
     }
   }finally{
     setLoading(false);
     setRefreshing(false);
   }
 },[]);
 useEffect(()=>{if(payload){setLoading(false);return;}void load()},[payload,load]);
 useEffect(()=>{if(!selected)return;const f=e=>e.key==="Escape"&&setSelected(null);document.body.style.overflow="hidden";addEventListener("keydown",f);return()=>{document.body.style.overflow="";removeEventListener("keydown",f)}},[selected]);
 const candidates=useMemo(()=>{const a=arr(payload?.candidates);if(a.length)return a;const b=arr(payload?.researchReady);return b.length?b:arr(payload?.topCandidates)},[payload]);
 const summary=payload?.summary??{}, counts=summary?.directionCounts??payload?.directionCounts??{};
 const visible=useMemo(()=>{const q=query.trim().toLowerCase();return [...candidates].filter(a=>(network==="ALL"||normNet(a?.network)===network)&&(!q||[a?.symbol,a?.name,a?.contractAddress,a?.network].some(v=>String(v??"").toLowerCase().includes(q)))).sort((a,b)=>sort==="RISK"?(finite(a?.emergingDex?.riskScore)??Infinity)-(finite(b?.emergingDex?.riskScore)??Infinity):sort==="LIQUIDITY"?(finite(b?.liquidityUsd)??-Infinity)-(finite(a?.liquidityUsd)??-Infinity):sort==="VOLUME"?(finite(b?.volume24hUsd)??-Infinity)-(finite(a?.volume24hUsd)??-Infinity):sort==="AGE"?(poolAge(a)??Infinity)-(poolAge(b)??Infinity):(finite(b?.emergingDex?.score)??-Infinity)-(finite(a?.emergingDex?.score)??-Infinity))},[candidates,query,network,sort]);
 const partial=String(summary?.discovery?.status??"").toUpperCase()==="PARTIAL", selectedKey=selected?keyFor(selected):null;
 async function runOnChain(){if(!selected||normNet(selected?.network)!=="solana"||!selected?.contractAddress)return;try{setOnChainLoading(true);setOnChainError("");const r=await getSolanaEmergingDexOnChain({contract:selected.contractAddress});setOnChainResults(x=>({...x,[selectedKey]:r}))}catch(e){setOnChainError(e?.data?.error??e?.message??"On-chain research is unavailable.")}finally{setOnChainLoading(false)}}
 const metrics=[{icon:Database,label:"Discovered",value:summary?.discovery?.discovered??candidates.length,detail:"DEX assets observed"},{icon:Flame,label:"Candidates",value:summary?.candidateCount??candidates.length,detail:"Emerging candidates"},{icon:ShieldCheck,label:"Research Ready",value:summary?.researchReadyCount??arr(payload?.researchReady).length,detail:"Passed research thresholds"},{icon:ArrowUpRight,label:"BULL",value:counts?.BULL??0,detail:"Bullish research direction",tone:"positive"},{icon:Activity,label:"NEUTRAL",value:counts?.NEUTRAL??0,detail:"Mixed research evidence"},{icon:ArrowDownRight,label:"BEAR",value:counts?.BEAR??0,detail:"Bearish research direction",tone:"negative"}];
 return <div className={`emerging-shell emerging-theme-${theme}`}><CryptoSidebar/><main className="emerging-page"><section className="emerging-header"><div className="emerging-heading"><span className="emerging-eyebrow">AEMA Crypto Intelligence</span><h1>Emerging DEX</h1><p>Early-market intelligence across decentralized exchanges. Candidates are ranked from available market evidence and remain research-only.</p></div><div className="emerging-header-actions"><button className="emerging-theme-toggle" onClick={()=>setTheme(t=>t==="dark"?"light":"dark")}>{theme==="dark"?<Sun size={17}/>:<Moon size={17}/>}</button><button className="emerging-refresh" disabled={refreshing} onClick={()=>void load({manual:true})}><RefreshCw size={16} className={refreshing?"emerging-spin":""}/>{refreshing?"Refreshing":"Refresh"}</button></div></section>
 {error?<section className="emerging-error"><div><strong>Emerging DEX data unavailable</strong><span>{error}</span></div><button onClick={()=>void load({manual:true})}>Try again</button></section>:null}
 {partial?<section className={`emerging-coverage-panel ${coverageOpen?"open":""}`}><button className="emerging-coverage-trigger" onClick={()=>setCoverageOpen(x=>!x)} aria-expanded={coverageOpen}><div className="emerging-coverage-trigger-left"><div className="emerging-coverage-icon"><AlertTriangle size={17}/></div><div><strong>Partial market coverage</strong><span>Some DEX data providers were unavailable or rate-limited during this research cycle.</span></div></div><div className="emerging-coverage-action"><span>{coverageOpen?"Hide details":"View details"}</span><ChevronDown size={17} className={coverageOpen?"open":""}/></div></button>{coverageOpen?<div className="emerging-coverage-details"><div className="emerging-coverage-note"><ShieldAlert size={16}/><div><strong>Coverage notice</strong><p>Rankings only reflect evidence successfully retrieved during this cycle. Missing networks and providers are not treated as zero-value evidence.</p></div></div>{arr(summary?.discovery?.errors).length?<div className="emerging-provider-errors">{summary.discovery.errors.map((x,i)=>{const m=typeof x==="string"?x:x?.message??x?.error??JSON.stringify(x);return <div className="emerging-provider-error" key={`${m}-${i}`}><AlertTriangle size={13}/><span>{m}</span></div>})}</div>:<div className="emerging-provider-error muted"><Activity size={13}/><span>The backend reported partial coverage but did not provide individual provider errors.</span></div>}</div>:null}</section>:null}
 <section className="emerging-metrics">{metrics.map(m=><Metric key={m.label} {...m}/>)}</section><section className="emerging-research-card"><div className="emerging-toolbar"><div className="emerging-toolbar-heading"><span>EARLY MARKET RESEARCH</span><h2>Emerging candidates</h2><p>{visible.length} assets in the current view</p></div><div className="emerging-toolbar-controls"><label className="emerging-search"><Search size={15}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search token or contract"/></label><label className="emerging-sort-control"><span className="emerging-sort-label">SORT BY</span><select value={sort} onChange={e=>setSort(e.target.value)}><option value="SCORE">Emerging Score</option><option value="RISK">Lowest Risk</option><option value="LIQUIDITY">Liquidity</option><option value="VOLUME">24H Volume</option><option value="AGE">Newest Pool</option></select><ChevronDown size={15} className="emerging-sort-chevron"/></label></div></div>
 <div className="emerging-network-tabs">{NETWORKS.map(n=><button key={n.key} className={network===n.key?"active":""} onClick={()=>setNetwork(n.key)}>{n.label}</button>)}</div><div className="emerging-table-wrap"><table className="emerging-table"><thead><tr><th>Token</th><th>Chain</th><th>Emerging Score</th><th>Direction</th><th>Risk</th><th>Liquidity</th><th>Volume 24H</th><th>Market Cap</th><th>Pool Age</th><th/></tr></thead><tbody>{visible.map((a,i)=>{const e=a?.emergingDex??{};return <tr key={keyFor(a,i)} onClick={()=>{setSelected(a);setOnChainError("")}}><td><div className="emerging-symbol"><div className="emerging-symbol-mark">{String(a?.symbol??"?").slice(0,1).toUpperCase()}</div><div><strong>{a?.symbol??"—"}</strong><span>{a?.name??shortContract(a?.contractAddress)}</span></div></div></td><td><span className="emerging-chain">{netLabel(a?.network)}</span></td><td><div className="emerging-table-score"><strong className={scoreClass(e?.score)}>{score(e?.score)}</strong><span>{e?.grade?`Grade ${e.grade}`:""}</span></div></td><td><Direction value={e?.direction}/></td><td><span className={`emerging-risk ${riskClass(e?.riskScore)}`}>{score(e?.riskScore)}</span></td><td>{money(a?.liquidityUsd)}</td><td>{money(a?.volume24hUsd)}</td><td>{money(a?.marketCapUsd)}</td><td>{ageLabel(poolAge(a))}</td><td><ChevronRight size={15}/></td></tr>})}</tbody></table>{loading?<div className="emerging-loading"><RefreshCw size={20} className="emerging-spin"/><strong>Researching emerging DEX markets</strong><span>Reading the discovery and Emerging DEX engines…</span></div>:null}{!loading&&!error&&!visible.length?<div className="emerging-empty"><Flame size={20}/><strong>No candidates in this view</strong><span>No placeholder tokens are created. Adjust the chain or search filters, or refresh the live research.</span></div>:null}</div></section><footer className="emerging-footer"><span>Research only · No execution authority · Missing evidence remains unavailable</span><span>{lastUpdated?`Updated ${lastUpdated.toLocaleTimeString()}`:"Awaiting research"}</span></footer></main><Drawer asset={selected} onClose={()=>setSelected(null)} onChainResult={selectedKey?onChainResults[selectedKey]:null} onChainLoading={onChainLoading} onChainError={onChainError} onRunOnChain={()=>void runOnChain()}/></div>;
}
