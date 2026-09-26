import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  ArrowRight,
  BarChart3,
  Bitcoin,
  BrainCircuit,
  Check,
  ChevronRight,
  Database,
  Gauge,
  Layers3,
  Menu,
  Newspaper,
  Radar,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  X,
} from "lucide-react";
import "../styles/LandingPage.css";

const researchEngines = [
  {
    icon: BarChart3,
    title: "Technical Intelligence",
    text: "Market structure, momentum, trend and price-action measurements organized into explainable research.",
  },
  {
    icon: Database,
    title: "Fundamental Research",
    text: "Company and asset evidence is evaluated independently instead of being hidden inside a single opaque score.",
  },
  {
    icon: Activity,
    title: "Market Pressure",
    text: "Price, volume and market-pressure signals help expose what is happening beneath the headline move.",
  },
  {
    icon: Newspaper,
    title: "Events & News",
    text: "Current events and market narratives are surfaced alongside the underlying research evidence.",
  },
  {
    icon: Radar,
    title: "Discovery & Scanner",
    text: "Continuously narrow a large market universe into a focused list of assets worth deeper investigation.",
  },
  {
    icon: ShieldCheck,
    title: "Risk-Aware Architecture",
    text: "Research, evidence quality and execution readiness remain separate so missing information is never disguised.",
  },
];

const workflow = [
  ["01", "Discover", "Screen the market for assets that meet your research criteria."],
  ["02", "Measure", "Run candidates through independent research engines and evidence checks."],
  ["03", "Explain", "See the metrics, evidence coverage and reasoning behind each research score."],
  ["04", "Research", "Open a focused workspace for deeper stock or crypto investigation."],
];

function MiniTerminal() {
  return (
    <div className="lp-terminal">
      <div className="lp-terminal-top">
        <div className="lp-terminal-dots"><i /><i /><i /></div>
        <span>AEMA / RESEARCH ENGINE</span>
        <span className="lp-live">ILLUSTRATIVE</span>
      </div>

      <div className="lp-terminal-body">
        <div className="lp-terminal-heading">
          <div>
            <span>RESEARCH SNAPSHOT</span>
            <strong>BTC / USD</strong>
          </div>
          <div className="lp-score-ring">
            <strong>82</strong><span>/100</span>
          </div>
        </div>

        <div className="lp-chart">
          <svg viewBox="0 0 700 190" preserveAspectRatio="none" aria-hidden="true">
            <defs>
              <linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="currentColor" stopOpacity=".26" />
                <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path className="lp-chart-area" d="M0 160 C45 150 55 118 96 127 S154 155 190 119 S246 73 282 91 S341 130 377 94 S431 42 470 60 S526 106 560 73 S620 20 700 31 L700 190 L0 190 Z" />
            <path className="lp-chart-line" d="M0 160 C45 150 55 118 96 127 S154 155 190 119 S246 73 282 91 S341 130 377 94 S431 42 470 60 S526 106 560 73 S620 20 700 31" />
          </svg>
        </div>

        <div className="lp-engine-bars">
          {[
            ["Technical", 86],
            ["Market Pressure", 79],
            ["Events", 74],
            ["Fundamental", 81],
          ].map(([name, score]) => (
            <div className="lp-engine-row" key={name}>
              <span>{name}</span>
              <div><i style={{ width: `${score}%` }} /></div>
              <strong>{score}</strong>
            </div>
          ))}
        </div>

        <div className="lp-terminal-footer">
          <span>Example research display</span>
          <strong>BULLISH RESEARCH BIAS</strong>
        </div>
      </div>
    </div>
  );
}

