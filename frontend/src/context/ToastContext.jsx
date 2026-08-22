import { createContext, useContext, useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, AlertTriangle, Info, X, XCircle } from 'lucide-react';
import { cx } from '../components/ui';

const ToastContext = createContext(null);

const ICONS = {
  success: CheckCircle2,
  error: XCircle,
  warning: AlertTriangle,
  info: Info
};

const STYLES = {
  success: 'border-positive-500/40 bg-positive-500/10 text-positive-400',
  error: 'border-negative-500/40 bg-negative-500/10 text-negative-400',
  warning: 'border-caution-500/40 bg-caution-500/10 text-caution-400',
  info: 'border-info-500/40 bg-info-500/10 text-info-400'
};

/**
 * Replaces the alert() calls the app used for every success and failure.
 * Toasts are announced politely to screen readers rather than stealing focus.
 */
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const seq = useRef(0);

  const dismiss = useCallback((id) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  const push = useCallback((message, { type = 'info', duration = 4500, title } = {}) => {
    const id = (seq.current += 1);
    setToasts((current) => [...current, { id, message, type, title }]);
    if (duration > 0) setTimeout(() => dismiss(id), duration);
    return id;
  }, [dismiss]);

  const toast = useRef({
    show: push,
    success: (msg, opts) => push(msg, { ...opts, type: 'success' }),
    error: (msg, opts) => push(msg, { ...opts, type: 'error', duration: 6000 }),
    warning: (msg, opts) => push(msg, { ...opts, type: 'warning' }),
    info: (msg, opts) => push(msg, { ...opts, type: 'info' }),
    dismiss
  }).current;

  return (
    <ToastContext.Provider value={toast}>
      {children}
      {createPortal(
        <div
          className="fixed z-[60] bottom-4 right-4 left-4 sm:left-auto sm:w-96 flex flex-col gap-2.5 pointer-events-none"
          role="region"
          aria-label="Notifications"
        >
          {toasts.map((t) => {
            const Icon = ICONS[t.type];
            return (
              <div
                key={t.id}
                role="status"
                aria-live="polite"
                className={cx(
                  'pointer-events-auto flex items-start gap-3 rounded-xl border p-3.5 pr-2.5',
                  'bg-ink-850 shadow-lift animate-slide-in-right backdrop-blur',
                  STYLES[t.type]
                )}
              >
                <Icon className="w-4.5 h-4.5 shrink-0 mt-0.5" aria-hidden />
                <div className="flex-1 min-w-0">
                  {t.title && <p className="text-sm font-semibold text-ink-50">{t.title}</p>}
                  <p className="text-sm text-ink-100 leading-snug break-words">{t.message}</p>
                </div>
                <button
                  onClick={() => dismiss(t.id)}
                  className="p-1 rounded-md text-ink-400 hover:text-ink-100 hover:bg-ink-800 shrink-0"
                  aria-label="Dismiss notification"
                >
                  <X className="w-3.5 h-3.5" aria-hidden />
                </button>
              </div>
            );
          })}
        </div>,
        document.body
      )}
    </ToastContext.Provider>
  );
}

export const useToast = () => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside a ToastProvider');
  return ctx;
};
