
import { useEffect, useState } from "react";
import {
  Navigate,
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
    let revision = 0;

    async function check() {
      const current = ++revision;

      try {
        const {
          data: auth,
          error: authError,
        } = await supabase.auth.getSession();

        if (authError) {
          throw authError;
        }

        const session = auth?.session ?? null;

        if (!session) {
          if (alive && current === revision) {
            setState({
              loading: false,
              session: null,
              allowed: false,
              error: "",
            });
          }

          return;
        }

        // Billing must remain accessible to signed-in users,
        // including users with expired subscriptions.
        if (billingRoute) {
          if (alive && current === revision) {
            setState({
              loading: false,
              session,
              allowed: true,
              error: "",
            });
          }

          return;
        }

        // Use the same authenticated backend billing
        // endpoint as BillingPage.jsx.
        const billing = await authenticatedApi(
          "/api/billing/me"
        );

        // Only the backend-confirmed access flag
        // determines whether protected pages are shown.
        const allowed = billing?.has_access === true;

        if (alive && current === revision) {
          setState({
            loading: false,
            session,
            allowed,
            error: "",
          });
        }
      } catch (error) {
        if (alive && current === revision) {
          setState((previous) => ({
            ...previous,
            loading: false,
            allowed: false,
            error:
              error?.message ||
              "Subscription verification unavailable.",
          }));
        }
      }
    }

    // Show the loading screen when the protected
    // route changes, rather than showing stale access.
    setState((previous) => ({
      ...previous,
      loading: true,
    }));

    void check();

    // Recheck when authentication changes.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      // Defer API calls outside Supabase auth callbacks.
      setTimeout(() => {
        if (alive) {
          void check();
        }
      }, 0);
    });

    // Recheck when the user returns to the browser.
    const onFocus = () => {
      void check();
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void check();
      }
    };

    window.addEventListener("focus", onFocus);

    document.addEventListener(
      "visibilitychange",
      onVisibility
    );

    // Periodically verify subscription access.
    const timer = window.setInterval(() => {
      void check();
    }, 60000);

    return () => {
      alive = false;
      revision++;

      subscription.unsubscribe();

      window.removeEventListener(
        "focus",
        onFocus
      );

      document.removeEventListener(
        "visibilitychange",
        onVisibility
      );

      window.clearInterval(timer);
    };
  }, [billingRoute, location.pathname]);

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
      ).replace(/\/$/, "");

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
