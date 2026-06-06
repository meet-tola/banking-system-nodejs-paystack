const logger = require("../utils/logger");

const VirtualAccount = require("../models/virtual-account");

const {
  createCustomer,
  createDedicatedAccount,
  verifyBankAccount,
  createTransferRecipient,
  initiateTransfer,
  listBanks,
} = require("../services/paystack-service");
const { transferFunds, getBalance } = require("../services/ledger-service");

const createFundingAccount = async (req, res) => {
  try {
    const { email, firstName, lastName, phone } = req.body;

    const existing = await VirtualAccount.findOne({
      user: req.user.userId,
    });

    if (existing) {
      return res.json({
        success: true,
        data: existing,
      });
    }

    const customer = await createCustomer({
      email,
      firstName,
      lastName,
      phone,
    });

    const account = await createDedicatedAccount({
      customerCode: customer.customer_code,
    });

    const saved = await VirtualAccount.create({
      user: req.user.userId,

      customerCode: customer.customer_code,

      dedicatedAccountId: account.id,

      accountNumber: account.account_number,

      accountName: account.account_name,

      bankName: account.bank.name,
    });

    return res.status(201).json({
      success: true,
      data: saved,
    });
  } catch (error) {
    logger.error(error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const verifyAccount = async (req, res) => {
  try {
    const { accountNumber, bankCode } = req.body;

    const account = await verifyBankAccount(accountNumber, bankCode);

    return res.json({
      success: true,
      data: account,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

const getBanks = async (req, res) => {
  const banks = await listBanks();

  return res.json({
    success: true,
    data: banks,
  });
};


module.exports = {
  createFundingAccount,
  verifyAccount,
  getBanks,
};
