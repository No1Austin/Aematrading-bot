import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import BotApp from "./bot/BotApp.jsx";
import LandingPage from "./landing/pages/LandingPage.jsx";
import AuthPage from "./auth/AuthPage.jsx";
import UpdatePassword from "./auth/UpdatePassword.jsx";
import RequireAuth from "./auth/RequireAuth.jsx";
import CryptoDashboard from "./crypto/pages/CryptoDashboard.jsx";
import CryptoMarkets from "./crypto/pages/CryptoMarkets.jsx";
import CryptoDiscovery from "./crypto/pages/CryptoDiscovery.jsx";
import CryptoScanner from "./crypto/pages/CryptoScanner.jsx";
import CryptoEngines from "./crypto/pages/CryptoEngines.jsx";
import CryptoResearch from "./crypto/pages/CryptoResearch.jsx";
import CryptoPositions from "./crypto/pages/CryptoPositions.jsx";
import CryptoHealth from "./crypto/pages/CryptoHealth.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Markets from "./pages/Markets.jsx";
import Scanner from "./pages/Scanner.jsx";
import Research from "./pages/Research.jsx";
import Engines from "./pages/Engines.jsx";
import Positions from "./pages/Positions.jsx";
import History from "./pages/History.jsx";
export default function App() {
  return <BrowserRouter><Routes>
    <Route path="/" element={<LandingPage/>}/>
    <Route path="/login" element={<AuthPage mode="login"/>}/>
    <Route path="/register" element={<AuthPage mode="register"/>}/>
    <Route path="/forgot-password" element={<AuthPage mode="reset"/>}/>
    <Route path="/update-password" element={<UpdatePassword/>}/>
    {/* Existing private bot has separate authentication. Do not substitute public Supabase auth for bot authorization. */}
    <Route path="/bot/*" element={<BotApp/>}/>
    <Route element={<RequireAuth/>}>
      <Route path="/dashboard" element={<Dashboard/>}/>
      <Route path="/markets" element={<Markets/>}/>
      <Route path="/scanner" element={<Scanner/>}/>
      <Route path="/research" element={<Research/>}/>
      <Route path="/engines" element={<Engines/>}/>
      <Route path="/positions" element={<Positions/>}/>
      <Route path="/history" element={<History/>}/>
      <Route path="/crypto" element={<CryptoDashboard/>}/>
      <Route path="/crypto/markets" element={<CryptoMarkets/>}/>
      <Route path="/crypto/discovery" element={<CryptoDiscovery/>}/>
      <Route path="/crypto/scanner" element={<CryptoScanner/>}/>
      <Route path="/crypto/engines" element={<CryptoEngines/>}/>
      <Route path="/crypto/research" element={<CryptoResearch/>}/>
      <Route path="/crypto/positions" element={<CryptoPositions/>}/>
      <Route path="/crypto/health" element={<CryptoHealth/>}/>
    </Route>
    <Route path="/app" element={<Navigate to="/dashboard" replace/>}/>
    <Route path="/app/markets" element={<Navigate to="/markets" replace/>}/>
    <Route path="/app/scanner" element={<Navigate to="/scanner" replace/>}/>
    <Route path="/app/research" element={<Navigate to="/research" replace/>}/>
    <Route path="/app/engines" element={<Navigate to="/engines" replace/>}/>
    <Route path="/app/positions" element={<Navigate to="/positions" replace/>}/>
    <Route path="/app/history" element={<Navigate to="/history" replace/>}/>
    <Route path="/app/crypto" element={<Navigate to="/crypto" replace/>}/>
    <Route path="/app/crypto/markets" element={<Navigate to="/crypto/markets" replace/>}/>
    <Route path="/app/crypto/discovery" element={<Navigate to="/crypto/discovery" replace/>}/>
    <Route path="/app/crypto/scanner" element={<Navigate to="/crypto/scanner" replace/>}/>
    <Route path="/app/crypto/engines" element={<Navigate to="/crypto/engines" replace/>}/>
    <Route path="/app/crypto/research" element={<Navigate to="/crypto/research" replace/>}/>
    <Route path="/app/crypto/positions" element={<Navigate to="/crypto/positions" replace/>}/>
    <Route path="/app/crypto/health" element={<Navigate to="/crypto/health" replace/>}/>
    <Route path="*" element={<Navigate to="/" replace/>}/>
  </Routes></BrowserRouter>;
}
