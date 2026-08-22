-- =====================================================================
-- CineWave — Stored Functions
-- =====================================================================
USE MovieBookingDB;

DROP FUNCTION IF EXISTS CalculateLoyaltyDiscount;
DROP FUNCTION IF EXISTS GetScreenStatus;
DROP FUNCTION IF EXISTS GetSeatPrice;

DELIMITER //

-- ---------------------------------------------------------------------
-- 1. Loyalty discount percentage for a customer
-- ---------------------------------------------------------------------
-- READS SQL DATA (not DETERMINISTIC): the result depends on table
-- contents, and mislabelling it as deterministic lets the optimiser and
-- the replication binlog cache a stale value.
CREATE FUNCTION CalculateLoyaltyDiscount(p_user_id INT)
RETURNS DECIMAL(5,2)
READS SQL DATA
BEGIN
    DECLARE v_count    INT DEFAULT 0;
    DECLARE v_discount DECIMAL(5,2) DEFAULT 0.00;

    SELECT COUNT(*) INTO v_count
    FROM bookings
    WHERE user_id = p_user_id AND status = 'Confirmed';

    IF      v_count > 20 THEN SET v_discount = 20.00;
    ELSEIF  v_count > 10 THEN SET v_discount = 10.00;
    ELSEIF  v_count > 5  THEN SET v_discount = 5.00;
    END IF;

    RETURN v_discount;
END //

-- ---------------------------------------------------------------------
-- 2. Human-readable fill status for a show
-- ---------------------------------------------------------------------
CREATE FUNCTION GetScreenStatus(p_show_id INT)
RETURNS VARCHAR(20)
READS SQL DATA
BEGIN
    DECLARE v_pct DECIMAL(6,2) DEFAULT 0;

    SELECT COALESCE(occupancy_percentage, 0) INTO v_pct
    FROM theater_occupancy WHERE show_id = p_show_id;

    IF      v_pct >= 100 THEN RETURN 'SOLD OUT';
    ELSEIF  v_pct >= 80  THEN RETURN 'ALMOST FULL';
    ELSEIF  v_pct >= 50  THEN RETURN 'FILLING FAST';
    ELSE                      RETURN 'AVAILABLE';
    END IF;
END //

-- ---------------------------------------------------------------------
-- 3. Effective price of one seat category on one show
-- ---------------------------------------------------------------------
-- Single source of truth for pricing: the admin-set category price for the
-- show, scaled by the show's clamped demand multiplier. Falls back to the
-- show's base price when no category override exists.
CREATE FUNCTION GetSeatPrice(p_show_id INT, p_seat_type VARCHAR(20))
RETURNS DECIMAL(10,2)
READS SQL DATA
BEGIN
    DECLARE v_price      DECIMAL(10,2) DEFAULT NULL;
    DECLARE v_base       DECIMAL(10,2) DEFAULT 0;
    DECLARE v_multiplier DECIMAL(4,2)  DEFAULT 1.00;

    SELECT base_price, demand_multiplier INTO v_base, v_multiplier
    FROM shows WHERE show_id = p_show_id;

    SELECT price INTO v_price
    FROM show_pricing WHERE show_id = p_show_id AND seat_type = p_seat_type;

    IF v_price IS NULL THEN
        SET v_price = v_base * CASE p_seat_type
            WHEN 'Recliner' THEN 2.00
            WHEN 'Platinum' THEN 1.30
            WHEN 'Gold'     THEN 1.15
            ELSE 1.00
        END;
    END IF;

    RETURN ROUND(v_price * COALESCE(v_multiplier, 1.00), 2);
END //

DELIMITER ;
