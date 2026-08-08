-- Master Initialization Script for MovieTicketBooking Platform
-- Combines Schema, Enhancements, Triggers, Procedures, Views, and Seed Data

CREATE DATABASE IF NOT EXISTS MovieBookingDB;
USE MovieBookingDB;

-- Disable Foreign Key checks for clean setup
SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS audit_logs;
DROP TABLE IF EXISTS webhook_logs;
DROP TABLE IF EXISTS seat_booking_logs;
DROP TABLE IF EXISTS booking_logs;
DROP TABLE IF EXISTS payments;
DROP TABLE IF EXISTS booking_seats;
DROP TABLE IF EXISTS bookings;
DROP TABLE IF EXISTS seats;
DROP TABLE IF EXISTS shows;
DROP TABLE IF EXISTS screens;
DROP TABLE IF EXISTS theaters;
DROP TABLE IF EXISTS movies;
DROP TABLE IF EXISTS users;

SET FOREIGN_KEY_CHECKS = 1;

-- 1. Users Table
CREATE TABLE users (
    user_id INT AUTO_INCREMENT PRIMARY KEY,
    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    phone_encrypted VARBINARY(255) NULL, 
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('Customer', 'Admin') DEFAULT 'Customer',
    refresh_token TEXT NULL,
    preferences JSON,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Movies Table
CREATE TABLE movies (
    movie_id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    genre VARCHAR(50),
    language VARCHAR(50),
    duration_minutes INT NOT NULL,
    release_date DATE,
    rating DECIMAL(3,1) CHECK (rating >= 0 AND rating <= 10),
    poster_url VARCHAR(500) NULL,
    banner_url VARCHAR(500) NULL,
    director VARCHAR(100) NULL,
    cast TEXT NULL,
    trailer_url VARCHAR(500) NULL,
    is_active BOOLEAN DEFAULT TRUE,
    FULLTEXT(title, description) 
);

-- 3. Theaters Table
CREATE TABLE theaters (
    theater_id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    location VARCHAR(255) NOT NULL,
    city VARCHAR(100) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE
);

-- 4. Screens Table
CREATE TABLE screens (
    screen_id INT AUTO_INCREMENT PRIMARY KEY,
    theater_id INT NOT NULL,
    screen_number INT NOT NULL,
    total_seats INT NOT NULL,
    FOREIGN KEY (theater_id) REFERENCES theaters(theater_id) ON DELETE CASCADE,
    UNIQUE(theater_id, screen_number)
);

-- 5. Shows Table
CREATE TABLE shows (
    show_id INT AUTO_INCREMENT PRIMARY KEY,
    movie_id INT NOT NULL,
    screen_id INT NOT NULL,
    show_time DATETIME NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    FOREIGN KEY (movie_id) REFERENCES movies(movie_id) ON DELETE CASCADE,
    FOREIGN KEY (screen_id) REFERENCES screens(screen_id) ON DELETE CASCADE
);

-- 6. Seats Table
CREATE TABLE seats (
    seat_id INT AUTO_INCREMENT PRIMARY KEY,
    screen_id INT NOT NULL,
    seat_row CHAR(1) NOT NULL,
    seat_number INT NOT NULL,
    seat_type ENUM('Silver', 'Gold', 'Platinum') DEFAULT 'Silver',
    FOREIGN KEY (screen_id) REFERENCES screens(screen_id) ON DELETE CASCADE,
    UNIQUE(screen_id, seat_row, seat_number)
);

-- 7. Bookings Table (Partitioned)
CREATE TABLE bookings (
    booking_id INT NOT NULL AUTO_INCREMENT,
    user_id INT NOT NULL,
    show_id INT NOT NULL,
    total_amount DECIMAL(10,2) NOT NULL,
    status ENUM('Pending', 'PaymentSuccess', 'Confirmed', 'Cancelled', 'Refunded') DEFAULT 'Pending',
    booking_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (booking_id, booking_time),
    INDEX idx_user_id (user_id),
    INDEX idx_show_id (show_id),
    INDEX idx_status (status)
)
PARTITION BY RANGE (YEAR(booking_time)) (
    PARTITION p2024 VALUES LESS THAN (2025),
    PARTITION p2025 VALUES LESS THAN (2026),
    PARTITION p2026 VALUES LESS THAN (2027),
    PARTITION p_future VALUES LESS THAN MAXVALUE
);

-- 8. Booking_Seats Table
CREATE TABLE booking_seats (
    booking_id INT NOT NULL,
    seat_id INT NOT NULL,
    PRIMARY KEY (booking_id, seat_id)
);

-- 9. Payments Table
CREATE TABLE payments (
    payment_id INT AUTO_INCREMENT PRIMARY KEY,
    booking_id INT NOT NULL,
    payment_method ENUM('Credit Card', 'Debit Card', 'UPI', 'Net Banking') NOT NULL,
    transaction_id VARCHAR(100) UNIQUE NOT NULL,
    idempotency_key VARCHAR(100) UNIQUE NULL,
    gateway_order_id VARCHAR(100) NULL,
    signature VARCHAR(255) NULL,
    amount DECIMAL(10,2) NOT NULL,
    payment_status ENUM('Pending', 'Success', 'Failed', 'Refunded') DEFAULT 'Pending',
    payment_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 10. Webhook Logs
CREATE TABLE webhook_logs (
    log_id INT AUTO_INCREMENT PRIMARY KEY,
    event_id VARCHAR(100) UNIQUE NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    idempotency_key VARCHAR(100) NOT NULL,
    payload JSON NOT NULL,
    status VARCHAR(50) DEFAULT 'PROCESSED',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 11. Audit Logs
CREATE TABLE audit_logs (
    audit_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NULL,
    action VARCHAR(100) NOT NULL,
    entity VARCHAR(100) NOT NULL,
    entity_id VARCHAR(100) NULL,
    details JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 12. Booking Logs
CREATE TABLE booking_logs (
    log_id INT AUTO_INCREMENT PRIMARY KEY,
    booking_id INT,
    old_status VARCHAR(50),
    new_status VARCHAR(50),
    changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 13. Seat Booking Logs
CREATE TABLE seat_booking_logs (
    log_id INT AUTO_INCREMENT PRIMARY KEY,
    booking_id INT,
    seat_id INT,
    action_type ENUM('Booked', 'Released'),
    action_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Strategic Indexes
CREATE INDEX idx_show_time ON shows(show_time);
CREATE INDEX idx_movie_id ON shows(movie_id);
CREATE INDEX idx_screen_id ON shows(screen_id);
CREATE INDEX idx_theater_city ON theaters(city);

-- VIEWS --
CREATE OR REPLACE VIEW movie_revenue AS
SELECT 
    m.movie_id,
    m.title AS movie_title,
    COALESCE(SUM(p.amount), 0) AS total_revenue,
    COUNT(DISTINCT b.booking_id) AS total_bookings
FROM movies m
LEFT JOIN shows s ON m.movie_id = s.movie_id
LEFT JOIN bookings b ON s.show_id = b.show_id AND b.status IN ('Confirmed', 'PaymentSuccess')
LEFT JOIN payments p ON b.booking_id = p.booking_id AND p.payment_status = 'Success'
WHERE m.is_active = TRUE
GROUP BY m.movie_id, m.title;

CREATE OR REPLACE VIEW theater_occupancy AS
SELECT 
    s.show_id,
    t.name AS theater_name,
    m.title AS movie_title,
    s.show_time,
    sc.total_seats,
    (SELECT COUNT(*) FROM booking_seats bs 
     JOIN bookings b ON bs.booking_id = b.booking_id 
     WHERE b.show_id = s.show_id AND b.status IN ('Confirmed', 'PaymentSuccess')) AS seats_booked,
    ((SELECT COUNT(*) FROM booking_seats bs 
      JOIN bookings b ON bs.booking_id = b.booking_id 
      WHERE b.show_id = s.show_id AND b.status IN ('Confirmed', 'PaymentSuccess')) / GREATEST(sc.total_seats, 1)) * 100 AS occupancy_percentage
FROM shows s
JOIN movies m ON s.movie_id = m.movie_id
JOIN screens sc ON s.screen_id = sc.screen_id
JOIN theaters t ON sc.theater_id = t.theater_id
WHERE t.is_active = TRUE AND m.is_active = TRUE;

-- SEED DATA --
-- Admin & Customers
-- Default Admin password: Admin@123 -> bcrypt hash: $2b$10$wE8w5B3q01...
INSERT INTO users (full_name, email, password_hash, role, preferences) VALUES
('System Administrator', 'admin@moviebooking.com', '$2b$10$7Z8H1yV8a0oE.6eT7D.1EO.UaR3Z1nO5JtYV5m5x3/V8/sO2w6e.2', 'Admin', JSON_OBJECT('adminAccess', true)),
('Aarav Sharma', 'aarav.sharma@example.com', '$2b$10$7Z8H1yV8a0oE.6eT7D.1EO.UaR3Z1nO5JtYV5m5x3/V8/sO2w6e.2', 'Customer', JSON_OBJECT('favoriteGenre', 'Action')),
('Ananya Iyer', 'ananya.iyer@example.com', '$2b$10$7Z8H1yV8a0oE.6eT7D.1EO.UaR3Z1nO5JtYV5m5x3/V8/sO2w6e.2', 'Customer', JSON_OBJECT('favoriteGenre', 'Drama'));

-- Movies with HD Poster URLs
INSERT INTO movies (title, description, genre, language, duration_minutes, release_date, rating, poster_url, banner_url, director, cast, trailer_url) VALUES
('Dune: Part Two', 'Paul Atreides unites with Chani and the Fremen while seeking revenge against the conspirators who destroyed his family.', 'Sci-Fi', 'English', 166, '2024-03-01', 8.6, 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=600&auto=format&fit=crop&q=80', 'https://images.unsplash.com/photo-1440404653325-ab127d49abc1?w=1200&auto=format&fit=crop&q=80', 'Denis Villeneuve', 'Timothée Chalamet, Zendaya, Rebecca Ferguson', 'https://www.youtube.com/embed/Way9Dexny3w'),
('Oppenheimer', 'The story of American scientist J. Robert Oppenheimer and his role in the development of the atomic bomb.', 'Biography', 'English', 180, '2023-07-21', 8.9, 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=600&auto=format&fit=crop&q=80', 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=1200&auto=format&fit=crop&q=80', 'Christopher Nolan', 'Cillian Murphy, Emily Blunt, Matt Damon', 'https://www.youtube.com/embed/uYPbbksJxIg'),
('Jawan', 'A high-octane action thriller detailing the emotional journey of a man set out to rectify the wrongs in society.', 'Action', 'Hindi', 169, '2023-09-07', 7.8, 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=600&auto=format&fit=crop&q=80', 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=1200&auto=format&fit=crop&q=80', 'Atlee', 'Shah Rukh Khan, Nayanthara, Vijay Sethupathi', 'https://www.youtube.com/embed/COv52Qyctws'),
('Interstellar', 'When Earth becomes uninhabitable, a team of ex-pilots and scientists travel through a wormhole to find a new home.', 'Sci-Fi', 'English', 169, '2014-11-07', 8.7, 'https://images.unsplash.com/photo-1506703719100-a0f3a48c0f86?w=600&auto=format&fit=crop&q=80', 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=1200&auto=format&fit=crop&q=80', 'Christopher Nolan', 'Matthew McConaughey, Anne Hathaway, Jessica Chastain', 'https://www.youtube.com/embed/zSWdZVtXT7E');

-- Theaters
INSERT INTO theaters (name, location, city) VALUES
('PVR Directors Cut', 'Lower Parel', 'Mumbai'),
('INOX Luxe', 'MG Road', 'Bengaluru'),
('Cinepolis IMAX', 'Sector 18', 'Noida');

-- Screens
INSERT INTO screens (theater_id, screen_number, total_seats) VALUES
(1, 1, 60),
(1, 2, 40),
(2, 1, 60),
(3, 1, 60);

-- Populate Seats for Screen 1 (60 Seats: Row A to F, 1 to 10)
INSERT INTO seats (screen_id, seat_row, seat_number, seat_type) VALUES
(1, 'A', 1, 'Platinum'), (1, 'A', 2, 'Platinum'), (1, 'A', 3, 'Platinum'), (1, 'A', 4, 'Platinum'), (1, 'A', 5, 'Platinum'), (1, 'A', 6, 'Platinum'), (1, 'A', 7, 'Platinum'), (1, 'A', 8, 'Platinum'), (1, 'A', 9, 'Platinum'), (1, 'A', 10, 'Platinum'),
(1, 'B', 1, 'Gold'), (1, 'B', 2, 'Gold'), (1, 'B', 3, 'Gold'), (1, 'B', 4, 'Gold'), (1, 'B', 5, 'Gold'), (1, 'B', 6, 'Gold'), (1, 'B', 7, 'Gold'), (1, 'B', 8, 'Gold'), (1, 'B', 9, 'Gold'), (1, 'B', 10, 'Gold'),
(1, 'C', 1, 'Gold'), (1, 'C', 2, 'Gold'), (1, 'C', 3, 'Gold'), (1, 'C', 4, 'Gold'), (1, 'C', 5, 'Gold'), (1, 'C', 6, 'Gold'), (1, 'C', 7, 'Gold'), (1, 'C', 8, 'Gold'), (1, 'C', 9, 'Gold'), (1, 'C', 10, 'Gold'),
(1, 'D', 1, 'Silver'), (1, 'D', 2, 'Silver'), (1, 'D', 3, 'Silver'), (1, 'D', 4, 'Silver'), (1, 'D', 5, 'Silver'), (1, 'D', 6, 'Silver'), (1, 'D', 7, 'Silver'), (1, 'D', 8, 'Silver'), (1, 'D', 9, 'Silver'), (1, 'D', 10, 'Silver'),
(1, 'E', 1, 'Silver'), (1, 'E', 2, 'Silver'), (1, 'E', 3, 'Silver'), (1, 'E', 4, 'Silver'), (1, 'E', 5, 'Silver'), (1, 'E', 6, 'Silver'), (1, 'E', 7, 'Silver'), (1, 'E', 8, 'Silver'), (1, 'E', 9, 'Silver'), (1, 'E', 10, 'Silver'),
(1, 'F', 1, 'Silver'), (1, 'F', 2, 'Silver'), (1, 'F', 3, 'Silver'), (1, 'F', 4, 'Silver'), (1, 'F', 5, 'Silver'), (1, 'F', 6, 'Silver'), (1, 'F', 7, 'Silver'), (1, 'F', 8, 'Silver'), (1, 'F', 9, 'Silver'), (1, 'F', 10, 'Silver');

-- Duplicate seats for screen 2 & 3
INSERT INTO seats (screen_id, seat_row, seat_number, seat_type)
SELECT 2, seat_row, seat_number, seat_type FROM seats WHERE screen_id = 1;

INSERT INTO seats (screen_id, seat_row, seat_number, seat_type)
SELECT 3, seat_row, seat_number, seat_type FROM seats WHERE screen_id = 1;

-- Shows
INSERT INTO shows (movie_id, screen_id, show_time, price) VALUES
(1, 1, DATE_ADD(NOW(), INTERVAL 2 HOUR), 450.00),
(1, 2, DATE_ADD(NOW(), INTERVAL 5 HOUR), 400.00),
(2, 1, DATE_ADD(NOW(), INTERVAL 1 DAY), 500.00),
(3, 3, DATE_ADD(NOW(), INTERVAL 3 HOUR), 350.00),
(4, 1, DATE_ADD(NOW(), INTERVAL 2 DAY), 480.00);

-- Initial Booking sample
INSERT INTO bookings (booking_id, user_id, show_id, total_amount, status, booking_time) VALUES
(1, 2, 1, 900.00, 'Confirmed', NOW());

INSERT INTO booking_seats (booking_id, seat_id) VALUES
(1, 1), (1, 2);

INSERT INTO payments (booking_id, payment_method, transaction_id, idempotency_key, amount, payment_status) VALUES
(1, 'UPI', 'TXN_INIT_99102', 'IDEM_INIT_99102', 900.00, 'Success');
