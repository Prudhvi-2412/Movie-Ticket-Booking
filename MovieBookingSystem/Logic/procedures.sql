-- =====================================================================
-- CineWave — Stored Procedures
--
-- These procedures own every write that changes booking state. The API
-- layer calls them rather than reimplementing the same logic in JS, so
-- there is exactly one definition of "what confirming a booking means".
-- =====================================================================
USE MovieBookingDB;

DROP PROCEDURE IF EXISTS BookTicket;
DROP PROCEDURE IF EXISTS CreateBooking;
DROP PROCEDURE IF EXISTS ConfirmBookingPayment;
DROP PROCEDURE IF EXISTS FailBookingPayment;
DROP PROCEDURE IF EXISTS CancelBooking;
DROP PROCEDURE IF EXISTS ExpireStaleBookings;
DROP PROCEDURE IF EXISTS GetAvailableSeats;
DROP PROCEDURE IF EXISTS ProcessPayment;
DROP PROCEDURE IF EXISTS UpdateDynamicPrice;
DROP PROCEDURE IF EXISTS RegisterUser;

DELIMITER //

-- ---------------------------------------------------------------------
-- 1. CreateBooking — pending booking + seat allocation, atomically
-- ---------------------------------------------------------------------
-- p_seats_json: [{"seat_id": 12, "price": 220.00}, ...]
--
-- The caller (bookingController) has already verified that this user holds
-- the Redis lock on every seat. This procedure is the second, authoritative
-- gate: the uq_seat_occupancy unique index makes a double allocation
-- impossible at the storage-engine level, so even a bypassed API or a Redis
-- outage cannot produce two live bookings for one seat.
CREATE PROCEDURE CreateBooking(
    IN  p_user_id         INT,
    IN  p_show_id         INT,
    IN  p_seats_json      JSON,
    IN  p_convenience_fee DECIMAL(10,2),
    IN  p_tax_rate        DECIMAL(5,4),
    IN  p_hold_seconds    INT,
    OUT p_booking_id      INT,
    OUT p_booking_ref     VARCHAR(24)
)
proc: BEGIN
    DECLARE v_requested   INT DEFAULT 0;
    DECLARE v_valid       INT DEFAULT 0;
    DECLARE v_seat_amount DECIMAL(10,2) DEFAULT 0.00;
    DECLARE v_tax         DECIMAL(10,2) DEFAULT 0.00;
    DECLARE v_total       DECIMAL(10,2) DEFAULT 0.00;
    DECLARE v_show_ok     INT DEFAULT 0;
    DECLARE v_dup_seat    INT DEFAULT 0;

    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;

    START TRANSACTION;

    -- The show must exist, be live, and not already have started.
    SELECT COUNT(*) INTO v_show_ok
    FROM shows
    WHERE show_id = p_show_id
      AND is_active = TRUE
      AND status = 'Scheduled'
      AND show_time > NOW();

    IF v_show_ok = 0 THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'This show is no longer open for booking.';
    END IF;

    SELECT COUNT(*), COALESCE(SUM(jt.price), 0)
      INTO v_requested, v_seat_amount
    FROM JSON_TABLE(p_seats_json, '$[*]' COLUMNS (
             seat_id INT PATH '$.seat_id',
             price   DECIMAL(10,2) PATH '$.price'
         )) AS jt;

    IF v_requested = 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'At least one seat is required.';
    END IF;

    -- Every requested seat must physically belong to this show's screen.
    SELECT COUNT(*) INTO v_valid
    FROM JSON_TABLE(p_seats_json, '$[*]' COLUMNS (seat_id INT PATH '$.seat_id')) AS jt
    JOIN seats s  ON s.seat_id = jt.seat_id AND s.is_active = TRUE
    JOIN shows sh ON sh.show_id = p_show_id AND sh.screen_id = s.screen_id;

    IF v_valid <> v_requested THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'One or more seats do not belong to the selected show.';
    END IF;

    -- Fail fast with a readable message rather than a raw duplicate-key error.
    SELECT COUNT(*) INTO v_dup_seat
    FROM booking_seats bs
    JOIN JSON_TABLE(p_seats_json, '$[*]' COLUMNS (seat_id INT PATH '$.seat_id')) AS jt
      ON jt.seat_id = bs.seat_id
    WHERE bs.show_id = p_show_id AND bs.is_active = 1;

    IF v_dup_seat > 0 THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'One or more of those seats have just been taken.';
    END IF;

    SET v_tax   = ROUND((v_seat_amount + p_convenience_fee) * p_tax_rate, 2);
    SET v_total = ROUND(v_seat_amount + p_convenience_fee + v_tax, 2);

    INSERT INTO bookings (booking_ref, user_id, show_id, seat_amount,
                          convenience_fee, tax_amount, total_amount,
                          status, expires_at)
    -- booking_ref is derived from booking_id, which does not exist until the
    -- row is inserted, so a unique placeholder holds the NOT NULL/UNIQUE slot
    -- for the length of this transaction. Trimmed to fit VARCHAR(24); the
    -- retained prefix of MySQL's time-based UUID is the part that varies.
    VALUES (LEFT(CONCAT('TMP-', REPLACE(UUID(), '-', '')), 24), p_user_id, p_show_id, v_seat_amount,
            p_convenience_fee, v_tax, v_total,
            'Pending', DATE_ADD(NOW(), INTERVAL p_hold_seconds SECOND));

    SET p_booking_id  = LAST_INSERT_ID();
    SET p_booking_ref = CONCAT('CW-', YEAR(NOW()), '-', LPAD(p_booking_id, 6, '0'));

    UPDATE bookings SET booking_ref = p_booking_ref WHERE booking_id = p_booking_id;

    INSERT INTO booking_seats (booking_id, show_id, seat_id, seat_price)
    SELECT p_booking_id, p_show_id, jt.seat_id, jt.price
    FROM JSON_TABLE(p_seats_json, '$[*]' COLUMNS (
             seat_id INT PATH '$.seat_id',
             price   DECIMAL(10,2) PATH '$.price'
         )) AS jt;

    COMMIT;
