import React, { useState, useCallback } from 'react';
import { MapPin, Pencil, Trash2 } from 'lucide-react';
import { api, buildQuery } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import { useLocationContext } from '../../context/LocationContext';
import {
  Button, Modal, Field, Input, Checkbox, ConfirmDialog, SearchInput, useDebounced, useAsync
} from '../../components/ui';
import {
  AdminHeader, CreateButton, ResourceTable, StatusPill, RowActions, IconButton, FilterBar
} from '../../components/admin/AdminShell';

const EMPTY = { city: '', state: '', country: 'India', is_active: true };

export function AdminLocations() {
  const toast = useToast();
  const { reload: reloadLocations } = useLocationContext();

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounced(search, 300);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);

  const { data, loading, error, refetch } = useAsync(
    () => api.get(`/admin/locations${buildQuery({ search: debouncedSearch, includeInactive: true })}`),
    [debouncedSearch]
  );

  const locations = data?.locations || [];

  // The customer-facing city list must reflect admin edits immediately.
  const refreshAll = useCallback(async () => {
    await refetch();
    await reloadLocations();
  }, [refetch, reloadLocations]);

  const save = async (form) => {
    setBusy(true);
    try {
      if (editing.location_id) {
        await api.put(`/admin/locations/${editing.location_id}`, form);
        toast.success(`${form.city} updated.`);
      } else {
        await api.post('/admin/locations', form);
        toast.success(`${form.city} added.`);
      }
      setEditing(null);
      await refreshAll();
    } catch (err) {
      toast.error(err.message || 'Could not save that location.');
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async () => {
    setBusy(true);
    try {
      const res = await api.delete(`/admin/locations/${deleting.location_id}`);
      toast[res.deleted ? 'success' : 'warning'](res.message);
      setDeleting(null);
      await refreshAll();
    } catch (err) {
      toast.error(err.message || 'Could not remove that location.');
    } finally {
      setBusy(false);
    }
  };

  const columns = [
    { key: 'city', label: 'City' },
    { key: 'state', label: 'State' },
    { key: 'country', label: 'Country' },
    { key: 'theatres', label: 'Theatres' },
    { key: 'status', label: 'Status' },
    { key: 'actions', label: '', align: 'right' }
  ];

  return (
    <div>
      <AdminHeader
        title="Locations"
        description="Cities customers can browse and book in."
        actions={<CreateButton label="Add location" onClick={() => setEditing({ ...EMPTY })} />}
      >
        <FilterBar>
          <SearchInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search cities or states"
            className="w-full sm:w-72"
            aria-label="Search locations"
          />
          <span className="text-2xs text-ink-500 tabular ml-auto">
            {loading ? '—' : `${locations.length} location${locations.length === 1 ? '' : 's'}`}
          </span>
        </FilterBar>
      </AdminHeader>

      <ResourceTable
        columns={columns}
        rows={locations}
        loading={loading}
        error={error}
        onRetry={refetch}
        rowKey={(row) => row.location_id}
        emptyTitle={search ? 'No cities match that search' : 'No locations yet'}
        emptyMessage={
          search
            ? 'Try a different spelling or clear the search.'
            : 'Add a city before creating theatres — every theatre belongs to one.'
        }
        emptyAction={!search && <Button onClick={() => setEditing({ ...EMPTY })}>Add your first city</Button>}
        renderRow={(row, key) => (
          <tr key={key}>
            <td>
              <span className="flex items-center gap-2 font-semibold text-ink-50">
                <MapPin className="w-3.5 h-3.5 text-brand-500 shrink-0" aria-hidden />
                {row.city}
              </span>
            </td>
            <td className="text-ink-300">{row.state}</td>
            <td className="text-ink-400">{row.country}</td>
            <td className="tabular text-ink-300">{row.theatre_count}</td>
            <td><StatusPill active={!!row.is_active} /></td>
            <td>
              <RowActions>
                <IconButton icon={Pencil} label={`Edit ${row.city}`} onClick={() => setEditing(row)} />
                <IconButton
                  icon={Trash2}
                  label={`Remove ${row.city}`}
                  tone="danger"
                  onClick={() => setDeleting(row)}
                />
              </RowActions>
            </td>
          </tr>
        )}
      />

      <LocationForm
        location={editing}
        onClose={() => setEditing(null)}
        onSave={save}
        busy={busy}
      />

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        loading={busy}
        title={`Remove ${deleting?.city}?`}
        confirmLabel="Remove"
        message={
          Number(deleting?.theatre_count) > 0
            ? `${deleting.city} has ${deleting.theatre_count} theatre(s). It will be disabled rather than deleted, so existing bookings stay intact.`
            : `${deleting?.city} will be permanently deleted. This cannot be undone.`
        }
      />
    </div>
  );
}

function LocationForm({ location, onClose, onSave, busy }) {
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});

  // Reset the form whenever a different record is opened.
  React.useEffect(() => {
    if (location) {
      setForm({
        city: location.city || '',
        state: location.state || '',
        country: location.country || 'India',
        is_active: location.is_active === undefined ? true : !!location.is_active
      });
      setErrors({});
    }
  }, [location]);

  const submit = (e) => {
    e.preventDefault();
    const next = {};
    if (form.city.trim().length < 2) next.city = 'Enter a city name.';
    if (form.state.trim().length < 2) next.state = 'Enter a state.';
    setErrors(next);
    if (Object.keys(next).length) return;

    onSave({
      city: form.city.trim(),
      state: form.state.trim(),
      country: form.country.trim() || 'India',
      is_active: form.is_active
    });
  };

  return (
    <Modal
      open={!!location}
      onClose={onClose}
      title={location?.location_id ? `Edit ${location.city}` : 'Add a location'}
      description="Customers pick a city first — it scopes everything they see."
      size="sm"
      footer={(
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={submit} loading={busy}>Save</Button>
        </>
      )}
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="City" required error={errors.city}>
          <Input
            value={form.city}
            onChange={(e) => setForm({ ...form, city: e.target.value })}
            placeholder="Hyderabad"
            autoFocus
          />
        </Field>
        <Field label="State" required error={errors.state}>
          <Input
            value={form.state}
            onChange={(e) => setForm({ ...form, state: e.target.value })}
            placeholder="Telangana"
          />
        </Field>
        <Field label="Country">
          <Input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} />
        </Field>
        <Checkbox
          label="Available to customers"
          checked={form.is_active}
          onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
        />
      </form>
    </Modal>
  );
}
