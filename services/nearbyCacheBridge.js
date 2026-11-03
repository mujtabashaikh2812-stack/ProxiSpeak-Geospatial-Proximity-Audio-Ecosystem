'use strict';

// services/spatialCache.js belongs to the team leader on lead-mujtaba.
// This file is only the adapter. Nothing here may reimplement TTL or LRU.

let cacheModule = null;
let cacheAvailable = false;
try {
  cacheModule = require('./spatialCache');
  cacheAvailable = true;
} catch (e) {
  cacheModule = null;
  cacheAvailable = false;
}

function gridKey(userId, canvasX, canvasY) {
  const x = Math.floor(canvasX / 10);
  const y = Math.floor(canvasY / 10);
  return userId + ':' + x + ':' + y;
}

function createNearbyCacheBridge(options) {
  const injected = (options && options.cache) ? options.cache : null;
  const cache = injected || (cacheAvailable ? (cacheModule.defaultSpatialCache || cacheModule.SpatialCache && new cacheModule.SpatialCache()) : null);

  function getCachedNearby(userId, canvasX, canvasY) {
    if (typeof userId !== 'string' || userId.trim() === '') return null;
    if (!cache) return null;
    const key = gridKey(userId.trim(), canvasX, canvasY);
    try {
      if (typeof cache.get === 'function') return cache.get(key);
      if (typeof cache.getCachedNearbyPeers === 'function') return cache.getCachedNearbyPeers(userId.trim());
    } catch (e) { return null; }
    return null;
  }

  function setCachedNearby(userId, peers, canvasX, canvasY) {
    if (typeof userId !== 'string' || userId.trim() === '') return false;
    if (!cache) return false;
    const key = gridKey(userId.trim(), canvasX, canvasY);
    try {
      if (typeof cache.set === 'function') { cache.set(key, peers, 5000); return true; }
      if (typeof cache.setCachedNearbyPeers === 'function') { cache.setCachedNearbyPeers(userId.trim(), peers); return true; }
    } catch (e) { return false; }
    return false;
  }

  function invalidateNearby(userId) {
    if (typeof userId !== 'string' || userId.trim() === '') return;
    if (!cache) return;
    try {
      if (typeof cache.invalidateUser === 'function') { cache.invalidateUser(userId.trim()); return; }
      if (typeof cache.delete === 'function') { cache.delete(gridKey(userId.trim(), 0, 0)); }
    } catch (e) {}
  }

  function getBridgeStats() {
    return { cacheAvailable: !!cache, hasCache: !!cache };
  }

  return { getCachedNearby, setCachedNearby, invalidateNearby, getBridgeStats };
}

module.exports = { createNearbyCacheBridge, gridKey };
module.exports.gridKey = gridKey;
