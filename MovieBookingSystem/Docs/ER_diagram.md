# Entity Relationship Diagram

Reflects `MovieBookingSystem/Schema/tables.sql`. The `ER_DIAGRAM.png` in the
repository root predates the `locations` and `show_pricing` tables — this file
is the current one.

```mermaid
erDiagram
    LOCATIONS ||--o{ THEATERS : "hosts"
    THEATERS  ||--o{ SCREENS  : "has"
    SCREENS   ||--o{ SEATS    : "contains"
    SCREENS   ||--o{ SHOWS    : "hosts"
    MOVIES    ||--o{ SHOWS    : "scheduled as"
    SHOWS     ||--o{ SHOW_PRICING  : "priced by category"
    SHOWS     ||--o{ BOOKINGS      : "booked as"
    USERS     ||--o{ BOOKINGS      : "makes"
    BOOKINGS  ||--o{ BOOKING_SEATS : "allocates"
    SEATS     ||--o{ BOOKING_SEATS : "allocated in"
    SHOWS     ||--o{ BOOKING_SEATS : "scoped to"
    BOOKINGS  ||--o{ PAYMENTS      : "settled by"

    LOCATIONS {
        int location_id PK
        string city UK
        string state UK
        string country UK
        boolean is_active
    }

    THEATERS {
        int theater_id PK
        int location_id FK
        string name
        string location "locality"
        string address
        string contact_phone
        json facilities
        boolean is_active
    }

    SCREENS {
        int screen_id PK
        int theater_id FK
        int screen_number UK
        string name
        enum screen_type "Standard|Premium|IMAX|4DX|Recliner"
        int total_seats "maintained by trigger"
        boolean is_active
    }

    SEATS {
        int seat_id PK
        int screen_id FK
        string seat_row UK
        int seat_number UK
        enum seat_type "Silver|Gold|Platinum|Recliner"
        boolean is_active
    }

    MOVIES {
        int movie_id PK
        string title
        text description
        string genre
        string language
        int duration_minutes
        string certificate
        date release_date
        decimal rating
        string poster_url
        string banner_url
        string trailer_url
        string director
        text cast_list "CAST is reserved in MySQL 8"
        enum status "ComingSoon|NowShowing|Ended"
        boolean is_published
        boolean is_active
    }

    SHOWS {
        int show_id PK
        int movie_id FK
        int screen_id FK
        datetime show_time UK
        datetime end_time
        decimal base_price "admin-set, immutable"
        decimal demand_multiplier "clamped 1.00-2.00"
        enum status "Scheduled|Cancelled|Completed"
        boolean is_active
    }

    SHOW_PRICING {
        int show_id PK_FK
        enum seat_type PK
        decimal price
    }

    USERS {
        int user_id PK
        string full_name
        string email UK
        varbinary phone_encrypted "AES-256-GCM, key from env"
        string avatar_url
        string password_hash "bcrypt"
        enum role "Customer|Admin"
        text refresh_token
        json preferences
        boolean is_active
    }

    BOOKINGS {
        int booking_id PK
        string booking_ref UK "CW-YYYY-NNNNNN"
        int user_id FK
        int show_id FK
        decimal seat_amount
        decimal convenience_fee
        decimal tax_amount
        decimal discount_amount
        decimal total_amount
        enum status "Pending|PaymentProcessing|PaymentSuccess|Confirmed|PaymentFailed|Cancelled|Refunded|Expired"
        datetime expires_at "mirrors the Redis hold"
        datetime booking_time
        datetime confirmed_at
        datetime cancelled_at
    }

    BOOKING_SEATS {
        int booking_seat_id PK
        int booking_id FK
        int show_id FK
        int seat_id FK
        decimal seat_price
        boolean is_active
        string occupancy_key UK "NULL when released"
    }

    PAYMENTS {
        int payment_id PK
        int booking_id FK
        enum payment_method
        string transaction_id UK
        string idempotency_key UK
        string gateway_order_id
        decimal amount
        enum payment_status "Pending|Success|Failed|Refunded"
        string failure_reason
        timestamp payment_time
    }
```

## Supporting tables

Not shown above because nothing references them by foreign key:

| Table | Purpose |
| ----- | ------- |
| `webhook_logs` | Payment-event idempotency ledger. `UNIQUE(event_id)` is what makes duplicate webhook delivery harmless |
| `audit_logs` | Administrative actions |
| `booking_logs` | Booking status transitions, written by trigger |
| `seat_booking_logs` | Seat allocation and release, written by trigger |
| `schema_migrations` | Applied SQL files and their checksums |

## Two relationships worth calling out

**`booking_seats.occupancy_key`** is a stored generated column that resolves to
`"<show_id>:<seat_id>"` while the row holds the seat and to `NULL` once it is
released. Because MySQL permits many NULLs in a unique index but only one
non-NULL duplicate, the unique constraint on it is what makes double booking
impossible at the storage-engine level — independently of Redis and of the
application.

**`bookings` is not partitioned.** The original schema partitioned it by
`YEAR(booking_time)`, which forced the primary key to be
`(booking_id, booking_time)`. A composite key meant nothing could hold a
foreign key onto bookings, which is why `booking_seats` and `payments`
originally had none and could be orphaned. Referential integrity across the
booking chain matters more here than year partitions on a table of this size.
