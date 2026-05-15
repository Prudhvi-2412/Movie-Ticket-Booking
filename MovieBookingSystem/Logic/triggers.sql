USE MovieBookingDB;

DELIMITER //

-- 1. Trigger to log booking changes
CREATE TABLE booking_logs (
    log_id INT AUTO_INCREMENT PRIMARY KEY,
    booking_id INT,
    old_status VARCHAR(50),
    new_status VARCHAR(50),
    changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER after_booking_update
AFTER UPDATE ON bookings
FOR EACH ROW
BEGIN
    IF OLD.status <> NEW.status THEN
        INSERT INTO booking_logs (booking_id, old_status, new_status)
        VALUES (OLD.booking_id, OLD.status, NEW.status);
    END IF;
END //

-- 2. Trigger to validate seat count on show creation
CREATE TRIGGER before_show_insert
BEFORE INSERT ON shows
FOR EACH ROW
BEGIN
    DECLARE v_seat_count INT;
    SELECT total_seats INTO v_seat_count FROM screens WHERE screen_id = NEW.screen_id;
    IF v_seat_count <= 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Cannot schedule show on a screen with no seats.';
    END IF;
END //

-- 3. Trigger for Automatic Payment Tracking
-- When a payment is successful, automatically confirm the booking
CREATE TRIGGER after_payment_insert
AFTER INSERT ON payments
FOR EACH ROW
BEGIN
    IF NEW.payment_status = 'Success' THEN
        UPDATE bookings 
        SET status = 'Confirmed' 
        WHERE booking_id = NEW.booking_id;
    END IF;
END //

-- 4. Trigger to log seat booking for analytics
CREATE TABLE seat_booking_logs (
    log_id INT AUTO_INCREMENT PRIMARY KEY,
    booking_id INT,
    seat_id INT,
    action_type ENUM('Booked', 'Released'),
    action_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER after_booking_seats_insert
AFTER INSERT ON booking_seats
FOR EACH ROW
BEGIN
    INSERT INTO seat_booking_logs (booking_id, seat_id, action_type)
    VALUES (NEW.booking_id, NEW.seat_id, 'Booked');
END //

DELIMITER ;
