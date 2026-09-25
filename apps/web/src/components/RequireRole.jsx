import { Navigate, useLocation } from 'react-router-dom';
import { getUser, hasRole } from '@/lib/auth.js';

// Route guard. `role` is a single role string or an array (e.g. ["STAFF", "ADMIN"]).
export function RequireRole({ role, redirectTo, children }) {
  const location = useLocation();
  const user = getUser();

  if (!user) {
    return <Navigate to={redirectTo} state={{ from: location }} replace />;
  }
  if (role && !hasRole(role)) {
    return <Navigate to={redirectTo} state={{ from: location }} replace />;
  }
  return children;
}
