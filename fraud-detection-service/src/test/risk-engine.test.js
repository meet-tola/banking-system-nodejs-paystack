const mongoose = require("mongoose");
const { evaluateRiskProfile } = require("../services/risk-engine");
const FraudProfile = require("../models/fraud-profile");
const redis = require("../config/redis");

describe("Fraud Rules Engine - Live Integration Test", () => {
  let realUserId;
  const realWalletId = new mongoose.Types.ObjectId().toString();
  const realDeviceId = "c3b3f712-4ba2-4a24-a744-884bc7da21a5"; // Simulated real UUIDv4

  beforeAll(async () => {
    // Connect to your local test database instance
    await mongoose.connect(
      "mongodb+srv://bankingSystem:bankingSystem@cluster0.9xxgo6i.mongodb.net/banking-system-nodejs-paystack?retryWrites=true&w=majority",
    );

    // Clear out any old state in Redis/Mongo to ensure clean parameters
    await FraudProfile.deleteMany({});
    await redis.flushdb();

    // 1. Generate a real MongoDB ObjectId by saving a genuine document layout
    const testProfile = await FraudProfile.create({
      userId: new mongoose.Types.ObjectId().toString(),
      email: "real-user@domain.com",
      lastPasswordChangedAt: new Date(Date.now() - 60000), // Changed 1 min ago to trigger rule
      knownDevices: [{ deviceId: "old-trusted-device-id", ip: "127.0.0.1" }],
    });

    realUserId = testProfile.userId;
  });

  afterAll(async () => {
    // Clean up connections so Jest exits cleanly
    await mongoose.connection.close();
    await redis.quit();
  });

  it("should evaluate a real user ID dynamically pulling records straight from MongoDB", async () => {
    const payload = {
      userId: realUserId, // Pass the real generated User ID string here
      fromAccount: realWalletId,
      amount: 250,
    };

    const context = {
      ip: "192.168.1.50",
      deviceId: realDeviceId, // Passing a completely new device ID string
    };

    // Run engine directly over live test database connections
    const result = await evaluateRiskProfile(
      "transaction.created",
      payload,
      context,
    );

    console.log("Live System Assessment Matrix:", result);

    // Verify rules match based on database records
    expect(result.triggeredRules).toContain(
      "IMMEDIATE_TRANSFER_AFTER_PASSWORD_CHANGE",
    );
    expect(result.triggeredRules).toContain("UNRECOGNIZED_DEVICE_SIGNATURE");
    expect(result.riskScore).toBe(95); // 50 (Password) + 30 (Device) + 15 (IP Divergence)
    expect(result.recommendation).toBe("BLOCK");
  });
});
