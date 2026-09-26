import { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../auth/supabaseClient.js';
import './AuthPage.css';
export default function UpdatePasswordPage() {
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault(); setBusy(true); setMessage('');
    const { error } = await supabase.auth.updateUser({ password });
    setMessage(error ? error.message : 'Password updated. You can now sign in.');
    setBusy(false);
  }
  return <main className="aema-auth-page"><section className="aema-auth-card"><Link className="aema-auth-brand" to="/">AEMA RESEARCH</Link><h1>Choose a new password</h1><form onSubmit={submit}><label htmlFor="new-password">New password</label><input id="new-password" type="password" autoComplete="new-password" minLength={6} required value={password} onChange={e => setPassword(e.target.value)} /><button disabled={busy}>Update password</button></form><p role="status">{message}</p><Link to="/login">Back to login</Link></section></main>;
}
