
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider.jsx";
import { authenticatedApi } from "../services/authenticatedApi.js";
import "./BillingPage.css";

function prettyDate(value) {
  if (!value) return null;

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? null
    : date.toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
}

export default function BillingPage() {
  const { user, loading: authLoading, refreshBilling } = useAuth();

  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const checkoutResult =
    searchParams.get("billing") ??
    searchParams.get("checkout");

  const isCheckoutSuccess = checkoutResult === "success";

  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirming, setConfirming] = useState(false);

  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    if (!user) {
      setInfo(null);
      setLoading(false);
      return null;
    }

    setLoading(true);
    setError("");

    try {
      const result = await authenticatedApi("/api/billing/me");

      if (mountedRef.current) {
        setInfo(result);
      }

      return result;
    } catch (err) {
      if (mountedRef.current) {
        setError(err.message || "Unable to load billing status.");
      }

      return null;
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [user]);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Load subscription information normally.
  useEffect(() => {
    if (authLoading || isCheckoutSuccess) return;

    void refresh();
  }, [authLoading, isCheckoutSuccess, refresh]);

  // Handle Stripe Checkout success.
  useEffect(() => {
    if (authLoading || !user || !isCheckoutSuccess) return;

    let cancelled = false;
    let timeoutId = null;

    async function confirmSubscription() {
      setConfirming(true);
      setLoading(false);
      setError("");
      setNotice(
        "Payment completed. Confirming your subscription..."
      );

      const maxAttempts = 15;

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        if (cancelled) return;

        try {
          const result = await authenticatedApi(
            "/api/billing/me"
          );

          if (cancelled) return;

          setInfo(result);

          // Never grant access based on the URL alone.
          // Require confirmed active paid access.
          if (
            result?.status === "active" &&
            result?.has_access === true
          ) {
            try {
              await refreshBilling();
            } catch (err) {
              console.warn(
                "Billing context refresh:",
                err.message
              );
            }

            if (cancelled) return;

            setNotice(
              "Subscription confirmed! Opening your dashboard..."
            );

            navigate("/dashboard", { replace: true });
            return;
          }
        } catch (err) {
          console.warn(
            "Subscription confirmation pending:",
            err.message
          );
        }

        await new Promise((resolve) => {
          timeoutId = setTimeout(resolve, 2000);
        });
      }

      if (!cancelled) {
        setConfirming(false);
        setNotice(
          "Checkout returned successfully, but your subscription " +
          "has not yet been confirmed. Please refresh your status " +
          "in a moment. If the issue continues, contact support."
        );
      }
    }

    void confirmSubscription();

    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [
    authLoading,
    user,
    isCheckoutSuccess,
    refreshBilling,
    navigate,
  ]);

  useEffect(() => {
    if (
      checkoutResult === "cancelled" ||
      checkoutResult === "cancel"
    ) {
      setNotice(
        "Checkout was cancelled. No new subscription was created."
      );
    }
  }, [checkoutResult]);

  async function goToStripe(path) {
    setWorking(true);
    setError("");

    try {
      const result = await authenticatedApi(path, {
        method: "POST",
      });

      if (
        !result?.url ||
        !/^https:\/\//.test(result.url)
      ) {
        throw new Error(
          "Secure Stripe checkout link is unavailable."
        );
      }

      window.location.assign(result.url);
    } catch (err) {
      setError(
        err.message || "Unable to open Stripe Checkout."
      );
      setWorking(false);
    }
  }

  async function handleRefresh() {
    const result = await refresh();

    if (
      result?.status === "active" &&
      result?.has_access === true
    ) {
      try {
        await refreshBilling();
      } catch (err) {
        console.warn(
          "Billing context refresh:",
          err.message
        );
      }

      navigate("/dashboard", { replace: true });
    }
  }

  if (authLoading || (loading && !confirming)) {
    return (
      <main className="aema-billing">
        <p>Loading your billing status...</p>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="aema-billing">
        <h1>Research subscription</h1>
        <p>Sign in to manage your subscription.</p>
      </main>
    );
  }

  const trialEnd = prettyDate(info?.trial_ends_at);
  const periodEnd = prettyDate(info?.current_period_end);

  const inTrial =
    info?.has_access && info?.status !== "active";

  return (
    <main className="aema-billing">
      <section className="aema-billing-card">
        <span className="aema-billing-eyebrow">
          AEMA RESEARCH
        </span>

        <h1>Your research subscription</h1>

        <p className="aema-billing-intro">
          Seven days of free research access after registration,
          then subscribe when you're ready.
        </p>

        <div className="aema-billing-price">
          <strong>CAD $20</strong>
          <span>/ month</span>
        </div>

        {error && (
          <p role="alert" className="aema-billing-error">
            {error}
          </p>
        )}

        {notice && (
          <p role="status" className="aema-billing-notice">
            {notice}
          </p>
        )}

        {confirming && (
          <p role="status">
            Checking payment confirmation. Please wait...
          </p>
        )}

        {info && (
          <div className="aema-billing-status">
            <div>
              <span>Subscription</span>
              <strong>{info.status ?? "inactive"}</strong>
            </div>

            <div>
              <span>Research access</span>
              <strong>
                {info.has_access
                  ? "Available"
                  : "Subscription required"}
              </strong>
            </div>

            {trialEnd && (
              <div>
                <span>Free trial ends</span>
                <strong>{trialEnd}</strong>
              </div>
            )}

            {periodEnd && (
              <div>
                <span>Current paid period ends</span>
                <strong>{periodEnd}</strong>
              </div>
            )}
          </div>
        )}

        {inTrial && (
          <p>
            Your trial is active. You can subscribe now,
            or wait until your trial ends.
          </p>
        )}

        {!info?.has_access && !confirming && (
          <p>
            Your free access has ended. Subscribe to continue
            using protected research features.
          </p>
        )}

        <div className="aema-billing-actions">
          {info?.status !== "active" && !confirming && (
            <button
              disabled={working || !info}
              onClick={() =>
                goToStripe("/api/billing/checkout")
              }
            >
              {working
                ? "Opening Stripe..."
                : "Subscribe — CAD $20/month"}
            </button>
          )}

          {!confirming && (
            <button
              className="aema-billing-secondary"
              disabled={working || !info}
              onClick={() =>
                goToStripe("/api/billing/portal")
              }
            >
              Manage billing
            </button>
          )}

          <button
            className="aema-billing-secondary"
            disabled={working || confirming}
            onClick={handleRefresh}
          >
            Refresh status
          </button>
        </div>

        <small>
          Subscription starts when you complete Stripe Checkout.
          The free trial does not automatically charge your card.
        </small>
      </section>
    </main>
  );
}
