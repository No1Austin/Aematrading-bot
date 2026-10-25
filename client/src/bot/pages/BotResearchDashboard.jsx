import {Activity,ArrowRight,BookOpenText,BrainCircuit,ChartCandlestick,LockKeyhole,Radar,ShieldCheck,TrendingUp} from "lucide-react";
import {Link} from "react-router-dom";
import BotSidebar from "../components/BotSidebar.jsx";
import "./BotResearchDashboard.css";

const modules=[
 {Icon:Radar,number:"01",title:"Crypto discovery",desc:"Discover futures candidates, inspect BULL/BEAR setups and see the full research funnel.",to:"/bot/search",cta:"Open discovery"},
 {Icon:ChartCandlestick,number:"02",title:"Stock intelligence",desc:"Independent equity research, strategy selection and evidence-based qualification.",to:"/bot/stocks",cta:"Explore stocks"},
 {Icon:Activity,number:"03",title:"Thesis monitoring",desc:"Refresh saved setup evidence and compare it against the original research snapshot.",to:"/bot/monitoring",cta:"View monitors"},
 {Icon:BookOpenText,number:"04",title:"Research history",desc:"Review records and outcomes exposed by the existing backend history service.",to:"/bot/history",cta:"Review history"},
];
export default function BotResearchDashboard(){
 return <div className="bot-app"><BotSidebar/><main className="research-home aema-command-center">
   <header className="research-home-head"><div><span>YOUR PRIVATE MARKET INTELLIGENCE WORKSPACE</span><h1>Command Center<span className="aema-title-dot">.</span></h1><p>One place to discover opportunities, understand strategy decisions, and monitor research evidence.</p></div><div className="research-safe"><ShieldCheck size={16}/> RESEARCH ONLY · EXECUTION DISABLED</div></header>
   <section className="research-hero aema-command-hero"><div><span>RESEARCH OPERATIONS</span><h2>Every market move deserves <em>better evidence.</em></h2><p>Analyze crypto futures and equities in separate research pipelines. Review entry, stop, targets and risk before deciding whether to act manually.</p><div className="aema-hero-actions"><Link to="/bot/search">Explore crypto <ArrowRight size={16}/></Link><Link className="aema-hero-secondary" to="/bot/stocks">Stock research <ChartCandlestick size={16}/></Link></div></div><div className="aema-hero-orbit" aria-hidden="true"><div className="aema-orbit-ring"><Activity size={56}/></div><span>DISCOVER / ANALYZE / MONITOR</span></div></section>
   <div className="aema-section-label"><span>WORKSPACE MODULES</span><small>Connected to existing AEMA routes</small></div>
   <section className="research-flow aema-module-grid">{modules.map(({Icon,number,title,desc,to,cta})=><article key={to}><div><span>{number} / MODULE</span><Icon size={21}/></div><h3>{title}</h3><p>{desc}</p><Link to={to}>{cta}<ArrowRight size={15}/></Link></article>)}</section>
   <section className="aema-insight-row"><div className="aema-insight-icon"><BrainCircuit size={23}/></div><div><strong>Performance learning — integration status</strong><p>The current frontend supports setup monitoring and backend history. Automatic trade closure, realized P&L journaling and validated model learning require dedicated backend persistence and outcome endpoints. No results are simulated here.</p></div><LockKeyhole size={20}/></section>
 </main></div>
}
