// scripts/pipeline-tester.js
const { Kafka } = require("kafkajs");

const kafka = new Kafka({
  clientId: "pipeline-manual-tester",
  brokers: ["localhost:29092"] // Adjust broker string for local or docker context
});

const producer = kafka.producer();

const executePipelineTestSimulation = async () => {
  console.log("Connecting manual pipeline tester utility...");
  await producer.connect();

  const mockUserId = "usr_test_9988";
  const mockWalletId = "wlt_test_3344";

  // Simulation Step 1: Fire User Logged In event with an unrecognized device ID signature
  console.log("Publishing UserLoggedIn anomaly...");
  await producer.send({
    topic: "user-auth",
    messages: [{
      key: mockUserId,
      value: JSON.stringify({
        eventType: "UserLoggedIn",
        payload: { userId: mockUserId, email: "malicious-actor@test.com" },
        context: { ip: "192.168.88.99", deviceId: "unknown-hacker-hardware-id" }
      })
    }]
  });

  // Simulation Step 2: Fire Transaction Created event that exceeds high value thresholds
  console.log("Publishing high value structural transaction.created event...");
  await producer.send({
    topic: "transaction-events",
    messages: [{
      key: mockWalletId,
      value: JSON.stringify({
        eventType: "transaction.created",
        payload: {
          transactionId: "tx_mock_112233",
          userId: mockUserId,
          fromAccount: mockWalletId,
          toAccount: "wlt_beneficiary_7777",
          amount: 450000 // Breaks $10,000 ceiling
        },
        context: { ip: "192.168.88.99", deviceId: "unknown-hacker-hardware-id" }
      })
    }]
  });

  console.log("All simulated pipeline test anomalies successfully injected into Kafka brokers.");
  await producer.disconnect();
};

executePipelineTestSimulation().catch(console.error);