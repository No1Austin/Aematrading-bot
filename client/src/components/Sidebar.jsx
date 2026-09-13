// client/src/components/Sidebar.jsx

import {
  Activity,
  BarChart3,
  Bitcoin,
  BookOpen,
  Bot,
  ChevronRight,
  Gauge,
  History,
  LayoutDashboard,
  Radar,
  Settings,
  WalletCards,
} from "lucide-react";

import {
  NavLink,
  useLocation,
} from "react-router-dom";

import "./Sidebar.css";


const primaryItems = [
  {
    label: "Dashboard",
    icon: LayoutDashboard,
    to: "/",
    description: "Market overview",
  },
  {
    label: "Markets",
    icon: BarChart3,
    to: "/markets",
    description: "Market intelligence",
  },
  {
    label: "Scanner",
    icon: Radar,
    to: "/scanner",
    description: "Opportunity scanner",
  },
  {
    label: "Engines",
    icon: Gauge,
    to: "/engines",
    description: "Research engines",
  },
  {
    label: "Positions",
    icon: WalletCards,
    to: "/positions",
    description: "Tracked positions",
  },
  {
    label: "History",
    icon: History,
    to: "/history",
    description: "Research history",
  },
  {
    label: "Research",
    icon: BookOpen,
    to: "/research",
    description: "Deep intelligence",
  },
];


function buildNavClass({
  isActive,
}) {
  return [
    "aema-nav-item",
    isActive
      ? "active"
      : "",
  ]
    .filter(Boolean)
    .join(" ");
}


export default function Sidebar() {
  const location =
    useLocation();


  const cryptoActive =
    location.pathname ===
      "/crypto" ||
    location.pathname.startsWith(
      "/crypto/",
    );


  return (
    <aside
      className="aema-sidebar"
    >
      <div
        className="aema-sidebar-background"
      />

      <div
        className="aema-sidebar-content"
      >
        {/* BRAND */}
        <div
          className="aema-sidebar-brand"
        >
          <div
            className="aema-brand-mark"
          >
            <div
              className="aema-brand-mark-inner"
            >
              <Bot size={21} />
            </div>
          </div>

          <div
            className="aema-brand-copy"
          >
            <div
              className="aema-brand-title-row"
            >
              <strong>
                AEMA
              </strong>

              <span
                className="aema-brand-dot"
              />
            </div>

            <span>
              Market Intelligence
            </span>
          </div>
        </div>


        {/* WORKSPACE */}
        <div
          className="aema-workspace-switcher"
        >
          <div
            className="aema-sidebar-section-header"
          >
            <span
              className="aema-workspace-label"
            >
              Workspace
            </span>

            <span
              className="aema-section-line"
            />
          </div>

          <div
            className="aema-workspace-options"
          >
            <NavLink
              to="/"
              end
              className={({
                isActive,
              }) =>
                [
                  "aema-workspace-button",
                  "stocks",
                  isActive &&
                  !cryptoActive
                    ? "active"
                    : "",
                ]
                  .filter(Boolean)
                  .join(" ")
              }
            >
              <span
                className="aema-workspace-icon"
              >
                <BarChart3 size={18} />
              </span>

              <div
                className="aema-workspace-copy"
              >
                <strong>
                  Stocks
                </strong>

                <span>
                  Research terminal
                </span>
              </div>

              <ChevronRight
                className="aema-workspace-arrow"
                size={16}
              />
            </NavLink>


            <NavLink
              to="/crypto"
              className={() =>
                [
                  "aema-workspace-button",
                  "crypto",
                  cryptoActive
                    ? "active"
                    : "",
                ]
                  .filter(Boolean)
                  .join(" ")
              }
            >
              <span
                className="aema-workspace-icon"
              >
                <Bitcoin size={18} />
              </span>

              <div
                className="aema-workspace-copy"
              >
                <strong>
                  Crypto
                </strong>

                <span>
                  Paper runtime
                </span>
              </div>

              <span
                className="aema-workspace-status"
              >
                PAPER
              </span>
            </NavLink>
          </div>
        </div>


        {/* NAVIGATION */}
        <nav
          className="aema-sidebar-nav"
        >
          <div
            className="aema-sidebar-section-header"
          >
            <span
              className="aema-nav-section-label"
            >
              Intelligence
            </span>

            <span
              className="aema-section-line"
            />
          </div>

          <div
            className="aema-nav-list"
          >
            {primaryItems.map(
              ({
                label,
                icon: Icon,
                to,
                description,
              }) => (
                <NavLink
                  key={label}
                  to={to}
                  end={
                    to === "/"
                  }
                  className={
                    buildNavClass
                  }
                >
                  <span
                    className="aema-nav-active-indicator"
                  />

                  <span
                    className="aema-nav-icon"
                  >
                    <Icon size={18} />
                  </span>

                  <span
                    className="aema-nav-content"
                  >
                    <span
                      className="aema-nav-label"
                    >
                      {label}
                    </span>

                    <span
                      className="aema-nav-description"
                    >
                      {description}
                    </span>
                  </span>

                  <ChevronRight
                    className="aema-nav-chevron"
                    size={15}
                  />
                </NavLink>
              ),
            )}
          </div>
        </nav>


        {/* BOTTOM */}
        <div
          className="aema-sidebar-bottom"
        >
          <div
            className="aema-sidebar-divider"
          />

          <button
            className="aema-nav-item aema-settings-button"
            type="button"
          >
            <span
              className="aema-nav-icon"
            >
              <Settings size={18} />
            </span>

            <span
              className="aema-nav-content"
            >
              <span
                className="aema-nav-label"
              >
                Settings
              </span>

              <span
                className="aema-nav-description"
              >
                System preferences
              </span>
            </span>

            <ChevronRight
              className="aema-nav-chevron"
              size={15}
            />
          </button>


          <div
            className="aema-system-mini"
          >
            <div
              className="aema-system-mini-icon"
            >
              <Activity size={16} />
            </div>

            <div
              className="aema-system-mini-copy"
            >
              <div
                className="aema-system-status-row"
              >
                <span
                  className="aema-online-dot"
                />

                <strong>
                  System online
                </strong>
              </div>

              <span>
                Paper trading environment
              </span>
            </div>
          </div>


          <div
            className="aema-sidebar-version"
          >
            <span>
              AEMA Research Engine
            </span>

            <span
              className="aema-version-tag"
            >
              v1
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
}