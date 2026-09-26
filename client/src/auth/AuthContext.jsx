import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from './supabase';
const Context = createContext(null);
export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => { if (mounted) { setSession(data.session); setLoading(false); } });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => { mounted = false; subscription.unsubscribe(); };
  }, []);
  return <Context.Provider value={{ session, user: session?.user ?? null, loading, signOut: () => supabase.auth.signOut() }}>{children}</Context.Provider>;
}
export const useAuth = () => useContext(Context);
