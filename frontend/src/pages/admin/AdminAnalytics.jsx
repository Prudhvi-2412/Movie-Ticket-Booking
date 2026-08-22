import { TrendingUp, MapPin, Clock, Armchair, CreditCard, Percent } from 'lucide-react';
import { api } from '../../lib/api';
import {
  formatCurrency, formatCompactNumber, formatNumber, formatDateShort, formatTime, formatDate
} from '../../lib/format';
import { LineChart, BarChart, DonutChart } from '../../components/admin/Charts';
import { Skeleton, ErrorState, EmptyState, useAsync, cx } from '../../components/ui';
import { AdminHeader } from '../../components/admin/AdminShell';

export function AdminAnalytics() {
  const { data, loading, error, refetch } = useAsync(() => api.get('/admin/analytics'));

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-9 w-52" />
        <div className="grid gap-4 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-72 rounded-2xl" />)}
        </div>
      </div>
    );
  }

  if (error) return <ErrorState message={error.message} onRetry={refetch} />;

  const {
    revenueByMovie = [], revenueByTheatre = [], revenueByLocation = [],
    occupancy = [], dailyTrend = [], peakHours = [], seatCategories = [],
    paymentOutcomes = [], paymentSuccessRate
  } = data;

  const paymentDonut = paymentOutcomes
    .reduce((acc, row) => {
      const existing = acc.find((a) => a.label === row.payment_status);
      if (existing) existing.value += Number(row.attempts);
      else acc.push({ label: row.payment_status, value: Number(row.attempts) });
      return acc;
    }, []);

  const methodDonut = paymentOutcomes
    .filter((r) => r.payment_status === 'Success')
    .map((r) => ({ label: r.payment_method, value: Number(r.amount) }));

  return (
    <div className="space-y-6">
      <AdminHeader
        title="Analytics"
        description="Every figure below is aggregated live from the booking ledger."
      />

      {/* Headline */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Metric
          icon={Percent}
          label="Payment success rate"
          value={`${paymentSuccessRate}%`}
          tone={paymentSuccessRate >= 90 ? 'positive' : paymentSuccessRate >= 70 ? 'caution' : 'negative'}
        />
        <Metric
          icon={TrendingUp}
          label="Revenue (30 days)"
          value={formatCurrency(dailyTrend.reduce((s, d) => s + Number(d.revenue), 0))}
          tone="brand"
        />
        <Metric
          icon={Armchair}
          label="Tickets sold"
          value={formatNumber(seatCategories.reduce((s, c) => s + Number(c.tickets_sold), 0))}
          tone="info"
        />
      </div>

      {/* Trends */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Revenue trend" icon={TrendingUp}>
          <LineChart
            data={dailyTrend}
            xKey="booking_date"
            yKey="revenue"
            formatY={formatCompactNumber}
            formatX={formatDateShort}
            label="Revenue over the last 30 days"
          />
        </Panel>

        <Panel title="Peak booking hours" icon={Clock}>
          <BarChart
            data={peakHours}
            xKey="hour_of_day"
            yKey="total_bookings"
            formatY={formatCompactNumber}
            formatX={(h) => `${h}:00`}
            label="Bookings by hour of day"
          />
        </Panel>
      </div>

      {/* Revenue splits */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="By movie" icon={TrendingUp}>
          {revenueByMovie.filter((m) => Number(m.total_revenue) > 0).length === 0 ? (
            <EmptyState title="No sales yet" />
          ) : (
            <BarChart
              horizontal
              data={revenueByMovie.filter((m) => Number(m.total_revenue) > 0).slice(0, 8)}
              xKey="movie_title"
              yKey="total_revenue"
              formatY={formatCurrency}
            />
          )}
        </Panel>

        <Panel title="By theatre" icon={TrendingUp}>
          {revenueByTheatre.filter((t) => Number(t.total_revenue) > 0).length === 0 ? (
            <EmptyState title="No sales yet" />
          ) : (
            <BarChart
              horizontal
              data={revenueByTheatre.filter((t) => Number(t.total_revenue) > 0).slice(0, 8)}
              xKey="theater_name"
              yKey="total_revenue"
              formatY={formatCurrency}
            />
          )}
        </Panel>

        <Panel title="By city" icon={MapPin}>
          {revenueByLocation.filter((l) => Number(l.total_revenue) > 0).length === 0 ? (
            <EmptyState title="No sales yet" />
          ) : (
            <BarChart
              horizontal
              data={revenueByLocation.filter((l) => Number(l.total_revenue) > 0).slice(0, 8)}
              xKey="city"
              yKey="total_revenue"
              formatY={formatCurrency}
            />
          )}
        </Panel>
      </div>

      {/* Payments & categories */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Payment outcomes" icon={CreditCard}>
          <DonutChart data={paymentDonut} formatValue={formatNumber} label="Payment outcomes" />
        </Panel>

        <Panel title="Revenue by payment method" icon={CreditCard}>
          {methodDonut.length === 0 ? (
            <EmptyState title="No successful payments yet" />
          ) : (
            <DonutChart data={methodDonut} formatValue={formatCurrency} label="Revenue by payment method" />
          )}
        </Panel>
      </div>

      <Panel title="Seat category performance" icon={Armchair}>
        {seatCategories.length === 0 ? (
          <EmptyState title="No tickets sold yet" />
        ) : (
          <div className="table-wrap !border-0 !bg-transparent">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Category</th>
                  <th className="text-right">Tickets sold</th>
                  <th className="text-right">Average price</th>
                  <th className="text-right">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {seatCategories.map((c) => (
                  <tr key={c.seat_type}>
                    <td className="font-semibold text-ink-100">{c.seat_type}</td>
                    <td className="text-right tabular">{formatNumber(c.tickets_sold)}</td>
                    <td className="text-right tabular text-ink-400">{formatCurrency(c.avg_price)}</td>
                    <td className="text-right tabular font-semibold">{formatCurrency(c.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel title="Show occupancy" icon={Percent}>
        {occupancy.length === 0 ? (
          <EmptyState title="No shows in this window" />
        ) : (
          <div className="table-wrap !border-0 !bg-transparent max-h-96 overflow-y-auto">
            <table className="data-table">
              <thead className="sticky top-0">
                <tr>
                  <th>Movie</th>
                  <th>Theatre</th>
                  <th>Showtime</th>
                  <th className="text-right">Sold</th>
                  <th className="text-right">Occupancy</th>
                </tr>
              </thead>
              <tbody>
                {occupancy.map((o) => (
                  <tr key={o.show_id}>
                    <td className="truncate max-w-[12rem]">{o.movie_title}</td>
                    <td className="text-ink-400 truncate max-w-[10rem]">{o.theater_name}</td>
                    <td className="text-ink-400 text-xs tabular whitespace-nowrap">
                      {formatDate(o.show_time)} · {formatTime(o.show_time)}
                    </td>
                    <td className="text-right tabular text-ink-300">
                      {o.seats_booked}/{o.total_seats}
                    </td>
                    <td className="text-right">
                      <span className={cx(
                        'tabular font-semibold',
                        Number(o.occupancy_percentage) >= 80 ? 'text-positive-400'
                          : Number(o.occupancy_percentage) >= 40 ? 'text-caution-400'
                            : 'text-ink-400'
                      )}>
                        {Number(o.occupancy_percentage).toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

function Panel({ title, icon: Icon, children }) {
  return (
    <div className="surface p-5">
      <h2 className="text-sm font-bold text-ink-50 flex items-center gap-2 mb-4">
        {Icon && <Icon className="w-4 h-4 text-brand-400" aria-hidden />} {title}
      </h2>
      {children}
    </div>
  );
}

function Metric({ icon: Icon, label, value, tone }) {
  return (
    <div className="surface p-5 flex items-center gap-4">
      <span className={cx(
        'w-11 h-11 rounded-xl grid place-items-center shrink-0 border',
        tone === 'positive' && 'bg-positive-500/12 border-positive-500/25 text-positive-400',
        tone === 'caution' && 'bg-caution-500/12 border-caution-500/25 text-caution-400',
        tone === 'negative' && 'bg-negative-500/12 border-negative-500/25 text-negative-400',
        tone === 'brand' && 'bg-brand-500/12 border-brand-500/25 text-brand-400',
        tone === 'info' && 'bg-info-500/12 border-info-500/25 text-info-400'
      )}>
        <Icon className="w-5 h-5" aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="text-2xs uppercase tracking-wide text-ink-500 font-semibold">{label}</p>
        <p className="text-xl font-extrabold text-ink-50 tabular truncate">{value}</p>
      </div>
    </div>
  );
}
