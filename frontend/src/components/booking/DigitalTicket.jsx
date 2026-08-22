import { QRCodeSVG } from 'qrcode.react';
import { Ticket, MapPin, CalendarDays, Clock, Armchair } from 'lucide-react';
import { formatCurrency, formatDate, formatTime, formatDuration } from '../../lib/format';
import { SmartImage, cx } from '../ui';

/**
 * The digital ticket.
 *
 * Built to survive being printed: `print-plain` flips it to black on white in
 * the print stylesheet, and the QR code is an inline SVG so it stays crisp on
 * paper as well as on screen.
 */
export function DigitalTicket({ ticket, className }) {
  const { movie, venue, amount } = ticket;

  return (
    <div
      className={cx(
        'relative bg-ink-850 border border-ink-700 rounded-3xl overflow-hidden shadow-lift print-plain',
        className
      )}
    >
      {/* Header */}
      <div className="relative bg-gradient-to-r from-brand-500 to-ember-500 px-6 py-4 flex items-center justify-between print-plain">
        <span className="flex items-center gap-2 text-white font-extrabold tracking-tight">
          <Ticket className="w-5 h-5" aria-hidden /> CineWave
        </span>
        <span className="text-2xs font-bold uppercase tracking-widest text-white/85">e-Ticket</span>
      </div>

      <div className="p-6">
        <div className="flex gap-5">
          <div className="w-24 sm:w-28 shrink-0">
            <SmartImage
              src={movie.poster_url}
              alt={`${movie.title} poster`}
              fallbackText={movie.title}
              className="rounded-xl border border-ink-700"
            />
          </div>

          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-extrabold text-ink-50 leading-tight">{movie.title}</h2>
            <p className="text-xs text-ink-400 mt-1.5">
              {[movie.language, movie.certificate, movie.duration_minutes && formatDuration(movie.duration_minutes)]
                .filter(Boolean).join(' · ')}
            </p>

            <div className="mt-4 space-y-2 text-sm">
              <p className="flex items-start gap-2 text-ink-200">
                <MapPin className="w-4 h-4 text-ink-500 mt-0.5 shrink-0" aria-hidden />
                <span>
                  <span className="font-semibold">{venue.theatre}</span>
                  <span className="block text-xs text-ink-400">
                    {venue.screen}{venue.locality ? ` · ${venue.locality}` : ''}, {venue.city}
                  </span>
                </span>
              </p>
              <p className="flex items-center gap-2 text-ink-200 tabular">
                <CalendarDays className="w-4 h-4 text-ink-500 shrink-0" aria-hidden />
                {formatDate(ticket.showTime)}
                <Clock className="w-4 h-4 text-ink-500 shrink-0 ml-2" aria-hidden />
                {formatTime(ticket.showTime)}
              </p>
            </div>
          </div>
        </div>

        {/* Perforation */}
        <div className="relative my-6" aria-hidden>
          <div className="border-t border-dashed border-ink-600" />
          <span className="absolute -left-9 -top-3 w-6 h-6 rounded-full bg-ink-950 print:hidden" />
          <span className="absolute -right-9 -top-3 w-6 h-6 rounded-full bg-ink-950 print:hidden" />
        </div>

        <div className="flex flex-col sm:flex-row gap-6">
          <div className="flex-1 grid grid-cols-2 gap-x-4 gap-y-4">
            <Detail
              icon={Armchair}
              label={`Seat${ticket.seatCount === 1 ? '' : 's'}`}
              value={ticket.seats.join(', ')}
              emphasise
            />
            <Detail label="Booking ID" value={ticket.bookingRef} mono />
            <Detail label="Amount paid" value={formatCurrency(amount.total, { precise: true })} emphasise />
            <Detail label="Transaction" value={ticket.transactionId || '—'} mono truncate />
          </div>

          <div className="flex flex-col items-center justify-center gap-2 shrink-0">
            <div className="p-2.5 bg-white rounded-xl">
              <QRCodeSVG value={ticket.qrPayload} size={112} level="M" includeMargin={false} />
            </div>
            <p className="text-2xs text-ink-500 text-center max-w-[8rem] leading-tight">
              Show this at the entrance
            </p>
          </div>
        </div>

        <div className="mt-6 pt-4 border-t border-ink-800 grid grid-cols-3 gap-3 text-2xs text-ink-500">
          <span>Tickets {formatCurrency(amount.seats)}</span>
          <span className="text-center">Fee {formatCurrency(amount.convenienceFee)}</span>
          <span className="text-right">GST {formatCurrency(amount.tax)}</span>
        </div>

        <p className="mt-4 text-2xs text-ink-500 leading-relaxed">
          Please arrive 15 minutes before showtime. Outside food and beverages are
          not permitted. This ticket is valid for the show listed above only.
        </p>
      </div>
    </div>
  );
}

function Detail({ icon: Icon, label, value, mono, emphasise, truncate }) {
  return (
    <div className="min-w-0">
      <p className="text-2xs uppercase tracking-wide text-ink-500 font-semibold flex items-center gap-1.5">
        {Icon && <Icon className="w-3 h-3" aria-hidden />} {label}
      </p>
      <p
        className={cx(
          'mt-1 text-ink-50',
          emphasise ? 'text-base font-bold' : 'text-sm font-medium',
          mono && 'font-mono text-xs',
          truncate && 'truncate'
        )}
        title={truncate ? value : undefined}
      >
        {value}
      </p>
    </div>
  );
}
