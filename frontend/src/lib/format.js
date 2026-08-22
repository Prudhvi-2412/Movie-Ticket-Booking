/**
 * Formatting helpers.
 *
 * Datetimes arrive from the API as ISO-8601 UTC strings and are rendered in
 * the viewer's local zone. Everything date-related goes through here so a
 * showtime is never formatted two different ways on two different screens.
 */

const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0
});

const inrPrecise = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

export const formatCurrency = (value, { precise = false } = {}) => {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return '₹0';
  // Show paise only when there actually are any.
  return precise || n % 1 !== 0 ? inrPrecise.format(n) : inr.format(n);
};

export const formatCompactNumber = (value) =>
  new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 })
    .format(Number(value ?? 0));

export const formatNumber = (value) => new Intl.NumberFormat('en-IN').format(Number(value ?? 0));

const toDate = (value) => (value instanceof Date ? value : new Date(value));

export const formatTime = (value) =>
  toDate(value).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });

export const formatDate = (value) =>
  toDate(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

export const formatDateShort = (value) =>
  toDate(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

export const formatDateTime = (value) => `${formatDate(value)}, ${formatTime(value)}`;

export const formatWeekday = (value) =>
  toDate(value).toLocaleDateString('en-IN', { weekday: 'short' });

/** "2h 28m" from a minute count. */
export const formatDuration = (minutes) => {
  const total = Number(minutes ?? 0);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h ? `${h}h${m ? ` ${m}m` : ''}` : `${m}m`;
};

/** "09:42" — used for the seat-hold countdown. */
export const formatCountdown = (totalSeconds) => {
  const s = Math.max(0, Math.floor(totalSeconds ?? 0));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

export const formatRelative = (value) => {
  const diffMs = toDate(value).getTime() - Date.now();
  const abs = Math.abs(diffMs);
  const rtf = new Intl.RelativeTimeFormat('en-IN', { numeric: 'auto' });

  const units = [
    ['day', 86_400_000],
    ['hour', 3_600_000],
    ['minute', 60_000]
  ];
  for (const [unit, ms] of units) {
    if (abs >= ms) return rtf.format(Math.round(diffMs / ms), unit);
  }
  return 'just now';
};

/** YYYY-MM-DD in local time — the format the API's `date` filters expect. */
export const toDateParam = (value) => {
  const d = toDate(value);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** The next `count` days starting today, for a date picker strip. */
export const upcomingDays = (count = 7) =>
  Array.from({ length: count }, (_, i) => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + i);
    return {
      date: d,
      param: toDateParam(d),
      weekday: i === 0 ? 'Today' : i === 1 ? 'Tom' : formatWeekday(d),
      day: d.getDate(),
      month: d.toLocaleDateString('en-IN', { month: 'short' })
    };
  });

export const initials = (name = '') =>
  name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '?';

/** Maps a booking status to the badge class and label used across the app. */
export const bookingStatusMeta = (status) => ({
  Confirmed: { className: 'badge-positive', label: 'Confirmed' },
  Pending: { className: 'badge-caution', label: 'Awaiting payment' },
  PaymentProcessing: { className: 'badge-caution', label: 'Processing' },
  PaymentSuccess: { className: 'badge-positive', label: 'Paid' },
  PaymentFailed: { className: 'badge-negative', label: 'Payment failed' },
  Cancelled: { className: 'badge-neutral', label: 'Cancelled' },
  Refunded: { className: 'badge-info', label: 'Refunded' },
  Expired: { className: 'badge-neutral', label: 'Expired' }
}[status] || { className: 'badge-neutral', label: status });

export const fillStatusMeta = (status) => ({
  'SOLD OUT': { className: 'text-negative-400', label: 'Sold out' },
  'ALMOST FULL': { className: 'text-caution-400', label: 'Almost full' },
  'FILLING FAST': { className: 'text-caution-400', label: 'Filling fast' },
  AVAILABLE: { className: 'text-positive-400', label: 'Available' }
}[status] || { className: 'text-ink-300', label: 'Available' });
