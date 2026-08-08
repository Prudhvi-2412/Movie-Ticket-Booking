import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Navbar } from '../components/Navbar';
import { Footer } from '../components/Footer';
import { Lock, Zap, Clock, ShieldCheck, Ticket, AlertTriangle } from 'lucide-react';

export const SeatSelectionPage = () => {
  const { showId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [show, setShow] = useState(null);
  const [seatMap, setSeatMap] = useState([]);
  const [selectedSeats, setSelectedSeats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [locking, setLocking] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [lockCountdown, setLockCountdown] = useState(null);

  useEffect(() => {
    fetchShowSeats();
    const interval = setInterval(fetchShowSeats, 5000); // Polling seat locks status every 5 seconds
    return () => clearInterval(interval);
  }, [showId]);

  const fetchShowSeats = async () => {
    try {
      const res = await api.get(`/shows/${showId}/seats`);
      if (res.success) {
        setShow(res.show);
        setSeatMap(res.seatMap);
      }
    } catch (err) {
      console.error('Error fetching seat layout:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSeatClick = (seat) => {
    if (seat.status === 'BOOKED' || (seat.status === 'LOCKED' && !seat.lockedByMe)) {
      return; // Cannot click booked or locked by another user
    }

    if (selectedSeats.some(s => s.seat_id === seat.seat_id)) {
      setSelectedSeats(selectedSeats.filter(s => s.seat_id !== seat.seat_id));
    } else {
      if (selectedSeats.length >= 6) {
        setErrorMsg('Maximum 6 seats allowed per transaction.');
        return;
      }
      setErrorMsg('');
      setSelectedSeats([...selectedSeats, seat]);
    }
  };

  const handleAcquireLockAndProceed = async () => {
    if (!user) {
      navigate('/login');
      return;
    }

    if (selectedSeats.length === 0) {
      setErrorMsg('Please select at least one seat to proceed.');
      return;
    }

    setLocking(true);
    setErrorMsg('');

    try {
      const seatIds = selectedSeats.map(s => s.seat_id);
      const totalAmount = selectedSeats.reduce((sum, s) => sum + Number(s.price), 0);

      // 1. Lock Seats in Redis Distributed Lock Store
      const lockRes = await api.post('/bookings/lock-seats', {
        showId: Number(showId),
        seatIds
      });

      if (!lockRes.success) {
        setErrorMsg(lockRes.message || 'Failed to acquire Redis seat lock.');
        fetchShowSeats();
        return;
      }

      // 2. Create Pending Booking in MySQL Database
      const bookingRes = await api.post('/bookings/create', {
        showId: Number(showId),
        seatIds,
        totalAmount
      });

      if (bookingRes.success) {
        // Redirect to Payment Gateway Simulator
        navigate(`/payment/${bookingRes.booking.bookingId}`, {
          state: {
            booking: bookingRes.booking,
            showInfo: show,
            seats: selectedSeats,
            lockExpiry: lockRes.lock.expiresInSeconds
          }
        });
      }
    } catch (err) {
      setErrorMsg(err.message || 'Seat lock conflict. Another user may have selected these seats.');
      fetchShowSeats();
    } finally {
      setLocking(false);
    }
  };

  // Group seats by row
  const seatsByRow = {};
  seatMap.forEach(s => {
    if (!seatsByRow[s.seat_row]) seatsByRow[s.seat_row] = [];
    seatsByRow[s.seat_row].push(s);
  });

  const totalAmount = selectedSeats.reduce((sum, s) => sum + Number(s.price), 0);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0b0f19] flex items-center justify-center text-white">
        <div className="w-10 h-10 border-4 border-red-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0b0f19] text-gray-100 flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-6">
        {/* Top Header Card */}
        <div className="glass-panel p-6 rounded-2xl mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4 border border-slate-800">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold text-red-500 uppercase tracking-wider mb-1">
              <Zap className="w-4 h-4" /> Redis Distributed Lock Protected
            </div>
            <h1 className="text-2xl font-black text-white">{show?.movie_title}</h1>
            <p className="text-xs text-gray-400">
              {show?.theater_name} • {new Date(show?.show_time).toLocaleString()}
            </p>
          </div>

          <div className="flex items-center gap-4 bg-slate-900/80 px-4 py-2.5 rounded-xl border border-slate-800 text-xs">
            <span className="flex items-center gap-1.5"><Lock className="w-3.5 h-3.5 text-amber-400" /> Redis TTL: 10 Mins</span>
            <span className="flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> Anti-Double Booking</span>
          </div>
        </div>

        {errorMsg && (
          <div className="mb-6 p-4 rounded-xl bg-red-950/60 border border-red-500/50 text-red-300 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Cinema Seat Map (2 Columns) */}
          <div className="lg:col-span-2 glass-panel p-6 md:p-10 rounded-3xl border border-slate-800 flex flex-col items-center">
            {/* Screen Projection Curve */}
            <div className="w-full max-w-lg mb-12 flex flex-col items-center">
              <div className="w-full h-3 bg-gradient-to-r from-red-600/20 via-red-500 to-red-600/20 rounded-t-full shadow-[0_10px_30px_rgba(229,9,20,0.5)]"></div>
              <span className="text-[10px] uppercase tracking-widest text-slate-500 mt-2 font-mono">CINEMA SCREEN THIS WAY</span>
            </div>

            {/* Seat Matrix Grid */}
            <div className="space-y-4 w-full overflow-x-auto pb-4 flex flex-col items-center">
              {Object.entries(seatsByRow).map(([row, seats]) => (
                <div key={row} className="flex items-center gap-3">
                  <span className="w-5 text-center text-xs font-bold text-slate-500 font-mono">{row}</span>
                  <div className="flex gap-2">
                    {seats.map(seat => {
                      const isSelected = selectedSeats.some(s => s.seat_id === seat.seat_id);
                      let seatClass = 'bg-slate-800 text-slate-400 hover:bg-slate-700 border-slate-700'; // Default available

                      if (seat.status === 'BOOKED') {
                        seatClass = 'bg-slate-950 text-slate-700 border-slate-900 cursor-not-allowed opacity-40';
                      } else if (seat.status === 'LOCKED' && !seat.lockedByMe) {
                        seatClass = 'bg-amber-950/80 text-amber-500 border-amber-600/50 cursor-not-allowed animate-pulse';
                      } else if (isSelected) {
                        seatClass = 'bg-red-600 text-white border-red-500 shadow-lg shadow-red-600/50 scale-110';
                      }

                      return (
                        <button
                          key={seat.seat_id}
                          disabled={seat.status === 'BOOKED' || (seat.status === 'LOCKED' && !seat.lockedByMe)}
                          onClick={() => handleSeatClick(seat)}
                          className={`w-8 h-8 rounded-lg text-[11px] font-bold border transition-all duration-200 flex items-center justify-center ${seatClass}`}
                          title={`Row ${seat.seat_row}${seat.seat_number} (${seat.seat_type}) - ₹${seat.price}`}
                        >
                          {seat.seat_number}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* Seat Legend */}
            <div className="flex flex-wrap items-center justify-center gap-6 mt-10 pt-6 border-t border-slate-800/80 text-xs text-gray-400">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-slate-800 border border-slate-700"></div>
                <span>Available</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-red-600 shadow-sm shadow-red-600"></div>
                <span>Selected</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-amber-950 border border-amber-600/50"></div>
                <span>Redis Locked</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-slate-950 border border-slate-900 opacity-40"></div>
                <span>Booked</span>
              </div>
            </div>
          </div>

          {/* Checkout Summary Card */}
          <div className="space-y-6">
            <div className="glass-panel p-6 rounded-3xl border border-slate-800 space-y-5">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Ticket className="w-5 h-5 text-red-500" /> Booking Summary
              </h3>

              <div className="space-y-3 text-xs border-y border-slate-800 py-4">
                <div className="flex justify-between text-gray-400">
                  <span>Selected Seats:</span>
                  <span className="font-bold text-white">
                    {selectedSeats.length > 0
                      ? selectedSeats.map(s => `${s.seat_row}${s.seat_number}`).join(', ')
                      : 'None'}
                  </span>
                </div>

                <div className="flex justify-between text-gray-400">
                  <span>Seat Categories:</span>
                  <span className="font-semibold text-gray-300">
                    {[...new Set(selectedSeats.map(s => s.seat_type))].join(', ') || 'N/A'}
                  </span>
                </div>

                <div className="flex justify-between text-gray-400">
                  <span>Convenience Fee & Taxes:</span>
                  <span className="font-mono text-gray-300">₹{selectedSeats.length * 20}</span>
                </div>
              </div>

              <div className="flex justify-between items-center pt-2">
                <span className="text-sm font-semibold text-gray-300">Total Payable:</span>
                <span className="text-2xl font-black text-emerald-400 font-mono">
                  ₹{totalAmount > 0 ? totalAmount + selectedSeats.length * 20 : 0}
                </span>
              </div>

              <button
                disabled={selectedSeats.length === 0 || locking}
                onClick={handleAcquireLockAndProceed}
                className="w-full btn-primary py-3.5 justify-center text-sm font-bold shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {locking ? (
                  <span className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Acquiring Redis Lock...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <Lock className="w-4 h-4" /> Lock Seats & Pay
                  </span>
                )}
              </button>

              <p className="text-[10px] text-gray-500 text-center leading-relaxed">
                Locks seats atomically in Redis for 10 minutes. If payment is not completed, seats automatically unlock.
              </p>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};
