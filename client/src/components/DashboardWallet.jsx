
import {
  ArrowUpRight,
  Clock3,
  Gift,
  WalletCards,
} from "lucide-react";
import { Link } from "react-router-dom";
import "./DashboardWallet.css";

export default function DashboardWallet({
  availableBalance = null,
  pendingBalance = null,
  currency = "CAD",
  loading = false,
}) {
  const formatBalance = (value) => {
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
  };

  const isConnected =
    typeof availableBalance === "number" &&
    Number.isFinite(availableBalance);

  return (
    <section
      className="dashboard-wallet"
      aria-label="Referral wallet overview"
    >
      <div className="dashboard-wallet-header">
        <div className="dashboard-wallet-heading">
          <div className="dashboard-wallet-icon">
            <WalletCards size={20} />
          </div>

          <div>
            <h2>Referral Wallet</h2>
            <p>Your rewards overview</p>
          </div>
        </div>

        <span
          className={
            isConnected
              ? "dashboard-wallet-status connected"
              : "dashboard-wallet-status"
          }
        >
          {loading
            ? "Loading"
            : isConnected
              ? "Connected"
              : "Awaiting connection"}
        </span>
      </div>

      <div className="dashboard-wallet-balances">
        <div className="dashboard-wallet-balance">
          <span className="dashboard-wallet-label">
            <WalletCards size={15} />
            Available balance
          </span>

          <strong>
            {loading
              ? "Loading..."
              : formatBalance(availableBalance)}
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
              ? "Loading..."
              : formatBalance(pendingBalance)}
          </strong>

          <small>Awaiting confirmation</small>
        </div>
      </div>

      <div className="dashboard-wallet-actions">
        <Link
          to="/wallet"
          className="dashboard-wallet-primary"
        >
          Open wallet
          <ArrowUpRight size={16} />
        </Link>

        <Link
          to="/referrals"
          className="dashboard-wallet-secondary"
        >
          <Gift size={16} />
          Refer & Earn
        </Link>
      </div>

      {!isConnected && !loading && (
        <p className="dashboard-wallet-notice">
          Connect the rewards service to display
          your verified balance.
        </p>
      )}
    </section>
  );
}
