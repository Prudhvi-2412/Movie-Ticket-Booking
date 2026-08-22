import React from 'react';
import { Activity, Webhook, Server, Database, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';
import { api } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import { Skeleton, ErrorState, EmptyState, Tabs, useAsync, cx } from '../../components/ui';
import { AdminHeader } from '../../components/admin/AdminShell';

/**
 * Operational visibility rather than editable configuration: runtime settings
 * live in the server environment, so surfacing them as editable form fields
 * here would be a lie. What is genuinely useful is the health of the
 * dependencies and the audit/webhook ledgers.
 */
export function AdminSettings() {
  const [tab, setTab] = React.useState('health');

  const tabs = [
    { id: 'health', label: 'System health', icon: Server },
    { id: 'webhooks', label: 'Payment events', icon: Webhook },
    { id: 'audit', label: 'Audit log', icon: Activity }
  ];

  return (
    <div>
      <AdminHeader
        title="Settings"
        description="Service health and the operational ledgers behind bookings and payments."
      />
      <Tabs tabs={tabs} value={tab} onChange={setTab} className="mb-6" />

      {tab === 'health' && <HealthPanel />}
      {tab === 'webhooks' && <WebhookPanel />}
      {tab === 'audit' && <AuditPanel />}
    </div>
  );
}

function HealthPanel() {
  const { data, loading, error, refetch } = useAsync(() => api.health());

  if (loading) return <Skeleton className="h-48 rounded-2xl" />;
  if (error) return <ErrorState message={error.message} onRetry={refetch} />;

  const deps = data?.dependencies || {};

  const items = [
    {
      label: 'API',
      icon: Server,
      status: data.status === 'ok' ? 'ok' : 'degraded',
      detail: `v${data.version} · ${data.service}`
    },
    {
      label: 'MySQL',
      icon: Database,
      status: deps.database === 'connected' ? 'ok' : 'down',
      detail: deps.database === 'connected'
        ? 'Connected — bookings and catalogue are live'
        : 'Disconnected — bookings cannot be written'
    },
    {
      label: 'Redis',
      icon: Activity,
      status: deps.redis === 'connected' ? 'ok' : 'degraded',
      detail: deps.redis === 'connected'
        ? 'Connected — seat locks are distributed'
        : 'Unavailable — seat locks are per-process only'
    }
  ];

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        {items.map((item) => {
          const Icon = item.status === 'ok' ? CheckCircle2 : item.status === 'degraded' ? AlertTriangle : XCircle;
          return (
            <div key={item.label} className="surface p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-ink-50 flex items-center gap-2">
                    <item.icon className="w-4 h-4 text-ink-400" aria-hidden /> {item.label}
                  </p>
                  <p className="text-2xs text-ink-400 mt-2 leading-relaxed">{item.detail}</p>
                </div>
                <Icon
                  className={cx(
                    'w-5 h-5 shrink-0',
                    item.status === 'ok' ? 'text-positive-400'
                      : item.status === 'degraded' ? 'text-caution-400' : 'text-negative-400'
                  )}
                  aria-hidden
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className="surface p-5">
        <h2 className="text-sm font-bold text-ink-50 mb-3">Runtime configuration</h2>
        <p className="text-xs text-ink-400 leading-relaxed">
          Booking economics (convenience fee, GST rate, seat-hold TTL, maximum
          seats per booking) and every secret are read from the server
          environment at boot. Change them in <code className="font-mono text-brand-400">backend/.env</code>{' '}
          or the container environment and restart — they are deliberately not
          editable from the browser.
        </p>
        <p className="text-2xs text-ink-500 mt-3 tabular">
          Last checked {formatDateTime(data.timestamp)}
        </p>
      </div>
    </div>
  );
}

function WebhookPanel() {
  const { data, loading, error, refetch } = useAsync(() => api.get('/admin/webhook-logs?limit=100'));

  if (loading) return <Skeleton className="h-96 rounded-2xl" />;
  if (error) return <ErrorState message={error.message} onRetry={refetch} />;

  const logs = data?.logs || [];

  return (
    <div className="surface p-5">
      <p className="text-xs text-ink-400 mb-4 leading-relaxed">
        Every payment event the gateway has delivered. A duplicate delivery is
        rejected by the unique constraint on the event id rather than being
        applied twice, which is what keeps a retried webhook from double-booking
        or double-charging.
      </p>

      {logs.length === 0 ? (
        <EmptyState icon={Webhook} title="No payment events yet" message="Events appear here as customers pay." />
      ) : (
        <div className="table-wrap !border-0 !bg-transparent max-h-[32rem] overflow-y-auto">
          <table className="data-table">
            <thead className="sticky top-0">
              <tr>
                <th>Event</th>
                <th>Type</th>
                <th>Status</th>
                <th>Received</th>
                <th>Processed</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.log_id}>
                  <td className="font-mono text-2xs text-ink-400 truncate max-w-[14rem]" title={log.event_id}>
                    {log.event_id}
                  </td>
                  <td className="text-xs text-ink-300">{log.event_type}</td>
                  <td>
                    <span className={
                      log.status === 'PROCESSED' ? 'badge-positive'
                        : log.status === 'FAILED' ? 'badge-negative' : 'badge-caution'
                    }>
                      {log.status}
                    </span>
                    {log.error_message && (
                      <span className="block text-2xs text-negative-400 mt-1 max-w-[16rem] truncate"
                        title={log.error_message}>
                        {log.error_message}
                      </span>
                    )}
                  </td>
                  <td className="text-2xs text-ink-400 tabular whitespace-nowrap">
                    {formatDateTime(log.created_at)}
                  </td>
                  <td className="text-2xs text-ink-500 tabular whitespace-nowrap">
                    {log.processed_at ? formatDateTime(log.processed_at) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function AuditPanel() {
  const { data, loading, error, refetch } = useAsync(() => api.get('/admin/audit-logs?limit=100'));

  if (loading) return <Skeleton className="h-96 rounded-2xl" />;
  if (error) return <ErrorState message={error.message} onRetry={refetch} />;

  const logs = data?.logs || [];

  return (
    <div className="surface p-5">
      <p className="text-xs text-ink-400 mb-4">
        Administrative changes to the catalogue, recorded automatically.
      </p>

      {logs.length === 0 ? (
        <EmptyState icon={Activity} title="No admin activity yet" message="Catalogue changes are logged here." />
      ) : (
        <div className="table-wrap !border-0 !bg-transparent max-h-[32rem] overflow-y-auto">
          <table className="data-table">
            <thead className="sticky top-0">
              <tr>
                <th>When</th>
                <th>Who</th>
                <th>Action</th>
                <th>Entity</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.audit_id}>
                  <td className="text-2xs text-ink-400 tabular whitespace-nowrap">
                    {formatDateTime(log.created_at)}
                  </td>
                  <td className="text-xs text-ink-300 truncate max-w-[12rem]">
                    {log.actor_name || 'System'}
                  </td>
                  <td><span className="badge-neutral">{log.action}</span></td>
                  <td className="text-xs text-ink-400">
                    {log.entity}{log.entity_id ? ` #${log.entity_id}` : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
