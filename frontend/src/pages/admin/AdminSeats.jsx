import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Armchair, Plus, Trash2, Wand2, Save } from 'lucide-react';
import { api } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import {
  Button, Select, Input, Modal, EmptyState, Skeleton, ErrorState, useAsync, cx
} from '../../components/ui';
import { AdminHeader, FilterBar } from '../../components/admin/AdminShell';

const SEAT_TYPES = ['Recliner', 'Platinum', 'Gold', 'Silver'];

const TYPE_STYLES = {
  Recliner: 'bg-brand-500/20 border-brand-500/45 text-brand-300',
  Platinum: 'bg-info-500/18 border-info-500/40 text-info-400',
  Gold: 'bg-caution-500/18 border-caution-500/40 text-caution-400',
  Silver: 'bg-ink-800 border-ink-600 text-ink-300'
};

/** Layout presets an admin is likely to want, front row first. */
const PRESETS = {
  standard: {
    label: 'Standard (96 seats)',
    rows: [
      { seat_type: 'Platinum', count: 12 }, { seat_type: 'Platinum', count: 12 },
      { seat_type: 'Gold', count: 12 }, { seat_type: 'Gold', count: 12 }, { seat_type: 'Gold', count: 12 },
      { seat_type: 'Silver', count: 12 }, { seat_type: 'Silver', count: 12 }, { seat_type: 'Silver', count: 12 }
    ]
  },
  large: {
    label: 'Large / IMAX (160 seats)',
    rows: [
      { seat_type: 'Platinum', count: 16 }, { seat_type: 'Platinum', count: 16 }, { seat_type: 'Platinum', count: 16 },
      { seat_type: 'Gold', count: 16 }, { seat_type: 'Gold', count: 16 }, { seat_type: 'Gold', count: 16 },
      { seat_type: 'Gold', count: 16 },
      { seat_type: 'Silver', count: 16 }, { seat_type: 'Silver', count: 16 }, { seat_type: 'Silver', count: 16 }
    ]
  },
  recliner: {
    label: 'Recliner lounge (40 seats)',
    rows: [
      { seat_type: 'Recliner', count: 8 }, { seat_type: 'Recliner', count: 8 },
      { seat_type: 'Platinum', count: 8 }, { seat_type: 'Platinum', count: 8 },
      { seat_type: 'Gold', count: 8 }
    ]
  }
};

