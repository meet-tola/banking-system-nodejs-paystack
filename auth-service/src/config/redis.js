const Redis = require("ioredis");
const logger = require("../utils/logger");

const redisClient = new Redis(process.env.REDIS_URL);

redisClient.on("connect", () => {
  logger.info("Redis connected");
});

redisClient.on("error", (err) => {
  logger.error("Redis error", err);
});

module.exports = redisClient;