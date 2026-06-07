const mongoose = require("mongoose");

const FundingTransactionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    wallet: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Wallet",
      required: true,
      index: true,
    },

    amount: {
      type: Number,
      required: true,
    },

    currency: {
      type: String,
      default: "NGN",
    },

    // Paystack references
    provider: {
      type: String,
      default: "PAYSTACK",
    },

    reference: {
      type: String,
      required: true,
    },

    providerTransactionId: {
      type: String,
      index: true,
    },

    status: {
      type: String,
      enum: ["PENDING", "SUCCESS", "FAILED"],
      default: "PENDING",
      index: true,
    },

    channel: {
      type: String,
      enum: ["BANK_TRANSFER", "CARD", "USSD", "DEDICATED_ACCOUNT"],
    },

    metadata: {
      type: Object,
      default: {},
    },

    // prevents duplicate webhook processing
    isProcessed: {
      type: Boolean,
      default: false,
      index: true,
    },

    processedAt: {
      type: Date,
    },

    failureReason: {
      type: String,
    },
  },
  {
    timestamps: true,
  },
);

// Prevent duplicate deposits from Paystack retries
FundingTransactionSchema.index({ reference: 1 }, { unique: true });

module.exports = mongoose.model("FundingTransaction", FundingTransactionSchema);
