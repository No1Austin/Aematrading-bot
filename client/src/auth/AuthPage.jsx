import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { supabase } from "./supabase.js";
import "./AuthPage.css";
export default function AuthPage({ mode = "login" }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const ref = new URLSearchParams(location.search).get("ref")?.trim() || "";
  async function submit(event) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      if (mode === "register") {
        // Referral metadata alone does not award points: server-side attribution must be configured.
        const { data, error } = await supabase.auth.signUp({ email, password, options: {
          emailRedirectTo: `${window.location.origin}/login`,
          data: ref ? { aema_referral_code: ref } : { aema_signup: true },
        }});
        if (error) throw error;
        setMessage(data.session ? "Account created. You can now continue to the dashboard." : "Check your email for the verification link, then sign in.");
        if (data.session) navigate("/dashboard", { replace: true });
      } else if (mode === "reset") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/update-password`,
        });
        if (error) throw error;
        setMessage("If an account exists for that email, a recovery link has been sent.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        const from = location.state?.from;
        navigate(typeof from === "string" && from.startsWith("/") && !from.startsWith("//") ? from : "/dashboard", { replace: true });
      }
    } catch (error) { setMessage(error.message || "Authentication failed."); }
    finally { setBusy(false); }
  }
  return <main className="aema-auth"><section className="aema-auth-card">
    <Link to="/" className="aema-auth-brand">AEMA RESEARCH</Link>
    <h1>{mode === "register" ? "Create your account" : mode === "reset" ? "Reset password" : "Welcome back"}</h1>
    {mode === "register" && ref && <p>Referral code: {ref}</p>}
    <form onSubmit={submit}>
      <label>Email<input type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} /></label>
      {mode !== "reset" && <label>Password<input type="password" required minLength={6} autoComplete={mode === "register" ? "new-password" : "current-password"} value={password} onChange={e => setPassword(e.target.value)} /></label>}
      <button disabled={busy}>{busy ? "Please wait…" : mode === "register" ? "Create account" : mode === "reset" ? "Send recovery link" : "Sign in"}</button>
    </form>
    {message && <p role="status">{message}</p>}
    <nav>{mode !== "login" && <Link to="/login">Sign in</Link>}{mode !== "register" && <Link to="/register">Create account</Link>}{mode === "login" && <Link to="/forgot-password">Forgot password?</Link>}</nav>
  </section></main>;
}
