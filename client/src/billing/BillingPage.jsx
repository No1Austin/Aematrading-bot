import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthProvider.jsx';
import { authenticatedApi } from '../services/authenticatedApi.js';
import './BillingPage.css';

function prettyDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}
export default function BillingPage() {
  const { user, loading: authLoading } = useAuth();
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const refresh = useCallback(async () => {
    if (!user) { setInfo(null); setLoading(false); return; }
    setLoading(true); setError('');
    try { setInfo(await authenticatedApi('/api/billing/me')); }
    catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, [user]);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    const result = new URLSearchParams(window.location.search).get('billing');
    if (result === 'success') setNotice('Checkout completed. Payment confirmation may take a moment. Refresh your status below.');
    if (result === 'cancelled') setNotice('Checkout was cancelled. You have not subscribed.');
  }, []);
  async function goToStripe(path) {
    setWorking(true); setError('');
    try {
      const result = await authenticatedApi(path, { method: 'POST' });
      if (!result.url || !/^https:\/\//.test(result.url)) throw new Error('Secure Stripe link unavailable.');
      window.location.assign(result.url);
    } catch (err) { setError(err.message); setWorking(false); }
  }
  if (authLoading || loading) return <main className="aema-billing"><p>Loading your billing status…</p></main>;
  if (!user) return <main className="aema-billing"><h1>Research subscription</h1><p>Sign in to manage your subscription.</p></main>;
  const trialEnd = prettyDate(info?.trial_ends_at);
  const periodEnd = prettyDate(info?.current_period_end);
  const inTrial = info?.has_access && info?.status !== 'active';
  return <main className="aema-billing">
    <section className="aema-billing-card">
      <span className="aema-billing-eyebrow">AEMA RESEARCH</span>
      <h1>Your research subscription</h1>
      <p className="aema-billing-intro">Seven days of free research access after registration, then subscribe when you're ready.</p>
      <div className="aema-billing-price"><strong>CAD $20</strong><span>/ month</span></div>
      {error && <p role="alert" className="aema-billing-error">{error}</p>}
      {notice && <p role="status" className="aema-billing-notice">{notice}</p>}
      {info && <div className="aema-billing-status">
        <div><span>Subscription</span><strong>{info.status ?? 'inactive'}</strong></div>
        <div><span>Research access</span><strong>{info.has_access ? 'Available' : 'Subscription required'}</strong></div>
        {trialEnd && <div><span>Free trial ends</span><strong>{trialEnd}</strong></div>}
        {periodEnd && <div><span>Current paid period ends</span><strong>{periodEnd}</strong></div>}
      </div>}
      {inTrial && <p>Your trial is active. You can subscribe now, or wait until your trial ends.</p>}
      {!info?.has_access && <p>Your free access has ended. Subscribe to continue using protected research features.</p>}
      <div className="aema-billing-actions">
        {info?.status !== 'active' && <button disabled={working || !info} onClick={() => goToStripe('/api/billing/checkout')}>Subscribe — CAD $20/month</button>}
        <button className="aema-billing-secondary" disabled={working || !info} onClick={() => goToStripe('/api/billing/portal')}>Manage billing</button>
        <button className="aema-billing-secondary" disabled={working} onClick={refresh}>Refresh status</button>
      </div>
      <small>Subscription starts when you complete Stripe Checkout. The free trial does not automatically charge your card.</small>
    </section>
  </main>;
}
