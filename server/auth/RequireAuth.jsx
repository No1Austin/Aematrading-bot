import { useEffect, useState } from "react";
import { Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import { supabase } from "./supabase.js";
import "./trialLock.css";

function subscriptionIsValid(row) {
  if (!row) return false;
  const now = Date.now();
  const trial = row.trial_ends_at && Date.parse(row.trial_ends_at) > now;
  const paid = row.status === "active" && row.current_period_end && Date.parse(row.current_period_end) > now;
  return Boolean(trial || paid);
}

export default function RequireAuth() {
  const location = useLocation();
  const navigate = useNavigate();
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");
  const [state, setState] = useState({ loading: true, session: null, allowed: false, error: "" });
  const billingRoute = location.pathname === "/billing";

  useEffect(() => {
    let alive = true;
    let revision = 0;
    async function check() {
      const current = ++revision;
      try {
        const { data: auth, error: authError } = await supabase.auth.getSession();
        if (authError) throw authError;
        const session = auth?.session ?? null;
        if (!session) {
          if (alive && current === revision) setState({ loading: false, session: null, allowed: false, error: "" });
          return;
        }
        // Billing remains available so expired users can subscribe or manage payments.
        if (billingRoute) {
          if (alive && current === revision) setState({ loading: false, session, allowed: true, error: "" });
          return;
        }
        const { data: row, error } = await supabase.from("subscriptions")
          .select("status,trial_ends_at,current_period_end")
          .eq("user_id", session.user.id).maybeSingle();
        if (error) throw error;
        if (alive && current === revision) setState({ loading: false, session, allowed: subscriptionIsValid(row), error: "" });
      } catch (error) {
        if (alive && current === revision) setState(s => ({ ...s, loading: false, allowed: false, error: error.message || "Subscription verification unavailable." }));
      }
    }
    setState(s => ({ ...s, loading: true }));
    void check();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => { void check(); });
    const onFocus = () => { void check(); };
    const onVisibility = () => { if (document.visibilityState === "visible") void check(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    const timer = window.setInterval(() => { void check(); }, 60000);
    return () => {
      alive = false;
      revision++;
      subscription.unsubscribe();
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(timer);
    };
  }, [billingRoute, location.pathname]);

  if (state.loading) return <main style={{ padding: 32 }}>Checking your subscription…</main>;
  if (!state.session) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  if (billingRoute || state.allowed) return <Outlet />;

  async function startCheckout() {
    setCheckoutError(""); setCheckoutLoading(true);
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error || !data?.session?.access_token) throw new Error("Please sign in again.");
      const base = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");
      if (!base) throw new Error("VITE_API_BASE_URL is missing from the Vercel environment.");
      const response = await fetch(`${base}/api/billing/checkout`, {
        method: "POST",
        headers: { Authorization: `Bearer ${data.session.access_token}` },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || `Checkout failed (${response.status})`);
      const url = new URL(payload.url);
      if (url.protocol !== "https:" || !/(^|\.)stripe\.com$/.test(url.hostname)) throw new Error("Stripe returned an invalid checkout URL.");
      window.location.assign(url.href);
    } catch (err) { setCheckoutError(err.message || "Unable to start checkout."); setCheckoutLoading(false); }
  }
  return (
    <main className="aema-lock">
      <div className="aema-lock-glow" aria-hidden="true" />
      <section className="aema-lock-card" aria-labelledby="aema-lock-heading">
        <div className="aema-lock-brand"><span className="aema-lock-symbol">A</span><span>AEMA <b>RESEARCH</b></span></div>
        <div className="aema-lock-icon" aria-hidden="true">✦</div>
        <div className="aema-lock-eyebrow">YOUR RESEARCH ACCESS</div>
        <h1 id="aema-lock-heading">Your free trial has ended<span>.</span></h1>
        <p className="aema-lock-desc">Continue exploring markets with the research workspace built for decisive, informed analysis.</p>
        <div className="aema-lock-plan"><div><span className="aema-lock-plan-label">AEMA RESEARCH · MONTHLY</span><div className="aema-lock-price">CAD $20 <small>/ month</small></div></div><span className="aema-lock-plan-tag">Full access</span></div>
        <div className="aema-lock-features"><span>✓ Stock & crypto research</span><span>✓ Discovery & scanners</span><span>✓ Research engines</span><span>✓ Market intelligence</span></div>
        {state.error && <p role="alert" className="aema-lock-error">Subscription verification unavailable: {state.error}</p>}
        {checkoutError && <p role="alert" className="aema-lock-error">{checkoutError}</p>}
        <button className="aema-lock-cta" disabled={checkoutLoading} onClick={startCheckout}>{checkoutLoading ? "Opening secure checkout…" : "Subscribe now · CAD $20/month →"}</button>
        <div className="aema-lock-foot">Secure payment with Stripe · Cancel anytime</div>
        <button className="aema-lock-signout" onClick={() => supabase.auth.signOut()}>Sign out of your account</button>
      </section>
    </main>
  );
}
