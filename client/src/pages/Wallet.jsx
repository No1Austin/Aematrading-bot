
import {
  WalletCards,
  ArrowLeftRight,
  Clock3,
  ShieldCheck,
} from "lucide-react";
import { Link } from "react-router-dom";
import Sidebar from "../components/Sidebar.jsx";
import "./ReferralWallet.css";

export default function Wallet() {
  return (
    <div className="app-shell">
      <Sidebar />

      <main className="main-content aema-rw-page">
        <div className="aema-rw-eyebrow">
          <WalletCards size={15} />
          REWARDS WALLET
        </div>

        <h1>Referral Wallet</h1>

        <p className="aema-rw-subtitle">
          Your referral rewards and payout history
          in one place.
        </p>

        <div className="aema-rw-grid aema-rw-wallet-grid">
          <section className="aema-rw-card aema-rw-feature">
            <div className="aema-rw-icon">
              <WalletCards />
            </div>

            <p>Available referral balance</p>
            <h2 className="aema-rw-balance">—</h2>

            <div className="aema-rw-notice">
              Balance unavailable until the verified
              rewards service is connected.
            </div>
          </section>

          <section className="aema-rw-card">
            <div className="aema-rw-icon">
              <Clock3 />
            </div>

            <h2>Pending rewards</h2>
            <p className="aema-rw-balance small">—</p>
            <p>Rewards awaiting verification.</p>
          </section>
        </div>

        <section className="aema-rw-card aema-rw-wide">
          <h2>
            <ArrowLeftRight size={19} />
            Transaction history
          </h2>

          <div className="aema-rw-empty">
            No verified transaction history is
            available. Payout requests will be
            enabled only after server-side balance
            verification and payment integration.
          </div>
        </section>

        <div className="aema-rw-footer">
          <ShieldCheck size={17} />
          Balances and payouts are never calculated
          or authorized by the browser.
          <Link to="/referrals">
            Referral centre
          </Link>
        </div>
      </main>
    </div>
  );
}
