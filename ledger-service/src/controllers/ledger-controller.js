const mongoose = require("mongoose");
const Ledger = require("../models/ledger");
const logger = require("../utils/logger");

const getBalance = async (req, res) => {
  try {
    const walletId = req.params.walletId;

    const credits = await Ledger.aggregate([
      {
        $match: {
          walletId,
          type: "CREDIT",
        },
      },
      {
        $group: {
          _id: null,
          total: {
            $sum: "$amount",
          },
        },
      },
    ]);

    const debits = await Ledger.aggregate([
      {
        $match: {
          walletId,
          type: "DEBIT",
        },
      },
      {
        $group: {
          _id: null,
          total: {
            $sum: "$amount",
          },
        },
      },
    ]);

    const totalCredits = credits[0]?.total || 0;
    const totalDebits = debits[0]?.total || 0;

    const balance = totalCredits - totalDebits;

    return res.json({
      success: true,
      balance,
    });
  } catch (error) {
    logger.error("Error getting Balance", error);

    return res.status(500).json({
      success: false,
      message: "Error getting Balance",
    });
  }
};

const transfer = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    const { transactionId, fromWallet, toWallet, amount } = req.body;

    if (!transactionId || !fromWallet || !toWallet || !amount) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields",
      });
    }

    // Prevent duplicate processing
    const existing = await Ledger.findOne({
      reference: transactionId,
    });

    if (existing) {
      return res.json({
        success: true,
        message: "Already processed",
      });
    }

    session.startTransaction();

    // Ledger Create sender and receiver
    await Ledger.insertMany(
      [
        {
          walletId: fromWallet,
          amount,
          type: "DEBIT",
          reference: transactionId,
        },
        {
          walletId: toWallet,
          amount,
          type: "CREDIT",
          reference: transactionId,
        },
      ],
      { session },
    );
    await session.commitTransaction();
    session.endSession();

    logger.info("Transfer recorded successfully");

    return res.json({
      success: true,
      message: "Transfer recorded successfully",
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();

    logger.error("Error creating Transfer Record.", error);

    return res.status(500).json({
      success: false,
      message: "Error creating Transfer Record.",
    });
  }
};

module.exports = {
  getBalance,
  transfer,
};
