USE MovieBookingDB;

DROP FUNCTION IF EXISTS CalculateLoyaltyDiscount;
DROP FUNCTION IF EXISTS GetScreenStatus;

DELIMITER //

-- 1. Function to Calculate Loyalty Discount
-- Returns a discount percentage based on how many bookings a user has made
CREATE FUNCTION CalculateLoyaltyDiscount(p_user_id INT) 
RETURNS DECIMAL(5,2)
DETERMINISTIC
BEGIN
    DECLARE v_booking_count INT;
    DECLARE v_discount DECIMAL(5,2) DEFAULT 0;

    -- Count confirmed bookings for this user
    SELECT COUNT(*) INTO v_booking_count 
    FROM bookings 
    WHERE user_id = p_user_id AND status = 'Confirmed';

    -- Tiered Discount Logic
    IF v_booking_count > 20 THEN
        SET v_discount = 20.00; -- 20% discount
    ELSEIF v_booking_count > 10 THEN
        SET v_discount = 10.00; -- 10% discount
    ELSEIF v_booking_count > 5 THEN
        SET v_discount = 5.00;  -- 5% discount
    END IF;

    RETURN v_discount;
END //

-- 2. Function to Get Screen Occupancy Status (Text-based)
CREATE FUNCTION GetScreenStatus(p_show_id INT) 
RETURNS VARCHAR(20)
DETERMINISTIC
BEGIN
    DECLARE v_pct DECIMAL(5,2);
    DECLARE v_status VARCHAR(20);

    SELECT occupancy_percentage INTO v_pct 
    FROM theater_occupancy 
    WHERE show_id = p_show_id;

    IF v_pct IS NULL THEN
        SET v_status = 'AVAILABLE';
    ELSEIF v_pct >= 90 THEN
        SET v_status = 'HOUSEFULL';
    ELSEIF v_pct >= 50 THEN
        SET v_status = 'FILLING FAST';
    ELSE
        SET v_status = 'AVAILABLE';
    END IF;

    RETURN v_status;
END //

DELIMITER ;
