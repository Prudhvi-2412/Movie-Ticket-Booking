import { useState, useEffect } from 'react';
import { Building2, Pencil, Trash2, MonitorPlay } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api, buildQuery } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import {
  Button, Modal, Field, Input, Select, Textarea, Checkbox, ConfirmDialog,
  SearchInput, useDebounced, useAsync
} from '../../components/ui';
import {
  AdminHeader, CreateButton, ResourceTable, StatusPill, RowActions, IconButton, FilterBar
} from '../../components/admin/AdminShell';

const EMPTY = {
  location_id: '', name: '', location: '', address: '',
  contact_phone: '', facilities: '', is_active: true
};

export function AdminTheatres() {
  const toast = useToast();

  const [search, setSearch] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const debouncedSearch = useDebounced(search, 300);

  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);

  const { data: locData } = useAsync(() => api.get('/admin/locations?includeInactive=true'));
  const locations = locData?.locations || [];

  const { data, loading, error, refetch } = useAsync(
    () => api.get(`/admin/theatres${buildQuery({
      search: debouncedSearch, locationId: locationFilter, includeInactive: true
    })}`),
    [debouncedSearch, locationFilter]
  );

  const theatres = data?.theatres || [];

  const save = async (form) => {
    setBusy(true);
    try {
      if (editing.theater_id) {
        await api.put(`/admin/theatres/${editing.theater_id}`, form);
        toast.success(`${form.name} updated.`);
      } else {
        await api.post('/admin/theatres', form);
        toast.success(`${form.name} added.`);
      }
      setEditing(null);
      await refetch();
    } catch (err) {
      toast.error(err.message || 'Could not save that theatre.');
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async () => {
    setBusy(true);
    try {
      const res = await api.delete(`/admin/theatres/${deleting.theater_id}`);
      toast[res.deleted ? 'success' : 'warning'](res.message);
      setDeleting(null);
      await refetch();
    } catch (err) {
      toast.error(err.message || 'Could not remove that theatre.');
    } finally {
      setBusy(false);
    }
  };

  const columns = [
    { key: 'name', label: 'Theatre' },
    { key: 'city', label: 'City' },
    { key: 'screens', label: 'Screens' },
    { key: 'seats', label: 'Seats' },
    { key: 'facilities', label: 'Facilities' },
    { key: 'status', label: 'Status' },
    { key: 'actions', label: '', align: 'right' }
  ];

  return (
    <div>
      <AdminHeader
        title="Theatres"
        description="Cinemas, their screens and the facilities customers see."
        actions={
          <CreateButton
            label="Add theatre"
            onClick={() => setEditing({ ...EMPTY, location_id: locationFilter || locations[0]?.location_id || '' })}
          />
        }
      >
        <FilterBar>
          <SearchInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search theatres"
            className="w-full sm:w-64"
            aria-label="Search theatres"
          />
          <Select
            value={locationFilter}
            onChange={(e) => setLocationFilter(e.target.value)}
            className="!w-auto min-w-[10rem] !py-2 text-xs"
            aria-label="Filter by city"
          >
            <option value="">All cities</option>
            {locations.map((l) => (
              <option key={l.location_id} value={l.location_id}>{l.city}</option>
            ))}
          </Select>
          <span className="text-2xs text-ink-500 tabular ml-auto">
            {loading ? '—' : `${theatres.length} theatre${theatres.length === 1 ? '' : 's'}`}
          </span>
        </FilterBar>
      </AdminHeader>

      <ResourceTable
        columns={columns}
        rows={theatres}
        loading={loading}
        error={error}
        onRetry={refetch}
        rowKey={(row) => row.theater_id}
        emptyTitle="No theatres yet"
        emptyMessage="Add a cinema, then give it screens and a seat layout before scheduling shows."
        emptyAction={
          locations.length > 0 && (
            <Button onClick={() => setEditing({ ...EMPTY, location_id: locations[0].location_id })}>
              Add your first theatre
            </Button>
          )
        }
        renderRow={(row, key) => (
          <tr key={key}>
            <td>
              <span className="flex items-center gap-2 font-semibold text-ink-50">
                <Building2 className="w-3.5 h-3.5 text-brand-500 shrink-0" aria-hidden />
                <span className="min-w-0">
                  <span className="block truncate max-w-[14rem]">{row.name}</span>
                  <span className="block text-2xs font-normal text-ink-500 truncate max-w-[14rem]">
                    {row.location}
                  </span>
                </span>
              </span>
            </td>
            <td className="text-ink-300">{row.city}</td>
            <td className="tabular text-ink-300">
              <Link
                to={`/admin/screens?theatreId=${row.theater_id}`}
                className="inline-flex items-center gap-1 hover:text-brand-400"
              >
                <MonitorPlay className="w-3.5 h-3.5" aria-hidden /> {row.screen_count}
              </Link>
            </td>
            <td className="tabular text-ink-400">{row.seat_capacity}</td>
            <td className="max-w-[16rem]">
              <span className="flex flex-wrap gap-1">
                {(row.facilities || []).slice(0, 2).map((f) => (
                  <span key={f} className="badge-neutral !normal-case !tracking-normal !font-medium">{f}</span>
                ))}
                {(row.facilities || []).length > 2 && (
                  <span className="text-2xs text-ink-500 self-center">
                    +{row.facilities.length - 2}
                  </span>
                )}
              </span>
            </td>
            <td><StatusPill active={!!row.is_active} /></td>
            <td>
              <RowActions>
                <IconButton icon={Pencil} label={`Edit ${row.name}`} onClick={() => setEditing(row)} />
                <IconButton icon={Trash2} label={`Remove ${row.name}`} tone="danger" onClick={() => setDeleting(row)} />
              </RowActions>
            </td>
          </tr>
        )}
      />

      <TheatreForm
        theatre={editing}
        locations={locations}
        onClose={() => setEditing(null)}
        onSave={save}
        busy={busy}
      />

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        loading={busy}
        title={`Remove ${deleting?.name}?`}
        confirmLabel="Remove"
        message="If this theatre has any bookings on record it will be disabled instead of deleted, so existing tickets stay valid."
      />
    </div>
  );
}

function TheatreForm({ theatre, locations, onClose, onSave, busy }) {
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (!theatre) return;
    setForm({
      location_id: theatre.location_id || '',
      name: theatre.name || '',
      location: theatre.location || '',
      address: theatre.address || '',
      contact_phone: theatre.contact_phone || '',
      // Facilities are edited as a comma-separated string and sent as an array.
      facilities: Array.isArray(theatre.facilities) ? theatre.facilities.join(', ') : '',
      is_active: theatre.is_active === undefined ? true : !!theatre.is_active
    });
    setErrors({});
  }, [theatre]);

  const submit = (e) => {
    e.preventDefault();
    const next = {};
    if (!form.location_id) next.location_id = 'Choose a city.';
    if (form.name.trim().length < 2) next.name = 'Enter the theatre name.';
    if (form.location.trim().length < 2) next.location = 'Enter the locality or area.';
    if (form.contact_phone && !/^[0-9+\- ]{7,20}$/.test(form.contact_phone)) {
      next.contact_phone = 'Enter a valid phone number.';
    }
    setErrors(next);
    if (Object.keys(next).length) return;

    onSave({
      location_id: Number(form.location_id),
      name: form.name.trim(),
      location: form.location.trim(),
      address: form.address.trim() || null,
      contact_phone: form.contact_phone.trim() || null,
      facilities: form.facilities.split(',').map((f) => f.trim()).filter(Boolean),
      is_active: form.is_active
    });
  };

  return (
    <Modal
      open={!!theatre}
      onClose={onClose}
      title={theatre?.theater_id ? `Edit ${theatre.name}` : 'Add a theatre'}
      size="md"
      footer={(
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={submit} loading={busy}>Save</Button>
        </>
      )}
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="City" required error={errors.location_id}>
          <Select
            value={form.location_id}
            onChange={(e) => setForm({ ...form, location_id: e.target.value })}
          >
            <option value="">Select a city…</option>
            {locations.map((l) => (
              <option key={l.location_id} value={l.location_id}>{l.city}, {l.state}</option>
            ))}
          </Select>
        </Field>

        <Field label="Theatre name" required error={errors.name}>
          <Input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="PVR Nexus"
          />
        </Field>

        <Field label="Locality" required error={errors.location} hint="The neighbourhood customers recognise.">
          <Input
            value={form.location}
            onChange={(e) => setForm({ ...form, location: e.target.value })}
            placeholder="Kukatpally"
          />
        </Field>

        <Field label="Full address">
          <Textarea
            rows={2}
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
            placeholder="Nexus Mall, KPHB Phase 1, Hyderabad 500072"
          />
        </Field>

        <Field label="Contact phone" error={errors.contact_phone}>
          <Input
            value={form.contact_phone}
            onChange={(e) => setForm({ ...form, contact_phone: e.target.value })}
            placeholder="+91 40 6677 8899"
          />
        </Field>

        <Field label="Facilities" hint="Comma separated — shown as chips on the theatre page.">
          <Input
            value={form.facilities}
            onChange={(e) => setForm({ ...form, facilities: e.target.value })}
            placeholder="Dolby Atmos, Recliners, Parking"
          />
        </Field>

        <Checkbox
          label="Visible to customers"
          checked={form.is_active}
          onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
        />
      </form>
    </Modal>
  );
}
