const User = require("../models/user");
const redis = require("../config/redis");
const logger = require("../utils/logger");

const { getOtp, deleteOtp } = require("../services/otp-service");
const {
  generateSecret,
  generateQRCode,
  verifyTOTP,
} = require("../services/mfa-service");

const generateToken = require("../utils/generate-token");


// -ENABLE MFA
const enableMfa = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const secret = generateSecret(user.email);

    user.mfaSecret = secret.base32;
    user.mfaEnabled = true;

    await user.save();

    const qr = await generateQRCode(secret.otpauth_url);

    return res.json({
      message: "MFA enabled",
      qrCode: qr,
    });
  } catch (err) {
    logger.error("enableMfa error", err);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

// DISABLE MFA
const disableMfa = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    user.mfaEnabled = false;
    user.mfaSecret = null;

    await user.save();

    return res.json({
      message: "MFA disabled",
    });
  } catch (err) {
    logger.error("disableMfa error", err);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

// MFA LOGIN VERIFY
const verifyMfaLogin = async (req, res) => {
  try {
    logger.info("MFA verify hit");

    const { otp } = req.body;
    const userId = req.user.userId;

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Check for TOTP
    const isValid = verifyTOTP(user.mfaSecret, otp);

    if (!isValid) {
      return res.status(400).json({
        success: false,
        message: "Invalid MFA code",
      });
    }

    const tokens = await generateToken(user);

    logger.info(`MFA success: ${userId}`);

    return res.json({
      success: true,
      ...tokens,
    });
  } catch (err) {
    logger.error("MFA verify error", err);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

module.exports = {
  verifyMfaLogin,
  enableMfa,
  disableMfa,
};
