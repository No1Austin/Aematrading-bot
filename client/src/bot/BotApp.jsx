import "./AemaTerminal.css";
import { Navigate, Route, Routes } from "react-router-dom";
import BotResearchDashboard from "./pages/BotResearchDashboard.jsx";
import BotMarketSearch from "./pages/BotMarketSearch.jsx";
import BotMonitoring from "./pages/BotMonitoring.jsx";
import BotControls from "./pages/BotControls.jsx";
import BotHistory from "./pages/BotHistory.jsx";
import BotStockResearch from "./pages/BotStockResearch.jsx";

/**
 * Bot access is protected by the application's existing RequireAuth route.
 * There is no second bot-password prompt or bot-session check.
 * Backend endpoints must independently verify the Supabase bearer token.
 */
export default function BotApp() {
  return (
    <Routes>
      <Route index element={<BotResearchDashboard />} />
      <Route path="search" element={<BotMarketSearch />} />
      <Route path="stocks" element={<BotStockResearch />} />
      <Route path="monitoring" element={<BotMonitoring />} />
      <Route path="controls" element={<BotControls />} />
      <Route path="history" element={<BotHistory />} />
      <Route path="*" element={<Navigate to="/bot" replace />} />
    </Routes>
  );
}
