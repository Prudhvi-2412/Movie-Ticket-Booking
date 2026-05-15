USE MovieBookingDB;

-- 1. Rank Movies by Revenue within each Genre using Window Functions
-- This shows your ability to perform complex data partitioning
SELECT 
    genre,
    title,
    total_revenue,
    RANK() OVER (PARTITION BY genre ORDER BY total_revenue DESC) as genre_rank
FROM (
    SELECT m.genre, m.title, SUM(p.amount) as total_revenue
    FROM movies m
    JOIN shows s ON m.movie_id = s.movie_id
    JOIN bookings b ON s.show_id = b.show_id
    JOIN payments p ON b.booking_id = p.booking_id
    WHERE b.status = 'Confirmed'
    GROUP BY m.movie_id, m.genre, m.title
) AS genre_sales;

-- 2. Running Total of Daily Revenue
-- Useful for tracking financial growth trends
SELECT 
    booking_date,
    daily_revenue,
    SUM(daily_revenue) OVER (ORDER BY booking_date) as running_total_revenue
FROM (
    SELECT DATE(booking_time) as booking_date, SUM(total_amount) as daily_revenue
    FROM bookings
    WHERE status = 'Confirmed'
    GROUP BY DATE(booking_time)
) AS daily_sales;

-- 3. Find "Loyal" Users (Users who spend more than the average user)
-- Uses Subqueries and CTEs
WITH UserSpending AS (
    SELECT user_id, SUM(total_amount) as total_spent
    FROM bookings
    WHERE status = 'Confirmed'
    GROUP BY user_id
)
SELECT u.full_name, us.total_spent
FROM UserSpending us
JOIN users u ON us.user_id = u.user_id
WHERE us.total_spent > (SELECT AVG(total_spent) FROM UserSpending);
