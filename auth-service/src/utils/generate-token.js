const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const RefreshToken = require("../models/refresh-token");

const generateToken = async (user) => {
  const accessToken = jwt.sign(
    {
      userId: user._id,
      fullName: user.fullName,
    },
    process.env.JWT_SECRET,
    {
      expiresIn: "60m",
    }
  );

  const refreshTokenValue = crypto
    .randomBytes(40)
    .toString("hex");

  const expiresAt = new Date();

  expiresAt.setDate(expiresAt.getDate() + 7);

  await RefreshToken.create({
    token: refreshTokenValue,
    user: user._id,
    expiresAt,
  });

  return {
    accessToken,
    refreshToken: refreshTokenValue,
  };
};

module.exports = generateToken;