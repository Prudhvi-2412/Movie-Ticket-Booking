import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Film, Building2, MapPin, Loader2, CornerDownLeft } from 'lucide-react';
import { api, buildQuery } from '../lib/api';
import { useLocationContext } from '../context/LocationContext';
import { useDebounced, useClickOutside, cx } from './ui';

/**
 * Header search: debounced, keyboard-navigable, and grouped by entity type.
 *
 * Results are flattened into a single indexed list so ArrowUp/ArrowDown can
 * move across group boundaries the way a user expects.
 */
export function GlobalSearch({ className, onNavigate }) {
  const navigate = useNavigate();
  const { locationId, selectLocation } = useLocationContext();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState({ movies: [], theatres: [], locations: [] });
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const containerRef = useRef(null);
  const inputRef = useRef(null);
  const debouncedQuery = useDebounced(query, 280);

  useClickOutside(containerRef, () => setOpen(false));

  useEffect(() => {
    const q = debouncedQuery.trim();
    if (q.length < 2) {
      setResults({ movies: [], theatres: [], locations: [] });
      setLoading(false);
      return undefined;
    }

    const controller = new AbortController();
    setLoading(true);

    api.get(`/search${buildQuery({ q, locationId })}`, { signal: controller.signal, auth: false })
      .then((res) => {
        setResults({ movies: res.movies || [], theatres: res.theatres || [], locations: res.locations || [] });
        setActiveIndex(-1);
      })
      .catch((err) => { if (err.name !== 'AbortError') setResults({ movies: [], theatres: [], locations: [] }); })
      .finally(() => setLoading(false));

    // Aborting in-flight requests stops an earlier, slower response from
    // overwriting the results for what the user has since typed.
    return () => controller.abort();
  }, [debouncedQuery, locationId]);

  const flat = [
    ...results.movies.map((m) => ({ type: 'movie', id: m.movie_id, item: m })),
    ...results.theatres.map((t) => ({ type: 'theatre', id: t.theater_id, item: t })),
    ...results.locations.map((l) => ({ type: 'location', id: l.location_id, item: l }))
  ];

  const close = useCallback(() => {
    setOpen(false);
    setQuery('');
    inputRef.current?.blur();
    onNavigate?.();
  }, [onNavigate]);

  const go = useCallback((entry) => {
    if (!entry) return;
    if (entry.type === 'movie') navigate(`/movies/${entry.item.movie_id}`);
    else if (entry.type === 'theatre') navigate(`/theatres/${entry.item.theater_id}`);
    else {
      selectLocation(entry.item.location_id);
      navigate('/');
    }
    close();
  }, [navigate, selectLocation, close]);

  const onKeyDown = (e) => {
    if (e.key === 'Escape') { setOpen(false); inputRef.current?.blur(); return; }
    if (!flat.length) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % flat.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => (i <= 0 ? flat.length - 1 : i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      go(flat[activeIndex >= 0 ? activeIndex : 0]);
    }
  };

  const showPanel = open && query.trim().length >= 2;
  const hasResults = flat.length > 0;

  const Row = ({ entry, index, icon: Icon, title, subtitle, thumb }) => (
    <button
      key={`${entry.type}-${entry.id}`}
      onMouseEnter={() => setActiveIndex(index)}
      onClick={() => go(entry)}
      role="option"
      aria-selected={activeIndex === index}
      className={cx(
        'w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors rounded-lg',
        activeIndex === index ? 'bg-ink-700' : 'hover:bg-ink-800'
      )}
    >
      {thumb ? (
        <img src={thumb} alt="" className="w-8 h-11 rounded object-cover bg-ink-700 shrink-0" />
      ) : (
        <span className="w-8 h-8 rounded-lg bg-ink-800 border border-ink-700 grid place-items-center shrink-0">
          <Icon className="w-4 h-4 text-ink-400" aria-hidden />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-ink-50 truncate">{title}</span>
        <span className="block text-2xs text-ink-400 truncate">{subtitle}</span>
      </span>
      {activeIndex === index && <CornerDownLeft className="w-3.5 h-3.5 text-ink-400 shrink-0" aria-hidden />}
    </button>
  );

  return (
    <div ref={containerRef} className={cx('relative', className)}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400 pointer-events-none" aria-hidden />
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Search movies, theatres, cities…"
          role="combobox"
          aria-expanded={showPanel}
          aria-controls="global-search-results"
          aria-autocomplete="list"
          className="input pl-9 pr-9 h-10"
        />
        {loading && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-500 animate-spin" aria-hidden />
        )}
      </div>

      {showPanel && (
        <div
          id="global-search-results"
          role="listbox"
          className="absolute top-full mt-2 w-full sm:w-[26rem] right-0 z-50 max-h-[26rem] overflow-y-auto
                     bg-ink-850 border border-ink-700 rounded-xl shadow-lift p-1.5 animate-scale-in"
        >
          {loading && !hasResults && (
            <p className="px-3 py-6 text-center text-sm text-ink-400">Searching…</p>
          )}

          {!loading && !hasResults && (
            <div className="px-3 py-8 text-center">
              <p className="text-sm font-medium text-ink-200">No matches for “{query.trim()}”</p>
              <p className="text-xs text-ink-400 mt-1">Try a different title, theatre or city.</p>
            </div>
          )}

          {results.movies.length > 0 && (
            <div className="mb-1">
              <p className="px-3 pt-2 pb-1 text-2xs font-bold uppercase tracking-wider text-ink-400">Movies</p>
              {results.movies.map((m, i) => (
                <Row
                  key={m.movie_id}
                  entry={flat[i]}
                  index={i}
                  icon={Film}
                  thumb={m.poster_url}
                  title={m.title}
                  subtitle={[m.language, m.genre, m.certificate].filter(Boolean).join(' · ')}
                />
              ))}
            </div>
          )}

          {results.theatres.length > 0 && (
            <div className="mb-1">
              <p className="px-3 pt-2 pb-1 text-2xs font-bold uppercase tracking-wider text-ink-400">Theatres</p>
              {results.theatres.map((t, i) => {
                const index = results.movies.length + i;
                return (
                  <Row
                    key={t.theater_id}
                    entry={flat[index]}
                    index={index}
                    icon={Building2}
                    title={t.name}
                    subtitle={`${t.location}, ${t.city}`}
                  />
                );
              })}
            </div>
          )}

          {results.locations.length > 0 && (
            <div>
              <p className="px-3 pt-2 pb-1 text-2xs font-bold uppercase tracking-wider text-ink-400">Cities</p>
              {results.locations.map((l, i) => {
                const index = results.movies.length + results.theatres.length + i;
                return (
                  <Row
                    key={l.location_id}
                    entry={flat[index]}
                    index={index}
                    icon={MapPin}
                    title={l.city}
                    subtitle={l.state}
                  />
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
