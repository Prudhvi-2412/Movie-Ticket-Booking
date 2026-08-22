import { useState, useEffect } from 'react';
import { User, Lock, Ticket, Save, Mail } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { formatCurrency, formatDate, initials } from '../lib/format';
import { Button, Field, Input, Tabs, Skeleton } from '../components/ui';

const TABS = [
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'security', label: 'Security', icon: Lock },
  { id: 'activity', label: 'Activity', icon: Ticket }
];

export function ProfilePage() {
  const { user, updateProfile, changePassword, logout } = useAuth();
  const toast = useToast();

  const [tab, setTab] = useState('profile');

  return (
    <div className="page py-8 max-w-3xl">
      <div className="flex items-center gap-4 mb-7">
        <span className="w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-500 to-ember-500
                         grid place-items-center text-xl font-bold text-white shrink-0">
          {initials(user.full_name)}
        </span>
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold tracking-tight truncate">{user.full_name}</h1>
          <p className="text-sm text-ink-400 flex items-center gap-1.5 mt-0.5 truncate">
            <Mail className="w-3.5 h-3.5 shrink-0" aria-hidden /> {user.email}
          </p>
          {user.role === 'Admin' && <span className="badge-brand mt-2">Administrator</span>}
        </div>
      </div>

      <Tabs tabs={TABS} value={tab} onChange={setTab} className="mb-6" />

      {tab === 'profile' && <ProfileForm user={user} updateProfile={updateProfile} toast={toast} />}
      {tab === 'security' && <SecurityForm changePassword={changePassword} toast={toast} logout={logout} />}
      {tab === 'activity' && <ActivitySummary />}
    </div>
  );
}

