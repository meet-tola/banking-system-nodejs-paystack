const User = require("../models/user");
const logger = require("../utils/logger");

const getUserInfo = async (req, res) => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const user = await User.findById(userId).select(
      "-password -mfaSecret -devices",
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    return res.json({
      success: true,
      user,
    });
  } catch (err) {
    logger.error("Get user error", err);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

const searchUsers = async (req, res) => {
  try {
    const { query } = req.query;

    if (!query) {
      return res
        .status(400)
        .json({ success: false, message: "Search query is required" });
    }

    const users = await User.find({
      $or: [
        { fullName: { $regex: query, $options: "i" } },
        { email: { $regex: query, $options: "i" } },
      ],
    }).select("_id fullName email");

    return res.json({
      success: true,
      data: users,
    });
  } catch (err) {
    logger.error("Search users error", err);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

// --- AUTH SERVICE: USER CONTROLLER ---
const getUsersByIds = async (req, res) => {
  try {
    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: "An array of user ids is required",
      });
    }

    const users = await User.find({ _id: { $in: ids } }).select(
      "_id fullName email",
    );

    return res.json({
      success: true,
      data: users,
    });
  } catch (err) {
    logger.error("Get users by IDs error", err);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

module.exports = { getUserInfo, searchUsers, getUsersByIds };
