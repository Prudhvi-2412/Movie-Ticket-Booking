import { Navigate, useLocation } from 'react-router-dom';
import { ShieldOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { LoadingBlock, EmptyState, Button } from './ui';

/**
 * Route guard.
 *
 * Waits for the session restore to finish before deciding — redirecting while
 * `loading` is true would bounce a signed-in user to /login on every page
 * refresh. An unauthenticated user is sent to /login with the intended path
 * so they land back where they were trying to go.
 *
 * A signed-in customer hitting an admin route gets a clear 403 screen rather
 * than a redirect that looks like the link is broken.
 */
export function ProtectedRoute({ children, adminOnly = false }) {
  const { isAuthenticated, isAdmin, loading } = useAuth();
  const location = useLocation();

  if (loading) return <LoadingBlock label="Checking your session…" className="min-h-[60vh]" />;

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (adminOnly && !isAdmin) {
    return (
      <div className="page py-20">
        <EmptyState
          icon={ShieldOff}
          title="Administrators only"
          message="This area manages the CineWave catalogue and bookings. Your account doesn't have access to it."
          action={<Button onClick={() => window.history.back()}>Go back</Button>}
        />
      </div>
    );
  }

  return children;
}
