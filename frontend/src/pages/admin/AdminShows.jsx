import { useState, useEffect, useMemo } from 'react';
import { CalendarClock, Trash2, Zap, AlertTriangle } from 'lucide-react';
import { api, buildQuery } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import { formatCurrency, formatDate, formatTime, upcomingDays, toDateParam } from '../../lib/format';
import {
  Button, Modal, Field, Input, Select, ConfirmDialog, useAsync, cx
} from '../../components/ui';
import {
  AdminHeader, CreateButton, ResourceTable, RowActions, IconButton, FilterBar
} from '../../components/admin/AdminShell';

const SEAT_TYPES = ['Silver', 'Gold', 'Platinum', 'Recliner'];

/** Default price ladders by screen type, so the form arrives pre-filled. */
const PRICE_PRESETS = {
  Standard: { Silver: 180, Gold: 220, Platinum: 280, Recliner: 450 },
  Premium: { Silver: 220, Gold: 270, Platinum: 340, Recliner: 520 },
  IMAX: { Silver: 300, Gold: 380, Platinum: 460, Recliner: 700 },
  '4DX': { Silver: 350, Gold: 420, Platinum: 500, Recliner: 750 },
  Recliner: { Silver: 260, Gold: 320, Platinum: 420, Recliner: 650 }
};

