
import { useState } from "react";
import {
  Copy,
  Gift,
  Users,
  WalletCards,
  ArrowRight,
} from "lucide-react";
import { Link } from "react-router-dom";
import Sidebar from "../components/Sidebar.jsx";
import "./ReferralWallet.css";

export default function Referrals() {
  const [copied, setCopied] = useState(false);

  // Backend must issue and verify referral codes.
  const referralUrl = null;

  async function copyLink() {
    if (!referralUrl) return;

    try {
      await navigator.clipboard.writeText(referralUrl);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="app-shell">
      <Sidebar />

      <main className="main-content aema-rw-page">
        <div className="aema-rw-eyebrow">
          <Gift size={15} />
          COMMUNITY REWARDS
        </div>

        <h1>Refer & Earn</h1>
        <p className="aema-rw-subtitle">
          Invite people to AEMA Research and track
          verified referral rewards.
        </p>

        <div className="aema-rw-grid">
          <section className="aema-rw-card aema-rw-feature">
            <div className="aema-rw-icon">
              <Users />
            </div>

            <h2>Your referral link</h2>
            <p>
              Share your personal link after your
              referral account is activated.
            </p>

            <div className="aema-rw-copy">
              <span>
                {referralUrl ||
                  "Referral link not available yet"}
              </span>

              <button
                type="button"
                onClick={copyLink}
                disabled={!referralUrl}
              >
                <Copy size={16} />
                {copied ? "Copied" : "Copy link"}
              </button>
            </div>

            <div className="aema-rw-notice">
              Referral tracking and rewards require
              the secure backend to be connected.
            </div>
          </section>

          <section className="aema-rw-card">
            <div className="aema-rw-icon">
              <WalletCards />
            </div>

            <h2>Referral wallet</h2>
            <p>
              View earned, pending and available
              rewards once connected.
            </p>

            <Link className="aema-rw-link" to="/wallet">
              Open wallet
              <ArrowRight size={16} />
            </Link>
          </section>
        </div>

        <section className="aema-rw-card aema-rw-wide">
          <h2>Referral activity</h2>

          <div className="aema-rw-empty">
            Referral activity is unavailable until
            the referral service is connected.
            No earnings or referral counts are
            being estimated.
          </div>
        </section>
      </main>
    </div>
  );
}
