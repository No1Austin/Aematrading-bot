import { useEffect, useState } from "react";
import { Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import { supabase } from "./supabase.js";

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

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, background: "#0b1220", color: "#f8fafc" }}>
      <section style={{ maxWidth: 520, width: "100%", padding: 36, borderRadius: 18, border: "1px solid #334155", background: "#111c30", textAlign: "center" }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 2, color: "#94a3b8" }}>AEMA RESEARCH</div>
        <h1 style={{ fontSize: 30, marginTop: 20 }}>Your 7-day free trial has ended</h1>
        <p style={{ color: "#cbd5e1", lineHeight: 1.7 }}>Subscribe for CAD $20/month to continue accessing AEMA Research, including markets, scanners, engines and research.</p>
        {state.error && <p role="alert" style={{ color: "#fbbf24" }}>We couldn't verify your subscription right now. Please try again or open billing.</p>}
        <button onClick={() => navigate("/billing")} style={{ width: "100%", padding: "14px 20px", borderRadius: 10, border: 0, fontWeight: 700, cursor: "pointer", background: "#38bdf8", color: "#082f49", marginTop: 16 }}>Subscribe Now — CAD $20/month</button>
        <button onClick={() => supabase.auth.signOut()} style={{ marginTop: 18, background: "transparent", border: 0, color: "#cbd5e1", cursor: "pointer", textDecoration: "underline" }}>Log out</button>
      </section>
    </main>
  );
}
