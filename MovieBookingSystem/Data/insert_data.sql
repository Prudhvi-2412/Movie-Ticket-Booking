USE MovieBookingDB;

-- Insert Users
INSERT INTO users (full_name, email, phone, password_hash) VALUES
('John Doe', 'john@example.com', '1234567890', 'hash123'),
('Jane Smith', 'jane@example.com', '0987654321', 'hash456'),
('Alice Brown', 'alice@example.com', '1122334455', 'hash789');

-- Insert Movies
INSERT INTO movies (title, genre, language, duration_minutes, rating, release_date) VALUES
('Inception', 'Sci-Fi', 'English', 148, 8.8, '2010-07-16'),
('The Dark Knight', 'Action', 'English', 152, 9.0, '2008-07-18'),
('Parasite', 'Thriller', 'Korean', 132, 8.6, '2019-05-30');

-- Insert Theaters
INSERT INTO theaters (name, location, city) VALUES
('PVR Cinemas', 'MG Road', 'Bangalore'),
('INOX', 'Mall of India', 'Noida'),
('Cinepolis', 'Andheri West', 'Mumbai');

-- Insert Screens
INSERT INTO screens (theater_id, screen_number, total_seats) VALUES
(1, 1, 100),
(1, 2, 80),
(2, 1, 120),
(3, 1, 150);

-- Insert Seats for Screen 1 (Simplified for demo)
-- Row A
INSERT INTO seats (screen_id, seat_row, seat_number, seat_type) VALUES
(1, 'A', 1, 'Platinum'), (1, 'A', 2, 'Platinum'),
(1, 'B', 1, 'Gold'), (1, 'B', 2, 'Gold'),
(1, 'C', 1, 'Silver'), (1, 'C', 2, 'Silver');

-- Insert Shows
INSERT INTO shows (movie_id, screen_id, show_time, price) VALUES
(1, 1, '2026-05-20 18:00:00', 350.00),
(1, 1, '2026-05-20 21:00:00', 400.00),
(2, 2, '2026-05-20 19:30:00', 300.00);

-- Sample Bookings (to be processed via procedures usually)
INSERT INTO bookings (user_id, show_id, total_amount, status) VALUES
(1, 1, 700.00, 'Confirmed');

INSERT INTO booking_seats (booking_id, seat_id) VALUES
(1, 1), (1, 2);

INSERT INTO payments (booking_id, payment_method, transaction_id, amount, payment_status) VALUES
(1, 'UPI', 'TXN001992', 700.00, 'Success');
