const logger = require("../utils/logger");
const crypto = require("crypto");

const Withdrawal = require("../models/withdrawal");

const {
  verifyBankAccount,
  createTransferRecipient,
  initiateTransfer,
} = require("../services/paystack-service");

const { transferFunds, getBalance } = require("../services/ledger-service");

const withdrawFunds = async (req, res) => {
  try {
    const { walletId, amount, accountNumber, bankCode, idempotencyKey } =
      req.body;

    // Validate input
    if (!walletId || !amount || !accountNumber || !bankCode || !idempotencyKey) {
      return res.status(400).json({
        success: false,
        message:
          "walletId, amount, accountNumber, bankCode, idempotencyKey are required",
      });
    }

    // Idempotency check
    const existingWithdrawal = await Withdrawal.findOne({
      reference: idempotencyKey,
    });

    if (existingWithdrawal) {
      return res.status(200).json({
        success: true,
        message: "Withdrawal already processed",
        data: existingWithdrawal,
      });
    }

    // Check balance
    const balance = await getBalance(walletId);

    if (balance < amount) {
      return res.status(400).json({
        success: false,
        message: "Insufficient balance",
      });
    }

    // Verify bank account
    const account = await verifyBankAccount(accountNumber, bankCode);

    // Create Paystack recipient
    const recipient = await createTransferRecipient({
      accountNumber,
      bankCode,
      accountName: account.account_name,
    });

    // Create withdrawal record (PENDING)
    const withdrawal = await Withdrawal.create({
      user: req.user.userId,
      wallet: walletId,
      amount,
      reference: idempotencyKey,
      status: "PENDING",
      recipientCode: recipient.recipient_code,
      bankAccount: {
        accountNumber,
        bankCode,
        accountName: account.account_name,
      },
      metadata: {
        initiatedBy: req.user.userId,
      },
    });

    // Debit wallet FIRST
    await transferFunds({
      transactionId: withdrawal._id,
      fromWallet: walletId,
      toWallet: process.env.WITHDRAWAL_HOLD_ACCOUNT,
      amount,
    });

    // Update status to PROCESSING
    withdrawal.status = "PROCESSING";
    await withdrawal.save();

    // Initiate Paystack transfer
    const transfer = await initiateTransfer({
      amount,
      recipientCode: recipient.recipient_code,
      reference: idempotencyKey,
    });

    // Save Paystack response
    withdrawal.providerTransferCode = transfer.transfer_code || null;

    withdrawal.status = "PROCESSING";
    await withdrawal.save();

    // Return response
    return res.json({
      success: true,
      message: "Withdrawal initiated successfully",
      data: {
        withdrawalId: withdrawal._id,
        paystack: transfer,
      },
    });
  } catch (error) {
    logger.error("Withdrawal error", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

module.exports = { withdrawFunds };
