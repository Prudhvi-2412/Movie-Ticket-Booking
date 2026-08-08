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

  logger.info(' Publishing Event [%s] -> %s: %j', topic, event.eventType, payload);

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

module.exports = {
  kafka,
  initKafkaProducer,
  publishEvent,
  subscribeEvent: (topic, handler) => {
    localBus.on(topic, handler);
  },
  isKafkaConnected: () => isKafkaConnected
};