export default function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const close = () => setMenuOpen(false);
    window.addEventListener("resize", close);
    return () => window.removeEventListener("resize", close);
  }, []);

  return (
    <div className="landing-page">
      <header className="lp-nav">
        <Link to="/" className="lp-logo" aria-label="AEMA home">
          <span className="lp-logo-mark"><Layers3 size={21} /></span>
          <span><strong>AEMA</strong><small>ASSET RESEARCH</small></span>
        </Link>

        <nav className={menuOpen ? "open" : ""}>
          <a href="#platform">Platform</a>
          <a href="#research">Research</a>
          <a href="#workflow">How it works</a>
          <a href="#pricing">Pricing</a>
          <Link className="lp-mobile-login" to="/login">Log in</Link>
        </nav>

        <div className="lp-nav-actions">
          <Link className="lp-login" to="/login">Log in</Link>
          <Link className="lp-nav-cta" to="/register">
            Start free <ArrowRight size={15} />
          </Link>
          <button
            className="lp-menu"
            type="button"
            aria-label="Toggle navigation"
            onClick={() => setMenuOpen(v => !v)}
          >
            {menuOpen ? <X /> : <Menu />}
          </button>
        </div>
      </header>

      <main>
        <section className="lp-hero" id="platform">
          <div className="lp-grid-glow" />
          <div className="lp-hero-copy">
            <div className="lp-kicker"><Sparkles size={14} /> MULTI-ENGINE MARKET INTELLIGENCE</div>
            <h1>
              Research markets with
              <span> deeper intelligence.</span>
            </h1>
            <p>
              A professional stock and crypto research workspace that combines
              independent analytical engines, market discovery, evidence and
              current intelligence in one focused system.
            </p>

            <div className="lp-hero-actions">
              <Link className="lp-primary" to="/register">
                Start 7-day free trial <ArrowRight size={17} />
              </Link>
              <a className="lp-secondary" href="#research">
                Explore platform <ChevronRight size={17} />
              </a>
            </div>

            <div className="lp-trust-row">
              <span><Check size={14} /> No card clutter</span>
              <span><Check size={14} /> Cancel anytime — no long-term commitment</span>
              <span><Check size={14} /> Research-first platform</span>
            </div>
          </div>

          <div className="lp-hero-visual">
            <div className="lp-orbit lp-orbit-one" />
            <div className="lp-orbit lp-orbit-two" />
            <MiniTerminal />
            <div className="lp-float-card lp-float-one">
              <Radar size={17} />
              <span>Scanner</span>
              <strong>Illustrative</strong>
            </div>
            <div className="lp-float-card lp-float-two">
              <Newspaper size={17} />
              <span>Live intelligence</span>
              <strong>Multi-source</strong>
            </div>
          </div>
        </section>

        <section className="lp-market-strip">
          <span>STOCKS</span><i />
          <span>CRYPTO</span><i />
          <span>MARKET DISCOVERY</span><i />
          <span>MULTI-ENGINE RESEARCH</span><i />
          <span>EVIDENCE</span><i />
          <span>RISK CONTROLS</span>
        </section>

        <section className="lp-section lp-research" id="research">
          <div className="lp-section-heading">
            <span>THE RESEARCH LAYER</span>
            <h2>One workspace. Multiple independent perspectives.</h2>
            <p>
              AEMA separates research signals so you can inspect what contributed
              to an asset's research profile instead of relying on a black-box answer.
            </p>
          </div>

          <div className="lp-engine-grid">
            {researchEngines.map(({ icon: Icon, title, text }) => (
              <article className="lp-engine-card" key={title}>
                <div className="lp-engine-icon"><Icon size={20} /></div>
                <h3>{title}</h3>
                <p>{text}</p>
                <span>EXPLORE <ArrowRight size={13} /></span>
              </article>
            ))}
          </div>
        </section>

        <section className="lp-section lp-dual">
          <div className="lp-dual-copy">
            <span className="lp-label">TWO MARKETS. ONE RESEARCH SYSTEM.</span>
            <h2>Move between stocks and crypto without changing your workflow.</h2>
            <p>
              Separate workspaces preserve the market-specific tools you need while
              maintaining a consistent research process across the platform.
            </p>
            <div className="lp-checks">
              <span><TrendingUp size={17} /> Stock market universe and research</span>
              <span><Bitcoin size={17} /> Crypto discovery and token research</span>
              <span><BrainCircuit size={17} /> Explainable engine-level scoring</span>
              <span><Gauge size={17} /> Runtime and risk-health visibility</span>
            </div>
          </div>

          <div className="lp-market-cards">
            <div className="lp-market-card">
              <div><TrendingUp /><span>STOCKS</span></div>
              <strong>Market Research</strong>
              <p>Discover, measure and investigate equities through dedicated research engines.</p>
              <div className="lp-mini-stat"><span>UNIVERSE</span><strong>Broad market</strong></div>
            </div>
            <div className="lp-market-card crypto">
              <div><Bitcoin /><span>CRYPTO</span></div>
              <strong>Digital Asset Research</strong>
              <p>Explore tokens, market intelligence, engine evidence and live crypto news.</p>
              <div className="lp-mini-stat"><span>INTELLIGENCE</span><strong>Always on</strong></div>
            </div>
          </div>
        </section>

        <section className="lp-section lp-workflow" id="workflow">
          <div className="lp-section-heading">
            <span>HOW AEMA WORKS</span>
            <h2>From a large market to focused research.</h2>
          </div>

          <div className="lp-workflow-grid">
            {workflow.map(([num, title, text]) => (
              <article key={num}>
                <span>{num}</span>
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="lp-section lp-pricing" id="pricing">
          <div className="lp-price-copy">
            <span className="lp-label">SIMPLE ACCESS</span>
            <h2>Professional research without complicated pricing.</h2>
            <p>
              Explore the full research workspace during your trial, then keep
              access with one straightforward monthly plan.
            </p>
          </div>

          <div className="lp-price-card">
            <span className="lp-price-badge">7 DAYS FREE</span>
            <div className="lp-price">
              <strong>$20</strong><span>USD / month</span>
            </div>
            <p>Full AEMA research workspace access. Cancel anytime.</p>
            <div className="lp-price-features">
              <span><Check /> Stock research workspace</span>
              <span><Check /> Crypto research workspace</span>
              <span><Check /> Scanner & discovery</span>
              <span><Check /> Research engines & evidence</span>
              <span><Check /> Live intelligence feeds</span>
              <span><Check /> Cancel anytime — no long-term commitment</span>
            </div>
            <Link className="lp-primary lp-price-button" to="/register">
              Start free trial <ArrowRight size={17} />
            </Link>
          </div>
        </section>

        <section className="lp-final-cta">
          <div>
            <span>AEMA ASSET RESEARCH</span>
            <h2>See more than the market headline.</h2>
            <p>Build your research process around evidence, measurement and multiple independent signals.</p>
          </div>
          <Link className="lp-primary" to="/register">
            Enter the platform <ArrowRight size={17} />
          </Link>
        </section>
      </main>

      <footer className="lp-footer">
        <Link to="/" className="lp-logo">
          <span className="lp-logo-mark"><Layers3 size={19} /></span>
          <span><strong>AEMA</strong><small>ASSET RESEARCH</small></span>
        </Link>
        <p>
          AEMA provides research tools and information. Platform outputs are not
          personalized investment advice or a recommendation to buy or sell an asset.
        </p>
        <div>
          <a href="#platform">Platform</a>
          <a href="#pricing">Pricing</a>
          <Link to="/login">Login</Link>
        </div>
      </footer>
    </div>
  );
}
