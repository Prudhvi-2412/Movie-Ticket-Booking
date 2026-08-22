<div align="center">

# 🎟️ CineWave

**A movie ticket booking platform — real seat locking, real payment state machine, real analytics.**

React · Node.js · Express · MySQL 8 · Redis · Kafka · Docker

</div>

---

## What this is

CineWave is a full booking platform with two halves:

**Customers** pick a city, browse what's showing, choose a showtime, select seats from a
live seat map, hold those seats while they pay, and get a digital ticket.

**Administrators** manage the whole catalogue — locations, theatres, screens, seat
layouts, movies, showtimes and pricing — and see revenue, occupancy and booking
analytics computed from the actual booking ledger.

The parts that are easy to fake are not faked here. Seat locking is a Redis
Lua script, not a client-side flag. Prices are computed on the server, never
accepted from the browser. Payment confirmation arrives through a
signature-verified, idempotent webhook. Double booking is impossible at the
database level, not just discouraged by application logic.

---

## Quick start

### With Docker (everything, one command)

```bash
cp .env.example .env
```

Fill in the three secrets in `.env` (each with
`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`), then:

```bash
docker compose up -d --build
```

The backend applies the schema and seeds demo data on first boot.

| Service  | URL                     |
| -------- | ----------------------- |
| App      | http://localhost:3000   |
| API      | http://localhost:5000   |
| Health   | http://localhost:5000/health |
| Metrics  | http://localhost:5000/metrics |

### Without Docker (local development)

Datastores in containers, apps on the host:

```bash
docker compose up -d mysql redis kafka
```

```bash
cd backend && npm install && cp .env.example .env && npm run db:setup && npm run dev
```

```bash
cd frontend && npm install && npm run dev
```

Vite proxies `/api` to `localhost:5000`, so there is no CORS setup to do.

### Sign in

| Role     | Email                  | Password       |
| -------- | ---------------------- | -------------- |
| Admin    | `admin@cinewave.com`   | `Admin@123`    |
| Customer | `aarav@example.com`    | `Customer@123` |

> These come from the seed script and exist for development only. Delete the
> seeded users before exposing this anywhere real.

### Host ports

Defaults avoid the standard ports so the stack does not collide with a MySQL,
Redis or Kafka you already run. Override any of them in `.env`.

| Service  | Host port | Container port |
| -------- | --------- | -------------- |
| MySQL    | 3307      | 3306           |
| Redis    | 6380      | 6379           |
| Kafka    | 9094      | 29092          |
| Backend  | 5000      | 5000           |
| Frontend | 3000      | 80             |

---

## Architecture

```
                    ┌──────────────────────────┐
   Browser  ───────▶│  nginx  (frontend:80)    │
                    │  static bundle + /api    │
                    └───────────┬──────────────┘
                                │
                    ┌───────────▼──────────────┐
                    │  Express API (:5000)     │
                    │                          │
                    │  auth · catalogue ·      │
                    │  booking · payments ·    │
                    │  webhooks · admin        │
                    └──┬────────┬────────┬─────┘
                       │        │        │
          ┌────────────▼──┐  ┌──▼─────┐  ┌▼──────────────┐
          │   MySQL 8     │  │ Redis  │  │ Kafka         │
          │               │  │        │  │               │
          │ system of     │  │ seat   │  │ booking       │
          │ record ·      │  │ locks  │  │ events →      │
          │ procedures ·  │  │ + TTL  │  │ notifications │
          │ triggers ·    │  │ + cache│  │ email ·       │
          │ views         │  │        │  │ analytics     │
          └───────────────┘  └────────┘  └───────────────┘
```

**Each store has one job.** MySQL is the system of record and the final
arbiter of who holds a seat. Redis holds the short-lived exclusive claim while
a customer checks out. Kafka carries after-the-fact events — notifications,
email, analytics — that must never block a booking.

### Repository layout

```
backend/
  src/
    config/        env, db pool, redis client, kafka producer
    controllers/   one per resource
    middleware/    auth, rbac, validation, rate limits, error handler
    redis/         seat locking, caching
    services/      pricing, payment gateway, audit
    workers/       expired-hold cleanup, revenue reporting
    kafka/         producer + consumers
  scripts/         migrate, seed, end-to-end verification
  tests/           integration suite (Jest + Supertest)

frontend/
  src/
    components/    ui/ · layout/ · booking/ · movie/ · admin/
    context/       auth, location, toasts
    lib/           api client, formatting, seat-hold storage
    pages/         customer pages + pages/admin/

MovieBookingSystem/
  Schema/          tables.sql
  Logic/           procedures.sql · triggers.sql · functions.sql
  Analytics/       views.sql · reports.sql · advanced_analytics.sql
  Automation/      background_tasks.sql
  Docs/            ACID, normalization, ER diagram notes
```

