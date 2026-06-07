const mongoose = require("mongoose");

const FraudRiskLogSchema = new mongoose.Schema({
  eventId: { type: String, required: true, unique: true, index: true },
  eventType: { type: String, required: true, index: true },
  userId: { type: String, index: true },
  targetEntityId: { type: String }, // Can represent fromAccount or transactionId
  riskScore: { type: Number, required: true },
  recommendation: { type: String, enum: ["ALLOW", "CHALLENGE_MFA", "BLOCK"], required: true },
  triggeredRules: [{ type: String }],
  breakdown: {
    ruleBased: { type: Number, default: 0 },
    device: { type: Number, default: 0 },
    velocity: { type: Number, default: 0 },
    behavioral: { type: Number, default: 0 }
  },
  payloadSnapshot: { type: Object }
}, { timestamps: true });

module.exports = mongoose.model("FraudRiskLog", FraudRiskLogSchema);