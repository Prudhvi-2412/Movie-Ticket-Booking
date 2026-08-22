# ACID in CineWave

How each property is actually enforced, and where to look in the code.

---

## Atomicity — all or nothing

**Where:** `Logic/procedures.sql`, and the transactional blocks in
`backend/src/controllers/`.

Creating a booking means inserting a `bookings` row and one `booking_seats`
row per seat. A partial write would either sell seats nobody paid for or take
money for seats nobody holds.

`CreateBooking` wraps the whole thing in `START TRANSACTION` … `COMMIT` with an
exit handler that rolls back and re-signals on any exception:

```sql
DECLARE EXIT HANDLER FOR SQLEXCEPTION
BEGIN
    ROLLBACK;
    RESIGNAL;
END;
```

The same shape guards `ConfirmBookingPayment`, `FailBookingPayment` and
`CancelBooking`. Multi-statement admin operations — generating a seat layout,
scheduling a show with its price ladder — take a pooled connection and manage
their own transaction, rolling back in a `catch` and releasing in a `finally`.

---

## Consistency — the database refuses invalid states

**Where:** `Schema/tables.sql` constraints, `Logic/triggers.sql`.

| Rule | Enforced by |
| ---- | ----------- |
| A booking always points at a real user and show | `fk_bookings_user`, `fk_bookings_show` |
| A theatre always sits in a real location | `fk_theaters_location` |
| A seat always belongs to a real screen | `fk_seats_screen` |
| Ratings are 0–10, runtimes positive, prices non-negative | `CHECK` constraints |
| A show ends after it starts | `chk_shows_window` |
| Demand pricing cannot run away | `chk_shows_multiplier` (1.00–2.00) |
| No show on a screen with no seats | `before_show_insert` |
| No two overlapping shows on one screen | `before_show_insert` / `before_show_update` |
| `screens.total_seats` matches the seat map | `after_seats_insert/update/delete` |
| A payment only confirms a legally payable booking | `after_payment_insert` status guard |

The `total_seats` trigger is worth singling out. It was previously a number an
admin typed by hand, and the seed data claimed 120 seats on screens that had
three — which silently made every occupancy percentage in the analytics wrong.
It is now derived, so it cannot disagree with reality.

---

## Isolation — two customers, one seat

**Where:** `Schema/tables.sql` (`uq_seat_occupancy`),
`Logic/procedures.sql`, `backend/src/redis/seatLock.js`.

Three independent layers, in order of how early they reject:

**1. Redis, before anything is written.** Acquiring a hold is a Lua script,
and Redis executes Lua atomically. It checks every requested seat and only
then writes, so a half-held block is never observable by another request.

**2. Row locks inside the procedures.** `ConfirmBookingPayment` and
`CancelBooking` open with `SELECT … FOR UPDATE` on the booking row, so two
concurrent webhooks for the same booking serialise rather than interleave.

**3. A unique index, which cannot be bypassed.** `booking_seats` carries

```sql
occupancy_key VARCHAR(32)
  GENERATED ALWAYS AS (IF(is_active = 1, CONCAT(show_id, ':', seat_id), NULL)) STORED,
UNIQUE KEY uq_seat_occupancy (occupancy_key)
```

MySQL permits many NULLs in a unique index but only one non-NULL duplicate.
While a row holds a seat its key is `"<show_id>:<seat_id>"`; releasing the seat
sets `is_active = 0` and the key becomes NULL, freeing the slot without
deleting history.

This is the layer that actually guarantees the property. Layers 1 and 2 make
conflicts rare and produce good error messages; layer 3 makes double booking
*impossible* — with Redis down, with the API bypassed, with a second process
writing directly to the table. `tests/booking.test.js` asserts exactly that by
inserting straight into `booking_seats` and expecting `ER_DUP_ENTRY`.

---

## Durability — committed means committed

**Where:** every table is `ENGINE=InnoDB`.

InnoDB writes to the redo log before acknowledging a `COMMIT`, so a crash
immediately after "Booking Confirmed" replays from the log on restart rather
than losing the row.

Two things extend this beyond the database:

- **Graceful shutdown** (`backend/src/server.js`) stops accepting connections,
  drains in-flight requests, then closes the pool — so a redeploy cannot kill a
  booking mid-transaction.
- **The webhook ledger** (`webhook_logs`) records every payment event before it
  is applied. If processing fails, the row is left in `FAILED` and the next
  delivery retries it; business-rule rejections are marked `IGNORED` for
  reconciliation. Either way the event is never silently lost.
