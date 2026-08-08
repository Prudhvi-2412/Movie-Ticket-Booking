import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { api } from '../services/api';
import { Navbar } from '../components/Navbar';
import { Footer } from '../components/Footer';
import { CreditCard, QrCode, ShieldCheck, Clock, Zap, CheckCircle2, ArrowRight } from 'lucide-react';

export const PaymentPage = () => {
  const { bookingId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  const [paymentMethod, setPaymentMethod] = useState('UPI');
  const [processing, setProcessing] = useState(false);
  const [timeLeft, setTimeLeft] = useState(600); // 10 minutes TTL
  const [simulatingWebhook, setSimulatingWebhook] = useState(false);

  const bookingData = location.state?.booking;
  const showInfo = location.state?.showInfo;
  const seats = location.state?.seats || [];
  const amount = bookingData?.totalAmount || 500;

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          alert('Seat lock expired. Seats released back to pool.');
          navigate('/');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTimer = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleSimulatePaymentWebhook = async () => {
    setSimulatingWebhook(true);
    try {
      // 1. Get Session & Signature details
      const sessionRes = await api.post('/payments/initiate', {
        bookingId: Number(bookingId),
        paymentMethod
      });

      const { transactionId, idempotencyKey, signature } = sessionRes.checkoutSession;

      // 2. Trigger Payment Gateway Webhook POST /api/webhooks/payment
      const eventId = `evt_pay_${Date.now()}`;
      const webhookRes = await api.post('/webhooks/payment', {
        eventId,
        eventType: 'payment.captured',
        bookingId: Number(bookingId),
        transactionId,
        idempotencyKey,
        amount,
        paymentMethod,
        status: 'SUCCESS',
        signature
      });

      if (webhookRes.success) {
        navigate(`/booking/confirmation/${bookingId}`, {
          state: {
            bookingId,
            transactionId,
            amount,
            seats,
            showInfo,
            paymentMethod
          }
        });
      }
    } catch (err) {
      console.error('Webhook simulation error:', err);
      alert('Payment processing failed: ' + err.message);
    } finally {
      setSimulatingWebhook(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0b0f19] text-gray-100 flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-4xl w-full mx-auto px-6 py-10">
        {/* Redis TTL Lock Timer Bar */}
        <div className="glass-panel p-4 mb-8 bg-amber-950/20 border border-amber-500/30 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Zap className="w-5 h-5 text-amber-400 animate-pulse" />
            <div>
              <span className="text-xs font-bold text-amber-400">Redis Seat Lock Active</span>
              <p className="text-[11px] text-gray-300">Complete payment before Redis TTL expires</p>
            </div>
          </div>
          <div className="flex items-center gap-2 font-mono text-lg font-black text-amber-400 bg-amber-950/60 px-3 py-1 rounded-lg border border-amber-700/50">
            <Clock className="w-4 h-4 text-amber-400" /> {formatTimer(timeLeft)}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Payment Method Selector */}
          <div className="md:col-span-2 glass-panel p-8 rounded-3xl border border-slate-800 space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                <CreditCard className="w-6 h-6 text-red-500" /> Payment Gateway Simulator
              </h2>
              <p className="text-xs text-gray-400">Integrated Razorpay / Stripe Webhook Workflow</p>
            </div>

            {/* Methods Tabs */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { id: 'UPI', label: 'UPI / QR', icon: QrCode },
                { id: 'Credit Card', label: 'Card', icon: CreditCard },
                { id: 'Net Banking', label: 'Banking', icon: ShieldCheck }
              ].map(m => (
                <button
                  key={m.id}
                  onClick={() => setPaymentMethod(m.id)}
                  className={`p-3 rounded-xl border text-xs font-bold flex flex-col items-center gap-2 transition-all ${
                    paymentMethod === m.id
                      ? 'border-red-500 bg-red-950/30 text-white shadow-md shadow-red-900/30'
                      : 'border-slate-800 bg-slate-900/60 text-gray-400 hover:border-slate-700'
                  }`}
                >
                  <m.icon className="w-5 h-5 text-red-400" />
                  {m.label}
                </button>
              ))}
            </div>

            {/* Simulating Screen */}
            <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 space-y-4">
              <div className="flex items-center justify-between text-xs border-b border-slate-800 pb-3">
                <span className="text-gray-400">Gateway:</span>
                <span className="font-mono text-emerald-400 font-bold">Razorpay Sandbox / Webhook Enabled</span>
              </div>

              {paymentMethod === 'UPI' && (
                <div className="flex flex-col items-center gap-3 py-4">
                  <div className="w-32 h-32 bg-white rounded-xl p-2 flex items-center justify-center">
                    <QrCode className="w-28 h-28 text-slate-900" />
                  </div>
                  <span className="text-xs text-gray-400">Scan QR or click simulate button below</span>
                </div>
              )}

              {paymentMethod === 'Credit Card' && (
                <div className="space-y-3 text-xs">
                  <input type="text" placeholder="Card Number (4242 •••• •••• 4242)" className="w-full bg-slate-950 p-3 rounded-xl border border-slate-800 text-gray-200 focus:outline-none" readOnly />
                  <div className="grid grid-cols-2 gap-3">
                    <input type="text" placeholder="MM/YY" className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-gray-200 focus:outline-none" readOnly />
                    <input type="text" placeholder="CVV (123)" className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-gray-200 focus:outline-none" readOnly />
                  </div>
                </div>
              )}

              {paymentMethod === 'Net Banking' && (
                <div className="text-xs text-gray-400 text-center py-4">
                  Select Bank: HDFC Bank • ICICI Bank • State Bank of India
                </div>
              )}
            </div>

            <button
              disabled={simulatingWebhook}
              onClick={handleSimulatePaymentWebhook}
              className="w-full btn-accent py-4 justify-center text-sm font-bold shadow-xl flex items-center gap-2"
            >
              {simulatingWebhook ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Verifying Signature & Executing Webhook...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-5 h-5" /> Pay ₹{amount} (Simulate Gateway Webhook) <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>

          {/* Order Summary */}
          <div className="glass-panel p-6 rounded-3xl border border-slate-800 space-y-4">
            <h3 className="text-base font-bold text-white border-b border-slate-800 pb-3">Booking Details</h3>

            <div className="space-y-3 text-xs text-gray-300">
              <div>
                <span className="text-gray-500 block">Movie:</span>
                <span className="font-bold text-white">{showInfo?.movie_title || 'Movie Title'}</span>
              </div>
              <div>
                <span className="text-gray-500 block">Theater:</span>
                <span>{showInfo?.theater_name || 'Cinema Hall'}</span>
              </div>
              <div>
                <span className="text-gray-500 block">Seats:</span>
                <span className="font-bold text-red-400">
                  {seats.length > 0 ? seats.map(s => `${s.seat_row}${s.seat_number}`).join(', ') : 'Seats'}
                </span>
              </div>
              <div className="pt-3 border-t border-slate-800 flex justify-between items-center font-bold text-sm">
                <span>Total Amount:</span>
                <span className="text-emerald-400 font-mono text-lg">₹{amount}</span>
              </div>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};
