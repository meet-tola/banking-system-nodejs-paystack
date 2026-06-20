require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});

const express = require("express");
const helmet = require("helmet");
const cors = require("cors");

const fraudRoutes = require("./routes/fraud-route");
const errorHandler = require("./middleware/error-handler");
const { globalRateLimiter } = require("./middleware/rate-limiter");

const logger = require("./utils/logger");
const connectDB = require("./config/db");
const { startFraudConsumerContext } = require("./events/kafka-consumer");

require("./config/redis");

const app = express();
const PORT = process.env.PORT || 3006;

connectDB();

// Security Middlewares
app.use(helmet());
app.use(cors());

// Body Parser
app.use(express.json());

app.use((req, res, next) => {
  logger.info(`Received ${req.method} request to ${req.url}`);

  if (req.body && Object.keys(req.body).length > 0) {
    logger.info(`Request Body: ${JSON.stringify(req.body)}`);
  }

  next();
});

app.use(globalRateLimiter);

// API Routes
app.use("/api/fraud", fraudRoutes);

app.use(errorHandler);

app.listen(PORT, async () => {
  logger.info(`Fraud Detection Service management API is running on port ${PORT}`);
  
  logger.info("Initializing background event ingestion streams...");
  await startFraudConsumerContext();
});

process.on("unhandledRejection", (reason, promise) => {
  logger.error("Unhandled Rejection detected inside Fraud Service runtime at:", promise, "reason:", reason);
});