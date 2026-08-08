import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { Navbar } from '../components/Navbar';
import { Footer } from '../components/Footer';
import { Ticket, Calendar, Clock, MapPin, XCircle, AlertCircle, CheckCircle2 } from 'lucide-react';

export const UserDashboard = () => {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cancellingId, setCancellingId] = useState(null);

  useEffect(() => {
    fetchMyBookings();
  }, []);

  const fetchMyBookings = async () => {
    setLoading(true);
    try {
      const res = await api.get('/bookings/my-bookings');
      if (res.success) {
        setBookings(res.bookings);
      }
    } catch (err) {
      console.error('Error fetching user bookings:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCancelBooking = async (bookingId) => {
    if (!window.confirm('Are you sure you want to cancel this booking and request a refund?')) return;
    setCancellingId(bookingId);
    try {
      const res = await api.post(`/bookings/${bookingId}/cancel`, {});
      if (res.success) {
        alert('Booking cancelled successfully.');
        fetchMyBookings();
      }
    } catch (err) {
      alert('Error cancelling booking: ' + err.message);
    } finally {
      setCancellingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#0b0f19] text-gray-100 flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-black text-white flex items-center gap-2">
              <Ticket className="w-7 h-7 text-red-500" /> Customer Booking Dashboard
            </h1>
            <p className="text-xs text-gray-400">View active tickets, booking history, and cancel reservations</p>
          </div>
        </div>

        {loading ? (
          <div className="py-20 flex justify-center">
            <div className="w-10 h-10 border-4 border-red-600 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : bookings.length === 0 ? (
          <div className="glass-panel p-12 text-center text-gray-400 rounded-3xl">
            <p className="text-lg font-bold">No bookings found</p>
            <p className="text-xs text-gray-500 mt-1">Book your favorite movie tickets to see them here.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {bookings.map(b => (
              <div key={b.booking_id} className="glass-panel p-6 rounded-2xl border border-slate-800 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                <div className="flex items-center gap-4">
                  <img
                    src={b.poster_url || 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=600&auto=format&fit=crop&q=80'}
                    alt={b.movie_title}
                    className="w-16 h-24 object-cover rounded-xl border border-slate-700"
                  />

                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-bold text-white">{b.movie_title}</h3>
                      <span className={`badge ${
                        b.status === 'Confirmed' || b.status === 'PaymentSuccess' ? 'badge-green' : (b.status === 'Pending' ? 'badge-gold' : 'badge-red')
                      }`}>
                        {b.status}
                      </span>
                    </div>

                    <p className="text-xs text-gray-400 flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-red-500" /> {b.theater_name} ({b.city}) • Screen {b.screen_number}
                    </p>

                    <p className="text-xs text-gray-400 flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-gray-500" /> {new Date(b.show_time).toLocaleString()}
                    </p>

                    <div className="text-xs text-gray-300 font-semibold pt-1">
                      Seats: <span className="text-red-400 font-bold">{b.seats ? b.seats.map(s => `${s.seat_row}${s.seat_number}`).join(', ') : 'Seats'}</span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col items-end gap-3 w-full md:w-auto border-t md:border-t-0 border-slate-800 pt-4 md:pt-0">
                  <div className="text-right">
                    <span className="text-[10px] text-gray-500 block">TOTAL PAID</span>
                    <span className="text-xl font-black text-emerald-400 font-mono">₹{b.total_amount}</span>
                  </div>

                  {(b.status === 'Confirmed' || b.status === 'Pending') && (
                    <button
                      disabled={cancellingId === b.booking_id}
                      onClick={() => handleCancelBooking(b.booking_id)}
                      className="btn-secondary py-2 px-4 text-xs text-red-400 border-red-500/30 hover:bg-red-500/10"
                    >
                      <XCircle className="w-4 h-4" /> Cancel Booking
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
};
