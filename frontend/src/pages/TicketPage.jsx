import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeft, Printer, Share2 } from 'lucide-react';
import { api } from '../lib/api';
import { useToast } from '../context/ToastContext';
import { DigitalTicket } from '../components/booking/DigitalTicket';
import { Button, LoadingBlock, ErrorState } from '../components/ui';

export function TicketPage() {
  const { bookingId } = useParams();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const toast = useToast();

  const [ticket, setTicket] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const autoPrinted = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(`/bookings/${bookingId}/ticket`);
      setTicket(res.ticket);
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [bookingId]);

  useEffect(() => { load(); }, [load]);

  // "Download ticket" routes here with ?print=1; open the print dialog once
  // the ticket has actually rendered, and only once.
  useEffect(() => {
    if (!ticket || autoPrinted.current || params.get('print') !== '1') return;
    autoPrinted.current = true;
    const timer = setTimeout(() => window.print(), 400);
    return () => clearTimeout(timer);
  }, [ticket, params]);

  const share = async () => {
    const url = window.location.href.replace(/\?print=1$/, '');
    // Web Share is only available in a secure context on supporting devices.
    if (navigator.share) {
      try {
        await navigator.share({ title: `CineWave — ${ticket.movie.title}`, url });
        return;
      } catch {
        // User dismissed the sheet; fall through to copying.
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Ticket link copied to your clipboard.');
    } catch {
      toast.error('Could not copy the link. You can copy it from the address bar.');
    }
  };

  if (loading) return <LoadingBlock label="Loading your ticket…" className="min-h-[60vh]" />;

  if (error) {
    return (
      <div className="page py-16">
        <ErrorState
          title={error.status === 403 ? 'Not your ticket' : 'Could not load this ticket'}
          message={
            error.status === 403
              ? 'This booking belongs to a different account.'
              : error.message
          }
          onRetry={error.status === 403 ? undefined : load}
        />
      </div>
    );
  }

  return (
    <div className="page py-8 max-w-2xl print-full">
      <div className="flex items-center justify-between mb-6 no-print">
        <button onClick={() => navigate('/bookings')} className="btn-ghost btn-sm -ml-2">
          <ChevronLeft className="w-4 h-4" aria-hidden /> My bookings
        </button>

        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" icon={Share2} onClick={share}>Share</Button>
          <Button variant="secondary" size="sm" icon={Printer} onClick={() => window.print()}>Print</Button>
        </div>
      </div>

      <DigitalTicket ticket={ticket} />

      <p className="text-2xs text-ink-500 text-center mt-6 no-print">
        Tip: use Print → “Save as PDF” to keep a copy on your device.
      </p>
    </div>
  );
}
