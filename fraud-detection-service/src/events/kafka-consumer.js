const fs = require("fs");
const path = require("path");
const { Kafka } = require("kafkajs");
const logger = require("../utils/logger");

// Handler bindings
const {
  handleUserRegistered,
  handleUserLoggedIn,
  handlePasswordChanged,
} = require("./handlers/auth-handlers");
const {
  handleTransactionCreated,
  handleTransactionFailed,
  handleTransactionCompleted,
} = require("./handlers/transaction-handlers");

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

const connectKafka = async () => {
  try {
    await producer.connect();
    logger.info("Kafka Producer connected successfully via Mutual TLS!");
  } catch (error) {
    logger.error("Error connecting to Kafka Producer:", error);
  }
};

const kafka = new Kafka(kafkaOptions);
const consumer = kafka.consumer({ groupId: "fraud-service-core-group" });

const startFraudConsumerContext = async () => {
  try {
    const admin = kafka.admin();
    logger.info(
      "Connecting Kafka Admin Client to verify core infrastructure topics...",
    );
    await admin.connect();

    const requiredTopics = ["user-auth", "transaction-events", "ledger-events"];
    const existingTopics = await admin.listTopics();

    const topicsToCreate = requiredTopics
      .filter((topic) => !existingTopics.includes(topic))
      .map((topic) => ({
        topic: topic,
        numPartitions: 1,
        replicationFactor: -1,
      }));

    if (topicsToCreate.length > 0) {
      logger.info(
        `Missing topics detected. Dynamically creating: ${topicsToCreate.map((t) => t.topic).join(", ")}`,
      );
      await admin.createTopics({
        topics: topicsToCreate,
        waitForLeaders: true,
      });
      logger.info("Topics created successfully!");
    } else {
      logger.info("All structural routing topics validated on server cluster.");
    }

    await admin.disconnect();

    await consumer.connect();
    logger.info("Fraud engine consumer mapping stream connection successful.");

    await consumer.subscribe({
      topics: requiredTopics,
      fromBeginning: false,
    });

    await consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        try {
          const structuralRawContent = message.value.toString();
          const compiledEvent = JSON.parse(structuralRawContent);

          const eventType =
            message.headers?.eventType?.toString() ||
            compiledEvent.eventType ||
            topic;

          switch (eventType) {
            case "UserRegistered":
              await handleUserRegistered(compiledEvent);
              break;
            case "UserLoggedIn":
              await handleUserLoggedIn(compiledEvent);
              break;
            case "PasswordChanged":
              await handlePasswordChanged(compiledEvent);
              break;
            case "transaction.created":
              await handleTransactionCreated(compiledEvent);
              break;
            case "transaction.failed":
              await handleTransactionFailed(compiledEvent);
              break;
            case "transaction.completed":
            case "TransferCompleted":
              await handleTransactionCompleted(compiledEvent);
              break;
            default:
              logger.debug(
                `Skipping unrelated payload footprint message context routing: ${eventType}`,
              );
          }
        } catch (innerMappingErr) {
          logger.error(
            "Error parsing structure string message within context runtime wrapper",
            innerMappingErr,
          );
        }
      },
    });
  } catch (globalConsumerError) {
    logger.error(
      "Fatal failure on structural core message processing infrastructure streams loop",
      globalConsumerError,
    );
  }
};

module.exports = { startFraudConsumerContext };
