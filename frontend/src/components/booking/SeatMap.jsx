import React, { useMemo } from 'react';
import { formatCurrency } from '../../lib/format';
import { cx } from '../ui';

/**
 * Cinema seat map.
 *
 * Seat state is whatever the server says it is — this component never infers
 * availability locally. `selected` is purely a client-side intent layer on
 * top of AVAILABLE/HELD_BY_ME seats and is reconciled on every poll.
 */
const SEAT_STATE = {
  AVAILABLE: {
    className: 'bg-ink-800 border-ink-600 text-ink-300 hover:border-brand-400 hover:bg-brand-500/15 hover:text-ink-50',
    label: 'Available',
    disabled: false
  },
  HELD_BY_ME: {
    className: 'bg-brand-500/25 border-brand-500/60 text-brand-200',
    label: 'Held by you',
    disabled: false
  },
  LOCKED: {
    className: 'bg-caution-500/12 border-caution-500/40 text-caution-400/70 cursor-not-allowed',
    label: 'Being booked by someone else',
    disabled: true
  },
  BOOKED: {
    className: 'bg-ink-900 border-ink-800 text-ink-600 cursor-not-allowed',
    label: 'Already booked',
    disabled: true
  }
};

const CATEGORY_ORDER = ['Recliner', 'Platinum', 'Gold', 'Silver'];

export function SeatMap({ seatMap = [], selectedIds = new Set(), onToggle, maxSeats = 10 }) {
  // Group rows and preserve the layout order the API returned.
  const rows = useMemo(() => {
    const map = new Map();
    for (const seat of seatMap) {
      if (!map.has(seat.seat_row)) map.set(seat.seat_row, []);
      map.get(seat.seat_row).push(seat);
    }
    return [...map.entries()].map(([row, seats]) => ({
      row,
      seatType: seats[0]?.seat_type,
      price: seats[0]?.price,
      seats: [...seats].sort((a, b) => a.seat_number - b.seat_number)
    }));
  }, [seatMap]);

  // Group consecutive rows sharing a category so the price band is labelled once.
  const bands = useMemo(() => {
    const out = [];
    for (const row of rows) {
      const last = out[out.length - 1];
      if (last && last.seatType === row.seatType && last.price === row.price) last.rows.push(row);
      else out.push({ seatType: row.seatType, price: row.price, rows: [row] });
    }
    return out.sort(
      (a, b) => CATEGORY_ORDER.indexOf(a.seatType) - CATEGORY_ORDER.indexOf(b.seatType)
    );
  }, [rows]);

  const atLimit = selectedIds.size >= maxSeats;
  const widestRow = Math.max(...rows.map((r) => r.seats.length), 0);

  return (
    <div className="w-full">
      {/* Screen */}
      <div className="flex flex-col items-center mb-9">
        <div
          className="w-full max-w-lg h-2 rounded-b-[100%] bg-gradient-to-r
                     from-transparent via-brand-500 to-transparent
                     shadow-[0_8px_40px_rgba(255,59,92,0.45)]"
          aria-hidden
        />
        <p className="text-2xs uppercase tracking-[0.28em] text-ink-500 mt-3 font-semibold">
          All eyes this way
        </p>
      </div>

      {/* Seats */}
      <div className="overflow-x-auto no-scrollbar pb-3">
        <div className="min-w-fit mx-auto space-y-6">
          {bands.map((band) => (
            <div key={`${band.seatType}-${band.price}`}>
              <div className="flex items-center gap-3 mb-2.5 px-1">
                <span className="text-2xs font-bold uppercase tracking-wider text-ink-400">
                  {band.seatType}
                </span>
                <span className="text-2xs font-semibold text-ink-300 tabular">
                  {formatCurrency(band.price)}
                </span>
                <span className="flex-1 h-px bg-ink-800" aria-hidden />
              </div>

              <div className="space-y-2">
                {band.rows.map((row) => (
                  <div key={row.row} className="flex items-center gap-3 justify-center">
                    <span className="w-5 shrink-0 text-2xs font-bold text-ink-500 text-center tabular">
                      {row.row}
                    </span>

                    <div className="flex gap-1.5">
                      {row.seats.map((seat, index) => {
                        const isSelected = selectedIds.has(seat.seat_id);
                        const state = SEAT_STATE[seat.status] || SEAT_STATE.AVAILABLE;
                        // A selectable seat that would exceed the cap is
                        // disabled rather than silently ignored on click.
                        const blockedByLimit = !isSelected && atLimit && !state.disabled;
                        const disabled = state.disabled || blockedByLimit;

                        // Aisle gap in the middle of wide rows.
                        const aisleAfter =
                          row.seats.length >= 10 && index === Math.floor(row.seats.length / 2) - 1;

                        return (
                          <React.Fragment key={seat.seat_id}>
                            <button
                              type="button"
                              disabled={disabled}
                              onClick={() => onToggle(seat)}
                              aria-pressed={isSelected}
                              aria-label={`Seat ${seat.label}, ${seat.seat_type}, ${formatCurrency(seat.price)}, ${
                                isSelected ? 'selected' : state.label
                              }`}
                              title={`${seat.label} · ${seat.seat_type} · ${formatCurrency(seat.price)}`}
                              className={cx(
                                'w-7 h-7 sm:w-8 sm:h-8 rounded-md rounded-b-lg border text-[10px] font-bold',
                                'transition-all duration-150 ease-smooth flex items-center justify-center',
                                'disabled:cursor-not-allowed',
                                isSelected
                                  ? 'bg-brand-500 border-brand-400 text-white scale-110 shadow-brand-sm z-10'
                                  : state.className,
                                blockedByLimit && 'opacity-40'
                              )}
                            >
                              {seat.seat_number}
                            </button>
                            {aisleAfter && <span className="w-5 sm:w-7" aria-hidden />}
                          </React.Fragment>
                        );
                      })}
                    </div>

                    <span className="w-5 shrink-0" aria-hidden />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3 mt-10 pt-6 border-t border-ink-800">
        {[
          { className: 'bg-ink-800 border-ink-600', label: 'Available' },
          { className: 'bg-brand-500 border-brand-400', label: 'Selected' },
          { className: 'bg-caution-500/20 border-caution-500/40', label: 'Held by others' },
          { className: 'bg-ink-900 border-ink-800', label: 'Booked' }
        ].map((item) => (
          <span key={item.label} className="flex items-center gap-2 text-2xs text-ink-400">
            <span className={cx('w-4 h-4 rounded border rounded-b-md', item.className)} aria-hidden />
            {item.label}
          </span>
        ))}
      </div>

      {widestRow === 0 && (
        <p className="text-center text-sm text-ink-400 py-8">
          No seats have been configured for this screen yet.
        </p>
      )}
    </div>
  );
}
