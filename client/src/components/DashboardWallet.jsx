
import {
  ArrowUpRight,
  Clock3,
  Gift,
  WalletCards,
} from "lucide-react";
import { Link } from "react-router-dom";
import "./DashboardWallet.css";

function money(value, currency) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value)
  ) {
    return "—";
  }

  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency,
  }).format(value);
}

export default function DashboardWallet({
  availableBalance = null,
  pendingBalance = null,
  currency = "CAD",
  loading = false,
}) {
  const connected =
    typeof availableBalance === "number" &&
    Number.isFinite(availableBalance);

  return (
    <div className="dashboard-wallet">
      <header className="dashboard-wallet-header">
        <div className="dashboard-wallet-heading">
          <span className="dashboard-wallet-icon">
            <WalletCards size={20} />
          </span>

          <div>
            <h2>Referral Wallet</h2>
            <p>Your rewards overview</p>
          </div>
        </div>

        <span
          className={`dashboard-wallet-status ${
            connected ? "connected" : ""
          }`}
        >
          {loading
            ? "Loading"
            : connected
              ? "Connected"
              : "Awaiting connection"}
        </span>
      </header>

      <div className="dashboard-wallet-balances">
        <div className="dashboard-wallet-balance">
          <span className="dashboard-wallet-label">
            <WalletCards size={15} />
            Available balance
          </span>

          <strong>
            {loading
              ? "Loading…"
              : money(availableBalance, currency)}
          </strong>

          <small>Verified rewards</small>
        </div>

        <div className="dashboard-wallet-balance">
          <span className="dashboard-wallet-label">
            <Clock3 size={15} />
            Pending rewards
          </span>

          <strong>
            {loading
              ? "Loading…"
              : money(pendingBalance, currency)}
          </strong>

          <small>Awaiting confirmation</small>
        </div>
      </div>

      <div className="dashboard-wallet-actions">
        <Link
          className="dashboard-wallet-primary"
          to="/wallet"
        >
          Open wallet
          <ArrowUpRight size={16} />
        </Link>

        <Link
          className="dashboard-wallet-secondary"
          to="/referrals"
        >
          <Gift size={16} />
          Refer & Earn
        </Link>
      </div>

      {!connected && !loading && (
        <p className="dashboard-wallet-notice">
          Balances will appear once the verified
          rewards service is connected.
        </p>
      )}
    </div>
  );
}
