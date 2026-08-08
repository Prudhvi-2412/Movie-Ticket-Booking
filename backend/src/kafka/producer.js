const { publishEvent } = require('../config/kafka');
const logger = require('../utils/logger');

const TOPIC_BOOKING_EVENTS = 'booking-events';

const emitBookingCreated = async (bookingData) => {
  await publishEvent(TOPIC_BOOKING_EVENTS, {
    eventType: 'BookingCreated',
    data: bookingData
  });
};

const emitPaymentSuccessful = async (paymentData) => {
  await publishEvent(TOPIC_BOOKING_EVENTS, {
    eventType: 'PaymentSuccessful',
    data: paymentData
  });
};

const emitBookingConfirmed = async (confirmationData) => {
  await publishEvent(TOPIC_BOOKING_EVENTS, {
    eventType: 'BookingConfirmed',
    data: confirmationData
  });
};

const emitBookingCancelled = async (cancelData) => {
  await publishEvent(TOPIC_BOOKING_EVENTS, {
    eventType: 'BookingCancelled',
    data: cancelData
  });
};

const emitSeatReleased = async (releaseData) => {
  await publishEvent(TOPIC_BOOKING_EVENTS, {
    eventType: 'SeatReleased',
    data: releaseData
  });
};

module.exports = {
  TOPIC_BOOKING_EVENTS,
  emitBookingCreated,
  emitPaymentSuccessful,
  emitBookingConfirmed,
  emitBookingCancelled,
  emitSeatReleased
};
