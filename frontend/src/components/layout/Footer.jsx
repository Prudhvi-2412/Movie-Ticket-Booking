import { Link } from 'react-router-dom';
import { Ticket, Github } from 'lucide-react';

const COLUMNS = [
  {
    title: 'Browse',
    links: [
      { to: '/movies', label: 'All movies' },
      { to: '/movies?status=NowShowing', label: 'Now showing' },
      { to: '/movies?status=ComingSoon', label: 'Coming soon' },
      { to: '/theatres', label: 'Theatres' }
    ]
  },
  {
    title: 'Account',
    links: [
      { to: '/bookings', label: 'My bookings' },
      { to: '/profile', label: 'Profile' },
      { to: '/login', label: 'Sign in' },
      { to: '/register', label: 'Create account' }
    ]
  }
];

export function Footer() {
  return (
    <footer className="mt-auto border-t border-ink-800 bg-ink-900/60">
      <div className="page py-12">
        <div className="grid gap-10 md:grid-cols-4">
          <div className="md:col-span-2">
            <Link to="/" className="flex items-center gap-2.5 mb-4 w-fit">
              <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500 to-ember-500 grid place-items-center">
                <Ticket className="w-5 h-5 text-white" aria-hidden />
              </span>
              <span className="text-lg font-extrabold tracking-tight">
                Cine<span className="text-gradient">Wave</span>
              </span>
            </Link>
            <p className="text-sm text-ink-400 max-w-sm leading-relaxed">
              Book cinema tickets across India. Real-time seat availability,
              held for you while you check out, and a ticket on your phone the
              moment you pay.
            </p>
          </div>

          {COLUMNS.map((col) => (
            <div key={col.title}>
              <h3 className="text-xs font-bold uppercase tracking-wider text-ink-200 mb-3.5">{col.title}</h3>
              <ul className="space-y-2.5">
                {col.links.map((link) => (
                  <li key={link.to + link.label}>
                    <Link to={link.to} className="text-sm text-ink-400 hover:text-brand-400 transition-colors">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-10 pt-6 border-t border-ink-800 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-ink-500">
            © {new Date().getFullYear()} CineWave. A demonstration booking platform.
          </p>
          <a
            href="https://github.com/Prudhvi-2412/Movie-Ticket-Booking"
            target="_blank"
            rel="noreferrer noopener"
            className="flex items-center gap-1.5 text-xs text-ink-500 hover:text-ink-200 transition-colors"
          >
            <Github className="w-3.5 h-3.5" aria-hidden /> Source
          </a>
        </div>
      </div>
    </footer>
  );
}
