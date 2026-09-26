USE MovieBookingDB;

-- Booking state and its event are committed together by the procedures.
CREATE TABLE IF NOT EXISTS outbox_events (
    outbox_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    event_id CHAR(36) NOT NULL,
    event_type VARCHAR(50) NOT NULL,
    aggregate_id INT NOT NULL,
    payload JSON NOT NULL,
    status ENUM('Pending', 'Publishing', 'Published') NOT NULL DEFAULT 'Pending',
    attempts INT NOT NULL DEFAULT 0,
    available_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    claimed_at DATETIME NULL,
    published_at DATETIME NULL,
    last_error VARCHAR(500) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_outbox_event (event_id),
    KEY idx_outbox_ready (status, available_at, claimed_at)
) ENGINE=InnoDB;

-- The unique key makes consumer effects safe across Kafka redelivery and restarts.
CREATE TABLE IF NOT EXISTS consumed_events (
    consumer_group VARCHAR(100) NOT NULL,
    event_id CHAR(36) NOT NULL,
    consumed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (consumer_group, event_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS notifications (
    notification_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    booking_id INT NULL,
    event_id CHAR(36) NOT NULL,
    title VARCHAR(120) NOT NULL,
    message VARCHAR(500) NOT NULL,
    is_read TINYINT(1) NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_notifications_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    CONSTRAINT fk_notifications_booking FOREIGN KEY (booking_id) REFERENCES bookings(booking_id) ON DELETE SET NULL,
    UNIQUE KEY uq_notifications_event (event_id),
    KEY idx_notifications_user (user_id, created_at)
) ENGINE=InnoDB;
