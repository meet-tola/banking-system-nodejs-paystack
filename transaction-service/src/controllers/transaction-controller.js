const axios = require("axios");
const Transaction = require("../models/transaction");
const logger = require("../utils/logger");
const { transferFunds, getBalance } = require("../services/ledger-service");
const { getWalletById } = require("../services/wallet-service");
const { publishEvent } = require("../utils/kafka-producer");

const createTransaction = async (req, res) => {
  logger.info("Create Transaction endpoint hit");

  try {
    const { fromAccount, toAccount, amount, idempotencyKey } = req.body;

    // Validate Input
    if (!fromAccount || !toAccount || !amount || !idempotencyKey) {
      return res.status(400).json({
        success: false,
        message:
          "fromAccount, toAccount, amount and idempotencyKey are required",
      });
    }

    // Check Idempotency
    const isTransactionAlreadyExists = await Transaction.findOne({
      idempotencyKey,
    });

    if (isTransactionAlreadyExists) {
      if (isTransactionAlreadyExists.status === "COMPLETED") {
        return res.status(200).json({
          message: "Transaction already processed",
          transaction: isTransactionAlreadyExists,
        });
      }

      if (isTransactionAlreadyExists.status === "PENDING") {
        return res.status(200).json({
          message: "Transaction is still processing",
        });
      }

      if (isTransactionAlreadyExists.status === "FAILED") {
        return res.status(500).json({
          message: "Previous transaction failed.",
        });
      }
    }

    // Get wallets
    const senderWallet = await getWalletById(fromAccount);
    const receiverWallet = await getWalletById(toAccount);

    if (!senderWallet) {
      throw new Error("Sender wallet not found");
    }

    if (!receiverWallet) {
      throw new Error("Receiver wallet not found");
    }

    // Verify Sender Owns Wallet
    if (senderWallet.user.toString() !== req.user.userId) {
      logger.error("You are not authorized to use this wallet");

      return res.status(403).json({
        success: false,
        message: "You are not authorized to use this wallet",
      });
    }

    // Verify wallet status
    if (senderWallet.status !== "ACTIVE") {
      logger.error("Sender wallet is not active");

      return res.status(400).json({
        success: false,
        message: "Sender wallet is not active",
      });
    }

    if (receiverWallet.status !== "ACTIVE") {
      return res.status(400).json({
        success: false,
        message: "Receiver wallet is not active",
      });
    }

    const balance = await getBalance(fromAccount);

    if (balance < amount) {
      return res.status(400).json({
        success: false,
        message: "Insufficient balance",
      });
    }

    // Create Transaction
    const transaction = await Transaction.create({
      fromAccount,
      toAccount,
      amount,
      idempotencyKey,
      status: "PENDING",
    });

    logger.info("Transaction created successfully");

    // Unified context extracted for device identity verification layer
    const contextMeta = {
      ip: req.ip,
      deviceId: req.headers["x-device-id"],
      userAgent: req.headers["user-agent"]
    };

    // Emit 'transaction.created' Event
    await publishEvent('transaction-events', fromAccount, {
      eventType: "transaction.created",
      payload: {
        transactionId: transaction._id,
        fromAccount,
        toAccount,
        amount,
        userId: req.user.userId
      },
      context: contextMeta
    });

    // Call Ledger Service
    try {
      const result = await transferFunds({
        transactionId: transaction._id,
        fromWallet: fromAccount,
        toWallet: toAccount,
        amount,
      });

      if (!result.success) {
        logger.error("Ledger failed");
      }

      // Update Transaction Status
      transaction.status = "COMPLETED";
      await transaction.save();

      // Emit 'transaction.completed' Event 
      await publishEvent('transaction-events', fromAccount, {
        eventType: "transaction.completed",
        payload: {
          transactionId: transaction._id,
          fromAccount,
          toAccount,
          amount,
          userId: req.user.userId
        },
        context: contextMeta
      });

      // Return Success
      return res.status(201).json({
        success: true,
        message: "Transaction completed successfully",
        data: transaction,
      });
    } catch (ledgerError) {
      logger.error("Ledger transfer failed", ledgerError);

      transaction.status = "FAILED";
      await transaction.save();

      // Emit 'transaction.failed' Event (Triggers failure tracking velocity limits)
      await publishEvent('transaction-events', fromAccount, {
        eventType: "transaction.failed",
        payload: {
          transactionId: transaction._id,
          fromAccount,
          toAccount,
          amount,
          userId: req.user.userId,
          reason: ledgerError.message || "Ledger processing error"
        },
        context: contextMeta
      });

      return res.status(400).json({
        success: false,
        message: "Transaction failed",
      });
    }
  } catch (error) {
    logger.error("Error creating transaction", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

const getTransactionById = async (req, res) => {
  logger.info("Get Transaction endpoint hit");

  try {
    const transaction = await Transaction.findById(req.params.id);

    if (!transaction) {
      logger.error("Transaction not found");

      return res.status(404).json({
        success: false,
        message: "Transaction not found",
      });
    }
    return res.json({
      success: true,
      data: transaction,
    });
  } catch (error) {
    logger.error("Error getting transaction", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const getAllTransactions = async (req, res) => {
  logger.info("Get All Transactions endpoint hit");

  try {
    const { status, fromAccount, toAccount } = req.query;

    const filter = {};

    if (status) filter.status = status;
    if (fromAccount) filter.fromAccount = fromAccount;
    if (toAccount) filter.toAccount = toAccount;

    const transactions = await Transaction.find(filter).sort({ createdAt: -1 });

    return res.json({
      success: true,
      count: transactions.length,
      data: transactions,
    });
  } catch (error) {
    logger.error("Error getting all transaction", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

module.exports = {
  createTransaction,
  getTransactionById,
  getAllTransactions,
};