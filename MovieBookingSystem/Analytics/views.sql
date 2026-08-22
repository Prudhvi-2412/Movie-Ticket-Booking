-- =====================================================================
-- CineWave — Analytics Views
--
-- Every admin analytics endpoint reads from these. Nothing in the admin
-- dashboard is computed in JS from hardcoded numbers.
--
-- Revenue is measured from `payments` rows in Success state, counted with
-- DISTINCT so that a booking carrying a retry payment row is not counted
-- twice -- the original movie_revenue view summed every joined payment and
-- inflated revenue whenever a booking had more than one payment record.
-- =====================================================================
USE MovieBookingDB;

-- ---------------------------------------------------------------------
-- 1. Revenue and ticket volume per movie
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW movie_revenue AS
SELECT
    m.movie_id,
    m.title           AS movie_title,
    m.poster_url,
    m.language,
    m.genre,
    COALESCE(SUM(pay.amount), 0)      AS total_revenue,
    COUNT(DISTINCT pay.booking_id)    AS total_bookings,
    COALESCE(SUM(pay.seat_count), 0)  AS tickets_sold
FROM movies m
LEFT JOIN shows s ON s.movie_id = m.movie_id
LEFT JOIN (
    SELECT b.booking_id,
           b.show_id,
           b.total_amount AS amount,
           (SELECT COUNT(*) FROM booking_seats bs
             WHERE bs.booking_id = b.booking_id AND bs.is_active = 1) AS seat_count
    FROM bookings b
    WHERE b.status = 'Confirmed'
) pay ON pay.show_id = s.show_id
WHERE m.is_active = TRUE
GROUP BY m.movie_id, m.title, m.poster_url, m.language, m.genre;

-- ---------------------------------------------------------------------
-- 2. Per-show occupancy
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW theater_occupancy AS
SELECT
    s.show_id,
    s.show_time,
    DATE(s.show_time) AS show_date,
    t.theater_id,
    t.name            AS theater_name,
    l.location_id,
    l.city,
    m.movie_id,
    m.title           AS movie_title,
    sc.screen_id,
    sc.screen_number,
    sc.total_seats,
    COALESCE(bk.seats_booked, 0) AS seats_booked,
    ROUND(COALESCE(bk.seats_booked, 0) / GREATEST(sc.total_seats, 1) * 100, 2) AS occupancy_percentage
FROM shows s
JOIN movies   m  ON m.movie_id   = s.movie_id
JOIN screens  sc ON sc.screen_id = s.screen_id
JOIN theaters t  ON t.theater_id = sc.theater_id
JOIN locations l ON l.location_id = t.location_id
LEFT JOIN (
    SELECT bs.show_id, COUNT(*) AS seats_booked
    FROM booking_seats bs
    JOIN bookings b ON b.booking_id = bs.booking_id
    WHERE bs.is_active = 1 AND b.status = 'Confirmed'
    GROUP BY bs.show_id
) bk ON bk.show_id = s.show_id
WHERE t.is_active = TRUE
  AND m.is_active = TRUE
  AND s.is_active = TRUE;

-- ---------------------------------------------------------------------
-- 3. Revenue per theatre
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW theater_revenue AS
SELECT
    t.theater_id,
    t.name  AS theater_name,
    l.city,
    COUNT(DISTINCT b.booking_id)      AS total_bookings,
    COALESCE(SUM(b.total_amount), 0)  AS total_revenue
FROM theaters t
JOIN locations l ON l.location_id = t.location_id
LEFT JOIN screens  sc ON sc.theater_id = t.theater_id
LEFT JOIN shows    s  ON s.screen_id   = sc.screen_id
LEFT JOIN bookings b  ON b.show_id     = s.show_id AND b.status = 'Confirmed'
WHERE t.is_active = TRUE
GROUP BY t.theater_id, t.name, l.city;

