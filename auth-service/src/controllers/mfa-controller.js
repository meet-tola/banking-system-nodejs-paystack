const User = require("../models/user");
const redis = require("../config/redis");
const logger = require("../utils/logger");
const bcrypt = require("bcrypt");

const { getOtp, deleteOtp } = require("../services/otp-service");
const {
  generateSecret,
  generateQRCode,
  verifyTOTP,
} = require("../services/mfa-service");

const generateToken = require("../utils/generate-token");

// SETUP SECURITY QUESTIONS
const setupSecurityQuestions = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { questions } = req.body; 

    if (!questions || !Array.isArray(questions) || questions.length === 0) {
      return res.status(400).json({
        success: false,
        message: "A structural array of questions and answers is required.",
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    // Process and hash each answer parameters dynamically
    const processedPool = [];
    for (const q of questions) {
      if (!q.questionId || !q.answer) {
        return res.status(400).json({
          success: false,
          message: "Each challenge entry must include a questionId and an answer.",
        });
      }

      // Normalize string variations to prevent casing validation issues later
      const normalizedAnswer = q.answer.trim().toLowerCase();
      const answerHash = await bcrypt.hash(normalizedAnswer, 12);

      processedPool.push({
        questionId: q.questionId,
        answerHash,
      });
    }

    // Overwrite baseline array and flip activation constraint toggle
    user.securityChallenges = {
      questionPool: processedPool,
      isConfigured: true,
    };

    await user.save();
    logger.info(`Security question profile updated successfully for actor identity: ${userId}`);

    return res.json({
      success: true,
      message: "Security questions configured successfully.",
    });
  } catch (err) {
    logger.error("setupSecurityQuestions error", err);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

// ENABLE MFA (TOTP)
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

    user.tempMfaSecret = secret.base32;
    await user.save();

    // Generate the standard Base64 QR matrix for app scanning
    const qr = await generateQRCode(secret.otpauth_url);

    return res.json({
      success: true,
      message: "MFA registration successfully.",
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

// VERIFY MFA LOGIN 
const verifyMfaLogin = async (req, res) => {
  try {
    logger.info("MFA Authenticator verification hit");

    const { otp, userId } = req.body;
        
    // Extract deviceId dynamically: try request body, fallback to matching request headers
    const deviceId = req.body.deviceId || req.headers["x-device-id"];

    if (!userId || !otp) {
      return res.status(400).json({
        success: false,
        message: "Identification credentials and verification token are required.",
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const isSetupPhase = !user.mfaEnabled && user.tempMfaSecret;
    const activeSecret = isSetupPhase ? user.tempMfaSecret : user.mfaSecret;

    if (!activeSecret) {
      return res.status(400).json({
        success: false,
        message: "No active multi-factor configuration parameter mapped on this profile.",
      });
    }

    // Validate token against our TOTP engine
    const isValid = verifyTOTP(activeSecret, otp);
    if (!isValid) {
      logger.warn(`[MFA Token Mismatch] Incorrect passcode token submitted for user: ${user._id}`);
      return res.status(400).json({
        success: false,
        message: "Invalid code profile configuration string.",
      });
    }

    if (isSetupPhase) {
      user.mfaSecret = user.tempMfaSecret;
      user.tempMfaSecret = null;
      user.mfaEnabled = true; 
      logger.info(`[MFA Configuration Committed] Hardware TOTP permanently initialized for user: ${user._id}`);
    }

    if (deviceId) {
      user.devices = user.devices || [];
      const deviceExists = user.devices.some((d) => d.deviceId === deviceId);
      if (!deviceExists) {
        user.devices.push({
          deviceId,
          ip: req.ip,
          userAgent: req.headers["user-agent"],
          createdAt: new Date(),
        });
      }
    } else {
      logger.warn(`Verification processed without explicit Device ID parameters for user: ${user._id}`);
    }

    user.lastLoginIp = req.ip;
    await user.save();

    await generateToken(user, deviceId || "hardware-token-node", req.ip, req.headers["user-agent"], res);

    logger.info(`[Authentication Complete] Multi-factor login check approved for user: ${user._id}`);

    return res.json({
      success: true,
      message: "Authenticator challenge authorized successfully.",
      user: {
        id: user._id,
        email: user.email,
      },
    });
  } catch (err) {
    logger.error("MFA verify error exception", err);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

module.exports = {
  setupSecurityQuestions,
  verifyMfaLogin,
  enableMfa,
  disableMfa,
};