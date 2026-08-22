import React, { useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2, Inbox, AlertTriangle, ChevronLeft, ChevronRight, Search } from 'lucide-react';

/** Tiny classname joiner — avoids pulling in clsx for this. */
export const cx = (...parts) => parts.filter(Boolean).join(' ');

/* ------------------------------------------------------------------ */
/* Button                                                              */
/* ------------------------------------------------------------------ */
const VARIANTS = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  ghost: 'btn-ghost',
  danger: 'btn-danger'
};

export const Button = React.forwardRef(function Button(
  { variant = 'primary', size = 'md', loading = false, icon: Icon, children, className, disabled, ...props },
  ref
) {
  return (
    <button
      ref={ref}
      // A loading button must also be inert, or a double-click fires the
      // action twice — which for "Pay" means two checkout attempts.
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(VARIANTS[variant], `btn-${size}`, className)}
      {...props}
    >
      {loading ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : Icon && <Icon className="w-4 h-4" aria-hidden />}
      {children}
    </button>
  );
});

/* ------------------------------------------------------------------ */
/* Form fields                                                         */
/* ------------------------------------------------------------------ */
let fieldSeq = 0;

export function Field({ label, error, hint, required, children, className }) {
  const id = useRef(`field-${(fieldSeq += 1)}`).current;
  const child = React.isValidElement(children)
    ? React.cloneElement(children, {
      id: children.props.id || id,
      'aria-invalid': error ? true : undefined,
      'aria-describedby': error ? `${id}-error` : hint ? `${id}-hint` : undefined,
      className: cx(children.props.className, error && 'input-error')
    })
    : children;

  return (
    <div className={className}>
      {label && (
        <label htmlFor={id} className="label">
          {label}
          {required && <span className="text-brand-500 ml-0.5">*</span>}
        </label>
      )}
      {child}
      {hint && !error && <p id={`${id}-hint`} className="text-xs text-ink-400 mt-1.5">{hint}</p>}
      {error && (
        <p id={`${id}-error`} className="field-error" role="alert">
          <AlertTriangle className="w-3 h-3 shrink-0" aria-hidden />
          {error}
        </p>
      )}
    </div>
  );
}

export const Input = React.forwardRef(function Input({ className, ...props }, ref) {
  return <input ref={ref} className={cx('input', className)} {...props} />;
});

export const Textarea = React.forwardRef(function Textarea({ className, rows = 4, ...props }, ref) {
  return <textarea ref={ref} rows={rows} className={cx('input resize-y', className)} {...props} />;
});

export const Select = React.forwardRef(function Select({ className, children, ...props }, ref) {
  return <select ref={ref} className={cx('input', className)} {...props}>{children}</select>;
});

export function Checkbox({ label, className, ...props }) {
  return (
    <label className={cx('inline-flex items-center gap-2.5 cursor-pointer select-none', className)}>
      <input
        type="checkbox"
        className="w-4 h-4 rounded border-ink-600 bg-ink-900 text-brand-500
                   focus:ring-brand-500/40 focus:ring-offset-ink-950 cursor-pointer"
        {...props}
      />
      <span className="text-sm text-ink-200">{label}</span>
    </label>
  );
}

