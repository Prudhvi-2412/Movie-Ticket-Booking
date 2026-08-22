import { useState } from 'react';
import { ShieldCheck, ShieldOff, UserCheck, UserX } from 'lucide-react';
import { api, buildQuery } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { formatCurrency, formatDate, initials } from '../../lib/format';
import {
  Select, SearchInput, Pagination, ConfirmDialog, useDebounced, useAsync
} from '../../components/ui';
import {
  AdminHeader, ResourceTable, StatusPill, RowActions, IconButton, FilterBar
} from '../../components/admin/AdminShell';

export function AdminUsers() {
  const toast = useToast();
  const { user: currentUser } = useAuth();

  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebounced(search, 300);

  const [confirming, setConfirming] = useState(null);
  const [busy, setBusy] = useState(false);

  const { data, loading, error, refetch } = useAsync(
    () => api.get(`/admin/users${buildQuery({ search: debouncedSearch, role, page, limit: 25 })}`),
    [debouncedSearch, role, page]
  );

  const users = data?.users || [];
  const pagination = data?.pagination || {};

  const runAction = async () => {
    setBusy(true);
    try {
      const { user, type } = confirming;
      if (type === 'role') {
        const nextRole = user.role === 'Admin' ? 'Customer' : 'Admin';
        const res = await api.put(`/admin/users/${user.user_id}/role`, { role: nextRole });
        toast.success(res.message);
      } else {
        const res = await api.put(`/admin/users/${user.user_id}/status`, { is_active: !user.is_active });
        toast.success(res.message);
      }
      setConfirming(null);
      await refetch();
    } catch (err) {
      toast.error(err.message || 'Could not update that account.');
    } finally {
      setBusy(false);
    }
  };

  const columns = [
    { key: 'user', label: 'User' },
    { key: 'role', label: 'Role' },
    { key: 'bookings', label: 'Bookings' },
    { key: 'value', label: 'Lifetime value', align: 'right' },
    { key: 'joined', label: 'Joined' },
    { key: 'status', label: 'Status' },
    { key: 'actions', label: '', align: 'right' }
  ];

  const dialogCopy = () => {
    if (!confirming) return { title: '', message: '' };
    const { user, type } = confirming;
    if (type === 'role') {
      return user.role === 'Admin'
        ? {
          title: `Remove admin access from ${user.full_name}?`,
          message: 'They will lose access to the admin console and be signed out of every device.'
        }
        : {
          title: `Make ${user.full_name} an administrator?`,
          message: 'They will gain full control over the catalogue, pricing and every booking.'
        };
    }
    return user.is_active
      ? {
        title: `Deactivate ${user.full_name}?`,
        message: 'They will be signed out and unable to sign in again. Existing bookings are unaffected.'
      }
      : {
        title: `Reactivate ${user.full_name}?`,
        message: 'They will be able to sign in and book again.'
      };
  };

  const copy = dialogCopy();

  return (
    <div>
      <AdminHeader title="Users" description="Customer accounts and administrator access.">
        <FilterBar>
          <SearchInput
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search by name or email"
            className="w-full sm:w-64"
            aria-label="Search users"
          />
          <Select
            value={role}
            onChange={(e) => { setRole(e.target.value); setPage(1); }}
            className="!w-auto min-w-[9rem] !py-2 text-xs"
            aria-label="Filter by role"
          >
            <option value="">All roles</option>
            <option value="Customer">Customers</option>
            <option value="Admin">Administrators</option>
          </Select>
          <span className="text-2xs text-ink-500 tabular ml-auto">
            {loading ? '—' : `${pagination.total ?? users.length} user${pagination.total === 1 ? '' : 's'}`}
          </span>
        </FilterBar>
      </AdminHeader>

      <ResourceTable
        columns={columns}
        rows={users}
        loading={loading}
        error={error}
        onRetry={refetch}
        rowKey={(row) => row.user_id}
        emptyTitle="No users match those filters"
        emptyMessage="Try a different search or clear the role filter."
        renderRow={(row, key) => {
          const isSelf = row.user_id === currentUser?.user_id;
          return (
            <tr key={key} className={!row.is_active ? 'opacity-60' : undefined}>
              <td>
                <span className="flex items-center gap-2.5">
                  <span className="w-8 h-8 rounded-lg bg-ink-800 border border-ink-700 grid place-items-center
                                   text-2xs font-bold text-ink-300 shrink-0">
                    {initials(row.full_name)}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-ink-100 truncate max-w-[12rem]">
                      {row.full_name}
                      {isSelf && <span className="text-2xs text-ink-500 ml-1.5">(you)</span>}
                    </span>
                    <span className="block text-2xs text-ink-500 truncate max-w-[12rem]">{row.email}</span>
                  </span>
                </span>
              </td>
              <td>
                <span className={row.role === 'Admin' ? 'badge-brand' : 'badge-neutral'}>{row.role}</span>
              </td>
              <td className="tabular text-ink-300">{row.booking_count}</td>
              <td className="text-right tabular text-ink-200">{formatCurrency(row.lifetime_value)}</td>
              <td className="text-ink-400 text-xs tabular whitespace-nowrap">{formatDate(row.created_at)}</td>
              <td><StatusPill active={!!row.is_active} inactiveLabel="Deactivated" /></td>
              <td>
                <RowActions>
                  <IconButton
                    icon={row.role === 'Admin' ? ShieldOff : ShieldCheck}
                    label={row.role === 'Admin' ? 'Remove admin access' : 'Grant admin access'}
                    disabled={isSelf}
                    onClick={() => setConfirming({ user: row, type: 'role' })}
                  />
                  <IconButton
                    icon={row.is_active ? UserX : UserCheck}
                    label={row.is_active ? 'Deactivate account' : 'Reactivate account'}
                    tone={row.is_active ? 'danger' : 'neutral'}
                    disabled={isSelf}
                    onClick={() => setConfirming({ user: row, type: 'status' })}
                  />
                </RowActions>
              </td>
            </tr>
          );
        }}
      />

      <Pagination
        page={pagination.page || 1}
        pages={pagination.pages}
        total={pagination.total}
        onChange={setPage}
        className="mt-4"
      />

      <ConfirmDialog
        open={!!confirming}
        onClose={() => setConfirming(null)}
        onConfirm={runAction}
        loading={busy}
        title={copy.title}
        message={copy.message}
        confirmLabel="Confirm"
        variant={confirming?.type === 'status' && confirming?.user?.is_active ? 'danger' : 'primary'}
      />
    </div>
  );
}
