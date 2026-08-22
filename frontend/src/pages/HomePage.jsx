import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { MapPin, Building2, ArrowRight, Film, Sparkles } from 'lucide-react';
import { api, buildQuery, isAbortError } from '../lib/api';
import { useLocationContext } from '../context/LocationContext';
import { HeroCarousel } from '../components/movie/HeroCarousel';
import { MovieRow } from '../components/movie/MovieRow';
import { Button, EmptyState, Skeleton, ErrorState } from '../components/ui';

export function HomePage() {
  const { locationId, city, openPicker, loading: locationsLoading } = useLocationContext();

  const [data, setData] = useState({ nowShowing: [], comingSoon: [], topRated: [], popular: [], theatres: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Nothing is meaningful before a city is chosen; the picker opens itself.
    if (!locationId) {
      setLoading(false);
      return undefined;
    }

    const controller = new AbortController();
    const opts = { signal: controller.signal, auth: false };

    setLoading(true);
    setError(null);

    Promise.all([
      api.get(`/movies${buildQuery({ locationId, status: 'NowShowing' })}`, opts),
      api.get(`/movies${buildQuery({ locationId, status: 'ComingSoon' })}`, opts),
      api.get(`/movies${buildQuery({ locationId, sort: 'rating' })}`, opts),
      api.get(`/movies${buildQuery({ locationId, sort: 'popular' })}`, opts),
      api.get(`/theatres${buildQuery({ locationId })}`, opts)
    ])
      .then(([nowShowing, comingSoon, topRated, popular, theatres]) => {
        setData({
          nowShowing: nowShowing.movies || [],
          comingSoon: comingSoon.movies || [],
          topRated: (topRated.movies || []).filter((m) => m.status === 'NowShowing').slice(0, 12),
          popular: (popular.movies || []).filter((m) => Number(m.booking_count) > 0).slice(0, 12),
          theatres: theatres.theatres || []
        });
        setLoading(false);
      })
      .catch((err) => {
        if (isAbortError(err)) return;
        setError(err);
        setLoading(false);
      });

    return () => controller.abort();
  }, [locationId]);

  if (!locationId && !locationsLoading) {
    return (
      <div className="page py-24">
        <EmptyState
          icon={MapPin}
          title="Choose your city to get started"
          message="CineWave shows movies, theatres and showtimes for the city you're in. Pick one and we'll take it from there."
          action={<Button onClick={openPicker} icon={MapPin}>Select your city</Button>}
        />
      </div>
    );
  }

  if (error) {
    return (
      <div className="page py-16">
        <ErrorState
          title="We couldn't load what's showing"
          message={error.message}
          onRetry={() => window.location.reload()}
        />
      </div>
    );
  }

  const nothingShowing = !loading && data.nowShowing.length === 0 && data.comingSoon.length === 0;

  return (
    <div className="page py-6 sm:py-8">
      <HeroCarousel movies={data.nowShowing} loading={loading || locationsLoading} city={city} />

      <div className="mt-10">
        {nothingShowing ? (
          <EmptyState
            icon={Film}
            title={`No movies are showing in ${city} yet`}
            message="We haven't scheduled any shows for this city. Try another city, or check back soon."
            action={<Button variant="secondary" onClick={openPicker}>Change city</Button>}
          />
        ) : (
          <>
            <MovieRow
              title="Now showing"
              subtitle={city ? `Playing in ${city} right now` : undefined}
              movies={data.nowShowing}
              loading={loading}
              viewAllTo="/movies?status=NowShowing"
            />

            {(loading || data.popular.length > 0) && (
              <MovieRow
                title="Popular this week"
                subtitle="What everyone else is booking"
                movies={data.popular}
                loading={loading}
                viewAllTo="/movies?sort=popular"
              />
            )}

            <MovieRow
              title="Top rated"
              subtitle="Highest rated films on CineWave"
              movies={data.topRated}
              loading={loading}
              viewAllTo="/movies?sort=rating"
            />

            <MovieRow
              title="Coming soon"
              subtitle="Releasing over the next few weeks"
              movies={data.comingSoon}
              loading={loading}
              viewAllTo="/movies?status=ComingSoon"
              emptyMessage="No upcoming releases announced yet."
            />
          </>
        )}
      </div>

      {/* Nearby theatres */}
      <section className="mb-6">
        <div className="flex items-end justify-between gap-4 mb-4">
          <div>
            <h2 className="section-title">Theatres in {city}</h2>
            <p className="section-subtitle mt-0.5">Cinemas near you with shows on sale</p>
          </div>
          <Link to="/theatres" className="text-xs font-semibold text-brand-400 hover:text-brand-500 flex items-center gap-1">
            See all <ArrowRight className="w-3.5 h-3.5" aria-hidden />
          </Link>
        </div>

        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-2xl" />)}
          </div>
        ) : data.theatres.length === 0 ? (
          <p className="text-sm text-ink-400">No theatres listed in {city} yet.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.theatres.slice(0, 6).map((theatre) => (
              <Link
                key={theatre.theater_id}
                to={`/theatres/${theatre.theater_id}`}
                className="surface surface-hover p-5 group"
              >
                <div className="flex items-start gap-3">
                  <span className="w-10 h-10 rounded-xl bg-brand-500/12 border border-brand-500/25
                                   grid place-items-center shrink-0">
                    <Building2 className="w-5 h-5 text-brand-400" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold text-sm text-ink-50 truncate group-hover:text-brand-400 transition-colors">
                      {theatre.name}
                    </h3>
                    <p className="text-xs text-ink-400 mt-0.5 truncate">{theatre.location}, {theatre.city}</p>
                    <p className="text-2xs text-ink-500 mt-2 tabular">
                      {theatre.screen_count} screen{Number(theatre.screen_count) === 1 ? '' : 's'} ·{' '}
                      {theatre.seat_capacity} seats
                    </p>
                  </div>
                </div>

                {theatre.facilities?.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-4">
                    {theatre.facilities.slice(0, 3).map((f) => (
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
      </section>
    </div>
  );
}
