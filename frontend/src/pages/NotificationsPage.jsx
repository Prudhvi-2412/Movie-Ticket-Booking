import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, Check } from 'lucide-react';
import { api } from '../lib/api';
import { useToast } from '../context/ToastContext';
import { EmptyState, ErrorState, Skeleton } from '../components/ui';

export function NotificationsPage() {
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const result = await api.get('/notifications');
      setItems(result.notifications);
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const markRead = async (id) => {
    try {
      await api.patch(`/notifications/${id}/read`);
      setItems((current) => current.map((item) =>
        item.notification_id === id ? { ...item, is_read: 1 } : item));
    } catch (err) {
      toast.error(err.message || 'Could not mark the notification as read.');
    }
  };

  return (
    <div className="page py-8 max-w-3xl">
      <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Notifications</h1>
      <p className="text-sm text-ink-400 mt-1.5 mb-6">Updates about your bookings.</p>
      {error ? <ErrorState message={error.message} onRetry={load} />
        : loading ? <Skeleton className="h-32 rounded-2xl" />
          : items.length === 0 ? <EmptyState icon={Bell} title="No notifications yet"
            message="Booking updates will appear here." />
            : <div className="space-y-3">
              {items.map((item) => (
                <article key={item.notification_id}
                  className={`surface p-4 ${item.is_read ? '' : 'border-brand-500/50'}`}>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h2 className="font-semibold text-ink-50">{item.title}</h2>
                      <p className="text-sm text-ink-300 mt-1">{item.message}</p>
                      <p className="text-xs text-ink-500 mt-2">
                        {new Date(item.created_at).toLocaleString()}
                      </p>
                    </div>
                    {!item.is_read && <button type="button" onClick={() => markRead(item.notification_id)}
                      className="btn-secondary btn-sm shrink-0" aria-label={`Mark ${item.title} as read`}>
                      <Check className="w-4 h-4" aria-hidden /> Read
                    </button>}
                  </div>
                  {item.booking_id && <Link to={`/bookings/${item.booking_id}`}
                    className="text-sm text-brand-400 hover:underline mt-3 inline-block">View booking</Link>}
                </article>
              ))}
            </div>}
    </div>
  );
}
