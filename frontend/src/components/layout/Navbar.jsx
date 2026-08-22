import { useState, useRef, useEffect } from 'react';
import { Link, NavLink, useNavigate, useLocation } from 'react-router-dom';
import {
  MapPin, Menu, X, Ticket, User, LogOut, LayoutDashboard, ChevronDown, Film, Building2
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useLocationContext } from '../../context/LocationContext';
import { GlobalSearch } from '../GlobalSearch';
import { initials } from '../../lib/format';
import { useClickOutside, cx } from '../ui';

const NAV_LINKS = [
  { to: '/movies', label: 'Movies', icon: Film },
  { to: '/theatres', label: 'Theatres', icon: Building2 },
  { to: '/bookings', label: 'My Bookings', icon: Ticket, authOnly: true }
];

export function Navbar() {
  const { user, isAuthenticated, isAdmin, logout } = useAuth();
  const { city, openPicker } = useLocationContext();
  const navigate = useNavigate();
  const routerLocation = useLocation();

  const [menuOpen, setMenuOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const accountRef = useRef(null);

  useClickOutside(accountRef, () => setAccountOpen(false));

  // Close the mobile drawer on navigation, otherwise it covers the new page.
  useEffect(() => { setMenuOpen(false); }, [routerLocation.pathname]);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [menuOpen]);

  const handleLogout = async () => {
    await logout();
    setAccountOpen(false);
    navigate('/');
  };

  const visibleLinks = NAV_LINKS.filter((l) => !l.authOnly || isAuthenticated);

  return (
    <header className="sticky top-0 z-40 border-b border-ink-800 bg-ink-950/85 backdrop-blur-xl">
      <div className="page">
        <div className="flex items-center gap-3 sm:gap-5 h-16">
          {/* Brand */}
          <Link to="/" className="flex items-center gap-2.5 shrink-0" aria-label="CineWave home">
            <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500 to-ember-500 grid place-items-center shadow-brand">
              <Ticket className="w-5 h-5 text-white" aria-hidden />
            </span>
            <span className="hidden sm:block text-lg font-extrabold tracking-tight">
              Cine<span className="text-gradient">Wave</span>
            </span>
          </Link>

          {/* City */}
          <button
            onClick={openPicker}
            className="flex items-center gap-1.5 px-2.5 sm:px-3 h-10 rounded-xl border border-ink-700
                       bg-ink-850 text-sm text-ink-100 hover:border-ink-500 transition-colors shrink-0"
            aria-label={city ? `Selected city: ${city}. Change city` : 'Choose your city'}
          >
            <MapPin className="w-4 h-4 text-brand-500" aria-hidden />
            <span className="hidden sm:inline max-w-[7rem] truncate font-medium">{city || 'Select city'}</span>
            <ChevronDown className="w-3.5 h-3.5 text-ink-400" aria-hidden />
          </button>

          {/* Search — grows to fill the row on desktop */}
          <GlobalSearch className="hidden md:block flex-1 max-w-md" />

          <div className="flex-1 md:hidden" />

          {/* Desktop nav */}
          <nav className="hidden lg:flex items-center gap-1" aria-label="Main">
            {visibleLinks.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) => cx(
                  'px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                  isActive ? 'text-brand-400 bg-brand-500/10' : 'text-ink-300 hover:text-ink-50 hover:bg-ink-850'
                )}
              >
                {link.label}
              </NavLink>
            ))}
          </nav>

          {/* Account */}
          {isAuthenticated ? (
            <div ref={accountRef} className="relative shrink-0">
              <button
                onClick={() => setAccountOpen((o) => !o)}
                className="flex items-center gap-2 h-10 pl-1 pr-2 rounded-xl hover:bg-ink-850 transition-colors"
                aria-expanded={accountOpen}
                aria-haspopup="menu"
                aria-label="Account menu"
              >
                <span className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-500 to-ember-500
                                 grid place-items-center text-2xs font-bold text-white">
                  {initials(user.full_name)}
                </span>
                <ChevronDown className="w-3.5 h-3.5 text-ink-400 hidden sm:block" aria-hidden />
              </button>

              {accountOpen && (
                <div
                  role="menu"
                  className="absolute right-0 top-full mt-2 w-60 bg-ink-850 border border-ink-700
                             rounded-xl shadow-lift p-1.5 animate-scale-in z-50"
                >
                  <div className="px-3 py-2.5 border-b border-ink-700 mb-1">
                    <p className="text-sm font-semibold text-ink-50 truncate">{user.full_name}</p>
                    <p className="text-xs text-ink-400 truncate">{user.email}</p>
                    {isAdmin && <span className="badge-brand mt-2">Administrator</span>}
                  </div>

                  {isAdmin && (
                    <Link
                      to="/admin"
                      role="menuitem"
                      onClick={() => setAccountOpen(false)}
                      className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-ink-200 hover:bg-ink-800"
                    >
                      <LayoutDashboard className="w-4 h-4 text-ink-400" aria-hidden /> Admin dashboard
                    </Link>
                  )}
                  <Link
                    to="/bookings"
                    role="menuitem"
                    onClick={() => setAccountOpen(false)}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-ink-200 hover:bg-ink-800"
                  >
                    <Ticket className="w-4 h-4 text-ink-400" aria-hidden /> My bookings
                  </Link>
                  <Link
                    to="/profile"
                    role="menuitem"
                    onClick={() => setAccountOpen(false)}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-ink-200 hover:bg-ink-800"
                  >
                    <User className="w-4 h-4 text-ink-400" aria-hidden /> Profile
                  </Link>
                  <button
                    role="menuitem"
                    onClick={handleLogout}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm
                               text-negative-400 hover:bg-negative-500/10 mt-1 border-t border-ink-700 pt-2.5"
                  >
                    <LogOut className="w-4 h-4" aria-hidden /> Sign out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <Link to="/login" className="btn-primary btn-sm shrink-0">Sign in</Link>
          )}

          {/* Mobile menu toggle */}
          <button
            onClick={() => setMenuOpen((o) => !o)}
            className="lg:hidden btn-ghost btn-sm -mr-2"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
          >
            {menuOpen ? <X className="w-5 h-5" aria-hidden /> : <Menu className="w-5 h-5" aria-hidden />}
          </button>
        </div>

        {/* Mobile search sits on its own row so it gets full width */}
        <div className="md:hidden pb-3">
          <GlobalSearch />
        </div>
      </div>

      {/* Mobile drawer */}
      {menuOpen && (
        <div className="lg:hidden border-t border-ink-800 bg-ink-950 animate-slide-up">
          <nav className="page py-3 flex flex-col gap-1" aria-label="Mobile">
            {visibleLinks.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) => cx(
                  'flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium transition-colors',
                  isActive ? 'text-brand-400 bg-brand-500/10' : 'text-ink-200 hover:bg-ink-850'
                )}
              >
                <link.icon className="w-4 h-4" aria-hidden /> {link.label}
              </NavLink>
            ))}
            {isAdmin && (
              <NavLink
                to="/admin"
                className="flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium text-ink-200 hover:bg-ink-850"
              >
                <LayoutDashboard className="w-4 h-4" aria-hidden /> Admin dashboard
              </NavLink>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}
