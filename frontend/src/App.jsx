import { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

import { AuthProvider } from './context/AuthContext';
import { LocationProvider } from './context/LocationContext';
import { ToastProvider } from './context/ToastContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ProtectedRoute } from './components/ProtectedRoute';
import { SiteLayout } from './components/layout/SiteLayout';
import { LoadingBlock } from './components/ui';

// Customer pages load eagerly — they are the common path and small.
import { HomePage } from './pages/HomePage';
import { MoviesPage } from './pages/MoviesPage';
import { MovieDetailsPage } from './pages/MovieDetailsPage';
import { TheatresPage } from './pages/TheatresPage';
import { TheatreDetailsPage } from './pages/TheatreDetailsPage';
import { SeatSelectionPage } from './pages/SeatSelectionPage';
import { CheckoutPage } from './pages/CheckoutPage';
import { PaymentPage } from './pages/PaymentPage';
import { BookingConfirmationPage } from './pages/BookingConfirmationPage';
import { TicketPage } from './pages/TicketPage';
import { MyBookingsPage } from './pages/MyBookingsPage';
import { ProfilePage } from './pages/ProfilePage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { NotFoundPage } from './pages/NotFoundPage';

/**
 * The admin console is code-split: most visitors are customers and will never
 * load it, and it pulls in the chart components and every CRUD form.
 */
const AdminLayout = lazy(() => import('./components/layout/AdminLayout').then((m) => ({ default: m.AdminLayout })));
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard').then((m) => ({ default: m.AdminDashboard })));
const AdminMovies = lazy(() => import('./pages/admin/AdminMovies').then((m) => ({ default: m.AdminMovies })));
const AdminLocations = lazy(() => import('./pages/admin/AdminLocations').then((m) => ({ default: m.AdminLocations })));
const AdminTheatres = lazy(() => import('./pages/admin/AdminTheatres').then((m) => ({ default: m.AdminTheatres })));
const AdminScreens = lazy(() => import('./pages/admin/AdminScreens').then((m) => ({ default: m.AdminScreens })));
const AdminSeats = lazy(() => import('./pages/admin/AdminSeats').then((m) => ({ default: m.AdminSeats })));
const AdminShows = lazy(() => import('./pages/admin/AdminShows').then((m) => ({ default: m.AdminShows })));
const AdminPricing = lazy(() => import('./pages/admin/AdminPricing').then((m) => ({ default: m.AdminPricing })));
const AdminBookings = lazy(() => import('./pages/admin/AdminBookings').then((m) => ({ default: m.AdminBookings })));
const AdminUsers = lazy(() => import('./pages/admin/AdminUsers').then((m) => ({ default: m.AdminUsers })));
const AdminAnalytics = lazy(() => import('./pages/admin/AdminAnalytics').then((m) => ({ default: m.AdminAnalytics })));
const AdminSettings = lazy(() => import('./pages/admin/AdminSettings').then((m) => ({ default: m.AdminSettings })));

export function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <ToastProvider>
          <AuthProvider>
            <LocationProvider>
              <Suspense fallback={<LoadingBlock className="min-h-screen" />}>
                <Routes>
                  {/* ---- Customer ------------------------------------- */}
                  <Route element={<SiteLayout />}>
                    <Route index element={<HomePage />} />
                    <Route path="movies" element={<MoviesPage />} />
                    <Route path="movies/:id" element={<MovieDetailsPage />} />
                    <Route path="theatres" element={<TheatresPage />} />
                    <Route path="theatres/:id" element={<TheatreDetailsPage />} />

                    {/* Seat map is public so visitors can look before signing in. */}
                    <Route path="booking/seats/:showId" element={<SeatSelectionPage />} />

                    <Route path="checkout/:showId" element={
                      <ProtectedRoute><CheckoutPage /></ProtectedRoute>
                    } />
                    <Route path="payment/:bookingId" element={
                      <ProtectedRoute><PaymentPage /></ProtectedRoute>
                    } />
                    <Route path="booking/confirmation/:bookingId" element={
                      <ProtectedRoute><BookingConfirmationPage /></ProtectedRoute>
                    } />
                    <Route path="bookings" element={
                      <ProtectedRoute><MyBookingsPage /></ProtectedRoute>
                    } />
                    <Route path="bookings/:bookingId/ticket" element={
                      <ProtectedRoute><TicketPage /></ProtectedRoute>
                    } />
                    <Route path="profile" element={
                      <ProtectedRoute><ProfilePage /></ProtectedRoute>
                    } />

                    <Route path="login" element={<LoginPage />} />
                    <Route path="register" element={<RegisterPage />} />

                    {/* Paths the previous build used, kept so old links resolve. */}
                    <Route path="movie/:id" element={<LegacyMovieRedirect />} />
                    <Route path="dashboard" element={<Navigate to="/bookings" replace />} />

                    <Route path="*" element={<NotFoundPage />} />
                  </Route>

                  {/* ---- Admin ---------------------------------------- */}
                  <Route path="/admin" element={
                    <ProtectedRoute adminOnly><AdminLayout /></ProtectedRoute>
                  }>
                    <Route index element={<AdminDashboard />} />
                    <Route path="movies" element={<AdminMovies />} />
                    <Route path="locations" element={<AdminLocations />} />
                    <Route path="theatres" element={<AdminTheatres />} />
                    <Route path="screens" element={<AdminScreens />} />
                    <Route path="seats" element={<AdminSeats />} />
                    <Route path="shows" element={<AdminShows />} />
                    <Route path="pricing" element={<AdminPricing />} />
                    <Route path="bookings" element={<AdminBookings />} />
                    <Route path="users" element={<AdminUsers />} />
                    <Route path="analytics" element={<AdminAnalytics />} />
                    <Route path="settings" element={<AdminSettings />} />
                    <Route path="*" element={<NotFoundPage />} />
                  </Route>
                </Routes>
              </Suspense>
            </LocationProvider>
          </AuthProvider>
        </ToastProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

/** /movie/:id was the old detail route; forward it to /movies/:id. */
function LegacyMovieRedirect() {
  const id = window.location.pathname.split('/').pop();
  return <Navigate to={`/movies/${id}`} replace />;
}

export default App;
