import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { CheckCircle2, Download, Ticket, Home, ListChecks } from 'lucide-react';
import { api } from '../lib/api';
import { formatCurrency, formatDate, formatTime } from '../lib/format';
import { Button, LoadingBlock, ErrorState } from '../components/ui';

export function BookingConfirmationPage() {
  const { bookingId } = useParams();
  const navigate = useNavigate();

  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(`/bookings/${bookingId}`);
      setBooking(res.booking);
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [bookingId]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <LoadingBlock label="Confirming your booking…" className="min-h-[60vh]" />;

  if (error) {
    return (
      <div className="page py-16">
        <ErrorState
          title="Could not load your booking"
          message={error.message}
          onRetry={error.status === 404 ? undefined : load}
        />
      </div>
    );
  }

  // Reaching this page for an unconfirmed booking means payment did not
  // complete — send them back rather than showing a false success.
  if (booking.status !== 'Confirmed') {
    return (
      <div className="page py-16">
        <ErrorState
          title="This booking isn't confirmed"
          message={`It's currently ${booking.status.toLowerCase()}. If you were charged, it will be reversed automatically.`}
          onRetry={undefined}
        />
        <div className="flex justify-center gap-3 mt-4">
          <Button variant="secondary" onClick={() => navigate(`/payment/${bookingId}`)}>Try payment again</Button>
          <Link to="/bookings" className="btn-ghost btn-md">My bookings</Link>
        </div>
      </div>
    );
  }

  const rows = [
    ['Booking ID', booking.booking_ref, true],
    ['Movie', booking.movie_title],
    ['Theatre', booking.theater_name],
    ['Screen', booking.screen_name || `Screen ${booking.screen_number}`],
    ['Date', formatDate(booking.show_time)],
    ['Time', formatTime(booking.show_time)],
    ['Seats', booking.seats?.map((s) => s.label).join(', ')],
    ['Amount paid', formatCurrency(booking.total_amount, { precise: true })]
  ];

  return (
    <div className="page py-10 max-w-2xl">
      <div className="text-center mb-9">
        <div className="w-16 h-16 rounded-2xl bg-positive-500/15 border border-positive-500/35
                        grid place-items-center mx-auto mb-5 animate-scale-in">
          <CheckCircle2 className="w-8 h-8 text-positive-400" aria-hidden />
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight">Booking confirmed</h1>
        <p className="text-sm text-ink-400 mt-2.5 max-w-md mx-auto leading-relaxed">
          Your seats are locked in. We've sent the details to{' '}
          <span className="text-ink-200">your registered email</span> — and your
          ticket is ready below.
        </p>
      </div>

      <div className="surface p-6 mb-6">
        <dl className="divide-y divide-ink-800">
          {rows.map(([label, value, mono]) => (
            <div key={label} className="flex items-baseline justify-between gap-4 py-3 first:pt-0 last:pb-0">
              <dt className="text-xs uppercase tracking-wide text-ink-500 font-semibold shrink-0">{label}</dt>
              <dd
                className={`text-sm text-right ${
                  mono ? 'font-mono font-bold text-brand-400' : 'font-medium text-ink-50'
                } tabular`}
              >
                {value}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <Button size="lg" icon={Ticket} onClick={() => navigate(`/bookings/${bookingId}/ticket`)}>
          View ticket
        </Button>
        <Button
          variant="secondary"
          size="lg"
          icon={Download}
          onClick={() => navigate(`/bookings/${bookingId}/ticket?print=1`)}
        >
          Download ticket
        </Button>
        <Link to="/bookings" className="btn-ghost btn-lg justify-center">
          <ListChecks className="w-4 h-4" aria-hidden /> My bookings
        </Link>
        <Link to="/" className="btn-ghost btn-lg justify-center">
          <Home className="w-4 h-4" aria-hidden /> Back to home
        </Link>
      </div>
    </div>
  );
}
