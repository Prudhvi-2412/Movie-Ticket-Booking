const db = require('../config/db');
const gateway = require('./paymentGateway');
const logger = require('../utils/logger');

const applyRefundOutcome = async ({ paymentId, refundId, amount, status }) => {
  const completed = status === 'processed';
  const failed = status === 'failed';
  if (!completed && !failed) return false;

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [[payment]] = await connection.query(
      `SELECT payment_id, booking_id, amount, refund_status, refund_id
         FROM payments WHERE transaction_id = ? FOR UPDATE`, [paymentId]
    );
    if (!payment || payment.refund_status !== 'Processing'
        || (payment.refund_id && payment.refund_id !== refundId)
        || Number(payment.amount) !== Number(amount)) {
      await connection.rollback();
      return false;
    }

    await connection.query(
      `UPDATE payments SET refund_status = ?, refund_id = ?,
              payment_status = IF(? = 'Completed', 'Refunded', payment_status),
              refund_error = IF(? = 'Failed', 'Gateway reported refund failure', NULL),
              refund_completed_at = IF(? = 'Completed', NOW(), NULL)
        WHERE payment_id = ?`,
      [completed ? 'Completed' : 'Failed', refundId, completed ? 'Completed' : 'Failed',
        completed ? 'Completed' : 'Failed', completed ? 'Completed' : 'Failed', payment.payment_id]
    );
    if (completed) {
      await connection.query(
        "UPDATE bookings SET status = 'Refunded' WHERE booking_id = ? AND status = 'Cancelled'",
        [payment.booking_id]
      );
    }
    await connection.commit();
    return true;
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
};

const startRefund = async (bookingId, bookingRef) => {
  const claim = await db.query(
    `UPDATE payments SET refund_status = 'Processing', refund_requested_at = NOW()
      WHERE booking_id = ? AND payment_status = 'Success' AND refund_status = 'Pending'`,
    [bookingId]
  );
  if (claim.affectedRows === 0) return null;

  const [payment] = await db.query(
    `SELECT transaction_id, amount FROM payments
      WHERE booking_id = ? AND refund_status = 'Processing' AND payment_status = 'Success'`,
    [bookingId]
  );
  let refund;
  try {
    refund = await gateway.refundPayment(payment.transaction_id, payment.amount, bookingRef);
  } catch (err) {
    logger.error('Refund request failed for booking %s: %s', bookingId, err.message);
    await db.query(
      `UPDATE payments SET refund_status = 'Failed', refund_error = ?
        WHERE booking_id = ? AND refund_status = 'Processing' AND refund_id IS NULL`,
      [String(err.message).slice(0, 500), bookingId]
    );
    return null;
  }

  // A database error after gateway acceptance leaves an uncertain outcome.
  // Keep it Processing for reconciliation; a signed webhook can still finish it.
  await db.query(
    'UPDATE payments SET refund_id = ? WHERE booking_id = ? AND refund_status = ?',
    [refund.id, bookingId, 'Processing']
  );
  if (['processed', 'failed'].includes(refund.status)) {
    await applyRefundOutcome({
      paymentId: payment.transaction_id,
      refundId: refund.id,
      amount: gateway.toRupees(refund.amount),
      status: refund.status
    });
  }
  return refund;
};

module.exports = { startRefund, applyRefundOutcome };