---

## Database

`npm run db:migrate` applies the SQL in a fixed order (tables → views →
functions → procedures → triggers → events) and records each file with a
checksum in `schema_migrations`. Every file is idempotent, so re-running is
safe.

### Core tables

```
locations ──< theaters ──< screens ──< seats
                                │        │
movies ─────────────────────────┴──< shows ──< show_pricing
                                          │
users ──────────────────────────────< bookings ──< booking_seats
                                          │
                                          └──< payments
```

Plus `webhook_logs` (payment idempotency ledger), `audit_logs`, `booking_logs`,
`seat_booking_logs` and `schema_migrations`.

### The double-booking guarantee

`booking_seats` carries a generated column:

```sql
occupancy_key VARCHAR(32)
  GENERATED ALWAYS AS (IF(is_active = 1, CONCAT(show_id, ':', seat_id), NULL)) STORED,
UNIQUE KEY uq_seat_occupancy (occupancy_key)
```

It resolves to `"<show_id>:<seat_id>"` while the row holds the seat and to
`NULL` once released. MySQL permits many NULLs in a unique index but only one
non-NULL duplicate, so **the database itself rejects a second live claim on a
seat** — even with Redis down, even if the API is bypassed entirely. Releasing
a seat is `is_active = 0`, which frees the slot without deleting history.

### Stored procedures

Every write that changes booking state goes through one of these, so there is
exactly one definition of what each transition means:

| Procedure | Responsibility |
| --------- | -------------- |
| `CreateBooking` | Validates the show and seats, prices the order, inserts booking + seats atomically |
| `ConfirmBookingPayment` | Locks the booking row, records the payment, moves it to Confirmed. Idempotent |
| `FailBookingPayment` | Records the failure and releases the seats |
| `CancelBooking` | Releases seats, refunds successful payments, sets the terminal status |
| `ExpireStaleBookings` | Reclaims abandoned holds, returning the freed seats to the caller |
| `UpdateDynamicPrice` | Sets a clamped demand multiplier from occupancy |
| `GetAvailableSeats` | Free seats for a show |

### Views

`movie_revenue`, `theater_revenue`, `location_revenue`, `theater_occupancy`,
`daily_booking_trend`, `peak_booking_hours`, `seat_category_performance`,
`payment_outcomes`, `user_booking_history`. Every admin analytics endpoint
reads from these.

---

## The booking flow

```
  SELECT SEATS
       │  POST /api/bookings/lock-seats
       ▼
  ┌─────────────────────────────────────────────┐
  │ 1. Are any of these seats already sold?     │  MySQL
  │ 2. Price them server-side                   │  pricingService
  │ 3. Claim all of them, or none               │  Redis (Lua, atomic)
  └─────────────────────────────────────────────┘
       │  returns the real TTL → drives the UI countdown
       ▼
  REVIEW ORDER
       │  POST /api/bookings
       ▼
  ┌─────────────────────────────────────────────┐
  │ 4. Does this caller still hold every seat?  │  Redis
  │ 5. Recompute the total (never trust input)  │  pricingService
  │ 6. CALL CreateBooking(...)                  │  MySQL transaction
  └─────────────────────────────────────────────┘
       │  status = Pending, expires_at set
       ▼
  PAYMENT
       │  POST /api/payments/initiate  → order id, amount
       │  POST /api/payments/confirm   → gateway signs a callback
       ▼
  ┌─────────────────────────────────────────────┐
  │ 7. Verify HMAC over the raw bytes           │
  │ 8. Claim the event id (unique index)        │
  │ 9. CALL ConfirmBookingPayment(...)          │
  │ 10. Release the now-redundant Redis holds   │
  │ 11. Emit BookingConfirmed → Kafka           │
  └─────────────────────────────────────────────┘
       ▼
  CONFIRMED  →  digital ticket
```

**Booking states**

```
Pending ──▶ PaymentProcessing ──▶ Confirmed ──▶ Refunded
   │                │                 │
   │                └──▶ PaymentFailed │  (seats released)
   │                                   │
   ├──▶ Expired      (hold lapsed)     └──▶ Cancelled
   └──▶ Cancelled
```

