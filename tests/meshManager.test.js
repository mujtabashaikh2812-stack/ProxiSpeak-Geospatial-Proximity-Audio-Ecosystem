'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  MeshManager,
  defaultMeshManager,
  DEFAULT_MAX_MESH_CAP,
} = require('../services/meshManager');

test('MeshManager: allocates all peers when count is within maxMeshCap', () => {
  const manager = new MeshManager({ maxMeshCap: 4 });
  const localUser = { userId: 'alice', canvasX: 100, canvasY: 100, zone: 'open' };

  const candidates = [
    { userId: 'bob', canvasX: 120, canvasY: 100, distance: 20 },
    { userId: 'charlie', canvasX: 130, canvasY: 100, distance: 30 },
  ];

  const result = manager.evaluateMeshAllocation(localUser, candidates);

  assert.equal(result.isCapped, false);
  assert.equal(result.activeCount, 2);
  assert.equal(result.promoted.length, 2);
  assert.equal(result.suppressed.length, 0);
  assert.deepEqual(manager.getActivePeersForUser('alice'), ['bob', 'charlie']);
});

test('MeshManager: caps connections to maxMeshCap and prioritizes closest peers', () => {
  const manager = new MeshManager({ maxMeshCap: 3 });
  const localUser = { userId: 'alice', canvasX: 100, canvasY: 100, zone: 'open' };

  // 5 candidate peers at increasing distances
  const candidates = [
    { userId: 'peer-50px', distance: 50 },
    { userId: 'peer-10px', distance: 10 },
    { userId: 'peer-70px', distance: 70 },
    { userId: 'peer-20px', distance: 20 },
    { userId: 'peer-90px', distance: 90 },
  ];

  const result = manager.evaluateMeshAllocation(localUser, candidates);

  assert.equal(result.isCapped, true);
  assert.equal(result.activeCount, 3);
  assert.equal(result.suppressed.length, 2);

  // The 3 closest peers should be allocated: 10px, 20px, 50px
  const activeIds = result.activePeers.map((p) => p.userId);
  assert.deepEqual(activeIds, ['peer-10px', 'peer-20px', 'peer-50px']);

  // The 2 farthest should be suppressed
  const suppressedIds = result.suppressed.map((p) => p.userId);
  assert.deepEqual(suppressedIds, ['peer-70px', 'peer-90px']);
});

test('MeshManager: VIP Spotlight speaker on Town Hall Podium bypasses distance', () => {
  const manager = new MeshManager({ maxMeshCap: 2 });
  const localUser = { userId: 'alice', canvasX: 100, canvasY: 100, zone: 'open' };

  const candidates = [
    { userId: 'close-peer-1', distance: 15, isOnStage: false },
    { userId: 'close-peer-2', distance: 25, isOnStage: false },
    { userId: 'stage-speaker', distance: 95, isOnStage: true }, // Far away, but on stage!
  ];

  const result = manager.evaluateMeshAllocation(localUser, candidates);

  assert.equal(result.activeCount, 2);
  // Stage speaker must be granted an active audio slot
  const activeIds = result.activePeers.map((p) => p.userId);
  assert.equal(activeIds.includes('stage-speaker'), true);
  assert.equal(result.activePeers[0].userId, 'stage-speaker'); // Highest priority
});

test('MeshManager: Enclosed conference room peers receive priority boost', () => {
  const manager = new MeshManager({ maxMeshCap: 2 });
  const localUser = { userId: 'alice', canvasX: 100, canvasY: 100, zone: 'conference' };

  const candidates = [
    { userId: 'outside-hallway-peer', distance: 30, zone: 'open' },
    { userId: 'room-colleague', distance: 50, zone: 'conference' }, // Farther, but in same room
  ];

  const result = manager.evaluateMeshAllocation(localUser, candidates);

  // Room colleague gets conference room bonus and wins slot 1
  assert.equal(result.activePeers[0].userId, 'room-colleague');
});

test('MeshManager: Hysteresis prevents rapid flapping on boundary edges', () => {
  const manager = new MeshManager({ maxMeshCap: 1, hysteresisPx: 8 });
  const localUser = { userId: 'alice', canvasX: 100, canvasY: 100, zone: 'open' };

  // Initial state: Bob is active at 50px
  manager.evaluateMeshAllocation(localUser, [{ userId: 'bob', distance: 50 }]);
  assert.deepEqual(manager.getActivePeersForUser('alice'), ['bob']);

  // A new peer Charlie arrives at 46px (4px closer, but WITHIN 8px hysteresis buffer)
  const result = manager.evaluateMeshAllocation(localUser, [
    { userId: 'bob', distance: 50 },
    { userId: 'charlie', distance: 46 },
  ]);

  // Bob should be retained because 4px difference does not exceed hysteresis threshold
  assert.equal(result.activePeers[0].userId, 'bob');
  assert.equal(result.demoted.length, 0);

  // Now Dan arrives at 35px (15px closer, EXCEEDING hysteresis buffer)
  const result2 = manager.evaluateMeshAllocation(localUser, [
    { userId: 'bob', distance: 50 },
    { userId: 'dan', distance: 35 },
  ]);

  // Dan should evict Bob
  assert.equal(result2.activePeers[0].userId, 'dan');
  assert.equal(result2.demoted[0].userId, 'bob');
});

test('MeshManager: cleanupUser removes user and frees up mesh slots for others', () => {
  const manager = new MeshManager({ maxMeshCap: 2 });
  const user1 = { userId: 'u1', canvasX: 100, canvasY: 100, zone: 'open' };
  const user2 = { userId: 'u2', canvasX: 110, canvasY: 100, zone: 'open' };

  manager.evaluateMeshAllocation(user1, [{ userId: 'u2', distance: 10 }]);
  manager.evaluateMeshAllocation(user2, [{ userId: 'u1', distance: 10 }]);

  assert.equal(manager.getActivePeersForUser('u1').includes('u2'), true);
  assert.equal(manager.getActivePeersForUser('u2').includes('u1'), true);

  // User 2 disconnects
  manager.cleanupUser('u2');

  assert.equal(manager.getActivePeersForUser('u2').length, 0);
  assert.equal(manager.getActivePeersForUser('u1').includes('u2'), false);
});

test('MeshManager: getStats reports accurate metrics and streams saved', () => {
  const manager = new MeshManager({ maxMeshCap: 2 });
  const localUser = { userId: 'alice', canvasX: 100, canvasY: 100, zone: 'open' };

  manager.evaluateMeshAllocation(localUser, [
    { userId: 'p1', distance: 10 },
    { userId: 'p2', distance: 20 },
    { userId: 'p3', distance: 30 }, // Overflow
    { userId: 'p4', distance: 40 }, // Overflow
  ]);

  const stats = manager.getStats();
  assert.equal(stats.status, 'operational');
  assert.equal(stats.maxMeshCap, 2);
  assert.equal(stats.trackedUsersCount, 1);
  assert.equal(stats.totalActiveAudioStreams, 2);
  assert.equal(stats.metrics.overflowSuppressedCount, 2);
});
