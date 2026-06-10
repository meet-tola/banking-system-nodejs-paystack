require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});
const jwt = require("jsonwebtoken");

const authenticateRequest = (req, res, next) => {
  const internalToken = req.headers["x-internal-service-token"];
  const isInternalService = internalToken && internalToken === process.env.INTERNAL_SERVICE_TOKEN;

  let token = req.cookies ? req.cookies.accessToken : null;

  if (!token && req.headers.authorization) {
    const parts = req.headers.authorization.split(" ");
    if (parts[0] === "Bearer") {
      token = parts[1];
    }
  }
  if (!token) {
    if (isInternalService) {
      req.user = { role: "INTERNAL_SERVICE" };
      return next();
    }

    return res.status(401).json({
      success: false,
      message: "Access Denied: No authentication token found.",
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; 

    if (isInternalService) {
      req.user.role = "INTERNAL_SERVICE";
    }

    next();
  } catch (err) {
    if (isInternalService) {
      req.user = { role: "INTERNAL_SERVICE" };
      return next();
    }

    return res.status(401).json({
      success: false,
      message: "Authentication failed: Token is invalid or expired.",
    });
  }
};

module.exports = authenticateRequest;