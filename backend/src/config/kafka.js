const { Kafka, Partitioners } = require('kafkajs');
const config = require('./env');
const logger = require('../utils/logger');

const TOPIC = 'booking-events';
const DEAD_LETTER_TOPIC = 'booking-events-dead-letter';
const kafka = new Kafka({
  clientId: config.KAFKA_CLIENT_ID,
  brokers: config.KAFKA_BROKERS,
  retry: { initialRetryTime: 300, retries: 3 }
});
const producer = kafka.producer({ createPartitioner: Partitioners.DefaultPartitioner });
const consumers = [];
let producerConnected = false;

const connectProducer = async () => {
  if (producerConnected) return;
  await producer.connect();
  producerConnected = true;
};

// Only the outbox dispatcher calls this for business events. Broker errors
// propagate, leaving the durable row available for a later attempt.
const sendEvent = async (event) => {
  await connectProducer();
  await producer.send({
    topic: TOPIC,
    messages: [{ key: String(event.data.bookingId), value: JSON.stringify(event) }]
  });
};

const ensureTopics = async () => {
  const admin = kafka.admin();
  await admin.connect();
  try {
    await admin.createTopics({
      topics: [TOPIC, DEAD_LETTER_TOPIC].map((topic) => ({
        topic, numPartitions: 1, replicationFactor: 1
      })),
      waitForLeaders: true
    });
  } finally {
    await admin.disconnect();
  }
};

const startKafkaConsumer = async (groupId, handler, onFatal) => {
  const consumer = kafka.consumer({ groupId });
  consumer.on(consumer.events.CRASH, ({ payload }) => {
    if (!payload.restart) {
      logger.error('Kafka consumer %s stopped without restart: %s', groupId, payload.error.message);
      onFatal?.(payload.error);
    }
  });
  await consumer.connect();
  try {
    await consumer.subscribe({ topic: TOPIC, fromBeginning: true });
    await consumer.run({
      eachMessage: async ({ message }) => {
        const raw = message.value?.toString('utf8') || '';
        let event;
        for (let attempt = 1; attempt <= 3; attempt += 1) {
          try {
            event = JSON.parse(raw);
            if (!event.eventId || !event.eventType || !event.data) {
              throw new Error('Invalid booking event envelope');
            }
            await handler(event);
            return;
          } catch (err) {
            logger.error('Kafka %s attempt %d failed: %s', groupId, attempt, err.message);
            if (attempt < 3) {
              await new Promise((resolve) => setTimeout(resolve, 200 * (2 ** (attempt - 1))));
              continue;
            }
            // A failed DLQ send throws, so Kafka retains the source offset.
            await connectProducer();
            await producer.send({
              topic: DEAD_LETTER_TOPIC,
              messages: [{ key: event?.eventId || groupId, value: JSON.stringify({
                consumerGroup: groupId, original: raw, error: err.message,
                failedAt: new Date().toISOString()
              }) }]
            });
            logger.error('Kafka %s moved event %s to dead-letter topic', groupId, event?.eventId);
          }
        }
      }
    });
    consumers.push(consumer);
    logger.info('Kafka consumer %s subscribed to %s', groupId, TOPIC);
  } catch (err) {
    await consumer.disconnect();
    throw err;
  }
};

const shutdownKafka = async () => {
  await Promise.allSettled(consumers.splice(0).map((consumer) => consumer.disconnect()));
  if (producerConnected) await producer.disconnect();
  producerConnected = false;
};

module.exports = { TOPIC, DEAD_LETTER_TOPIC, connectProducer, sendEvent,
  ensureTopics, startKafkaConsumer, shutdownKafka };
