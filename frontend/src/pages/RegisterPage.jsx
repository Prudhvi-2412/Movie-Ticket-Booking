import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Ticket, UserPlus, AlertTriangle, Check, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Button, Field, Input, cx } from '../components/ui';

const RULES = [
  { id: 'length', label: 'At least 8 characters', test: (p) => p.length >= 8 },
  { id: 'lower', label: 'A lowercase letter', test: (p) => /[a-z]/.test(p) },
  { id: 'upper', label: 'An uppercase letter', test: (p) => /[A-Z]/.test(p) },
  { id: 'digit', label: 'A number', test: (p) => /[0-9]/.test(p) }
];

export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const routerLocation = useLocation();
  const toast = useToast();

  const [form, setForm] = useState({ full_name: '', email: '', phone: '', password: '', confirm: '' });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const redirectTo = routerLocation.state?.from?.pathname || '/';

  const validate = () => {
    const next = {};
    if (form.full_name.trim().length < 2) next.full_name = 'Please enter your full name.';
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email)) next.email = 'Enter a valid email address.';
    if (form.phone && !/^[0-9+\- ]{7,20}$/.test(form.phone)) next.phone = 'Enter a valid phone number.';
    // Mirrors the server's Joi rules so the failure is caught before the round trip.
    const failed = RULES.find((r) => !r.test(form.password));
    if (failed) next.password = `Password needs: ${failed.label.toLowerCase()}.`;
    if (form.password !== form.confirm) next.confirm = 'Passwords do not match.';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async (e) => {
    e.preventDefault();
    setFormError('');
    if (!validate()) return;

    setSubmitting(true);
    try {
      const user = await register({
        full_name: form.full_name.trim(),
        email: form.email.trim().toLowerCase(),
        password: form.password,
        ...(form.phone.trim() ? { phone: form.phone.trim() } : {})
      });
      toast.success(`Welcome to CineWave, ${user.full_name.split(' ')[0]}.`);
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setFormError(err.message || 'We could not create your account. Please try again.');
    } finally {
      setSubmitting(false);
    }
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
          <h1 className="text-2xl font-extrabold tracking-tight">Create your account</h1>
          <p className="text-sm text-ink-400 mt-1.5">Book in seconds and keep every ticket in one place.</p>
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

          <Field label="Full name" required error={errors.full_name}>
            <Input
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              placeholder="Aarav Sharma"
              autoComplete="name"
              autoFocus
            />
          </Field>

          <Field label="Email" required error={errors.email}>
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="you@example.com"
              autoComplete="email"
            />
          </Field>

          <Field label="Phone" error={errors.phone} hint="Optional. Stored encrypted.">
            <Input
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="9876543210"
              autoComplete="tel"
            />
          </Field>

          <Field label="Password" required error={errors.password}>
            <Input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder="••••••••"
              autoComplete="new-password"
            />
          </Field>

          {form.password && (
            <ul className="grid grid-cols-2 gap-1.5 -mt-2" aria-label="Password requirements">
              {RULES.map((rule) => {
                const ok = rule.test(form.password);
                return (
                  <li
                    key={rule.id}
                    className={cx('flex items-center gap-1.5 text-2xs', ok ? 'text-positive-400' : 'text-ink-500')}
                  >
                    {ok ? <Check className="w-3 h-3" aria-hidden /> : <X className="w-3 h-3" aria-hidden />}
                    {rule.label}
                  </li>
                );
              })}
            </ul>
          )}

          <Field label="Confirm password" required error={errors.confirm}>
            <Input
              type="password"
              value={form.confirm}
              onChange={(e) => setForm({ ...form, confirm: e.target.value })}
              placeholder="••••••••"
              autoComplete="new-password"
            />
          </Field>

          <Button type="submit" loading={submitting} size="lg" className="w-full justify-center" icon={UserPlus}>
            Create account
          </Button>

          <p className="text-center text-sm text-ink-400">
            Already have an account?{' '}
            <Link to="/login" className="text-brand-400 font-semibold hover:underline">Sign in</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
