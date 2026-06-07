require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});

const jwt = require("jsonwebtoken");

const User = require("../models/user");
const RefreshToken = require("../models/refresh-token");

const redis = require("../config/redis");
const logger = require("../utils/logger");

const generateToken = require("../utils/generate-token");

const { validateRegistration, validateLogin } = require("../utils/validation");

const { sendOtpEmail } = require("../services/email-service");

const { calculateRisk, generateOtp } = require("../utils/auth-utils");

const { v4: uuidv4 } = require("uuid");

// Require Kafka producer to pipeline state to fraud context
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

    // Emit 'UserRegistered' to construct local Fraud Profile read-model
    await publishEvent("user-auth", user._id, {
      eventType: "UserRegistered",
      userId: user._id,
      email: user.email,
      ip: req.ip
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

    const deviceId = uuidv4();
    const userAgent = req.headers["user-agent"];

    user.devices = user.devices || [];

    user.devices.push({
      deviceId,
      ip: req.ip,
      userAgent,
      createdAt: new Date(),
    });

    await user.save();
    await redis.del(`signup_otp:${userId}`);

    const tokens = await generateToken(user, deviceId, req.ip, userAgent);

    return res.json({
      success: true,
      message: "Account verified successfully",
      ...tokens,
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
    return res.status(400).json({
      message: "User already verified",
    });
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
      return res.status(400).json({
        success: false,
        message: "Device ID required",
      });
    }

    const risk = calculateRisk({
      user,
      deviceId,
      ip: req.ip,
    });

    logger.info(`Risk score: ${risk}`);

    // Check High risk
    if (risk >= 80) {
      return res.status(403).json({
        success: false,
        message: "Suspicious login blocked",
      });
    }

    const otp = generateOtp();

    // MFA is required
    if (user.mfaEnabled || (risk > 30 && risk < 80)) {
      const mfaToken = jwt.sign(
        {
          userId: user._id,
          deviceId,
          stage: "MFA_PENDING",
        },
        process.env.JWT_SECRET,
        { expiresIn: "10m" },
      );

      await redis.setex(`login_otp:${user._id}`, 300, otp);
      await sendOtpEmail(user.email, otp);

      return res.json({
        success: true,
        mfaRequired: true,
        mfaToken,
        userId: user._id,
        message: "MFA OTP sent",
      });
    }

    // Check Low risk login
    const tokens = await generateToken(user, deviceId, req.ip, userAgent);

    logger.info(`Login success: ${user._id}`);

    // Emit 'UserLoggedIn' directly to trigger device & IP geolocation risk verification loops
    await publishEvent("user-auth", user._id, {
      eventType: "UserLoggedIn",
      payload: { userId: user._id, email: user.email },
      context: { ip: req.ip, deviceId, userAgent }
    });

    return res.json({
      success: true,
      ...tokens,
      user: {
        id: user._id,
        email: user.email,
      },
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
    const { userId, otp, deviceId } = req.body;

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

    user.devices.push({
      deviceId,
      ip: req.ip,
      createdAt: new Date(),
    });

    user.lastLoginIp = req.ip;

    await user.save();
    await redis.del(`login_otp:${userId}`);

    const tokens = await generateToken(
      user,
      deviceId,
      req.ip,
      req.headers["user-agent"],
    );

    // Emit 'UserLoggedIn' on successful MFA step conversion
    await publishEvent("user-auth", user._id, {
      eventType: "UserLoggedIn",
      payload: { userId: user._id, email: user.email },
      context: { ip: req.ip, deviceId, userAgent: req.headers["user-agent"] }
    });

    return res.json({
      success: true,
      ...tokens,
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
      return res.status(400).json({
        success: false,
        message: "mfaToken required",
      });
    }

    // verify MFA token
    const decoded = jwt.verify(mfaToken, process.env.JWT_SECRET);

    if (decoded.stage !== "MFA_PENDING") {
      return res.status(403).json({
        success: false,
        message: "Invalid MFA stage",
      });
    }

    const user = await User.findById(decoded.userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // generate new OTP
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

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

// REFRESH TOKEN
const refreshTokenUser = async (req, res) => {
  logger.info("Refresh token endpoint hit");

  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(401).json({
        success: false,
        message: "Refresh token missing",
      });
    }

    const storedToken = await RefreshToken.findOne({ token: refreshToken });

    if (!storedToken) {
      return res.status(401).json({
        success: false,
        message: "Invalid refresh token",
      });
    }

    if (storedToken.expiresAt < new Date()) {
      await RefreshToken.deleteOne({ _id: storedToken._id });

      return res.status(401).json({
        success: false,
        message: "Refresh token expired",
      });
    }

    const user = await User.findById(storedToken.user);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const { accessToken, refreshToken: newRefreshToken } =
      await generateToken(user);

    await RefreshToken.deleteOne({ _id: storedToken._id });

    return res.status(200).json({
      success: true,
      accessToken,
      refreshToken: newRefreshToken,
    });
  } catch (error) {
    logger.error("Refresh token error", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

// LOGOUT
const logoutUser = async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        message: "Refresh token required",
      });
    }

    await RefreshToken.deleteOne({ token: refreshToken });

    return res.json({
      success: true,
      message: "Logged out",
    });
  } catch (err) {
    logger.error("Logout error", err);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

// LOGOUT ALL DEVICES
const logoutAllDevices = async (req, res) => {
  try {
    if (!req.user?.userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const user = await User.findById(req.user.userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    user.devices = [];
    await user.save();

    await RefreshToken.deleteMany({ user: user._id });

    return res.json({
      success: true,
      message: "Logged out all devices",
    });
  } catch (err) {
    logger.error("Logout all error", err);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};


const changePasswordSimulation = async (req, res) => {
  try {
    const { userId } = req.body;
    
    // Broadcast 'PasswordChanged' event sequence to trigger the fraud chaining rule
    await publishEvent("user-auth", userId, {
      eventType: "PasswordChanged",
      userId
    });

    return res.json({ success: true, message: "Password updated successfully" });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
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
  changePasswordSimulation
};