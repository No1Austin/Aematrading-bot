import { useEffect, useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { supabase } from "./supabase.js";
export default function RequireAuth() {
  const [session, setSession] = useState(undefined);
  const location = useLocation();
  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => { if (active) setSession(data.session); });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => { if (active) setSession(next); });
    return () => { active = false; subscription.unsubscribe(); };
  }, []);
  if (session === undefined) return <main style={{padding:32}}>Checking your session…</main>;
  return session ? <Outlet /> : <Navigate to="/login" state={{ from: location.pathname }} replace />;
}
