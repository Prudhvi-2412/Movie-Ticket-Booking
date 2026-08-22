import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { api, tokenStore, setUnauthenticatedHandler } from '../lib/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  // `loading` starts true so guarded routes wait for the session check instead
  // of bouncing an authenticated user to /login on every refresh.
  const [loading, setLoading] = useState(true);

  const clearSession = useCallback(() => {
    tokenStore.clear();
    setUser(null);
  }, []);

  useEffect(() => {
    // Lets the API client tell us when a refresh failed for good.
    setUnauthenticatedHandler(() => setUser(null));
  }, []);

  useEffect(() => {
    let cancelled = false;

    const restore = async () => {
      if (!tokenStore.get()) {
        setLoading(false);
        return;
      }
      try {
        const res = await api.get('/auth/me');
        if (!cancelled && res?.success) setUser(res.user);
      } catch {
        // Expired or revoked — the API client has already cleared the tokens.
        if (!cancelled) clearSession();
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    restore();
    return () => { cancelled = true; };
  }, [clearSession]);

  const login = useCallback(async (email, password) => {
    const res = await api.post('/auth/login', { email, password }, { auth: false });
    tokenStore.set(res.accessToken, res.refreshToken);
    setUser(res.user);
    return res.user;
  }, []);

  const register = useCallback(async (payload) => {
    const res = await api.post('/auth/register', payload, { auth: false });
    tokenStore.set(res.accessToken, res.refreshToken);
    setUser(res.user);
    return res.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // Signing out locally must succeed even if the server call does not.
    }
    clearSession();
  }, [clearSession]);

  const updateProfile = useCallback(async (payload) => {
    const res = await api.put('/auth/me', payload);
    setUser(res.user);
    return res.user;
  }, []);

  const changePassword = useCallback(async (currentPassword, newPassword) => {
    // Rotating the password revokes every refresh token, this session included.
    await api.put('/auth/password', { current_password: currentPassword, new_password: newPassword });
  }, []);

  const value = useMemo(() => ({
    user,
    loading,
    isAuthenticated: !!user,
    isAdmin: user?.role === 'Admin',
    login,
    register,
    logout,
    updateProfile,
    changePassword,
    refreshUser: async () => {
      const res = await api.get('/auth/me');
      setUser(res.user);
      return res.user;
    }
  }), [user, loading, login, register, logout, updateProfile, changePassword]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside an AuthProvider');
  return ctx;
};
