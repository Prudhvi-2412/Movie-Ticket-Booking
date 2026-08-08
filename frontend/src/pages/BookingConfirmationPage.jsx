import React from 'react';
import { useLocation, Link, useParams } from 'react-router-dom';
import { Navbar } from '../components/Navbar';
import { Footer } from '../components/Footer';
import { CheckCircle2, Ticket, QrCode, Printer, Home, Sparkles, Cpu } from 'lucide-react';

export const BookingConfirmationPage = () => {
  const { bookingId } = useParams();
  const location = useLocation();

  const state = location.state || {};
  const transactionId = state.transactionId || `TXN_${bookingId}_9988`;
  const amount = state.amount || 700;
  const seats = state.seats || [];
  const showInfo = state.showInfo || {};
  const paymentMethod = state.paymentMethod || 'UPI';

  return (
    <div className="min-h-screen bg-[#0b0f19] text-gray-100 flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-3xl w-full mx-auto px-6 py-12">
        <div className="glass-panel p-8 rounded-3xl border border-emerald-500/30 text-center space-y-6 shadow-2xl relative overflow-hidden">
          <div className="w-16 h-16 bg-emerald-500/20 border-2 border-emerald-500 rounded-full flex items-center justify-center mx-auto text-emerald-400">
            <CheckCircle2 className="w-10 h-10 animate-bounce" />
          </div>

          <div>
            <span className="badge badge-green mb-2 inline-block">BOOKING CONFIRMED & AUDITED</span>
            <h1 className="text-3xl font-black text-white">Ticket Reserved Successfully!</h1>
            <p className="text-xs text-gray-400 mt-1">Kafka events published to Notification, Analytics, & Email Services.</p>
          </div>

          {/* Ticket Card Stub */}
          <div className="bg-slate-900 border-2 border-dashed border-slate-700 p-6 rounded-2xl text-left space-y-4 relative">
            <div className="flex justify-between items-start border-b border-slate-800 pb-4">
              <div>
                <span className="text-[10px] text-red-400 font-bold uppercase tracking-wider">CineWave M-Ticket</span>
                <h2 className="text-xl font-bold text-white">{showInfo.movie_title || 'Movie Title'}</h2>
                <p className="text-xs text-gray-400">{showInfo.theater_name || 'INOX Cinema'} • Screen 1</p>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-gray-500 block">BOOKING ID</span>
                <span className="font-mono font-bold text-emerald-400 text-sm">#{bookingId}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <span className="text-gray-500 block">Showtime:</span>
                <span className="font-semibold text-gray-200">
                  {showInfo.show_time ? new Date(showInfo.show_time).toLocaleString() : 'Today'}
                </span>
              </div>
              <div>
                <span className="text-gray-500 block">Reserved Seats:</span>
                <span className="font-bold text-red-400 text-sm">
                  {seats.length > 0 ? seats.map(s => `${s.seat_row}${s.seat_number}`).join(', ') : 'A1, A2'}
                </span>
              </div>
              <div>
                <span className="text-gray-500 block">Payment Method:</span>
                <span className="font-semibold text-gray-200">{paymentMethod}</span>
              </div>
              <div>
                <span className="text-gray-500 block">Transaction ID:</span>
                <span className="font-mono text-gray-400 text-[11px]">{transactionId}</span>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-800 flex items-center justify-between">
              <div>
                <span className="text-xs text-gray-400 block">Total Amount Paid</span>
                <span className="text-xl font-black text-emerald-400 font-mono">₹{amount}</span>
              </div>

              <div className="w-16 h-16 bg-white p-1 rounded-lg flex items-center justify-center">
                <QrCode className="w-14 h-14 text-slate-950" />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-4 pt-4">
            <button onClick={() => window.print()} className="btn-secondary py-3 px-6 text-xs">
              <Printer className="w-4 h-4" /> Print M-Ticket
            </button>
            <Link to="/" className="btn-primary py-3 px-6 text-xs">
              <Home className="w-4 h-4" /> Back to Movies
            </Link>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};