export function AdminShows() {
  const toast = useToast();

  const [dateFilter, setDateFilter] = useState(toDateParam(new Date()));
  const [theatreFilter, setTheatreFilter] = useState('');
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);

  const { data: movieData } = useAsync(() => api.get('/admin/movies?status=NowShowing'));
  const { data: screenData } = useAsync(() => api.get('/admin/screens'));
  const { data: theatreData } = useAsync(() => api.get('/admin/theatres'));

  const movies = movieData?.movies || [];
  const screens = screenData?.screens || [];
  const theatres = theatreData?.theatres || [];

  const { data, loading, error, refetch } = useAsync(
    () => api.get(`/admin/shows${buildQuery({ date: dateFilter, theatreId: theatreFilter })}`),
    [dateFilter, theatreFilter]
  );
  const shows = data?.shows || [];

  const create = async (form) => {
    setBusy(true);
    try {
      await api.post('/admin/shows', form);
      toast.success('Show scheduled.');
      setCreating(false);
      await refetch();
    } catch (err) {
      toast.error(err.message || 'Could not schedule that show.');
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async () => {
    setBusy(true);
    try {
      const res = await api.delete(`/admin/shows/${deleting.show_id}`);
      toast[res.deleted ? 'success' : 'warning'](res.message);
      setDeleting(null);
      await refetch();
    } catch (err) {
      toast.error(err.message || 'Could not remove that show.');
    } finally {
      setBusy(false);
    }
  };

  const recalcPrice = async (show) => {
    try {
      const res = await api.post(`/admin/shows/${show.show_id}/dynamic-price`);
      toast.success(`Demand multiplier now ×${Number(res.demandMultiplier).toFixed(2)}.`);
      await refetch();
    } catch (err) {
      toast.error(err.message || 'Could not recalculate pricing.');
    }
  };

  const days = upcomingDays(7);

  const columns = [
    { key: 'time', label: 'Showtime' },
    { key: 'movie', label: 'Movie' },
    { key: 'venue', label: 'Theatre / screen' },
    { key: 'price', label: 'Base price' },
    { key: 'demand', label: 'Demand' },
    { key: 'status', label: 'Status' },
    { key: 'actions', label: '', align: 'right' }
  ];

  return (
    <div>
      <AdminHeader
        title="Shows"
        description="Schedule screenings. Overlapping shows on one screen are rejected automatically."
        actions={<CreateButton label="Schedule show" onClick={() => setCreating(true)} />}
      >
        <FilterBar>
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
            {days.map((day) => (
              <button
                key={day.param}
                onClick={() => setDateFilter(day.param)}
                className={cx(
                  'shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap',
                  dateFilter === day.param
                    ? 'bg-brand-500 text-white'
                    : 'bg-ink-800 text-ink-300 hover:text-ink-50'
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

          <span className="text-2xs text-ink-500 tabular ml-auto">
            {loading ? '—' : `${shows.length} show${shows.length === 1 ? '' : 's'}`}
          </span>
        </FilterBar>
      </AdminHeader>

      <ResourceTable
        columns={columns}
        rows={shows}
        loading={loading}
        error={error}
        onRetry={refetch}
        rowKey={(row) => row.show_id}
        emptyTitle="No shows on this date"
        emptyMessage="Schedule a screening for a movie on one of your screens."
        emptyAction={<Button onClick={() => setCreating(true)}>Schedule a show</Button>}
        renderRow={(row, key) => (
          <tr key={key} className={row.status === 'Cancelled' ? 'opacity-55' : undefined}>
            <td className="whitespace-nowrap">
              <span className="block font-bold text-ink-50 tabular">{formatTime(row.show_time)}</span>
              <span className="block text-2xs text-ink-500 tabular">
                to {formatTime(row.end_time)}
              </span>
            </td>
            <td>
              <span className="block text-ink-100 truncate max-w-[13rem]">{row.movie_title}</span>
              <span className="block text-2xs text-ink-500">{row.language}</span>
            </td>
            <td className="text-ink-300">
              <span className="block truncate max-w-[12rem]">{row.theater_name}</span>
              <span className="block text-2xs text-ink-500">
                {row.screen_name || `Screen ${row.screen_number}`} · {row.screen_type}
              </span>
            </td>
            <td className="tabular text-ink-200">{formatCurrency(row.base_price)}</td>
            <td>
              <span className={Number(row.demand_multiplier) > 1 ? 'badge-caution' : 'badge-neutral'}>
                ×{Number(row.demand_multiplier).toFixed(2)}
              </span>
            </td>
            <td>
              <span className={row.status === 'Scheduled' ? 'badge-positive' : 'badge-neutral'}>
                {row.status}
              </span>
            </td>
            <td>
              <RowActions>
                <IconButton
                  icon={Zap}
                  label="Recalculate demand pricing"
                  onClick={() => recalcPrice(row)}
                />
                <IconButton
                  icon={Trash2}
                  label="Remove show"
                  tone="danger"
                  onClick={() => setDeleting(row)}
                />
              </RowActions>
            </td>
          </tr>
        )}
      />

      <ShowForm
        open={creating}
        onClose={() => setCreating(false)}
        onSave={create}
        busy={busy}
        movies={movies}
        screens={screens}
        defaultDate={dateFilter}
      />

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        loading={busy}
        title="Remove this show?"
        confirmLabel="Remove"
        message="If any tickets have been sold it will be cancelled rather than deleted, and those bookings stay on record."
      />
    </div>
  );
}

function ShowForm({ open, onClose, onSave, busy, movies, screens, defaultDate }) {
  const [form, setForm] = useState({
    movie_id: '', screen_id: '', date: defaultDate, time: '18:00',
    base_price: 200, pricing: PRICE_PRESETS.Standard
  });
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (!open) return;
    setForm({
      movie_id: movies[0]?.movie_id || '',
      screen_id: screens.find((s) => s.total_seats > 0)?.screen_id || '',
      date: defaultDate,
      time: '18:00',
      base_price: 200,
      pricing: PRICE_PRESETS.Standard
    });
    setErrors({});
  }, [open, movies, screens, defaultDate]);

  const screen = useMemo(
    () => screens.find((s) => String(s.screen_id) === String(form.screen_id)),
    [screens, form.screen_id]
  );
  const movie = useMemo(
    () => movies.find((m) => String(m.movie_id) === String(form.movie_id)),
    [movies, form.movie_id]
  );

  // Re-seed the price ladder when the screen type changes.
  useEffect(() => {
    if (!screen) return;
    const preset = PRICE_PRESETS[screen.screen_type] || PRICE_PRESETS.Standard;
    setForm((f) => ({ ...f, pricing: preset, base_price: preset.Silver }));
  }, [screen?.screen_type]); // eslint-disable-line react-hooks/exhaustive-deps

  // End time is derived: runtime plus 20 minutes of trailers and turnaround.
  const endsAt = useMemo(() => {
    if (!movie || !form.date || !form.time) return null;
    const start = new Date(`${form.date}T${form.time}`);
    if (Number.isNaN(start.getTime())) return null;
    return new Date(start.getTime() + (movie.duration_minutes + 20) * 60_000);
  }, [movie, form.date, form.time]);

  const submit = (e) => {
    e.preventDefault();
    const next = {};
    if (!form.movie_id) next.movie_id = 'Choose a movie.';
    if (!form.screen_id) next.screen_id = 'Choose a screen.';
    if (!form.date || !form.time) next.date = 'Pick a date and time.';

    const start = new Date(`${form.date}T${form.time}`);
    if (!Number.isNaN(start.getTime()) && start.getTime() <= Date.now()) {
      next.date = 'The show must start in the future.';
    }
    if (screen && screen.total_seats === 0) {
      next.screen_id = 'This screen has no seats configured yet.';
    }
    setErrors(next);
    if (Object.keys(next).length) return;

    onSave({
      movie_id: Number(form.movie_id),
      screen_id: Number(form.screen_id),
      show_time: start.toISOString(),
      end_time: endsAt?.toISOString(),
      base_price: Number(form.base_price),
      pricing: Object.fromEntries(
        Object.entries(form.pricing).map(([type, price]) => [type, Number(price)])
      )
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Schedule a show"
      description="The screen must belong to the theatre and be free for the whole runtime."
      size="md"
      footer={(
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={submit} loading={busy}>Schedule</Button>
        </>
      )}
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Movie" required error={errors.movie_id}>
          <Select value={form.movie_id} onChange={(e) => setForm({ ...form, movie_id: e.target.value })}>
            <option value="">Select a movie…</option>
            {movies.map((m) => (
              <option key={m.movie_id} value={m.movie_id}>{m.title} ({m.duration_minutes}m)</option>
            ))}
          </Select>
        </Field>

        <Field label="Screen" required error={errors.screen_id}>
          <Select value={form.screen_id} onChange={(e) => setForm({ ...form, screen_id: e.target.value })}>
            <option value="">Select a screen…</option>
            {screens.map((s) => (
              <option key={s.screen_id} value={s.screen_id} disabled={s.total_seats === 0}>
                {s.theater_name} — {s.name || `Screen ${s.screen_number}`}
                {s.total_seats === 0 ? ' (no seats)' : ` (${s.total_seats} seats, ${s.screen_type})`}
              </option>
            ))}
          </Select>
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Date" required error={errors.date}>
            <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </Field>
          <Field label="Start time" required>
            <Input type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} />
          </Field>
        </div>

        {endsAt && (
          <p className="text-2xs text-ink-400 flex items-center gap-1.5 -mt-1">
            <CalendarClock className="w-3.5 h-3.5" aria-hidden />
            Ends around {formatTime(endsAt)} on {formatDate(endsAt)} (runtime + 20 min turnaround)
          </p>
        )}

        <div>
          <p className="label">Ticket prices by category</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {SEAT_TYPES.map((type) => (
              <Field key={type} label={type}>
                <Input
                  type="number"
                  min="0"
                  value={form.pricing[type] ?? ''}
                  onChange={(e) => setForm({
                    ...form,
                    pricing: { ...form.pricing, [type]: e.target.value },
                    ...(type === 'Silver' ? { base_price: e.target.value } : {})
                  })}
                  className="tabular"
                />
              </Field>
            ))}
          </div>
          <p className="text-2xs text-ink-500 mt-2">
            Only the categories present on this screen's seat map will be charged.
            Demand pricing scales these, never replaces them.
          </p>
        </div>

        {screen?.total_seats === 0 && (
          <p className="flex items-start gap-2 text-xs text-caution-400">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden />
            This screen has no seats yet. Generate its layout before scheduling shows.
          </p>
        )}
      </form>
    </Modal>
  );
}
