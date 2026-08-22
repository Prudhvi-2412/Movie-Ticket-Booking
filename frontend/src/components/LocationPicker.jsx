import { useState, useMemo } from 'react';
import { MapPin, Search, Check, Building2 } from 'lucide-react';
import { useLocationContext } from '../context/LocationContext';
import { Modal, Input, EmptyState, Skeleton, cx } from './ui';

/**
 * City selector. Shown as a dismissible dialog from the navbar, and
 * automatically (non-dismissible) on a first visit — without a city the
 * catalogue has nothing to scope to.
 */
export function LocationPicker() {
  const { locations, locationId, loading, pickerOpen, closePicker, selectLocation } = useLocationContext();
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return locations;
    return locations.filter(
      (l) => l.city.toLowerCase().includes(q) || l.state.toLowerCase().includes(q)
    );
  }, [locations, query]);

  const mustChoose = !locationId;

  return (
    <Modal
      open={pickerOpen}
      onClose={mustChoose ? () => {} : closePicker}
      title="Choose your city"
      description="We'll show you the movies, theatres and showtimes near you."
      size="lg"
    >
      <div className="space-y-5">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400" aria-hidden />
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search for your city"
            className="pl-10"
            aria-label="Search cities"
          />
        </div>

        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={MapPin}
            title="No cities match that search"
            message="Try a different spelling, or clear the search to see everywhere we operate."
          />
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {filtered.map((loc) => {
              const active = loc.location_id === locationId;
              return (
                <button
                  key={loc.location_id}
                  onClick={() => selectLocation(loc.location_id)}
                  aria-pressed={active}
                  className={cx(
                    'group relative flex flex-col items-start gap-1 p-4 rounded-xl border text-left',
                    'transition-all duration-200 ease-smooth',
                    active
                      ? 'border-brand-500 bg-brand-500/10 shadow-brand-sm'
                      : 'border-ink-700 bg-ink-800/60 hover:border-ink-500 hover:bg-ink-800'
                  )}
                >
                  {active && (
                    <span className="absolute top-3 right-3 w-5 h-5 rounded-full bg-brand-500 grid place-items-center">
                      <Check className="w-3 h-3 text-white" aria-hidden />
                    </span>
                  )}
                  <MapPin
                    className={cx('w-5 h-5 mb-1', active ? 'text-brand-400' : 'text-ink-400 group-hover:text-ink-200')}
                    aria-hidden
                  />
                  <span className="font-semibold text-sm text-ink-50">{loc.city}</span>
                  <span className="text-2xs text-ink-400">{loc.state}</span>
                  <span className="mt-1.5 inline-flex items-center gap-1 text-2xs text-ink-400">
                    <Building2 className="w-3 h-3" aria-hidden />
                    {loc.theatre_count} {Number(loc.theatre_count) === 1 ? 'theatre' : 'theatres'}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
}
