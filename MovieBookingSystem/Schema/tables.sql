-- Create Database
CREATE DATABASE IF NOT EXISTS MovieBookingDB;
USE MovieBookingDB;

-- 1. Users Table
CREATE TABLE users (
    user_id INT AUTO_INCREMENT PRIMARY KEY,
    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    -- Encrypted phone stored as VARBINARY for security
    phone_encrypted VARBINARY(255) NOT NULL, 
    password_hash VARCHAR(255) NOT NULL,
    preferences JSON,
    is_active BOOLEAN DEFAULT TRUE, -- Soft Delete flag
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
    is_active BOOLEAN DEFAULT TRUE, -- Soft Delete flag
    -- Full-Text Index for optimized searching
    FULLTEXT(title, description) 
);

-- 3. Theaters Table
CREATE TABLE theaters (
    theater_id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    location VARCHAR(255) NOT NULL,
    city VARCHAR(100) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE -- Soft Delete flag
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
-- In MySQL, partitioning column must be part of the Primary Key
CREATE TABLE bookings (
    booking_id INT NOT NULL AUTO_INCREMENT,
    user_id INT NOT NULL,
    show_id INT NOT NULL,
    total_amount DECIMAL(10,2) NOT NULL,
    status ENUM('Pending', 'Confirmed', 'Cancelled') DEFAULT 'Pending',
    booking_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (booking_id, booking_time), -- Required for partitioning
    INDEX (user_id),
    INDEX (show_id)
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
    -- Note: When referencing partitioned tables, FKs have specific limitations 
    -- usually handled at application layer or through indexing
    PRIMARY KEY (booking_id, seat_id)
);

-- 9. Payments Table
CREATE TABLE payments (
    payment_id INT AUTO_INCREMENT PRIMARY KEY,
    booking_id INT NOT NULL,
    payment_method ENUM('Credit Card', 'Debit Card', 'UPI', 'Net Banking') NOT NULL,
    transaction_id VARCHAR(100) UNIQUE NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    payment_status ENUM('Success', 'Failed', 'Refunded') DEFAULT 'Success',
    payment_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for Optimization
CREATE INDEX idx_show_time ON shows(show_time);
CREATE INDEX idx_movie_id ON shows(movie_id);
