import { useState } from 'react';
import { XCircle } from 'lucide-react';
import { api, buildQuery } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import { formatCurrency, formatDate, formatTime, bookingStatusMeta } from '../../lib/format';
import {
  Select, Input, SearchInput, Pagination, ConfirmDialog, useDebounced, useAsync
} from '../../components/ui';
import {
  AdminHeader, ResourceTable, RowActions, IconButton, FilterBar
} from '../../components/admin/AdminShell';

const STATUSES = [
  'Confirmed', 'Pending', 'PaymentProcessing', 'PaymentFailed', 'Cancelled', 'Refunded', 'Expired'
];

export function AdminBookings() {
  const toast = useToast();

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebounced(search, 300);

  const [cancelling, setCancelling] = useState(null);
  const [busy, setBusy] = useState(false);

  const { data, loading, error, refetch } = useAsync(
    () => api.get(`/admin/bookings${buildQuery({ search: debouncedSearch, status, from, to, page, limit: 25 })}`),
    [debouncedSearch, status, from, to, page]
  );

  const bookings = data?.bookings || [];
  const pagination = data?.pagination || {};

  // A filter change invalidates the current page number.
  const resetAnd = (setter) => (value) => { setter(value); setPage(1); };

  const confirmCancel = async () => {
    setBusy(true);
    try {
      const res = await api.post(`/bookings/${cancelling.booking_id}/cancel`);
      toast.success(res.message || 'Booking cancelled.');
      setCancelling(null);
      await refetch();
    } catch (err) {
      toast.error(err.message || 'Could not cancel that booking.');
    } finally {
      setBusy(false);
    }
  };

  const columns = [
    { key: 'ref', label: 'Reference' },
    { key: 'customer', label: 'Customer' },
    { key: 'movie', label: 'Movie' },
    { key: 'show', label: 'Showtime' },
    { key: 'seats', label: 'Seats' },
    { key: 'amount', label: 'Amount', align: 'right' },
    { key: 'status', label: 'Status' },
    { key: 'actions', label: '', align: 'right' }
  ];

  return (
    <div>
      <AdminHeader
        title="Bookings"
        description="Every booking across the platform, with the seats and money attached."
      >
        <FilterBar>
          <SearchInput
            value={search}
            onChange={(e) => resetAnd(setSearch)(e.target.value)}
            placeholder="Reference, customer or movie"
            className="w-full sm:w-64"
            aria-label="Search bookings"
          />
          <Select
            value={status}
            onChange={(e) => resetAnd(setStatus)(e.target.value)}
            className="!w-auto min-w-[9rem] !py-2 text-xs"
            aria-label="Filter by status"
          >
            <option value="">All statuses</option>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
          <div className="flex items-center gap-2">
            <Input
              type="date"
              value={from}
              onChange={(e) => resetAnd(setFrom)(e.target.value)}
              className="!w-auto !py-2 text-xs"
              aria-label="Booked from"
            />
            <span className="text-2xs text-ink-500">to</span>
            <Input
              type="date"
              value={to}
              onChange={(e) => resetAnd(setTo)(e.target.value)}
              className="!w-auto !py-2 text-xs"
              aria-label="Booked to"
            />
          </div>
          {(search || status || from || to) && (
            <button
              onClick={() => { setSearch(''); setStatus(''); setFrom(''); setTo(''); setPage(1); }}
              className="text-2xs font-semibold text-ink-400 hover:text-brand-400 ml-auto"
            >
              Clear filters
            </button>
          )}
        </FilterBar>
      </AdminHeader>

      <ResourceTable
        columns={columns}
        rows={bookings}
        loading={loading}
        error={error}
        onRetry={refetch}
        rowKey={(row) => row.booking_id}
        emptyTitle="No bookings match those filters"
        emptyMessage="Try widening the date range or clearing the search."
        renderRow={(row, key) => {
          const meta = bookingStatusMeta(row.status);
          const canCancel = !['Cancelled', 'Refunded', 'Expired'].includes(row.status);
          return (
            <tr key={key}>
              <td className="font-mono text-xs text-brand-400 whitespace-nowrap">{row.booking_ref}</td>
              <td>
                <span className="block text-ink-100 truncate max-w-[11rem]">{row.customer_name}</span>
                <span className="block text-2xs text-ink-500 truncate max-w-[11rem]">{row.customer_email}</span>
              </td>
              <td className="text-ink-300 truncate max-w-[11rem]">{row.movie_title}</td>
              <td className="text-ink-400 text-xs whitespace-nowrap tabular">
                <span className="block">{formatDate(row.show_time)}</span>
                <span className="block text-2xs">{formatTime(row.show_time)} · {row.theater_name}</span>
              </td>
              <td className="tabular text-xs text-ink-300 max-w-[9rem] truncate">
                {row.seats?.map((s) => s.label).join(', ') || '—'}
              </td>
              <td className="text-right tabular font-semibold text-ink-100">
                {formatCurrency(row.total_amount)}
              </td>
              <td><span className={meta.className}>{meta.label}</span></td>
              <td>
                <RowActions>
                  <IconButton
                    icon={XCircle}
                    label="Cancel booking"
                    tone="danger"
                    disabled={!canCancel}
                    onClick={() => setCancelling(row)}
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
        open={!!cancelling}
        onClose={() => setCancelling(null)}
        onConfirm={confirmCancel}
        loading={busy}
        title={`Cancel ${cancelling?.booking_ref}?`}
        confirmLabel="Cancel booking"
        message={
          cancelling
            ? `${cancelling.customer_name}'s seats for ${cancelling.movie_title} will be released and, if paid, a refund initiated.`
            : ''
        }
      />
    </div>
  );
}
