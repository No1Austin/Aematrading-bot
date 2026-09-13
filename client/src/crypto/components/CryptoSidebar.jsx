// client/src/crypto/components/CryptoSidebar.jsx

import {
  Activity,
  BarChart3,
  Bitcoin,
  CandlestickChart,
  Clock3,
  Compass,
  Gauge,
  LayoutDashboard,
  ListOrdered,
  Radar,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  WalletCards,
} from "lucide-react";

import {
  NavLink,
} from "react-router-dom";

import "./CryptoSidebar.css";


const cryptoItems = [
  {
    label:
      "Dashboard",

    icon:
      LayoutDashboard,

    to:
      "/crypto",
  },

  {
    label:
      "Markets",

    icon:
      BarChart3,

    to:
      "/crypto/markets",
  },

  {
    label:
      "Discovery",

    icon:
      Compass,

    to:
      "/crypto/discovery",
  },

  {
    label:
      "Scanner",

    icon:
      Radar,

    to:
      "/crypto/scanner",
  },

  {
    label:
      "Chart",

    icon:
      CandlestickChart,

    to:
      "/crypto/chart",
  },

  {
    label:
      "Engines",

    icon:
      Gauge,

    to:
      "/crypto/engines",
  },

  {
    label:
      "Research",

    icon:
      Search,

    to:
      "/crypto/research",
  },

  {
    label:
      "Positions",

    icon:
      WalletCards,

    to:
      "/crypto/positions",
  },

  {
    label:
      "Orders",

    icon:
      ListOrdered,

    to:
      "/crypto/orders",
  },

  {
    label:
      "Trades",

    icon:
      Clock3,

    to:
      "/crypto/trades",
  },

  {
    label:
      "Runtime",

    icon:
      Activity,

    to:
      "/crypto/runtime",
  },

  {
    label:
      "Risk & Health",

    icon:
      ShieldCheck,

    to:
      "/crypto/health",
  },
];


function navClass({
  isActive,
}) {
  return [
    "crypto-sidebar-nav-item",
    isActive
      ? "active"
      : "",
  ]
    .filter(Boolean)
    .join(" ");
}


export default function CryptoSidebar() {
  return (
    <aside
      className="crypto-sidebar"
    >
      <div
        className="crypto-sidebar-brand"
      >
        <div
          className="crypto-sidebar-brand-mark"
        >
          <Bitcoin
            size={19}
          />
        </div>

        <div
          className="crypto-sidebar-brand-copy"
        >
          <div
            className="crypto-sidebar-brand-title"
          >
            <strong>
              AEMA
            </strong>

            <span
              className="crypto-brand-live-dot"
            />
          </div>

          <span>
            Crypto Intelligence
          </span>
        </div>
      </div>


      <div
        className="crypto-sidebar-workspaces"
      >
        <span
          className="crypto-sidebar-section-label"
        >
          Workspace
        </span>

        <div
          className="crypto-sidebar-workspace-grid"
        >
          <NavLink
            to="/"
            className="crypto-sidebar-workspace"
          >
            <span
              className="crypto-sidebar-workspace-icon"
            >
              <BarChart3
                size={15}
              />
            </span>

            <span
              className="crypto-sidebar-workspace-copy"
            >
              <strong>
                Stocks
              </strong>

              <span>
                Research
              </span>
            </span>
          </NavLink>

          <NavLink
            to="/crypto"
            end
            className="crypto-sidebar-workspace active"
          >
            <span
              className="crypto-sidebar-workspace-icon"
            >
              <Bitcoin
                size={15}
              />
            </span>

            <span
              className="crypto-sidebar-workspace-copy"
            >
              <strong>
                Crypto
              </strong>

              <span>
                Research
              </span>
            </span>

            <span
              className="crypto-paper-badge"
            >
              PAPER
            </span>
          </NavLink>
        </div>
      </div>


      <nav
        className="crypto-sidebar-navigation"
      >
        <span
          className="crypto-sidebar-section-label"
        >
          Crypto
        </span>

        <div
          className="crypto-sidebar-nav"
        >
          {cryptoItems.map(
            ({
              label,
              icon: Icon,
              to,
            }) => (
              <NavLink
                key={label}
                to={to}
                end={
                  to ===
                  "/crypto"
                }
                className={
                  navClass
                }
              >
                <span
                  className="crypto-sidebar-nav-icon"
                >
                  <Icon
                    size={16}
                  />
                </span>

                <span
                  className="crypto-sidebar-nav-label"
                >
                  {label}
                </span>

                <span
                  className="crypto-sidebar-nav-indicator"
                />
              </NavLink>
            ),
          )}
        </div>
      </nav>


      <div
        className="crypto-sidebar-bottom"
      >
        <div
          className="crypto-sidebar-divider"
        />

        <button
          type="button"
          className="crypto-sidebar-nav-item crypto-sidebar-settings"
        >
          <span
            className="crypto-sidebar-nav-icon"
          >
            <Settings
              size={16}
            />
          </span>

          <span
            className="crypto-sidebar-nav-label"
          >
            Settings
          </span>
        </button>

        <div
          className="crypto-sidebar-status"
        >
          <div
            className="crypto-sidebar-status-icon"
          >
            <Activity
              size={15}
            />
          </div>

          <div
            className="crypto-sidebar-status-copy"
          >
            <div
              className="crypto-sidebar-status-title"
            >
              <span
                className="crypto-status-dot"
              />

              <strong>
                Runtime online
              </strong>
            </div>

            <span>
              Paper execution only
            </span>
          </div>

          <span
            className="crypto-runtime-badge"
          >
            LIVE
          </span>
        </div>

        <div
          className="crypto-sidebar-footer"
        >
          <span>
            AEMA Crypto Engine
          </span>

          <span>
            PAPER
          </span>
        </div>
      </div>
    </aside>
  );
}
