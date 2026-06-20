require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});

const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const User = require("../models/user");
const RefreshToken = require("../models/refresh-token");
const redis = require("../config/redis");
const logger = require("../utils/logger");
const generateToken = require("../utils/generate-token");
const { validateRegistration, validateLogin } = require("../utils/validation");
const { sendOtpEmail } = require("../services/email-service");
const {
  calculateRisk,
  generateOtp,
  getDeviceAndLocation,
} = require("../utils/auth-utils");
const { v4: uuidv4 } = require("uuid");
const { publishEvent } = require("../utils/kafka-producer");

// REGISTER
const registerUser = async (req, res) => {
  logger.info("Register endpoint hit");

  try {
    const { error } = validateRegistration(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        message: error.details[0].message,
      });
    }

    const { fullName, email, password } = req.body;

    const exists = await User.findOne({
      $or: [{ email }, { fullName }],
    });

    if (exists) {
      return res.status(409).json({
        success: false,
        message: "User already exists",
      });
    }

    const user = await User.create({
      fullName,
      email,
      password,
      isVerified: false,
      devices: [],
    });

    const otp = generateOtp();

    await redis.setex(`signup_otp:${user._id}`, 300, otp);
    await sendOtpEmail(email, otp);

    logger.info(`Signup OTP sent: ${user._id}`);

    await publishEvent("user-auth", user._id, {
      eventType: "UserRegistered",
      userId: user._id,
      email: user.email,
      ip: req.ip,
    });

    return res.status(201).json({
      success: true,
      message: "OTP sent to email",
      userId: user._id,
    });
  } catch (err) {
    logger.error("Register error", err);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

// VERIFY SIGNUP OTP
const verifyRegisterOtp = async (req, res) => {
  logger.info("Verify signup OTP hit");

  try {
    const { userId, otp } = req.body;
    const deviceId =
      req.body.deviceId || req.headers["x-device-id"] || uuidv4();

    if (!userId || !otp) {
      return res.status(400).json({
        success: false,
        message: "userId and otp are required",
      });
    }

    const stored = await redis.get(`signup_otp:${userId}`);

    if (!stored || stored.trim() !== otp.trim()) {
      return res.status(400).json({
        success: false,
        message: "Invalid OTP",
      });
    }

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    user.isVerified = true;
    const userAgent = req.headers["user-agent"];

    user.devices = user.devices || [];
    const deviceExists = user.devices.some((d) => d.deviceId === deviceId);
    if (!deviceExists) {
      user.devices.push({
        deviceId,
        ip: req.ip,
        userAgent,
        createdAt: new Date(),
      });
    }

    await user.save();
    await redis.del(`signup_otp:${userId}`);

    await generateToken(user, deviceId, req.ip, userAgent, res);

    return res.json({
      success: true,
      message: "Account verified successfully",
    });
  } catch (err) {
    logger.error("Verify signup OTP error", err);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

// RESEND SIGNUP OTP
const resendRegisterOtp = async (req, res) => {
  const { email } = req.body;
  const user = await User.findOne({ email });

  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }

  if (user.isVerified) {
    return res.status(400).json({ message: "User already verified" });
  }

  const otp = generateOtp();
  await redis.setex(`signup_otp:${user._id}`, 300, otp);
  await sendOtpEmail(user.email, otp);

  return res.json({
    success: true,
    message: "Signup OTP resent",
  });
};

// LOGIN
const loginUser = async (req, res) => {
  logger.info("Login endpoint hit");

  try {
    const { error } = validateLogin(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        message: error.details[0].message,
      });
    }

    const { email, password } = req.body;
    const user = await User.findOne({ email });

    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    if (!user.isVerified) {
      return res.status(403).json({
        success: false,
        message: "Verify your account first",
      });
    }

    const deviceId = req.headers["x-device-id"];
    const userAgent = req.headers["user-agent"];

    if (!deviceId) {
      return res
        .status(400)
        .json({ success: false, message: "Device ID required" });
    }

    user.devices = user.devices || [];
    const isNewDevice = !user.devices.some((d) => d.deviceId === deviceId);

    const risk = calculateRisk({ user, deviceId, ip: req.ip });
    logger.info(`Risk score: ${risk}, Is New Device: ${isNewDevice}`);

    if (risk >= 80) {
      return res
        .status(403)
        .json({ success: false, message: "Suspicious login blocked" });
    }

    // CHECK TRIGGERS: Hardware App MFA, Elevated risk score, or Unrecognized device signatures
    if (user.mfaEnabled || (risk > 30 && risk < 80) || isNewDevice) {
      let challengeToken = null;
      let targetQuestionId = null;
      let securityQuestionRequired = false;

      // Intercept: Only force security question confirmation loops if logging in on an unrecognized device
      if (
        isNewDevice &&
        user.securityChallenges?.isConfigured &&
        user.securityChallenges.questionPool.length > 0
      ) {
        securityQuestionRequired = true;

        const randomChallenge =
          user.securityChallenges.questionPool[
            Math.floor(
              Math.random() * user.securityChallenges.questionPool.length,
            )
          ];
        targetQuestionId = randomChallenge.questionId;

        challengeToken = jwt.sign(
          {
            userId: user._id,
            deviceId,
            questionId: targetQuestionId,
            stage: "SECURITY_QUESTION_PENDING",
          },
          process.env.JWT_SECRET,
          { expiresIn: "10m" },
        );
      }

      // Generate the standard intermediate state tracking token
      const mfaToken = jwt.sign(
        { userId: user._id, deviceId, stage: "MFA_PENDING" },
        process.env.JWT_SECRET,
        { expiresIn: "10m" },
      );

      if (user.mfaEnabled) {
        logger.info(
          `Redirecting user ${user._id} to standard App Authenticator challenge input view.`,
        );
        return res.json({
          success: true,
          mfaRequired: true,
          mfaType: "authenticator_app",
          mfaToken,
          userId: user._id,
          securityQuestionRequired,
          challengeToken,
          questionId: targetQuestionId,
          message:
            "Please enter the 6-digit verification code from your Authenticator App.",
        });
      }

      const otp = generateOtp();
      await redis.setex(`login_otp:${user._id}`, 300, otp);

      sendOtpEmail(user.email, otp, {
        isNewDevice,
        deviceName: await getDeviceAndLocation(req).then((d) => d.deviceName),
        locationStr: await getDeviceAndLocation(req).then((d) => d.locationStr),
        userId: user._id,
        challengeToken,
      }).catch((emailErr) => {
        logger.error(
          `[Background Email Worker Failure] Failed to deliver MFA OTP:`,
          emailErr.message,
        );
      });

      return res.json({
        success: true,
        mfaRequired: true,
        mfaType: "email_otp",
        mfaToken,
        userId: user._id,
        securityQuestionRequired,
        challengeToken,
        questionId: targetQuestionId,
        message:
          "New device signature detected. Check your email inbox for a verification code.",
      });
    }

    await generateToken(user, deviceId, req.ip, userAgent, res);
    logger.info(`Direct path login success for user: ${user._id}`);

    await publishEvent("user-auth", user._id, {
      eventType: "UserLoggedIn",
      payload: { userId: user._id, email: user.email },
      context: { ip: req.ip, deviceId, userAgent },
    });

    return res.json({
      success: true,
      user: { id: user._id, email: user.email },
    });
  } catch (err) {
    logger.error("Login error", err);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

// VERIFY LOGIN OTP
const verifyLoginOtp = async (req, res) => {
  logger.info("Verify login OTP hit");

  try {
    const { userId, otp } = req.body;
    const deviceId = req.body.deviceId || req.headers["x-device-id"];

    if (!userId || !otp || !deviceId) {
      return res.status(400).json({
        success: false,
        message: "userId, otp and deviceId are required",
      });
    }

    const stored = await redis.get(`login_otp:${userId}`);

    if (!stored || stored.trim() !== otp.trim()) {
      return res.status(400).json({
        success: false,
        message: "Invalid OTP",
      });
    }

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

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

    user.lastLoginIp = req.ip;
    await user.save();
    await redis.del(`login_otp:${userId}`);

    await generateToken(user, deviceId, req.ip, req.headers["user-agent"], res);

    return res.json({
      success: true,
      deviceId,
      user: {
        id: user._id,
        email: user.email,
      },
    });
  } catch (err) {
    logger.error("Verify login OTP error", err);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

// RESEND LOGIN OTP
const resendLoginOtp = async (req, res) => {
  logger.info("Resend login OTP hit");

  try {
    const { mfaToken } = req.body;
    if (!mfaToken) {
      return res
        .status(400)
        .json({ success: false, message: "mfaToken required" });
    }

    const decoded = jwt.verify(mfaToken, process.env.JWT_SECRET);
    if (decoded.stage !== "MFA_PENDING") {
      return res
        .status(403)
        .json({ success: false, message: "Invalid MFA stage" });
    }

    const user = await User.findById(decoded.userId);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    const otp = generateOtp();
    await redis.setex(`login_otp:${user._id}`, 300, otp);
    await sendOtpEmail(user.email, otp);

    logger.info(`Resent MFA OTP: ${user._id}`);

    return res.json({
      success: true,
      message: "OTP resent",
    });
  } catch (err) {
    logger.error("Resend OTP error", err);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};

// REFRESH TOKEN
const refreshTokenUser = async (req, res) => {
  logger.info("Refresh token endpoint hit");

  try {
    const refreshToken = req.cookies.refreshToken || req.body.refreshToken;

    if (!refreshToken) {
      return res
        .status(401)
        .json({ success: false, message: "Refresh token missing" });
    }

    const storedToken = await RefreshToken.findOne({ token: refreshToken });

    if (!storedToken) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid refresh token" });
    }

    if (storedToken.expiresAt < new Date()) {
      await RefreshToken.deleteOne({ _id: storedToken._id });
      return res
        .status(401)
        .json({ success: false, message: "Refresh token expired" });
    }

    const user = await User.findById(storedToken.user);

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    const deviceId = req.headers["x-device-id"] || storedToken.deviceId;
    const userAgent = req.headers["user-agent"] || storedToken.userAgent;

    await RefreshToken.deleteOne({ _id: storedToken._id });

    await generateToken(user, deviceId, req.ip, userAgent, res);

    return res.status(200).json({
      success: true,
      message: "Session tokens refreshed successfully.",
    });
  } catch (error) {
    logger.error("Refresh token error", error);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};

// LOGOUT
const logoutUser = async (req, res) => {
  try {
    const refreshToken = req.cookies.refreshToken || req.body.refreshToken;

    if (refreshToken) {
      await RefreshToken.deleteOne({ token: refreshToken });
    }
    res.clearCookie("accessToken");
    res.clearCookie("refreshToken");

    return res.json({
      success: true,
      message: "Logged out",
    });
  } catch (err) {
    logger.error("Logout error", err);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};

// LOGOUT ALL DEVICES
const logoutAllDevices = async (req, res) => {
  try {
    if (!req.user?.userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const user = await User.findById(req.user.userId);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    user.devices = [];
    await user.save();

    await RefreshToken.deleteMany({ user: user._id });

    res.clearCookie("accessToken");
    res.clearCookie("refreshToken");

    return res.json({
      success: true,
      message: "Logged out all devices",
    });
  } catch (err) {
    logger.error("Logout all error", err);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};

// IN-APP SECURITY QUESTION CHALLENGE
const initiateInAppChallenge = async (req, res) => {
  try {
    const userId = req.user?.userId;
    const user = await User.findById(userId);

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    // Intercept: If no challenges are configured, bypass challenge requirement natively
    if (
      !user.securityChallenges?.isConfigured ||
      user.securityChallenges.questionPool.length === 0
    ) {
      return res.json({
        success: true,
        challengeRequired: false,
        message: "No challenge configurations detected. Proceed directly.",
      });
    }

    // Pull a random question profile out of the collection baseline
    const randomChallenge =
      user.securityChallenges.questionPool[
        Math.floor(Math.random() * user.securityChallenges.questionPool.length)
      ];

    const challengeToken = jwt.sign(
      {
        userId: user._id,
        questionId: randomChallenge.questionId,
        stage: "IN_APP_PASSWORD_CHANGE_PENDING",
      },
      process.env.JWT_SECRET,
      { expiresIn: "5m" },
    );

    return res.json({
      success: true,
      challengeRequired: true,
      challengeToken,
      questionId: randomChallenge.questionId,
      message: "Security confirmation parameter required.",
    });
  } catch (err) {
    logger.error("Initiate in-app challenge error", err);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};

// VERIFY IN-APP CHALLENGE ANSWER
const verifyInAppChallenge = async (req, res) => {
  try {
    const userId = req.user?.userId;
    const { challengeToken, answer } = req.body;

    if (!challengeToken || !answer) {
      return res.status(400).json({
        success: false,
        message: "challengeToken and answer are required",
      });
    }

    const decoded = jwt.verify(challengeToken, process.env.JWT_SECRET);
    if (
      decoded.stage !== "IN_APP_PASSWORD_CHANGE_PENDING" ||
      decoded.userId !== userId
    ) {
      return res.status(403).json({
        success: false,
        message: "Invalid challenge window session context",
      });
    }

    const user = await User.findById(userId);
    const activeQuestion = user.securityChallenges.questionPool.find(
      (q) => q.questionId === decoded.questionId,
    );

    const normalizedAnswer = answer.trim().toLowerCase();
    const isValid = await bcrypt.compare(
      normalizedAnswer,
      activeQuestion.answerHash,
    );

    if (!isValid) {
      return res.status(401).json({
        success: false,
        message: "Incorrect security challenge answer verification",
      });
    }

    // Issue an escalation token authorizing the modification inside the controller threshold
    const criticalActionToken = jwt.sign(
      { userId: user._id, stage: "PASSWORD_CHANGE_APPROVED" },
      process.env.JWT_SECRET,
      { expiresIn: "3m" },
    );

    return res.json({
      success: true,
      criticalActionToken,
      message: "Security confirmation approved. Proceed to change password.",
    });
  } catch (err) {
    logger.error("Verify in-app challenge validation failure", err);
    return res.status(401).json({
      success: false,
      message: "Challenge evaluation expired or invalid",
    });
  }
};

// CHANGE PASSWORD (IN-APP)
const changePassword = async (req, res) => {
  logger.info("Change password endpoint hit");

  try {
    const userId = req.user?.userId;
    const { currentPassword, newPassword, criticalActionToken } = req.body;

    if (!userId || !currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Current password and new password are required",
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    // Enforce Interception check if security questions are active baseline records
    if (
      user.securityChallenges?.isConfigured &&
      user.securityChallenges.questionPool.length > 0
    ) {
      if (!criticalActionToken) {
        return res.status(403).json({
          success: false,
          code: "SECURITY_CHALLENGE_REQUIRED",
          message:
            "Action rejected. Complete security verification layer first.",
        });
      }

      try {
        const decoded = jwt.verify(criticalActionToken, process.env.JWT_SECRET);
        if (
          decoded.stage !== "PASSWORD_CHANGE_APPROVED" ||
          decoded.userId !== userId
        ) {
          return res.status(403).json({
            success: false,
            message: "Unauthorized critical alteration matrix window",
          });
        }
      } catch (tokenErr) {
        return res.status(403).json({
          success: false,
          message: "Verification lifecycle expired. Restart verification.",
        });
      }
    }

    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res
        .status(401)
        .json({ success: false, message: "Incorrect current password" });
    }

    user.password = newPassword;
    await user.save();

    logger.info(`Password changed successfully for user: ${userId}`);

    await publishEvent("user-auth", userId, {
      eventType: "PasswordChanged",
      userId,
      context: { ip: req.ip, userAgent: req.headers["user-agent"] },
    });

    return res.json({
      success: true,
      message: "Password updated successfully",
    });
  } catch (err) {
    logger.error("Change password error", err);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};

// RESET PASSWORD (OUT-OF-APP LINK FLOW VIA OTP)
const resetPassword = async (req, res) => {
  logger.info("Reset password endpoint hit");

  try {
    const { userId, otp, newPassword, challengeToken, challengeAnswer } =
      req.body;

    if (!userId || !otp || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "userId, otp, and newPassword are required",
      });
    }

    const storedOtp = await redis.get(`reset_otp:${userId}`);
    if (!storedOtp || storedOtp.trim() !== otp.trim()) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired reset OTP",
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    // Intercept: If security questions are active, demand answer alongside the email OTP link execution
    if (
      user.securityChallenges?.isConfigured &&
      user.securityChallenges.questionPool.length > 0
    ) {
      if (!challengeToken || !challengeAnswer) {
        // If frontend didn't pass a challengeToken yet, issue one using the verified context of the OTP input
        const randomChallenge =
          user.securityChallenges.questionPool[
            Math.floor(
              Math.random() * user.securityChallenges.questionPool.length,
            )
          ];

        const token = jwt.sign(
          {
            userId: user._id,
            questionId: randomChallenge.questionId,
            stage: "RESET_LINK_CHALLENGE_PENDING",
          },
          process.env.JWT_SECRET,
          { expiresIn: "5m" },
        );

        return res.status(200).json({
          success: false,
          securityChallengeRequired: true,
          challengeToken: token,
          questionId: randomChallenge.questionId,
          message:
            "Email identity validated. Verification profile challenge needed to complete reset execution.",
        });
      }

      // If tokens are present, execute atomic parsing verification
      try {
        const decoded = jwt.verify(challengeToken, process.env.JWT_SECRET);
        if (
          decoded.stage !== "RESET_LINK_CHALLENGE_PENDING" ||
          decoded.userId !== userId
        ) {
          return res.status(403).json({
            success: false,
            message: "Invalid verification tracking token allocation",
          });
        }

        const targetQuestion = user.securityChallenges.questionPool.find(
          (q) => q.questionId === decoded.questionId,
        );
        const normalizedAnswer = challengeAnswer.trim().toLowerCase();
        const isQuestionValid = await bcrypt.compare(
          normalizedAnswer,
          targetQuestion.answerHash,
        );

        if (!isQuestionValid) {
          return res.status(401).json({
            success: false,
            message: "Security confirmation tracking mismatched parameter.",
          });
        }
      } catch (jwtErr) {
        return res.status(401).json({
          success: false,
          message:
            "Verification profile window expired. Please re-trigger process from link.",
        });
      }
    }

    user.password = newPassword;
    await user.save();

    await redis.del(`reset_otp:${userId}`);

    logger.info(`Password reset successfully via OTP for user: ${userId}`);

    await publishEvent("user-auth", userId, {
      eventType: "PasswordReset",
      userId,
      context: { ip: req.ip, userAgent: req.headers["user-agent"] },
    });

    return res.json({
      success: true,
      message:
        "Password reset successful. You can now log in with your new password.",
    });
  } catch (err) {
    logger.error("Reset password error", err);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};

// VERIFY DEVICE SECURITY QUESTIONS (USED FOR LOGINS)
const verifySecurityChallenge = async (req, res) => {
  const { challengeToken, answer } = req.body;

  try {
    const decoded = jwt.verify(challengeToken, process.env.JWT_SECRET);
    if (decoded.stage !== "SECURITY_QUESTION_PENDING") {
      return res
        .status(403)
        .json({ success: false, message: "Invalid challenge window" });
    }

    const user = await User.findById(decoded.userId);
    const activeQuestion = user.securityChallenges.questionPool.find(
      (q) => q.questionId === decoded.questionId,
    );

    const normalizedAnswer = answer.trim().toLowerCase();
    const isValid = await bcrypt.compare(
      normalizedAnswer,
      activeQuestion.answerHash,
    );

    if (!isValid) {
      return res
        .status(401)
        .json({ success: false, message: "Incorrect security answer" });
    }

    user.devices = user.devices || [];
    user.devices.push({
      deviceId: decoded.deviceId,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
      createdAt: new Date(),
    });
    await user.save();

    await generateToken(
      user,
      decoded.deviceId,
      req.ip,
      req.headers["user-agent"],
      res,
    );

    return res.json({
      success: true,
      message: "Device successfully authorized",
    });
  } catch (err) {
    return res
      .status(401)
      .json({ success: false, message: "Session expired or invalid" });
  }
};

module.exports = {
  registerUser,
  loginUser,
  verifyRegisterOtp,
  verifyLoginOtp,
  refreshTokenUser,
  logoutUser,
  logoutAllDevices,
  resendLoginOtp,
  resendRegisterOtp,
  initiateInAppChallenge,
  verifyInAppChallenge,
  changePassword,
  resetPassword,
  verifySecurityChallenge,
};
