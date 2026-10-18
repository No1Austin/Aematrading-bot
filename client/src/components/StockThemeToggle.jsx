import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import "./StockThemeToggle.css";

const KEY = "aema-stock-theme";
const EVENT = "aema-stock-theme-change";
function isLight() {
  try { return window.localStorage.getItem(KEY) === "light"; }
  catch { return false; }
}
export default function StockThemeToggle() {
  const [light, setLight] = useState(isLight);
  useEffect(() => {
    document.documentElement.classList.toggle("aema-stock-light", isLight());
    const sync = () => { const next = isLight(); setLight(next); document.documentElement.classList.toggle("aema-stock-light", next); };
    window.addEventListener("storage", sync);
    window.addEventListener(EVENT, sync);
    return () => { window.removeEventListener("storage", sync); window.removeEventListener(EVENT, sync); };
  }, []);
  const toggle = () => {
    const next = !light;
    setLight(next);
    document.documentElement.classList.toggle("aema-stock-light", next);
    try { window.localStorage.setItem(KEY, next ? "light" : "dark"); } catch {}
    window.dispatchEvent(new Event(EVENT));
  };
  return <button type="button" className="aema-stock-theme-button" onClick={toggle}
    aria-label={light ? "Switch to dark background" : "Switch to light background"}
    aria-pressed={light} title={light ? "Dark mode" : "Light mode"}>
    {light ? <Moon size={17} /> : <Sun size={17} />}
    <span>{light ? "Dark mode" : "Light mode"}</span>
  </button>;
}
