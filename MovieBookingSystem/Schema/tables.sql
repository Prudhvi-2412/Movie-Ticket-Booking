-- =====================================================================
-- CineWave — Core Schema
--
-- Applied by `npm run db:migrate` (backend/scripts/migrate.js), which runs
-- every file under MovieBookingSystem/ in a fixed order. This file is
-- idempotent: re-running it against an existing database is a no-op.
-- =====================================================================

CREATE DATABASE IF NOT EXISTS MovieBookingDB
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE MovieBookingDB;

-- ---------------------------------------------------------------------
-- 1. Users
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    user_id         INT AUTO_INCREMENT PRIMARY KEY,
    full_name       VARCHAR(100) NOT NULL,
    email           VARCHAR(100) NOT NULL,
    -- AES-256-GCM ciphertext produced by backend/src/utils/crypto.js.
    -- The key lives in the app environment, never in a SQL statement.
    phone_encrypted VARBINARY(255) NULL,
    avatar_url      VARCHAR(500) NULL,
    password_hash   VARCHAR(255) NOT NULL,
    role            ENUM('Customer', 'Admin') NOT NULL DEFAULT 'Customer',
    refresh_token   TEXT NULL,
    preferences     JSON NULL,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_users_email (email),
    KEY idx_users_role (role)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 2. Locations  (city the customer picks before browsing)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS locations (
    location_id INT AUTO_INCREMENT PRIMARY KEY,
    city        VARCHAR(100) NOT NULL,
    state       VARCHAR(100) NOT NULL,
    country     VARCHAR(100) NOT NULL DEFAULT 'India',
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_locations_city (city, state, country),
    KEY idx_locations_active (is_active)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 3. Movies
-- ---------------------------------------------------------------------
-- NOTE: the cast column is named `cast_list`. `CAST` is a reserved word in
-- MySQL 8 and an unquoted `cast` column made the original schema file fail
-- to execute at all.
CREATE TABLE IF NOT EXISTS movies (
    movie_id         INT AUTO_INCREMENT PRIMARY KEY,
    title            VARCHAR(255) NOT NULL,
    description      TEXT NULL,
    genre            VARCHAR(80) NULL,
    language         VARCHAR(50) NULL,
    duration_minutes INT NOT NULL,
    certificate      VARCHAR(16) NULL,
    release_date     DATE NULL,
    rating           DECIMAL(3,1) NULL,
    poster_url       VARCHAR(500) NULL,
    banner_url       VARCHAR(500) NULL,
    trailer_url      VARCHAR(500) NULL,
    director         VARCHAR(150) NULL,
    cast_list        TEXT NULL,
    status           ENUM('ComingSoon', 'NowShowing', 'Ended') NOT NULL DEFAULT 'NowShowing',
    is_published     BOOLEAN NOT NULL DEFAULT TRUE,
    is_active        BOOLEAN NOT NULL DEFAULT TRUE,
    created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT chk_movies_rating   CHECK (rating IS NULL OR (rating >= 0 AND rating <= 10)),
    CONSTRAINT chk_movies_duration CHECK (duration_minutes > 0),
    KEY idx_movies_status (status, is_published, is_active),
    KEY idx_movies_genre (genre),
    KEY idx_movies_language (language),
    FULLTEXT KEY ft_movies_search (title, description)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 4. Theaters
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS theaters (
    theater_id    INT AUTO_INCREMENT PRIMARY KEY,
    location_id   INT NOT NULL,
    name          VARCHAR(255) NOT NULL,
    -- Locality / neighbourhood, e.g. "Kukatpally".
    location      VARCHAR(255) NOT NULL,
    address       VARCHAR(500) NULL,
    contact_phone VARCHAR(20) NULL,
    -- JSON array of strings, e.g. ["Dolby Atmos","Recliners","Parking"].
    facilities    JSON NULL,
    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_theaters_location FOREIGN KEY (location_id)
        REFERENCES locations(location_id) ON DELETE RESTRICT,
    UNIQUE KEY uq_theaters_name_location (name, location_id),
    KEY idx_theaters_active (location_id, is_active)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 5. Screens
-- ---------------------------------------------------------------------
-- total_seats is maintained automatically by triggers on `seats`; it is a
-- cached count, never something an admin types in by hand.
CREATE TABLE IF NOT EXISTS screens (
    screen_id     INT AUTO_INCREMENT PRIMARY KEY,
    theater_id    INT NOT NULL,
    screen_number INT NOT NULL,
    name          VARCHAR(80) NULL,
    screen_type   ENUM('Standard', 'Premium', 'IMAX', '4DX', 'Recliner') NOT NULL DEFAULT 'Standard',
    total_seats   INT NOT NULL DEFAULT 0,
    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_screens_theater FOREIGN KEY (theater_id)
        REFERENCES theaters(theater_id) ON DELETE CASCADE,
    UNIQUE KEY uq_screens_number (theater_id, screen_number)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 6. Seats
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS seats (
    seat_id     INT AUTO_INCREMENT PRIMARY KEY,
    screen_id   INT NOT NULL,
    seat_row    VARCHAR(2) NOT NULL,
    seat_number INT NOT NULL,
    seat_type   ENUM('Silver', 'Gold', 'Platinum', 'Recliner') NOT NULL DEFAULT 'Silver',
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    CONSTRAINT fk_seats_screen FOREIGN KEY (screen_id)
        REFERENCES screens(screen_id) ON DELETE CASCADE,
    CONSTRAINT chk_seats_number CHECK (seat_number > 0),
    UNIQUE KEY uq_seats_position (screen_id, seat_row, seat_number),
    KEY idx_seats_screen (screen_id, seat_type)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 7. Shows
-- ---------------------------------------------------------------------
-- base_price is the admin-set anchor and is never mutated by the pricing
-- engine. Dynamic pricing only moves `demand_multiplier`, which is clamped,
-- so repeated runs can no longer compound the price upward without bound.
CREATE TABLE IF NOT EXISTS shows (
    show_id           INT AUTO_INCREMENT PRIMARY KEY,
    movie_id          INT NOT NULL,
    screen_id         INT NOT NULL,
    show_time         DATETIME NOT NULL,
    end_time          DATETIME NOT NULL,
    base_price        DECIMAL(10,2) NOT NULL,
    demand_multiplier DECIMAL(4,2) NOT NULL DEFAULT 1.00,
    status            ENUM('Scheduled', 'Cancelled', 'Completed') NOT NULL DEFAULT 'Scheduled',
    is_active         BOOLEAN NOT NULL DEFAULT TRUE,
    created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_shows_movie  FOREIGN KEY (movie_id)  REFERENCES movies(movie_id)   ON DELETE CASCADE,
    CONSTRAINT fk_shows_screen FOREIGN KEY (screen_id) REFERENCES screens(screen_id) ON DELETE CASCADE,
    CONSTRAINT chk_shows_window     CHECK (end_time > show_time),
    CONSTRAINT chk_shows_price      CHECK (base_price >= 0),
    CONSTRAINT chk_shows_multiplier CHECK (demand_multiplier >= 1.00 AND demand_multiplier <= 2.00),
    -- Two shows may not start at the same instant on the same screen. Full
    -- interval-overlap checking is done by the before-insert/update triggers.
    --
    -- There is deliberately no generated `show_date` column: MySQL evaluates
    -- STORED generated columns incorrectly on a table that also carries a
    -- BEFORE INSERT trigger, and this table needs the overlap trigger. Date
    -- filtering uses half-open ranges on show_time, which these indexes serve
    -- just as well.
    UNIQUE KEY uq_shows_screen_start (screen_id, show_time),
    KEY idx_shows_movie_time (movie_id, show_time),
    KEY idx_shows_screen_time (screen_id, show_time),
    KEY idx_shows_time (show_time)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 8. Show pricing  (per seat category, per show)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS show_pricing (
    show_id   INT NOT NULL,
    seat_type ENUM('Silver', 'Gold', 'Platinum', 'Recliner') NOT NULL,
    price     DECIMAL(10,2) NOT NULL,
    PRIMARY KEY (show_id, seat_type),
    CONSTRAINT fk_show_pricing_show FOREIGN KEY (show_id)
        REFERENCES shows(show_id) ON DELETE CASCADE,
    CONSTRAINT chk_show_pricing_price CHECK (price >= 0)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 9. Bookings
-- ---------------------------------------------------------------------
-- The original table was RANGE-partitioned on YEAR(booking_time), which
-- forced the primary key to be (booking_id, booking_time). That composite
-- key is why nothing could hold a foreign key onto bookings, and it is the
-- root cause of the orphaned booking_seats / payments rows. Referential
-- integrity on the booking chain is worth more here than year partitions on
-- a table of this size, so the partitioning is gone and the FKs are real.
CREATE TABLE IF NOT EXISTS bookings (
    booking_id      INT AUTO_INCREMENT PRIMARY KEY,
    booking_ref     VARCHAR(24) NOT NULL,
    user_id         INT NOT NULL,
    show_id         INT NOT NULL,
    seat_amount     DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    convenience_fee DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    tax_amount      DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    discount_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    total_amount    DECIMAL(10,2) NOT NULL,
    status          ENUM('Pending', 'PaymentProcessing', 'PaymentSuccess', 'Confirmed',
                         'PaymentFailed', 'Cancelled', 'Refunded', 'Expired')
                    NOT NULL DEFAULT 'Pending',
    -- Mirrors the Redis seat-lock deadline so an expired hold is detectable
    -- from SQL alone, even if Redis has been flushed.
    expires_at      DATETIME NULL,
    booking_time    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    confirmed_at    DATETIME NULL,
    cancelled_at    DATETIME NULL,
    CONSTRAINT fk_bookings_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE RESTRICT,
    CONSTRAINT fk_bookings_show FOREIGN KEY (show_id) REFERENCES shows(show_id) ON DELETE RESTRICT,
    CONSTRAINT chk_bookings_total CHECK (total_amount >= 0),
    UNIQUE KEY uq_bookings_ref (booking_ref),
    KEY idx_bookings_user (user_id, booking_time),
    KEY idx_bookings_show (show_id),
    KEY idx_bookings_status (status),
    KEY idx_bookings_expiry (status, expires_at)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 10. Booking seats
-- ---------------------------------------------------------------------
-- `occupancy_key` is the double-booking guarantee. It resolves to
-- "<show_id>:<seat_id>" while the row holds the seat and to NULL once the
-- seat is released. MySQL permits many NULLs in a unique index but only one
-- non-NULL duplicate, so the database itself rejects a second live claim on
-- a seat -- even if Redis is down and the application logic is bypassed.
CREATE TABLE IF NOT EXISTS booking_seats (
    booking_seat_id INT AUTO_INCREMENT PRIMARY KEY,
    booking_id      INT NOT NULL,
    show_id         INT NOT NULL,
    seat_id         INT NOT NULL,
    seat_price      DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    is_active       TINYINT(1) NOT NULL DEFAULT 1,
    occupancy_key   VARCHAR(32)
                    GENERATED ALWAYS AS (IF(is_active = 1, CONCAT(show_id, ':', seat_id), NULL)) STORED,
    CONSTRAINT fk_booking_seats_booking FOREIGN KEY (booking_id)
        REFERENCES bookings(booking_id) ON DELETE CASCADE,
    -- RESTRICT rather than CASCADE on show_id/seat_id is not a style choice:
    -- InnoDB rejects a cascading referential action on a base column of a
    -- stored generated column, and both feed occupancy_key. It is also the
    -- behaviour we want -- a screen or show with sold tickets must be
    -- deactivated, never deleted out from under a customer's ticket.
    CONSTRAINT fk_booking_seats_show FOREIGN KEY (show_id)
        REFERENCES shows(show_id) ON DELETE RESTRICT,
    CONSTRAINT fk_booking_seats_seat FOREIGN KEY (seat_id)
        REFERENCES seats(seat_id) ON DELETE RESTRICT,
    UNIQUE KEY uq_booking_seat (booking_id, seat_id),
    UNIQUE KEY uq_seat_occupancy (occupancy_key),
    KEY idx_booking_seats_show (show_id, is_active)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 11. Payments
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payments (
    payment_id       INT AUTO_INCREMENT PRIMARY KEY,
    booking_id       INT NOT NULL,
    payment_method   ENUM('Credit Card', 'Debit Card', 'UPI', 'Net Banking') NOT NULL,
    transaction_id   VARCHAR(100) NOT NULL,
    idempotency_key  VARCHAR(100) NULL,
    gateway_order_id VARCHAR(100) NULL,
    signature        VARCHAR(255) NULL,
    amount           DECIMAL(10,2) NOT NULL,
    payment_status   ENUM('Pending', 'Success', 'Failed', 'Refunded') NOT NULL DEFAULT 'Pending',
    failure_reason   VARCHAR(255) NULL,
    payment_time     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_payments_booking FOREIGN KEY (booking_id)
        REFERENCES bookings(booking_id) ON DELETE CASCADE,
    UNIQUE KEY uq_payments_transaction (transaction_id),
    UNIQUE KEY uq_payments_idempotency (idempotency_key),
    KEY idx_payments_booking (booking_id),
    KEY idx_payments_status (payment_status, payment_time)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 12. Webhook logs  (idempotency ledger + audit trail)
-- ---------------------------------------------------------------------
-- The UNIQUE on event_id is the idempotency mechanism itself: the webhook
-- handler INSERTs first and treats a duplicate-key error as "already seen".
-- The previous SELECT-then-INSERT left a window where two concurrent
-- deliveries of the same event could both pass the check.
CREATE TABLE IF NOT EXISTS webhook_logs (
    log_id          INT AUTO_INCREMENT PRIMARY KEY,
    event_id        VARCHAR(100) NOT NULL,
    event_type      VARCHAR(100) NOT NULL,
    idempotency_key VARCHAR(100) NOT NULL,
    payload         JSON NOT NULL,
    status          VARCHAR(50) NOT NULL DEFAULT 'RECEIVED',
    error_message   VARCHAR(500) NULL,
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    processed_at    DATETIME NULL,
    UNIQUE KEY uq_webhook_event (event_id),
    KEY idx_webhook_idempotency (idempotency_key),
    KEY idx_webhook_created (created_at)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 13. Audit / operational logs
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
    audit_id   INT AUTO_INCREMENT PRIMARY KEY,
    user_id    INT NULL,
    action     VARCHAR(100) NOT NULL,
    entity     VARCHAR(100) NOT NULL,
    entity_id  VARCHAR(100) NULL,
    details    JSON NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_audit_created (created_at),
    KEY idx_audit_entity (entity, entity_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS booking_logs (
    log_id     INT AUTO_INCREMENT PRIMARY KEY,
    booking_id INT NULL,
    old_status VARCHAR(50) NULL,
    new_status VARCHAR(50) NULL,
    changed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_booking_logs_booking (booking_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS seat_booking_logs (
    log_id      INT AUTO_INCREMENT PRIMARY KEY,
    booking_id  INT NULL,
    seat_id     INT NULL,
    action_type ENUM('Booked', 'Released') NOT NULL,
    action_time TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_seat_logs_time (action_time)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 14. Schema migration ledger
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS schema_migrations (
    filename   VARCHAR(255) NOT NULL PRIMARY KEY,
    checksum   CHAR(64) NOT NULL,
    applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;
