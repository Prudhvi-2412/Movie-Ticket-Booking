import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  Star, Clock, CalendarDays, Play, Ticket, MapPin, ChevronLeft, Building2, Sparkles, Users, Clapperboard
} from 'lucide-react';
import { api, buildQuery, isAbortError } from '../lib/api';
import { useLocationContext } from '../context/LocationContext';
import {
  formatDuration, formatDate, formatTime, upcomingDays, toDateParam, fillStatusMeta, formatCurrency
} from '../lib/format';
import {
  Button, Skeleton, EmptyState, ErrorState, SmartImage, Modal, cx
} from '../components/ui';

export function MovieDetailsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { locationId, city, openPicker } = useLocationContext();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedDate, setSelectedDate] = useState(toDateParam(new Date()));
  const [showtimesLoading, setShowtimesLoading] = useState(false);
  const [trailerOpen, setTrailerOpen] = useState(false);

  const showtimesRef = useRef(null);
  const days = upcomingDays(7);

  // First load: the movie plus whatever showtimes exist for today.
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    api.get(`/movies/${id}${buildQuery({ locationId, date: selectedDate })}`,
      { signal: controller.signal, auth: false })
      .then((res) => { setData(res); setLoading(false); })
      .catch((err) => {
        // Leave loading true on abort: the replacement request owns the state.
        if (isAbortError(err)) return;
        setError(err);
        setLoading(false);
      });

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, locationId]);

  // Subsequent date changes refresh only the showtimes, so the hero does not
  // flash back to a skeleton every time a date chip is tapped.
  useEffect(() => {
    if (!data) return undefined;
    const controller = new AbortController();
    setShowtimesLoading(true);

    api.get(`/movies/${id}${buildQuery({ locationId, date: selectedDate })}`,
      { signal: controller.signal, auth: false })
      .then((res) => setData((prev) => ({ ...prev, theatres: res.theatres, availableDates: res.availableDates })))
      .catch(() => {})
      .finally(() => setShowtimesLoading(false));

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate]);

  // `!data` covers the window between an aborted request and its replacement,
  // so the render below can destructure without a null check on every field.
  if (loading || (!data && !error)) return <MovieDetailsSkeleton />;

  if (error) {
    return (
      <div className="page py-16">
        <ErrorState
          title={error.status === 404 ? 'Movie not found' : 'Could not load this movie'}
          message={error.status === 404 ? "This film isn't in our catalogue." : error.message}
          onRetry={error.status === 404 ? undefined : () => window.location.reload()}
        />
        <div className="flex justify-center mt-4">
          <Link to="/movies" className="btn-secondary btn-md">Browse all movies</Link>
        </div>
      </div>
    );
  }

  const { movie, theatres = [], availableDates = [] } = data;
  const datesWithShows = new Set(availableDates.map((d) => toDateParam(new Date(d.show_date))));
  const isUpcoming = movie.status === 'ComingSoon';
  const castList = (movie.cast_list || '').split(',').map((c) => c.trim()).filter(Boolean);

  const scrollToShowtimes = () => showtimesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <div>
      {/* ---- Hero ---------------------------------------------------- */}
      <div className="relative">
        <div className="absolute inset-0 h-[26rem] overflow-hidden">
          {movie.banner_url && <img src={movie.banner_url} alt="" className="w-full h-full object-cover" />}
          <div className="absolute inset-0 bg-gradient-to-t from-ink-950 via-ink-950/90 to-ink-950/60" />
        </div>

        <div className="page relative pt-6 pb-10">
          <button
            onClick={() => navigate(-1)}
            className="btn-ghost btn-sm mb-6 -ml-2"
          >
            <ChevronLeft className="w-4 h-4" aria-hidden /> Back
          </button>

          <div className="flex flex-col sm:flex-row gap-7">
            <div className="w-40 sm:w-56 shrink-0 mx-auto sm:mx-0">
              <SmartImage
                src={movie.poster_url}
                alt={`${movie.title} poster`}
                fallbackText={movie.title}
                className="rounded-2xl border border-ink-700 shadow-lift"
              />
            </div>

            <div className="flex-1 min-w-0 pt-1">
              {isUpcoming && <span className="badge-info mb-3">Coming soon</span>}

              <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white leading-tight">
                {movie.title}
              </h1>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-4 text-sm">
                {movie.rating != null && (
                  <span className="flex items-center gap-1.5 font-bold text-caution-400 tabular">
                    <Star className="w-4 h-4 fill-current" aria-hidden />
                    {Number(movie.rating).toFixed(1)}<span className="text-ink-500 font-normal">/10</span>
                  </span>
                )}
                <span className="flex items-center gap-1.5 text-ink-200">
                  <Clock className="w-4 h-4 text-ink-400" aria-hidden />{formatDuration(movie.duration_minutes)}
                </span>
                {movie.certificate && (
                  <span className="px-1.5 py-0.5 rounded border border-white/25 text-2xs font-bold text-ink-100">
                    {movie.certificate}
                  </span>
                )}
                {movie.release_date && (
                  <span className="flex items-center gap-1.5 text-ink-200">
                    <CalendarDays className="w-4 h-4 text-ink-400" aria-hidden />{formatDate(movie.release_date)}
                  </span>
                )}
              </div>

              <div className="flex flex-wrap gap-2 mt-4">
                {[movie.language, movie.genre].filter(Boolean).map((tag) => (
                  <span key={tag} className="badge-neutral !normal-case !tracking-normal">{tag}</span>
                ))}
              </div>

              <p className="mt-5 text-sm sm:text-base text-ink-300 leading-relaxed max-w-3xl">
                {movie.description}
              </p>

              <div className="grid sm:grid-cols-2 gap-x-8 gap-y-3 mt-6 max-w-2xl">
                {movie.director && (
                  <div className="flex items-start gap-2.5">
                    <Clapperboard className="w-4 h-4 text-ink-500 mt-0.5 shrink-0" aria-hidden />
                    <div>
                      <p className="text-2xs uppercase tracking-wide text-ink-500 font-semibold">Director</p>
                      <p className="text-sm text-ink-100">{movie.director}</p>
                    </div>
                  </div>
                )}
                {castList.length > 0 && (
                  <div className="flex items-start gap-2.5">
                    <Users className="w-4 h-4 text-ink-500 mt-0.5 shrink-0" aria-hidden />
                    <div>
                      <p className="text-2xs uppercase tracking-wide text-ink-500 font-semibold">Cast</p>
                      <p className="text-sm text-ink-100">{castList.join(', ')}</p>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-3 mt-8">
                {isUpcoming ? (
                  <span className="btn-secondary btn-lg cursor-default">
                    <CalendarDays className="w-4 h-4" aria-hidden />
                    In cinemas {formatDate(movie.release_date)}
                  </span>
                ) : (
                  <Button size="lg" icon={Ticket} onClick={scrollToShowtimes}>Book tickets</Button>
                )}
                {movie.trailer_url && (
                  <Button variant="secondary" size="lg" icon={Play} onClick={() => setTrailerOpen(true)}>
                    Watch trailer
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ---- Showtimes ----------------------------------------------- */}
      {!isUpcoming && (
        <div ref={showtimesRef} className="page pb-16 scroll-mt-20">
          <div className="surface p-5 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
              <h2 className="section-title">Select a date &amp; showtime</h2>
              <button
                onClick={openPicker}
                className="flex items-center gap-1.5 text-xs font-semibold text-ink-300 hover:text-brand-400 w-fit"
              >
                <MapPin className="w-3.5 h-3.5 text-brand-500" aria-hidden />
                {city || 'Select city'} · change
              </button>
            </div>

            {/* Date strip */}
            <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2 -mx-1 px-1 mb-6">
              {days.map((day) => {
                const active = day.param === selectedDate;
                const hasShows = datesWithShows.has(day.param);
                return (
                  <button
                    key={day.param}
                    onClick={() => setSelectedDate(day.param)}
                    aria-pressed={active}
                    className={cx(
                      'shrink-0 w-16 py-2.5 rounded-xl border text-center transition-all duration-200',
                      active
                        ? 'border-brand-500 bg-brand-500 text-white shadow-brand-sm'
                        : hasShows
                          ? 'border-ink-700 bg-ink-800 text-ink-100 hover:border-ink-500'
                          : 'border-ink-800 bg-ink-900 text-ink-500'
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

            {showtimesLoading ? (
              <div className="space-y-4">
                {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
              </div>
            ) : theatres.length === 0 ? (
              <EmptyState
                icon={Building2}
                title="No shows on this date"
                message={
                  city
                    ? `We don't have any screenings of ${movie.title} in ${city} on this date. Try another day.`
                    : 'Select a city to see available showtimes.'
                }
                action={!city && <Button variant="secondary" onClick={openPicker}>Select city</Button>}
              />
            ) : (
              <div className="space-y-4">
                {theatres.map((theatre) => (
                  <div key={theatre.theater_id} className="surface-raised p-4 sm:p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                      <div className="min-w-0">
                        <Link
                          to={`/theatres/${theatre.theater_id}`}
                          className="font-semibold text-ink-50 hover:text-brand-400 transition-colors"
                        >
                          {theatre.theater_name}
                        </Link>
                        <p className="text-xs text-ink-400 mt-0.5">{theatre.locality}, {theatre.city}</p>
                      </div>
                      {theatre.facilities?.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {theatre.facilities.slice(0, 3).map((f) => (
                            <span key={f} className="badge-neutral !normal-case !tracking-normal !font-medium">
                              <Sparkles className="w-2.5 h-2.5" aria-hidden /> {f}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2.5">
                      {theatre.shows.map((show) => {
                        const fill = fillStatusMeta(show.fill_status);
                        const soldOut = show.fill_status === 'SOLD OUT';
                        return (
                          <button
                            key={show.show_id}
                            disabled={soldOut}
                            onClick={() => navigate(`/booking/seats/${show.show_id}`)}
                            className={cx(
                              'group min-w-[5.5rem] px-3 py-2 rounded-xl border text-center transition-all duration-200',
                              soldOut
                                ? 'border-ink-800 bg-ink-900 cursor-not-allowed opacity-55'
                                : 'border-ink-600 bg-ink-850 hover:border-brand-500 hover:bg-brand-500/10 active:scale-[0.97]'
                            )}
                            title={soldOut ? 'This show is sold out' : `Book ${formatTime(show.show_time)}`}
                          >
                            <span className="block text-sm font-bold text-ink-50 tabular">
                              {formatTime(show.show_time)}
                            </span>
                            <span className={cx('block text-2xs font-medium mt-0.5', fill.className)}>
                              {fill.label}
                            </span>
                            <span className="block text-2xs text-ink-500 mt-0.5">
                              {show.screen_type !== 'Standard' ? `${show.screen_type} · ` : ''}
                              from {formatCurrency(show.from_price)}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <Modal open={trailerOpen} onClose={() => setTrailerOpen(false)} title={`${movie.title} — trailer`} size="lg">
        <div className="aspect-video rounded-xl overflow-hidden bg-black">
          <iframe
            src={trailerOpen ? movie.trailer_url : ''}
            title={`${movie.title} trailer`}
            className="w-full h-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      </Modal>
    </div>
  );
}

function MovieDetailsSkeleton() {
  return (
    <div className="page py-8">
      <div className="flex flex-col sm:flex-row gap-7">
        <Skeleton className="w-40 sm:w-56 aspect-[2/3] rounded-2xl mx-auto sm:mx-0 shrink-0" />
        <div className="flex-1 space-y-4">
          <Skeleton className="h-10 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-11 w-40" />
        </div>
      </div>
      <Skeleton className="h-64 w-full rounded-2xl mt-10" />
    </div>
  );
}
