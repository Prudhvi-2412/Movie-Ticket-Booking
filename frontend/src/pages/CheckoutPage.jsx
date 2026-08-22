import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom';
import { ChevronLeft, ArrowRight, Ticket, MapPin, CalendarDays, Armchair, TimerOff } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useToast } from '../context/ToastContext';
import { holdStore } from '../lib/hold';
import { formatCurrency, formatDate, formatTime } from '../lib/format';
import { HoldTimer } from '../components/booking/HoldTimer';
import { Button, EmptyState } from '../components/ui';

/**
 * Order summary between seat selection and payment.
 *
 * The hold comes from router state on a normal navigation and from
 * sessionStorage on a reload. If neither has a live hold the page refuses to
 * continue rather than letting the customer walk into a payment for seats
 * that are no longer theirs.
 */
export function CheckoutPage() {
  const { showId } = useParams();
  const navigate = useNavigate();
  const routerLocation = useLocation();
  const toast = useToast();

  const [hold, setHold] = useState(null);
  const [expired, setExpired] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const fromRouter = routerLocation.state?.hold;
    if (fromRouter) {
      const stored = holdStore.load(showId);
      setHold({
        seats: fromRouter.seats,
        summary: fromRouter.summary,
        expiresAt: fromRouter.hold.expiresAt,
        seatIds: fromRouter.hold.seatIds,
        show: stored?.show || null
      });
      return;
    }
    setHold(holdStore.load(showId));
  }, [showId, routerLocation.state]);

  const handleExpire = useCallback(() => {
    setExpired(true);
    holdStore.clear();
  }, []);

  const proceed = async () => {
    if (expired) return;
    setSubmitting(true);
    try {
      const res = await api.post('/bookings', {
        showId: Number(showId),
        seatIds: hold.seatIds
      });
      holdStore.clear();
      navigate(`/payment/${res.booking.bookingId}`, { state: { booking: res.booking, show: hold.show } });
    } catch (err) {
      if (err instanceof ApiError && (err.isExpired || err.isConflict)) {
        setExpired(true);
        holdStore.clear();
        toast.error(err.message);
      } else {
        toast.error(err.message || 'We could not start your booking. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (!hold) {
    return (
      <div className="page py-20">
        <EmptyState
          icon={TimerOff}
          title="No active seat hold"
          message="Your seat selection has expired or this page was opened directly. Pick your seats again to continue."
          action={
            <Button onClick={() => navigate(`/booking/seats/${showId}`)}>Choose seats</Button>
          }
        />
      </div>
    );
  }

  const { seats = [], summary = {}, show } = hold;

  return (
    <div className="page py-6 max-w-3xl">
      <button onClick={() => navigate(`/booking/seats/${showId}`)} className="btn-ghost btn-sm mb-4 -ml-2">
        <ChevronLeft className="w-4 h-4" aria-hidden /> Change seats
      </button>

      <h1 className="text-2xl font-extrabold tracking-tight mb-1">Review your order</h1>
      <p className="text-sm text-ink-400 mb-6">Check everything looks right before you pay.</p>

      <HoldTimer expiresAt={hold.expiresAt} onExpire={handleExpire} className="mb-6" />

      {expired && (
        <div className="surface border-negative-500/40 bg-negative-500/5 p-5 mb-6" role="alert">
          <p className="text-sm text-ink-100 font-semibold mb-1">Your seats were released</p>
          <p className="text-sm text-ink-400 mb-4">
            You ran out of time to complete this booking, so the seats went back on sale.
            Nothing has been charged.
          </p>
          <Button onClick={() => navigate(`/booking/seats/${showId}`)}>Pick seats again</Button>
        </div>
      )}

      {/* Show details */}
      {show && (
        <div className="surface p-5 mb-5">
          <h2 className="text-base font-bold text-ink-50 mb-4">{show.movie_title}</h2>
          <dl className="grid sm:grid-cols-2 gap-4 text-sm">
            <div className="flex items-start gap-2.5">
              <MapPin className="w-4 h-4 text-ink-500 mt-0.5 shrink-0" aria-hidden />
              <div>
                <dt className="text-2xs uppercase tracking-wide text-ink-500 font-semibold">Theatre</dt>
                <dd className="text-ink-100">{show.theater_name}</dd>
                <dd className="text-xs text-ink-400">
                  {show.screen_name || `Screen ${show.screen_number}`} · {show.city}
                </dd>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <CalendarDays className="w-4 h-4 text-ink-500 mt-0.5 shrink-0" aria-hidden />
              <div>
                <dt className="text-2xs uppercase tracking-wide text-ink-500 font-semibold">Showtime</dt>
                <dd className="text-ink-100 tabular">{formatDate(show.show_time)}</dd>
                <dd className="text-xs text-ink-400 tabular">{formatTime(show.show_time)}</dd>
              </div>
            </div>
          </dl>
        </div>
      )}

      {/* Seats */}
      <div className="surface p-5 mb-5">
        <h2 className="text-sm font-bold text-ink-50 flex items-center gap-2 mb-4">
          <Armchair className="w-4 h-4 text-brand-500" aria-hidden />
          {seats.length} seat{seats.length === 1 ? '' : 's'}
        </h2>
        <ul className="divide-y divide-ink-800">
          {seats.map((seat) => (
            <li key={seat.seat_id} className="flex items-center justify-between py-2.5 text-sm">
              <span className="flex items-center gap-3">
                <span className="badge-brand !normal-case !tracking-normal tabular">{seat.label}</span>
                <span className="text-ink-400">{seat.seat_type}</span>
              </span>
              <span className="tabular text-ink-100">{formatCurrency(seat.price)}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Totals */}
      <div className="surface p-5 mb-6">
        <dl className="space-y-2.5 text-sm">
          <div className="flex justify-between text-ink-300">
            <dt>Ticket subtotal</dt>
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
          {Number(summary.discountAmount) > 0 && (
            <div className="flex justify-between text-positive-400">
              <dt>Discount</dt>
              <dd className="tabular">−{formatCurrency(summary.discountAmount)}</dd>
            </div>
          )}
          <div className="flex justify-between items-baseline border-t border-ink-700 pt-3 mt-1">
            <dt className="text-base font-bold text-ink-50">Amount payable</dt>
            <dd className="text-2xl font-extrabold text-ink-50 tabular">
              {formatCurrency(summary.totalAmount)}
            </dd>
          </div>
        </dl>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <Link to={`/booking/seats/${showId}`} className="btn-secondary btn-lg sm:w-auto justify-center">
          <ChevronLeft className="w-4 h-4" aria-hidden /> Back
        </Link>
        <Button
          onClick={proceed}
          loading={submitting}
          disabled={expired}
          size="lg"
          className="flex-1 justify-center"
          icon={Ticket}
        >
          Proceed to payment <ArrowRight className="w-4 h-4" aria-hidden />
        </Button>
      </div>
    </div>
  );
}
