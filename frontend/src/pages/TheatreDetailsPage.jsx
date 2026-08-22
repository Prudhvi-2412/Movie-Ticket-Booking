import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  Building2, MapPin, Phone, Sparkles, ChevronLeft, MonitorPlay, Armchair, TrendingUp, CalendarDays
} from 'lucide-react';
import { api, buildQuery } from '../lib/api';
import {
  formatTime, formatDate, upcomingDays, toDateParam
} from '../lib/format';
import { Skeleton, ErrorState, EmptyState, SmartImage, cx } from '../components/ui';

export function TheatreDetailsPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [theatre, setTheatre] = useState(null);
  const [shows, setShows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showsLoading, setShowsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedDate, setSelectedDate] = useState(toDateParam(new Date()));

  const days = upcomingDays(7);

  useEffect(() => {
    setLoading(true);
    api.get(`/theatres/${id}`, { auth: false })
      .then((res) => { setTheatre(res.theatre); setError(null); })
      .catch(setError)
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    const controller = new AbortController();
    setShowsLoading(true);

    api.get(`/shows${buildQuery({ theatreId: id, date: selectedDate })}`,
      { signal: controller.signal, auth: false })
      .then((res) => setShows(res.shows || []))
      .catch(() => setShows([]))
      .finally(() => setShowsLoading(false));

    return () => controller.abort();
  }, [id, selectedDate]);

  if (loading) {
    return (
      <div className="page py-8 space-y-6">
        <Skeleton className="h-40 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="page py-16">
        <ErrorState
          title={error.status === 404 ? 'Theatre not found' : 'Could not load this theatre'}
          message={error.status === 404 ? "We don't have a cinema with that id." : error.message}
        />
        <div className="flex justify-center mt-4">
          <Link to="/theatres" className="btn-secondary btn-md">All theatres</Link>
        </div>
      </div>
    );
  }

  // Group the day's shows by movie so the page reads as a listing, not a log.
  const byMovie = new Map();
  for (const show of shows) {
    if (!byMovie.has(show.movie_id)) {
      byMovie.set(show.movie_id, {
        movie_id: show.movie_id,
        title: show.movie_title,
        poster_url: show.poster_url,
        language: show.language,
        certificate: show.certificate,
        shows: []
      });
    }
    byMovie.get(show.movie_id).shows.push(show);
  }
  const movies = [...byMovie.values()];

  const stats = theatre.stats || {};

  return (
    <div className="page py-6">
      <button onClick={() => navigate(-1)} className="btn-ghost btn-sm mb-4 -ml-2">
        <ChevronLeft className="w-4 h-4" aria-hidden /> Back
      </button>

      {/* Header */}
      <div className="surface p-6 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-start gap-4">
          <span className="w-14 h-14 rounded-2xl bg-brand-500/12 border border-brand-500/25
                           grid place-items-center shrink-0">
            <Building2 className="w-7 h-7 text-brand-400" aria-hidden />
          </span>

          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-extrabold tracking-tight">{theatre.name}</h1>
            <p className="text-sm text-ink-400 mt-1.5 flex items-start gap-1.5">
              <MapPin className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />
              {theatre.address || `${theatre.location}, ${theatre.city}`}
            </p>
            {theatre.contact_phone && (
              <p className="text-sm text-ink-400 mt-1 flex items-center gap-1.5">
                <Phone className="w-4 h-4 shrink-0" aria-hidden /> {theatre.contact_phone}
              </p>
            )}

            {theatre.facilities?.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-4">
                {theatre.facilities.map((f) => (
                  <span key={f} className="badge-neutral !normal-case !tracking-normal !font-medium">
                    <Sparkles className="w-2.5 h-2.5" aria-hidden /> {f}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-5 border-t border-ink-800">
          <Stat icon={MonitorPlay} label="Screens" value={theatre.screens?.length ?? 0} />
          <Stat
            icon={Armchair}
            label="Seats"
            value={theatre.screens?.reduce((sum, s) => sum + Number(s.total_seats), 0) ?? 0}
          />
          <Stat icon={CalendarDays} label="Upcoming shows" value={stats.upcoming_shows ?? 0} />
          <Stat
            icon={TrendingUp}
            label="Avg occupancy"
            value={stats.avg_occupancy != null ? `${Number(stats.avg_occupancy).toFixed(0)}%` : '—'}
          />
        </div>
      </div>

      {/* Showtimes */}
      <div className="surface p-5 sm:p-6">
        <h2 className="section-title mb-4">What's playing</h2>

        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2 -mx-1 px-1 mb-6">
          {days.map((day) => {
            const active = day.param === selectedDate;
            return (
              <button
                key={day.param}
                onClick={() => setSelectedDate(day.param)}
                aria-pressed={active}
                className={cx(
                  'shrink-0 w-16 py-2.5 rounded-xl border text-center transition-all duration-200',
                  active
                    ? 'border-brand-500 bg-brand-500 text-white shadow-brand-sm'
                    : 'border-ink-700 bg-ink-800 text-ink-100 hover:border-ink-500'
                )}
              >
                <span className="block text-2xs font-semibold uppercase tracking-wide opacity-80">
                  {day.weekday}
                </span>
                <span className="block text-lg font-bold tabular leading-tight">{day.day}</span>
                <span className="block text-2xs opacity-70">{day.month}</span>
              </button>
            );
          })}
        </div>

        {showsLoading ? (
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
          </div>
        ) : movies.length === 0 ? (
          <EmptyState
            title="No shows on this date"
            message={`${theatre.name} has nothing scheduled for ${formatDate(selectedDate)}. Try another day.`}
          />
        ) : (
          <div className="space-y-5">
            {movies.map((movie) => (
              <div key={movie.movie_id} className="surface-raised p-4 flex gap-4">
                <Link to={`/movies/${movie.movie_id}`} className="w-16 shrink-0">
                  <SmartImage
                    src={movie.poster_url}
                    alt={`${movie.title} poster`}
                    fallbackText={movie.title}
                    className="rounded-lg border border-ink-700"
                  />
                </Link>

                <div className="min-w-0 flex-1">
                  <Link
                    to={`/movies/${movie.movie_id}`}
                    className="font-semibold text-ink-50 hover:text-brand-400 transition-colors"
                  >
                    {movie.title}
                  </Link>
                  <p className="text-2xs text-ink-400 mt-0.5">
                    {[movie.language, movie.certificate].filter(Boolean).join(' · ')}
                  </p>

                  <div className="flex flex-wrap gap-2 mt-3">
                    {movie.shows.map((show) => (
                      <button
                        key={show.show_id}
                        onClick={() => navigate(`/booking/seats/${show.show_id}`)}
                        className="min-w-[5rem] px-3 py-1.5 rounded-lg border border-ink-600 bg-ink-850
                                   hover:border-brand-500 hover:bg-brand-500/10 transition-all duration-200
                                   text-center active:scale-[0.97]"
                      >
                        <span className="block text-sm font-bold text-ink-50 tabular">
                          {formatTime(show.show_time)}
                        </span>
                        <span className="block text-2xs text-ink-500">
                          {show.screen_name || `Screen ${show.screen_number}`}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="w-9 h-9 rounded-lg bg-ink-800 border border-ink-700 grid place-items-center shrink-0">
        <Icon className="w-4 h-4 text-ink-400" aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="text-2xs uppercase tracking-wide text-ink-500 font-semibold">{label}</p>
        <p className="text-base font-bold text-ink-50 tabular">{value}</p>
      </div>
    </div>
  );
}