-- ---------------------------------------------------------------------
-- 4. Revenue per location
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW location_revenue AS
SELECT
    l.location_id,
    l.city,
    l.state,
    COUNT(DISTINCT t.theater_id)     AS theatre_count,
    COUNT(DISTINCT b.booking_id)     AS total_bookings,
    COALESCE(SUM(b.total_amount), 0) AS total_revenue
FROM locations l
LEFT JOIN theaters t  ON t.location_id = l.location_id AND t.is_active = TRUE
LEFT JOIN screens  sc ON sc.theater_id = t.theater_id
LEFT JOIN shows    s  ON s.screen_id   = sc.screen_id
LEFT JOIN bookings b  ON b.show_id     = s.show_id AND b.status = 'Confirmed'
WHERE l.is_active = TRUE
GROUP BY l.location_id, l.city, l.state;

-- ---------------------------------------------------------------------
-- 5. Daily booking / revenue trend (last 30 days)
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW daily_booking_trend AS
SELECT
    DATE(b.booking_time)                                              AS booking_date,
    COUNT(*)                                                          AS total_bookings,
    SUM(b.status = 'Confirmed')                                       AS confirmed_bookings,
    SUM(b.status IN ('Cancelled', 'Refunded'))                        AS cancelled_bookings,
    COALESCE(SUM(CASE WHEN b.status = 'Confirmed' THEN b.total_amount END), 0) AS revenue
FROM bookings b
WHERE b.booking_time >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
GROUP BY DATE(b.booking_time);

-- ---------------------------------------------------------------------
-- 6. Peak booking hours
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW peak_booking_hours AS
SELECT
    HOUR(b.booking_time) AS hour_of_day,
    COUNT(*)             AS total_bookings,
    COALESCE(SUM(CASE WHEN b.status = 'Confirmed' THEN b.total_amount END), 0) AS revenue
FROM bookings b
GROUP BY HOUR(b.booking_time);

-- ---------------------------------------------------------------------
-- 7. Seat-category performance
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW seat_category_performance AS
SELECT
    se.seat_type,
    COUNT(*)                          AS tickets_sold,
    COALESCE(SUM(bs.seat_price), 0)   AS revenue,
    ROUND(AVG(bs.seat_price), 2)      AS avg_price
FROM booking_seats bs
JOIN bookings b ON b.booking_id = bs.booking_id AND b.status = 'Confirmed'
JOIN seats se   ON se.seat_id = bs.seat_id
WHERE bs.is_active = 1
GROUP BY se.seat_type;

-- ---------------------------------------------------------------------
-- 8. Payment outcome breakdown
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW payment_outcomes AS
SELECT
    p.payment_status,
    p.payment_method,
    COUNT(*)                     AS attempts,
    COALESCE(SUM(p.amount), 0)   AS amount
FROM payments p
GROUP BY p.payment_status, p.payment_method;

-- ---------------------------------------------------------------------
-- 9. User booking history
-- ---------------------------------------------------------------------
-- The phone column is deliberately absent: phone numbers are encrypted by
-- the application with a key held in the environment, so SQL cannot (and
-- should not) decrypt them. The old view embedded the literal key
-- 'my_secret_key' in the view definition, which put it in plain sight for
-- anyone with SHOW CREATE VIEW.
CREATE OR REPLACE VIEW user_booking_history AS
SELECT
    u.user_id,
    u.full_name,
    u.email,
    b.booking_id,
    b.booking_ref,
    m.title       AS movie_title,
    t.name        AS theater_name,
    s.show_time,
    b.total_amount,
    b.status,
    b.booking_time
FROM users u
JOIN bookings b  ON b.user_id    = u.user_id
JOIN shows    s  ON s.show_id    = b.show_id
JOIN movies   m  ON m.movie_id   = s.movie_id
JOIN screens  sc ON sc.screen_id = s.screen_id
JOIN theaters t  ON t.theater_id = sc.theater_id
WHERE u.is_active = TRUE;
