import { useId } from 'react';
import { cx } from '../ui';

/**
 * Hand-rolled SVG charts.
 *
 * A charting library would be several hundred KB for four small visuals, and
 * would arrive with its own theme to fight. These render from the same design
 * tokens as everything else and stay legible at any width.
 */

const BRAND = '#FF3B5C';
const EMBER = '#FF7A45';
const GRID = '#252A38';
const AXIS = '#6B7488';

/** Nice round upper bound so the axis labels are readable numbers. */
const niceMax = (max) => {
  if (max <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(max));
  return Math.ceil(max / magnitude) * magnitude;
};

export function LineChart({ data = [], xKey, yKey, height = 220, formatY = (v) => v, formatX = (v) => v, label }) {
  const gradientId = useId();

  if (data.length === 0) {
    return <ChartEmpty height={height} message="No data for this period yet." />;
  }

  const width = 640;
  const padding = { top: 16, right: 16, bottom: 28, left: 52 };
  const plotW = width - padding.left - padding.right;
  const plotH = height - padding.top - padding.bottom;

  const max = niceMax(Math.max(...data.map((d) => Number(d[yKey]) || 0)));
  // A single point has no span to divide by; place it in the middle.
  const xAt = (i) => padding.left + (data.length === 1 ? plotW / 2 : (i / (data.length - 1)) * plotW);
  const yAt = (v) => padding.top + plotH - (Number(v) / max) * plotH;

  const points = data.map((d, i) => [xAt(i), yAt(d[yKey])]);
  const linePath = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x},${y}`).join(' ');
  const areaPath = `${linePath} L${points[points.length - 1][0]},${padding.top + plotH} L${points[0][0]},${padding.top + plotH} Z`;

  const ticks = [0, 0.25, 0.5, 0.75, 1];
  // Thin the x labels so they never overlap on a narrow container.
  const labelEvery = Math.max(1, Math.ceil(data.length / 7));

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full h-auto"
      role="img"
      aria-label={label || 'Line chart'}
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={BRAND} stopOpacity="0.32" />
          <stop offset="100%" stopColor={BRAND} stopOpacity="0" />
        </linearGradient>
      </defs>

      {ticks.map((t) => {
        const y = padding.top + plotH - t * plotH;
        return (
          <g key={t}>
            <line x1={padding.left} y1={y} x2={width - padding.right} y2={y} stroke={GRID} strokeWidth="1" />
            <text x={padding.left - 8} y={y + 4} textAnchor="end" fontSize="10" fill={AXIS}>
              {formatY(Math.round(max * t))}
            </text>
          </g>
        );
      })}

      <path d={areaPath} fill={`url(#${gradientId})`} />
      <path d={linePath} fill="none" stroke={BRAND} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

      {points.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="3" fill={BRAND} stroke="#0E1016" strokeWidth="1.5">
          <title>{`${formatX(data[i][xKey])}: ${formatY(data[i][yKey])}`}</title>
        </circle>
      ))}

      {data.map((d, i) => (
        i % labelEvery === 0 ? (
          <text key={i} x={xAt(i)} y={height - 8} textAnchor="middle" fontSize="10" fill={AXIS}>
            {formatX(d[xKey])}
          </text>
        ) : null
      ))}
    </svg>
  );
}

