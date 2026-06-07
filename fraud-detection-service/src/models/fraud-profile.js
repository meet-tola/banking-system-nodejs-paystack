const mongoose = require("mongoose");

const DeviceSchema = new mongoose.Schema({
  deviceId: { type: String, required: true },
  ip: String,
  userAgent: String,
  createdAt: { type: Date, default: Date.now }
});

const FraudProfileSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true, index: true },
  email: { type: String, required: true },
  lastPasswordChangedAt: { type: Date },
  lastKnownIp: { type: String },
  knownDevices: [DeviceSchema],
  createdAt: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.model("FraudProfile", FraudProfileSchema);