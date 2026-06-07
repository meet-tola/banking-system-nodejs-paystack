const { Kafka, Partitioners } = require('kafkajs');
const crypto = require('crypto'); 
const logger = require('./logger');

// Build the base configuration
const kafkaOptions = {
  clientId: 'transaction-service',
  brokers: (process.env.KAFKA_BROKERS || 'kafka:29092').split(','),
};

// switch to cloud production settings if credentials exist
if (process.env.KAFKA_USERNAME && process.env.KAFKA_PASSWORD) {
  logger.info('Configuring Kafka for Secure Cloud Production Environment');
  
  kafkaOptions.ssl = true; 
  
  // Configure SASL authentication mechanisms
  kafkaOptions.sasl = {
    mechanism: 'scram-sha-256',
    username: process.env.KAFKA_USERNAME,
    password: process.env.KAFKA_PASSWORD,
  };
} else {
  logger.info('Configuring Kafka for Local/Docker Environment (No Authentication)');
}

const kafka = new Kafka(kafkaOptions);

const producer = kafka.producer({ createPartitioner: Partitioners.LegacyPartitioner });

const connectKafka = async () => {
  try {
    await producer.connect();
    logger.info('Kafka Producer connected successfully');
  } catch (error) {
    logger.error('Error connecting to Kafka Producer:', error);
  }
};

const publishEvent = async (topic, key, payload) => {
  try {
    await producer.send({
      topic,
      messages: [
        {
          key: key.toString(), 
          value: JSON.stringify({
            eventId: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2),
            timestamp: new Date().toISOString(),
            ...payload
          }),
        },
      ],
    });
    logger.info(`Kafka Event published to topic [${topic}]`);
  } catch (error) {
    logger.error(`Failed to publish event to topic [${topic}]`, error);
  }
};

module.exports = { connectKafka, publishEvent };