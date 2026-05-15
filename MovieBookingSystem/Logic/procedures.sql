USE MovieBookingDB;

DELIMITER //

-- 1. Procedure to Book Tickets with Transaction Management
CREATE PROCEDURE BookTicket(
    IN p_user_id INT,
    IN p_show_id INT,
    IN p_seat_ids TEXT, -- Comma separated seat IDs
    IN p_amount DECIMAL(10,2)
)
BEGIN
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;

    START TRANSACTION;

    -- Check if any of the requested seats are already booked for this show
    -- This is a simplified check for the demo
    IF EXISTS (
        SELECT 1 FROM booking_seats bs
        JOIN bookings b ON bs.booking_id = b.booking_id
        WHERE b.show_id = p_show_id 
        AND FIND_IN_SET(bs.seat_id, p_seat_ids)
        AND b.status = 'Confirmed'
    ) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'One or more seats are already booked.';
    END IF;

    -- Create Booking
    INSERT INTO bookings (user_id, show_id, total_amount, status)
    VALUES (p_user_id, p_show_id, p_amount, 'Pending');
    
    SET @new_booking_id = LAST_INSERT_ID();

    -- In a real scenario, we would parse p_seat_ids. 
    -- For demonstration, we'll assume the logic for multi-seat insertion exists.
    -- (Complex parsing is usually handled by app logic or a helper loop)

    COMMIT;
END //

-- 2. Procedure to Cancel Ticket
CREATE PROCEDURE CancelBooking(IN p_booking_id INT)
BEGIN
    UPDATE bookings 
    SET status = 'Cancelled' 
    WHERE booking_id = p_booking_id;
    
    -- Refund logic (simplified)
    UPDATE payments 
    SET payment_status = 'Refunded' 
    WHERE booking_id = p_booking_id;
END //

-- 3. Procedure to Get Available Seats
CREATE PROCEDURE GetAvailableSeats(IN p_show_id INT)
BEGIN
    SELECT s.seat_id, s.seat_row, s.seat_number, s.seat_type
    FROM seats s
    JOIN shows sh ON s.screen_id = sh.screen_id
    WHERE sh.show_id = p_show_id
    AND s.seat_id NOT IN (
        SELECT bs.seat_id 
        FROM booking_seats bs
        JOIN bookings b ON bs.booking_id = b.booking_id
        WHERE b.show_id = p_show_id AND b.status = 'Confirmed'
    );
END //

-- 4. Procedure to Update Payment and Confirm Booking
CREATE PROCEDURE ProcessPayment(
    IN p_booking_id INT,
    IN p_method VARCHAR(50),
    IN p_trans_id VARCHAR(100)
)
BEGIN
    DECLARE v_amount DECIMAL(10,2);
    SELECT total_amount INTO v_amount FROM bookings WHERE booking_id = p_booking_id;

    INSERT INTO payments (booking_id, payment_method, transaction_id, amount, payment_status)
    VALUES (p_booking_id, p_method, p_trans_id, v_amount, 'Success');
    
    -- Note: The trigger (in triggers.sql) will automatically 
    -- update the booking status to 'Confirmed' once this insert happens.
END //

-- 5. Dynamic Pricing Engine
-- Increases price if occupancy is high (>80%)
CREATE PROCEDURE UpdateDynamicPrice(IN p_show_id INT)
BEGIN
    DECLARE v_occupancy_pct DECIMAL(5,2);
    DECLARE v_base_price DECIMAL(10,2);
    
    -- Get current occupancy percentage from our view
    SELECT occupancy_percentage INTO v_occupancy_pct 
    FROM theater_occupancy 
    WHERE show_time > NOW() AND occupancy_percentage IS NOT NULL -- Simplified for specific show
    LIMIT 1; 

    -- If occupancy > 80%, increase price by 15%
    IF v_occupancy_pct > 80 THEN
        UPDATE shows 
        SET price = price * 1.15 
        WHERE show_id = p_show_id;
    END IF;
END //

-- 6. Procedure to Register User with Encryption
CREATE PROCEDURE RegisterUser(
    IN p_name VARCHAR(100),
    IN p_email VARCHAR(100),
    IN p_phone VARCHAR(15),
    IN p_password VARCHAR(255)
)
BEGIN
    INSERT INTO users (full_name, email, phone_encrypted, password_hash)
    VALUES (
        p_name, 
        p_email, 
        AES_ENCRYPT(p_phone, 'my_secret_key'), -- Encrypting at rest
        SHA2(p_password, 256) -- Hashing password
    );
END //

DELIMITER ;
