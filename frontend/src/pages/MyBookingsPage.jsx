import { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Ticket, Download, XCircle, CalendarDays, MapPin, Armchair, CreditCard } from 'lucide-react';
import { api } from '../lib/api';
import { useToast } from '../context/ToastContext';
import { formatCurrency, formatDate, formatTime, bookingStatusMeta } from '../lib/format';
import {
  Button, Tabs, EmptyState, ErrorState, Skeleton, ConfirmDialog, SmartImage, cx
} from '../components/ui';

const TABS = [
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'completed', label: 'Completed' },
  { id: 'cancelled', label: 'Cancelled' }
];

export function MyBookingsPage() {
  const navigate = useNavigate();
  const toast = useToast();

  const [grouped, setGrouped] = useState({ upcoming: [], completed: [], cancelled: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('upcoming');
  const [cancelling, setCancelling] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/bookings/my');
      setGrouped(res.grouped || { upcoming: [], completed: [], cancelled: [] });
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const confirmCancel = async () => {
    setBusy(true);
    try {
      const res = await api.post(`/bookings/${cancelling.booking_id}/cancel`);
      toast.success(res.message || 'Booking cancelled.');
      setCancelling(null);
      await load();
    } catch (err) {
      toast.error(err.message || 'We could not cancel that booking.');
    } finally {
      setBusy(false);
    }
  };

  const bookings = grouped[tab] || [];

  const tabsWithCounts = TABS.map((t) => ({ ...t, count: grouped[t.id]?.length ?? 0 }));

  return (
    <div className="page py-8">
      <div className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">My bookings</h1>
        <p className="text-sm text-ink-400 mt-1.5">Your tickets, past and present.</p>
      </div>

      <Tabs tabs={tabsWithCounts} value={tab} onChange={setTab} className="mb-6" />

      {error ? (
        <ErrorState message={error.message} onRetry={load} />
      ) : loading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-44 rounded-2xl" />)}
        </div>
      ) : bookings.length === 0 ? (
        <EmptyState
          icon={Ticket}
          title={
            tab === 'upcoming' ? 'No upcoming bookings'
              : tab === 'completed' ? 'No past bookings yet'
                : 'Nothing cancelled'
          }
          message={
            tab === 'upcoming'
              ? "When you book a film, it'll show up here with your ticket."
              : tab === 'completed'
                ? 'Films you have already watched will be listed here.'
                : 'Bookings you cancel or that expire will appear here.'
          }
          action={tab === 'upcoming' && <Button onClick={() => navigate('/movies')}>Browse movies</Button>}
        />
      ) : (
        <div className="space-y-4">
          {bookings.map((booking) => (
            <BookingCard
              key={booking.booking_id}
              booking={booking}
              tab={tab}
              onCancel={() => setCancelling(booking)}
            />
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!cancelling}
        onClose={() => setCancelling(null)}
        onConfirm={confirmCancel}
        loading={busy}
        title="Cancel this booking?"
        confirmLabel="Yes, cancel it"
        message={
          cancelling
            ? `Your ${cancelling.seats?.length || 0} seat(s) for ${cancelling.movie_title} will be released and, ` +
              'if you have already paid, a refund will be initiated. This cannot be undone.'
            : ''
        }
      />
    </div>
  );
}

function BookingCard({ booking, tab, onCancel }) {
  const status = bookingStatusMeta(booking.status);
  const hoursUntilShow = (new Date(booking.show_time).getTime() - Date.now()) / 3_600_000;
  // Mirrors the server rule so the button is not offered when it would fail.
  const canCancel = booking.status === 'Confirmed' && hoursUntilShow >= 2;
  const isConfirmed = booking.status === 'Confirmed';
  const needsPayment = ['Pending', 'PaymentProcessing', 'PaymentFailed'].includes(booking.status);

  return (
    <article className="surface surface-hover p-4 sm:p-5">
      <div className="flex gap-4">
        <Link to={`/movies/${booking.movie_id}`} className="w-20 sm:w-24 shrink-0">
          <SmartImage
            src={booking.poster_url}
            alt={`${booking.movie_title} poster`}
            fallbackText={booking.movie_title}
            className="rounded-xl border border-ink-700"
          />
        </Link>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="font-bold text-ink-50 truncate">{booking.movie_title}</h2>
              <p className="text-2xs font-mono text-brand-400 mt-0.5">{booking.booking_ref}</p>
            </div>
            <span className={cx(status.className, 'shrink-0')}>{status.label}</span>
          </div>

          <dl className="grid sm:grid-cols-2 gap-x-5 gap-y-1.5 mt-3 text-xs text-ink-300">
            <div className="flex items-center gap-1.5 min-w-0">
              <MapPin className="w-3.5 h-3.5 text-ink-500 shrink-0" aria-hidden />
              <span className="truncate">
                {booking.theater_name} · {booking.screen_name || `Screen ${booking.screen_number}`}
              </span>
            </div>
            <div className="flex items-center gap-1.5 tabular">
              <CalendarDays className="w-3.5 h-3.5 text-ink-500 shrink-0" aria-hidden />
              {formatDate(booking.show_time)} · {formatTime(booking.show_time)}
            </div>
            <div className="flex items-center gap-1.5 min-w-0">
              <Armchair className="w-3.5 h-3.5 text-ink-500 shrink-0" aria-hidden />
              <span className="truncate tabular">
                {booking.seats?.map((s) => s.label).join(', ') || '—'}
              </span>
            </div>
            <div className="flex items-center gap-1.5 tabular">
              <CreditCard className="w-3.5 h-3.5 text-ink-500 shrink-0" aria-hidden />
              {formatCurrency(booking.total_amount, { precise: true })}
            </div>
          </dl>

          <div className="flex flex-wrap items-center gap-2 mt-4">
            {isConfirmed && (
              <>
                <Link to={`/bookings/${booking.booking_id}/ticket`} className="btn-primary btn-sm">
                  <Ticket className="w-3.5 h-3.5" aria-hidden /> View ticket
                </Link>
                <Link
                  to={`/bookings/${booking.booking_id}/ticket?print=1`}
                  className="btn-secondary btn-sm"
                >
                  <Download className="w-3.5 h-3.5" aria-hidden /> Download
                </Link>
              </>
            )}

            {needsPayment && (
              <Link to={`/payment/${booking.booking_id}`} className="btn-primary btn-sm">
                <CreditCard className="w-3.5 h-3.5" aria-hidden /> Complete payment
              </Link>
            )}

            {canCancel && (
              <button onClick={onCancel} className="btn-danger btn-sm">
                <XCircle className="w-3.5 h-3.5" aria-hidden /> Cancel
              </button>
            )}

            {isConfirmed && !canCancel && tab === 'upcoming' && (
              <span className="text-2xs text-ink-500">
                Cancellation closes 2 hours before showtime
              </span>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
