import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ChevronLeft, Ticket, Lock, ShieldCheck, RefreshCw, Armchair } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { holdStore } from '../lib/hold';
import { formatCurrency, formatDate, formatTime } from '../lib/format';
import { SeatMap } from '../components/booking/SeatMap';
import { Button, Skeleton, ErrorState, EmptyState, cx } from '../components/ui';

const POLL_INTERVAL_MS = 8000;
const MAX_SEATS = 10;

export function SeatSelectionPage() {
  const { showId } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const toast = useToast();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState([]);
  const [locking, setLocking] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Read inside the poller without making it a dependency, which would tear
  // down and rebuild the interval on every seat click.
  const selectedRef = useRef(selected);
  selectedRef.current = selected;

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);

    try {
      const res = await api.get(`/shows/${showId}/seats`);
      setData(res);
      setError(null);

      // Reconcile the selection against fresh server state: a seat someone
      // else has since taken must drop out rather than sit in the summary and
      // fail at checkout.
      const byId = new Map(res.seatMap.map((s) => [s.seat_id, s]));
      const current = selectedRef.current;
      const survivors = current.filter((seat) => {
        const fresh = byId.get(seat.seat_id);
        return fresh && (fresh.status === 'AVAILABLE' || fresh.status === 'HELD_BY_ME');
      });

      if (survivors.length !== current.length) {
        const lost = current.length - survivors.length;
        toast.warning(
          `${lost} of your selected seat${lost === 1 ? ' was' : 's were'} just taken by someone else.`
        );
      }
      // Re-read prices from the server in case demand pricing moved.
      setSelected(survivors.map((seat) => byId.get(seat.seat_id)));
    } catch (err) {
      if (!silent) setError(err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [showId, toast]);

  useEffect(() => { load(); }, [load]);

  // Poll so seats taken by other customers appear without a manual refresh.
  useEffect(() => {
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') load({ silent: true });
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [load]);

  const selectedIds = useMemo(() => new Set(selected.map((s) => s.seat_id)), [selected]);

  const toggleSeat = useCallback((seat) => {
    setSelected((current) => {
      if (current.some((s) => s.seat_id === seat.seat_id)) {
        return current.filter((s) => s.seat_id !== seat.seat_id);
      }
      if (current.length >= MAX_SEATS) return current;
      return [...current, seat];
    });
  }, []);

  const summary = useMemo(() => {
    const seatAmount = selected.reduce((sum, s) => sum + Number(s.price), 0);
    const convenienceFee = selected.length * 20;
    const taxAmount = Math.round((seatAmount + convenienceFee) * 0.18 * 100) / 100;
    return {
      seatAmount,
      convenienceFee,
      taxAmount,
      totalAmount: Math.round((seatAmount + convenienceFee + taxAmount) * 100) / 100
    };
  }, [selected]);

  const proceed = async () => {
    if (!isAuthenticated) {
      // Come back to this exact seat map after signing in.
      navigate('/login', { state: { from: { pathname: `/booking/seats/${showId}` } } });
      return;
    }
    if (selected.length === 0) return;

    setLocking(true);
    try {
      const res = await api.post('/bookings/lock-seats', {
        showId: Number(showId),
        seatIds: selected.map((s) => s.seat_id)
      });

      holdStore.save({
        showId: Number(showId),
        seatIds: res.hold.seatIds,
        expiresAt: res.hold.expiresAt,
        seats: res.seats,
        summary: res.summary,
        show: data.show
      });

      navigate(`/checkout/${showId}`, { state: { hold: res } });
    } catch (err) {
      if (err instanceof ApiError && err.isConflict) {
        toast.error(err.message || 'Those seats were just taken. Please choose again.');
      } else {
        toast.error(err.message || 'We could not hold those seats. Please try again.');
      }
      // Whatever went wrong, the seat map is now stale.
      load({ silent: true });
    } finally {
      setLocking(false);
    }
  };

  if (loading) return <SeatSelectionSkeleton />;

  if (error) {
    return (
      <div className="page py-16">
        <ErrorState
          title={error.status === 404 ? 'Show not found' : 'Could not load the seat map'}
          message={error.status === 404 ? 'This screening may have been cancelled.' : error.message}
          onRetry={error.status === 404 ? undefined : () => load()}
        />
        <div className="flex justify-center mt-4">
          <Link to="/movies" className="btn-secondary btn-md">Browse movies</Link>
        </div>
      </div>
    );
  }

  const { show, seatMap, availableSeats } = data;

  return (
    <div className="page py-6 pb-32 lg:pb-8">
      <button onClick={() => navigate(-1)} className="btn-ghost btn-sm mb-4 -ml-2">
        <ChevronLeft className="w-4 h-4" aria-hidden /> Back
      </button>

      {/* Show header */}
      <div className="surface p-5 mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-ink-50 truncate">{show.movie_title}</h1>
          <p className="text-sm text-ink-400 mt-1">
            {show.theater_name} · {show.screen_name || `Screen ${show.screen_number}`}
            {show.screen_type !== 'Standard' && (
              <span className="text-brand-400"> · {show.screen_type}</span>
            )}
          </p>
          <p className="text-sm text-ink-300 mt-0.5 tabular">
            {formatDate(show.show_time)} · {formatTime(show.show_time)}
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <span className="text-2xs text-ink-400 tabular">
            {availableSeats} of {seatMap.length} seats free
          </span>
          <button
            onClick={() => load({ silent: true })}
            className="btn-ghost btn-sm"
            aria-label="Refresh seat availability"
            title="Refresh availability"
          >
            <RefreshCw className={cx('w-4 h-4', refreshing && 'animate-spin')} aria-hidden />
          </button>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Seat map */}
        <div className="lg:col-span-2 surface p-5 sm:p-8">
          {seatMap.length === 0 ? (
            <EmptyState
              icon={Armchair}
              title="No seats configured"
              message="This screen doesn't have a seat layout yet, so tickets can't be sold for it."
            />
          ) : (
            <SeatMap
              seatMap={seatMap}
              selectedIds={selectedIds}
              onToggle={toggleSeat}
              maxSeats={MAX_SEATS}
            />
          )}
        </div>

        {/* Summary — sticky on desktop, docked bar on mobile */}
        <aside className="hidden lg:block">
          <div className="surface p-5 sticky top-24 space-y-5">
            <SummaryPanel
              selected={selected}
              summary={summary}
              locking={locking}
              onProceed={proceed}
              isAuthenticated={isAuthenticated}
              maxSeats={MAX_SEATS}
            />
          </div>
        </aside>
      </div>

      {/* Mobile action bar */}
      <div className="lg:hidden fixed bottom-0 inset-x-0 z-30 border-t border-ink-700 bg-ink-900/95 backdrop-blur-xl p-4">
        <div className="flex items-center justify-between gap-4 max-w-2xl mx-auto">
          <div className="min-w-0">
            <p className="text-2xs text-ink-400">
              {selected.length ? `${selected.length} seat${selected.length === 1 ? '' : 's'} · ` : ''}
              {selected.length ? selected.map((s) => s.label).join(', ') : 'No seats selected'}
            </p>
            <p className="text-lg font-extrabold text-ink-50 tabular">
              {formatCurrency(summary.totalAmount)}
            </p>
          </div>
          <Button
            onClick={proceed}
            loading={locking}
            disabled={selected.length === 0}
            className="shrink-0"
            icon={Lock}
          >
            {isAuthenticated ? 'Hold seats' : 'Sign in to book'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function SummaryPanel({ selected, summary, locking, onProceed, isAuthenticated, maxSeats }) {
  return (
    <>
      <h2 className="text-base font-bold text-ink-50 flex items-center gap-2">
        <Ticket className="w-4 h-4 text-brand-500" aria-hidden /> Your selection
      </h2>

      {selected.length === 0 ? (
        <p className="text-sm text-ink-400 leading-relaxed py-2">
          Pick your seats from the map. You can book up to {maxSeats} in one go.
        </p>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {selected.map((seat) => (
              <span key={seat.seat_id} className="badge-brand !normal-case !tracking-normal tabular">
                {seat.label}
              </span>
            ))}
          </div>

          <dl className="space-y-2 text-sm border-t border-ink-800 pt-3">
            <div className="flex justify-between text-ink-300">
              <dt>{selected.length} ticket{selected.length === 1 ? '' : 's'}</dt>
              <dd className="tabular text-ink-100">{formatCurrency(summary.seatAmount)}</dd>
            </div>
            <div className="flex justify-between text-ink-300">
              <dt>Convenience fee</dt>
              <dd className="tabular text-ink-100">{formatCurrency(summary.convenienceFee)}</dd>
            </div>
            <div className="flex justify-between text-ink-300">
              <dt>GST (18%)</dt>
              <dd className="tabular text-ink-100">{formatCurrency(summary.taxAmount)}</dd>
            </div>
          </dl>

          <div className="flex justify-between items-baseline border-t border-ink-800 pt-3">
            <span className="text-sm font-semibold text-ink-200">Total</span>
            <span className="text-2xl font-extrabold text-ink-50 tabular">
              {formatCurrency(summary.totalAmount)}
            </span>
          </div>
        </div>
      )}

      <Button
        onClick={onProceed}
        loading={locking}
        disabled={selected.length === 0}
        className="w-full"
        size="lg"
        icon={Lock}
      >
        {isAuthenticated ? 'Hold seats & continue' : 'Sign in to book'}
      </Button>

      <p className="text-2xs text-ink-500 leading-relaxed flex items-start gap-1.5">
        <ShieldCheck className="w-3.5 h-3.5 text-positive-500 shrink-0 mt-px" aria-hidden />
        Your seats are reserved exclusively for you while you pay. If you don't
        finish, they're released automatically.
      </p>
    </>
  );
}

function SeatSelectionSkeleton() {
  return (
    <div className="page py-6">
      <Skeleton className="h-24 w-full rounded-2xl mb-6" />
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 surface p-8">
          <Skeleton className="h-2 w-2/3 mx-auto mb-10" />
          <div className="space-y-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex justify-center gap-1.5">
                {Array.from({ length: 12 }).map((__, j) => (
                  <Skeleton key={j} className="w-8 h-8 rounded-md" />
                ))}
              </div>
            ))}
          </div>
        </div>
        <Skeleton className="h-80 rounded-2xl hidden lg:block" />
      </div>
    </div>
  );
}
