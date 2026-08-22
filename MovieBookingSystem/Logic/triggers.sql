-- =====================================================================
-- CineWave — Triggers
-- =====================================================================
USE MovieBookingDB;

DROP TRIGGER IF EXISTS after_booking_update;
DROP TRIGGER IF EXISTS before_show_insert;
DROP TRIGGER IF EXISTS before_show_update;
DROP TRIGGER IF EXISTS after_payment_insert;
DROP TRIGGER IF EXISTS after_booking_seats_insert;
DROP TRIGGER IF EXISTS after_booking_seats_update;
DROP TRIGGER IF EXISTS after_seats_insert;
DROP TRIGGER IF EXISTS after_seats_update;
DROP TRIGGER IF EXISTS after_seats_delete;

DELIMITER //

-- ---------------------------------------------------------------------
-- 1. Booking status audit trail
-- ---------------------------------------------------------------------
CREATE TRIGGER after_booking_update
AFTER UPDATE ON bookings
FOR EACH ROW
BEGIN
    IF OLD.status <> NEW.status THEN
        INSERT INTO booking_logs (booking_id, old_status, new_status)
        VALUES (OLD.booking_id, OLD.status, NEW.status);
    END IF;
END //

-- ---------------------------------------------------------------------
-- 2. Show scheduling validation
-- ---------------------------------------------------------------------
-- Rejects a show on a screen that has no seats configured, and rejects any
-- show whose [show_time, end_time) window overlaps an existing show on the
-- same screen. The UNIQUE(screen_id, show_time) index only catches exact
-- start collisions; this catches genuine overlaps.
CREATE TRIGGER before_show_insert
BEFORE INSERT ON shows
FOR EACH ROW
BEGIN
    DECLARE v_seat_count INT DEFAULT 0;
    DECLARE v_overlaps INT DEFAULT 0;

    SELECT COUNT(*) INTO v_seat_count
    FROM seats WHERE screen_id = NEW.screen_id AND is_active = TRUE;

    IF v_seat_count = 0 THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Cannot schedule a show on a screen with no seats configured.';
    END IF;

    SELECT COUNT(*) INTO v_overlaps
    FROM shows
    WHERE screen_id = NEW.screen_id
      AND is_active = TRUE
      AND status <> 'Cancelled'
      AND NEW.show_time < end_time
      AND NEW.end_time > show_time;

    IF v_overlaps > 0 THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'This screen already has a show scheduled during the selected time window.';
    END IF;
END //

CREATE TRIGGER before_show_update
BEFORE UPDATE ON shows
FOR EACH ROW
BEGIN
    DECLARE v_overlaps INT DEFAULT 0;

    IF NEW.status <> 'Cancelled' AND NEW.is_active = TRUE
       AND (NEW.show_time <> OLD.show_time
            OR NEW.end_time <> OLD.end_time
            OR NEW.screen_id <> OLD.screen_id) THEN

        SELECT COUNT(*) INTO v_overlaps
        FROM shows
        WHERE screen_id = NEW.screen_id
          AND show_id <> NEW.show_id
          AND is_active = TRUE
          AND status <> 'Cancelled'
          AND NEW.show_time < end_time
          AND NEW.end_time > show_time;

        IF v_overlaps > 0 THEN
            SIGNAL SQLSTATE '45000'
                SET MESSAGE_TEXT = 'This screen already has a show scheduled during the selected time window.';
        END IF;
    END IF;
END //

-- ---------------------------------------------------------------------
-- 3. Payment -> booking confirmation
-- ---------------------------------------------------------------------
-- The original version confirmed the booking unconditionally, which could
-- resurrect a booking that had already been cancelled or had expired. The
-- status guard keeps the transition legal.
CREATE TRIGGER after_payment_insert
AFTER INSERT ON payments
FOR EACH ROW
BEGIN
    IF NEW.payment_status = 'Success' THEN
        UPDATE bookings
        SET status = 'Confirmed',
            confirmed_at = COALESCE(confirmed_at, NOW())
        WHERE booking_id = NEW.booking_id
          AND status IN ('Pending', 'PaymentProcessing', 'PaymentSuccess');
    END IF;
END //

-- ---------------------------------------------------------------------
-- 4. Seat allocation audit trail
-- ---------------------------------------------------------------------
CREATE TRIGGER after_booking_seats_insert
AFTER INSERT ON booking_seats
FOR EACH ROW
BEGIN
    INSERT INTO seat_booking_logs (booking_id, seat_id, action_type)
    VALUES (NEW.booking_id, NEW.seat_id, 'Booked');
END //

CREATE TRIGGER after_booking_seats_update
AFTER UPDATE ON booking_seats
FOR EACH ROW
BEGIN
    IF OLD.is_active = 1 AND NEW.is_active = 0 THEN
        INSERT INTO seat_booking_logs (booking_id, seat_id, action_type)
        VALUES (NEW.booking_id, NEW.seat_id, 'Released');
    END IF;
END //

-- ---------------------------------------------------------------------
-- 5. Keep screens.total_seats in step with the seat map
-- ---------------------------------------------------------------------
-- Previously an admin typed total_seats by hand, so screens claimed 120
-- seats while only 3 rows existed in `seats` -- which made every occupancy
-- percentage wrong. It is now a derived count.
CREATE TRIGGER after_seats_insert
AFTER INSERT ON seats
FOR EACH ROW
BEGIN
    UPDATE screens
    SET total_seats = (SELECT COUNT(*) FROM seats WHERE screen_id = NEW.screen_id AND is_active = TRUE)
    WHERE screen_id = NEW.screen_id;
END //

CREATE TRIGGER after_seats_update
AFTER UPDATE ON seats
FOR EACH ROW
BEGIN
    UPDATE screens
    SET total_seats = (SELECT COUNT(*) FROM seats WHERE screen_id = NEW.screen_id AND is_active = TRUE)
    WHERE screen_id = NEW.screen_id;

    IF OLD.screen_id <> NEW.screen_id THEN
        UPDATE screens
        SET total_seats = (SELECT COUNT(*) FROM seats WHERE screen_id = OLD.screen_id AND is_active = TRUE)
        WHERE screen_id = OLD.screen_id;
    END IF;
END //

CREATE TRIGGER after_seats_delete
AFTER DELETE ON seats
FOR EACH ROW
BEGIN
    UPDATE screens
    SET total_seats = (SELECT COUNT(*) FROM seats WHERE screen_id = OLD.screen_id AND is_active = TRUE)
    WHERE screen_id = OLD.screen_id;
END //

DELIMITER ;
