import { Bell, Search } from "lucide-react";

export default function TopBar({
  query,
  onQueryChange,
  onSearch,
}) {
  function submit(event) {
    event.preventDefault();
    onSearch?.();
  }

  return (
    <header className="topbar">
      <div>
        <p className="eyebrow">Market intelligence</p>
        <h1>Trading Control Center</h1>
      </div>

      <div className="topbar-actions">
        <form className="symbol-search" onSubmit={submit}>
          <Search size={17} />
          <input
            aria-label="Search symbol"
            onChange={(event) => onQueryChange?.(event.target.value)}
            placeholder="Search AAPL, NVDA, TSLA..."
            value={query}
          />
          <button type="submit">Analyze</button>
        </form>

        <button className="icon-button" type="button" aria-label="Notifications">
          <Bell size={19} />
          <span className="notification-dot" />
        </button>
      </div>
    </header>
  );
}
