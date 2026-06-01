const Wallet = require("../models/wallet");
const logger = require("../utils/logger");
const { getBalance } = require("../services/ledger-service");

// Create Wallet
const createWallet = async (req, res) => {
  logger.info("Create Wallet endpoint hit");

  try {
    const wallet = new Wallet({
      user: req.user.userId,
    });

    await wallet.save();

    logger.info("Wallet created successfully");

    return res.status(201).json({
      wallet,
    });
  } catch (error) {
    logger.error("Error creating wallet", error);

    return res.status(500).json({
      success: false,
      message: "Error creating wallet",
    });
  }
};

const getWallet = async (req, res) => {
  logger.info("Get Wallet endpoint hit");

  try {
    const wallet = await Wallet.findById(req.params.id);

    if (!wallet) {
      logger.warn("Wallet not found");

      return res.status(404).json({
        success: false,
        message: "Wallet not found",
      });
    }

    return res.json({
      success: true,
      data: wallet,
    });
  } catch (error) {
    logger.error("Error getting wallet", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const getWalletBalance = async (req, res) => {
  logger.info("Get Wallet Balance endpoint hit");

  try {
    const wallet = await Wallet.findById(req.params.id);

    if (!wallet) {
      logger.warn("Wallet not found");

      return res.status(404).json({
        success: false,
        message: "Wallet not found",
      });
    }

    const balance = await getBalance(wallet._id);

    return res.json({
      success: true,
      data: {
        ...wallet.toObject(),
        balance,
      },
    });
  } catch (error) {
    logger.error("Error getting wallet", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

module.exports = {
  createWallet,
  getWallet,
  getWalletBalance,
};