export function BarChart({ data = [], xKey, yKey, height = 220, formatY = (v) => v, formatX = (v) => v, label, horizontal = false }) {
  if (data.length === 0) {
    return <ChartEmpty height={height} message="No data yet." />;
  }

  const max = niceMax(Math.max(...data.map((d) => Number(d[yKey]) || 0)));

  if (horizontal) {
    return (
      <ul className="space-y-3" aria-label={label}>
        {data.map((d, i) => {
          const value = Number(d[yKey]) || 0;
          const pct = (value / max) * 100;
          return (
            <li key={i}>
              <div className="flex items-baseline justify-between gap-3 mb-1.5">
                <span className="text-xs text-ink-200 truncate">{formatX(d[xKey])}</span>
                <span className="text-xs font-semibold text-ink-100 tabular shrink-0">{formatY(value)}</span>
              </div>
              <div className="h-2 rounded-full bg-ink-800 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-brand-500 to-ember-500 transition-all duration-700"
                  style={{ width: `${Math.max(pct, 1.5)}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    );
  }

  const width = 640;
  const padding = { top: 16, right: 16, bottom: 30, left: 52 };
  const plotW = width - padding.left - padding.right;
  const plotH = height - padding.top - padding.bottom;
  const slot = plotW / data.length;
  const barW = Math.min(slot * 0.6, 44);
  const labelEvery = Math.max(1, Math.ceil(data.length / 10));

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto" role="img" aria-label={label || 'Bar chart'}>
      {[0, 0.5, 1].map((t) => {
        const y = padding.top + plotH - t * plotH;
        return (
          <g key={t}>
            <line x1={padding.left} y1={y} x2={width - padding.right} y2={y} stroke={GRID} strokeWidth="1" />
            <text x={padding.left - 8} y={y + 4} textAnchor="end" fontSize="10" fill={AXIS}>
              {formatY(Math.round(max * t))}
            </text>
          </g>
        );
      })}

      {data.map((d, i) => {
        const value = Number(d[yKey]) || 0;
        const barH = (value / max) * plotH;
        const x = padding.left + i * slot + (slot - barW) / 2;
        const y = padding.top + plotH - barH;
        return (
          <g key={i}>
            <rect x={x} y={y} width={barW} height={Math.max(barH, 1)} rx="4" fill={BRAND} opacity="0.85">
              <title>{`${formatX(d[xKey])}: ${formatY(value)}`}</title>
            </rect>
            {i % labelEvery === 0 && (
              <text x={x + barW / 2} y={height - 8} textAnchor="middle" fontSize="10" fill={AXIS}>
                {formatX(d[xKey])}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

export function DonutChart({ data = [], height = 200, label, formatValue = (v) => v }) {
  const total = data.reduce((sum, d) => sum + Number(d.value || 0), 0);
  if (total === 0) return <ChartEmpty height={height} message="No data yet." />;

  const size = 160;
  const radius = 62;
  const stroke = 22;
  const circumference = 2 * Math.PI * radius;

  let offset = 0;
  const palette = [BRAND, EMBER, '#5B8DEF', '#22C782', '#FBBF24', '#9AA2B5'];

  return (
    <div className="flex flex-col sm:flex-row items-center gap-6" aria-label={label}>
      <svg viewBox={`0 0 ${size} ${size}`} className="w-40 h-40 shrink-0 -rotate-90" role="img">
        {data.map((d, i) => {
          const fraction = Number(d.value) / total;
          const dash = fraction * circumference;
          const segment = (
            <circle
              key={i}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={palette[i % palette.length]}
              strokeWidth={stroke}
              strokeDasharray={`${dash} ${circumference - dash}`}
              strokeDashoffset={-offset}
              strokeLinecap="butt"
            >
              <title>{`${d.label}: ${formatValue(d.value)}`}</title>
            </circle>
          );
          offset += dash;
          return segment;
        })}
      </svg>

      <ul className="flex-1 space-y-2 w-full">
        {data.map((d, i) => (
          <li key={i} className="flex items-center gap-2.5 text-xs">
            <span
              className="w-3 h-3 rounded-sm shrink-0"
              style={{ background: palette[i % palette.length] }}
              aria-hidden
            />
            <span className="flex-1 text-ink-300 truncate">{d.label}</span>
            <span className="font-semibold text-ink-100 tabular">{formatValue(d.value)}</span>
            <span className="text-ink-500 tabular w-10 text-right">
              {Math.round((Number(d.value) / total) * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ChartEmpty({ height, message }) {
  return (
    <div className={cx('grid place-items-center text-xs text-ink-500')} style={{ height }}>
      {message}
    </div>
  );
}
