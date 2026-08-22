const KEY = 'cinewave.hold';

/**
 * The active seat hold, kept in sessionStorage.
 *
 * Router state alone is not enough: reloading the checkout page would drop it
 * and strand the customer with seats held in Redis but no way to pay for
 * them. sessionStorage survives a reload and is scoped to the tab, so two
 * tabs checking out different shows do not overwrite each other's hold.
 */
export const holdStore = {
  save: (hold) => {
    try {
      sessionStorage.setItem(KEY, JSON.stringify({ ...hold, savedAt: Date.now() }));
    } catch {
      // Private-browsing modes can refuse writes; the flow still works from
      // router state in that session.
    }
  },

  /** Returns the hold for `showId`, or null if absent, stale or expired. */
  load: (showId) => {
    try {
      const raw = sessionStorage.getItem(KEY);
      if (!raw) return null;
      const hold = JSON.parse(raw);
      if (Number(hold.showId) !== Number(showId)) return null;
      if (hold.expiresAt && new Date(hold.expiresAt).getTime() <= Date.now()) {
        sessionStorage.removeItem(KEY);
        return null;
      }
      return hold;
    } catch {
      return null;
    }
  },

  clear: () => {
    try { sessionStorage.removeItem(KEY); } catch { /* nothing to do */ }
  }
};

/** Seconds left on a hold, floored at zero. */
export const secondsUntil = (isoTimestamp) => {
  if (!isoTimestamp) return 0;
  return Math.max(0, Math.floor((new Date(isoTimestamp).getTime() - Date.now()) / 1000));
};
