'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  InMemoryRedisMock,
  getPubSubPair,
  checkRedisHealth,
  redisConfig,
} = require('../services/redisClient');

test('redisConfig: retryStrategy should compute exponential backoff with ceiling', () => {
  assert.equal(redisConfig.retryStrategy(1), 200);
  assert.equal(redisConfig.retryStrategy(3), 600);
  assert.equal(redisConfig.retryStrategy(10), 2000);
  assert.equal(redisConfig.retryStrategy(11), null); // Stops after 10 attempts
});

test('InMemoryRedisMock: ping should return PONG', async () => {
  const mock = new InMemoryRedisMock('test-ping');
  const result = await mock.ping();
  assert.equal(result, 'PONG');
});

test('InMemoryRedisMock: pub/sub should transmit messages between instances', async () => {
  const pub = new InMemoryRedisMock('pub-test');
  const sub = new InMemoryRedisMock('sub-test');

  let receivedMessage = null;
  await sub.subscribe('channel:movement');
  sub.on('message', (channel, msg) => {
    receivedMessage = { channel, msg };
  });

  await pub.publish('channel:movement', JSON.stringify({ userId: 'u1', x: 250, y: 300 }));

  assert.notEqual(receivedMessage, null);
  assert.equal(receivedMessage.channel, 'channel:movement');
  const payload = JSON.parse(receivedMessage.msg);
  assert.equal(payload.userId, 'u1');
  assert.equal(payload.x, 250);
});

test('getPubSubPair: should return valid paired publisher and subscriber clients', () => {
  const { pubClient, subClient } = getPubSubPair();
  assert.notEqual(pubClient, null);
  assert.notEqual(subClient, null);
  assert.equal(typeof pubClient.publish, 'function');
  assert.equal(typeof subClient.subscribe, 'function');
});

test('checkRedisHealth: should return healthy diagnostic report with fallback guarantee', async () => {
  const health = await checkRedisHealth();
  assert.equal(health.pingResponse, 'PONG');
  assert.equal(health.resilience, 'zero_downtime_guaranteed');
  assert.equal(['connected', 'active_fallback'].includes(health.status), true);
});
