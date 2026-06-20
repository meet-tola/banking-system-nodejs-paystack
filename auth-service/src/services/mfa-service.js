const speakeasy = require("speakeasy");
const QRCode = require("qrcode");

const generateSecret = (email) => {
  return speakeasy.generateSecret({
    name: `SECURE_LEDGER (${email})`,
  });
};

const generateQRCode = async (otpauthUrl) => {
  return await QRCode.toDataURL(otpauthUrl);
};

const verifyTOTP = (secret, token) => {
  return speakeasy.totp.verify({
    secret: secret,
    encoding: "base32",
    token: token,
    window: 2, 
  });
};

module.exports = {
  generateSecret,
  generateQRCode,
  verifyTOTP,
};