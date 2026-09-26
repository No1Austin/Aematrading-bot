import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';
export default function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div role="status">Checking your session…</div>;
  return user ? children : <Navigate to="/login" state={{ from: location.pathname }} replace />;
}
