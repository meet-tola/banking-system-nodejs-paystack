const bcrypt = require("bcrypt");
const Wallet = require("../models/wallet");
const logger = require("../utils/logger");
const { getBalance } = require("../services/ledger-service");
const { searchUsers } = require("../services/user-search-service");

// Create Wallet
const createWallet = async (req, res) => {
  try {
    let accountNumber = Math.floor(
      1000000000 + Math.random() * 9000000000,
    ).toString();

    let wallet;
    try {
      wallet = new Wallet({
        user: req.user.userId,
        accountNumber,
      });
      await wallet.save();
    } catch (dbError) {
      if (dbError.code === 11000) {
        logger.warn(
          "Account collision caught. Re-generating alternative ledger account index...",
        );
        accountNumber = Math.floor(
          1000000000 + Math.random() * 9000000000,
        ).toString();
        wallet = new Wallet({ user: req.user.userId, accountNumber });
        await wallet.save();
      } else {
        throw dbError;
      }
    }

    logger.info(
      `Wallet successfully instantiated for actor user: ${req.user.userId}`,
    );
    return res.status(201).json({ wallet });
  } catch (error) {
    logger.error("Error creating wallet:", error.message);
    return res
      .status(500)
      .json({ success: false, message: "Error creating wallet" });
  }
};

