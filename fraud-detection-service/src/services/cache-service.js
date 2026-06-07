const redis = require("../config/redis");
const logger = require("../utils/logger");

/**
 * Atomic sliding window check using Redis Sorted Sets (ZSET)
 * Counts occurrences within the defined window size and rejects if limit is breached
 */
const checkVelocityWindow = async (key, limit, windowInSeconds) => {
  const now = Date.now();
  const clearBefore = now - (windowInSeconds * 1000);
  const memberToken = `${now}:${Math.random().toString(36).substring(2, 7)}`;

  try {
    const multi = redis.multi();
    // 1. Evict stale timestamps older than current sliding window boundaries
    multi.zremrangebyscore(key, 0, clearBefore);
    // 2. Track current event footprint
    multi.zadd(key, now, memberToken);
    // 3. Count matching structural footprints left in window
    multi.zcard(key);
    // 4. Set safety expiration buffer
    multi.expire(key, windowInSeconds + 5);

    const results = await multi.exec();
    
    // Extrapolate integer evaluation from the ZCARD index command result safely
    const currentWindowCount = results[2][1];
    
    return {
      isLimitExceeded: currentWindowCount > limit,
      currentCount: currentWindowCount
    };
  } catch (err) {
    logger.error(`Cache execution exception on key window tracker ${key}`, err);
    return { isLimitExceeded: false, currentCount: 0 };
  }
};

module.exports = { checkVelocityWindow };