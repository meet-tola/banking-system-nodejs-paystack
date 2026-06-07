const mongoose = require("mongoose");

const WithdrawalSchema = new mongoose.Schema(
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

    status: {
      type: String,
      enum: [
        "PENDING",
        "PROCESSING",
        "SUCCESS",
        "FAILED",
        "REVERSED",
      ],
      default: "PENDING",
      index: true,
    },

    // Paystack transfer tracking
    reference: {
      type: String,
      required: true,
    },

    recipientCode: {
      type: String,
      required: true,
      index: true,
    },

    bankAccount: {
      accountNumber: String,
      bankCode: String,
      accountName: String,
    },

    provider: {
      type: String,
      default: "PAYSTACK",
    },

    providerTransferCode: {
      type: String,
      index: true,
    },

    failureReason: String,

    metadata: {
      type: Object,
      default: {},
    },

    processedAt: Date,
  },
  {
    timestamps: true,
  }
);

// Prevent duplicate payouts
WithdrawalSchema.index(
  { reference: 1 },
  { unique: true }
);

module.exports = mongoose.model(
  "Withdrawal",
  WithdrawalSchema
);