### Redis seat locking

```
key    seat_lock:<showId>:<seatId>
value  <userId>:<isoTimestamp>
ttl    SEAT_LOCK_TTL (default 600s)
```

Acquisition is a Lua script, which Redis runs atomically. It checks every
requested seat first and only then writes, so a partially-held block is never
observable. A seat already held by the same user is not a conflict — its TTL is
refreshed, which is what makes "go back and add one more seat" work. Release is
also a script and verifies ownership, so one user cannot drop another's hold.

Three independent things return an abandoned seat to the pool:

1. Redis expires the key on its own TTL.
2. `seatCleanupWorker` runs every minute, calls `ExpireStaleBookings`, and
   clears the matching Redis keys.
3. Cancellation and payment failure release seats immediately.

If Redis is unreachable the client degrades to an in-process store and logs a
loud warning: locks stop being distributed, but the database's unique index
still makes double booking impossible.

### Payments and webhooks

`services/paymentGateway.js` stands in for a hosted gateway. It creates orders
and signs callbacks with `WEBHOOK_SECRET`; `POST /api/payments/confirm` feeds
that signed callback through the *real* webhook handler in-process. No money
moves and no card details are collected, but signature verification,
idempotency and the booking state machine all genuinely run. Swapping in a real
gateway means replacing `createOrder` and `signPayload` — the webhook handler
needs no changes.

The webhook endpoint guarantees three things:

- **Authenticity** — HMAC-SHA256 over the exact request bytes (the route uses
  `express.raw`), compared in constant time. A missing signature is a 401.
- **Idempotency** — it INSERTs the event id first and lets the unique index
  decide. A duplicate key means someone else already has it. A previous attempt
  left in `FAILED` is retried; anything else is acknowledged and ignored.
- **Legal transitions** — confirmation runs through `ConfirmBookingPayment`,
  which locks the row and refuses to confirm a booking that was cancelled or
  has expired.

### Kafka

Events (`BookingCreated`, `PaymentSuccessful`, `BookingConfirmed`,
`BookingCancelled`, `SeatReleased`) are published to `booking-events` and
consumed by notification, email and analytics handlers. These are strictly
after-the-fact concerns — nothing on the booking path waits for them. If the
broker is unavailable the producer falls back to an in-process event bus so the
consumers still run.

---

## API

All responses share a shape: `{ success: boolean, message?: string, ... }`.
Errors add `code` and, for validation failures, `details`.

### Public

| Method | Path | Notes |
| ------ | ---- | ----- |
| `GET` | `/api/locations` | Cities available for booking |
| `GET` | `/api/locations/:id` | |
| `GET` | `/api/movies` | `?locationId&status&genre&language&search&sort` |
| `GET` | `/api/movies/:id` | `?locationId&date` — includes theatres and showtimes |
| `GET` | `/api/movies/meta/filters` | Genres and languages in the catalogue |
| `GET` | `/api/theatres` | `?locationId&movieId&date&search` |
| `GET` | `/api/theatres/:id` | Screens and today's activity |
| `GET` | `/api/shows` | `?movieId&theatreId&locationId&date` |
| `GET` | `/api/shows/:showId` | |
| `GET` | `/api/shows/:showId/seats` | Live seat map. Optional auth marks your own holds |
| `GET` | `/api/search` | `?q&locationId` — movies, theatres and cities |
| `GET` | `/health` `/metrics` | Dependency health; Prometheus metrics |

### Authentication

| Method | Path |
| ------ | ---- |
| `POST` | `/api/auth/register` · `/api/auth/login` · `/api/auth/refresh-token` · `/api/auth/logout` |
| `GET` `PUT` | `/api/auth/me` |
| `PUT` | `/api/auth/password` |

### Booking (customer)

| Method | Path | Notes |
| ------ | ---- | ----- |
| `POST` | `/api/bookings/lock-seats` | Hold seats, get the server's quote and real TTL |
| `POST` | `/api/bookings` | Turn a live hold into a pending booking |
| `GET` | `/api/bookings/my` | Grouped upcoming / completed / cancelled |
| `GET` | `/api/bookings/:id` | Owner or admin only |
| `GET` | `/api/bookings/:id/ticket` | Digital ticket, confirmed bookings only |
| `POST` | `/api/bookings/:id/cancel` | Up to 2 hours before showtime |
| `POST` | `/api/payments/initiate` · `/api/payments/confirm` | |
| `GET` | `/api/payments/booking/:bookingId` | Payment attempts |

