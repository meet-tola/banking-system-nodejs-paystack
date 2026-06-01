const speakeasy = require("speakeasy");
const QRCode = require("qrcode");

const generateSecret = (email) => {
  return speakeasy.generateSecret({
    name: `BankingSystem (${email})`,
  });
};

const generateQRCode = async (otpauthUrl) => {
  return await QRCode.toDataURL(otpauthUrl);
};

const verifyTOTP = (token, secret) => {
  return speakeasy.totp.verify({
    secret,
    encoding: "base32",
    token,
  });
};

module.exports = {
  generateSecret,
  generateQRCode,
  verifyTOTP,
};