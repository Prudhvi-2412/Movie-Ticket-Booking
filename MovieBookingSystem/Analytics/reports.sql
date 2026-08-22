-- =====================================================================
-- CineWave — Reference report queries
--
-- SELECT-only. Not executed by the migration runner; these are here to run
-- by hand against the database.
--
-- Revenue is taken from bookings.total_amount rather than by summing joined
-- payment rows: a booking that saw a retry has more than one payment row, and
-- summing across the join double-counts it.
-- =====================================================================
USE MovieBookingDB;

-- 1. Daily booking statistics
SELECT
    DATE(booking_time)       AS booking_date,
    COUNT(*)                 AS total_bookings,
    SUM(total_amount)        AS daily_revenue,
    ROUND(AVG(total_amount), 2) AS average_order_value
FROM bookings
WHERE status = 'Confirmed'
GROUP BY DATE(booking_time)
ORDER BY booking_date DESC;

-- 2. Top revenue-generating movies
SELECT movie_title, tickets_sold, total_revenue
FROM movie_revenue
ORDER BY total_revenue DESC
LIMIT 10;

-- 3. Most active customers
SELECT
    u.user_id,
    u.full_name,
    COUNT(b.booking_id)                                  AS booking_count,
    COALESCE(SUM(CASE WHEN b.status = 'Confirmed'
                      THEN b.total_amount END), 0)       AS lifetime_value
FROM users u
JOIN bookings b ON b.user_id = u.user_id
WHERE u.is_active = TRUE
GROUP BY u.user_id, u.full_name
ORDER BY booking_count DESC, lifetime_value DESC
LIMIT 20;

-- 4. Revenue by theatre
SELECT theater_name, city, total_bookings, total_revenue
FROM theater_revenue
ORDER BY total_revenue DESC;

-- 5. Shows filling up, so pricing or extra screenings can be considered
SELECT
    movie_title, theater_name, show_time,
    seats_booked, total_seats, occupancy_percentage,
    GetScreenStatus(show_id) AS fill_status
FROM theater_occupancy
WHERE show_time > NOW()
  AND occupancy_percentage > 50
ORDER BY occupancy_percentage DESC;

-- 6. Seats currently held but not yet paid for
SELECT
    b.booking_ref, u.email, m.title AS movie_title,
    b.booking_time, b.expires_at,
    TIMESTAMPDIFF(SECOND, NOW(), b.expires_at) AS seconds_remaining,
    COUNT(bs.seat_id) AS seats_held
FROM bookings b
JOIN users  u  ON u.user_id  = b.user_id
JOIN shows  s  ON s.show_id  = b.show_id
JOIN movies m  ON m.movie_id = s.movie_id
JOIN booking_seats bs ON bs.booking_id = b.booking_id AND bs.is_active = 1
WHERE b.status IN ('Pending', 'PaymentProcessing')
GROUP BY b.booking_id, b.booking_ref, u.email, m.title, b.booking_time, b.expires_at
ORDER BY b.expires_at;

-- 7. Payment reconciliation — events that could not be applied
SELECT event_id, event_type, status, error_message, created_at, processed_at
FROM webhook_logs
WHERE status IN ('FAILED', 'IGNORED')
ORDER BY created_at DESC;

-- 8. Cancellation rate by movie
SELECT
    m.title AS movie_title,
    COUNT(*)                                            AS total_bookings,
    SUM(b.status IN ('Cancelled', 'Refunded'))          AS cancellations,
    ROUND(SUM(b.status IN ('Cancelled', 'Refunded')) / COUNT(*) * 100, 2) AS cancellation_rate
FROM bookings b
JOIN shows  s ON s.show_id  = b.show_id
JOIN movies m ON m.movie_id = s.movie_id
GROUP BY m.movie_id, m.title
HAVING total_bookings > 0
ORDER BY cancellation_rate DESC;
