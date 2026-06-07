const Redis = require("ioredis");
const logger = require("../utils/logger");

const redisConnectionString = process.env.REDIS_URL || "redis://redis:6379";
const redisClient = new Redis(redisConnectionString);

redisClient.on("connect", () => {
  logger.info("Redis connected");
});

redisClient.on("error", (err) => {
  logger.error("Redis error", err);
});

module.exports = redisClient;