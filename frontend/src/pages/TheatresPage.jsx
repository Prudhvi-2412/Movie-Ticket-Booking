import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Building2, MapPin, Sparkles, Phone, MonitorPlay } from 'lucide-react';
import { api, buildQuery, isAbortError } from '../lib/api';
import { useLocationContext } from '../context/LocationContext';
import { Button, EmptyState, ErrorState, Skeleton, SearchInput, useDebounced } from '../components/ui';

export function TheatresPage() {
  const { locationId, city, openPicker } = useLocationContext();

  const [theatres, setTheatres] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounced(search, 300);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    api.get(`/theatres${buildQuery({ locationId, search: debouncedSearch })}`,
      { signal: controller.signal, auth: false })
      .then((res) => { setTheatres(res.theatres || []); setLoading(false); })
      .catch((err) => {
        if (isAbortError(err)) return;
        setError(err);
        setLoading(false);
      });

    return () => controller.abort();
  }, [locationId, debouncedSearch]);

  return (
    <div className="page py-8">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-7">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Theatres</h1>
          <p className="text-sm text-ink-400 mt-1.5 flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5 text-brand-500" aria-hidden />
            {city ? `Cinemas in ${city}` : (
              <button onClick={openPicker} className="text-brand-400 hover:underline">
                Select a city
              </button>
            )}
          </p>
        </div>

        <SearchInput
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search theatres"
          className="w-full sm:w-64"
          aria-label="Search theatres"
        />
      </div>

      {error ? (
        <ErrorState message={error.message} onRetry={() => window.location.reload()} />
      ) : loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-48 rounded-2xl" />)}
        </div>
      ) : theatres.length === 0 ? (
        <EmptyState
          icon={Building2}
          title={search ? 'No theatres match that search' : `No theatres in ${city || 'this city'} yet`}
          message={
            search
              ? 'Try a different name or clear the search.'
              : 'We have not listed any cinemas here yet. Try another city.'
          }
          action={<Button variant="secondary" onClick={openPicker}>Change city</Button>}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {theatres.map((theatre) => (
            <Link
              key={theatre.theater_id}
              to={`/theatres/${theatre.theater_id}`}
              className="surface surface-hover p-5 group flex flex-col"
            >
              <div className="flex items-start gap-3">
                <span className="w-11 h-11 rounded-xl bg-brand-500/12 border border-brand-500/25
                                 grid place-items-center shrink-0">
                  <Building2 className="w-5 h-5 text-brand-400" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="font-semibold text-ink-50 truncate group-hover:text-brand-400 transition-colors">
                    {theatre.name}
                  </h2>
                  <p className="text-xs text-ink-400 mt-0.5 line-clamp-2">
                    {theatre.address || `${theatre.location}, ${theatre.city}`}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-4 mt-4 text-2xs text-ink-400 tabular">
                <span className="flex items-center gap-1">
                  <MonitorPlay className="w-3 h-3" aria-hidden />
                  {theatre.screen_count} screen{Number(theatre.screen_count) === 1 ? '' : 's'}
                </span>
                <span>{theatre.seat_capacity} seats</span>
                {theatre.contact_phone && (
                  <span className="flex items-center gap-1 truncate">
                    <Phone className="w-3 h-3 shrink-0" aria-hidden />{theatre.contact_phone}
                  </span>
                )}
              </div>

              {theatre.facilities?.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-4 pt-4 border-t border-ink-800">
                  {theatre.facilities.slice(0, 4).map((f) => (
                    <span key={f} className="badge-neutral !normal-case !tracking-normal !font-medium">
                      <Sparkles className="w-2.5 h-2.5" aria-hidden /> {f}
                    </span>
                  ))}
                </div>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
