const logger = require("../utils/logger");
const VirtualAccount = require("../models/virtual-account");

const {
  createCustomer,
  createDedicatedAccount,
  verifyBankAccount,
  listBanks,
} = require("../services/paystack-service");

const createFundingAccount = async (req, res) => {
  try {
    const { email, firstName, lastName, phone } = req.body;

    logger.info("Creating funding account", {
      userId: req.user.userId,
      email,
    });

    const existing = await VirtualAccount.findOne({
      user: req.user.userId,
    });

    if (existing) {
      logger.info("Existing virtual account found", {
        userId: req.user.userId,
        accountId: existing._id,
      });

      return res.json({
        success: true,
        data: existing,
      });
    }

    logger.info("Creating Paystack customer");

    const customer = await createCustomer({
      email,
      firstName,
      lastName,
      phone,
    });

    logger.info("Customer created", {
      customerCode: customer.customer_code,
      email: customer.email,
    });

    logger.info("Creating dedicated account", {
      customerCode: customer.customer_code,
    });

    const account = await createDedicatedAccount({
      customerCode: customer.customer_code,
    });

    logger.info("Dedicated account created", {
      accountId: account.id,
      accountNumber: account.account_number,
      bank: account.bank?.name,
    });

    const saved = await VirtualAccount.create({
      user: req.user.userId,
      customerCode: customer.customer_code,
      dedicatedAccountId: account.id,
      accountNumber: account.account_number,
      accountName: account.account_name,
      bankName: account.bank.name,
    });

    logger.info("Virtual account saved successfully", {
      userId: req.user.userId,
      virtualAccountId: saved._id,
    });

    return res.status(201).json({
      success: true,
      data: saved,
    });
  } catch (error) {
    logger.error("Error creating funding account", {
      message: error.message,
      stack: error.stack,
      userId: req.user?.userId,
    });

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const verifyAccount = async (req, res) => {
  try {
    const { accountNumber, bankCode } = req.body;

    logger.info("Verifying bank account", {
      accountNumber,
      bankCode,
    });

    const account = await verifyBankAccount(accountNumber, bankCode);

    logger.info("Bank account verified", {
      accountName: account.account_name,
      bankId: account.bank_id,
    });

    return res.json({
      success: true,
      data: account,
    });
  } catch (error) {
    logger.error("Error verifying bank account", {
      message: error.message,
      stack: error.stack,
    });

    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

const getBanks = async (req, res) => {
  try {
    logger.info("Fetching banks list");

    const banks = await listBanks();

    logger.info("Banks fetched successfully", {
      count: banks.length,
    });

    return res.json({
      success: true,
      data: banks,
    });
  } catch (error) {
    logger.error("Error fetching banks", {
      message: error.message,
      stack: error.stack,
    });

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

module.exports = {
  createFundingAccount,
  verifyAccount,
  getBanks,
};