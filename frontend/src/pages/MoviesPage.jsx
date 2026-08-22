import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Film, SlidersHorizontal, X, MapPin } from 'lucide-react';
import { api, buildQuery, isAbortError } from '../lib/api';
import { useLocationContext } from '../context/LocationContext';
import { MovieGrid } from '../components/movie/MovieCard';
import { Button, Select, EmptyState, ErrorState, SearchInput, useDebounced, cx } from '../components/ui';

const STATUS_TABS = [
  { id: '', label: 'All' },
  { id: 'NowShowing', label: 'Now showing' },
  { id: 'ComingSoon', label: 'Coming soon' }
];

const SORTS = [
  { value: 'release', label: 'Newest first' },
  { value: 'popular', label: 'Most booked' },
  { value: 'rating', label: 'Highest rated' },
  { value: 'title', label: 'A–Z' }
];

/**
 * Browse page. Filter state lives in the URL query string, so a filtered view
 * is linkable, survives a refresh, and works with the browser back button.
 */
export function MoviesPage() {
  const [params, setParams] = useSearchParams();
  const { locationId, city, openPicker } = useLocationContext();

  const [movies, setMovies] = useState([]);
  const [filters, setFilters] = useState({ genres: [], languages: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchInput, setSearchInput] = useState(params.get('search') || '');

  const status = params.get('status') || '';
  const genre = params.get('genre') || '';
  const language = params.get('language') || '';
  const sort = params.get('sort') || 'release';
  const search = params.get('search') || '';

  const debouncedSearch = useDebounced(searchInput, 350);

  // Reflect the debounced search box back into the URL.
  useEffect(() => {
    if (debouncedSearch === search) return;
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (debouncedSearch) next.set('search', debouncedSearch);
      else next.delete('search');
      return next;
    }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  useEffect(() => {
    api.get('/movies/meta/filters', { auth: false })
      .then((res) => setFilters({ genres: res.genres || [], languages: res.languages || [] }))
      .catch(() => setFilters({ genres: [], languages: [] }));
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    api.get(`/movies${buildQuery({ locationId, status, genre, language, sort, search })}`,
      { signal: controller.signal, auth: false })
      .then((res) => { setMovies(res.movies || []); setLoading(false); })
      .catch((err) => {
        if (isAbortError(err)) return;
        setError(err);
        setLoading(false);
      });

    return () => controller.abort();
  }, [locationId, status, genre, language, sort, search]);

  const setParam = useCallback((key, value) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value) next.set(key, value);
      else next.delete(key);
      return next;
    });
  }, [setParams]);

  const clearAll = () => {
    setSearchInput('');
    setParams({});
  };

  const activeCount = [status, genre, language, search].filter(Boolean).length;

  return (
    <div className="page py-8">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Movies</h1>
          <p className="text-sm text-ink-400 mt-1.5 flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5 text-brand-500" aria-hidden />
            {city ? (
              <>Showing what's available in {city}</>
            ) : (
              <button onClick={openPicker} className="text-brand-400 hover:underline">
                Select a city to see showtimes
              </button>
            )}
          </p>
        </div>

        <SearchInput
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search by title, cast or director"
          className="w-full sm:w-72"
          aria-label="Search movies"
        />
      </div>

      {/* Filter bar */}
      <div className="surface p-4 mb-7">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-ink-300 mr-1">
            <SlidersHorizontal className="w-3.5 h-3.5 text-brand-500" aria-hidden /> Filters
          </div>

          <div className="flex items-center gap-1 p-1 bg-ink-900 rounded-lg border border-ink-700">
            {STATUS_TABS.map((tab) => (
              <button
                key={tab.id || 'all'}
                onClick={() => setParam('status', tab.id)}
                className={cx(
                  'px-3 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap',
                  status === tab.id ? 'bg-brand-500 text-white' : 'text-ink-300 hover:text-ink-50'
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <Select
            value={genre}
            onChange={(e) => setParam('genre', e.target.value)}
            className="!w-auto min-w-[8rem] !py-2 text-xs"
            aria-label="Filter by genre"
          >
            <option value="">All genres</option>
            {filters.genres.map((g) => <option key={g} value={g}>{g}</option>)}
          </Select>

          <Select
            value={language}
            onChange={(e) => setParam('language', e.target.value)}
            className="!w-auto min-w-[8rem] !py-2 text-xs"
            aria-label="Filter by language"
          >
            <option value="">All languages</option>
            {filters.languages.map((l) => <option key={l} value={l}>{l}</option>)}
          </Select>

          <Select
            value={sort}
            onChange={(e) => setParam('sort', e.target.value)}
            className="!w-auto min-w-[9rem] !py-2 text-xs"
            aria-label="Sort movies"
          >
            {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </Select>

          {activeCount > 0 && (
            <button
              onClick={clearAll}
              className="ml-auto flex items-center gap-1 text-xs font-semibold text-ink-300 hover:text-brand-400"
            >
              <X className="w-3.5 h-3.5" aria-hidden /> Clear {activeCount} filter{activeCount === 1 ? '' : 's'}
            </button>
          )}
        </div>
      </div>

      {error ? (
        <ErrorState message={error.message} onRetry={() => setParams(new URLSearchParams(params))} />
      ) : !loading && movies.length === 0 ? (
        <EmptyState
          icon={Film}
          title="No movies match those filters"
          message={
            search
              ? `Nothing matched “${search}”. Try a different title, or clear your filters.`
              : 'Try widening your filters, or pick a different city.'
          }
          action={activeCount > 0 && <Button variant="secondary" onClick={clearAll}>Clear filters</Button>}
        />
      ) : (
        <>
          {!loading && (
            <p className="text-xs text-ink-400 mb-4 tabular">
              {movies.length} movie{movies.length === 1 ? '' : 's'}
            </p>
          )}
          <MovieGrid movies={movies} loading={loading} />
        </>
      )}
    </div>
  );
}
