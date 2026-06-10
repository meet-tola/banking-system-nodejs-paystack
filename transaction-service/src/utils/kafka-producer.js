const { Kafka, Partitioners } = require("kafkajs");
const crypto = require("crypto");
const logger = require("./logger");
const fs = require("fs");
const path = require("path");

// Build the base configuration
const kafkaOptions = {
  clientId: "auth-service",
  brokers: (process.env.KAFKA_BROKERS || "kafka:29092").split(","),
};

const caCertPath = path.resolve(__dirname, "../config/ca.pem");
const accessCertPath = path.resolve(__dirname, "../config/service.cert");
const accessKeyPath = path.resolve(__dirname, "../config/service.key");

const hasEnvCerts =
  process.env.KAFKA_CA_CERT &&
  process.env.KAFKA_ACCESS_CERT &&
  process.env.KAFKA_ACCESS_KEY;
const hasLocalCerts =
  fs.existsSync(caCertPath) &&
  fs.existsSync(accessCertPath) &&
  fs.existsSync(accessKeyPath);

if (hasEnvCerts || hasLocalCerts) {
  logger.info(
    "Configuring Kafka for Secure Cloud Production Environment via mTLS",
  );

  const ca = hasEnvCerts
    ? process.env.KAFKA_CA_CERT
    : fs.readFileSync(caCertPath, "utf-8");
  const cert = hasEnvCerts
    ? process.env.KAFKA_ACCESS_CERT
    : fs.readFileSync(accessCertPath, "utf-8");
  const key = hasEnvCerts
    ? process.env.KAFKA_ACCESS_KEY
    : fs.readFileSync(accessKeyPath, "utf-8");

  // Configure Mutual TLS (mTLS)
  kafkaOptions.ssl = {
    rejectUnauthorized: true,
    ca: [ca],
    cert: cert,
    key: key,
  };
} else {
  logger.warn("Kafka is running without mTLS configuration.");
}

const kafka = new Kafka(kafkaOptions);
const producer = kafka.producer({
  createPartitioner: Partitioners.LegacyPartitioner,
});

const connectKafka = async () => {
  try {
    await producer.connect();
    logger.info("Kafka Producer connected successfully via Mutual TLS!");
  } catch (error) {
    logger.error("Error connecting to Kafka Producer:", error);
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
            eventId: crypto.randomUUID
              ? crypto.randomUUID()
              : Math.random().toString(36).substring(2),
            timestamp: new Date().toISOString(),
            ...payload,
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
