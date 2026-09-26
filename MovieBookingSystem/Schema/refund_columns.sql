USE MovieBookingDB;

DROP PROCEDURE IF EXISTS AddRefundColumns;
DELIMITER //
CREATE PROCEDURE AddRefundColumns()
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'payments' AND column_name = 'refund_status') THEN
        ALTER TABLE payments ADD COLUMN refund_status ENUM('Pending', 'Processing', 'Completed', 'Failed') NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'payments' AND column_name = 'refund_id') THEN
        ALTER TABLE payments ADD COLUMN refund_id VARCHAR(100) NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'payments' AND column_name = 'refund_error') THEN
        ALTER TABLE payments ADD COLUMN refund_error VARCHAR(500) NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'payments' AND column_name = 'refund_requested_at') THEN
        ALTER TABLE payments ADD COLUMN refund_requested_at DATETIME NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'payments' AND column_name = 'refund_completed_at') THEN
        ALTER TABLE payments ADD COLUMN refund_completed_at DATETIME NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'payments' AND index_name = 'uq_payments_refund') THEN
        ALTER TABLE payments ADD UNIQUE KEY uq_payments_refund (refund_id);
    END IF;
END //
DELIMITER ;
CALL AddRefundColumns();
DROP PROCEDURE AddRefundColumns;
