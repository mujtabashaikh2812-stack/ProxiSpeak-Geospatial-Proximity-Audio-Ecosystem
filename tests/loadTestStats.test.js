'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const loadTest = require('../benchmark/loadTest');

const { computeLatencyStats } = loadTest;

test('known array: 1 to 10 gives exact interpolated statistics', () => {
  // sorted 1..10, n = 10. median rank 4.5 -> (5 + 6) / 2 = 5.5.
  // p95 rank 0.95 * 9 = 8.55 -> 9 + (10 - 9) * 0.55 = 9.55.
  // p99 rank 0.99 * 9 = 8.91 -> 9 + 0.91 = 9.91. mean 55 / 10 = 5.5.
  const s = computeLatencyStats([10, 1, 9, 2, 8, 3, 7, 4, 6, 5]);
  assert.equal(s.min, 1);
  assert.equal(s.max, 10);
  assert.equal(s.median, 5.5);
  assert.equal(s.mean, 5.5);
  assert.ok(Math.abs(s.p95 - 9.55) < 1e-9);
  assert.ok(Math.abs(s.p99 - 9.91) < 1e-9);
});

test('empty array returns null for every statistic', () => {
  assert.deepEqual(computeLatencyStats([]), {
    min: null, median: null, mean: null, p95: null, p99: null, max: null,
  });
});

test('single element returns that value for every statistic', () => {
  assert.deepEqual(computeLatencyStats([7.5]), {
    min: 7.5, median: 7.5, mean: 7.5, p95: 7.5, p99: 7.5, max: 7.5,
  });
});

test('p95 index falling between two elements is interpolated', () => {
  // [10, 20, 30, 40, 50]: n = 5, p95 rank = 0.95 * 4 = 3.8 -> 40 + (50 - 40) * 0.8 = 48.
  // p99 rank = 0.99 * 4 = 3.96 -> 40 + 10 * 0.96 = 49.6. median rank 2 -> 30. mean 30.
  const s = computeLatencyStats([50, 10, 40, 20, 30]);
  assert.ok(Math.abs(s.p95 - 48) < 1e-9);
  assert.ok(Math.abs(s.p99 - 49.6) < 1e-9);
  assert.equal(s.median, 30);
  assert.equal(s.mean, 30);
});

test('input array is not modified', () => {
  const input = [3, 1, 2];
  computeLatencyStats(input);
  assert.deepEqual(input, [3, 1, 2]);
});

test('module can be required without starting anything listening', () => {
  assert.equal(typeof loadTest.computeLatencyStats, 'function');
  assert.equal(typeof loadTest.parseArgs, 'function');
  assert.equal(typeof loadTest.runPool, 'function');
  const active = process.getActiveResourcesInfo();
  assert.equal(active.includes('TCPServerWrap'), false);
});

test('parseArgs defaults and overrides', () => {
  assert.deepEqual(loadTest.parseArgs([]), {
    concurrency: 100, total: 500, radius: 100, users: 300, memory: false,
  });
  const a = loadTest.parseArgs(['--concurrency', '20', '--total', '60', '--radius', '50', '--memory']);
  assert.equal(a.concurrency, 20);
  assert.equal(a.total, 60);
  assert.equal(a.radius, 50);
  assert.equal(a.memory, true);
  assert.throws(() => loadTest.parseArgs(['--total', 'abc']));
  assert.throws(() => loadTest.parseArgs(['--bogus']));
});

test('runPool runs exactly the requested jobs within the concurrency limit', async () => {
  let running = 0;
  let peak = 0;
  let done = 0;
  await loadTest.runPool(25, 4, async () => {
    running += 1;
    peak = Math.max(peak, running);
    await new Promise((resolve) => setImmediate(resolve));
    running -= 1;
    done += 1;
  });
  assert.equal(done, 25);
  assert.ok(peak <= 4 && peak >= 1);
});
