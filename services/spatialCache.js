'use strict';

/**
 * SpatialCache
 * 
 * High-performance In-Memory Coordinate & Proximity Caching Layer with:
 * 1. Time-To-Live (TTL) expiration per entry.
 * 2. Least-Recently-Used (LRU) eviction when reaching max capacity.
 * 3. Spatial grid quantization & Euclidean distance threshold invalidation.
 * 4. User-indexed tracking for instant O(1) invalidation on peer disconnect or major movement.
 * 5. Comprehensive cache hit/miss/eviction telemetry diagnostics.
 */

const DEFAULT_MAX_SIZE = 500;
const DEFAULT_TTL_MS = 5000; // 5 seconds
const DEFAULT_GRID_CELL_SIZE = 25; // 25px spatial grid
const DEFAULT_INVALIDATION_DIST = 10; // 10px movement invalidates cached proximity

class SpatialCache {
  constructor(options = {}) {
    this.maxSize = options.maxSize || DEFAULT_MAX_SIZE;
    this.defaultTtlMs = options.defaultTtlMs || DEFAULT_TTL_MS;
    this.gridCellSize = options.gridCellSize || DEFAULT_GRID_CELL_SIZE;
    this.invalidationDistanceThreshold =
      options.invalidationDistanceThreshold || DEFAULT_INVALIDATION_DIST;

    // Ordered Map for O(1) key access + O(1) LRU eviction (keys are iterated in insertion order)
    this.cache = new Map();

    // Secondary reverse index: userId -> Set<cacheKey>
    this.userKeyIndex = new Map();

    // Telemetry & metrics
    this.metrics = {
      hits: 0,
      misses: 0,
      evictions: 0,
      invalidations: 0,
      expiredPruned: 0,
      startedAt: new Date().toISOString(),
    };
  }

  /**
   * Computes a spatial grid hash string for quantized bucket lookups
   * @param {number} x
   * @param {number} y
   * @returns {string} e.g. "cell:12:8"
   */
  computeGridKey(x, y) {
    const gx = Math.floor(Number(x) / this.gridCellSize);
    const gy = Math.floor(Number(y) / this.gridCellSize);
    return `cell:${gx}:${gy}`;
  }

  /**
   * Retrieves a cached value by key.
   * Enforces TTL expiration and refreshes LRU access order.
   * @param {string} key
   * @returns {*} cached value or null
   */
  get(key) {
    const entry = this.cache.get(key);
    if (!entry) {
      this.metrics.misses++;
      return null;
    }

    const now = Date.now();
    if (now > entry.expiresAt) {
      this.delete(key);
      this.metrics.expiredPruned++;
      this.metrics.misses++;
      return null;
    }

    // Refresh LRU order: delete and re-insert at the end of the Map
    this.cache.delete(key);
    entry.lastAccessedAt = now;
    this.cache.set(key, entry);

    this.metrics.hits++;
    return entry.value;
  }

