USE MovieBookingDB;

-- Insert Users
INSERT INTO users (full_name, email, phone_encrypted, password_hash, preferences, is_active, created_at) VALUES
( 'Aarav Sharma', 'aarav.sharma@example.com', AES_ENCRYPT('9876543210', 'my_secret_key'), 'hash_aarav_001', JSON_OBJECT('favoriteGenre', 'Action', 'language', 'Hindi'), TRUE, '2026-05-01 09:15:00'),
( 'Ananya Iyer', 'ananya.iyer@example.com', AES_ENCRYPT('9123456780', 'my_secret_key'), 'hash_ananya_002', JSON_OBJECT('favoriteGenre', 'Drama', 'language', 'Tamil'), TRUE, '2026-05-01 09:20:00'),
( 'Vivaan Patel', 'vivaan.patel@example.com', AES_ENCRYPT('9988776655', 'my_secret_key'), 'hash_vivaan_003', JSON_OBJECT('favoriteGenre', 'Thriller', 'language', 'Gujarati'), TRUE, '2026-05-01 09:25:00'),
( 'Diya Kapoor', 'diya.kapoor@example.com', AES_ENCRYPT('9012345678', 'my_secret_key'), 'hash_diya_004', JSON_OBJECT('favoriteGenre', 'Romance', 'language', 'Hindi'), TRUE, '2026-05-01 09:30:00'),
( 'Arjun Nair', 'arjun.nair@example.com', AES_ENCRYPT('9345678901', 'my_secret_key'), 'hash_arjun_005', JSON_OBJECT('favoriteGenre', 'Comedy', 'language', 'Malayalam'), TRUE, '2026-05-01 09:35:00'),
( 'Isha Mehta', 'isha.mehta@example.com', AES_ENCRYPT('9456789012', 'my_secret_key'), 'hash_isha_006', JSON_OBJECT('favoriteGenre', 'Adventure', 'language', 'English'), TRUE, '2026-05-01 09:40:00'),
( 'Karan Singh', 'karan.singh@example.com', AES_ENCRYPT('9567890123', 'my_secret_key'), 'hash_karan_007', JSON_OBJECT('favoriteGenre', 'Action', 'language', 'Punjabi'), TRUE, '2026-05-01 09:45:00'),
( 'Meera Reddy', 'meera.reddy@example.com', AES_ENCRYPT('9678901234', 'my_secret_key'), 'hash_meera_008', JSON_OBJECT('favoriteGenre', 'Family', 'language', 'Telugu'), TRUE, '2026-05-01 09:50:00'),
( 'Rohan Gupta', 'rohan.gupta@example.com', AES_ENCRYPT('9789012345', 'my_secret_key'), 'hash_rohan_009', JSON_OBJECT('favoriteGenre', 'Sci-Fi', 'language', 'Hindi'), TRUE, '2026-05-01 09:55:00'),
( 'Saanvi Joshi', 'saanvi.joshi@example.com', AES_ENCRYPT('9890123456', 'my_secret_key'), 'hash_saanvi_010', JSON_OBJECT('favoriteGenre', 'Mystery', 'language', 'Marathi'), TRUE, '2026-05-01 10:00:00');

-- Insert Movies
INSERT INTO movies (title, description, genre, language, duration_minutes, release_date, rating, is_active) VALUES
('Pathaan', 'An undercover mission pushes a spy to the edge.', 'Action', 'Hindi', 146, '2023-01-25', 7.2, TRUE),
('RRR', 'Two revolutionary friends fight against oppression.', 'Action', 'Telugu', 187, '2022-03-25', 8.9, TRUE),
('Drishyam 2', 'A gripping family drama built around a hidden secret.', 'Thriller', 'Hindi', 140, '2022-11-18', 8.4, TRUE),
('Jawan', 'A father-son story centered on justice and revenge.', 'Action', 'Hindi', 169, '2023-09-07', 7.8, TRUE),
('Kantara', 'A folklore-driven tale rooted in land and tradition.', 'Drama', 'Kannada', 150, '2022-09-30', 8.6, TRUE),
('12th Fail', 'A real-life inspired story of resilience and ambition.', 'Drama', 'Hindi', 146, '2023-10-27', 8.7, TRUE),
('Leo', 'A family man is forced into a violent past.', 'Action', 'Tamil', 164, '2023-10-19', 7.0, TRUE),
('Sita Ramam', 'A timeless love story set against a military backdrop.', 'Romance', 'Telugu', 163, '2022-08-05', 8.5, TRUE),
('Rocketry', 'The life and struggles of a pioneering scientist.', 'Biography', 'Hindi', 154, '2022-07-01', 8.3, TRUE),
('Ghoomer', 'A cricketer finds a new way to compete after tragedy.', 'Sports', 'Hindi', 135, '2023-08-18', 7.4, TRUE);

-- Insert Theaters
INSERT INTO theaters (name, location, city) VALUES
('PVR Phoenix', 'Lower Parel', 'Mumbai'),
('INOX Megaplex', 'MG Road', 'Bengaluru'),
('Cinepolis Fun Republic', 'Andheri West', 'Mumbai'),
('Miraj Cinemas', 'Sector 18', 'Noida');

-- Insert Screens
INSERT INTO screens (theater_id, screen_number, total_seats) VALUES
(1, 1, 120),
(1, 2, 96),
(2, 1, 140),
(3, 1, 150),
(4, 1, 110),
(4, 2, 90);

-- Insert Seats for demo screens
INSERT INTO seats (screen_id, seat_row, seat_number, seat_type) VALUES
(1, 'A', 1, 'Platinum'), (1, 'A', 2, 'Platinum'), (1, 'A', 3, 'Platinum'),
(1, 'B', 1, 'Gold'), (1, 'B', 2, 'Gold'), (1, 'B', 3, 'Gold'),
(2, 'C', 1, 'Silver'), (2, 'C', 2, 'Silver'), (2, 'C', 3, 'Silver'),
(3, 'D', 1, 'Platinum'), (3, 'D', 2, 'Platinum'), (3, 'E', 1, 'Gold');

-- Insert Shows
INSERT INTO shows (movie_id, screen_id, show_time, price) VALUES
(1, 1, '2026-05-20 18:00:00', 350.00),
(2, 1, '2026-05-20 21:00:00', 450.00),
(3, 2, '2026-05-20 19:30:00', 320.00),
(4, 3, '2026-05-21 17:45:00', 400.00),
(5, 4, '2026-05-21 20:15:00', 280.00);

-- Sample Bookings (to be processed via procedures usually)
INSERT INTO bookings (user_id, show_id, total_amount, status) VALUES
(1, 1, 700.00, 'Confirmed'),
(2, 3, 640.00, 'Confirmed'),
(3, 4, 800.00, 'Pending');

INSERT INTO booking_seats (booking_id, seat_id) VALUES
(1, 1), (1, 2),
(2, 7), (2, 8),
(3, 10), (3, 11);

INSERT INTO payments (booking_id, payment_method, transaction_id, amount, payment_status) VALUES
(1, 'UPI', 'TXN001992', 700.00, 'Success'),
(2, 'Credit Card', 'TXN001993', 640.00, 'Success'),
(3, 'Net Banking', 'TXN001994', 800.00, 'Failed');