export function SearchInput({ className, ...props }) {
  return (
    <div className={cx('relative', className)}>
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400 pointer-events-none" aria-hidden />
      <input type="search" className="input pl-9" {...props} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Modal                                                               */
/* ------------------------------------------------------------------ */
const SIZES = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl' };

export function Modal({ open, onClose, title, description, size = 'md', children, footer }) {
  const panelRef = useRef(null);

  // Escape to close, and lock body scroll so the page behind does not move.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // Move focus into the dialog so the keyboard lands somewhere sensible.
    const timer = setTimeout(() => panelRef.current?.focus(), 0);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
      clearTimeout(timer);
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div
        className="absolute inset-0 bg-ink-950/80 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={cx(
          'relative w-full bg-ink-850 border border-ink-700 shadow-lift',
          'rounded-t-3xl sm:rounded-2xl max-h-[92vh] flex flex-col',
          'animate-slide-up sm:animate-scale-in outline-none',
          SIZES[size]
        )}
      >
        <div className="flex items-start justify-between gap-4 p-5 border-b border-ink-700">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-ink-50 truncate">{title}</h2>
            {description && <p className="text-sm text-ink-300 mt-0.5">{description}</p>}
          </div>
          <button onClick={onClose} className="btn-ghost btn-sm -mr-2 -mt-1 shrink-0" aria-label="Close dialog">
            <X className="w-4 h-4" aria-hidden />
          </button>
        </div>

        <div className="p-5 overflow-y-auto flex-1">{children}</div>

        {footer && <div className="p-5 border-t border-ink-700 flex justify-end gap-3">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}

export function ConfirmDialog({ open, onClose, onConfirm, title, message, confirmLabel = 'Confirm', variant = 'danger', loading }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={(
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button variant={variant} onClick={onConfirm} loading={loading}>{confirmLabel}</Button>
        </>
      )}
    >
      <p className="text-sm text-ink-200 leading-relaxed">{message}</p>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* State placeholders                                                  */
/* ------------------------------------------------------------------ */
export function Skeleton({ className }) {
  return <div className={cx('skeleton', className)} aria-hidden />;
}

export function Spinner({ className, label = 'Loading' }) {
  return (
    <span role="status" aria-label={label}>
      <Loader2 className={cx('animate-spin text-brand-500', className || 'w-5 h-5')} aria-hidden />
    </span>
  );
}

export function LoadingBlock({ label = 'Loading…', className }) {
  return (
    <div className={cx('flex flex-col items-center justify-center gap-3 py-16', className)}>
      <Spinner className="w-7 h-7" />
      <p className="text-sm text-ink-300">{label}</p>
    </div>
  );
}

export function EmptyState({ icon: Icon = Inbox, title, message, action, className }) {
  return (
    <div className={cx('flex flex-col items-center justify-center text-center py-14 px-6', className)}>
      <div className="w-14 h-14 rounded-2xl bg-ink-800 border border-ink-700 grid place-items-center mb-4">
        <Icon className="w-6 h-6 text-ink-400" aria-hidden />
      </div>
      <h3 className="text-base font-semibold text-ink-100">{title}</h3>
      {message && <p className="text-sm text-ink-400 mt-1.5 max-w-sm leading-relaxed">{message}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({ title = 'Something went wrong', message, onRetry, className }) {
  return (
    <div className={cx('flex flex-col items-center justify-center text-center py-14 px-6', className)} role="alert">
      <div className="w-14 h-14 rounded-2xl bg-negative-500/10 border border-negative-500/30 grid place-items-center mb-4">
        <AlertTriangle className="w-6 h-6 text-negative-400" aria-hidden />
      </div>
      <h3 className="text-base font-semibold text-ink-100">{title}</h3>
      {message && <p className="text-sm text-ink-400 mt-1.5 max-w-sm leading-relaxed">{message}</p>}
      {onRetry && <Button variant="secondary" className="mt-5" onClick={onRetry}>Try again</Button>}
    </div>
  );
}

/**
 * Renders the right thing for a loading/error/empty/success quartet, so every
 * screen handles all four states without repeating the branching.
 */
export function AsyncBoundary({ loading, error, isEmpty, onRetry, skeleton, empty, children }) {
  if (loading) return skeleton ?? <LoadingBlock />;
  if (error) return <ErrorState message={error.message || String(error)} onRetry={onRetry} />;
  if (isEmpty) return empty ?? <EmptyState title="Nothing here yet" />;
  return children;
}

/* ------------------------------------------------------------------ */
/* Tabs, badges, pagination                                            */
/* ------------------------------------------------------------------ */
export function Tabs({ tabs, value, onChange, className }) {
  return (
    <div
      role="tablist"
      className={cx('inline-flex items-center gap-1 p-1 bg-ink-850 border border-ink-700 rounded-xl overflow-x-auto no-scrollbar', className)}
    >
      {tabs.map((tab) => (
        <button
          key={tab.id}
          role="tab"
          aria-selected={value === tab.id}
          onClick={() => onChange(tab.id)}
          className={cx(
            'px-3.5 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-all duration-200 flex items-center gap-1.5',
            value === tab.id
              ? 'bg-brand-500 text-white shadow-brand-sm'
              : 'text-ink-300 hover:text-ink-50 hover:bg-ink-800'
          )}
        >
          {tab.icon && <tab.icon className="w-3.5 h-3.5" aria-hidden />}
          {tab.label}
          {tab.count !== undefined && (
            <span className={cx(
              'ml-0.5 px-1.5 py-0.5 rounded text-2xs tabular',
              value === tab.id ? 'bg-white/20' : 'bg-ink-700 text-ink-300'
            )}>
              {tab.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

export function Pagination({ page, pages, total, onChange, className }) {
  if (!pages || pages <= 1) return null;

  // Window the page numbers so 400 pages does not render 400 buttons.
  const windowSize = 5;
  let start = Math.max(1, page - Math.floor(windowSize / 2));
  const end = Math.min(pages, start + windowSize - 1);
  start = Math.max(1, end - windowSize + 1);
  const numbers = Array.from({ length: end - start + 1 }, (_, i) => start + i);

  return (
    <nav className={cx('flex items-center justify-between gap-4 flex-wrap', className)} aria-label="Pagination">
      <p className="text-xs text-ink-400 tabular">
        Page {page} of {pages}{total !== undefined && ` · ${total} result${total === 1 ? '' : 's'}`}
      </p>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onChange(page - 1)}
          disabled={page <= 1}
          className="btn-ghost btn-sm disabled:opacity-40"
          aria-label="Previous page"
        >
          <ChevronLeft className="w-4 h-4" aria-hidden />
        </button>
        {numbers.map((n) => (
          <button
            key={n}
            onClick={() => onChange(n)}
            aria-current={n === page ? 'page' : undefined}
            className={cx(
              'min-w-[2rem] h-8 rounded-lg text-xs font-semibold tabular transition-colors',
              n === page ? 'bg-brand-500 text-white' : 'text-ink-300 hover:bg-ink-800'
            )}
          >
            {n}
          </button>
        ))}
        <button
          onClick={() => onChange(page + 1)}
          disabled={page >= pages}
          className="btn-ghost btn-sm disabled:opacity-40"
          aria-label="Next page"
        >
          <ChevronRight className="w-4 h-4" aria-hidden />
        </button>
      </div>
    </nav>
  );
}

/* ------------------------------------------------------------------ */
/* Misc                                                                */
/* ------------------------------------------------------------------ */
export function Card({ as: Tag = 'div', hover, className, children, ...props }) {
  return (
    <Tag className={cx('surface', hover && 'surface-hover', className)} {...props}>
      {children}
    </Tag>
  );
}

export function SectionHeader({ title, subtitle, action, className }) {
  return (
    <div className={cx('flex items-end justify-between gap-4 flex-wrap mb-5', className)}>
      <div>
        <h2 className="section-title">{title}</h2>
        {subtitle && <p className="section-subtitle mt-1">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

/**
 * Poster/backdrop image that degrades to a branded placeholder instead of a
 * broken-image icon when a URL fails — seeded art is remote and can 404.
 */
export function SmartImage({ src, alt, className, aspect = 'aspect-[2/3]', fallbackText }) {
  const [failed, setFailed] = React.useState(false);
  const [loaded, setLoaded] = React.useState(false);

  const showFallback = failed || !src;

  return (
    <div className={cx('relative overflow-hidden bg-ink-800', aspect, className)}>
      {!showFallback && (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          onError={() => setFailed(true)}
          onLoad={() => setLoaded(true)}
          className={cx(
            'w-full h-full object-cover transition-opacity duration-500',
            loaded ? 'opacity-100' : 'opacity-0'
          )}
        />
      )}
      {(showFallback || !loaded) && (
        <div className="absolute inset-0 grid place-items-center bg-gradient-to-br from-ink-800 to-ink-900">
          {showFallback && (
            <span className="text-2xs font-bold uppercase tracking-widest text-ink-500 px-3 text-center">
              {fallbackText || alt || 'CineWave'}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/** Debounces a rapidly-changing value — used by search boxes. */
export function useDebounced(value, delay = 300) {
  const [debounced, setDebounced] = React.useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

/** Runs a handler when a click lands outside the referenced element. */
export function useClickOutside(ref, handler) {
  const savedHandler = useRef(handler);
  savedHandler.current = handler;

  useEffect(() => {
    const listener = (event) => {
      if (!ref.current || ref.current.contains(event.target)) return;
      savedHandler.current(event);
    };
    document.addEventListener('mousedown', listener);
    document.addEventListener('touchstart', listener);
    return () => {
      document.removeEventListener('mousedown', listener);
      document.removeEventListener('touchstart', listener);
    };
  }, [ref]);
}

/** Wraps an async request with loading/error state and a retry. */
export function useAsync(fn, deps = [], { immediate = true } = {}) {
  const [state, setState] = React.useState({ data: null, loading: immediate, error: null });
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const execute = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await fnRef.current();
      setState({ data, loading: false, error: null });
      return data;
    } catch (error) {
      // An aborted request is a cancellation, not a failure to show the user.
      if (error.name === 'AbortError') return null;
      setState({ data: null, loading: false, error });
      return null;
    }
    // Stable across renders: the current fn is read through fnRef, so a
    // caller passing an inline arrow does not re-trigger the effect below.
  }, []);

  useEffect(() => {
    if (immediate) execute();
    // `deps` is the caller's dependency list by design — this hook exists to
    // re-run the request when they change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { ...state, refetch: execute, setData: (data) => setState((s) => ({ ...s, data })) };
}
