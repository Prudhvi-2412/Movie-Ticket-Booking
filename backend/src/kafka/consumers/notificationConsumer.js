const { subscribeEvent } = require('../../config/kafka');
const logger = require('../../utils/logger');

const initNotificationConsumer = () => {
  subscribeEvent('booking-events', (event) => {
    const { eventType, data } = event;

    if (eventType === 'BookingConfirmed') {
      logger.info(' [Notification Service] Sending instant SMS & App Push notification for Booking #%s to User ID %s', data.bookingId, data.userId);
    } else if (eventType === 'BookingCancelled') {
      logger.info(' [Notification Service] Sending cancellation & refund notification for Booking #%s to User ID %s', data.bookingId, data.userId);
    }
  });

  logger.info('Notification Consumer initialized.');
};

module.exports = { initNotificationConsumer };
