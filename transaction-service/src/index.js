require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});
const express = require("express");
const helmet = require("helmet");
const cors = require("cors");

const transactionRoutes = require("./routes/transaction-route");
const errorHandler = require("./middleware/error-handler");

const {
  globalRateLimiter,
} = require("./middleware/rate-limiter");

const logger = require("./utils/logger");
const connectDB = require("./config/db");

// Initialize Redis connection
require("./config/redis");

const app = express();

const PORT = process.env.PORT || 3004;

// Connect databse
connectDB();

// Security middleware
app.use(helmet());
app.use(cors());

app.use(express.json());

// Logger middleware
app.use((req, res, next) => {
  logger.info(`Received ${req.method} request to ${req.url}`);

  if (Object.keys(req.body || {}).length > 0) {
    logger.info(`Request Body: ${JSON.stringify(req.body)}`);
  }

  next();
});

// Global rate limiter
app.use(globalRateLimiter);

// Routes
app.use("/api/transaction", transactionRoutes);

// Error handler
app.use(errorHandler);

app.listen(PORT, () => {
  logger.info(`Transaction service is running on port ${PORT}`);
});

//unhandled promise rejection
process.on("unhandledRejection", (reason, promise) => {
  logger.error("Unhandled Rejection at", promise, "reason:", reason);
});