### Webhooks

| Method | Path | Notes |
| ------ | ---- | ----- |
| `POST` | `/api/webhooks/payment` | Public. Authenticated by HMAC signature |

### Admin (`Admin` role required)

| Method | Path |
| ------ | ---- |
| `GET` | `/api/admin/dashboard` · `/api/admin/analytics` |
| `GET` | `/api/admin/bookings` · `/api/admin/users` · `/api/admin/audit-logs` · `/api/admin/webhook-logs` |
| `PUT` | `/api/admin/users/:id/role` · `/api/admin/users/:id/status` |
| CRUD | `/api/admin/locations` · `/theatres` · `/screens` · `/movies` · `/shows` |
| `GET` `POST` | `/api/admin/screens/:screenId/seats` · `/seats/generate` |
| `PUT` | `/api/admin/screens/:screenId/seats/bulk` · `/api/admin/seats/:id` |
| `POST` | `/api/admin/shows/:showId/dynamic-price` |

Deleting a location, theatre, screen or show that has bookings against it
**deactivates** it instead. The response says which happened via `deleted:
true|false`, so a sold ticket is never orphaned.

---

## Environment variables

`backend/.env` (see `backend/.env.example`):

| Variable | Default | Notes |
| -------- | ------- | ----- |
| `PORT` | `5000` | |
| `NODE_ENV` | `development` | |
| `CORS_ORIGINS` | `http://localhost:3000,http://localhost:5173` | Comma-separated allow-list |
| `JWT_SECRET` | — | **Required in production** |
| `JWT_REFRESH_SECRET` | — | **Required in production** |
| `JWT_EXPIRES_IN` | `1h` | |
| `JWT_REFRESH_EXPIRES_IN` | `7d` | |
| `DB_HOST` `DB_PORT` `DB_USER` `DB_PASSWORD` `DB_NAME` | `127.0.0.1` `3307` `root` — `MovieBookingDB` | |
| `REDIS_HOST` `REDIS_PORT` `REDIS_PASSWORD` | `127.0.0.1` `6380` — | |
| `SEAT_LOCK_TTL` | `600` | Seconds. Drives both the Redis TTL and the UI countdown |
| `KAFKA_BROKERS` | `localhost:9094` | |
| `WEBHOOK_SECRET` | — | **Required in production**. HMAC key for webhook signatures |
| `CONVENIENCE_FEE_PER_SEAT` | `20` | |
| `GST_RATE` | `0.18` | |
| `MAX_SEATS_PER_BOOKING` | `10` | |
| `DATA_ENCRYPTION_KEY` | falls back to `JWT_SECRET` | Key for phone-number field encryption |
| `AUTO_MIGRATE` | `false` | Migrate + seed on boot. Set by docker-compose |

The three secrets have **no fallback when `NODE_ENV=production`** — the server
refuses to start rather than signing tokens with a value committed to the repo.
In development it generates a random per-process value.

`.env` files are git-ignored and excluded from Docker build contexts.

---

## Scripts

**Backend**

```bash
npm run dev          # nodemon
npm start            # production
npm run db:migrate   # apply schema, views, routines, triggers
npm run db:seed      # seed demo data (skips if already seeded)
npm run db:setup     # migrate + seed
npm run db:reset     # migrate + reseed from scratch
npm test             # Jest integration suite
npm run verify       # end-to-end check against a running server
```

**Frontend**

```bash
npm run dev
npm run build
npm run lint
npm run preview
```

---

## Testing

The Jest suite is integration-level and runs against real MySQL and Redis,
because what it verifies *is* the interaction between them. Mocking either
would test the mock.

```bash
docker compose up -d mysql redis
cd backend && npm run db:setup && npm test
```

47 tests across four files:

- **`auth.test.js`** — registration, privilege-escalation attempts, password
  rules, timing-equal login failures, token refresh and rotation, RBAC.
- **`seatLock.test.js`** — two simultaneous callers, a burst of ten,
  all-or-nothing block acquisition, ownership checks, TTL expiry.
- **`booking.test.js`** — seat map and server-side pricing, holds, booking a
  seat you never held, client-supplied amounts being ignored, the database
  rejecting a double allocation when the API is bypassed, cancellation.
- **`webhook.test.js`** — unsigned/forged/tampered signatures, replayed event
  ids, retries under a new event id, failure releasing seats, cancelled
  bookings not being resurrected.

### End-to-end verification

