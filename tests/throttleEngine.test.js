'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { ThrottleEngine } = require('../services/throttleEngine');

test('ThrottleEngine: initial player movement should always be broadcast', () => {
  const engine = new ThrottleEngine(33);
  const result = engine.processMovement('user1', 100, 100, 1000);
  assert.equal(result.shouldBroadcast, true);
  assert.equal(result.reason, 'initial_spawn');
});

test('ThrottleEngine: sub-pixel micro-jitters (< 0.5px) should be suppressed', () => {
  const engine = new ThrottleEngine(33);
  engine.processMovement('user1', 100, 100, 1000);

  // Moved only 0.2px after 50ms (rate limit passed, but delta too small)
  const result = engine.processMovement('user1', 100.1, 100.1, 1050);
  assert.equal(result.shouldBroadcast, false);
  assert.equal(result.reason, 'subpixel_jitter');
});

test('ThrottleEngine: rapid emissions within 33ms tick should be rate-limited', () => {
  const engine = new ThrottleEngine(33);
  engine.processMovement('user1', 100, 100, 1000);

  // Big movement of 10px, but only 10ms later (< 33ms interval)
  const result = engine.processMovement('user1', 110, 100, 1010);
  assert.equal(result.shouldBroadcast, false);
  assert.equal(result.reason, 'throttled_rate_limit');
});

test('ThrottleEngine: movement after 33ms tick with valid delta should broadcast', () => {
  const engine = new ThrottleEngine(33);
  engine.processMovement('user1', 100, 100, 1000);

  // 40ms later with 5px movement
  const result = engine.processMovement('user1', 105, 100, 1040);
  assert.equal(result.shouldBroadcast, true);
  assert.equal(result.delta, 5);
});

test('ThrottleEngine: getStats should report accurate bandwidth reduction percentage', () => {
  const engine = new ThrottleEngine(33);
  engine.processMovement('user1', 100, 100, 1000); // broadcast (1)
  engine.processMovement('user1', 101, 100, 1010); // throttled
  engine.processMovement('user1', 102, 100, 1020); // throttled
  engine.processMovement('user1', 105, 100, 1040); // broadcast (2)

  const stats = engine.getStats();
  assert.equal(stats.totalEmitsReceived, 4);
  assert.equal(stats.broadcastsDispatched, 2);
  assert.equal(stats.bandwidthSavedPercent, '50%');
});

test('ThrottleEngine: cleanupPlayer should remove cached user state', () => {
  const engine = new ThrottleEngine(33);
  engine.processMovement('user1', 100, 100, 1000);
  assert.equal(engine.playerStates.has('user1'), true);

  engine.cleanupPlayer('user1');
  assert.equal(engine.playerStates.has('user1'), false);
});
