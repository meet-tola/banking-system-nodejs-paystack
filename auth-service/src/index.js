require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});
const express = require("express");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");

const authRoutes = require("./routes/auth-route");
const mfaRoutes = require("./routes/mfa-route");
const userRoutes = require("./routes/user-route");
const errorHandler = require("./middleware/error-handler");

const {
  globalRateLimiter,
  sensitiveEndpointsLimiter,
} = require("./middleware/rate-limiter");

const logger = require("./utils/logger");
const connectDB = require("./config/db");
const { connectKafka } = require("./utils/kafka-producer");

// Initialize Redis connection
require("./config/redis");

const app = express();

const PORT = process.env.PORT || 3001;

// Connect database & microservice events
connectDB();
connectKafka();

// Security middleware
app.use(helmet());

app.use(express.json());
app.use(cookieParser());

// Logger middleware
app.use((req, res, next) => {
  logger.info(`Received ${req.method} request to ${req.url}`);

  if (req.body && typeof req.body === "object" && Object.keys(req.body).length > 0) {
    logger.info(`Request Body: ${JSON.stringify(req.body)}`);
  }

  next();
});

// Global rate limiter
app.use(globalRateLimiter);

// Sensitive routes
app.use("/api/auth/register", sensitiveEndpointsLimiter);
app.use("/api/auth/login", sensitiveEndpointsLimiter);

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/mfa", mfaRoutes);
app.use("/api/user", userRoutes);

// Error handler
app.use(errorHandler);

app.listen(PORT, () => {
  logger.info(`Auth service is running on port ${PORT}`);
});

//unhandled promise rejection
process.on("unhandledRejection", (reason, promise) => {
  logger.error("Unhandled Rejection at", promise, "reason:", reason);
});
