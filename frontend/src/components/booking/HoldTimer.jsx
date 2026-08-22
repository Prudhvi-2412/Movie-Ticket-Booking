import { useState, useEffect, useRef } from 'react';
import { Timer, AlertTriangle } from 'lucide-react';
import { formatCountdown } from '../../lib/format';
import { secondsUntil } from '../../lib/hold';
import { cx } from '../ui';

/**
 * Counts down a seat hold to its real backend deadline.
 *
 * Driven by an absolute `expiresAt` rather than by decrementing a number once
 * a second: a tab that is backgrounded gets its timers throttled, so a
 * decrementing counter drifts and can still show time remaining after the
 * server has already released the seats. Recomputing from the wall clock on
 * each tick stays correct however long the tab was asleep.
 */
export function HoldTimer({ expiresAt, onExpire, className, compact = false }) {
  const [remaining, setRemaining] = useState(() => secondsUntil(expiresAt));
  const firedRef = useRef(false);

  useEffect(() => {
    firedRef.current = false;
    setRemaining(secondsUntil(expiresAt));

    const tick = () => {
      const left = secondsUntil(expiresAt);
      setRemaining(left);
      if (left <= 0 && !firedRef.current) {
        firedRef.current = true;
        onExpire?.();
      }
    };

    const interval = setInterval(tick, 1000);
    // Re-sync the moment the tab becomes visible again.
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [expiresAt, onExpire]);

  const urgent = remaining <= 60;
  const expired = remaining <= 0;

  if (compact) {
    return (
      <span
        className={cx(
          'inline-flex items-center gap-1.5 text-sm font-bold tabular',
          expired ? 'text-negative-400' : urgent ? 'text-caution-400' : 'text-ink-100',
          className
        )}
      >
        <Timer className={cx('w-4 h-4', urgent && !expired && 'animate-pulse')} aria-hidden />
        {formatCountdown(remaining)}
      </span>
    );
  }

  return (
    <div
      role="timer"
      aria-live={urgent ? 'assertive' : 'off'}
      className={cx(
        'flex items-center justify-between gap-4 rounded-xl border px-4 py-3 transition-colors',
        expired
          ? 'border-negative-500/40 bg-negative-500/10'
          : urgent
            ? 'border-caution-500/40 bg-caution-500/10'
            : 'border-ink-700 bg-ink-850',
        className
      )}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        {expired ? (
          <AlertTriangle className="w-4 h-4 text-negative-400 shrink-0" aria-hidden />
        ) : (
          <Timer
            className={cx('w-4 h-4 shrink-0', urgent ? 'text-caution-400 animate-pulse' : 'text-brand-500')}
            aria-hidden
          />
        )}
        <div className="min-w-0">
          <p className="text-xs font-semibold text-ink-100">
            {expired ? 'Your seat hold expired' : 'Seats held for you'}
          </p>
          <p className="text-2xs text-ink-400 truncate">
            {expired
              ? 'These seats have been returned to the pool.'
              : 'Complete payment before the timer runs out.'}
          </p>
        </div>
      </div>

      <span
        className={cx(
          'text-xl font-extrabold tabular shrink-0',
          expired ? 'text-negative-400' : urgent ? 'text-caution-400' : 'text-ink-50'
        )}
      >
        {formatCountdown(remaining)}
      </span>
    </div>
  );
}
