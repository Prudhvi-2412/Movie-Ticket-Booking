USE MovieBookingDB;

-- 1. Daily Booking Statistics
SELECT 
    DATE(booking_time) AS booking_date,
    COUNT(*) AS total_bookings,
    SUM(total_amount) AS daily_revenue
FROM bookings
WHERE status = 'Confirmed'
GROUP BY DATE(booking_time)
ORDER BY booking_date DESC;

-- 2. Top Revenue Generating Movie
SELECT * FROM movie_revenue ORDER BY total_revenue DESC LIMIT 1;

-- 3. Most Active Users (by number of bookings)
SELECT 
    u.full_name,
    COUNT(b.booking_id) AS booking_count
FROM users u
JOIN bookings b ON u.user_id = b.user_id
GROUP BY u.user_id
ORDER BY booking_count DESC;

-- 4. Revenue Grouped by Theater
SELECT 
    t.name AS theater_name,
    SUM(p.amount) AS total_revenue
FROM theaters t
JOIN screens sc ON t.theater_id = sc.theater_id
JOIN shows s ON sc.screen_id = s.screen_id
JOIN bookings b ON s.show_id = b.show_id
JOIN payments p ON b.booking_id = p.booking_id
WHERE b.status = 'Confirmed'
GROUP BY t.theater_id;

-- 5. Theater occupancy details
SELECT * FROM theater_occupancy WHERE occupancy_percentage > 50;
