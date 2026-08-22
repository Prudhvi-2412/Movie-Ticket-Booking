import { Link } from 'react-router-dom';
import {
  IndianRupee, Ticket, Users, Film, Building2, TrendingUp, Percent, CalendarClock, ArrowRight, XCircle
} from 'lucide-react';
import { api } from '../../lib/api';
import {
  formatCurrency, formatCompactNumber, formatNumber, formatDate, formatDateShort, bookingStatusMeta
} from '../../lib/format';
import { LineChart, BarChart } from '../../components/admin/Charts';
import { Skeleton, ErrorState, EmptyState, useAsync, cx } from '../../components/ui';

export function AdminDashboard() {
  const { data, loading, error, refetch } = useAsync(() => api.get('/admin/dashboard'));

  if (loading) return <DashboardSkeleton />;
  if (error) return <ErrorState message={error.message} onRetry={refetch} />;

  const { kpis, topMovies = [], topTheatres = [], recentBookings = [], revenueTrend = [] } = data;

  const primaryCards = [
    {
      label: 'Total revenue',
      value: formatCurrency(kpis.totalRevenue),
      icon: IndianRupee,
      sub: `${formatCurrency(kpis.todayRevenue)} today`,
      tone: 'positive'
    },
    {
      label: 'Bookings',
      value: formatNumber(kpis.totalBookings),
      icon: Ticket,
      sub: `${formatNumber(kpis.todayBookings)} today`,
      tone: 'brand'
    },
    {
      label: 'Occupancy',
      value: `${Number(kpis.occupancyRate || 0).toFixed(1)}%`,
      icon: Percent,
      sub: 'Shows this week',
      tone: 'info'
    },
    {
      label: 'Customers',
      value: formatNumber(kpis.totalUsers),
      icon: Users,
      sub: `${formatNumber(kpis.cancelledBookings)} cancellations`,
      tone: 'neutral'
    }
  ];

  // `display` is used verbatim where a value is already formatted — running
  // formatNumber over "12.5%" yields NaN.
  const secondaryCards = [
    { label: 'Movies', value: kpis.totalMovies, sub: `${kpis.nowShowing} now showing`, icon: Film, to: '/admin/movies' },
    { label: 'Theatres', value: kpis.activeTheatres, sub: `${kpis.activeScreens} screens`, icon: Building2, to: '/admin/theatres' },
    { label: 'Upcoming shows', value: kpis.upcomingShows, sub: `${kpis.activeLocations} cities`, icon: CalendarClock, to: '/admin/shows' },
    {
      label: 'Cancellation rate',
      display: `${Number(kpis.cancellationRate || 0).toFixed(1)}%`,
      sub: 'Of all bookings',
      icon: XCircle,
      to: '/admin/bookings'
    }
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Dashboard</h1>
        <p className="text-sm text-ink-400 mt-1">A live view of how CineWave is trading.</p>
      </div>

      {/* KPI cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {primaryCards.map((card) => (
          <div key={card.label} className="surface p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-2xs uppercase tracking-wide text-ink-500 font-semibold">{card.label}</p>
                <p className="text-2xl font-extrabold text-ink-50 mt-2 tabular truncate">{card.value}</p>
                <p className="text-2xs text-ink-400 mt-1.5">{card.sub}</p>
              </div>
              <span className={cx(
                'w-10 h-10 rounded-xl grid place-items-center shrink-0 border',
                card.tone === 'positive' && 'bg-positive-500/12 border-positive-500/25 text-positive-400',
                card.tone === 'brand' && 'bg-brand-500/12 border-brand-500/25 text-brand-400',
                card.tone === 'info' && 'bg-info-500/12 border-info-500/25 text-info-400',
                card.tone === 'neutral' && 'bg-ink-800 border-ink-700 text-ink-300'
              )}>
                <card.icon className="w-5 h-5" aria-hidden />
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {secondaryCards.map((card) => (
          <Link key={card.label} to={card.to} className="surface surface-hover p-4 group">
            <div className="flex items-center gap-3">
              <span className="w-9 h-9 rounded-lg bg-ink-800 border border-ink-700 grid place-items-center shrink-0">
                <card.icon className="w-4 h-4 text-ink-400" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-lg font-bold text-ink-50 tabular">
                  {card.display ?? formatNumber(card.value)}
                </p>
                <p className="text-2xs text-ink-400 truncate">{card.label} · {card.sub}</p>
              </div>
              <ArrowRight className="w-4 h-4 text-ink-600 group-hover:text-brand-400 transition-colors shrink-0" aria-hidden />
            </div>
          </Link>
        ))}
      </div>

      {/* Trends */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="surface p-5">
          <h2 className="text-sm font-bold text-ink-50 flex items-center gap-2 mb-4">
            <TrendingUp className="w-4 h-4 text-positive-400" aria-hidden /> Revenue, last 30 days
          </h2>
          <LineChart
            data={revenueTrend}
            xKey="booking_date"
            yKey="revenue"
            label="Daily revenue over the last 30 days"
            formatY={(v) => formatCompactNumber(v)}
            formatX={(v) => formatDateShort(v)}
          />
        </div>

        <div className="surface p-5">
          <h2 className="text-sm font-bold text-ink-50 flex items-center gap-2 mb-4">
            <Ticket className="w-4 h-4 text-brand-400" aria-hidden /> Bookings, last 30 days
          </h2>
          <BarChart
            data={revenueTrend}
            xKey="booking_date"
            yKey="total_bookings"
            label="Daily bookings over the last 30 days"
            formatY={(v) => formatCompactNumber(v)}
            formatX={(v) => formatDateShort(v)}
          />
        </div>
      </div>

      {/* Leaderboards */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="surface p-5">
          <h2 className="text-sm font-bold text-ink-50 mb-4">Top movies by revenue</h2>
          {topMovies.length === 0 ? (
            <EmptyState title="No sales yet" message="Revenue by title appears once tickets start selling." />
          ) : (
            <BarChart
              horizontal
              data={topMovies}
              xKey="movie_title"
              yKey="total_revenue"
              formatY={(v) => formatCurrency(v)}
              label="Top movies by revenue"
            />
          )}
        </div>

        <div className="surface p-5">
          <h2 className="text-sm font-bold text-ink-50 mb-4">Top theatres by revenue</h2>
          {topTheatres.length === 0 ? (
            <EmptyState title="No sales yet" message="Revenue by venue appears once tickets start selling." />
          ) : (
            <BarChart
              horizontal
              data={topTheatres}
              xKey="theater_name"
              yKey="total_revenue"
              formatY={(v) => formatCurrency(v)}
              label="Top theatres by revenue"
            />
          )}
        </div>
      </div>

      {/* Recent bookings */}
      <div className="surface p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-ink-50">Recent bookings</h2>
          <Link to="/admin/bookings" className="text-xs font-semibold text-brand-400 hover:text-brand-500 flex items-center gap-1">
            View all <ArrowRight className="w-3.5 h-3.5" aria-hidden />
          </Link>
        </div>

        {recentBookings.length === 0 ? (
          <EmptyState title="No bookings yet" message="Bookings will appear here as customers check out." />
        ) : (
          <div className="table-wrap !border-0 !bg-transparent">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Reference</th>
                  <th>Customer</th>
                  <th>Movie</th>
                  <th>Theatre</th>
                  <th>Booked</th>
                  <th className="text-right">Amount</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {recentBookings.map((b) => {
                  const status = bookingStatusMeta(b.status);
                  return (
                    <tr key={b.booking_id}>
                      <td className="font-mono text-xs text-brand-400">{b.booking_ref}</td>
                      <td>
                        <span className="block text-ink-100">{b.customer_name}</span>
                        <span className="block text-2xs text-ink-500">{b.customer_email}</span>
                      </td>
                      <td className="max-w-[12rem] truncate">{b.movie_title}</td>
                      <td className="max-w-[10rem] truncate text-ink-400">{b.theater_name}</td>
                      <td className="text-ink-400 text-xs tabular whitespace-nowrap">{formatDate(b.booking_time)}</td>
                      <td className="text-right tabular font-semibold">{formatCurrency(b.total_amount)}</td>
                      <td><span className={status.className}>{status.label}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-9 w-48" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-72 rounded-2xl" />
        <Skeleton className="h-72 rounded-2xl" />
      </div>
      <Skeleton className="h-64 rounded-2xl" />
    </div>
  );
}
