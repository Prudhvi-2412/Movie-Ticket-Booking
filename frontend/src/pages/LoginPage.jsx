import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Ticket, LogIn, AlertTriangle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Button, Field, Input } from '../components/ui';

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const routerLocation = useLocation();
  const toast = useToast();

  const [form, setForm] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Where the guard sent us from, so we can return there after signing in.
  const redirectTo = routerLocation.state?.from?.pathname || '/';

  const validate = () => {
    const next = {};
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email)) next.email = 'Enter a valid email address.';
    if (!form.password) next.password = 'Enter your password.';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async (e) => {
    e.preventDefault();
    setFormError('');
    if (!validate()) return;

    setSubmitting(true);
    try {
      const user = await login(form.email.trim().toLowerCase(), form.password);
      toast.success(`Welcome back, ${user.full_name.split(' ')[0]}.`);
      // An admin signing in from the landing page belongs in the dashboard.
      navigate(redirectTo === '/' && user.role === 'Admin' ? '/admin' : redirectTo, { replace: true });
    } catch (err) {
      setFormError(err.message || 'We could not sign you in. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const fillDemo = (email) => {
    setForm({ email, password: email.startsWith('admin') ? 'Admin@123' : 'Customer@123' });
    setErrors({});
    setFormError('');
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] grid place-items-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center gap-2.5 mb-6">
            <span className="w-11 h-11 rounded-xl bg-gradient-to-br from-brand-500 to-ember-500
                             grid place-items-center shadow-brand">
              <Ticket className="w-6 h-6 text-white" aria-hidden />
            </span>
            <span className="text-xl font-extrabold tracking-tight">
              Cine<span className="text-gradient">Wave</span>
            </span>
          </Link>
          <h1 className="text-2xl font-extrabold tracking-tight">Welcome back</h1>
          <p className="text-sm text-ink-400 mt-1.5">Sign in to book tickets and view your bookings.</p>
        </div>

        <form onSubmit={submit} className="surface p-6 space-y-5" noValidate>
          {formError && (
            <div
              role="alert"
              className="flex items-start gap-2.5 rounded-xl border border-negative-500/40
                         bg-negative-500/10 p-3.5 text-sm text-negative-400"
            >
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />
              <span>{formError}</span>
            </div>
          )}

          <Field label="Email" required error={errors.email}>
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="you@example.com"
              autoComplete="email"
              autoFocus
            />
          </Field>

          <Field label="Password" required error={errors.password}>
            <Input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder="••••••••"
              autoComplete="current-password"
            />
          </Field>

          <Button type="submit" loading={submitting} size="lg" className="w-full justify-center" icon={LogIn}>
            Sign in
          </Button>

          <p className="text-center text-sm text-ink-400">
            New to CineWave?{' '}
            <Link to="/register" className="text-brand-400 font-semibold hover:underline">
              Create an account
            </Link>
          </p>
        </form>

        {/*
          Development conveniences. The seed script creates these accounts; in
          a real deployment this block would be removed along with the seed.
        */}
        {import.meta.env.DEV && (
          <div className="surface p-4 mt-4">
            <p className="text-2xs uppercase tracking-wide text-ink-500 font-semibold mb-2.5">
              Demo accounts
            </p>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => fillDemo('admin@cinewave.com')}
                className="text-left text-xs text-ink-300 hover:text-brand-400 transition-colors"
              >
                <span className="font-semibold">Admin</span> — admin@cinewave.com / Admin@123
              </button>
              <button
                type="button"
                onClick={() => fillDemo('aarav@example.com')}
                className="text-left text-xs text-ink-300 hover:text-brand-400 transition-colors"
              >
                <span className="font-semibold">Customer</span> — aarav@example.com / Customer@123
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
