import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Film, Search, User, Shield, LogOut, Ticket, Cpu } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const Navbar = ({ searchQuery, setSearchQuery }) => {
  const { user, logout, isAdmin } = useAuth();
  const navigate = useNavigate();

  return (
    <nav className="glass-nav sticky top-0 z-50 px-6 py-4 transition-all">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
        {/* Brand Logo */}
        <Link to="/" className="flex items-center gap-3 group">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-red-600 to-rose-500 flex items-center justify-center shadow-lg shadow-red-900/40 group-hover:scale-105 transition-transform">
            <Film className="w-6 h-6 text-white" />
          </div>
          <div>
            <span className="text-xl font-extrabold tracking-tight text-white flex items-center gap-1.5">
              CineWave <span className="text-xs px-2 py-0.5 rounded-full bg-red-950 text-red-400 border border-red-800/50 font-medium">DISTRIBUTED</span>
            </span>
            <p className="text-[10px] text-gray-400 -mt-1 font-mono">Redis Lock • Kafka • MySQL</p>
          </div>
        </Link>

        {/* Global Search Bar */}
        <div className="flex-1 max-w-md relative hidden md:block">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search movies, genres, languages..."
            value={searchQuery || ''}
            onChange={(e) => setSearchQuery && setSearchQuery(e.target.value)}
            className="w-full bg-slate-900/80 text-sm text-gray-200 pl-10 pr-4 py-2.5 rounded-full border border-slate-700/60 focus:border-red-500 focus:outline-none transition-all placeholder:text-gray-500"
          />
        </div>

        {/* Right Action Controls */}
        <div className="flex items-center gap-3">
          {user ? (
            <>
              {isAdmin && (
                <Link to="/admin" className="btn-secondary py-2 px-3 text-xs text-amber-400 border-amber-500/30 hover:bg-amber-500/10">
                  <Shield className="w-3.5 h-3.5 text-amber-400" />
                  Admin Portal
                </Link>
              )}

              <Link to="/dashboard" className="btn-secondary py-2 px-3 text-xs">
                <Ticket className="w-3.5 h-3.5 text-red-400" />
                My Bookings
              </Link>

              <div className="flex items-center gap-2 pl-2 border-l border-slate-800">
                <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-xs text-red-400">
                  {user.full_name.charAt(0).toUpperCase()}
                </div>
                <button onClick={logout} className="p-2 text-gray-400 hover:text-red-400 transition-colors" title="Logout">
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <Link to="/login" className="btn-secondary py-2 px-4 text-xs">
                Login
              </Link>
              <Link to="/register" className="btn-primary py-2 px-4 text-xs">
                Get Started
              </Link>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
};