export function AdminSeats() {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const screenId = params.get('screenId') || '';

  const [generatorOpen, setGeneratorOpen] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [bulkType, setBulkType] = useState('Gold');
  const [busy, setBusy] = useState(false);

  const { data: screenData } = useAsync(() => api.get('/admin/screens'));
  const screens = screenData?.screens || [];

  const { data, loading, error, refetch } = useAsync(
    () => (screenId ? api.get(`/admin/screens/${screenId}/seats`) : Promise.resolve(null)),
    [screenId]
  );

  // Clear the selection whenever the screen changes — seat ids are not shared.
  useEffect(() => { setSelected(new Set()); }, [screenId]);

  // Memoised on `data`, not on a `data?.layout || []` expression: the fallback
  // literal is a fresh array every render and would defeat the memo entirely.
  const layout = useMemo(() => data?.layout || [], [data]);
  const screen = data?.screen;

  const typeCounts = useMemo(() => {
    const counts = {};
    for (const row of layout) {
      counts[row.seat_type] = (counts[row.seat_type] || 0) + row.seats.length;
    }
    return counts;
  }, [layout]);

  const toggleSeat = (seatId) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(seatId)) next.delete(seatId);
      else next.add(seatId);
      return next;
    });
  };

  const toggleRow = (row) => {
    setSelected((prev) => {
      const next = new Set(prev);
      const ids = row.seats.map((s) => s.seat_id);
      const allSelected = ids.every((id) => next.has(id));
      ids.forEach((id) => (allSelected ? next.delete(id) : next.add(id)));
      return next;
    });
  };

  const applyBulk = async () => {
    setBusy(true);
    try {
      const res = await api.put(`/admin/screens/${screenId}/seats/bulk`, {
        seat_ids: [...selected],
        seat_type: bulkType
      });
      toast.success(res.message);
      setSelected(new Set());
      await refetch();
    } catch (err) {
      toast.error(err.message || 'Could not update those seats.');
    } finally {
      setBusy(false);
    }
  };

  const generate = async (rows) => {
    setBusy(true);
    try {
      const res = await api.post(`/admin/screens/${screenId}/seats/generate`, { rows, replace: true });
      toast.success(res.message);
      setGeneratorOpen(false);
      await refetch();
    } catch (err) {
      toast.error(err.message || 'Could not generate that layout.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <AdminHeader
        title="Seats"
        description="Configure the seat map for each screen. Capacity updates automatically."
        actions={
          screenId && (
            <Button icon={Wand2} onClick={() => setGeneratorOpen(true)}>
              {layout.length ? 'Regenerate layout' : 'Generate layout'}
            </Button>
          )
        }
      >
        <FilterBar>
          <Select
            value={screenId}
            onChange={(e) => setParams(e.target.value ? { screenId: e.target.value } : {})}
            className="!w-auto min-w-[18rem] !py-2 text-xs"
            aria-label="Choose a screen"
          >
            <option value="">Choose a screen…</option>
            {screens.map((s) => (
              <option key={s.screen_id} value={s.screen_id}>
                {s.theater_name} — {s.name || `Screen ${s.screen_number}`} ({s.total_seats} seats)
              </option>
            ))}
          </Select>

          {selected.size > 0 && (
            <div className="flex items-center gap-2 ml-auto">
              <span className="text-2xs text-ink-400 tabular">{selected.size} selected</span>
              <Select
                value={bulkType}
                onChange={(e) => setBulkType(e.target.value)}
                className="!w-auto !py-2 text-xs"
                aria-label="Seat category to apply"
              >
                {SEAT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </Select>
              <Button size="sm" icon={Save} loading={busy} onClick={applyBulk}>Apply</Button>
              <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
            </div>
          )}
        </FilterBar>
      </AdminHeader>

      {!screenId ? (
        <div className="surface">
          <EmptyState
            icon={Armchair}
            title="Pick a screen to edit its seats"
            message="Choose a screen above to view, generate or reclassify its seat map."
          />
        </div>
      ) : loading ? (
        <Skeleton className="h-96 rounded-2xl" />
      ) : error ? (
        <ErrorState message={error.message} onRetry={refetch} />
      ) : layout.length === 0 ? (
        <div className="surface">
          <EmptyState
            icon={Armchair}
            title="No seats configured"
            message="This screen has no seat map yet, so no shows can be scheduled on it."
            action={<Button icon={Wand2} onClick={() => setGeneratorOpen(true)}>Generate a layout</Button>}
          />
        </div>
      ) : (
        <div className="surface p-5 sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
            <div>
              <h2 className="font-bold text-ink-50">
                {screen.theater_name} · {screen.name || `Screen ${screen.screen_number}`}
              </h2>
              <p className="text-xs text-ink-400 mt-0.5 tabular">
                {data.totalSeats} seats ·{' '}
                {SEAT_TYPES.filter((t) => typeCounts[t]).map((t) => `${typeCounts[t]} ${t}`).join(' · ')}
              </p>
            </div>
            <p className="text-2xs text-ink-500">Click a seat, or a row letter, to select. Then apply a category.</p>
          </div>

          <div className="flex flex-col items-center mb-8">
            <div className="w-full max-w-md h-1.5 rounded-b-[100%] bg-gradient-to-r from-transparent via-brand-500 to-transparent" aria-hidden />
            <p className="text-2xs uppercase tracking-[0.25em] text-ink-500 mt-2.5 font-semibold">Screen</p>
          </div>

          <div className="overflow-x-auto no-scrollbar">
            <div className="min-w-fit mx-auto space-y-2">
              {layout.map((row) => {
                const allSelected = row.seats.every((s) => selected.has(s.seat_id));
                return (
                  <div key={row.row} className="flex items-center gap-3 justify-center">
                    <button
                      onClick={() => toggleRow(row)}
                      className={cx(
                        'w-7 h-7 rounded-md text-2xs font-bold transition-colors shrink-0',
                        allSelected ? 'bg-brand-500 text-white' : 'text-ink-500 hover:bg-ink-800'
                      )}
                      aria-label={`Select all seats in row ${row.row}`}
                    >
                      {row.row}
                    </button>

                    <div className="flex gap-1.5">
                      {row.seats.map((seat) => {
                        const isSelected = selected.has(seat.seat_id);
                        return (
                          <button
                            key={seat.seat_id}
                            onClick={() => toggleSeat(seat.seat_id)}
                            aria-pressed={isSelected}
                            title={`${seat.seat_row}${seat.seat_number} · ${seat.seat_type}`}
                            className={cx(
                              'w-7 h-7 rounded-md rounded-b-lg border text-[10px] font-bold transition-all duration-150',
                              isSelected
                                ? 'bg-brand-500 border-brand-400 text-white scale-110 z-10'
                                : TYPE_STYLES[seat.seat_type],
                              !seat.is_active && 'opacity-40 line-through'
                            )}
                          >
                            {seat.seat_number}
                          </button>
                        );
                      })}
                    </div>

                    <span className="w-7 shrink-0" aria-hidden />
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-5 mt-8 pt-6 border-t border-ink-800">
            {SEAT_TYPES.map((type) => (
              <span key={type} className="flex items-center gap-2 text-2xs text-ink-400">
                <span className={cx('w-4 h-4 rounded border rounded-b-md', TYPE_STYLES[type])} aria-hidden />
                {type} {typeCounts[type] ? `(${typeCounts[type]})` : ''}
              </span>
            ))}
          </div>
        </div>
      )}

      <LayoutGenerator
        open={generatorOpen}
        onClose={() => setGeneratorOpen(false)}
        onGenerate={generate}
        busy={busy}
        hasExisting={layout.length > 0}
      />
    </div>
  );
}

function LayoutGenerator({ open, onClose, onGenerate, busy, hasExisting }) {
  const [rows, setRows] = useState(PRESETS.standard.rows);

  useEffect(() => { if (open) setRows(PRESETS.standard.rows); }, [open]);

  const total = rows.reduce((sum, r) => sum + Number(r.count || 0), 0);

  const updateRow = (index, patch) => {
    setRows((current) => current.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  };

  const addRow = () => setRows((current) => [...current, { seat_type: 'Silver', count: 12 }]);
  const removeRow = (index) => setRows((current) => current.filter((_, i) => i !== index));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Generate seat layout"
      description="Rows are lettered automatically from the screen backwards."
      size="md"
      footer={(
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={() => onGenerate(rows)} loading={busy} disabled={total === 0}>
            Generate {total} seats
          </Button>
        </>
      )}
    >
      <div className="space-y-5">
        {hasExisting && (
          <div className="rounded-xl border border-caution-500/40 bg-caution-500/10 p-3.5 text-xs text-caution-400">
            This replaces the existing seat map. It is refused outright if any
            tickets have already been sold for this screen.
          </div>
        )}

        <div>
          <p className="label">Start from a preset</p>
          <div className="grid sm:grid-cols-3 gap-2">
            {Object.entries(PRESETS).map(([key, preset]) => (
              <button
                key={key}
                onClick={() => setRows(preset.rows)}
                className="p-3 rounded-xl border border-ink-700 bg-ink-800/60 hover:border-brand-500
                           text-left text-xs transition-colors"
              >
                <span className="block font-semibold text-ink-100">{preset.label.split(' (')[0]}</span>
                <span className="block text-2xs text-ink-500 mt-0.5">
                  {preset.rows.reduce((s, r) => s + r.count, 0)} seats · {preset.rows.length} rows
                </span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="label !mb-0">Rows (front to back)</p>
            <span className="text-2xs text-ink-500 tabular">{total} seats total</span>
          </div>

          <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
            {rows.map((row, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="w-7 text-center text-xs font-bold text-ink-500 shrink-0">
                  {String.fromCharCode(65 + i)}
                </span>
                <Select
                  value={row.seat_type}
                  onChange={(e) => updateRow(i, { seat_type: e.target.value })}
                  className="!py-2 text-xs flex-1"
                  aria-label={`Row ${String.fromCharCode(65 + i)} category`}
                >
                  {SEAT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </Select>
                <Input
                  type="number"
                  min="1"
                  max="40"
                  value={row.count}
                  onChange={(e) => updateRow(i, { count: Number(e.target.value) })}
                  className="!py-2 !w-20 text-xs tabular"
                  aria-label={`Row ${String.fromCharCode(65 + i)} seat count`}
                />
                <button
                  onClick={() => removeRow(i)}
                  disabled={rows.length === 1}
                  className="p-2 rounded-lg text-ink-400 hover:text-negative-400 hover:bg-negative-500/10
                             disabled:opacity-30 shrink-0"
                  aria-label={`Remove row ${String.fromCharCode(65 + i)}`}
                >
                  <Trash2 className="w-4 h-4" aria-hidden />
                </button>
              </div>
            ))}
          </div>

          <Button
            variant="ghost"
            size="sm"
            icon={Plus}
            onClick={addRow}
            className="mt-2"
            disabled={rows.length >= 26}
          >
            Add row
          </Button>
        </div>
      </div>
    </Modal>
  );
}
