import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { supabase } from "./supabase.js";
import { getAuthErrorMessage } from "./authErrors.js";
import "./AuthPage.css";

export default function AuthPage({ mode = "login" }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [authError, setAuthError] = useState("");
  const [busy, setBusy] = useState(false);

  const location = useLocation();
  const navigate = useNavigate();
  const ref = new URLSearchParams(location.search).get("ref")?.trim() || "";
  const isRegister = mode === "register";
  const isReset = mode === "reset";

  async function submit(event) {
    event.preventDefault();
    if (busy) return;

    setBusy(true);
    setMessage("");
    setAuthError("");

    try {
      const normalizedEmail = email.trim();

      if (isRegister) {
        // Referral metadata alone does not award points.
        // Server-side referral attribution must be configured separately.
        const { data, error } = await supabase.auth.signUp({
          email: normalizedEmail,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/login`,
            data: ref
              ? { aema_referral_code: ref }
              : { aema_signup: true },
          },
        });

        if (error) throw error;
        if (data?.session) {
          navigate("/dashboard", { replace: true });
          return;
        }
        setMessage(
          "Registration submitted. If email verification is required, check your inbox for the confirmation link."
        );
      } else if (isReset) {
        const { error } = await supabase.auth.resetPasswordForEmail(
          normalizedEmail,
          { redirectTo: `${window.location.origin}/update-password` }
        );
        if (error) throw error;
        setMessage(
          "If an account exists for that email, a recovery link has been sent."
        );
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password,
        });
        if (error) throw error;

        const from = location.state?.from;
        const destination =
          typeof from === "string" &&
          from.startsWith("/") &&
          !from.startsWith("//") &&
          !from.startsWith("/\\")
            ? from
            : "/dashboard";

        navigate(destination, { replace: true });
      }
    } catch (error) {
      console.error("[AEMA_AUTH_ERROR]", {
        mode,
        code: error?.code || null,
        status: error?.status || null,
        message: error?.message || null,
      });
      setAuthError(getAuthErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="aema-auth">
      <section className="aema-auth-card">
        <Link to="/" className="aema-auth-brand">AEMA RESEARCH</Link>
        <h1>
          {isRegister
            ? "Create your account"
            : isReset
              ? "Reset password"
              : "Welcome back"}
        </h1>
        <p className="aema-auth-subtitle">
          {isRegister
            ? "Create an account to access your research workspace."
            : isReset
              ? "Enter your email to request a recovery link."
              : "Sign in to your market research workspace."}
        </p>

        {isRegister && ref && (
          <p className="aema-auth-referral">Referral code: {ref}</p>
        )}

        <form onSubmit={submit} noValidate={false}>
          <label htmlFor="aema-auth-email">
            Email
            <input
              id="aema-auth-email"
              type="email"
              required
              autoComplete="email"
              value={email}
              disabled={busy}
              onChange={(event) => {
                setEmail(event.target.value);
                setAuthError("");
              }}
            />
          </label>

          {!isReset && (
            <label htmlFor="aema-auth-password">
              Password
              <input
                id="aema-auth-password"
                type="password"
                required
                minLength={6}
                autoComplete={isRegister ? "new-password" : "current-password"}
                value={password}
                disabled={busy}
                onChange={(event) => {
                  setPassword(event.target.value);
                  setAuthError("");
                }}
              />
            </label>
          )}

          {authError && (
            <div className="aema-auth-error" role="alert">
              <span className="aema-auth-error-icon" aria-hidden="true">⚠</span>
              <div>
                <strong>Authentication error</strong>
                <p>{authError}</p>
              </div>
            </div>
          )}

          {message && (
            <div className="aema-auth-success" role="status">
              {message}
            </div>
          )}

          <button type="submit" disabled={busy} aria-busy={busy}>
            {busy
              ? "Please wait…"
              : isRegister
                ? "Create account"
                : isReset
                  ? "Send recovery link"
                  : "Sign in"}
          </button>
        </form>

        <nav aria-label="Authentication links">
          {mode !== "login" && <Link to="/login">Sign in</Link>}
          {mode !== "register" && <Link to="/register">Create account</Link>}
          {mode === "login" && (
            <Link to="/forgot-password">Forgot password?</Link>
          )}
        </nav>
      </section>
    </main>
  );
}
