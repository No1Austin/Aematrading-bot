import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../auth/supabaseClient.js';
import { useAuth } from '../auth/AuthProvider.jsx';
import './AuthPage.css';
export default function AuthPage({ mode = 'login' }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const next = location.state?.from || '/dashboard';
  if (user && mode !== 'reset') return <Navigate to={next} replace />;
  async function submit(event) {
    event.preventDefault(); setBusy(true); setMessage('');
    try {
      if (mode === 'register') {
        // AEMA referral attribution will be added after verifying the shared-project SQL.
        const ref = new URLSearchParams(window.location.search).get('ref');
        if (ref) sessionStorage.setItem('aema_pending_referral', ref);
        const { data, error } = await supabase.auth.signUp({
          email, password,
          options: { emailRedirectTo: `${window.location.origin}/dashboard` },
        });
        if (error) throw error;
        if (data.session) navigate('/dashboard', { replace: true });
        else setMessage('Check your email for a confirmation link.');
      } else if (mode === 'reset') {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/update-password`,
        });
        if (error) throw error;
        setMessage('If the address is registered, you will receive a recovery email.');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate(next, { replace: true });
      }
    } catch (error) { setMessage(error.message || 'Authentication failed.'); }
    finally { setBusy(false); }
  }
  const title = mode === 'register' ? 'Create your AEMA account' : mode === 'reset' ? 'Reset your password' : 'Sign in to AEMA';
  return <main className="aema-auth-page"><section className="aema-auth-card">
    <Link className="aema-auth-brand" to="/">AEMA <span>RESEARCH</span></Link>
    <h1>{title}</h1>
    <form onSubmit={submit}>
      <label htmlFor="auth-email">Email</label>
      <input id="auth-email" type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} />
      {mode !== 'reset' && <><label htmlFor="auth-password">Password</label><input id="auth-password" type="password" minLength={6} autoComplete={mode === 'register' ? 'new-password' : 'current-password'} required value={password} onChange={e => setPassword(e.target.value)} /></>}
      <button disabled={busy} type="submit">{busy ? 'Please wait…' : mode === 'register' ? 'Create account' : mode === 'reset' ? 'Send recovery email' : 'Sign in'}</button>
    </form>
    {message && <p role="status" className="aema-auth-message">{message}</p>}
    <div className="aema-auth-links">{mode !== 'login' && <Link to="/login">Sign in</Link>}{mode !== 'register' && <Link to="/register">Create account</Link>}{mode !== 'reset' && <Link to="/forgot-password">Forgot password?</Link>}</div>
  </section></main>;
}
