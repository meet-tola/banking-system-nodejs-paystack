const RefreshToken = require("../models/refresh-token");
const User = require("../models/user");

const generateToken = require("../utils/generate-token");
const logger = require("../utils/logger");

const {
  validateRegistration,
  validateLogin,
} = require("../utils/validation");


// REGISTER USER
const registerUser = async (req, res) => {
  logger.info("Registration endpoint hit");

  try {
    // Validate the schema
    const { error } = validateRegistration(req.body);

    if (error) {
      logger.warn("Validation error", error.details[0].message);

      return res.status(400).json({
        success: false,
        message: error.details[0].message,
      });
    }

    const { fullName, email, password } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({
      $or: [{ email }, { fullName }],
    });

    if (existingUser) {
      logger.warn("User already exists");

      return res.status(409).json({
        success: false,
        message: "User already exists",
      });
    }

    // Create user
    const user = new User({
      fullName,
      email,
      password,
    });

    await user.save();

    logger.info(`User created successfully: ${user._id}`);

    // Generate tokens
    const { accessToken, refreshToken } = await generateToken(user);

    return res.status(201).json({
      success: true,
      message: "User registered successfully",
      accessToken,
      refreshToken,
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
      },
    });
  } catch (error) {
    logger.error("Registration error occurred", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};


// LOGIN USER
const loginUser = async (req, res) => {
  logger.info("Login endpoint hit");

  try {
    // Validate request
    const { error } = validateLogin(req.body);

    if (error) {
      logger.warn("Validation error", error.details[0].message);

      return res.status(400).json({
        success: false,
        message: error.details[0].message,
      });
    }

    const { email, password } = req.body;

    // Find user
    const user = await User.findOne({ email });

    if (!user) {
      logger.warn("Invalid email");

      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    // Compare password
    const isMatch = await user.comparePassword(password);

    if (!isMatch) {
      logger.warn("Invalid password");

      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    // Generate tokens
    const { accessToken, refreshToken } = await generateToken(user);

    logger.info(`User logged in: ${user._id}`);

    return res.status(200).json({
      success: true,
      message: "Login successful",
      accessToken,
      refreshToken,
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
      },
    });
  } catch (error) {
    logger.error("Login error occurred", error);

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
      logger.warn("Refresh token missing");

      return res.status(401).json({
        success: false,
        message: "Refresh token missing",
      });
    }

    // Find token in DB
    const storedToken = await RefreshToken.findOne({
      token: refreshToken,
    });

    if (!storedToken) {
      logger.warn("Refresh token not found");

      return res.status(401).json({
        success: false,
        message: "Invalid refresh token",
      });
    }

    // Check expiration
    if (storedToken.expiresAt < new Date()) {
      logger.warn("Refresh token expired");

      // delete expired token
      await RefreshToken.deleteOne({ _id: storedToken._id });

      return res.status(401).json({
        success: false,
        message: "Refresh token expired",
      });
    }

    // Find user
    const user = await User.findById(storedToken.user);

    if (!user) {
      logger.warn("User not found");

      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Generate new tokens
    const {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    } = await generateToken(user);

    // Delete old refresh token
    await RefreshToken.deleteOne({
      _id: storedToken._id,
    });

    logger.info(`Refresh token rotated for user: ${user._id}`);

    return res.status(200).json({
      success: true,
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    });
  } catch (error) {
    logger.error("Refresh token error occurred", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};


// LOGOUT USER
const logoutUser = async (req, res) => {
  logger.info("Logout endpoint hit");

  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      logger.warn("Refresh token missing");

      return res.status(400).json({
        success: false,
        message: "Refresh token missing",
      });
    }

    // Delete refresh token
    await RefreshToken.deleteOne({
      token: refreshToken,
    });

    logger.info("User logged out successfully");

    return res.status(200).json({
      success: true,
      message: "Logged out successfully",
    });
  } catch (error) {
    logger.error("Logout error occurred", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};


module.exports = {
  registerUser,
  loginUser,
  refreshTokenUser,
  logoutUser,
};