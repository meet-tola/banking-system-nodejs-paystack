const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const RefreshToken = require("../models/refresh-token");

const generateToken = async (user, deviceId, ip, userAgent, res) => {
  const accessToken = jwt.sign(
    {
      userId: user._id,
      fullName: user.fullName,
    },
    process.env.JWT_SECRET,
    { expiresIn: "60m" },
  );

  const refreshTokenValue = crypto.randomBytes(40).toString("hex");

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  await RefreshToken.create({
    token: refreshTokenValue,
    user: user._id,
    deviceId,
    ip,
    userAgent,
    expiresAt,
  });

  if (res) {
    const isProduction = process.env.NODE_ENV === "production";

    res.cookie("accessToken", accessToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: "strict",
      maxAge: 60 * 60 * 1000,
    });

    res.cookie("refreshToken", refreshTokenValue, {
      httpOnly: true,
      secure: isProduction,
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
  }

  return {
    accessToken,
    refreshToken: refreshTokenValue,
  };
};

module.exports = generateToken;
