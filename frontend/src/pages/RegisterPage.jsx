import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Film, Lock, Mail, User, Shield, ArrowRight, AlertCircle } from 'lucide-react';

export const RegisterPage = () => {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('Customer');
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(false);

  const { register } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');
    try {
      const res = await register(fullName, email, password, role);
      if (res.success) {
        navigate(role === 'Admin' ? '/admin' : '/');
      }
    } catch (err) {
      setErrorMsg(err.message || 'Registration failed.');
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
          <h1 className="text-2xl font-bold text-white">Create Account</h1>
          <p className="text-xs text-gray-400">Join the movie ticket booking platform</p>
        </div>

        {errorMsg && (
          <div className="p-3 rounded-xl bg-red-950/60 border border-red-500/50 text-red-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div>
            <label className="block text-gray-400 mb-1">Full Name</label>
            <div className="relative">
              <User className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                type="text"
                required
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                className="w-full bg-slate-900/90 pl-10 pr-4 py-3 rounded-xl border border-slate-800 text-gray-200 focus:border-red-500 focus:outline-none"
                placeholder="John Doe"
              />
            </div>
          </div>

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
                placeholder="Minimum 6 characters"
              />
            </div>
          </div>

          <div>
            <label className="block text-gray-400 mb-1">Account Role</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setRole('Customer')}
                className={`p-3 rounded-xl border text-xs font-bold transition-all ${
                  role === 'Customer' ? 'border-red-500 bg-red-950/30 text-white' : 'border-slate-800 bg-slate-900 text-gray-400'
                }`}
              >
                Customer
              </button>
              <button
                type="button"
                onClick={() => setRole('Admin')}
                className={`p-3 rounded-xl border text-xs font-bold transition-all ${
                  role === 'Admin' ? 'border-amber-500 bg-amber-950/30 text-amber-300' : 'border-slate-800 bg-slate-900 text-gray-400'
                }`}
              >
                Admin
              </button>
            </div>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={loading}
              className="w-full btn-primary py-3.5 justify-center font-bold text-sm"
            >
              {loading ? 'Registering...' : <span className="flex items-center gap-2">Create Account <ArrowRight className="w-4 h-4" /></span>}
            </button>
          </div>
        </form>

        <div className="text-center text-xs text-gray-400 border-t border-slate-800 pt-4">
          Already have an account? <Link to="/login" className="text-red-400 font-bold hover:underline">Sign In</Link>
        </div>
      </div>
    </div>
  );
};
