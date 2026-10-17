import { useEffect, useState } from "react";

import {

  Outlet,

  useLocation,

} from "react-router-dom";

import { supabase } from "./supabase.js";

import { authenticatedApi } from "../services/authenticatedApi.js";

import {

  ArrowRight,

  BarChart3,

  Check,

  ChevronDown,

  CreditCard,

  Globe2,

  LockKeyhole,

  Radar,

  ShieldCheck,

  Sparkles,

  Zap,

} from "lucide-react";

import "./trialLock.css";

const features = [

  {

    icon: Radar,

    title: "Market scanners",

    detail: "Discover and filter stock and crypto markets.",

  },

  {

    icon: BarChart3,

    title: "Research engines",

    detail: "Explore multi-factor market evidence and scores.",

  },

  {

    icon: Globe2,

    title: "Market intelligence",

    detail: "Bring news, sentiment and market context together.",

  },

  {

    icon: Zap,

    title: "One research workspace",

    detail: "Move between discovery, analysis and research.",

  },

];

const faqs = [

  {

    q: "What is included?",

    a: "Access to the AEMA Research stock and crypto research workspaces, scanners, research engines and available market intelligence features.",

  },

  {

    q: "Can I cancel?",

    a: "You can manage or cancel your subscription through Stripe's billing portal. Access continues according to your paid billing period.",

  },

  {

    q: "How does payment work?",

    a: "Selecting Subscribe Now opens Stripe's secure Checkout. Access is restored after payment is confirmed and your subscription status updates.",

  },

];

// In-memory only: never store paid entitlement in localStorage.
let billingCache = null;
let billingRequest = null;

