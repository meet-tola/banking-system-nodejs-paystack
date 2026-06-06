const mongoose = require("mongoose");
const transaction = require("../../../transaction-service/src/models/transaction");

const VirtualAccountSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    customerCode: String,

    dedicatedAccountId: String,

    accountNumber: String,

    accountName: String,

    bankName: String,

    active: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  },
);

const virtualAccount = mongoose.model("VirtualAccount", VirtualAccountSchema);
module.exports = virtualAccount;
