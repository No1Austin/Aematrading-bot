import {Activity, Radio, ShieldCheck} from "lucide-react";
import {useEffect,useRef,useState} from "react";
import {getCexDiscoveryRuntime} from "../services/cryptoApi.js";
export default function CexDiscoveryTerminal(){const [state,setState]=useState(null),[error,setError]=useState("");const box=useRef(null);
 useEffect(()=>{let live=true;const load=async()=>{try{const x=await getCexDiscoveryRuntime();if(live){setState(x);setError("")}}catch(e){if(live)setError(e?.message||"CEX_DISCOVERY_UNAVAILABLE")}};load();const id=setInterval(load,2000);return()=>{live=false;clearInterval(id)}},[]);
 useEffect(()=>{if(box.current)box.current.scrollTop=box.current.scrollHeight},[state?.events?.length]);
 const events=(state?.events||[]).slice(-14);return <section className="cex-live-card"><header><div className="cex-live-title"><Radio size={18}/><div><span>INDEPENDENT MARKET MONITOR</span><h2>CEX Discovery</h2></div></div><b className={state?.running?"on":"off"}><i/>{state?.running?state?.busy?"SCANNING":"RUNNING":"WAITING"}</b></header>
 <div className="cex-live-meta"><span><Activity size={12}/>Cycle {state?.cycle||0}</span><span><ShieldCheck size={12}/>Research only</span><span>Updates without opening this page</span></div>
 <div className="cex-live-terminal" ref={box}><div className="cex-live-top"><i/><i/><i/><strong>aema://cex-discovery</strong></div><div className="cex-live-lines">
 {error?<div className="cex-live-line error"><time>[--:--:--]</time><em>›</em><span>{error}</span></div>:events.length?events.map(e=><div className={`cex-live-line ${e.type||""}`} key={e.id}><time>[{new Date(e.at).toLocaleTimeString()}]</time><em>›</em><span>{e.text}</span></div>):<div className="cex-live-line muted"><time>[{new Date().toLocaleTimeString()}]</time><em>›</em><span>Discovery runtime is starting…</span></div>}
 </div></div><footer><span>Rolling live trace · newest activity stays visible</span><strong>Bullish Direction / Bearish Direction</strong></footer></section>}
