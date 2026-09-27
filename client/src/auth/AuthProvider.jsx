import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from './supabaseClient.js';

const AuthContext = createContext(null);

function deriveBilling(row, now = Date.now()) {
  if (!row) return { status: 'unknown', trialEndsAt: null, hasAccess: false };
  const trialEndsAt = row.trial_ends_at ?? null;
  const trialActive = Boolean(trialEndsAt && Date.parse(trialEndsAt) > now);
  const periodActive = Boolean(
    row.current_period_end && Date.parse(row.current_period_end) > now
  );
  // Frontend-only presentation state. Never use this to protect API endpoints.
  const paidActive = row.status === 'active' && periodActive;
  return {
    status: paidActive ? 'active' : trialActive ? 'trial' : row.status ?? 'inactive',
    trialEndsAt,
    currentPeriodEnd: row.current_period_end ?? null,
    hasAccess: trialActive || paidActive,
  };
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [billingLoading, setBillingLoading] = useState(false);
  const [billing, setBilling] = useState(deriveBilling(null));

  useEffect(() => {
    let active = true;
    let request = 0;

    async function refresh(nextSession) {
      const current = ++request;
      if (!active) return;
      setSession(nextSession);
      if (!nextSession?.user) {
        setBilling(deriveBilling(null));
        setBillingLoading(false);
        setLoading(false);
        return;
      }
      setBillingLoading(true);
      const { data, error } = await supabase
        .from('subscriptions')
        .select('status, trial_ends_at, current_period_end')
        .eq('user_id', nextSession.user.id)
        .maybeSingle();
      if (!active || current !== request) return;
      if (error) {
        console.error('Subscription lookup:', error.message);
        setBilling(deriveBilling(null)); // fail closed in UI on read errors
      } else {
        setBilling(deriveBilling(data));
      }
      setBillingLoading(false);
      setLoading(false);
    }

    supabase.auth.getSession().then(({ data, error }) => {
      if (error) console.error('Supabase session:', error.message);
      void refresh(data?.session ?? null);
    }).catch((error) => {
      console.error('Supabase session:', error);
      if (active) { setLoading(false); setBillingLoading(false); }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => {
        // Defer Supabase queries outside auth callback to avoid client deadlocks.
        setTimeout(() => { if (active) void refresh(nextSession); }, 0);
      }
    );
    return () => { active = false; ++request; subscription.unsubscribe(); };
  }, []);

  async function refreshBilling() {
    if (!session?.user) return;
    setBillingLoading(true);
    const { data, error } = await supabase.from('subscriptions')
      .select('status, trial_ends_at, current_period_end')
      .eq('user_id', session.user.id).maybeSingle();
    setBilling(error ? deriveBilling(null) : deriveBilling(data));
    setBillingLoading(false);
    if (error) throw error;
  }

  return (
    <AuthContext.Provider value={{
      session, user: session?.user ?? null, loading, billingLoading,
      billing, refreshBilling, signOut: () => supabase.auth.signOut(),
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth requires AuthProvider');
  return ctx;
}
