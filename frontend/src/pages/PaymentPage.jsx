import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  CreditCard, Smartphone, Landmark, ShieldCheck, Lock, ChevronLeft, TimerOff, XCircle
} from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useToast } from '../context/ToastContext';
import { formatCurrency, formatDate, formatTime } from '../lib/format';
import { openCheckout } from '../lib/razorpay';
import { HoldTimer } from '../components/booking/HoldTimer';
import { Button, LoadingBlock, ErrorState, EmptyState, useAsync, cx } from '../components/ui';

const METHODS = [
  { id: 'UPI', label: 'UPI', icon: Smartphone, hint: 'Pay by UPI app or QR' },
  { id: 'Credit Card', label: 'Card', icon: CreditCard, hint: 'Credit or debit card' },
  { id: 'Net Banking', label: 'Net banking', icon: Landmark, hint: 'All major banks' }
];

export function PaymentPage() {
  const { bookingId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [method, setMethod] = useState('UPI');
  const [session, setSession] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [expired, setExpired] = useState(false);
  const [failed, setFailed] = useState(null);

  // Which gateway is configured is a server decision; the UI adapts rather
  // than assuming one or hardcoding a key.
  const { data: paymentConfig } = useAsync(() => api.get('/payments/config', { auth: false }));
  const isRazorpay = paymentConfig?.provider === 'razorpay';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(`/bookings/${bookingId}`);
      setBooking(res.booking);
      setError(null);
      // Already paid — do not show a payment form for a settled booking.
      if (res.booking.status === 'Confirmed') {
        navigate(`/booking/confirmation/${bookingId}`, { replace: true });
      }
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [bookingId, navigate]);

  useEffect(() => { load(); }, [load]);

  const expiresAt = booking?.expires_at
    || (booking?.expiresInSeconds ? new Date(Date.now() + booking.expiresInSeconds * 1000).toISOString() : null);

  /**
   * Live Razorpay: open a server-created order in Checkout, then post the
   * signed response back for verification. The signature is what proves the
   * payment happened — the browser saying "it worked" is worth nothing.
   */
  const payWithRazorpay = async () => {
    const init = await api.post('/payments/initiate', {
      bookingId: Number(bookingId),
      paymentMethod: method
    });
    const checkoutSession = init.checkoutSession;
    setSession(checkoutSession);

    let response;
    try {
      response = await openCheckout(checkoutSession, {
        name: booking.customer_name,
        email: booking.customer_email
      });
    } catch (err) {
      if (err.dismissed) {
        // Closing the widget is not a failure — release the PaymentProcessing
        // state so the customer can try again on their still-held seats.
        await api.post('/payments/cancel', { bookingId: Number(bookingId) }).catch(() => {});
        toast.info('Payment cancelled. Your seats are still held.');
        await load();
        return;
      }
      throw err;
    }

    const res = await api.post('/payments/verify', {
      bookingId: Number(bookingId),
      razorpay_order_id: response.razorpay_order_id,
      razorpay_payment_id: response.razorpay_payment_id,
      razorpay_signature: response.razorpay_signature
    });

    if (res.status === 'Confirmed') {
      toast.success('Payment successful. Your booking is confirmed.');
      navigate(`/booking/confirmation/${bookingId}`, { replace: true });
    } else {
      setFailed(res.message || 'Your payment did not go through.');
    }
  };

  /** Simulator path — only reachable when no Razorpay keys are configured. */
  const payWithSimulator = async (outcome) => {
    let orderId = session?.orderId;
    if (!orderId) {
      const init = await api.post('/payments/initiate', {
        bookingId: Number(bookingId), paymentMethod: method
      });
      orderId = init.checkoutSession.orderId;
      setSession(init.checkoutSession);
    }

    const res = await api.post('/payments/confirm', {
      bookingId: Number(bookingId), orderId, paymentMethod: method, outcome
    });

    if (res.status === 'Confirmed') {
      toast.success('Payment successful. Your booking is confirmed.');
      navigate(`/booking/confirmation/${bookingId}`, { replace: true });
    } else {
      setFailed(res.message || 'Your payment did not go through.');
      toast.error(res.message || 'Payment failed. Your seats have been released.');
    }
  };

  const pay = async (outcome = 'success') => {
    if (expired) return;
    setProcessing(true);
    setFailed(null);

    try {
      if (isRazorpay && outcome === 'success') await payWithRazorpay();
      else await payWithSimulator(outcome);
    } catch (err) {
      if (err instanceof ApiError && err.isExpired) {
        setExpired(true);
        toast.error(err.message);
      } else {
        setFailed(err.message);
        toast.error(err.message || 'We could not process that payment.');
      }
    } finally {
      setProcessing(false);
    }
  };

  if (loading) return <LoadingBlock label="Loading your booking…" className="min-h-[60vh]" />;

  if (error) {
    return (
      <div className="page py-16">
        <ErrorState
          title={error.status === 404 ? 'Booking not found' : 'Could not load this booking'}
          message={error.status === 404 ? "We couldn't find that booking on your account." : error.message}
          onRetry={error.status === 404 ? undefined : load}
        />
      </div>
    );
  }

  const unpayable = ['Cancelled', 'Refunded', 'Expired'].includes(booking.status);

  if (unpayable) {
    return (
      <div className="page py-20">
        <EmptyState
          icon={TimerOff}
          title="This booking is no longer payable"
          message={`It's marked ${booking.status.toLowerCase()}. Nothing has been charged — start a new booking to get your seats.`}
          action={<Button onClick={() => navigate('/movies')}>Browse movies</Button>}
        />
      </div>
    );
  }

  return (
    <div className="page py-6 max-w-4xl pb-24">
      <button onClick={() => navigate(-1)} className="btn-ghost btn-sm mb-4 -ml-2">
        <ChevronLeft className="w-4 h-4" aria-hidden /> Back
      </button>

      <h1 className="text-2xl font-extrabold tracking-tight mb-1">Payment</h1>
      <p className="text-sm text-ink-400 mb-6 tabular">Booking {booking.booking_ref}</p>

      {expiresAt && (
        <HoldTimer expiresAt={expiresAt} onExpire={() => setExpired(true)} className="mb-6" />
      )}

      {expired && (
        <div className="surface border-negative-500/40 bg-negative-500/5 p-5 mb-6" role="alert">
          <p className="text-sm font-semibold text-ink-100 mb-1">Your seat hold expired</p>
          <p className="text-sm text-ink-400 mb-4">
            The seats have been returned to the pool and nothing was charged.
          </p>
          <Button onClick={() => navigate(`/booking/seats/${booking.show_id}`)}>Pick seats again</Button>
        </div>
      )}

      {failed && !expired && (
        <div className="surface border-negative-500/40 bg-negative-500/5 p-5 mb-6" role="alert">
          <p className="text-sm font-semibold text-negative-400 flex items-center gap-2 mb-1">
            <XCircle className="w-4 h-4" aria-hidden /> Payment unsuccessful
          </p>
          <p className="text-sm text-ink-400">{failed}</p>
        </div>
      )}

      <div className="grid md:grid-cols-5 gap-6">
        {/* Method picker */}
        <div className="md:col-span-3 surface p-5 sm:p-6">
          <h2 className="text-base font-bold text-ink-50 mb-4">
            {isRazorpay ? 'Pay securely with Razorpay' : 'How would you like to pay?'}
          </h2>

          {/*
            Razorpay Checkout collects the method itself — showing our own
            picker first would just be a second, contradictory choice. The
            simulator has no widget, so it keeps the picker.
          */}
          {!isRazorpay && (
            <div className="grid sm:grid-cols-3 gap-3 mb-6">
              {METHODS.map((m) => (
                <button
                  key={m.id}
                  onClick={() => { setMethod(m.id); setSession(null); }}
                  aria-pressed={method === m.id}
                  disabled={expired || processing}
                  className={cx(
                    'p-4 rounded-xl border text-left transition-all duration-200 disabled:opacity-50',
                    method === m.id
                      ? 'border-brand-500 bg-brand-500/10 shadow-brand-sm'
                      : 'border-ink-700 bg-ink-800/60 hover:border-ink-500'
                  )}
                >
                  <m.icon
                    className={cx('w-5 h-5 mb-2', method === m.id ? 'text-brand-400' : 'text-ink-400')}
                    aria-hidden
                  />
                  <p className="text-sm font-semibold text-ink-50">{m.label}</p>
                  <p className="text-2xs text-ink-400 mt-0.5">{m.hint}</p>
                </button>
              ))}
            </div>
          )}

          {isRazorpay && (
            <div className="flex flex-wrap gap-2 mb-6">
              {METHODS.map((m) => (
                <span key={m.id} className="badge-neutral !normal-case !tracking-normal !font-medium">
                  <m.icon className="w-3 h-3" aria-hidden /> {m.label}
                </span>
              ))}
              <span className="badge-neutral !normal-case !tracking-normal !font-medium">Wallets</span>
            </div>
          )}

          <div className="rounded-xl border border-info-500/30 bg-info-500/5 p-4 mb-6">
            <p className="text-xs font-semibold text-info-400 flex items-center gap-2 mb-1.5">
              <ShieldCheck className="w-4 h-4" aria-hidden />
              {isRazorpay
                ? (paymentConfig?.testMode ? 'Razorpay — test mode' : 'Razorpay — secure checkout')
                : 'Sandbox gateway'}
            </p>
            <p className="text-xs text-ink-300 leading-relaxed">
              {isRazorpay ? (
                paymentConfig?.testMode ? (
                  <>
                    Payments run through Razorpay in test mode, so no real money moves.
                    Use card <span className="font-mono text-ink-100">4111 1111 1111 1111</span> with
                    any future expiry and any CVV, or UPI id{' '}
                    <span className="font-mono text-ink-100">success@razorpay</span>.
                    CineWave never sees or stores your card details.
                  </>
                ) : (
                  <>
                    Your payment is handled entirely by Razorpay. CineWave never sees or
                    stores your card details — we only receive a signed confirmation.
                  </>
                )
              ) : (
                <>
                  No Razorpay keys are configured, so CineWave is using its built-in
                  simulator. No card details are collected and no money moves, but the
                  confirmation still goes through a signed webhook.
                </>
              )}
            </p>
          </div>

          <div className="space-y-3">
            <Button
              onClick={() => pay('success')}
              loading={processing}
              disabled={expired}
              size="lg"
              className="w-full justify-center"
              icon={Lock}
            >
              Pay {formatCurrency(booking.total_amount)}
            </Button>

            {/* Only meaningful against the simulator — Razorpay test mode has
                its own declined-payment instruments. */}
            {!isRazorpay && (
              <button
                onClick={() => pay('failure')}
                disabled={processing || expired}
                className="w-full text-2xs text-ink-500 hover:text-ink-300 transition-colors py-1 disabled:opacity-40"
              >
                Simulate a declined payment (for testing the failure path)
              </button>
            )}
          </div>
        </div>

        {/* Order summary */}
        <aside className="md:col-span-2">
          <div className="surface p-5 md:sticky md:top-24">
            <h2 className="text-sm font-bold text-ink-50 mb-4">Order summary</h2>

            <div className="pb-4 mb-4 border-b border-ink-800">
              <p className="font-semibold text-ink-50">{booking.movie_title}</p>
              <p className="text-xs text-ink-400 mt-1">
                {booking.theater_name} · {booking.screen_name || `Screen ${booking.screen_number}`}
              </p>
              <p className="text-xs text-ink-400 tabular">
                {formatDate(booking.show_time)} · {formatTime(booking.show_time)}
              </p>
              <div className="flex flex-wrap gap-1.5 mt-3">
                {booking.seats?.map((seat) => (
                  <span key={seat.seat_id} className="badge-brand !normal-case !tracking-normal tabular">
                    {seat.label}
                  </span>
                ))}
              </div>
            </div>

            <dl className="space-y-2 text-sm">
              <div className="flex justify-between text-ink-300">
                <dt>Tickets</dt>
                <dd className="tabular text-ink-100">{formatCurrency(booking.seat_amount)}</dd>
              </div>
              <div className="flex justify-between text-ink-300">
                <dt>Convenience fee</dt>
                <dd className="tabular text-ink-100">{formatCurrency(booking.convenience_fee)}</dd>
              </div>
              <div className="flex justify-between text-ink-300">
                <dt>GST</dt>
                <dd className="tabular text-ink-100">{formatCurrency(booking.tax_amount)}</dd>
              </div>
              <div className="flex justify-between items-baseline border-t border-ink-700 pt-3 mt-1">
                <dt className="font-bold text-ink-50">Total</dt>
                <dd className="text-xl font-extrabold text-ink-50 tabular">
                  {formatCurrency(booking.total_amount)}
                </dd>
              </div>
            </dl>
          </div>
        </aside>
      </div>
    </div>
  );
}