const getWallet = async (req, res) => {
  try {
    const wallet = await Wallet.findOne({ user: req.user.userId }).select(
      "+pin",
    );
    if (!wallet) {
      return res.status(200).json({ success: true, exists: false, data: null });
    }

    const walletObj = wallet.toObject();
    const hasPin = !!walletObj.pin;
    delete walletObj.pin;

    return res.json({
      success: true,
      exists: true,
      data: { ...walletObj, hasPin },
    });
  } catch (error) {
    logger.error(
      `Error querying wallet for user ${req.user.userId}:`,
      error.message,
    );
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};

const getWalletBalance = async (req, res) => {
  try {
    const wallet = await Wallet.findOne({ user: req.user.userId });
    if (!wallet) {
      return res
        .status(404)
        .json({ success: false, message: "Wallet not found" });
    }

    const balance = await getBalance(wallet);

    return res.json({
      success: true,
      data: { ...wallet.toObject(), balance },
    });
  } catch (error) {
    logger.error(
      `Balance matrix lookup exception for user ${req.user.userId}:`,
      error.message,
    );
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};

const getWalletByAccount = async (req, res) => {
  try {
    const { accountNumber } = req.params;
    const wallet = await Wallet.findOne({ accountNumber });

    if (!wallet) {
      return res
        .status(404)
        .json({ success: false, message: "Wallet not found" });
    }

    return res.json({ success: true, data: wallet });
  } catch (error) {
    logger.error(
      `Error searching wallet account parameter ${req.params.accountNumber}:`,
      error.message,
    );
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};

const autocompleteSearch = async (req, res) => {
  try {
    const { query } = req.query;
    const currentUserId = req.user?.userId;

    if (!query) {
      return res
        .status(400)
        .json({ success: false, message: "Query string is required" });
    }

    let dynamicUserMap = new Map();
    let wallets = [];
    const isNumericString = /^\d+$/.test(query);

    if (isNumericString) {
      const matchedWallets = await Wallet.find({
        accountNumber: { $regex: query, $options: "i" },
      });

      wallets = matchedWallets.filter(
        (w) => w.user.toString() !== currentUserId,
      );

      const userIdsToFetch = wallets.map((w) => w.user.toString());

      if (userIdsToFetch.length > 0) {
        try {
          const userResponse = await fetchUsersByIds(userIdsToFetch);
          const userData = userResponse.data?.data || userResponse.data;
          const userSuccess =
            userResponse.data?.success || userResponse.success;

          if (userSuccess && Array.isArray(userData)) {
            userData.forEach((u) => dynamicUserMap.set(u._id.toString(), u));
          }
        } catch (err) {
          logger.error(
            "Autocomplete failed to cross-fetch explicit user account IDs:",
            err.message,
          );
        }
      }
    } else {
      let userIdsToFetchWallets = [];
      try {
        const userResponse = await searchUsers(query);
        const userData = userResponse.data?.data || userResponse.data;
        const userSuccess = userResponse.data?.success || userResponse.success;

        if (userSuccess && Array.isArray(userData)) {
          userData.forEach((u) => {
            const userIdStr = u._id.toString();

            if (userIdStr !== currentUserId) {
              dynamicUserMap.set(userIdStr, u);
              userIdsToFetchWallets.push(u._id);
            }
          });
        }
      } catch (error) {
        logger.error(
          "Autocomplete failed to fetch name index strings from user-service:",
          error.message,
        );
      }

      if (userIdsToFetchWallets.length > 0) {
        wallets = await Wallet.find({ user: { $in: userIdsToFetchWallets } });
      }
    }

    // Map remaining database elements to clean JSON objects
    const results = wallets.map((w) => {
      const correlatedUser = dynamicUserMap.get(w.user.toString());
      return {
        accountNumber: w.accountNumber,
        fullName: correlatedUser
          ? correlatedUser.fullName || correlatedUser.name
          : "System User",
        email: correlatedUser ? correlatedUser.email : "",
        status: w.status,
      };
    });

    return res.json({ success: true, count: results.length, data: results });
  } catch (error) {
    logger.error(
      "Recipient autocomplete core aggregation engine failed:",
      error.message,
    );
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};

const createPin = async (req, res) => {
  try {
    const { pin } = req.body;
    if (!pin || typeof pin !== "string" || !/^\d{4}$/.test(pin)) {
      return res.status(400).json({
        success: false,
        message: "Invalid PIN format. PIN must be exactly 4 digits.",
      });
    }

    const wallet = await Wallet.findOne({ user: req.user.userId });
    if (!wallet) {
      return res
        .status(404)
        .json({ success: false, message: "Wallet not found." });
    }

    if (wallet.pin) {
      return res.status(400).json({
        success: false,
        message: "PIN already set. Use update/reset endpoints instead.",
      });
    }

    wallet.pin = await bcrypt.hash(pin, 10);
    await wallet.save();

    logger.info(
      `PIN successfully assigned to wallet signature mapping: ${wallet._id}`,
    );
    return res
      .status(200)
      .json({ success: true, message: "Wallet PIN created successfully." });
  } catch (error) {
    logger.error(
      `PIN generation failed for user ${req.user.userId}:`,
      error.message,
    );
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};

const updatePin = async (req, res) => {
  try {
    const { oldPin, newPin } = req.body;
    if (!oldPin || !newPin || !/^\d{4}$/.test(newPin)) {
      return res.status(400).json({
        success: false,
        message: "Invalid old or new PIN configuration.",
      });
    }

    const wallet = await Wallet.findOne({ user: req.user.userId }).select(
      "+pin",
    );
    if (!wallet || !wallet.pin) {
      return res
        .status(404)
        .json({ success: false, message: "Wallet or current PIN not found." });
    }

    const isMatch = await bcrypt.compare(oldPin, wallet.pin);
    if (!isMatch) {
      return res
        .status(401)
        .json({ success: false, message: "Incorrect current PIN." });
    }

    wallet.pin = await bcrypt.hash(newPin, 10);
    await wallet.save();

    return res.json({ success: true, message: "PIN updated successfully." });
  } catch (error) {
    logger.error(
      `PIN rotation exception thrown for user ${req.user.userId}:`,
      error.message,
    );
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};

const verifyInternalPin = async (req, res) => {
  try {
    const { accountNumber, pin } = req.body;
    if (!accountNumber || !pin) {
      return res.status(400).json({
        success: false,
        message:
          "Account number and 4-digit signature PIN are mandatory variables.",
      });
    }

    const wallet = await Wallet.findOne({ accountNumber }).select("+pin");
    if (!wallet || !wallet.pin) {
      return res.status(404).json({
        success: false,
        message: "Account number record could not be matched.",
      });
    }

    const isPinValid = await bcrypt.compare(pin, wallet.pin);
    if (!isPinValid) {
      logger.warn(
        `Security check rejection: False PIN signature submitted against account: ${accountNumber}`,
      );
      return res.json({ success: true, valid: false });
    }

    return res.json({ success: true, valid: true });
  } catch (error) {
    logger.error(
      "Fatal exception during internal transaction signing process:",
      error.message,
    );
    return res.status(500).json({
      success: false,
      message: "Internal ledger security module fault.",
    });
  }
};

const toggleWalletFreeze = async (req, res) => {
  try {
    const wallet = await Wallet.findOne({ user: req.user.userId });
    if (!wallet) {
      return res
        .status(404)
        .json({ success: false, message: "Wallet not found." });
    }

    wallet.status = wallet.status === "FROZEN" ? "ACTIVE" : "FROZEN";
    await wallet.save();

    logger.info(
      `Administrative state switch: Wallet ${wallet._id} shifted state to ${wallet.status}`,
    );
    return res.json({
      success: true,
      message: `Wallet has been successfully ${wallet.status.toLowerCase()}.`,
      status: wallet.status,
    });
  } catch (error) {
    logger.error(
      `Freeze action toggle exception for user ${req.user.userId}:`,
      error.message,
    );
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};

module.exports = {
  createWallet,
  getWallet,
  getWalletBalance,
  getWalletByAccount,
  autocompleteSearch,
  createPin,
  updatePin,
  toggleWalletFreeze,
  verifyInternalPin,
};