END //

-- ---------------------------------------------------------------------
-- 2. ConfirmBookingPayment — the only path to a Confirmed booking
-- ---------------------------------------------------------------------
-- Safe to call more than once for the same booking: a booking already in
-- Confirmed simply returns. That is what makes duplicate webhook deliveries
-- harmless even if they carry different event ids.
CREATE PROCEDURE ConfirmBookingPayment(
    IN p_booking_id       INT,
    IN p_method           VARCHAR(50),
    IN p_transaction_id   VARCHAR(100),
    IN p_idempotency_key  VARCHAR(100),
    IN p_gateway_order_id VARCHAR(100),
    IN p_amount           DECIMAL(10,2)
)
proc: BEGIN
    DECLARE v_status     VARCHAR(30);
    DECLARE v_expires_at DATETIME;
    DECLARE v_amount     DECIMAL(10,2);

    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;

    START TRANSACTION;

    SELECT status, expires_at, total_amount
      INTO v_status, v_expires_at, v_amount
    FROM bookings
    WHERE booking_id = p_booking_id
    FOR UPDATE;

    IF v_status IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Booking not found.';
    END IF;

    -- Already settled — treat as success so retries stay idempotent.
    IF v_status = 'Confirmed' THEN
        COMMIT;
        LEAVE proc;
    END IF;

    IF v_status NOT IN ('Pending', 'PaymentProcessing', 'PaymentSuccess') THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'This booking can no longer be paid for.';
    END IF;

    IF v_expires_at IS NOT NULL AND v_expires_at < NOW() THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'The seat hold for this booking has expired.';
    END IF;

    -- The unique key on idempotency_key means a replayed gateway callback
    -- updates the existing row instead of inserting a second payment.
    INSERT INTO payments (booking_id, payment_method, transaction_id,
                          idempotency_key, gateway_order_id, amount, payment_status)
    VALUES (p_booking_id, p_method, p_transaction_id,
            p_idempotency_key, p_gateway_order_id, COALESCE(p_amount, v_amount), 'Success')
    ON DUPLICATE KEY UPDATE
        payment_status = 'Success',
        updated_at     = NOW();

    UPDATE bookings
    SET status       = 'Confirmed',
        confirmed_at = COALESCE(confirmed_at, NOW()),
        expires_at   = NULL
    WHERE booking_id = p_booking_id;

    COMMIT;
END //

-- ---------------------------------------------------------------------
-- 3. FailBookingPayment — record the failure and free the seats
-- ---------------------------------------------------------------------
CREATE PROCEDURE FailBookingPayment(
    IN p_booking_id      INT,
    IN p_method          VARCHAR(50),
    IN p_transaction_id  VARCHAR(100),
    IN p_idempotency_key VARCHAR(100),
    IN p_reason          VARCHAR(255)
)
proc: BEGIN
    DECLARE v_status VARCHAR(30);
    DECLARE v_amount DECIMAL(10,2);

    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;

    START TRANSACTION;

    SELECT status, total_amount INTO v_status, v_amount
    FROM bookings WHERE booking_id = p_booking_id FOR UPDATE;

    IF v_status IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Booking not found.';
    END IF;

    -- Never unwind a booking that already succeeded.
    IF v_status = 'Confirmed' THEN
        COMMIT;
        LEAVE proc;
    END IF;

    INSERT INTO payments (booking_id, payment_method, transaction_id,
                          idempotency_key, amount, payment_status, failure_reason)
    VALUES (p_booking_id, p_method, p_transaction_id,
            p_idempotency_key, v_amount, 'Failed', p_reason)
    ON DUPLICATE KEY UPDATE
        payment_status = 'Failed',
        failure_reason = p_reason,
        updated_at     = NOW();

    UPDATE booking_seats SET is_active = 0
    WHERE booking_id = p_booking_id AND is_active = 1;

    UPDATE bookings
    SET status = 'PaymentFailed', expires_at = NULL
    WHERE booking_id = p_booking_id;

    COMMIT;
