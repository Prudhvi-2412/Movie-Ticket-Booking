import { useState, useEffect, useMemo } from 'react';
import { IndianRupee, Save, Zap, TrendingUp } from 'lucide-react';
import { api, buildQuery } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import { formatCurrency, formatDate, formatTime, upcomingDays, toDateParam } from '../../lib/format';
import {
  Button, Input, Select, Skeleton, ErrorState, EmptyState, useAsync, cx
} from '../../components/ui';
import { AdminHeader, FilterBar } from '../../components/admin/AdminShell';

const SEAT_TYPES = ['Silver', 'Gold', 'Platinum', 'Recliner'];

/**
 * Per-show pricing.
 *
 * Prices are edited as a grid of show × seat category. Only rows the admin
 * actually touches are sent, so opening this page and saving one cell does
 * not rewrite the whole schedule's pricing.
 */
export function AdminPricing() {
  const toast = useToast();

  const [date, setDate] = useState(toDateParam(new Date()));
  const [theatreFilter, setTheatreFilter] = useState('');
  const [drafts, setDrafts] = useState({});
  const [savingId, setSavingId] = useState(null);

  const { data: theatreData } = useAsync(() => api.get('/admin/theatres'));
  const theatres = theatreData?.theatres || [];

  const { data, loading, error, refetch } = useAsync(
    () => api.get(`/admin/shows${buildQuery({ date, theatreId: theatreFilter })}`),
    [date, theatreFilter]
  );
  const shows = data?.shows || [];

  // Clear unsaved edits when the visible set of shows changes.
  useEffect(() => { setDrafts({}); }, [date, theatreFilter]);

  const setDraft = (showId, seatType, value) => {
    setDrafts((current) => ({
      ...current,
      [showId]: { ...(current[showId] || {}), [seatType]: value }
    }));
  };

  const savePricing = async (show) => {
    const draft = drafts[show.show_id];
    if (!draft) return;

    setSavingId(show.show_id);
    try {
      const pricing = Object.fromEntries(
        Object.entries(draft)
          .filter(([, v]) => v !== '' && v !== null)
          .map(([type, v]) => [type, Number(v)])
      );

      await api.put(`/admin/shows/${show.show_id}`, {
        pricing,
        // Silver is the anchor the fallback ladder scales from.
        ...(pricing.Silver !== undefined ? { base_price: pricing.Silver } : {})
      });

      toast.success('Pricing updated.');
      setDrafts((current) => {
        const next = { ...current };
        delete next[show.show_id];
        return next;
      });
      await refetch();
    } catch (err) {
      toast.error(err.message || 'Could not save that pricing.');
    } finally {
      setSavingId(null);
    }
  };

  const recalcAll = async () => {
    try {
      await Promise.all(shows.map((s) => api.post(`/admin/shows/${s.show_id}/dynamic-price`)));
      toast.success('Demand multipliers recalculated for every show on this date.');
      await refetch();
    } catch (err) {
      toast.error(err.message || 'Could not recalculate demand pricing.');
    }
  };

  const days = upcomingDays(7);

  return (
    <div>
      <AdminHeader
        title="Pricing"
        description="Set ticket prices per show and seat category. Demand pricing scales these; it never overwrites them."
        actions={
          shows.length > 0 && (
            <Button variant="secondary" icon={Zap} onClick={recalcAll}>
              Recalculate demand
            </Button>
          )
        }
      >
        <FilterBar>
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
            {days.map((day) => (
              <button
                key={day.param}
                onClick={() => setDate(day.param)}
                className={cx(
                  'shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap',
                  date === day.param ? 'bg-brand-500 text-white' : 'bg-ink-800 text-ink-300 hover:text-ink-50'
                )}
              >
                {day.weekday} {day.day}
              </button>
            ))}
          </div>

          <Select
            value={theatreFilter}
            onChange={(e) => setTheatreFilter(e.target.value)}
            className="!w-auto min-w-[12rem] !py-2 text-xs"
            aria-label="Filter by theatre"
          >
            <option value="">All theatres</option>
            {theatres.map((t) => (
              <option key={t.theater_id} value={t.theater_id}>{t.name}</option>
            ))}
          </Select>
        </FilterBar>
      </AdminHeader>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
      ) : error ? (
        <ErrorState message={error.message} onRetry={refetch} />
      ) : shows.length === 0 ? (
        <div className="surface">
          <EmptyState
            icon={IndianRupee}
            title="No shows on this date"
            message="Schedule some shows first, then set their prices here."
          />
        </div>
      ) : (
        <div className="space-y-3">
          {shows.map((show) => (
            <PricingRow
              key={show.show_id}
              show={show}
              draft={drafts[show.show_id]}
              onChange={(type, value) => setDraft(show.show_id, type, value)}
              onSave={() => savePricing(show)}
              saving={savingId === show.show_id}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PricingRow({ show, draft, onChange, onSave, saving }) {
  // Effective price shown alongside the input, so the admin can see what the
  // demand multiplier is actually doing to the number they typed.
  const multiplier = Number(show.demand_multiplier) || 1;
  const dirty = draft && Object.keys(draft).length > 0;

  const { data } = useAsync(() => api.get(`/shows/${show.show_id}`), [show.show_id]);

  const baseFor = useMemo(() => {
    // Read the table inside the memo: `data?.show?.priceTable || {}` outside
    // would produce a new object identity on every render.
    const priceTable = data?.show?.priceTable || {};
    const out = {};
    for (const type of SEAT_TYPES) {
      // Undo the multiplier to recover the configured base for this category.
      out[type] = priceTable[type] != null ? Math.round(priceTable[type] / multiplier) : '';
    }
    return out;
  }, [data, multiplier]);

  return (
    <div className="surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
        <div className="min-w-0">
          <p className="font-semibold text-ink-50 truncate">{show.movie_title}</p>
          <p className="text-2xs text-ink-400 tabular">
            {formatDate(show.show_time)} · {formatTime(show.show_time)} · {show.theater_name} ·{' '}
            {show.screen_name || `Screen ${show.screen_number}`} ({show.screen_type})
          </p>
        </div>

        <div className="flex items-center gap-3">
          <span className={multiplier > 1 ? 'badge-caution' : 'badge-neutral'}>
            <TrendingUp className="w-2.5 h-2.5" aria-hidden /> ×{multiplier.toFixed(2)}
          </span>
          <Button size="sm" icon={Save} onClick={onSave} loading={saving} disabled={!dirty}>
            Save
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {SEAT_TYPES.map((type) => {
          const value = draft?.[type] ?? baseFor[type];
          const effective = value === '' ? null : Math.round(Number(value) * multiplier);
          return (
            <div key={type}>
              <label className="block text-2xs font-semibold uppercase tracking-wide text-ink-400 mb-1.5">
                {type}
              </label>
              <Input
                type="number"
                min="0"
                value={value}
                onChange={(e) => onChange(type, e.target.value)}
                className="!py-2 text-sm tabular"
                aria-label={`${type} price for ${show.movie_title}`}
              />
              {multiplier > 1 && effective != null && (
                <p className="text-2xs text-caution-400 mt-1 tabular">
                  sells at {formatCurrency(effective)}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
