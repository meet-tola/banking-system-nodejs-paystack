const generateToken = require("./generate-token");

const generateOtp = () =>
  Math.floor(100000 + Math.random() * 900000);

const calculateRisk = ({ user, deviceId, ip }) => {
  let risk = 0;

  const knownDevice = user.devices?.some(
    (d) => d.deviceId === deviceId
  );

  if (!knownDevice) risk += 50;

  if (user.lastLoginIp && user.lastLoginIp !== ip) risk += 20;

  if ((user.devices?.length || 0) > 5) risk += 10;

  return risk;
};

const issueTokens = async (user, generateToken) => {
  return await generateToken(user);
};

module.exports = {
  generateOtp,
  calculateRisk,
  issueTokens,
};