`npm run verify` walks the entire acceptance scenario over HTTP against a
running server — admin creates a city, theatre, screen, seat map, movie and
show; a customer discovers it, holds seats, pays and receives a ticket — while
asserting the concurrency, authorisation and idempotency guarantees. It cleans
up the fixtures it creates.

```bash
npm run verify                          # against http://localhost:5000
docker compose exec backend node scripts/verifyFlow.js
```

72 checks across 13 sections.

### Load testing

```bash
k6 run load-tests/k6-seat-booking.js
```

---

## Security

| Concern | Handling |
| ------- | -------- |
| Passwords | bcrypt, cost 10. Never returned by any endpoint |
| Tokens | Short-lived access token + rotating refresh token, each with a unique `jti` |
| Privilege escalation | `role` is ignored on registration; only an admin can promote |
| Authorisation | Role guards applied at the router, so a new route cannot miss them |
| SQL injection | Parameterised queries throughout; `multipleStatements` disabled |
| Input validation | Joi schemas on every mutating route, with `stripUnknown` |
| CORS | Explicit origin allow-list (not origin reflection) |
| Headers | Helmet on the API; CSP and friends from nginx for the document |
| Rate limiting | Global, plus tighter limits on auth and booking endpoints |
| Webhooks | Mandatory HMAC over raw bytes, constant-time comparison |
| Money | Order totals computed server-side; client amounts ignored |
| PII | Phone numbers encrypted with AES-256-GCM, key from the environment |
| Errors | Only curated messages reach clients; stack traces never do |
| Secrets | No production fallbacks; `.env` git-ignored and docker-ignored |
| Containers | Non-root user, pinned base images, health checks |

---

## What changed from the original

<details>
<summary><strong>Critical defects fixed</strong></summary>

- **Seat locking never locked anything.** The Redis wrapper's
  `set(key, value, mode, duration)` silently discarded further arguments, so
  `set(key, value, 'EX', ttl, 'NX')` lost the `NX` flag. Every acquisition
  overwrote the incumbent lock and reported success. Replaced with an explicit
  `setIfAbsent` and an atomic Lua script.
- **Anyone could confirm a booking for free.** The browser called
  `/payments/initiate`, received a valid HMAC signature, and POSTed its own
  webhook. Signing moved server-side; the browser never sees the secret.
- **Webhook signatures were optional.** Verification sat inside
  `if (signature)`, so omitting the header skipped it entirely.
- **Prices came from the client.** `POST /bookings/create` wrote
  `req.body.totalAmount` straight to the database.
- **Bookings didn't check who held the seats.** Any authenticated user could
  book seats another customer was mid-checkout on.
- **The schema could not be created.** `movies.cast` — `CAST` is reserved in
  MySQL 8 — made the whole init script fail. Renamed to `cast_list`.
- **`BookTicket` could not be created** either: its `DECLARE` statements came
  after a handler declaration.
- **Seeded users could not log in.** Password hashes were literal strings like
  `'hash_aarav_001'`. Seeding is now JS and uses real bcrypt.
- **Dynamic pricing compounded.** `price = price * 1.15` ran on every confirmed
  booking above 80% occupancy, permanently inflating the stored price. Split
  into an immutable `base_price` and a clamped `demand_multiplier`.
- **Timezone mismatch.** mysql2 parsed DATETIMEs in the process's local zone
  while MySQL wrote them in the server's, so seat holds read as expired
  seconds after being created on any host whose zone differed. Both sides
  pinned to UTC.
- **Redis commands failed at startup.** Connectivity was tracked with ioredis's
  `connect` event, which fires before the client accepts commands; with the
  offline queue disabled, everything in that window threw. Now gated on `ready`.
- **A declined payment could confirm a booking.** The outcome was decided with
  `status === 'SUCCESS' || eventType === 'payment.captured'`, so a failure
  carrying a capture-shaped event type was applied as a success.
- **Refresh tokens didn't rotate.** Signing the same payload twice within one
  second produced identical tokens, so a used token stayed valid. Each token
  now carries a random `jti`.
- **Failed payments stranded seats.** The failure path marked the booking
  cancelled but left the Redis locks in place until the TTL lapsed.
- **Duplicate webhooks could both apply.** `SELECT`-then-`INSERT` on
  `webhook_logs` left a race window. The `INSERT` is now first and the unique
  index decides.
- **A cancelled booking's webhook returned 500**, making the gateway retry
  forever. Business-rule rejections are now acknowledged and flagged for
  reconciliation.
