require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});
const axios = require("axios");
const Transaction = require("../models/transaction");
const logger = require("../utils/logger");
const { getUsersByIds } = require("../services/auth-service");
const { transferFunds, getBalance } = require("../services/ledger-service");
const { getWalletByAccount } = require("../services/wallet-service");
const { publishEvent } = require("../utils/kafka-producer");

const createTransaction = async (req, res) => {
  const { fromAccount, toAccount, amount, idempotencyKey, pin } = req.body;
  const logCtx = `[Tx-IK: ${idempotencyKey}]`;

  try {
    if (!fromAccount || !toAccount || !amount || !idempotencyKey || !pin) {
      logger.warn(
        `${logCtx} Validation failed: Missing required transactional fields.`,
      );
      return res.status(400).json({
        success: false,
        message:
          "fromAccount, toAccount, amount, idempotencyKey, and pin are required",
      });
    }

    // Check Idempotency Cache
    const isTransactionAlreadyExists = await Transaction.findOne({
      idempotencyKey,
    });
    if (isTransactionAlreadyExists) {
      logger.info(
        `${logCtx} Idempotency hit. Status: ${isTransactionAlreadyExists.status}`,
      );
      if (isTransactionAlreadyExists.status === "COMPLETED") {
        return res.status(200).json({
          message: "Transaction already processed",
          transaction: isTransactionAlreadyExists,
        });
      }
      if (isTransactionAlreadyExists.status === "PENDING") {
        return res
          .status(200)
          .json({ message: "Transaction is still processing" });
      }
      if (isTransactionAlreadyExists.status === "FAILED") {
        return res
          .status(500)
          .json({ message: "Previous transaction failed." });
      }
    }

    // Fetch sender/receiver wallets
    const senderWallet = await getWalletByAccount(fromAccount);
    const receiverWallet = await getWalletByAccount(toAccount);

    if (!senderWallet || !receiverWallet) {
      logger.warn(
        `${logCtx} Account lookup failed. Sender found: ${!!senderWallet}, Receiver found: ${!!receiverWallet}`,
      );
      return res.status(404).json({
        success: false,
        message: !senderWallet
          ? "Sender wallet not found"
          : "Receiver wallet not found",
      });
    }

    // Verify Sender Owns Wallet
    if (senderWallet.user.toString() !== req.user.userId) {
      logger.error(
        `${logCtx} Unauthorized: Actor ${req.user.userId} does not own wallet ${fromAccount}`,
      );
      return res.status(403).json({
        success: false,
        message: "You are not authorized to use this wallet",
      });
    }

    // Secure PIN execution check over microservice mesh
    try {
      const pinVerificationResponse = await axios.post(
        `${process.env.WALLET_SERVICE_URL}/api/wallet/verify-pin`,
        { accountNumber: fromAccount, pin },
        {
          headers: {
            "x-internal-service-token": process.env.INTERNAL_SERVICE_TOKEN,
          },
          timeout: 5000,
        },
      );

      if (
        !pinVerificationResponse.data ||
        !pinVerificationResponse.data.valid
      ) {
        logger.warn(
          `${logCtx} Invalid PIN verification submission for account: ${fromAccount}`,
        );
        return res.status(401).json({
          success: false,
          message: "Transaction failed. Incorrect transaction PIN.",
        });
      }
    } catch (pinError) {
      logger.error(
        `${logCtx} PIN verification network link exception: ${pinError.message}`,
      );
      return res
        .status(502)
        .json({ success: false, message: "Security check unavailable" });
    }

    // Verify wallet status records
    if (
      senderWallet.status !== "ACTIVE" ||
      receiverWallet.status !== "ACTIVE"
    ) {
      logger.warn(
        `${logCtx} Status restriction. Sender: ${senderWallet.status}, Receiver: ${receiverWallet.status}`,
      );
      return res.status(400).json({
        success: false,
        message:
          senderWallet.status !== "ACTIVE"
            ? "Sender wallet is inactive"
            : "Receiver wallet is inactive",
      });
    }

    // Balance evaluation check against ledger records
    const balance = await getBalance(senderWallet);
    if (balance < amount) {
      logger.warn(
        `${logCtx} Overdraft rejected. Required: ₦${amount} | Available: ₦${balance}`,
      );
      return res
        .status(400)
        .json({ success: false, message: "Insufficient balance" });
    }

    // Instantiate Pending Database Document Node
    const transaction = await Transaction.create({
      fromAccount,
      toAccount,
      amount,
      idempotencyKey,
      status: "PENDING",
    });

    const contextMeta = {
      ip: req.ip,
      deviceId: req.headers["x-device-id"],
      userAgent: req.headers["user-agent"],
    };

    // Dispatch asset settlement allocation execution
    try {
      const result = await transferFunds({
        transactionId: transaction._id,
        fromWallet: senderWallet._id,
        toWallet: receiverWallet._id,
        amount,
      });

      transaction.status = "COMPLETED";
      await transaction.save();
      logger.info(
        `${logCtx} Secure transfer complete. Allocated ₦${amount} from wallet ${senderWallet._id} to wallet ${receiverWallet._id}`,
      );

      publishEvent("transaction-events", fromAccount, {
        eventType: "transaction.completed",
        payload: {
          transactionId: transaction._id,
          fromAccount,
          toAccount,
          amount,
          userId: req.user.userId,
        },
        context: contextMeta,
      }).catch((e) =>
        logger.error(`${logCtx} Kafka success emission failed:`, e.message),
      );

      return res.status(201).json({
        success: true,
        message: "Transaction completed successfully",
        data: transaction,
      });
    } catch (ledgerError) {
      logger.error(
        `${logCtx} Core ledger engine execution failure: ${ledgerError.message}`,
      );

      transaction.status = "FAILED";
      await transaction.save();

      publishEvent("transaction-events", fromAccount, {
        eventType: "transaction.failed",
        payload: {
          transactionId: transaction._id,
          fromAccount,
          toAccount,
          amount,
          userId: req.user.userId,
          reason: ledgerError.message,
        },
        context: contextMeta,
      }).catch((e) =>
        logger.error(`${logCtx} Kafka failure emission failed:`, e.message),
      );

      return res
        .status(400)
        .json({ success: false, message: "Transaction processing failed" });
    }
  } catch (error) {
    logger.error(
      `${logCtx} Unhandled top-level transaction controller failure:`,
      error.message || error,
    );
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};

const getTransactionById = async (req, res) => {
  try {
    const transaction = await Transaction.findById(req.params.id);
    if (!transaction) {
      return res
        .status(404)
        .json({ success: false, message: "Transaction not found" });
    }

    const [senderWallet, receiverWallet] = await Promise.all([
      getWalletByAccount(transaction.fromAccount).catch(() => null),
      getWalletByAccount(transaction.toAccount).catch(() => null),
    ]);

    const senderUserId = senderWallet?.user || senderWallet?.userId;
    const receiverUserId = receiverWallet?.user || receiverWallet?.userId;

    const userIdsToFetch = [...new Set([senderUserId, receiverUserId])].filter(
      Boolean,
    );

    let senderInfo = null;
    let receiverInfo = null;

    if (userIdsToFetch.length > 0) {
      try {
        const users = await getUsersByIds(userIdsToFetch);
        logger.info(users);

        senderInfo =
          users.find((u) => (u._id || u.id) === senderUserId.toString()) ||
          null;
        receiverInfo =
          users.find((u) => (u._id || u.id) === receiverUserId.toString()) ||
          null;
      } catch (authError) {
        logger.error(
          `Failed to fetch user profiles for Tx ${req.params.id}: ${authError.message}`,
        );
      }
    }

    return res.json({
      success: true,
      data: {
        ...transaction.toObject(),
        sender: senderInfo
          ? {
              id: senderUserId,
              name: senderInfo.fullName,
              email: senderInfo.email,
            }
          : null,
        receiver: receiverInfo
          ? {
              id: receiverUserId,
              name: receiverInfo.fullName,
              email: receiverInfo.email,
            }
          : null,
      },
    });
  } catch (error) {
    logger.error(`Error fetching transaction ${req.params.id}:`, error.message);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};

const getAllTransactions = async (req, res) => {
  try {
    const { status, fromAccount, toAccount } = req.query;
    const pageCount = parseInt(req.query.page) || 1;
    const limitCount = parseInt(req.query.limit) || 20;
    const skipThreshold = (pageCount - 1) * limitCount;

    let filter = {};
    if (status) filter.status = status;

    if (fromAccount && !toAccount) {
      filter.$or = [{ fromAccount: fromAccount }, { toAccount: fromAccount }];
    } else {
      if (fromAccount) filter.fromAccount = fromAccount;
      if (toAccount) filter.toAccount = toAccount;
    }

    const totalCount = await Transaction.countDocuments(filter);
    const transactions = await Transaction.find(filter)
      .sort({ createdAt: -1 })
      .skip(skipThreshold)
      .limit(limitCount);

    return res.json({
      success: true,
      count: transactions.length,
      pagination: {
        totalCount,
        totalPages: Math.ceil(totalCount / limitCount),
        currentPage: pageCount,
        limit: limitCount,
      },
      data: transactions,
    });
  } catch (error) {
    logger.error("Error fetching historical transaction logs:", error.message);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};

module.exports = {
  createTransaction,
  getTransactionById,
  getAllTransactions,
};
