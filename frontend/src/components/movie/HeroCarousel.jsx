import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Star, Clock, Ticket, ChevronLeft, ChevronRight, Play, MapPin } from 'lucide-react';
import { formatDuration } from '../../lib/format';
import { Skeleton, cx } from '../ui';

const ROTATE_MS = 6500;

export function HeroCarousel({ movies = [], loading, city }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const timerRef = useRef(null);

  const slides = movies.slice(0, 5);
  const count = slides.length;

  const goTo = useCallback((next) => {
    if (count === 0) return;
    setIndex(((next % count) + count) % count);
  }, [count]);

  useEffect(() => {
    if (paused || count <= 1) return undefined;
    timerRef.current = setInterval(() => setIndex((i) => (i + 1) % count), ROTATE_MS);
    return () => clearInterval(timerRef.current);
  }, [paused, count]);

  // Keep the index valid when the movie list changes under us.
  useEffect(() => { if (index >= count) setIndex(0); }, [count, index]);

  if (loading) return <Skeleton className="h-[22rem] sm:h-[26rem] lg:h-[30rem] rounded-3xl" />;
  if (count === 0) return null;

  const movie = slides[index];

  return (
    <section
      className="relative h-[24rem] sm:h-[27rem] lg:h-[31rem] rounded-3xl overflow-hidden
                 border border-ink-700/70 bg-ink-900 group"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      // Auto-rotation pauses on focus too, so a keyboard user is not fighting
      // the slide changing under them.
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      aria-roledescription="carousel"
      aria-label="Featured movies"
    >
      {slides.map((slide, i) => (
        <div
          key={slide.movie_id}
          className={cx(
            'absolute inset-0 transition-opacity duration-700 ease-smooth',
            i === index ? 'opacity-100' : 'opacity-0 pointer-events-none'
          )}
          aria-hidden={i !== index}
        >
          {slide.banner_url && (
            <img
              src={slide.banner_url}
              alt=""
              className="w-full h-full object-cover"
              loading={i === 0 ? 'eager' : 'lazy'}
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-r from-ink-950 via-ink-950/85 to-ink-950/30" />
          <div className="absolute inset-0 bg-gradient-to-t from-ink-950 via-transparent to-transparent" />
        </div>
      ))}

      <div className="relative h-full flex items-end sm:items-center">
        <div className="p-6 sm:p-10 lg:p-14 max-w-2xl">
          {city && (
            <p className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-widest text-ink-300 mb-3">
              <MapPin className="w-3.5 h-3.5 text-brand-500" aria-hidden />
              Now showing in {city}
            </p>
          )}

          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-white leading-[1.08]">
            {movie.title}
          </h1>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-4 text-sm text-ink-200">
            {movie.rating != null && (
              <span className="flex items-center gap-1.5 font-semibold text-caution-400 tabular">
                <Star className="w-4 h-4 fill-current" aria-hidden />
                {Number(movie.rating).toFixed(1)}
              </span>
            )}
            {movie.duration_minutes && (
              <span className="flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-ink-400" aria-hidden />
                {formatDuration(movie.duration_minutes)}
              </span>
            )}
            {movie.certificate && (
              <span className="px-1.5 py-0.5 rounded border border-white/25 text-2xs font-bold">
                {movie.certificate}
              </span>
            )}
            <span className="text-ink-300">{[movie.language, movie.genre].filter(Boolean).join(' · ')}</span>
          </div>

          <p className="mt-4 text-sm sm:text-base text-ink-300 leading-relaxed line-clamp-2 sm:line-clamp-3">
            {movie.description}
          </p>

          <div className="flex flex-wrap items-center gap-3 mt-7">
            <Link to={`/movies/${movie.movie_id}`} className="btn-primary btn-lg">
              <Ticket className="w-4 h-4" aria-hidden /> Book tickets
            </Link>
            {movie.trailer_url && (
              <a
                href={movie.trailer_url.replace('/embed/', '/watch?v=')}
                target="_blank"
                rel="noreferrer noopener"
                className="btn-secondary btn-lg"
              >
                <Play className="w-4 h-4" aria-hidden /> Trailer
              </a>
            )}
          </div>
        </div>
      </div>

      {count > 1 && (
        <>
          <button
            onClick={() => goTo(index - 1)}
            className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full
                       bg-ink-950/70 backdrop-blur border border-ink-700 grid place-items-center
                       text-ink-200 opacity-0 group-hover:opacity-100 focus-visible:opacity-100
                       transition-opacity hover:bg-ink-900"
            aria-label="Previous featured movie"
          >
            <ChevronLeft className="w-5 h-5" aria-hidden />
          </button>
          <button
            onClick={() => goTo(index + 1)}
            className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full
                       bg-ink-950/70 backdrop-blur border border-ink-700 grid place-items-center
                       text-ink-200 opacity-0 group-hover:opacity-100 focus-visible:opacity-100
                       transition-opacity hover:bg-ink-900"
            aria-label="Next featured movie"
          >
            <ChevronRight className="w-5 h-5" aria-hidden />
          </button>

          <div className="absolute bottom-5 right-6 flex items-center gap-2">
            {slides.map((slide, i) => (
              <button
                key={slide.movie_id}
                onClick={() => goTo(i)}
                aria-label={`Show ${slide.title}`}
                aria-current={i === index}
                className={cx(
                  'h-1.5 rounded-full transition-all duration-300',
                  i === index ? 'w-7 bg-brand-500' : 'w-1.5 bg-white/40 hover:bg-white/70'
                )}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
