import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Film, Lock, Mail, ArrowRight, AlertCircle } from 'lucide-react';

export const LoginPage = () => {
  const [email, setEmail] = useState('aarav.sharma@example.com');
  const [password, setPassword] = useState('password123');
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');
    try {
      const res = await login(email, password);
      if (res.success) {
        navigate(res.user.role === 'Admin' ? '/admin' : '/');
      }
    } catch (err) {
      setErrorMsg(err.message || 'Login failed. Invalid credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0b0f19] flex items-center justify-center p-6 text-gray-100">
      <div className="glass-panel p-8 md:p-10 rounded-3xl max-w-md w-full border border-slate-800 space-y-6 shadow-2xl">
        <div className="text-center space-y-2">
          <Link to="/" className="inline-flex items-center gap-2 mb-2">
            <div className="w-10 h-10 rounded-xl bg-red-600 flex items-center justify-center">
              <Film className="w-6 h-6 text-white" />
            </div>
            <span className="text-xl font-black text-white">CineWave</span>
          </Link>
          <h1 className="text-2xl font-bold text-white">Welcome Back</h1>
          <p className="text-xs text-gray-400">Sign in to access seat reservations & ticket history</p>
        </div>

        {errorMsg && (
          <div className="p-3 rounded-xl bg-red-950/60 border border-red-500/50 text-red-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div>
            <label className="block text-gray-400 mb-1">Email Address</label>
            <div className="relative">
              <Mail className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full bg-slate-900/90 pl-10 pr-4 py-3 rounded-xl border border-slate-800 text-gray-200 focus:border-red-500 focus:outline-none"
                placeholder="your.email@example.com"
              />
            </div>
          </div>

          <div>
            <label className="block text-gray-400 mb-1">Password</label>
            <div className="relative">
              <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                type="password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full bg-slate-900/90 pl-10 pr-4 py-3 rounded-xl border border-slate-800 text-gray-200 focus:border-red-500 focus:outline-none"
                placeholder="••••••••"
              />
            </div>
          </div>

          <div className="pt-2 flex flex-col gap-2">
            <button
              type="submit"
              disabled={loading}
              className="w-full btn-primary py-3.5 justify-center font-bold text-sm"
            >
              {loading ? 'Signing In...' : <span className="flex items-center gap-2">Sign In <ArrowRight className="w-4 h-4" /></span>}
            </button>

            <div className="flex gap-2 pt-2 text-[11px] text-gray-400 justify-center">
              <span>Quick Login Credentials:</span>
              <button type="button" onClick={() => { setEmail('aarav.sharma@example.com'); setPassword('password123'); }} className="text-red-400 hover:underline">Customer</button>
              <span>•</span>
              <button type="button" onClick={() => { setEmail('admin@moviebooking.com'); setPassword('Admin@123'); }} className="text-amber-400 hover:underline">Admin</button>
            </div>
          </div>
        </form>

        <div className="text-center text-xs text-gray-400 border-t border-slate-800 pt-4">
          Don't have an account? <Link to="/register" className="text-red-400 font-bold hover:underline">Register Now</Link>
        </div>
      </div>
    </div>
  );
};
