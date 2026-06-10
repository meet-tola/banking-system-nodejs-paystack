require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});
const logger = require("../utils/logger");

const authenticateRequest = (req, res, next) => {
  const userId = req.headers["x-user-id"];
  const internalToken = req.headers["x-internal-service-token"];
  
  const isInternalService = internalToken && internalToken === process.env.INTERNAL_SERVICE_TOKEN;

  if (userId) {
    req.user = { userId };
    
    if (isInternalService) {
      req.user.role = "INTERNAL_SERVICE";
    }
    
    return next(); 
  }

  if (isInternalService) {
    req.user = { role: "INTERNAL_SERVICE" };
    return next();
  }
  logger.warn(`Access attempted without matching user or cluster credentials on path: ${req.originalUrl}`);
  return res.status(401).json({
    success: false,
    message: "Authentication required! Please login to continue",
  });
};

module.exports = { authenticateRequest };