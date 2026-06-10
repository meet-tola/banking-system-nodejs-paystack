const logger = require("../utils/logger");
const jwt = require("jsonwebtoken");

const validateToken = (req, res, next) => {
  let token = null;

  if (req.cookies && req.cookies.accessToken) {
    token = req.cookies.accessToken;
  } else if (req.headers["authorization"]) {
    const authHeader = req.headers["authorization"];
    token = authHeader.split(" ")[1];
  }

  if (!token) {
    logger.warn(
      `[Gateway Auth] Blocked request to ${req.originalUrl} - Missing token.`,
    );
    return res.status(401).json({
      success: false,
      message: "Authentication required",
    });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, decodedPayload) => {
    if (err) {
      logger.warn(
        `[Gateway Auth] Rejected request to ${req.originalUrl} - Invalid or expired token.`,
      );

      // FIXED: Swapped 429 (Too Many Requests) to 401 (Unauthorized)
      return res.status(401).json({
        success: false,
        message: "Session expired or invalid token.",
      });
    }
    req.user = decodedPayload;
    next();
  });
};

module.exports = { validateToken };
