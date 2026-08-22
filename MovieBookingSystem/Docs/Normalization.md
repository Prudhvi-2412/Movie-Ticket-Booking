# Normalization & design decisions

The schema is in third normal form, with two deliberate, documented
denormalizations. See `ER_diagram.md` for the full entity map.

---

## Entities

| Entity | Role |
| ------ | ---- |
| `locations` | Cities. The root of the venue hierarchy and the customer's first choice |
| `theaters` | Cinemas, each in exactly one location |
| `screens` | Auditoriums within a theatre |
| `seats` | The physical layout of a screen |
| `movies` | The film catalogue |
| `shows` | A film on a screen at a time — the bridge entity |
| `show_pricing` | Price per seat category per show |
| `users` | Customers and administrators |
| `bookings` | A customer's transaction against a show |
| `booking_seats` | Junction resolving bookings ↔ seats |
| `payments` | Financial attempts against a booking |

---

## Normal forms

### 1NF — atomic values

Every table has a primary key and no repeating groups. The seats in a booking
live as rows in `booking_seats`, not as a comma-separated string on `bookings`.

The two `JSON` columns are not violations. `theaters.facilities` is an opaque
list of display labels that is never queried by element, and
`users.preferences` is schemaless by intent. Neither participates in a join or
a `WHERE` clause. Anything the application filters on — seat type, screen type,
booking status — is a proper column with an index.

### 2NF — no partial dependencies

`show_pricing` has the composite key `(show_id, seat_type)` and one non-key
attribute, `price`, which depends on both halves. A Gold seat costs a different
amount on an IMAX screen than on a standard one, so neither column alone
determines the price.

`booking_seats` stores `seat_price` even though a price could be derived from
`show_pricing`. That is intentional and not redundancy: it records what the
customer was *actually charged at the time of sale*. A later admin repricing or
a change in the demand multiplier must not retroactively rewrite what someone
paid.

### 3NF — no transitive dependencies

A theatre's address lives on `theaters`. `screens` stores only `theater_id`;
`shows` stores only `screen_id`. A show's city is reached by joining through
`screens → theaters → locations` rather than being copied down the chain.

Likewise `movies.duration_minutes` is stored once. `shows.end_time` is
persisted rather than computed from it, because the turnaround gap between
screenings is a scheduling decision an admin can override — it is an
independent fact, not a derived one.

---

## Deliberate denormalizations

**`screens.total_seats`** duplicates `COUNT(*)` over `seats`. Occupancy is
computed for every show on every analytics query, and counting rows each time
would be needless work. It is maintained by triggers on `seats`
(`after_seats_insert/update/delete`) rather than written by hand, so it cannot
drift — which it previously did, badly enough to make every occupancy figure
wrong.

**`bookings.seat_amount`, `convenience_fee`, `tax_amount`, `total_amount`** are
each derivable from `booking_seats` and the current fee configuration. They are
stored because a financial record has to be immutable: changing `GST_RATE` next
year must not alter what last year's invoices say.

---

## Integrity, concurrency, performance

**Referential integrity.** Every relationship has a real foreign key. Deletes
are `CASCADE` where a child is meaningless without its parent (seats without a
screen) and `RESTRICT` where history must survive (a screen with sold tickets).
`booking_seats.show_id` and `seat_id` use `RESTRICT` for a second reason too:
InnoDB rejects a cascading referential action on a base column of a stored
generated column, and both feed `occupancy_key`.

> The original schema partitioned `bookings` by `YEAR(booking_time)`, which
> forced the primary key to be `(booking_id, booking_time)`. Nothing can hold a
> foreign key onto a composite key it does not fully reference, which is why
> `booking_seats` and `payments` originally had none and could be orphaned.
> The partitioning is gone and the foreign keys are real — integrity across the
> booking chain is worth more than year partitions on a table of this size.

**Concurrency.** Booking-state transitions run inside transactions with
`SELECT … FOR UPDATE` on the booking row, and the `uq_seat_occupancy` unique
index makes a second live claim on a seat impossible regardless of what the
application does. See `ACID_Properties.md`.

**Indexes.** Beyond the primary and foreign keys:

| Index | Serves |
| ----- | ------ |
| `ft_movies_search` (FULLTEXT) | Title and description search |
| `idx_movies_status` | The published catalogue listing |
| `idx_shows_movie_time`, `idx_shows_screen_time` | Showtime lookups by date range |
| `uq_shows_screen_start` | Exact start-time collisions on a screen |
| `idx_booking_seats_show` | Seat-map availability |
| `idx_bookings_user`, `idx_bookings_expiry` | My Bookings; the expiry sweep |
| `uq_webhook_event` | Payment idempotency |

Date filtering uses half-open ranges on `show_time` (`>= date AND < date + 1
day`) rather than `DATE(show_time) = ?`, because wrapping the column in a
function makes these indexes unusable.
