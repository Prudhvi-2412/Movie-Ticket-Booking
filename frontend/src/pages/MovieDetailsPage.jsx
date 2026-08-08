import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../services/api';
import { Navbar } from '../components/Navbar';
import { Footer } from '../components/Footer';
import { Star, Clock, Calendar, MapPin, Ticket, Play, UserCheck } from 'lucide-react';

export const MovieDetailsPage = () => {
  const { id } = useParams();
  const [movie, setMovie] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMovieDetails();
  }, [id]);

  const fetchMovieDetails = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/movies/${id}`);
      if (res.success) {
        setMovie(res.movie);
      }
    } catch (err) {
      console.error('Error fetching movie details:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0b0f19] flex items-center justify-center text-white">
        <div className="w-10 h-10 border-4 border-red-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!movie) {
    return (
      <div className="min-h-screen bg-[#0b0f19] text-white flex flex-col justify-between">
        <Navbar />
        <div className="text-center py-20">Movie Not Found</div>
        <Footer />
      </div>
    );
  }

  // Group shows by theater
  const showsByTheater = {};
  if (movie.shows) {
    movie.shows.forEach(show => {
      const key = `${show.theater_name} (${show.location}, ${show.city})`;
      if (!showsByTheater[key]) showsByTheater[key] = [];
      showsByTheater[key].push(show);
    });
  }

  return (
    <div className="min-h-screen bg-[#0b0f19] text-gray-100 flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-8">
        {/* Top Hero Card */}
        <div className="glass-panel p-6 md:p-8 rounded-3xl mb-10 relative overflow-hidden border border-slate-700/60">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 items-center">
            <div className="aspect-[2/3] rounded-2xl overflow-hidden shadow-2xl border-2 border-slate-700 max-w-xs mx-auto md:mx-0">
              <img src={movie.poster_url} alt={movie.title} className="w-full h-full object-cover" />
            </div>

            <div className="md:col-span-3 space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <span className="badge badge-red">{movie.genre}</span>
                <span className="badge badge-gold flex items-center gap-1">
                  <Star className="w-3.5 h-3.5 fill-amber-400" /> {movie.rating} Rating
                </span>
                <span className="text-xs text-gray-400 font-semibold">{movie.language}</span>
              </div>

              <h1 className="text-3xl md:text-5xl font-black text-white">{movie.title}</h1>

              <div className="flex flex-wrap items-center gap-6 text-xs text-gray-300">
                <span className="flex items-center gap-1.5"><Clock className="w-4 h-4 text-red-500" /> {movie.duration_minutes} Minutes</span>
                <span className="flex items-center gap-1.5"><Calendar className="w-4 h-4 text-red-500" /> Release: {movie.release_date ? new Date(movie.release_date).toLocaleDateString() : '2024'}</span>
              </div>

              <p className="text-sm text-gray-300 leading-relaxed">{movie.description}</p>

              {movie.director && (
                <div className="pt-2 text-xs text-gray-400 flex items-center gap-2">
                  <UserCheck className="w-4 h-4 text-red-400" />
                  <span><strong>Director:</strong> {movie.director}</span>
                  {movie.cast && <span className="ml-4"><strong>Cast:</strong> {movie.cast}</span>}
                </div>
              )}

              {movie.trailer_url && (
                <div className="pt-4">
                  <a href={movie.trailer_url} target="_blank" rel="noreferrer" className="btn-secondary py-2.5 px-5 text-xs inline-flex items-center gap-2">
                    <Play className="w-4 h-4 text-red-500 fill-red-500" /> Watch Official Trailer
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Shows & Theater Timings Section */}
        <div className="space-y-6">
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <Ticket className="w-6 h-6 text-red-500" /> Select Theater & Show Timing
          </h2>

          {Object.keys(showsByTheater).length === 0 ? (
            <div className="glass-panel p-8 text-center text-gray-400 text-sm">
              No active showtimes scheduled for this movie currently.
            </div>
          ) : (
            Object.entries(showsByTheater).map(([theater, shows]) => (
              <div key={theater} className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-2 text-white font-bold text-base">
                    <MapPin className="w-4 h-4 text-red-500" /> {theater}
                  </div>
                  <span className="text-xs text-gray-400 font-mono">Screen 1 & 2 • M-Ticket Available</span>
                </div>

                <div className="flex flex-wrap gap-4 pt-2">
                  {shows.map(show => {
                    const showDate = new Date(show.show_time);
                    const formattedTime = showDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                    const formattedDate = showDate.toLocaleDateString([], { month: 'short', day: 'numeric' });

                    return (
                      <Link
                        key={show.show_id}
                        to={`/booking/seats/${show.show_id}`}
                        className="group border border-slate-700/80 hover:border-red-500 bg-slate-900/90 hover:bg-red-950/20 px-5 py-3 rounded-xl transition-all flex flex-col items-center gap-1 shadow-md hover:scale-105"
                      >
                        <span className="text-sm font-bold text-emerald-400 group-hover:text-red-400 transition-colors">
                          {formattedTime}
                        </span>
                        <span className="text-[10px] text-gray-400">{formattedDate}</span>
                        <span className="text-xs font-mono font-semibold text-amber-400 mt-1">₹{Number(show.price).toFixed(0)}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
};
