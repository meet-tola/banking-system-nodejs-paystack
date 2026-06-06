const mongoose = require("mongoose");

const WebhookEventSchema = new mongoose.Schema(
  {
    eventId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    eventType: {
      type: String,
      required: true,
      index: true,
    },

    provider: {
      type: String,
      default: "PAYSTACK",
    },

    payload: {
      type: Object,
      required: true,
    },

    processedAt: Date,
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model(
  "WebhookEvent",
  WebhookEventSchema
);