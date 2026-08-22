-- =====================================================================
-- CineWave — Advanced analytical queries
--
-- SELECT-only reference material demonstrating window functions, CTEs and
-- correlated subqueries. Not executed by the migration runner.
--
-- As in reports.sql, revenue comes from bookings.total_amount rather than
-- from summing joined payment rows, which double-counts any booking that
-- involved a payment retry.
-- =====================================================================
USE MovieBookingDB;

-- 1. Rank movies by revenue within each genre
SELECT
    genre,
    title,
    total_revenue,
    RANK()       OVER (PARTITION BY genre ORDER BY total_revenue DESC) AS genre_rank,
    ROUND(total_revenue / NULLIF(SUM(total_revenue) OVER (PARTITION BY genre), 0) * 100, 2)
                                                                       AS pct_of_genre
FROM (
    SELECT
        m.movie_id, m.genre, m.title,
        COALESCE(SUM(b.total_amount), 0) AS total_revenue
    FROM movies m
    LEFT JOIN shows    s ON s.movie_id = m.movie_id
    LEFT JOIN bookings b ON b.show_id  = s.show_id AND b.status = 'Confirmed'
    WHERE m.is_active = TRUE
    GROUP BY m.movie_id, m.genre, m.title
) AS genre_sales
ORDER BY genre, genre_rank;

-- 2. Running total of daily revenue, with a 7-day moving average
SELECT
    booking_date,
    daily_revenue,
    SUM(daily_revenue) OVER (ORDER BY booking_date)                    AS running_total,
    ROUND(AVG(daily_revenue) OVER (ORDER BY booking_date
                                   ROWS BETWEEN 6 PRECEDING AND CURRENT ROW), 2)
                                                                       AS moving_avg_7d
FROM (
    SELECT DATE(booking_time) AS booking_date, SUM(total_amount) AS daily_revenue
    FROM bookings
    WHERE status = 'Confirmed'
    GROUP BY DATE(booking_time)
) AS daily_sales
ORDER BY booking_date;

-- 3. Customers who spend more than the average customer
WITH user_spending AS (
    SELECT user_id, SUM(total_amount) AS total_spent, COUNT(*) AS bookings
    FROM bookings
    WHERE status = 'Confirmed'
    GROUP BY user_id
)
SELECT
    u.full_name,
    u.email,
    us.bookings,
    us.total_spent,
    CalculateLoyaltyDiscount(u.user_id) AS loyalty_discount_pct
FROM user_spending us
JOIN users u ON u.user_id = us.user_id
WHERE us.total_spent > (SELECT AVG(total_spent) FROM user_spending)
ORDER BY us.total_spent DESC;

-- 4. Busiest hour of the day per city
WITH hourly AS (
    SELECT
        l.city,
        HOUR(s.show_time) AS show_hour,
        COUNT(bs.seat_id) AS tickets
    FROM booking_seats bs
    JOIN bookings  b  ON b.booking_id = bs.booking_id AND b.status = 'Confirmed'
    JOIN shows     s  ON s.show_id    = bs.show_id
    JOIN screens   sc ON sc.screen_id = s.screen_id
    JOIN theaters  t  ON t.theater_id = sc.theater_id
    JOIN locations l  ON l.location_id = t.location_id
    WHERE bs.is_active = 1
    GROUP BY l.city, HOUR(s.show_time)
)
SELECT city, show_hour, tickets
FROM (
    SELECT *, ROW_NUMBER() OVER (PARTITION BY city ORDER BY tickets DESC) AS rn
    FROM hourly
) ranked
WHERE rn = 1
ORDER BY tickets DESC;

-- 5. Seat-category mix per screen type
SELECT
    sc.screen_type,
    se.seat_type,
    COUNT(*)                                        AS tickets_sold,
    SUM(bs.seat_price)                              AS revenue,
    ROUND(COUNT(*) / SUM(COUNT(*)) OVER (PARTITION BY sc.screen_type) * 100, 2)
                                                    AS pct_of_screen_type
FROM booking_seats bs
JOIN bookings b  ON b.booking_id = bs.booking_id AND b.status = 'Confirmed'
JOIN seats    se ON se.seat_id   = bs.seat_id
JOIN screens  sc ON sc.screen_id = se.screen_id
WHERE bs.is_active = 1
GROUP BY sc.screen_type, se.seat_type
ORDER BY sc.screen_type, revenue DESC;

-- 6. Lead time — how far ahead customers book
SELECT
    CASE
        WHEN TIMESTAMPDIFF(HOUR, b.booking_time, s.show_time) < 2   THEN 'Under 2 hours'
        WHEN TIMESTAMPDIFF(HOUR, b.booking_time, s.show_time) < 24  THEN 'Same day'
        WHEN TIMESTAMPDIFF(HOUR, b.booking_time, s.show_time) < 72  THEN '1-3 days'
        ELSE 'More than 3 days'
    END                                     AS lead_time_bucket,
    COUNT(*)                                AS bookings,
    ROUND(AVG(b.total_amount), 2)           AS avg_order_value
FROM bookings b
JOIN shows s ON s.show_id = b.show_id
WHERE b.status = 'Confirmed'
GROUP BY lead_time_bucket
ORDER BY bookings DESC;
