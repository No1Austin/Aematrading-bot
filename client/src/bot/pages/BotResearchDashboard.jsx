import {Activity,ArrowRight,BrainCircuit,Radar,ShieldCheck} from "lucide-react";
import {Link} from "react-router-dom";
import BotSidebar from "../components/BotSidebar.jsx";
import "./BotResearchDashboard.css";

export default function BotResearchDashboard(){
  return <div className="bot-app"><BotSidebar/><main className="research-home">
    <header className="research-home-head">
      <div><span>AEMA PRIVATE FUTURES RESEARCH</span><h1>Research & Setup Workspace</h1>
      <p>Search the futures market on demand, inspect qualified BULL/BEAR setups, model position scenarios, and monitor the thesis after selection.</p></div>
      <div className="research-safe"><ShieldCheck size={16}/>NO AUTOMATIC ORDER EXECUTION</div>
    </header>

    <section className="research-hero">
      <div><span>PRIMARY WORKFLOW</span><h2>Find the strongest setup available now.</h2>
      <p>The private search pipeline is separate from the automatic discovery engine that feeds the existing AEMA research frontend.</p>
      <Link to="/bot/search">Search Market <ArrowRight size={16}/></Link></div>
      <Radar size={90}/>
    </section>

    <section className="research-flow">
      <Flow icon={Radar} n="01" title="Market Search" text="Bybit perpetual universe → eligibility → opportunity ranking → Top 20."/>
      <Flow icon={BrainCircuit} n="02" title="Research" text="Technical, derivatives participation, structure and liquidity evidence are evaluated."/>
      <Flow icon={ShieldCheck} n="03" title="Setup Gate" text="A BULL or BEAR direction still has to pass setup quality, R:R, spread and freshness checks."/>
      <Flow icon={Activity} n="04" title="Monitor" text="Save a setup and compare refreshed evidence against the original thesis."/>
    </section>

    <section className="research-notice">
      <strong>NO SETUP is a valid result.</strong>
      <p>The interface intentionally does not turn every directional reading into a trade setup. Missing evidence stays unavailable rather than being replaced with zero.</p>
    </section>
  </main></div>;
}
function Flow({icon:Icon,n,title,text}){return <article><div><span>{n}</span><Icon size={18}/></div><h3>{title}</h3><p>{text}</p></article>}
