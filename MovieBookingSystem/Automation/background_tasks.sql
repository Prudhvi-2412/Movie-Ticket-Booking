-- =====================================================================
-- CineWave — Scheduled database maintenance
--
-- Expiring abandoned seat holds used to live here as a MySQL EVENT *and*
-- in backend/src/workers/seatCleanupWorker.js, with two different rules
-- (15 minutes here, 10 minutes there) and neither releasing booking_seats.
-- Reclaiming a hold has to delete the matching Redis lock keys as well,
-- which a MySQL event cannot do, so that job now belongs solely to the Node
-- worker calling the ExpireStaleBookings procedure. Only housekeeping that
-- is purely relational is left in here.
-- =====================================================================
USE MovieBookingDB;

DROP EVENT IF EXISTS cancel_expired_bookings;
DROP EVENT IF EXISTS cleanup_old_logs;

DELIMITER //

-- Trim audit trails to a rolling one-year window.
CREATE EVENT IF NOT EXISTS cleanup_old_logs
ON SCHEDULE EVERY 1 DAY
DO
BEGIN
    DELETE FROM booking_logs      WHERE changed_at  < NOW() - INTERVAL 1 YEAR;
    DELETE FROM seat_booking_logs WHERE action_time < NOW() - INTERVAL 1 YEAR;
    DELETE FROM webhook_logs      WHERE created_at  < NOW() - INTERVAL 6 MONTH;
END //

DELIMITER ;
