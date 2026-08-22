import { useState, useEffect } from 'react';
import { Pencil, Trash2, Star } from 'lucide-react';
import { api, buildQuery } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import { formatDate, formatDuration } from '../../lib/format';
import {
  Button, Modal, Field, Input, Select, Textarea, Checkbox, ConfirmDialog,
  SearchInput, SmartImage, useDebounced, useAsync
} from '../../components/ui';
import {
  AdminHeader, CreateButton, ResourceTable, RowActions, IconButton, FilterBar
} from '../../components/admin/AdminShell';

const STATUSES = [
  { value: 'NowShowing', label: 'Now showing' },
  { value: 'ComingSoon', label: 'Coming soon' },
  { value: 'Ended', label: 'Ended' }
];

const EMPTY = {
  title: '', description: '', genre: '', language: '', duration_minutes: 120,
  certificate: 'UA', release_date: '', rating: '', poster_url: '', banner_url: '',
  trailer_url: '', director: '', cast_list: '', status: 'NowShowing', is_published: true
};

const statusBadge = (status) => ({
  NowShowing: 'badge-positive',
  ComingSoon: 'badge-info',
  Ended: 'badge-neutral'
}[status] || 'badge-neutral');

export function AdminMovies() {
  const toast = useToast();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const debouncedSearch = useDebounced(search, 300);

  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);

  const { data, loading, error, refetch } = useAsync(
    () => api.get(`/admin/movies${buildQuery({ search: debouncedSearch, status: statusFilter })}`),
    [debouncedSearch, statusFilter]
  );
  const movies = data?.movies || [];

  const save = async (form) => {
    setBusy(true);
    try {
      if (editing.movie_id) {
        await api.put(`/admin/movies/${editing.movie_id}`, form);
        toast.success(`"${form.title}" updated.`);
      } else {
        await api.post('/admin/movies', form);
        toast.success(`"${form.title}" added.`);
      }
      setEditing(null);
      await refetch();
    } catch (err) {
      toast.error(err.message || 'Could not save that movie.');
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async () => {
    setBusy(true);
    try {
      const res = await api.delete(`/admin/movies/${deleting.movie_id}`);
      toast.success(res.message);
      setDeleting(null);
      await refetch();
    } catch (err) {
      toast.error(err.message || 'Could not remove that movie.');
    } finally {
      setBusy(false);
    }
  };

  const togglePublish = async (movie) => {
    try {
      await api.put(`/admin/movies/${movie.movie_id}`, { is_published: !movie.is_published });
      toast.success(`"${movie.title}" ${movie.is_published ? 'unpublished' : 'published'}.`);
      await refetch();
    } catch (err) {
      toast.error(err.message || 'Could not change that movie.');
    }
  };

  const columns = [
    { key: 'movie', label: 'Movie' },
    { key: 'genre', label: 'Genre / language' },
    { key: 'duration', label: 'Runtime' },
    { key: 'release', label: 'Release' },
    { key: 'rating', label: 'Rating' },
    { key: 'status', label: 'Status' },
    { key: 'actions', label: '', align: 'right' }
  ];

  return (
    <div>
      <AdminHeader
        title="Movies"
        description="The catalogue customers browse. Unpublished titles are hidden from the storefront."
        actions={<CreateButton label="Add movie" onClick={() => setEditing({ ...EMPTY })} />}
      >
        <FilterBar>
          <SearchInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by title, cast or director"
            className="w-full sm:w-72"
            aria-label="Search movies"
          />
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="!w-auto min-w-[10rem] !py-2 text-xs"
            aria-label="Filter by status"
          >
            <option value="">All statuses</option>
            {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </Select>
          <span className="text-2xs text-ink-500 tabular ml-auto">
            {loading ? '—' : `${movies.length} movie${movies.length === 1 ? '' : 's'}`}
          </span>
        </FilterBar>
      </AdminHeader>

      <ResourceTable
        columns={columns}
        rows={movies}
        loading={loading}
        error={error}
        onRetry={refetch}
        rowKey={(row) => row.movie_id}
        emptyTitle={search || statusFilter ? 'No movies match those filters' : 'No movies yet'}
        emptyMessage={
          search || statusFilter
            ? 'Try clearing your filters.'
            : 'Add a film, then schedule shows for it against a screen.'
        }
        emptyAction={
          !search && !statusFilter && <Button onClick={() => setEditing({ ...EMPTY })}>Add your first movie</Button>
        }
        renderRow={(row, key) => (
          <tr key={key} className={!row.is_published ? 'opacity-60' : undefined}>
            <td>
              <span className="flex items-center gap-3">
                <span className="w-9 shrink-0">
                  <SmartImage
                    src={row.poster_url}
                    alt=""
                    fallbackText={row.title}
                    className="rounded border border-ink-700"
                  />
                </span>
                <span className="min-w-0">
                  <span className="block font-semibold text-ink-50 truncate max-w-[14rem]">{row.title}</span>
                  <span className="block text-2xs text-ink-500 truncate max-w-[14rem]">
                    {row.director || '—'}
                  </span>
                </span>
              </span>
            </td>
            <td className="text-ink-300">
              <span className="block">{row.genre || '—'}</span>
              <span className="block text-2xs text-ink-500">{row.language || '—'}</span>
            </td>
            <td className="tabular text-ink-400">{formatDuration(row.duration_minutes)}</td>
            <td className="tabular text-ink-400 whitespace-nowrap">
              {row.release_date ? formatDate(row.release_date) : '—'}
            </td>
            <td>
              {row.rating != null ? (
                <span className="flex items-center gap-1 text-caution-400 font-semibold tabular">
                  <Star className="w-3 h-3 fill-current" aria-hidden />{Number(row.rating).toFixed(1)}
                </span>
              ) : <span className="text-ink-600">—</span>}
            </td>
            <td>
              <span className="flex flex-col gap-1 items-start">
                <span className={statusBadge(row.status)}>
                  {STATUSES.find((s) => s.value === row.status)?.label || row.status}
                </span>
                {!row.is_published && <span className="badge-caution">Unpublished</span>}
              </span>
            </td>
            <td>
              <RowActions>
                <button
                  onClick={() => togglePublish(row)}
                  className="text-2xs font-semibold text-ink-400 hover:text-brand-400 px-2"
                >
                  {row.is_published ? 'Unpublish' : 'Publish'}
                </button>
                <IconButton icon={Pencil} label={`Edit ${row.title}`} onClick={() => setEditing(row)} />
                <IconButton icon={Trash2} label={`Remove ${row.title}`} tone="danger" onClick={() => setDeleting(row)} />
              </RowActions>
            </td>
          </tr>
        )}
      />

      <MovieForm movie={editing} onClose={() => setEditing(null)} onSave={save} busy={busy} />

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        loading={busy}
        title={`Remove "${deleting?.title}"?`}
        confirmLabel="Remove"
        message="The film is withdrawn from the catalogue and its upcoming shows are pulled off sale. Tickets already sold stay valid."
      />
    </div>
  );
}

function MovieForm({ movie, onClose, onSave, busy }) {
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (!movie) return;
    setForm({
      ...EMPTY,
      ...movie,
      // <input type="date"> needs a bare YYYY-MM-DD, not an ISO datetime.
      release_date: movie.release_date ? String(movie.release_date).slice(0, 10) : '',
      rating: movie.rating ?? '',
      description: movie.description || '',
      genre: movie.genre || '',
      language: movie.language || '',
      certificate: movie.certificate || 'UA',
      poster_url: movie.poster_url || '',
      banner_url: movie.banner_url || '',
      trailer_url: movie.trailer_url || '',
      director: movie.director || '',
      cast_list: movie.cast_list || '',
      is_published: movie.is_published === undefined ? true : !!movie.is_published
    });
    setErrors({});
  }, [movie]);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const submit = (e) => {
    e.preventDefault();
    const next = {};
    if (!form.title.trim()) next.title = 'Enter a title.';
    if (!form.duration_minutes || form.duration_minutes < 1) next.duration_minutes = 'Enter the runtime in minutes.';
    if (form.rating !== '' && (Number(form.rating) < 0 || Number(form.rating) > 10)) {
      next.rating = 'Rating must be between 0 and 10.';
    }
    for (const [key, label] of [['poster_url', 'Poster'], ['banner_url', 'Backdrop'], ['trailer_url', 'Trailer']]) {
      if (form[key] && !/^https?:\/\//.test(form[key])) next[key] = `${label} must be a full http(s) URL.`;
    }
    setErrors(next);
    if (Object.keys(next).length) return;

    onSave({
      title: form.title.trim(),
      description: form.description.trim() || null,
      genre: form.genre.trim() || null,
      language: form.language.trim() || null,
      duration_minutes: Number(form.duration_minutes),
      certificate: form.certificate || null,
      release_date: form.release_date || null,
      rating: form.rating === '' ? null : Number(form.rating),
      poster_url: form.poster_url.trim() || null,
      banner_url: form.banner_url.trim() || null,
      trailer_url: form.trailer_url.trim() || null,
      director: form.director.trim() || null,
      cast_list: form.cast_list.trim() || null,
      status: form.status,
      is_published: form.is_published
    });
  };

  return (
    <Modal
      open={!!movie}
      onClose={onClose}
      title={movie?.movie_id ? `Edit "${movie.title}"` : 'Add a movie'}
      size="lg"
      footer={(
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={submit} loading={busy}>Save movie</Button>
        </>
      )}
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Title" required error={errors.title}>
          <Input value={form.title} onChange={(e) => set({ title: e.target.value })} autoFocus />
        </Field>

        <Field label="Synopsis">
          <Textarea rows={3} value={form.description} onChange={(e) => set({ description: e.target.value })} />
        </Field>

        <div className="grid sm:grid-cols-3 gap-4">
          <Field label="Genre">
            <Input value={form.genre} onChange={(e) => set({ genre: e.target.value })} placeholder="Thriller" />
          </Field>
          <Field label="Language">
            <Input value={form.language} onChange={(e) => set({ language: e.target.value })} placeholder="Hindi" />
          </Field>
          <Field label="Certificate">
            <Select value={form.certificate} onChange={(e) => set({ certificate: e.target.value })}>
              {['U', 'UA', 'A', 'S'].map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
          </Field>
        </div>

        <div className="grid sm:grid-cols-3 gap-4">
          <Field label="Runtime (minutes)" required error={errors.duration_minutes}>
            <Input
              type="number"
              min="1"
              max="600"
              value={form.duration_minutes}
              onChange={(e) => set({ duration_minutes: e.target.value })}
            />
          </Field>
          <Field label="Release date">
            <Input type="date" value={form.release_date} onChange={(e) => set({ release_date: e.target.value })} />
          </Field>
          <Field label="Rating (0–10)" error={errors.rating}>
            <Input
              type="number"
              step="0.1"
              min="0"
              max="10"
              value={form.rating}
              onChange={(e) => set({ rating: e.target.value })}
            />
          </Field>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Director">
            <Input value={form.director} onChange={(e) => set({ director: e.target.value })} />
          </Field>
          <Field label="Cast" hint="Comma separated.">
            <Input value={form.cast_list} onChange={(e) => set({ cast_list: e.target.value })} />
          </Field>
        </div>

        <Field label="Poster URL" error={errors.poster_url} hint="Portrait, roughly 2:3.">
          <Input value={form.poster_url} onChange={(e) => set({ poster_url: e.target.value })} placeholder="https://…" />
        </Field>

        <Field label="Backdrop URL" error={errors.banner_url} hint="Wide, used for the hero banner.">
          <Input value={form.banner_url} onChange={(e) => set({ banner_url: e.target.value })} placeholder="https://…" />
        </Field>

        <Field label="Trailer embed URL" error={errors.trailer_url} hint="A YouTube /embed/ link works best.">
          <Input value={form.trailer_url} onChange={(e) => set({ trailer_url: e.target.value })} placeholder="https://www.youtube.com/embed/…" />
        </Field>

        <div className="grid sm:grid-cols-2 gap-4 items-end">
          <Field label="Status">
            <Select value={form.status} onChange={(e) => set({ status: e.target.value })}>
              {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </Select>
          </Field>
          <Checkbox
            label="Published (visible to customers)"
            checked={form.is_published}
            onChange={(e) => set({ is_published: e.target.checked })}
            className="pb-2.5"
          />
        </div>
      </form>
    </Modal>
  );
}
