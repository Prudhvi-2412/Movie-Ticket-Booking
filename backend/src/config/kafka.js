const { Kafka, Partitioners } = require('kafkajs');
const EventEmitter = require('events');
const config = require('./env');
const logger = require('../utils/logger');

const localBus = new EventEmitter();
let kafkaProducer = null;
let isKafkaConnected = false;

const kafka = new Kafka({
  clientId: config.KAFKA_CLIENT_ID,
  brokers: config.KAFKA_BROKERS,
  retry: {
    initialRetryTime: 300,
    retries: 3
  }
});

const producer = kafka.producer({
  createPartitioner: Partitioners.DefaultPartitioner
});

const initKafkaProducer = async () => {
  try {
    await producer.connect();
    isKafkaConnected = true;
    kafkaProducer = producer;
    logger.info('Kafka Producer connected to brokers: %s', config.KAFKA_BROKERS.join(', '));
  } catch (error) {
    logger.warn('Kafka connection unavailable (%s). Falling back to in-memory event bus.', error.message);
    isKafkaConnected = false;
  }
};

const publishEvent = async (topic, event) => {
  const payload = {
    eventId: event.eventId || `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    eventType: event.eventType,
    timestamp: new Date().toISOString(),
    data: event.data
  };

  // Log the envelope, not the body: event data carries user ids and amounts,
  // and %j of the whole payload put that in every log line.
  logger.info('Event published [%s] %s (%s)', topic, payload.eventType, payload.eventId);
  logger.debug('Event payload %s: %j', payload.eventId, payload.data);

  // Always emit on local bus for consumers
  localBus.emit(topic, payload);
  localBus.emit('all_events', { topic, payload });

  if (isKafkaConnected && kafkaProducer) {
    try {
      await kafkaProducer.send({
        topic,
        messages: [{ value: JSON.stringify(payload) }]
      });
    } catch (err) {
      logger.error('Failed to send event to Kafka topic %s: %s', topic, err.message);
    }
  }
};

const shutdownKafka = async () => {
  if (isKafkaConnected && kafkaProducer) {
    try {
      await kafkaProducer.disconnect();
      logger.info('Kafka producer disconnected.');
    } catch (err) {
      logger.warn('Error disconnecting Kafka producer: %s', err.message);
    }
  }
  isKafkaConnected = false;
  localBus.removeAllListeners();
};

module.exports = {
  kafka,
  initKafkaProducer,
  publishEvent,
  subscribeEvent: (topic, handler) => {
    localBus.on(topic, handler);
  },
  isKafkaConnected: () => isKafkaConnected,
  shutdownKafka
};
