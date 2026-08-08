import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Film, Search, Shield, LogOut, Ticket, Command, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const Navbar = ({ searchQuery, setSearchQuery }) => {
  const { user, logout, isAdmin } = useAuth();
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [localSearch, setLocalSearch] = useState('');

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsSearchOpen(prev => !prev);
      }
      if (e.key === 'Escape') setIsSearchOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (setSearchQuery) setSearchQuery(localSearch);
    setIsSearchOpen(false);
  };

  return (
    <>
      <nav className="glass-slate-nav sticky top-0 z-50 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          
          {/* Logo */}
          <Link to="/" className="flex items-center gap-3 group">
            <div className="relative w-10 h-10 rounded-xl bg-gradient-to-tr from-[#FF0055] to-[#FF5202] flex items-center justify-center shadow-crimson-glow group-hover:scale-105 transition-transform">
              <Film className="w-5 h-5 text-white" />
            </div>
            <div>
              <span className="text-xl font-black tracking-tight text-white">
                CineWave
              </span>
            </div>
          </Link>

          {/* Search Bar */}
          <div
            onClick={() => setIsSearchOpen(true)}
            className="flex-1 max-w-md relative hidden sm:flex items-center justify-between glass-slate-pill px-4 py-2 rounded-xl text-xs text-[#8B949E] cursor-pointer hover:border-[#FF0055]/50 hover:text-white transition-all"
          >
            <div className="flex items-center gap-2.5">
              <Search className="w-4 h-4 text-[#8B949E]" />
              <span>Search movies, cinemas, languages...</span>
            </div>
            <kbd className="bg-[#30363D] px-2 py-0.5 rounded text-[10px] font-mono text-[#F0F6FC] flex items-center gap-0.5">
              <Command className="w-3 h-3" /> K
            </kbd>
          </div>

          {/* Right Action Menu */}
          <div className="flex items-center gap-3">
            {user ? (
              <>
                {isAdmin && (
                  <Link to="/admin" className="btn-frosted-slate py-2 px-3.5 text-xs text-[#FFD700] border-[#FFD700]/30 hover:bg-[#FFD700]/10">
                    <Shield className="w-4 h-4 text-[#FFD700]" />
                    Admin
                  </Link>
                )}
                <Link to="/dashboard" className="btn-frosted-slate py-2 px-3.5 text-xs">
                  <Ticket className="w-4 h-4 text-[#FF0055]" />
                  My Tickets
                </Link>
                <div className="flex items-center gap-2.5 pl-2 border-l border-[#30363D]">
                  <div className="w-9 h-9 rounded-xl bg-[#21262D] border border-[#30363D] flex items-center justify-center font-bold text-xs text-[#FF0055]">
                    {user.full_name.charAt(0).toUpperCase()}
                  </div>
                  <button onClick={logout} className="p-2 text-[#8B949E] hover:text-[#FF0055] transition-colors" title="Sign Out">
                    <LogOut className="w-4 h-4" />
                  </button>
                </div>
              </>
            ) : (
              <div className="flex items-center gap-2.5">
                <Link to="/login" className="btn-frosted-slate py-2.5 px-5 text-xs">
                  Sign In
                </Link>
                <Link to="/register" className="btn-electric-crimson py-2.5 px-5 text-xs">
                  Get Started
                </Link>
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* Search Modal */}
      {isSearchOpen && (
        <div className="fixed inset-0 z-50 bg-[#0D1117]/90 backdrop-blur-xl flex items-start justify-center pt-24 px-4">
          <div className="glass-slate-card max-w-2xl w-full p-6 space-y-4 border border-[#FF0055]/30 shadow-2xl relative">
            <div className="flex items-center justify-between border-b border-[#30363D] pb-4">
              <form onSubmit={handleSearchSubmit} className="flex-1 flex items-center gap-3">
                <Search className="w-5 h-5 text-[#FF0055]" />
                <input
                  type="text"
                  autoFocus
                  placeholder="Type to search movies, genres..."
                  value={localSearch}
                  onChange={(e) => setLocalSearch(e.target.value)}
                  className="w-full bg-transparent text-sm text-[#F0F6FC] placeholder-[#8B949E] focus:outline-none font-medium"
                />
              </form>
              <button onClick={() => setIsSearchOpen(false)} className="p-1 text-[#8B949E] hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2 text-xs">
              <span className="text-[#8B949E] uppercase tracking-widest text-[10px] font-bold block">Popular Searches</span>
              <div className="flex flex-wrap gap-2">
                {['Dune: Part Two', 'Oppenheimer', 'Jawan', 'Interstellar', 'Action', 'Sci-Fi'].map(query => (
                  <button
                    key={query}
                    onClick={() => {
                      if (setSearchQuery) setSearchQuery(query);
                      setIsSearchOpen(false);
                    }}
                    className="glass-slate-pill px-3 py-1.5 rounded-lg text-[#F0F6FC] hover:border-[#FF0055]/50 transition-all"
                  >
                    {query}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
