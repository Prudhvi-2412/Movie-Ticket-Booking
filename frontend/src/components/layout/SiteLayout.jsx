import { Outlet, useLocation } from 'react-router-dom';
import { Navbar } from './Navbar';
import { Footer } from './Footer';
import { LocationPicker } from '../LocationPicker';
import { ScrollToTop } from '../ScrollToTop';

/**
 * Shell for every customer-facing page.
 *
 * The checkout flow hides the footer: on a page with a running seat-hold
 * countdown, marketing links below the fold are a distraction and push the
 * pay button off screen on mobile.
 */
export function SiteLayout() {
  const { pathname } = useLocation();
  const isCheckoutFlow = /^\/(booking|checkout|payment)\//.test(pathname);

  return (
    <div className="min-h-screen flex flex-col bg-ink-950">
      <ScrollToTop />
      <Navbar />
      <main className="flex-1">
        <Outlet />
      </main>
      {!isCheckoutFlow && <Footer />}
      <LocationPicker />
    </div>
  );
}
