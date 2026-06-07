require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});
const { Kafka, Partitioners } = require("kafkajs");
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

const kafkaOptions = {
  clientId: 'fraud-service',
  brokers: (process.env.KAFKA_BROKERS || 'kafka:29092').split(','),
};

if (process.env.KAFKA_USERNAME && process.env.KAFKA_PASSWORD) {
  kafkaOptions.ssl = true;
  kafkaOptions.sasl = {
    mechanism: "scram-sha-256",
    username: process.env.KAFKA_USERNAME,
    password: process.env.KAFKA_PASSWORD,
  };
}

const kafka = new Kafka(kafkaOptions);
const consumer = kafka.consumer({ groupId: "fraud-service-core-group" });

const startFraudConsumerContext = async () => {
  try {
    await consumer.connect();
    logger.info("Fraud engine consumer mapping stream connection successful.");

    // Bind system-wide stream updates vectors
    await consumer.subscribe({
      topics: ["user-auth", "transaction-events", "ledger-events"],
      fromBeginning: false,
      allowAutoTopicCreation: true,
    });

    await consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        try {
          const structuralRawContent = message.value.toString();
          const compiledEvent = JSON.parse(structuralRawContent);

          // Extract routing key signatures from custom properties or metadata fields inside streams
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