- **`CORS: origin: true`** reflected any origin with credentials enabled.
- **Registration accepted `role`**, so anyone could make themselves an admin.
- **Stack traces leaked** to clients whenever `NODE_ENV` was not exactly
  `"development"`.
- **`AUTO_MIGRATE` could never work in Docker** — the SQL files lived outside
  the build context.
- **CI ran the test suite with no database**, so it could not have passed.

</details>

<details>
<summary><strong>Schema changes</strong></summary>

- **New:** `locations`, `show_pricing`, `schema_migrations`.
- **`theaters`** — now `location_id` FK, plus `address`, `contact_phone`,
  `facilities`.
- **`screens`** — `name`, `screen_type`; `total_seats` is maintained by
  triggers rather than typed by hand (it previously claimed 120 seats where 3
  existed, making every occupancy figure wrong).
- **`seats`** — added `Recliner`, `is_active`, longer row labels.
- **`movies`** — `cast` → `cast_list`, plus `certificate`, `status`,
  `is_published`.
- **`shows`** — `end_time`, `base_price`, `demand_multiplier`, `status`;
  overlap prevention by trigger.
- **`bookings`** — `booking_ref`, itemised amounts, `expires_at`, richer status
  enum. **Year partitioning removed**: it forced a composite primary key, which
  is why nothing could hold a foreign key onto bookings. Referential integrity
  on the booking chain is worth more than year partitions on a table this size.
- **`booking_seats`** — `show_id`, `seat_price`, `is_active` and the
  `occupancy_key` unique index described above.
- **`payments`** — real FK to bookings, `failure_reason`, `updated_at`.
- **Removed:** `init_full_system.sql` and `insert_data.sql`, superseded by the
  migration runner and the JS seed.

</details>

<details>
<summary><strong>API changes</strong></summary>

- New: `/api/locations`, `/api/theatres`, `/api/search`, `/api/shows` (list),
  `/api/bookings/:id`, `/api/bookings/:id/ticket`, `/api/payments/confirm`,
  and the full `/api/admin/*` CRUD surface.
- `POST /api/bookings` replaces `/api/bookings/create`; `GET
  /api/bookings/my` replaces `/my-bookings`. Both old paths still work.
- Admin mutations moved from `/api/movies` and `/api/shows` to `/api/admin/*`.
- Consistent `{ success, message, code?, details? }` on every response.

</details>

<details>
<summary><strong>Added</strong></summary>

**Customer** — city selection as global state, home page with hero and
curated rows, filterable catalogue, movie details with date-scoped showtimes,
theatre discovery, seat map with live states, order review, payment, digital
ticket with QR, My Bookings, profile.

**Admin** — dashboard KPIs and trends, full CRUD for locations, theatres,
screens, seat layouts, movies and shows, a visual seat-layout generator,
per-show pricing, booking and user management, analytics, and operational
views over the webhook and audit ledgers.

**Platform** — migration runner, JS seed, 47 integration tests, 72-check
end-to-end verification, ESLint config, graceful shutdown, dependency-aware
health checks, hardened Dockerfiles, `.dockerignore`, and a CI pipeline that
provisions datastores and runs the whole thing.

</details>

---

## Known limitations

- **The payment gateway is simulated.** The integration is real — orders,
  signed callbacks, idempotency, state transitions — but no money moves.
  Production needs `paymentGateway.js` pointed at a real provider and a public
  webhook URL.
- **Email and SMS are logged, not sent.** The Kafka consumers write what they
  would have dispatched. Wiring a provider means editing one consumer.
- **Kafka consumers read from an in-process bus**, not from Kafka topics. The
  producer publishes to Kafka; consuming from it across replicas would need a
  consumer group per service.
- **Refresh tokens are stored one-per-user**, so signing in on a second device
  ends the session on the first.
- **Seat-hold recovery is per-tab.** The hold lives in `sessionStorage`, so
  closing the tab loses the reference — though the seats still release on TTL.
- **No image uploads.** Posters and backdrops are URLs; seed art comes from
  picsum.photos with a stable per-movie seed.
- **The in-memory Redis fallback is single-process.** With Redis down, multiple
  backend instances would not see each other's holds. The database's unique
  index still prevents double booking, but customers would meet more conflicts
  at checkout.
- **No coupons or refund gateway calls.** `discount_amount` exists on bookings
  and is always zero; cancellation marks payments `Refunded` in the ledger
  without calling out to a provider.
