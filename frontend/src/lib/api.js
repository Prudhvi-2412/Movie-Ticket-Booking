const API_BASE = import.meta.env.VITE_API_BASE || '/api';

const TOKEN_KEY = 'cinewave.accessToken';
const REFRESH_KEY = 'cinewave.refreshToken';

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  getRefresh: () => localStorage.getItem(REFRESH_KEY),
  set: (accessToken, refreshToken) => {
    if (accessToken) localStorage.setItem(TOKEN_KEY, accessToken);
    if (refreshToken) localStorage.setItem(REFRESH_KEY, refreshToken);
  },
  clear: () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
  }
};

/**
 * Error carrying the server's message and status so callers can react to a
 * specific failure (409 seat conflict, 410 expired hold) instead of only
 * being able to show a generic string.
 */
export class ApiError extends Error {
  constructor(message, { status, code, details, body } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.body = body;
  }

  get isAuthError() { return this.status === 401 || this.status === 403; }
  get isConflict() { return this.status === 409; }
  get isExpired() { return this.status === 410 || this.code === 'HOLD_EXPIRED' || this.code === 'SEAT_HOLD_LOST'; }
}

/** Called when refresh fails, so AuthContext can clear its state. */
let onUnauthenticated = () => {};
export const setUnauthenticatedHandler = (fn) => { onUnauthenticated = fn; };

/**
 * Concurrent 401s must not each fire their own refresh — the first would
 * rotate the token and the rest would then present a stale one and log the
 * user out. They all await the same in-flight promise instead.
 */
let refreshPromise = null;

const refreshAccessToken = async () => {
  if (refreshPromise) return refreshPromise;

  const refreshToken = tokenStore.getRefresh();
  if (!refreshToken) return null;

  refreshPromise = (async () => {
    try {
      const res = await fetch(`${API_BASE}/auth/refresh-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: refreshToken })
      });
      if (!res.ok) throw new Error('refresh failed');
      const data = await res.json();
      tokenStore.set(data.accessToken, data.refreshToken);
      return data.accessToken;
    } catch {
      tokenStore.clear();
      onUnauthenticated();
      return null;
    } finally {
      // Cleared on the next tick so callers awaiting it still read the result.
      setTimeout(() => { refreshPromise = null; }, 0);
    }
  })();

  return refreshPromise;
};

const request = async (method, path, { body, signal, retry = true, auth = true } = {}) => {
  const token = tokenStore.get();

  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth && token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      signal,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {})
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    // fetch only rejects on a network-level failure.
    throw new ApiError('Could not reach the server. Check your connection and try again.', { status: 0 });
  }

  // 204 and other empty bodies would blow up JSON.parse.
  const text = await res.text();
  let data = null;
  if (text) {
    try { data = JSON.parse(text); } catch { data = null; }
  }

  if (res.status === 401 && retry && auth && data?.code === 'TOKEN_EXPIRED') {
    const fresh = await refreshAccessToken();
    if (fresh) return request(method, path, { body, signal, retry: false, auth });
  }

  if (!res.ok) {
    if (res.status === 401 && auth) {
      tokenStore.clear();
      onUnauthenticated();
    }
    throw new ApiError(data?.message || `Request failed (${res.status})`, {
      status: res.status,
      code: data?.code,
      details: data?.details,
      body: data
    });
  }

  return data;
};

/**
 * True when a request was cancelled rather than failing.
 *
 * An aborted request must leave the caller's loading flag alone: clearing it
 * renders the "loaded" branch with no data. React 18 StrictMode double-mounts
 * effects in development and aborts the first run, so this happens on the
 * very first render of every page that cancels in its cleanup.
 */
export const isAbortError = (err) => err?.name === 'AbortError';

/** Serialises params, dropping empty values so `?genre=` never appears. */
export const buildQuery = (params = {}) => {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '' || value === 'All') return;
    search.append(key, value);
  });
  const str = search.toString();
  return str ? `?${str}` : '';
};

export const api = {
  /**
   * /health sits outside the /api prefix, so it needs its own call rather
   * than a path that relies on the browser normalising "/api/../health".
   */
  health: async () => {
    const res = await fetch(API_BASE.replace(/\/api$/, '') + '/health', {
      headers: { Accept: 'application/json' }
    });
    return res.json();
  },

  get: (path, options) => request('GET', path, options),
  post: (path, body, options) => request('POST', path, { ...options, body: body ?? {} }),
  put: (path, body, options) => request('PUT', path, { ...options, body: body ?? {} }),
  patch: (path, body, options) => request('PATCH', path, { ...options, body: body ?? {} }),
  delete: (path, options) => request('DELETE', path, options)
};