function ProfileForm({ user, updateProfile, toast }) {
  const [form, setForm] = useState({
    full_name: user.full_name || '',
    phone: user.phone || '',
    avatar_url: user.avatar_url || ''
  });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const validate = () => {
    const next = {};
    if (!form.full_name.trim() || form.full_name.trim().length < 2) {
      next.full_name = 'Please enter your name.';
    }
    if (form.phone && !/^[0-9+\- ]{7,20}$/.test(form.phone)) {
      next.phone = 'Enter a valid phone number.';
    }
    if (form.avatar_url && !/^https?:\/\//.test(form.avatar_url)) {
      next.avatar_url = 'Enter a full URL starting with http:// or https://';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    setSaving(true);
    try {
      await updateProfile({
        full_name: form.full_name.trim(),
        phone: form.phone.trim() || null,
        avatar_url: form.avatar_url.trim() || null
      });
      toast.success('Profile updated.');
    } catch (err) {
      toast.error(err.message || 'Could not save your profile.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="surface p-6 space-y-5" noValidate>
      <Field label="Full name" required error={errors.full_name}>
        <Input
          value={form.full_name}
          onChange={(e) => setForm({ ...form, full_name: e.target.value })}
          autoComplete="name"
        />
      </Field>

      <Field label="Email" hint="Your email address can't be changed here.">
        <Input value={user.email} disabled autoComplete="email" />
      </Field>

      <Field label="Phone" error={errors.phone} hint="Stored encrypted. Used only for booking notifications.">
        <Input
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
          placeholder="9876543210"
          autoComplete="tel"
        />
      </Field>

      <Field label="Avatar URL" error={errors.avatar_url}>
        <Input
          value={form.avatar_url}
          onChange={(e) => setForm({ ...form, avatar_url: e.target.value })}
          placeholder="https://…"
        />
      </Field>

      <div className="flex items-center justify-between pt-2 border-t border-ink-800">
        <p className="text-2xs text-ink-500">Member since {formatDate(user.created_at)}</p>
        <Button type="submit" loading={saving} icon={Save}>Save changes</Button>
      </div>
    </form>
  );
}

function SecurityForm({ changePassword, toast, logout }) {
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const validate = () => {
    const next = {};
    if (!form.current) next.current = 'Enter your current password.';
    if (form.next.length < 8) next.next = 'Use at least 8 characters.';
    else if (!/[a-z]/.test(form.next)) next.next = 'Include a lowercase letter.';
    else if (!/[A-Z]/.test(form.next)) next.next = 'Include an uppercase letter.';
    else if (!/[0-9]/.test(form.next)) next.next = 'Include a digit.';
    if (form.next !== form.confirm) next.confirm = 'Passwords do not match.';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    setSaving(true);
    try {
      await changePassword(form.current, form.next);
      toast.success('Password changed. Signing you out of this device…');
      // The server revoked every refresh token, so this session is done too.
      setTimeout(() => logout(), 1500);
    } catch (err) {
      toast.error(err.message || 'Could not change your password.');
      setErrors({ current: err.status === 400 ? err.message : undefined });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="surface p-6 space-y-5" noValidate>
      <div>
        <h2 className="text-base font-bold text-ink-50">Change password</h2>
        <p className="text-xs text-ink-400 mt-1">
          Changing your password signs you out everywhere, including here.
        </p>
      </div>

      <Field label="Current password" required error={errors.current}>
        <Input
          type="password"
          value={form.current}
          onChange={(e) => setForm({ ...form, current: e.target.value })}
          autoComplete="current-password"
        />
      </Field>

      <Field
        label="New password"
        required
        error={errors.next}
        hint="At least 8 characters, with an uppercase letter, a lowercase letter and a digit."
      >
        <Input
          type="password"
          value={form.next}
          onChange={(e) => setForm({ ...form, next: e.target.value })}
          autoComplete="new-password"
        />
      </Field>

      <Field label="Confirm new password" required error={errors.confirm}>
        <Input
          type="password"
          value={form.confirm}
          onChange={(e) => setForm({ ...form, confirm: e.target.value })}
          autoComplete="new-password"
        />
      </Field>

      <div className="pt-2 border-t border-ink-800 flex justify-end">
        <Button type="submit" loading={saving} icon={Lock}>Update password</Button>
      </div>
    </form>
  );
}

function ActivitySummary() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/bookings/my')
      .then((res) => {
        const all = res.bookings || [];
        const confirmed = all.filter((b) => b.status === 'Confirmed');
        setStats({
          total: all.length,
          confirmed: confirmed.length,
          spent: confirmed.reduce((sum, b) => sum + Number(b.total_amount), 0),
          seats: confirmed.reduce((sum, b) => sum + (b.seats?.length || 0), 0),
          recent: all.slice(0, 5)
        });
      })
      .catch(() => setStats({ total: 0, confirmed: 0, spent: 0, seats: 0, recent: [] }))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Skeleton className="h-52 rounded-2xl" />;

  const cards = [
    { label: 'Bookings', value: stats.total },
    { label: 'Confirmed', value: stats.confirmed },
    { label: 'Tickets bought', value: stats.seats },
    { label: 'Total spent', value: formatCurrency(stats.spent) }
  ];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {cards.map((card) => (
          <div key={card.label} className="surface p-4">
            <p className="text-2xs uppercase tracking-wide text-ink-500 font-semibold">{card.label}</p>
            <p className="text-xl font-extrabold text-ink-50 mt-1.5 tabular">{card.value}</p>
          </div>
        ))}
      </div>

      {stats.recent.length > 0 && (
        <div className="surface p-5">
          <h3 className="text-sm font-bold text-ink-50 mb-3">Recent activity</h3>
          <ul className="divide-y divide-ink-800">
            {stats.recent.map((b) => (
              <li key={b.booking_id} className="flex items-center justify-between gap-4 py-2.5 text-sm">
                <span className="min-w-0">
                  <span className="block text-ink-100 truncate">{b.movie_title}</span>
                  <span className="block text-2xs text-ink-500 tabular">{formatDate(b.booking_time)}</span>
                </span>
                <span className="tabular text-ink-300 shrink-0">
                  {formatCurrency(b.total_amount)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
