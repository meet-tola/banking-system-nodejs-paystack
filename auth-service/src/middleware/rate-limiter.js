const { RateLimiterRedis } = require("rate-limiter-flexible");
const { rateLimit } = require("express-rate-limit");
const { RedisStore } = require("rate-limit-redis");

const redisClient = require("../config/redis");
const logger = require("../utils/logger");

// Global DDOS protection
const rateLimiter = new RateLimiterRedis({
  storeClient: redisClient,
  keyPrefix: "middleware",
  points: 10,
  duration: 1,
});

const globalRateLimiter = (req, res, next) => {
  rateLimiter
    .consume(req.ip)
    .then(() => next())
    .catch(() => {
      logger.warn(`Rate limit exceeded for IP: ${req.ip}`);

      res.status(429).json({
        success: false,
        message: "Too many requests",
      });
    });
};

// Sensitive endpoints limiter
const sensitiveEndpointsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,

  handler: (req, res) => {
    logger.warn(`Sensitive endpoint rate limit exceeded: ${req.ip}`);

    res.status(429).json({
      success: false,
      message: "Too many requests",
    });
  },

  store: new RedisStore({
    sendCommand: (...args) => redisClient.call(...args),
  }),
});

module.exports = {
  globalRateLimiter,
  sensitiveEndpointsLimiter,
};