END //

-- ---------------------------------------------------------------------
-- 4. CancelBooking — customer/admin cancellation with refund
-- ---------------------------------------------------------------------
CREATE PROCEDURE CancelBooking(IN p_booking_id INT)
proc: BEGIN
    DECLARE v_status VARCHAR(30);

    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;

    START TRANSACTION;

    SELECT status INTO v_status
    FROM bookings WHERE booking_id = p_booking_id FOR UPDATE;

    IF v_status IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Booking not found.';
    END IF;

    IF v_status IN ('Cancelled', 'Refunded', 'Expired') THEN
        COMMIT;
        LEAVE proc;
    END IF;

    -- Releasing the occupancy_key here is what puts the seats back on sale.
    UPDATE booking_seats SET is_active = 0
    WHERE booking_id = p_booking_id AND is_active = 1;

    UPDATE payments
    SET payment_status = 'Refunded', updated_at = NOW()
    WHERE booking_id = p_booking_id AND payment_status = 'Success';

    UPDATE bookings
    SET status       = IF(v_status = 'Confirmed', 'Refunded', 'Cancelled'),
        cancelled_at = NOW(),
        expires_at   = NULL
    WHERE booking_id = p_booking_id;

    COMMIT;
END //

-- ---------------------------------------------------------------------
-- 5. ExpireStaleBookings — reclaim abandoned holds
-- ---------------------------------------------------------------------
-- Driven by seatCleanupWorker. Returns the seats it freed so the worker can
-- drop the matching Redis keys.
CREATE PROCEDURE ExpireStaleBookings()
BEGIN
    DROP TEMPORARY TABLE IF EXISTS tmp_expired;
    CREATE TEMPORARY TABLE tmp_expired (booking_id INT PRIMARY KEY, show_id INT);

    INSERT INTO tmp_expired (booking_id, show_id)
    SELECT booking_id, show_id
    FROM bookings
    WHERE status IN ('Pending', 'PaymentProcessing')
      AND expires_at IS NOT NULL
      AND expires_at < NOW();

    UPDATE booking_seats bs
    JOIN tmp_expired e ON e.booking_id = bs.booking_id
    SET bs.is_active = 0
    WHERE bs.is_active = 1;

    UPDATE bookings b
    JOIN tmp_expired e ON e.booking_id = b.booking_id
    SET b.status = 'Expired', b.expires_at = NULL;

    SELECT e.booking_id, e.show_id, bs.seat_id
    FROM tmp_expired e
    JOIN booking_seats bs ON bs.booking_id = e.booking_id;

    DROP TEMPORARY TABLE IF EXISTS tmp_expired;
END //

-- ---------------------------------------------------------------------
-- 6. GetAvailableSeats
-- ---------------------------------------------------------------------
CREATE PROCEDURE GetAvailableSeats(IN p_show_id INT)
BEGIN
    SELECT s.seat_id, s.seat_row, s.seat_number, s.seat_type
    FROM seats s
    JOIN shows sh ON s.screen_id = sh.screen_id
    WHERE sh.show_id = p_show_id
      AND s.is_active = TRUE
      AND NOT EXISTS (
          SELECT 1 FROM booking_seats bs
          WHERE bs.show_id = p_show_id AND bs.seat_id = s.seat_id AND bs.is_active = 1
      )
    ORDER BY s.seat_row, s.seat_number;
END //

-- ---------------------------------------------------------------------
-- 7. UpdateDynamicPrice — demand-based pricing
-- ---------------------------------------------------------------------
-- The old version did `price = price * 1.15` on every confirmed booking
-- once occupancy passed 80%, so a busy show's price compounded upward on
-- every call. base_price is now immutable and this only *sets* a clamped
-- multiplier, making the procedure idempotent for a given occupancy.
CREATE PROCEDURE UpdateDynamicPrice(IN p_show_id INT)
BEGIN
    DECLARE v_occupancy DECIMAL(6,2) DEFAULT 0;
    DECLARE v_multiplier DECIMAL(4,2) DEFAULT 1.00;

    SELECT COALESCE(occupancy_percentage, 0) INTO v_occupancy
    FROM theater_occupancy WHERE show_id = p_show_id;

    IF      v_occupancy >= 90 THEN SET v_multiplier = 1.30;
    ELSEIF  v_occupancy >= 80 THEN SET v_multiplier = 1.20;
    ELSEIF  v_occupancy >= 60 THEN SET v_multiplier = 1.10;
    ELSE                           SET v_multiplier = 1.00;
    END IF;

    UPDATE shows SET demand_multiplier = v_multiplier WHERE show_id = p_show_id;
END //

DELIMITER ;
