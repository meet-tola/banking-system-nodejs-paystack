const UAParser = require("ua-parser-js");
const geoip = require("fast-geoip");

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

const getDeviceAndLocation = async (req) => {
  // Parse User-Agent
  const uaString = req.headers["user-agent"] || "";
  const parser = new UAParser(uaString);
  const uaResult = parser.getResult();

  // Construct device string (e.g., "iPhone", "Windows 10 Chrome")
  const os = uaResult.os.name ? `${uaResult.os.name} ${uaResult.os.version || ""}` : "";
  const browser = uaResult.browser.name || "";
  const deviceModel = uaResult.device.model || "";
  const deviceVendor = uaResult.device.vendor || "";

  let deviceName = "Unknown Device";
  if (deviceVendor || deviceModel) {
    deviceName = `${deviceVendor} ${deviceModel}`.trim();
  } else if (os || browser) {
    deviceName = `${os} (${browser})`.trim();
  }

  // Parse Location from IP
  let locationStr = "Unknown Location";
  const clientIp = req.ip === "::1" || req.ip === "127.0.0.1" ? "8.8.8.8" : req.ip; 
  
  try {
    const geo = await geoip.lookup(clientIp);
    if (geo) {
      locationStr = `${geo.city || "Unknown City"}, ${geo.country}`;
    }
  } catch (err) {
    // Fallback if geoip lookup fails
  }

  return { deviceName, locationStr };
};

module.exports = {
  generateOtp,
  calculateRisk,
  issueTokens,
  getDeviceAndLocation
};