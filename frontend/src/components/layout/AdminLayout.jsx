import { useState, useEffect } from 'react';
import { Outlet, NavLink, Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Film, MapPin, Building2, MonitorPlay, Armchair, CalendarClock,
  Ticket, Users, BarChart3, Settings, Menu, ExternalLink, LogOut
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { initials } from '../../lib/format';
import { ScrollToTop } from '../ScrollToTop';
import { cx } from '../ui';

const NAV = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { section: 'Catalogue' },
  { to: '/admin/movies', label: 'Movies', icon: Film },
  { to: '/admin/locations', label: 'Locations', icon: MapPin },
  { to: '/admin/theatres', label: 'Theatres', icon: Building2 },
  { to: '/admin/screens', label: 'Screens', icon: MonitorPlay },
  { to: '/admin/seats', label: 'Seats', icon: Armchair },
  { section: 'Programming' },
  { to: '/admin/shows', label: 'Shows', icon: CalendarClock },
  { to: '/admin/pricing', label: 'Pricing', icon: Ticket },
  { section: 'Operations' },
  { to: '/admin/bookings', label: 'Bookings', icon: Ticket },
  { to: '/admin/users', label: 'Users', icon: Users },
  { to: '/admin/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/admin/settings', label: 'Settings', icon: Settings }
];

export function AdminLayout() {
  const { user, logout } = useAuth();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);

  useEffect(() => { setOpen(false); }, [pathname]);

  const sidebar = (
    <nav className="flex flex-col h-full" aria-label="Admin">
      <div className="p-4 border-b border-ink-800">
        <Link to="/admin" className="flex items-center gap-2.5">
          <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500 to-ember-500 grid place-items-center">
            <Ticket className="w-5 h-5 text-white" aria-hidden />
          </span>
          <span>
            <span className="block text-sm font-extrabold tracking-tight leading-tight">
              Cine<span className="text-gradient">Wave</span>
            </span>
            <span className="block text-2xs text-ink-400 font-semibold uppercase tracking-wider">Admin</span>
          </span>
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-0.5">
        {NAV.map((item, i) => {
          if (item.section) {
            return (
              <p
                key={`section-${i}`}
                className="px-3 pt-4 pb-1.5 text-2xs font-bold uppercase tracking-wider text-ink-500"
              >
                {item.section}
              </p>
            );
          }
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => cx(
                'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors',
                isActive
                  ? 'bg-brand-500/12 text-brand-400 border border-brand-500/25'
                  : 'text-ink-300 hover:text-ink-50 hover:bg-ink-800 border border-transparent'
              )}
            >
              <item.icon className="w-4 h-4 shrink-0" aria-hidden />
              {item.label}
            </NavLink>
          );
        })}
      </div>

      <div className="p-3 border-t border-ink-800 space-y-2">
        <Link
          to="/"
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-ink-300 hover:bg-ink-800"
        >
          <ExternalLink className="w-4 h-4" aria-hidden /> View storefront
        </Link>

        <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-ink-800/60">
          <span className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-500 to-ember-500
                           grid place-items-center text-2xs font-bold text-white shrink-0">
            {initials(user?.full_name)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-semibold text-ink-100 truncate">{user?.full_name}</span>
            <span className="block text-2xs text-ink-500 truncate">{user?.email}</span>
          </span>
          <button
            onClick={logout}
            className="p-1.5 rounded-lg text-ink-400 hover:text-negative-400 hover:bg-ink-700 shrink-0"
            aria-label="Sign out"
            title="Sign out"
          >
            <LogOut className="w-4 h-4" aria-hidden />
          </button>
        </div>
      </div>
    </nav>
  );

  return (
    <div className="min-h-screen bg-ink-950 flex">
      <ScrollToTop />

      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-64 shrink-0 border-r border-ink-800 bg-ink-900 sticky top-0 h-screen">
        {sidebar}
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-ink-950/80 backdrop-blur-sm" onClick={() => setOpen(false)} aria-hidden />
          <aside className="relative w-72 max-w-[85vw] bg-ink-900 border-r border-ink-800 animate-slide-in-right">
            {sidebar}
          </aside>
        </div>
      )}

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Mobile top bar */}
        <div className="lg:hidden sticky top-0 z-30 flex items-center gap-3 h-14 px-4
                        border-b border-ink-800 bg-ink-950/90 backdrop-blur-xl">
          <button onClick={() => setOpen(true)} className="btn-ghost btn-sm -ml-2" aria-label="Open admin menu">
            <Menu className="w-5 h-5" aria-hidden />
          </button>
          <span className="text-sm font-bold">CineWave Admin</span>
        </div>

        <main className="flex-1 p-4 sm:p-6 lg:p-8 min-w-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
