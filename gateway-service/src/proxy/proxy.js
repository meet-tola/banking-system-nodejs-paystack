const proxy = require("express-http-proxy");
const logger = require("../utils/logger");

const proxyOptions = {
  proxyReqPathResolver: (req) => {
    return req.originalUrl.replace(/^\/v1/, "/api");
  },

  proxyErrorHandler: (err, res, next) => {
    logger.error(`Proxy error: ${err.message}`);

    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: err.message,
    });
  },
};

const authProxy = proxy(process.env.AUTH_SERVICE_URL, {
  ...proxyOptions,

  proxyReqOptDecorator: (proxyReqOpts) => {
    proxyReqOpts.headers["Content-Type"] = "application/json";

    return proxyReqOpts;
  },

  userResDecorator: (proxyRes, proxyResData, userReq, userRes) => {
    logger.info(`Response received from Auth service: ${proxyRes.statusCode}`);

    return proxyResData;
  },
});

const walletProxy = proxy(process.env.WALLET_SERVICE_URL, {
  ...proxyOptions,
  proxyReqOptDecorator: (proxyReqOpts, srcReq) => {
    proxyReqOpts.headers["Content-Type"] = "application/json";
    proxyReqOpts.headers["x-user-id"] = srcReq.user.userId;
    return proxyReqOpts;
  },
  userResDecorator: (proxyRes, proxyResData, userReq, userRes) => {
    logger.info(
      `Response received from Wallet service: ${proxyRes.statusCode}`,
    );

    return proxyResData;
  },
});

const transactionProxy = proxy(process.env.TRANSACTION_SERVICE_URL, {
  ...proxyOptions,
  proxyReqOptDecorator: (proxyReqOpts, srcReq) => {
    proxyReqOpts.headers["Content-Type"] = "application/json";
    proxyReqOpts.headers["x-user-id"] = srcReq.user.userId;
    return proxyReqOpts;
  },
  userResDecorator: (proxyRes, proxyResData, userReq, userRes) => {
    logger.info(
      `Response received from Transaction service: ${proxyRes.statusCode}`,
    );

    return proxyResData;
  },
});

const ledgerProxy = proxy(process.env.LEDGER_SERVICE_URL, {
  ...proxyOptions,
  proxyReqOptDecorator: (proxyReqOpts, srcReq) => {
    proxyReqOpts.headers["Content-Type"] = "application/json";
    proxyReqOpts.headers["x-user-id"] = srcReq.user.userId;
    return proxyReqOpts;
  },
  userResDecorator: (proxyRes, proxyResData, userReq, userRes) => {
    logger.info(
      `Response received from Ledger service: ${proxyRes.statusCode}`,
    );

    return proxyResData;
  },
});

const paystackProxy = proxy(process.env.PAYSTACK_SERVICE_URL, {
  ...proxyOptions,
  proxyReqOptDecorator: (proxyReqOpts, srcReq) => {
    proxyReqOpts.headers["Content-Type"] = "application/json";
    proxyReqOpts.headers["x-user-id"] = srcReq.user.userId;
    return proxyReqOpts;
  },
  userResDecorator: (proxyRes, proxyResData, userReq, userRes) => {
    logger.info(
      `Response received from Paystack service: ${proxyRes.statusCode}`,
    );

    return proxyResData;
  },
});

const fraudDetectionProxy = proxy(process.env.FRAUD_DETECTION_SERVICE_URL, {
  ...proxyOptions,
  proxyReqOptDecorator: (proxyReqOpts, srcReq) => {
    proxyReqOpts.headers["Content-Type"] = "application/json";
    proxyReqOpts.headers["x-user-id"] = srcReq.user.userId;
    return proxyReqOpts;
  },
  userResDecorator: (proxyRes, proxyResData, userReq, userRes) => {
    logger.info(
      `Response received from fraud detection service: ${proxyRes.statusCode}`,
    );

    return proxyResData;
  },
});

module.exports = { authProxy, walletProxy, ledgerProxy, transactionProxy, paystackProxy, fraudDetectionProxy };
