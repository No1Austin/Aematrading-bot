import { useEffect, useRef, useState } from "react";
import { Bell, Search, Sun, Moon, Users, ChevronDown, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";
import "./TopBar.css";

export default function TopBar({ query = "", onQueryChange, onSearch, onClear, onRefresh }) {
  const [light, setLight] = useState(() => localStorage.getItem("aema-stock-theme") === "light");
  const [referralsOpen, setReferralsOpen] = useState(false);
  const menuRef = useRef(null);
  useEffect(() => {
    document.documentElement.classList.toggle("aema-stock-light", light);
    localStorage.setItem("aema-stock-theme", light ? "light" : "dark");
    return () => document.documentElement.classList.remove("aema-stock-light");
  }, [light]);
  useEffect(() => {
    if (!referralsOpen) return;
    const close = e => { if (!menuRef.current?.contains(e.target)) setReferralsOpen(false); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [referralsOpen]);
  const submit = e => { e.preventDefault(); onSearch?.(query.trim()); };
  return <header className="topbar aema-topbar stock-news-topbar">
    <div className="aema-topbar-heading"><p className="eyebrow">AEMA STOCK INTELLIGENCE</p><h1>Stock Research Dashboard</h1></div>
    <div className="topbar-actions aema-topbar-actions">
      <form className="symbol-search aema-topbar-search" role="search" onSubmit={submit}>
        <Search size={19} aria-hidden="true" />
        <input type="search" aria-label="Search stock ticker and news" autoComplete="off" spellCheck={false} placeholder="Ticker or news: AAPL, TSLA..." value={query} onChange={e => onQueryChange?.(e.target.value)} />
        {query && <button className="stock-news-clear" type="button" onClick={onClear} aria-label="Clear stock news search">Clear</button>}
        <button type="submit">Search</button>
      </form>
      <div className="stock-referrals-wrap" ref={menuRef}>
        <button type="button" className="stock-header-action" aria-expanded={referralsOpen} aria-haspopup="true" onClick={() => setReferralsOpen(v => !v)}><Users size={17}/><span>Referrals</span><ChevronDown size={14}/></button>
        {referralsOpen && <div className="stock-referrals-menu"><Link to="/referrals" onClick={() => setReferralsOpen(false)}>View referrals & rewards</Link></div>}
      </div>
      <button type="button" className="stock-header-action stock-icon-action" onClick={() => setLight(v => !v)} aria-label={light ? "Switch to dark mode" : "Switch to light mode"} title={light ? "Dark mode" : "Light mode"}>{light ? <Moon size={19}/> : <Sun size={19}/>}</button>
      <button type="button" className="stock-header-action stock-icon-action" onClick={onRefresh} aria-label="Refresh stock news" title="Refresh stock news"><RefreshCw size={19}/></button>
      <button type="button" className="stock-header-action stock-icon-action" aria-label="Notifications" title="Notifications"><Bell size={19}/></button>
    </div>
  </header>;
}