  /**
   * Sets a value in the cache with LRU eviction and optional spatial metadata
   * @param {string} key
   * @param {*} value
   * @param {object} options - { ttlMs, canvasX, canvasY, zone, userId }
   */
  set(key, value, options = {}) {
    const ttlMs = typeof options.ttlMs === 'number' ? options.ttlMs : this.defaultTtlMs;
    const now = Date.now();
    const expiresAt = now + ttlMs;

    // If key already exists, delete it first so insertion order is updated
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // Evict least-recently-used item (the first key in Map iterator)
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) {
        this.delete(oldestKey);
        this.metrics.evictions++;
      }
    }

    const entry = {
      key,
      value,
      expiresAt,
      lastAccessedAt: now,
      canvasX: typeof options.canvasX === 'number' ? options.canvasX : null,
      canvasY: typeof options.canvasY === 'number' ? options.canvasY : null,
      zone: options.zone || null,
      userId: options.userId ? String(options.userId) : null,
    };

    this.cache.set(key, entry);

    // Track in reverse index if userId provided
    if (entry.userId) {
      if (!this.userKeyIndex.has(entry.userId)) {
        this.userKeyIndex.set(entry.userId, new Set());
      }
      this.userKeyIndex.get(entry.userId).add(key);
    }

    return true;
  }

  /**
   * Checks whether a non-expired entry exists in the cache
   * @param {string} key
   * @returns {boolean}
   */
  has(key) {
    const entry = this.cache.get(key);
    if (!entry) return false;
    if (Date.now() > entry.expiresAt) {
      this.delete(key);
      this.metrics.expiredPruned++;
      return false;
    }
    return true;
  }

  /**
   * Deletes a key from cache and updates user reverse index
   * @param {string} key
   */
  delete(key) {
    const entry = this.cache.get(key);
    if (entry) {
      if (entry.userId && this.userKeyIndex.has(entry.userId)) {
        const userKeys = this.userKeyIndex.get(entry.userId);
        userKeys.delete(key);
        if (userKeys.size === 0) {
          this.userKeyIndex.delete(entry.userId);
        }
      }
      return this.cache.delete(key);
    }
    return false;
  }

  /**
   * Returns cached nearby peers for a target user if they have not moved
   * past the invalidation distance threshold or changed acoustic zones.
   * @param {object} targetUser - { userId, canvasX, canvasY, zone }
   * @returns {Array|null} cached nearby peers or null if invalid / expired
   */
  getCachedNearbyPeers(targetUser) {
    if (!targetUser || !targetUser.userId) {
      this.metrics.misses++;
      return null;
    }

    const key = `nearby:${targetUser.userId}`;
    const entry = this.cache.get(key);

    if (!entry) {
      this.metrics.misses++;
      return null;
    }

    const now = Date.now();
    if (now > entry.expiresAt) {
      this.delete(key);
      this.metrics.expiredPruned++;
      this.metrics.misses++;
      return null;
    }

    // Spatial displacement check:
    // If user moved more than invalidationDistanceThreshold, invalidate cache
    if (entry.canvasX !== null && entry.canvasY !== null) {
      const dx = targetUser.canvasX - entry.canvasX;
      const dy = targetUser.canvasY - entry.canvasY;
      const distMoved = Math.hypot(dx, dy);

      if (distMoved > this.invalidationDistanceThreshold) {
        this.delete(key);
        this.metrics.invalidations++;
        this.metrics.misses++;
        return null;
      }
    }

    // Acoustic zone transition check:
    if (entry.zone && targetUser.zone && entry.zone !== targetUser.zone) {
      this.delete(key);
      this.metrics.invalidations++;
      this.metrics.misses++;
      return null;
    }

    // Refresh LRU order and hit count
    this.cache.delete(key);
    entry.lastAccessedAt = now;
    this.cache.set(key, entry);

    this.metrics.hits++;
    return entry.value;
  }

  /**
   * Stores computed nearby peers for a target user with spatial anchor coordinates
   * @param {object} targetUser - { userId, canvasX, canvasY, zone }
   * @param {Array} nearbyPeers
   * @param {number} [ttlMs]
   */
  setCachedNearbyPeers(targetUser, nearbyPeers, ttlMs) {
    if (!targetUser || !targetUser.userId) return false;

    const key = `nearby:${targetUser.userId}`;
    return this.set(key, nearbyPeers, {
      ttlMs,
      canvasX: targetUser.canvasX,
      canvasY: targetUser.canvasY,
      zone: targetUser.zone || null,
      userId: targetUser.userId,
    });
  }

  /**
   * Invalidates all cache entries linked to a specific user (e.g. on disconnect or teleport)
   * @param {string} userId
   */
  invalidateUser(userId) {
    const id = String(userId);
    const keys = this.userKeyIndex.get(id);
    if (!keys) return 0;

    let count = 0;
    for (const key of Array.from(keys)) {
      if (this.cache.delete(key)) {
        count++;
        this.metrics.invalidations++;
      }
    }
    this.userKeyIndex.delete(id);
    return count;
  }

  /**
   * Iterates through cache and removes all entries whose TTL has passed
   * @returns {number} count of pruned entries
   */
  pruneExpired() {
    const now = Date.now();
    let pruned = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.delete(key);
        pruned++;
      }
    }

    this.metrics.expiredPruned += pruned;
    return pruned;
  }

  /**
   * Resets all cached entries and metrics
   */
  clear() {
    this.cache.clear();
    this.userKeyIndex.clear();
  }

  /**
   * Diagnostic statistics report
   */
  getStats() {
    const totalLookups = this.metrics.hits + this.metrics.misses;
    const hitRatio =
      totalLookups > 0
        ? Math.round((this.metrics.hits / totalLookups) * 10000) / 100
        : 0;

    return {
      service: 'Spatial Coordinate & Proximity Cache Layer',
      status: 'operational',
      currentSize: this.cache.size,
      maxSize: this.maxSize,
      defaultTtlMs: this.defaultTtlMs,
      gridCellSize: this.gridCellSize,
      invalidationDistanceThreshold: this.invalidationDistanceThreshold,
      trackedUsersCount: this.userKeyIndex.size,
      metrics: {
        hits: this.metrics.hits,
        misses: this.metrics.misses,
        totalLookups,
        hitRatioPercentage: hitRatio,
        evictions: this.metrics.evictions,
        invalidations: this.metrics.invalidations,
        expiredPruned: this.metrics.expiredPruned,
      },
      efficiency: {
        note: 'Prevents redundant distance calculations and zone checks for stationary avatars',
      },
    };
  }
}

// Singleton default instance
const defaultSpatialCache = new SpatialCache();

module.exports = {
  SpatialCache,
  defaultSpatialCache,
  DEFAULT_MAX_SIZE,
  DEFAULT_TTL_MS,
  DEFAULT_GRID_CELL_SIZE,
  DEFAULT_INVALIDATION_DIST,
};
