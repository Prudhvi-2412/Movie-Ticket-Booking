USE MovieBookingDB;

DROP EVENT IF EXISTS cancel_expired_bookings;
DROP EVENT IF EXISTS cleanup_old_logs;

-- Enable the Event Scheduler
SET GLOBAL event_scheduler = ON;

DELIMITER //

-- 1. Event to Auto-Cancel Pending Bookings
-- Runs every 5 minutes and cancels bookings that are 'Pending' for more than 15 minutes
CREATE EVENT IF NOT EXISTS cancel_expired_bookings
ON SCHEDULE EVERY 5 MINUTE
DO
BEGIN
    -- Update bookings to 'Cancelled' if they are older than 15 minutes and still 'Pending'
    UPDATE bookings 
    SET status = 'Cancelled' 
    WHERE status = 'Pending' 
    AND booking_time < NOW() - INTERVAL 15 MINUTE;
END //

-- 2. Event to Clean Up Old Audit Logs
-- Keeps the database lean by deleting logs older than 1 year
CREATE EVENT IF NOT EXISTS cleanup_old_logs
ON SCHEDULE EVERY 1 MONTH
DO
BEGIN
    DELETE FROM booking_logs 
    WHERE changed_at < NOW() - INTERVAL 1 YEAR;
END //

DELIMITER ;
