const axios = require("axios");
const logger = require("./logger");

const lookupIpMetadata = async (ip) => {
  // Local host testing fallback
  if (ip === "127.0.0.1" || ip === "::1" || ip.startsWith("::ffff:127.")) {
    return { city: "Local", country: "Local", asn: "Local" };
  }
  
  try {
    const response = await axios.get(`https://ipinfo.io/${ip}/json?token=${process.env.IPINFO_TOKEN}`, { timeout: 1500 });
    const { city, country, org } = response.data;
    
    // Extract ASN from org string 
    const asn = org ? org.split(" ")[0] : "UNKNOWN";
    
    return { city, country, asn };
  } catch (err) {
    logger.error(`GeoIP lookup failed for ${ip}: ${err.message}`);
    return null;
  }
};

module.exports = { lookupIpMetadata };