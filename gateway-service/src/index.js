require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});

const express = require("express");
const helmet = require("helmet");
const cors = require("cors");

const logger = require("./utils/logger");

const apiLimiter = require("./middleware/rate-limiter");
const errorHandler = require("./middleware/error-handler");
const { validateToken } = require("./middleware/auth-middleware");

const { authProxy, walletProxy, ledgerProxy, transactionProxy } = require("./proxy/proxy");

// Initialize Redis connection
require("./config/redis");

const app = express();

const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet());
app.use(cors());

app.use(express.json());

// Logger middleware
app.use((req, res, next) => {
  logger.info(`Received ${req.method} request to ${req.url}`);

  if (
    req.body &&
    typeof req.body === "object" &&
    Object.keys(req.body).length > 0
  ) {
    logger.info(`Request Body: ${JSON.stringify(req.body)}`);
  }

  next();
});

// Rate limiting
app.use(apiLimiter);

// Proxy routes
app.use("/v1/auth", authProxy);
app.use("/v1/wallet", validateToken, walletProxy);
app.use("/v1/ledger", validateToken, ledgerProxy);
app.use("/v1/transaction", validateToken, transactionProxy);

// Error handler
app.use(errorHandler);

app.listen(PORT, () => {
  logger.info(`API Gateway is running on port ${PORT}`);
  logger.info(`Auth Service URL: ${process.env.AUTH_SERVICE_URL}`);
  logger.info(`Wallet Service URL: ${process.env.WALLET_SERVICE_URL}`);
  logger.info(`Ledger Service URL: ${process.env.LEDGER_SERVICE_URL}`);
  logger.info(`Transaction Service URL: ${process.env.TRANSACTION_SERVICE_URL}`);
  logger.info(`Redis URL: ${process.env.REDIS_URL}`);
});

// Unhandled promise rejection
process.on("unhandledRejection", (reason, promise) => {
  logger.error("Unhandled Rejection at:", promise, "reason:", reason);
});
