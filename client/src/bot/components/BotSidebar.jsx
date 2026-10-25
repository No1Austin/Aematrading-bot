import {Activity, ArrowUpRight, BookOpenText, BrainCircuit, ChartCandlestick, LayoutDashboard, LockKeyhole, Radar, SlidersHorizontal} from "lucide-react";
import {NavLink} from "react-router-dom";
import {logoutBot} from "../services/botApi.js";
import "./BotSidebar.css";

const items=[
  {label:"Command Center",to:"/bot",Icon:LayoutDashboard,end:true},
  {label:"Crypto Discovery",to:"/bot/search",Icon:Radar},
  {label:"Stock Intelligence",to:"/bot/stocks",Icon:ChartCandlestick},
  {label:"Trade Monitoring",to:"/bot/monitoring",Icon:Activity},
  {label:"Trade History",to:"/bot/history",Icon:BookOpenText},
  {label:"Risk Controls",to:"/bot/controls",Icon:SlidersHorizontal},
];
export default function BotSidebar(){
 return <aside className="bot-side" aria-label="AEMA private research navigation">
   <NavLink className="bot-brand" to="/bot" aria-label="AEMA Intelligence home">
     <span className="bot-brand-mark"><Activity size={23} strokeWidth={2.3}/></span>
     <span className="bot-brand-copy"><strong>AEMA<span> / INTELLIGENCE</span></strong><small>PRIVATE RESEARCH TERMINAL</small></span>
   </NavLink>
   <div className="bot-side-section">WORKSPACE</div>
   <nav aria-label="Workspace">{items.map(({label,to,Icon,end})=><NavLink key={to} end={Boolean(end)} to={to} className={({isActive})=>isActive?"active":""}><Icon size={18} strokeWidth={1.8}/><span>{label}</span><ArrowUpRight className="bot-nav-arrow" size={14}/></NavLink>)}</nav>
   <div className="bot-side-bottom">
     <div className="bot-compliance"><BrainCircuit size={18}/><div><strong>Research-only mode</strong><small>No automated order execution</small></div><span className="bot-status-dot"/></div>
     <button type="button" onClick={async()=>{try{await logoutBot()}finally{window.location.assign("/bot")}}}><LockKeyhole size={17}/> Lock Workspace</button>
   </div>
 </aside>
}
