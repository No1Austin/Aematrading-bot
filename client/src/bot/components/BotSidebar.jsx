import {Bot,History,LayoutDashboard,LogOut,Radar,Activity,SlidersHorizontal} from "lucide-react";
import {NavLink} from "react-router-dom";
import {logoutBot} from "../services/botApi.js";
import "./BotSidebar.css";

export default function BotSidebar(){
  const items=[
    ["Overview","/bot",LayoutDashboard,true],
    ["Search Market","/bot/search",Radar,false],
    ["Monitoring","/bot/monitoring",Activity,false],
    ["Legacy Controls","/bot/controls",SlidersHorizontal,false],
    ["Legacy History","/bot/history",History,false],
  ];
  return <aside className="bot-side">
    <div className="bot-brand"><Bot size={20}/><div><strong>AEMA BOT</strong><span>PRIVATE · RESEARCH</span></div></div>
    <nav>{items.map(([label,to,Icon,end])=>
      <NavLink key={to} end={end} to={to} className={({isActive})=>isActive?"active":""}>
        <Icon size={17}/><span>{label}</span>
      </NavLink>
    )}</nav>
    <button onClick={async()=>{await logoutBot();location.href="/bot"}}>
      <LogOut size={16}/>Lock Bot
    </button>
  </aside>;
}
