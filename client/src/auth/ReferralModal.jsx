import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { useAuth } from './AuthContext';
import './ReferralModal.css';
export default function ReferralModal({ open, onClose }) {
  const { user } = useAuth();
  const [profile, setProfile] = useState(null);
  const [points, setPoints] = useState(0);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!open || !user) return;
    let active = true;
    (async () => {
      const [p, ledger] = await Promise.all([
        supabase.from('profiles').select('referral_code').eq('id', user.id).single(),
        supabase.from('reward_ledger').select('points_delta').eq('user_id', user.id),
      ]);
      if (!active) return;
      if (p.error || ledger.error) setError('Unable to load your rewards.');
      else { setProfile(p.data); setPoints((ledger.data || []).reduce((sum, item) => sum + item.points_delta, 0)); }
    })();
    return () => { active = false; };
  }, [open, user]);
  if (!open) return null;
  const link = profile?.referral_code ? `${window.location.origin}/register?ref=${encodeURIComponent(profile.referral_code)}` : '';
  return <div className="aema-ref-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}><section className="aema-ref-modal" role="dialog" aria-modal="true" aria-labelledby="aema-ref-title">
    <button className="aema-ref-close" onClick={onClose} aria-label="Close">×</button><span className="aema-ref-eyebrow">AEMA REWARDS</span>
    <h2 id="aema-ref-title">Refer friends. Earn forever.</h2><p>Earn 5 points ($5 CAD) for each successful subscription payment made by your referrals.</p>
    <div className="aema-ref-balance"><small>Recorded points</small><strong>{points}</strong><span>Estimated value: ${points.toFixed(2)} CAD</span></div>
    <label>Your referral link<input readOnly value={link} placeholder="Loading…" /></label>
    <button disabled={!link} onClick={() => navigator.clipboard.writeText(link)}>Copy referral link</button>
    <p>Cash withdrawals and subscription redemption are coming soon. No minimum withdrawal is planned.</p>{error && <p role="alert">{error}</p>}
  </section></div>;
}
