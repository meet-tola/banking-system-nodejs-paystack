const proxy = require("express-http-proxy");
const logger = require("../utils/logger");

const proxyOptions = {
  proxyReqPathResolver: (req) => {
    return req.originalUrl.replace(/^\/v1/, "/api");
  },

  proxyErrorHandler: (err, res, next) => {
    logger.error(`Proxy connection failure: ${err.message}`);
    res.status(502).json({ 
      success: false,
      message: "Service temporarily unavailable. Please try again later.",
      error: err.message,
    });
  },
};

const decorateHeaders = (proxyReqOpts, srcReq, customHeaders = {}) => {
  if (proxyReqOpts.headers["x-internal-service-token"]) {
    delete proxyReqOpts.headers["x-internal-service-token"];
  }
  proxyReqOpts.headers = {
    ...proxyReqOpts.headers,
    "content-type": "application/json",
    "x-internal-service-token": process.env.INTERNAL_SERVICE_TOKEN,
    ...customHeaders
  };
  
  if (srcReq.headers["x-device-id"]) {
    proxyReqOpts.headers["x-device-id"] = srcReq.headers["x-device-id"];
  }
  
  return proxyReqOpts;
};


const handleUserResponse = (serviceName) => {
  return (proxyRes, proxyResData, userReq, userRes) => {
    logger.info(`[Proxy] ${serviceName} responded with status: ${proxyRes.statusCode}`);
    
    if (proxyRes.headers['content-type']) {
      userRes.set('content-type', proxyRes.headers['content-type']);
    }
    const cookies = proxyRes.headers['set-cookie'];
    if (cookies) {
      userRes.append('Set-Cookie', cookies);
    }

    return proxyResData; 
  };
};


// AUTH PROXY 
const authProxy = proxy(process.env.AUTH_SERVICE_URL, {
  ...proxyOptions,
  parseReqBody: true,
  memoizeHost: false,
  proxyReqOptDecorator: (proxyReqOpts, srcReq) => {
    const custom = {};
    if (srcReq.user && srcReq.user.userId) {
      custom["x-user-id"] = srcReq.user.userId;
    }
    return decorateHeaders(proxyReqOpts, srcReq, custom);
  },
  userResDecorator: handleUserResponse("Auth Service"),
});

// WALLET PROXY
const walletProxy = proxy(process.env.WALLET_SERVICE_URL, {
  ...proxyOptions,
  proxyReqOptDecorator: (proxyReqOpts, srcReq) => {
    const custom = {};
    if (srcReq.user && srcReq.user.userId) custom["x-user-id"] = srcReq.user.userId;
    return decorateHeaders(proxyReqOpts, srcReq, custom);
  },
  userResDecorator: handleUserResponse("Wallet Service"),
});

// TRANSACTION PROXY
const transactionProxy = proxy(process.env.TRANSACTION_SERVICE_URL, {
  ...proxyOptions,
  proxyReqOptDecorator: (proxyReqOpts, srcReq) => {
    const custom = {};
    if (srcReq.user && srcReq.user.userId) custom["x-user-id"] = srcReq.user.userId;
    return decorateHeaders(proxyReqOpts, srcReq, custom);
  },
  userResDecorator: handleUserResponse("Transaction Service"),
});

// LEDGER PROXY
const ledgerProxy = proxy(process.env.LEDGER_SERVICE_URL, {
  ...proxyOptions,
  proxyReqOptDecorator: (proxyReqOpts, srcReq) => {
    const custom = {};
    if (srcReq.user && srcReq.user.userId) custom["x-user-id"] = srcReq.user.userId;
    return decorateHeaders(proxyReqOpts, srcReq, custom);
  },
  userResDecorator: handleUserResponse("Ledger Service"),
});

// PAYSTACK PROXY
const paystackProxy = proxy(process.env.PAYSTACK_SERVICE_URL, {
  ...proxyOptions,
  proxyReqOptDecorator: (proxyReqOpts, srcReq) => {
    const custom = {};
    if (srcReq.user && srcReq.user.userId) custom["x-user-id"] = srcReq.user.userId;
    return decorateHeaders(proxyReqOpts, srcReq, custom);
  },
  userResDecorator: handleUserResponse("Paystack Service"),
});

// FRAUD DETECTION PROXY
const fraudDetectionProxy = proxy(process.env.FRAUD_DETECTION_SERVICE_URL, {
  ...proxyOptions,
  proxyReqOptDecorator: (proxyReqOpts, srcReq) => {
    const custom = {};
    if (srcReq.user && srcReq.user.userId) custom["x-user-id"] = srcReq.user.userId;
    return decorateHeaders(proxyReqOpts, srcReq, custom);
  },
  userResDecorator: handleUserResponse("Fraud Detection Service"),
});

module.exports = {
  authProxy,
  walletProxy,
  ledgerProxy,
  transactionProxy,
  paystackProxy,
  fraudDetectionProxy,
};