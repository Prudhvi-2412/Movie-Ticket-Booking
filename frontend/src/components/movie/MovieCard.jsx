import { Link } from 'react-router-dom';
import { Star, Clock, CalendarDays } from 'lucide-react';
import { formatDuration, formatDateShort } from '../../lib/format';
import { SmartImage, Skeleton, cx } from '../ui';

export function MovieCard({ movie, className }) {
  const isUpcoming = movie.status === 'ComingSoon';

  return (
    <Link
      to={`/movies/${movie.movie_id}`}
      className={cx('group block focus-visible:outline-none', className)}
      aria-label={`${movie.title} — view details and book tickets`}
    >
      <div className="relative rounded-xl overflow-hidden border border-ink-700/70 bg-ink-850
                      transition-all duration-300 ease-smooth
                      group-hover:border-ink-500 group-hover:shadow-lift group-hover:-translate-y-1
                      group-focus-visible:border-brand-500">
        <SmartImage
          src={movie.poster_url}
          alt={`${movie.title} poster`}
          fallbackText={movie.title}
          aspect="aspect-[2/3]"
          className="transition-transform duration-500 ease-smooth group-hover:scale-[1.04]"
        />

        {/* Gradient scrim so the overlaid chips stay legible on any poster. */}
        <div className="absolute inset-0 bg-gradient-to-t from-ink-950 via-ink-950/25 to-transparent
                        opacity-90 pointer-events-none" />

        {movie.rating != null && (
          <span className="absolute top-2.5 left-2.5 flex items-center gap-1 px-2 py-1 rounded-lg
                           bg-ink-950/85 backdrop-blur text-2xs font-bold text-caution-400 tabular">
            <Star className="w-3 h-3 fill-current" aria-hidden />
            {Number(movie.rating).toFixed(1)}
          </span>
        )}

        {movie.certificate && (
          <span className="absolute top-2.5 right-2.5 px-1.5 py-0.5 rounded border border-white/25
                           bg-ink-950/70 backdrop-blur text-2xs font-bold text-ink-100">
            {movie.certificate}
          </span>
        )}

        {isUpcoming && (
          <span className="absolute bottom-2.5 left-2.5 badge-info bg-info-500/25 backdrop-blur">
            Coming soon
          </span>
        )}

        {/* Hover CTA — hidden from assistive tech since the card itself is the link. */}
        <div className="absolute inset-x-0 bottom-0 p-2.5 translate-y-full opacity-0
                        transition-all duration-300 ease-smooth
                        group-hover:translate-y-0 group-hover:opacity-100" aria-hidden>
          <span className="block w-full text-center py-2 rounded-lg bg-gradient-to-r from-brand-500 to-ember-500
                           text-xs font-bold text-white shadow-brand">
            {isUpcoming ? 'View details' : 'Book now'}
          </span>
        </div>
      </div>

      <div className="pt-3 px-0.5">
        <h3 className="text-sm font-semibold text-ink-50 line-clamp-1 group-hover:text-brand-400 transition-colors">
          {movie.title}
        </h3>
        <p className="text-2xs text-ink-400 mt-1 line-clamp-1">
          {[movie.language, movie.genre].filter(Boolean).join(' · ')}
        </p>
        <p className="text-2xs text-ink-500 mt-1 flex items-center gap-2.5">
          {movie.duration_minutes && (
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" aria-hidden />{formatDuration(movie.duration_minutes)}
            </span>
          )}
          {isUpcoming && movie.release_date && (
            <span className="flex items-center gap-1">
              <CalendarDays className="w-3 h-3" aria-hidden />{formatDateShort(movie.release_date)}
            </span>
          )}
        </p>
      </div>
    </Link>
  );
}

export function MovieCardSkeleton() {
  return (
    <div>
      <Skeleton className="aspect-[2/3] rounded-xl" />
      <Skeleton className="h-4 w-3/4 mt-3" />
      <Skeleton className="h-3 w-1/2 mt-2" />
    </div>
  );
}

export function MovieGrid({ movies, loading, skeletonCount = 10, className }) {
  const gridClass = cx(
    'grid gap-x-5 gap-y-7 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5',
    className
  );

  if (loading) {
    return (
      <div className={gridClass}>
        {Array.from({ length: skeletonCount }).map((_, i) => <MovieCardSkeleton key={i} />)}
      </div>
    );
  }

  return (
    <div className={gridClass}>
      {movies.map((movie) => <MovieCard key={movie.movie_id} movie={movie} />)}
    </div>
  );
}
