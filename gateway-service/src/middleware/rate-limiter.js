const { rateLimit } = require("express-rate-limit");
const { RedisStore } = require("rate-limit-redis");

const redisClient = require("../config/redis");
const logger = require("../utils/logger");

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,

  handler: (req, res) => {
    logger.warn(`Rate limit exceeded for IP: ${req.ip}`);

    res.status(429).json({
      success: false,
      message: "Too many requests",
    });
  },

  store: new RedisStore({
    sendCommand: (...args) => redisClient.call(...args),
  }),
});

module.exports = apiLimiter;