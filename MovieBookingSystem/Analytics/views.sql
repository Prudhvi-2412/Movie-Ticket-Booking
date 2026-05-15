USE MovieBookingDB;

-- 1. View for Revenue by Movie (Excluding inactive movies)
CREATE OR REPLACE VIEW movie_revenue AS
SELECT 
    m.title AS movie_title,
    SUM(p.amount) AS total_revenue,
    COUNT(b.booking_id) AS total_bookings
FROM movies m
JOIN shows s ON m.movie_id = s.movie_id
JOIN bookings b ON s.show_id = b.show_id
JOIN payments p ON b.booking_id = p.booking_id
WHERE b.status = 'Confirmed' 
  AND p.payment_status = 'Success'
  AND m.is_active = TRUE -- Soft Delete Filter
GROUP BY m.movie_id;

-- 2. View for Theater Occupancy (Excluding inactive theaters)
CREATE OR REPLACE VIEW theater_occupancy AS
SELECT 
    t.name AS theater_name,
    m.title AS movie_title,
    s.show_time,
    sc.total_seats,
    (SELECT COUNT(*) FROM booking_seats bs 
     JOIN bookings b ON bs.booking_id = b.booking_id 
     WHERE b.show_id = s.show_id AND b.status = 'Confirmed') AS seats_booked,
    ((SELECT COUNT(*) FROM booking_seats bs 
      JOIN bookings b ON bs.booking_id = b.booking_id 
      WHERE b.show_id = s.show_id AND b.status = 'Confirmed') / sc.total_seats) * 100 AS occupancy_percentage
FROM shows s
JOIN movies m ON s.movie_id = m.movie_id
JOIN screens sc ON s.screen_id = sc.screen_id
JOIN theaters t ON sc.theater_id = t.theater_id
WHERE t.is_active = TRUE -- Soft Delete Filter
  AND m.is_active = TRUE;

-- 3. View for User Booking Summary (Decrypting data for authorized view)
-- Note: In real apps, decryption key would be a secure variable
CREATE OR REPLACE VIEW user_booking_history AS
SELECT 
    u.full_name,
    -- Decrypting the phone for the view (using a dummy key 'my_secret_key')
    CAST(AES_DECRYPT(u.phone_encrypted, 'my_secret_key') AS CHAR) AS phone,
    m.title AS movie_title,
    s.show_time,
    b.total_amount,
    b.status
FROM users u
JOIN bookings b ON u.user_id = b.user_id
JOIN shows s ON b.show_id = s.show_id
JOIN movies m ON s.movie_id = m.movie_id
WHERE u.is_active = TRUE; -- Soft Delete Filter
