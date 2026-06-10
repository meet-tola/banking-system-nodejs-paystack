const mongoose = require("mongoose");

const walletSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    accountNumber: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["ACTIVE", "FROZEN", "BLOCKED"],
      default: "ACTIVE",
    },

    currency: {
      type: String,
      required: true,
      default: "NGN",
    },
    pin: {
      type: String,
      required: false, 
      select: false,
    },
  },
  {
    timestamps: true,
  },
);

walletSchema.index({ user: 1, status: 1, accountNumber: 1 });

const Wallet = mongoose.model("Wallet", walletSchema);

module.exports = Wallet;
