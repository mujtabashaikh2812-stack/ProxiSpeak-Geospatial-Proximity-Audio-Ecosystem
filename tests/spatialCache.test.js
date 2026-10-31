'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  SpatialCache,
  defaultSpatialCache,
  DEFAULT_MAX_SIZE,
} = require('../services/spatialCache');

test('SpatialCache: get and set with hit and miss tracking', () => {
  const cache = new SpatialCache({ defaultTtlMs: 2000 });

  assert.equal(cache.get('nonexistent'), null);
  assert.equal(cache.getStats().metrics.misses, 1);

  cache.set('key1', { data: 'sample' });
  assert.equal(cache.has('key1'), true);

  const val = cache.get('key1');
  assert.deepEqual(val, { data: 'sample' });
  assert.equal(cache.getStats().metrics.hits, 1);
});

test('SpatialCache: TTL expiration purges stale entries', async () => {
  const cache = new SpatialCache();

  // Set with 40ms TTL
  cache.set('short-lived', 'hello', { ttlMs: 40 });
  assert.equal(cache.get('short-lived'), 'hello');

  await new Promise((resolve) => setTimeout(resolve, 60));

  assert.equal(cache.get('short-lived'), null);
  assert.equal(cache.has('short-lived'), false);
  assert.equal(cache.getStats().metrics.expiredPruned, 1);
});

test('SpatialCache: LRU eviction drops oldest entry when maxSize reached', () => {
  const cache = new SpatialCache({ maxSize: 3 });

  cache.set('a', 1);
  cache.set('b', 2);
  cache.set('c', 3);

  assert.equal(cache.cache.size, 3);

  // Inserting 'd' should evict 'a' (the oldest)
  cache.set('d', 4);

  assert.equal(cache.cache.size, 3);
  assert.equal(cache.has('a'), false);
  assert.equal(cache.has('b'), true);
  assert.equal(cache.has('c'), true);
  assert.equal(cache.has('d'), true);
  assert.equal(cache.getStats().metrics.evictions, 1);
});

test('SpatialCache: LRU access refreshes recency preventing eviction over untouched items', () => {
  const cache = new SpatialCache({ maxSize: 3 });

  cache.set('a', 1);
  cache.set('b', 2);
  cache.set('c', 3);

  // Read 'a', making it recently used: order is now b, c, a
  assert.equal(cache.get('a'), 1);

  // Add 'd' -> should evict 'b' (now the oldest), keeping 'a'
  cache.set('d', 4);

  assert.equal(cache.has('b'), false);
  assert.equal(cache.has('a'), true);
  assert.equal(cache.has('c'), true);
  assert.equal(cache.has('d'), true);
});

test('SpatialCache: getCachedNearbyPeers returns cached list for stationary user', () => {
  const cache = new SpatialCache({ invalidationDistanceThreshold: 10 });
  const user = { userId: 'alice', canvasX: 200, canvasY: 300, zone: 'open' };
  const mockPeers = [{ userId: 'bob', distance: 45 }];

  cache.setCachedNearbyPeers(user, mockPeers);

  // User stays in place
  const cached1 = cache.getCachedNearbyPeers(user);
  assert.deepEqual(cached1, mockPeers);

  // User moves 4px (within 10px threshold)
  const minorMovedUser = { userId: 'alice', canvasX: 203, canvasY: 302, zone: 'open' };
  const cached2 = cache.getCachedNearbyPeers(minorMovedUser);
  assert.deepEqual(cached2, mockPeers);
  assert.equal(cache.getStats().metrics.hits, 2);
});

test('SpatialCache: getCachedNearbyPeers invalidates when user moves beyond threshold', () => {
  const cache = new SpatialCache({ invalidationDistanceThreshold: 10 });
  const user = { userId: 'alice', canvasX: 200, canvasY: 300, zone: 'open' };
  const mockPeers = [{ userId: 'bob', distance: 45 }];

  cache.setCachedNearbyPeers(user, mockPeers);

  // User walks 25px away
  const movedUser = { userId: 'alice', canvasX: 220, canvasY: 315, zone: 'open' };
  const result = cache.getCachedNearbyPeers(movedUser);

  assert.equal(result, null);
  assert.equal(cache.getStats().metrics.invalidations, 1);
});

test('SpatialCache: getCachedNearbyPeers invalidates when user changes acoustic zone', () => {
  const cache = new SpatialCache({ invalidationDistanceThreshold: 50 });
  const user = { userId: 'alice', canvasX: 200, canvasY: 200, zone: 'open' };
  cache.setCachedNearbyPeers(user, [{ userId: 'bob' }]);

  // User enters Conference Room Alpha even without moving far
  const zonedUser = { userId: 'alice', canvasX: 205, canvasY: 200, zone: 'conference' };
  const result = cache.getCachedNearbyPeers(zonedUser);

  assert.equal(result, null);
  assert.equal(cache.getStats().metrics.invalidations, 1);
});

test('SpatialCache: invalidateUser purges all cached keys for a departing user', () => {
  const cache = new SpatialCache();
  const user = { userId: 'charlie', canvasX: 100, canvasY: 100 };

  cache.setCachedNearbyPeers(user, [{ userId: 'dan' }]);
  cache.set('user:charlie:profile', { role: 'speaker' }, { userId: 'charlie' });

  assert.equal(cache.has('nearby:charlie'), true);
  assert.equal(cache.has('user:charlie:profile'), true);

  const purgedCount = cache.invalidateUser('charlie');
  assert.equal(purgedCount, 2);
  assert.equal(cache.has('nearby:charlie'), false);
  assert.equal(cache.has('user:charlie:profile'), false);
});

test('SpatialCache: computeGridKey quantizes coordinates into grid cells accurately', () => {
  const cache = new SpatialCache({ gridCellSize: 20 });
  assert.equal(cache.computeGridKey(0, 0), 'cell:0:0');
  assert.equal(cache.computeGridKey(19, 19), 'cell:0:0');
  assert.equal(cache.computeGridKey(20, 39), 'cell:1:1');
  assert.equal(cache.computeGridKey(100, 250), 'cell:5:12');
});

test('SpatialCache: pruneExpired and getStats calculate accurate hit ratio percentage', async () => {
  const cache = new SpatialCache();

  cache.set('item1', 'val1', { ttlMs: 30 });
  cache.set('item2', 'val2', { ttlMs: 2000 });

  await new Promise((resolve) => setTimeout(resolve, 50));

  const pruned = cache.pruneExpired();
  assert.equal(pruned, 1);
  assert.equal(cache.has('item1'), false);
  assert.equal(cache.has('item2'), true);

  // Trigger 1 hit and 1 miss
  cache.get('item2'); // hit
  cache.get('missing'); // miss

  const stats = cache.getStats();
  assert.equal(stats.status, 'operational');
  assert.equal(stats.metrics.hits, 1);
  assert.equal(stats.metrics.misses, 1);
  assert.equal(stats.metrics.hitRatioPercentage, 50); // 1/2 = 50%
});
