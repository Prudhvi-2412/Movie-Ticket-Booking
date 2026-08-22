import { Link, useNavigate } from 'react-router-dom';
import { Compass, Home, ChevronLeft } from 'lucide-react';

export function NotFoundPage() {
  const navigate = useNavigate();

  return (
    <div className="page py-24 text-center">
      <div className="w-16 h-16 rounded-2xl bg-ink-850 border border-ink-700 grid place-items-center mx-auto mb-6">
        <Compass className="w-7 h-7 text-ink-400" aria-hidden />
      </div>
      <p className="text-5xl font-extrabold text-gradient mb-3">404</p>
      <h1 className="text-xl font-bold text-ink-50">This page doesn't exist</h1>
      <p className="text-sm text-ink-400 mt-2 max-w-sm mx-auto">
        The link may be out of date, or the page may have moved.
      </p>
      <div className="flex items-center justify-center gap-3 mt-7">
        <button onClick={() => navigate(-1)} className="btn-secondary btn-md">
          <ChevronLeft className="w-4 h-4" aria-hidden /> Go back
        </button>
        <Link to="/" className="btn-primary btn-md">
          <Home className="w-4 h-4" aria-hidden /> Home
        </Link>
      </div>
    </div>
  );
}
