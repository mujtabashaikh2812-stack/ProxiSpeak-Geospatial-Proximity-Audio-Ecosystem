'use strict';

try {
  require('dotenv').config();
} catch (_) {}

/**
 * Redis Configuration & Exponential Backoff Strategy (Week 3 Scaling)
 */
const redisConfig = {
  url: process.env.REDIS_URL || 'redis://127.0.0.1:6379',
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT, 10) || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  connectTimeout: 5000,
  maxRetriesPerRequest: 3,

  /**
   * Exponential backoff retry strategy for network disconnects.
   * Caps delay at 3000ms and max 10 retries before switching to fallback.
   */
  retryStrategy(times) {
    if (times > 10) {
      console.warn('[Redis] Max reconnect retries reached. Operating in fallback mode.');
      return null; // Stop retrying
    }
    const delay = Math.min(times * 200, 3000);
    console.log(`[Redis] Reconnect attempt #${times} in ${delay}ms...`);
    return delay;
  },
};

module.exports = redisConfig;
