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

    const user = await User.findById(userId);

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

module.exports = { getUserInfo };
