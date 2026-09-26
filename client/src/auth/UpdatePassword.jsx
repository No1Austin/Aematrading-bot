import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "./supabase.js";
import "./AuthPage.css";
export default function UpdatePassword() {
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  async function submit(e) {
    e.preventDefault(); setBusy(true); setMessage("");
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setMessage("Password updated. You can sign in now.");
      await supabase.auth.signOut();
      navigate("/login", { replace: true });
    } catch (error) { setMessage(error.message || "Password update failed. Open the latest recovery link and retry."); }
    finally { setBusy(false); }
  }
  return <main className="aema-auth"><section className="aema-auth-card"><Link to="/" className="aema-auth-brand">AEMA RESEARCH</Link><h1>Choose a new password</h1><form onSubmit={submit}><label>New password<input type="password" minLength={8} required value={password} onChange={e=>setPassword(e.target.value)}/></label><button disabled={busy}>Update password</button></form>{message && <p role="status">{message}</p>}</section></main>;
}
