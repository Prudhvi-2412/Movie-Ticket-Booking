import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { MonitorPlay, Pencil, Trash2, Armchair } from 'lucide-react';
import { api, buildQuery } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import {
  Button, Modal, Field, Input, Select, Checkbox, ConfirmDialog, useAsync
} from '../../components/ui';
import {
  AdminHeader, CreateButton, ResourceTable, StatusPill, RowActions, IconButton, FilterBar
} from '../../components/admin/AdminShell';

const SCREEN_TYPES = ['Standard', 'Premium', 'IMAX', '4DX', 'Recliner'];
const EMPTY = { theater_id: '', screen_number: 1, name: '', screen_type: 'Standard', is_active: true };

export function AdminScreens() {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const theatreFilter = params.get('theatreId') || '';

  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);

  const { data: theatreData } = useAsync(() => api.get('/admin/theatres?includeInactive=true'));
  const theatres = theatreData?.theatres || [];

  const { data, loading, error, refetch } = useAsync(
    () => api.get(`/admin/screens${buildQuery({ theatreId: theatreFilter })}`),
    [theatreFilter]
  );
  const screens = data?.screens || [];

  const save = async (form) => {
    setBusy(true);
    try {
      if (editing.screen_id) {
        // theater_id cannot move: seats and shows hang off this screen.
        const { theater_id: _unmovable, ...rest } = form;
        await api.put(`/admin/screens/${editing.screen_id}`, rest);
        toast.success('Screen updated.');
      } else {
        const res = await api.post('/admin/screens', form);
        toast.success(res.message);
      }
      setEditing(null);
      await refetch();
    } catch (err) {
      toast.error(err.message || 'Could not save that screen.');
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async () => {
    setBusy(true);
    try {
      const res = await api.delete(`/admin/screens/${deleting.screen_id}`);
      toast[res.deleted ? 'success' : 'warning'](res.message);
      setDeleting(null);
      await refetch();
    } catch (err) {
      toast.error(err.message || 'Could not remove that screen.');
    } finally {
      setBusy(false);
    }
  };

  const columns = [
    { key: 'screen', label: 'Screen' },
    { key: 'theatre', label: 'Theatre' },
    { key: 'type', label: 'Type' },
    { key: 'seats', label: 'Seats' },
    { key: 'shows', label: 'Upcoming shows' },
    { key: 'status', label: 'Status' },
    { key: 'actions', label: '', align: 'right' }
  ];

  return (
    <div>
      <AdminHeader
        title="Screens"
        description="Auditoriums within each theatre. Seat capacity is derived from the seat map."
        actions={
          <CreateButton
            label="Add screen"
            onClick={() => setEditing({ ...EMPTY, theater_id: theatreFilter || theatres[0]?.theater_id || '' })}
          />
        }
      >
        <FilterBar>
          <Select
            value={theatreFilter}
            onChange={(e) => setParams(e.target.value ? { theatreId: e.target.value } : {})}
            className="!w-auto min-w-[14rem] !py-2 text-xs"
            aria-label="Filter by theatre"
          >
            <option value="">All theatres</option>
            {theatres.map((t) => (
              <option key={t.theater_id} value={t.theater_id}>{t.name} — {t.city}</option>
            ))}
          </Select>
          <span className="text-2xs text-ink-500 tabular ml-auto">
            {loading ? '—' : `${screens.length} screen${screens.length === 1 ? '' : 's'}`}
          </span>
        </FilterBar>
      </AdminHeader>

      <ResourceTable
        columns={columns}
        rows={screens}
        loading={loading}
        error={error}
        onRetry={refetch}
        rowKey={(row) => row.screen_id}
        emptyTitle="No screens yet"
        emptyMessage="Create a screen, then generate its seat layout before scheduling any shows on it."
        emptyAction={
          theatres.length > 0 && (
            <Button onClick={() => setEditing({ ...EMPTY, theater_id: theatres[0].theater_id })}>
              Add your first screen
            </Button>
          )
        }
        renderRow={(row, key) => (
          <tr key={key}>
            <td>
              <span className="flex items-center gap-2 font-semibold text-ink-50">
                <MonitorPlay className="w-3.5 h-3.5 text-brand-500 shrink-0" aria-hidden />
                {row.name || `Screen ${row.screen_number}`}
              </span>
            </td>
            <td className="text-ink-300">
              <span className="block truncate max-w-[12rem]">{row.theater_name}</span>
              <span className="block text-2xs text-ink-500">{row.city}</span>
            </td>
            <td>
              <span className={row.screen_type === 'Standard' ? 'badge-neutral' : 'badge-brand'}>
                {row.screen_type}
              </span>
            </td>
            <td className="tabular">
              <Link
                to={`/admin/seats?screenId=${row.screen_id}`}
                className={`inline-flex items-center gap-1 hover:text-brand-400 ${
                  row.total_seats === 0 ? 'text-caution-400' : 'text-ink-300'
                }`}
              >
                <Armchair className="w-3.5 h-3.5" aria-hidden />
                {row.total_seats === 0 ? 'Configure' : row.total_seats}
              </Link>
            </td>
            <td className="tabular text-ink-400">{row.upcoming_shows}</td>
            <td><StatusPill active={!!row.is_active} /></td>
            <td>
              <RowActions>
                <IconButton icon={Pencil} label="Edit screen" onClick={() => setEditing(row)} />
                <IconButton icon={Trash2} label="Remove screen" tone="danger" onClick={() => setDeleting(row)} />
              </RowActions>
            </td>
          </tr>
        )}
      />

      <ScreenForm
        screen={editing}
        theatres={theatres}
        onClose={() => setEditing(null)}
        onSave={save}
        busy={busy}
      />

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        loading={busy}
        title="Remove this screen?"
        confirmLabel="Remove"
        message="Its seat map will go with it. If any tickets have been sold for this screen it will be disabled instead of deleted."
      />
    </div>
  );
}

function ScreenForm({ screen, theatres, onClose, onSave, busy }) {
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (!screen) return;
    setForm({
      theater_id: screen.theater_id || '',
      screen_number: screen.screen_number || 1,
      name: screen.name || '',
      screen_type: screen.screen_type || 'Standard',
      is_active: screen.is_active === undefined ? true : !!screen.is_active
    });
    setErrors({});
  }, [screen]);

  const isEdit = !!screen?.screen_id;

  const submit = (e) => {
    e.preventDefault();
    const next = {};
    if (!form.theater_id) next.theater_id = 'Choose a theatre.';
    if (!form.screen_number || form.screen_number < 1) next.screen_number = 'Enter a screen number.';
    setErrors(next);
    if (Object.keys(next).length) return;

    onSave({
      theater_id: Number(form.theater_id),
      screen_number: Number(form.screen_number),
      name: form.name.trim() || `Screen ${form.screen_number}`,
      screen_type: form.screen_type,
      is_active: form.is_active
    });
  };

  return (
    <Modal
      open={!!screen}
      onClose={onClose}
      title={isEdit ? 'Edit screen' : 'Add a screen'}
      size="sm"
      footer={(
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={submit} loading={busy}>Save</Button>
        </>
      )}
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field
          label="Theatre"
          required
          error={errors.theater_id}
          hint={isEdit ? 'A screen cannot be moved to another theatre.' : undefined}
        >
          <Select
            value={form.theater_id}
            onChange={(e) => setForm({ ...form, theater_id: e.target.value })}
            disabled={isEdit}
          >
            <option value="">Select a theatre…</option>
            {theatres.map((t) => (
              <option key={t.theater_id} value={t.theater_id}>{t.name} — {t.city}</option>
            ))}
          </Select>
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Screen number" required error={errors.screen_number}>
            <Input
              type="number"
              min="1"
              max="99"
              value={form.screen_number}
              onChange={(e) => setForm({ ...form, screen_number: e.target.value })}
            />
          </Field>
          <Field label="Display name">
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Audi 1"
            />
          </Field>
        </div>

        <Field label="Screen type" hint="Drives the default price ladder for shows on this screen.">
          <Select
            value={form.screen_type}
            onChange={(e) => setForm({ ...form, screen_type: e.target.value })}
          >
            {SCREEN_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </Select>
        </Field>

        <Checkbox
          label="Active"
          checked={form.is_active}
          onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
        />

        {!isEdit && (
          <p className="text-2xs text-ink-500 leading-relaxed">
            After saving, generate a seat layout for this screen — shows cannot
            be scheduled on a screen with no seats.
          </p>
        )}
      </form>
    </Modal>
  );
}
