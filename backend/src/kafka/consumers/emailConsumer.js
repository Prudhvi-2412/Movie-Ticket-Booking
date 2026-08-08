const { subscribeEvent } = require('../../config/kafka');
const logger = require('../../utils/logger');

const initEmailConsumer = () => {
  subscribeEvent('booking-events', (event) => {
    const { eventType, data } = event;

    if (eventType === 'BookingConfirmed') {
      logger.info('📧 [Email Service] Dispatched digital PDF movie ticket & tax invoice to User ID %s for Booking #%s (Amount: ₹%s)', data.userId, data.bookingId, data.totalAmount);
    }
  });

  logger.info('Email Consumer initialized.');
};

module.exports = { initEmailConsumer };
