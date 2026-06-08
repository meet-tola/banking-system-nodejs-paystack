const Wallet = require("../models/wallet");
const logger = require("../utils/logger");
const { getBalance } = require("../services/ledger-service");
const { searchUsers } = require("../services/user-search-service");

// Create Wallet
const createWallet = async (req, res) => {
  logger.info("Create Wallet endpoint hit");

  try {
    // Generate account number
    const accountNumber = Math.floor(
      1000000000 + Math.random() * 9000000000,
    ).toString();

    const wallet = new Wallet({
      user: req.user.userId,
      accountNumber,
    });

    await wallet.save();
    logger.info("Wallet created successfully");

    return res.status(201).json({ wallet });
  } catch (error) {
    logger.error("Error creating wallet", error);
    return res.status(500).json({
      success: false,
      message: "Error creating wallet",
    });
  }
};

const getWallet = async (req, res) => {
  logger.info("Get Wallet endpoint hit (Secure User Lookup)");

  try {
    // Securely pull the wallet belonging to the logged-in user
    const wallet = await Wallet.findOne({ user: req.user.userId });

    if (!wallet) {
      logger.warn(`Wallet not found for user: ${req.user.userId}`);
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
      message: "Internal server error",
    });
  }
};

const getWalletBalance = async (req, res) => {
  logger.info("Get Wallet Balance endpoint hit (Secure User Lookup)");

  try {
    const wallet = await Wallet.findOne({ user: req.user.userId });

    if (!wallet) {
      logger.warn(`Wallet not found for balance check, user: ${req.user.userId}`);
      return res.status(404).json({
        success: false,
        message: "Wallet not found",
      });
    }

    // 2. Pass the internal wallet database _id safely to your ledger service
    const balance = await getBalance(wallet._id);

    return res.json({
      success: true,
      data: {
        ...wallet.toObject(),
        balance,
      },
    });
  } catch (error) {
    logger.error("Error getting wallet balance", error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const getWalletByAccount = async (req, res) => {
  logger.info("Get Wallet by Account Number endpoint hit");

  try {
    const { accountNumber } = req.params;

    const wallet = await Wallet.findOne({ accountNumber });

    if (!wallet) {
      logger.warn(`Wallet with account number ${accountNumber} not found`);
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
    logger.error("Error getting wallet by account", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

const autocompleteSearch = async (req, res) => {
  logger.info("Wallet autocomplete search initiated");

  try {
    const { query } = req.query;
    if (!query) {
      return res.status(400).json({ success: false, message: "Query string is required" });
    }

    let dynamicUserMap = new Map();
    let wallets = [];

    // Check if input query is number
    const isNumericString = /^\d+$/.test(query);

    if (isNumericString) {
      wallets = await Wallet.find({
        accountNumber: { $regex: query, $options: "i" }
      });

      const userIdsToFetch = wallets.map(w => w.user.toString());

      if (userIdsToFetch.length > 0) {
        try {
          const userResponse = await fetchUsersByIds(userIdsToFetch);
          if (userResponse.data && userResponse.data.success) {
            userResponse.data.data.forEach(user => {
              dynamicUserMap.set(user._id.toString(), user);
            });
          }
        } catch (err) {
          logger.error("Failed to get user info for account number matches", err);
        }
      }

    } else {
      let userIdsToFetchWallets = [];

      try {
        const userResponse = await searchUsers(query);

        if (userResponse.data && userResponse.data.success) {
          userResponse.data.data.forEach(user => {
            dynamicUserMap.set(user._id.toString(), user);
            userIdsToFetchWallets.push(user._id);
          });
        }
      } catch (error) {
        logger.error("Failed to fetch name matches from User Service", error);
      }

      if (userIdsToFetchWallets.length > 0) {
        wallets = await Wallet.find({ user: { $in: userIdsToFetchWallets } });
      }
    }

    const results = wallets.map(wallet => {
      const correlatedUser = dynamicUserMap.get(wallet.user.toString());
      return {
        accountNumber: wallet.accountNumber,
        fullName: correlatedUser ? correlatedUser.fullName : "System User", 
        email: correlatedUser ? correlatedUser.email : "",
        status: wallet.status
      };
    });

    return res.json({
      success: true,
      count: results.length,
      data: results,
    });
  } catch (error) {
    logger.error("Autocomplete aggregation engine failed", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};



module.exports = {
  createWallet,
  getWallet,
  getWalletBalance,
  getWalletByAccount,
  autocompleteSearch,
};
