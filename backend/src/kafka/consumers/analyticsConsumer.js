const { subscribeEvent } = require('../../config/kafka');
const db = require('../../config/db');
const logger = require('../../utils/logger');

const initAnalyticsConsumer = () => {
  subscribeEvent('booking-events', async (event) => {
    const { eventType, data } = event;

    if (eventType === 'BookingConfirmed' || eventType === 'PaymentSuccessful') {
      logger.info('📊 [Analytics Service] Recording booking metric & evaluating occupancy for Show ID %s', data.showId);
      
      // Trigger Dynamic Pricing Stored Procedure in MySQL if show occupancy > 80%
      if (data.showId) {
        try {
          await db.query('CALL UpdateDynamicPrice(?)', [data.showId]);
          logger.info('📊 [Analytics Service] Executed UpdateDynamicPrice procedure for Show ID %s', data.showId);
        } catch (err) {
          logger.error('Error in Analytics Consumer dynamic pricing check: %s', err.message);
        }
      }
    }
  });

  logger.info('Analytics Consumer initialized.');
};

module.exports = { initAnalyticsConsumer };
