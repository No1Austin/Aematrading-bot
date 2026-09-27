import { Bell, Search } from "lucide-react";
import "./TopBar.css";

export default function TopBar({ query = "", onQueryChange, onSearch }) {
  function submit(event) {
    event.preventDefault();
    onSearch?.();
  }

  return (
    <header className="topbar aema-topbar">
      <div className="aema-topbar-heading">
        <p className="eyebrow">Market intelligence</p>
        <h1>Trading Control Center</h1>
      </div>
      <div className="topbar-actions aema-topbar-actions">
        <form className="symbol-search aema-topbar-search" role="search" onSubmit={submit}>
          <Search size={19} aria-hidden="true" />
          <input type="search" aria-label="Search market symbol" autoComplete="off"
            spellCheck={false} placeholder="Search AAPL, NVDA, TSLA..."
            value={query ?? ""} onChange={(event) => onQueryChange?.(event.target.value)} />
          <button type="submit">Analyze</button>
        </form>
        <button className="icon-button aema-topbar-notifications" type="button" aria-label="Notifications">
          <Bell size={19} /><span className="notification-dot" aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}
