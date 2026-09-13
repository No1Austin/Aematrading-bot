// client/src/App.jsx

import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
} from "react-router-dom";

import CryptoDashboard
  from "./crypto/pages/CryptoDashboard.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Markets from "./pages/Markets.jsx";
import Scanner from "./pages/Scanner.jsx";
import Research from "./pages/Research.jsx";
import Engines from "./pages/Engines.jsx";
import Positions from "./pages/Positions.jsx";
import History from "./pages/History.jsx";
import CryptoScanner
  from "./crypto/pages/CryptoScanner.jsx";

import CryptoPositions
  from "./crypto/pages/CryptoPositions.jsx";
export default function App() {
  return (
    <BrowserRouter>
      <Routes>

        <Route
  path="/crypto"
  element={<CryptoDashboard />}
/>
        <Route
          path="/"
          element={<Dashboard />}
        />

        <Route
          path="/markets"
          element={<Markets />}
        />

        <Route
          path="/scanner"
          element={<Scanner />}
        />

        <Route
          path="/research"
          element={<Research />}
        />

        <Route
          path="/engines"
          element={<Engines />}
        />

        <Route
          path="/positions"
          element={<Positions />}
        />

        <Route
          path="/history"
          element={<History />}
        />
<Route
  path="/crypto/positions"
  element={<CryptoPositions />}
/>
        
        <Route
  path="/crypto/scanner"
  element={<CryptoScanner />}
/>

<Route
          path="*"
          element={
            <Navigate
              to="/"
              replace
            />
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
