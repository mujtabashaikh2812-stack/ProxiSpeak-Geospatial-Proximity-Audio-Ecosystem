'use strict';

/**
 * Coordinate Throttle & Delta Compression Engine (Week 3 Performance Scaling)
 * Enforces a 30Hz broadcast rate-limit (33.3ms intervals) and filters out
 * sub-pixel micro-jitter to prevent network frame saturation with 50+ concurrent users.
 */

const TICK_RATE_HZ = 30;
const TICK_INTERVAL_MS = Math.round(1000 / TICK_RATE_HZ); // ~33ms
const MIN_DELTA_PIXELS = 0.5; // Minimum Euclidean movement to trigger broadcast

class ThrottleEngine {
  constructor(tickIntervalMs = TICK_INTERVAL_MS) {
    this.tickInterval = tickIntervalMs;
    // Map<userId, { lastX, lastY, lastBroadcastTime, pendingCoords }>
    this.playerStates = new Map();
    // Performance metrics
    this.metrics = {
      totalEmitsReceived: 0,
      broadcastsDispatched: 0,
      suppressedJitters: 0,
    };
  }

  /**
   * Evaluates whether an incoming movement should be broadcast immediately,
   * throttled to the 30Hz tick, or discarded as sub-pixel jitter.
   *
   * @param {string} userId
   * @param {number} x
   * @param {number} y
   * @param {number} currentTime
   * @returns {{ shouldBroadcast: boolean, reason: string }}
   */
  processMovement(userId, x, y, currentTime = Date.now()) {
    this.metrics.totalEmitsReceived++;

    const state = this.playerStates.get(userId);

    // Initial position registration: always broadcast
    if (!state) {
      this.playerStates.set(userId, {
        lastX: x,
        lastY: y,
        lastBroadcastTime: currentTime,
      });
      this.metrics.broadcastsDispatched++;
      return { shouldBroadcast: true, reason: 'initial_spawn' };
    }

    // 1. Delta Compression Check: Ignore sub-pixel jitter
    const delta = Math.hypot(x - state.lastX, y - state.lastY);
    if (delta < MIN_DELTA_PIXELS) {
      this.metrics.suppressedJitters++;
      return { shouldBroadcast: false, reason: 'subpixel_jitter' };
    }

    // 2. Rate-Limit Check: Enforce 30Hz (~33ms) window
    const elapsed = currentTime - state.lastBroadcastTime;
    if (elapsed < this.tickInterval) {
      return { shouldBroadcast: false, reason: 'throttled_rate_limit' };
    }

    // Update state and permit broadcast
    state.lastX = x;
    state.lastY = y;
    state.lastBroadcastTime = currentTime;
    this.metrics.broadcastsDispatched++;

    return { shouldBroadcast: true, delta: Math.round(delta * 100) / 100 };
  }

  /**
   * Cleans up player state upon disconnection
   */
  cleanupPlayer(userId) {
    this.playerStates.delete(userId);
  }

  /**
   * Returns live throughput and bandwidth compression statistics
   */
  getStats() {
    const total = this.metrics.totalEmitsReceived;
    const dispatched = this.metrics.broadcastsDispatched;
    const compressionRatio = total > 0 ? Math.round(((total - dispatched) / total) * 100) : 0;

    return {
      tickRateHz: TICK_RATE_HZ,
      tickIntervalMs: this.tickInterval,
      totalEmitsReceived: total,
      broadcastsDispatched: dispatched,
      bandwidthSavedPercent: `${compressionRatio}%`,
    };
  }
}

const defaultThrottle = new ThrottleEngine();

module.exports = {
  ThrottleEngine,
  defaultThrottle,
  TICK_INTERVAL_MS,
  MIN_DELTA_PIXELS,
};
