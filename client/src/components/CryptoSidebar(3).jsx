import {
  Activity,
  BarChart3,
  Bitcoin,
  Compass,
  Gauge,
  LayoutDashboard,
  Menu,
  Radar,
  Search,
  Settings,
  ShieldCheck,
  WalletCards,
  X,
} from "lucide-react";

import {
  useEffect,
  useState,
} from "react";

import {
  NavLink,
  useLocation,
} from "react-router-dom";

import "./CryptoSidebar.css";

const cryptoItems = [
  { label: "Dashboard", icon: LayoutDashboard, to: "/crypto" },
  { label: "Markets", icon: BarChart3, to: "/crypto/markets" },
  { label: "Discovery", icon: Compass, to: "/crypto/discovery" },
  { label: "Scanner", icon: Radar, to: "/crypto/scanner" },
  { label: "Engines", icon: Gauge, to: "/crypto/engines" },
  { label: "Research", icon: Search, to: "/crypto/research" },
  { label: "Positions", icon: WalletCards, to: "/crypto/positions" },
  { label: "Risk & Health", icon: ShieldCheck, to: "/crypto/health" },
];

function navClass({ isActive }) {
  return [
    "crypto-sidebar-nav-item",
    isActive ? "active" : "",
  ].filter(Boolean).join(" ");
}

function Brand() {
  return (
    <>
      <div className="crypto-sidebar-brand-mark">
        <Bitcoin size={18} />
      </div>
      <div className="crypto-sidebar-brand-copy">
        <div className="crypto-sidebar-brand-title">
          <strong>AEMA</strong>
          <span className="crypto-brand-live-dot" />
        </div>
        <span>Crypto Intelligence</span>
      </div>
    </>
  );
}

export default function CryptoSidebar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { pathname } = useLocation();

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen) return undefined;

    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = event => {
      if (event.key === "Escape") setMobileOpen(false);
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [mobileOpen]);

  return (
    <>
      <header className="crypto-sidebar-mobile-bar">
        <div className="crypto-sidebar-mobile-brand"><Brand /></div>
        <button
          type="button"
          className="crypto-sidebar-menu-button"
          aria-label="Open crypto navigation"
          aria-controls="crypto-sidebar-navigation"
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen(true)}
        >
          <Menu size={20} />
        </button>
      </header>

      <button
        type="button"
        className={[
          "crypto-sidebar-backdrop",
          mobileOpen ? "visible" : "",
        ].filter(Boolean).join(" ")}
        aria-label="Close crypto navigation"
        tabIndex={mobileOpen ? 0 : -1}
        onClick={() => setMobileOpen(false)}
      />

      <aside
        id="crypto-sidebar-navigation"
        className={[
          "crypto-sidebar",
          mobileOpen ? "mobile-open" : "",
        ].filter(Boolean).join(" ")}
        aria-label="Crypto workspace navigation"
      >
        <div className="crypto-sidebar-brand">
          <Brand />
          <button
            type="button"
            className="crypto-sidebar-close-button"
            aria-label="Close crypto navigation"
            onClick={() => setMobileOpen(false)}
          >
            <X size={19} />
          </button>
        </div>

        <div className="crypto-sidebar-workspaces">
          <span className="crypto-sidebar-section-label">Workspace</span>

          <div className="crypto-sidebar-workspace-grid">
            <NavLink
              to="/dashboard"
              className="crypto-sidebar-workspace"
            >
              <span className="crypto-sidebar-workspace-icon">
                <BarChart3 size={15} />
              </span>
              <span className="crypto-sidebar-workspace-copy">
                <strong>Stocks</strong>
                <span>Research</span>
              </span>
            </NavLink>

            <NavLink
              to="/crypto"
              end
              className="crypto-sidebar-workspace active"
            >
              <span className="crypto-sidebar-workspace-icon">
                <Bitcoin size={15} />
              </span>
              <span className="crypto-sidebar-workspace-copy">
                <strong>Crypto</strong>
                <span>Research</span>
              </span>
              <span className="crypto-paper-badge">PAPER</span>
            </NavLink>
          </div>
        </div>

        <nav
          className="crypto-sidebar-navigation"
          aria-label="Crypto pages"
        >
          <span className="crypto-sidebar-section-label">Crypto</span>

          <div className="crypto-sidebar-nav">
            {cryptoItems.map(({ label, icon: Icon, to }) => (
              <NavLink
                key={label}
                to={to}
                end={to === "/crypto"}
                className={navClass}
              >
                <span className="crypto-sidebar-nav-icon">
                  <Icon size={16} />
                </span>
                <span className="crypto-sidebar-nav-label">{label}</span>
                <span className="crypto-sidebar-nav-indicator" />
              </NavLink>
            ))}
          </div>
        </nav>

        <div className="crypto-sidebar-bottom">
          <div className="crypto-sidebar-divider" />

          <button
            type="button"
            className="crypto-sidebar-nav-item crypto-sidebar-settings"
          >
            <span className="crypto-sidebar-nav-icon">
              <Settings size={16} />
            </span>
            <span className="crypto-sidebar-nav-label">Settings</span>
          </button>

          <div className="crypto-sidebar-status">
            <div className="crypto-sidebar-status-icon">
              <Activity size={15} />
            </div>
            <div className="crypto-sidebar-status-copy">
              <div className="crypto-sidebar-status-title">
                <span className="crypto-status-dot" />
                <strong>Runtime online</strong>
              </div>
              <span>Paper execution only</span>
            </div>
            <span className="crypto-runtime-badge">LIVE</span>
          </div>

          <div className="crypto-sidebar-footer">
            <span>AEMA Crypto Engine</span>
            <span>PAPER</span>
          </div>
        </div>
      </aside>
    </>
  );
}
