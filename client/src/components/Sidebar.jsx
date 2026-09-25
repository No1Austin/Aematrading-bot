import {
  Activity, BarChart3, Bitcoin, BookOpen, Bot, ChevronRight, Gauge,
  History, LayoutDashboard, Menu, Radar, Settings, WalletCards, X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import "./Sidebar.css";

const primaryItems = [
  ["Dashboard", LayoutDashboard, "/dashboard", "Market overview"],
  ["Markets", BarChart3, "/markets", "Market intelligence"],
  ["Scanner", Radar, "/scanner", "Opportunity scanner"],
  ["Engines", Gauge, "/engines", "Research engines"],
  ["Positions", WalletCards, "/positions", "Tracked positions"],
  ["History", History, "/history", "Research history"],
  ["Research", BookOpen, "/research", "Deep intelligence"],
];

const navClass = ({ isActive }) =>
  ["aema-nav-item", isActive && "active"].filter(Boolean).join(" ");

function Brand() {
  return <>
    <div className="aema-brand-mark"><div className="aema-brand-mark-inner"><Bot size={21} /></div></div>
    <div className="aema-brand-copy">
      <div className="aema-brand-title-row"><strong>AEMA</strong><span className="aema-brand-dot" /></div>
      <span>Market Intelligence</span>
    </div>
  </>;
}

export default function Sidebar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { pathname } = useLocation();
  const cryptoActive = pathname === "/crypto" || pathname.startsWith("/crypto/");

  useEffect(() => setMobileOpen(false), [pathname]);
  useEffect(() => {
    if (!mobileOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event) => event.key === "Escape" && setMobileOpen(false);
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [mobileOpen]);

  return <>
    <header className="aema-sidebar-mobile-bar">
      <div className="aema-sidebar-mobile-brand"><Brand /></div>
      <button type="button" className="aema-sidebar-menu-button" aria-label="Open navigation"
        aria-controls="aema-sidebar-navigation" aria-expanded={mobileOpen}
        onClick={() => setMobileOpen(true)}><Menu size={22} /></button>
    </header>

    <button type="button" aria-label="Close navigation" tabIndex={mobileOpen ? 0 : -1}
      className={["aema-sidebar-backdrop", mobileOpen && "visible"].filter(Boolean).join(" ")}
      onClick={() => setMobileOpen(false)} />

    <aside id="aema-sidebar-navigation" aria-label="Stocks workspace navigation"
      className={["aema-sidebar", mobileOpen && "mobile-open"].filter(Boolean).join(" ")}>
      <div className="aema-sidebar-background" />
      <div className="aema-sidebar-content">
        <div className="aema-sidebar-brand">
          <Brand />
          <button type="button" className="aema-sidebar-close-button" aria-label="Close navigation"
            onClick={() => setMobileOpen(false)}><X size={20} /></button>
        </div>

        <div className="aema-workspace-switcher">
          <div className="aema-sidebar-section-header"><span className="aema-workspace-label">Workspace</span><span className="aema-section-line" /></div>
          <div className="aema-workspace-options">
            <NavLink to="/dashboard" end className={({ isActive }) => ["aema-workspace-button", "stocks", isActive && !cryptoActive && "active"].filter(Boolean).join(" ")}>
              <span className="aema-workspace-icon"><BarChart3 size={18} /></span>
              <div className="aema-workspace-copy"><strong>Stocks</strong><span>Research terminal</span></div>
              <ChevronRight className="aema-workspace-arrow" size={16} />
            </NavLink>
            <NavLink to="/crypto" className={() => ["aema-workspace-button", "crypto", cryptoActive && "active"].filter(Boolean).join(" ")}>
              <span className="aema-workspace-icon"><Bitcoin size={18} /></span>
              <div className="aema-workspace-copy"><strong>Crypto</strong><span>Paper runtime</span></div>
              <span className="aema-workspace-status">PAPER</span>
            </NavLink>
          </div>
        </div>

        <nav className="aema-sidebar-nav" aria-label="Intelligence pages">
          <div className="aema-sidebar-section-header"><span className="aema-nav-section-label">Intelligence</span><span className="aema-section-line" /></div>
          <div className="aema-nav-list">
            {primaryItems.map(([label, Icon, to, description]) =>
              <NavLink key={label} to={to} end={to === "/dashboard"} className={navClass}>
                <span className="aema-nav-active-indicator" />
                <span className="aema-nav-icon"><Icon size={18} /></span>
                <span className="aema-nav-content"><span className="aema-nav-label">{label}</span><span className="aema-nav-description">{description}</span></span>
                <ChevronRight className="aema-nav-chevron" size={15} />
              </NavLink>)}
          </div>
        </nav>

        <div className="aema-sidebar-bottom">
          <div className="aema-sidebar-divider" />
          <button className="aema-nav-item aema-settings-button" type="button">
            <span className="aema-nav-icon"><Settings size={18} /></span>
            <span className="aema-nav-content"><span className="aema-nav-label">Settings</span><span className="aema-nav-description">System preferences</span></span>
            <ChevronRight className="aema-nav-chevron" size={15} />
          </button>
          <div className="aema-system-mini">
            <div className="aema-system-mini-icon"><Activity size={16} /></div>
            <div className="aema-system-mini-copy"><div className="aema-system-status-row"><span className="aema-online-dot" /><strong>System online</strong></div><span>Paper trading environment</span></div>
          </div>
          <div className="aema-sidebar-version"><span>AEMA Research Engine</span><span className="aema-version-tag">v1</span></div>
        </div>
      </div>
    </aside>
  </>;
}