export default function RequireAuth() {

  const location = useLocation();

  const billingRoute = location.pathname === "/billing";

  const [checkoutLoading, setCheckoutLoading] =

    useState(false);

  const [checkoutError, setCheckoutError] =

    useState("");

  const [openFaq, setOpenFaq] = useState(null);

  const [state, setState] = useState({

    loading: true,

    session: null,

    allowed: false,

    error: "",

  });

  useEffect(() => {
    let alive = true;
    let sequence = 0;

    const updateState = (next) => {
      if (alive) setState(next);
    };

    async function verify(session) {
      const request = ++sequence;
      if (!session?.user?.id) {
        billingCache = null;
        billingRequest = null;
        updateState({ loading: false, session: null, allowed: false, error: "" });
        return;
      }

      const userId = session.user.id;
      updateState({ loading: true, session, allowed: false, error: "" });

      try {
        // Reuse a verified entitlement across route remounts.
        // Only a new user or a full browser reload needs another lookup.
        if (!billingCache || billingCache.userId !== userId) {
          if (!billingRequest || billingRequest.userId !== userId) {
            billingRequest = {
              userId,
              promise: authenticatedApi("/api/billing/me"),
            };
          }
          let billing;
          try {
            billing = await billingRequest.promise;
          } finally {
            if (billingRequest?.userId === userId) billingRequest = null;
          }
          if (billing?.has_access !== true && billing?.has_access !== false) {
            throw new Error("Invalid subscription verification response.");
          }
          billingCache = {
            userId,
            allowed: billing.has_access,
            // An entitlement cannot outlive its known trial/paid period.
            accessUntil: Math.max(
              billing.trial_active ? Date.parse(billing.trial_ends_at || "") || 0 : 0,
              billing.paid_active ? Date.parse(billing.current_period_end || "") || 0 : 0
            ),
          };
        }

        if (!alive || request !== sequence) return;
        updateState({
          loading: false,
          session,
          allowed: billingCache.allowed &&
            billingCache.accessUntil > Date.now(),
          error: "",
        });
      } catch (error) {
        if (!alive || request !== sequence) return;
        updateState({
          loading: false,
          session,
          allowed: false,
          error: error?.message || "Subscription verification unavailable.",
        });
      }
    }

    void supabase.auth.getSession().then(({ data, error }) => {
      if (!alive) return;
      if (error) {
        updateState({ loading: false, session: null, allowed: false, error: error.message });
        return;
      }
      void verify(data?.session ?? null);
    }).catch((error) => {
      updateState({ loading: false, session: null, allowed: false, error: error.message });
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!alive) return;
      if (event === "SIGNED_OUT") {
        sequence++;
        billingCache = null;
        billingRequest = null;
        updateState({ loading: false, session: null, allowed: false, error: "" });
      } else if (event === "SIGNED_IN" || event === "USER_UPDATED") {
        // Supabase can emit SIGNED_IN on refocus. Same-user events do not
        // trigger another billing request.
        if (session?.user?.id && session.user.id === billingCache?.userId) {
          updateState((previous) => ({ ...previous, session }));
        } else {
          queueMicrotask(() => { if (alive) void verify(session); });
        }
      } else if (event === "TOKEN_REFRESHED") {
        updateState((previous) => ({ ...previous, session: session ?? previous.session }));
      }
    });

    return () => {
      alive = false;
      sequence++;
      subscription.unsubscribe();
    };
  }, []);

  // Expire locally when the verified trial or billing period ends.
  useEffect(() => {
    if (!state.allowed || !billingCache?.accessUntil) return;
    const remaining = billingCache.accessUntil - Date.now();
    if (remaining <= 0) {
      setState((previous) => ({ ...previous, allowed: false }));
      return;
    }
    const timer = window.setTimeout(() => {
      setState((previous) => ({ ...previous, allowed: false }));
    }, Math.min(remaining, 2147483647));
    return () => window.clearTimeout(timer);
  }, [state.allowed, state.session?.user?.id]);

  async function startCheckout() {

    if (checkoutLoading) return;

    setCheckoutError("");

    setCheckoutLoading(true);

    try {

      const {

        data,

        error,

      } = await supabase.auth.getSession();

      if (error || !data?.session?.access_token) {

        throw new Error("Please sign in again.");

      }

      const base = (

        import.meta.env.VITE_API_BASE_URL || ""

      ).replace(/\/+$/, "");

      if (!base) {

        throw new Error(

          "VITE_API_BASE_URL is missing from the frontend environment."

        );

      }

      const response = await fetch(

        `${base}/api/billing/checkout`,

        {

          method: "POST",

          headers: {

            Authorization:

              `Bearer ${data.session.access_token}`,

          },

        }

      );

      const payload = await response

        .json()

        .catch(() => ({}));

      if (!response.ok) {

        throw new Error(

          payload.error ||

          `Checkout failed (${response.status})`

        );

      }

      if (!payload?.url) {

        throw new Error(

          "Stripe Checkout URL was not returned."

        );

      }

      const url = new URL(payload.url);

      if (

        url.protocol !== "https:" ||

        !/(^|\.)stripe\.com$/.test(url.hostname)

      ) {

        throw new Error(

          "Stripe returned an invalid checkout URL."

        );

      }

      window.location.assign(url.href);

    } catch (error) {

      setCheckoutError(

        error?.message ||

        "Unable to start Stripe Checkout."

      );

      setCheckoutLoading(false);

    }

  }

  async function handleLogout() {

    setCheckoutError("");

    const { error } = await supabase.auth.signOut();

    if (error) {

      setCheckoutError(

        error.message || "Unable to sign out."

      );

    }

  }

  // Do not render protected pages before

  // authentication and billing verification finish.

  if (state.loading) {

    return (

      <main

        style={{

          minHeight: "100vh",

          background: "#07090b",

          color: "#ffd02e",

          display: "grid",

          placeItems: "center",

          fontFamily: "Inter, sans-serif",

          padding: 24,

        }}

      >

        <p>Checking your subscription...</p>

      </main>

    );

  }

  // Unauthenticated visitors must sign in.

  if (!state.session) {

    return (

      <Navigate

        to="/login"

        state={{ from: location.pathname }}

        replace

      />

    );

  }

  // Billing is accessible to authenticated users.

  // All other protected routes require confirmed access.

  if (billingRoute || state.allowed) {

    return <Outlet />;

  }

  if (state.error) {
    return (
      <main className="aema-lock">
        <section className="aema-lock-plan" style={{ maxWidth: 560, margin: "12vh auto", padding: 32 }}>
          <h1>Unable to verify your subscription</h1>
          <p role="alert" className="aema-lock-error">{state.error}</p>
          <button type="button" className="aema-lock-cta" onClick={() => window.location.reload()}>
            Retry verification
          </button>
          <button type="button" onClick={handleLogout}>Log out</button>
        </section>
      </main>
    );
  }

  // Expired trial / inactive subscription:

  // display the existing premium paywall.

  return (

    <main className="aema-lock">

      <div

        className="aema-lock-ambient"

        aria-hidden="true"

      />

      <header className="aema-lock-topbar">

        <div className="aema-lock-brand">

          <span className="aema-lock-mark">

            A

          </span>

          <span>

            AEMA

            <small>RESEARCH</small>

          </span>

        </div>

        <div className="aema-lock-top-right">

          <span className="aema-lock-secure">

            <ShieldCheck size={15} />

            Secure subscription

          </span>

          <button

            type="button"

            onClick={handleLogout}

          >

            Log out

          </button>

        </div>

      </header>

      <div className="aema-lock-container">

        <div className="aema-lock-intro">

          <span className="aema-lock-kicker">

            <Sparkles size={14} />

            THE RESEARCH EDGE

          </span>

          <h1>

            Unlock deeper{" "}

            <em>market intelligence.</em>

          </h1>

          <p>

            Your research deserves a sharper workspace.

            Get full access to AEMA Research for

            stocks and crypto.

          </p>

          <span className="aema-lock-trial-note">

            {state.error

              ? "Subscription verification unavailable"

              : "Your 7-day free trial has ended"}

          </span>

        </div>

        <div className="aema-lock-layout">

          {/* LEFT FEATURE CARDS */}

          <div className="aema-lock-feature-list">

            {features

              .slice(0, 2)

              .map(({ icon: Icon, title, detail }) => (

                <article

                  className="aema-lock-feature"

                  key={title}

                >

                  <div className="aema-lock-feature-icon">

                    <Icon size={23} />

                  </div>

                  <div>

                    <h2>{title}</h2>

                    <p>{detail}</p>

                  </div>

                </article>

              ))}

          </div>

          {/* SUBSCRIPTION CARD */}

          <section

            className="aema-lock-plan"

            aria-label="AEMA Research monthly subscription"

          >

            <div className="aema-lock-plan-top">

              <span>

                ONE PLAN. FULL ACCESS.

              </span>

              <span className="aema-lock-plan-tag">

                MONTHLY

              </span>

            </div>

            <h2>

              AEMA Research <span>Pro</span>

            </h2>

            <p className="aema-lock-plan-sub">

              Your complete research workspace

            </p>

            <div className="aema-lock-price">

              <span>CAD</span>

              <strong>$20</strong>

              <span>/ month</span>

            </div>

            <div className="aema-lock-plan-divider" />

            <ul className="aema-lock-checklist">

              {[

                "Stock and crypto research workspaces",

                "Market discovery and advanced scanners",

                "Multi-engine research and scorecards",

                "Market news and intelligence",

                "One subscription, full research access",

                "Cancel your subscription anytime",

              ].map((item) => (

                <li key={item}>

                  <Check size={17} />

                  <span>{item}</span>

                </li>

              ))}

            </ul>

            {state.error && (

              <p

                role="alert"

                className="aema-lock-error"

              >

                {state.error}

              </p>

            )}

            {checkoutError && (

              <p

                role="alert"

                className="aema-lock-error"

              >

                {checkoutError}

              </p>

            )}

            <button

              type="button"

              className="aema-lock-cta"

              disabled={checkoutLoading}

              onClick={startCheckout}

            >

              <span>

                {checkoutLoading

                  ? "Opening secure checkout..."

                  : "Subscribe Now — CAD $20/month"}

              </span>

              <ArrowRight size={19} />

            </button>

            <div className="aema-lock-checkout-foot">

              <LockKeyhole size={14} />

              Secure checkout powered by Stripe

            </div>

          </section>

          {/* RIGHT FEATURE CARDS */}

          <div className="aema-lock-feature-list">

            {features

              .slice(2)

              .map(({ icon: Icon, title, detail }) => (

                <article

                  className="aema-lock-feature"

                  key={title}

                >

                  <div className="aema-lock-feature-icon">

                    <Icon size={23} />

                  </div>

                  <div>

                    <h2>{title}</h2>

                    <p>{detail}</p>

                  </div>

                </article>

              ))}

          </div>

        </div>

        {/* TRUST STRIP */}

        <div className="aema-lock-trust">

          <div>

            <CreditCard size={21} />

            <span>

              <strong>Secure payments</strong>

              <small>Processed by Stripe</small>

            </span>

          </div>

          <div>

            <ShieldCheck size={21} />

            <span>

              <strong>Cancel anytime</strong>

              <small>Manage your subscription</small>

            </span>

          </div>

          <div>

            <Zap size={21} />

            <span>

              <strong>Access after confirmation</strong>

              <small>

                Return to research once activated

              </small>

            </span>

          </div>

        </div>

        {/* FAQ */}

        <section

          className="aema-lock-faq"

          aria-label="Frequently asked questions"

        >

          <div>

            <span className="aema-lock-kicker">

              GOOD TO KNOW

            </span>

            <h2>

              Frequently asked questions

            </h2>

            <p>

              Everything you need to know before subscribing.

            </p>

          </div>

          <div className="aema-lock-faq-items">

            {faqs.map(({ q, a }, index) => (

              <div

                className="aema-lock-faq-item"

                key={q}

              >

                <button

                  type="button"

                  aria-expanded={openFaq === index}

                  onClick={() =>

                    setOpenFaq(

                      openFaq === index ? null : index

                    )

                  }

                >

                  {q}

                  <ChevronDown

                    size={17}

                    className={

                      openFaq === index

                        ? "is-open"

                        : ""

                    }

                  />

                </button>

                {openFaq === index && (

                  <p>{a}</p>

                )}

              </div>

            ))}

          </div>

        </section>

        <footer className="aema-lock-footer">

          AEMA RESEARCH

          <span>•</span>

          Market research tools, not personalized

          investment advice.

        </footer>

      </div>

    </main>

  );

}
