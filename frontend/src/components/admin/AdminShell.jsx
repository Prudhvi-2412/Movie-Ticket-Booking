import { Plus } from 'lucide-react';
import { Button, Skeleton, ErrorState, EmptyState, cx } from '../ui';

/** Consistent title block for every admin screen. */
export function AdminHeader({ title, description, actions, children }) {
  return (
    <div className="mb-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>
          {description && <p className="text-sm text-ink-400 mt-1">{description}</p>}
        </div>
        {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
      </div>
      {children && <div className="mt-5">{children}</div>}
    </div>
  );
}

export function CreateButton({ label, onClick }) {
  return <Button icon={Plus} onClick={onClick}>{label}</Button>;
}

/**
 * Table wrapper that owns the loading/error/empty branching so each admin
 * page only describes its columns and rows.
 */
export function ResourceTable({
  columns, rows, loading, error, onRetry, emptyTitle, emptyMessage, emptyAction,
  rowKey = (row) => row.id, renderRow, skeletonRows = 6
}) {
  if (loading) {
    return (
      <div className="table-wrap p-4 space-y-3">
        {Array.from({ length: skeletonRows }).map((_, i) => <Skeleton key={i} className="h-11 rounded-lg" />)}
      </div>
    );
  }

  if (error) return <ErrorState message={error.message} onRetry={onRetry} />;

  if (rows.length === 0) {
    return (
      <div className="table-wrap">
        <EmptyState title={emptyTitle} message={emptyMessage} action={emptyAction} />
      </div>
    );
  }

  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.key} className={cx(col.align === 'right' && 'text-right', col.className)}>
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{rows.map((row) => renderRow(row, rowKey(row)))}</tbody>
      </table>
    </div>
  );
}

/** Green/grey pill for an is_active flag. */
export function StatusPill({ active, activeLabel = 'Active', inactiveLabel = 'Disabled' }) {
  return (
    <span className={active ? 'badge-positive' : 'badge-neutral'}>
      {active ? activeLabel : inactiveLabel}
    </span>
  );
}

/** Right-aligned row action cluster. */
export function RowActions({ children }) {
  return <div className="flex items-center justify-end gap-1.5">{children}</div>;
}

export function IconButton({ icon: Icon, label, onClick, tone = 'neutral', disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cx(
        'p-2 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed',
        tone === 'danger'
          ? 'text-ink-400 hover:text-negative-400 hover:bg-negative-500/10'
          : 'text-ink-400 hover:text-brand-400 hover:bg-ink-800'
      )}
    >
      <Icon className="w-4 h-4" aria-hidden />
    </button>
  );
}

/** Filter bar shell so every list page has the same rhythm. */
export function FilterBar({ children, className }) {
  return (
    <div className={cx('surface p-3 flex flex-wrap items-center gap-3', className)}>
      {children}
    </div>
  );
}
