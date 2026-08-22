import { useRef, useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, ArrowRight } from 'lucide-react';
import { MovieCard, MovieCardSkeleton } from './MovieCard';
import { cx } from '../ui';

/**
 * Horizontally scrolling movie shelf.
 *
 * Native scroll rather than a transform-based carousel: it keeps touch
 * momentum, keyboard scrolling and screen-reader order working for free. The
 * arrows are a mouse-only affordance and are hidden when there is nothing to
 * scroll to.
 */
export function MovieRow({ title, subtitle, movies = [], loading, viewAllTo, emptyMessage }) {
  const scroller = useRef(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateArrows = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 8);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 8);
  }, []);

  useEffect(() => {
    updateArrows();
    const el = scroller.current;
    if (!el) return undefined;
    el.addEventListener('scroll', updateArrows, { passive: true });
    window.addEventListener('resize', updateArrows);
    return () => {
      el.removeEventListener('scroll', updateArrows);
      window.removeEventListener('resize', updateArrows);
    };
  }, [updateArrows, movies, loading]);

  const scrollBy = (direction) => {
    const el = scroller.current;
    if (!el) return;
    el.scrollBy({ left: direction * Math.round(el.clientWidth * 0.8), behavior: 'smooth' });
  };

  if (!loading && movies.length === 0) {
    if (!emptyMessage) return null;
    return (
      <section className="mb-12">
        <h2 className="section-title mb-2">{title}</h2>
        <p className="text-sm text-ink-400">{emptyMessage}</p>
      </section>
    );
  }

  return (
    <section className="mb-12">
      <div className="flex items-end justify-between gap-4 mb-4">
        <div>
          <h2 className="section-title">{title}</h2>
          {subtitle && <p className="section-subtitle mt-0.5">{subtitle}</p>}
        </div>

        <div className="flex items-center gap-2">
          {viewAllTo && (
            <Link
              to={viewAllTo}
              className="text-xs font-semibold text-brand-400 hover:text-brand-500 flex items-center gap-1"
            >
              See all <ArrowRight className="w-3.5 h-3.5" aria-hidden />
            </Link>
          )}
          <div className="hidden md:flex items-center gap-1">
            <button
              onClick={() => scrollBy(-1)}
              disabled={!canScrollLeft}
              className="btn-secondary btn-sm !px-2 disabled:opacity-30"
              aria-label={`Scroll ${title} left`}
            >
              <ChevronLeft className="w-4 h-4" aria-hidden />
            </button>
            <button
              onClick={() => scrollBy(1)}
              disabled={!canScrollRight}
              className="btn-secondary btn-sm !px-2 disabled:opacity-30"
              aria-label={`Scroll ${title} right`}
            >
              <ChevronRight className="w-4 h-4" aria-hidden />
            </button>
          </div>
        </div>
      </div>

      <div
        ref={scroller}
        className={cx(
          'flex gap-5 overflow-x-auto no-scrollbar pb-2 -mx-1 px-1',
          'snap-x snap-mandatory md:snap-none'
        )}
      >
        {(loading ? Array.from({ length: 6 }) : movies).map((movie, i) => (
          <div
            key={movie?.movie_id ?? i}
            className="snap-start shrink-0 w-[9.5rem] sm:w-[10.5rem] md:w-[11.5rem]"
          >
            {loading ? <MovieCardSkeleton /> : <MovieCard movie={movie} />}
          </div>
        ))}
      </div>
    </section>
  );
}
