'use strict';

// High concurrency spatial query load test (Day 16).
//
// IMPORTANT: the numbers printed here come from an in-memory single node MongoDB that
// mongodb-memory-server starts on this same machine, reached over loopback with no real
// network in between. They measure the query layer (Mongoose, the 2dsphere $near query
// and the exact pixel filter in proximityService.js), not a production network. A
// networked figure needs the Docker container in docker-compose.mongo.yml (set
// MONGODB_URI to it and run without --memory).
//
// Usage:
//   node benchmark/loadTest.js [--concurrency 100] [--total 500] [--radius 100]
//                              [--users 300] [--memory]
//
// Canvas pixels are authoritative. Every GeoJSON point is produced by canvasToGeoJSON.
// The root benchmark.js is a different single query latency script and is not touched.

const DEFAULTS = {
  concurrency: 100,
  total: 500,
  radius: 100,
  users: 300,
  memory: false,
};

const P95_BUDGET_MS = 20;
const CENTRE_X = 500;
const CENTRE_Y = 400;
const OFFICE_MAX_X = 1200;
const OFFICE_MAX_Y = 800;
const INSIDE_FRACTION = 0.25;
const LOAD_PREFIX = 'loadtest:avatar:';

// Parses --name value pairs and the --memory flag by hand. Throws on bad input.
function parseArgs(argv) {
  const out = { ...DEFAULTS };
  const list = Array.isArray(argv) ? argv : [];
  const numeric = ['concurrency', 'total', 'radius', 'users'];
  for (let i = 0; i < list.length; i++) {
    const arg = list[i];
    if (arg === '--memory') {
      out.memory = true;
      continue;
    }
    const name = typeof arg === 'string' && arg.startsWith('--') ? arg.slice(2) : null;
    if (name && numeric.includes(name)) {
      const raw = list[i + 1];
      const value = Number(raw);
      if (raw === undefined || !Number.isFinite(value)) {
        throw new Error('--' + name + ' needs a numeric value');
      }
      if (name === 'radius' ? value < 0 : (!Number.isInteger(value) || value < 1)) {
        throw new Error('--' + name + ' has an invalid value: ' + raw);
      }
      out[name] = value;
      i += 1;
      continue;
    }
    throw new Error('Unknown argument: ' + arg);
  }
  return out;
}

// Latency statistics in the same unit as the input. Percentiles use linear
// interpolation between the two closest ranks: rank = p / 100 * (n - 1).
// An empty input returns null for every field.
function computeLatencyStats(values) {
  if (!Array.isArray(values) || values.length === 0) {
    return { min: null, median: null, mean: null, p95: null, p99: null, max: null };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const percentile = (p) => {
    const rank = (p / 100) * (n - 1);
    const lower = Math.floor(rank);
    const upper = Math.ceil(rank);
    if (lower === upper) return sorted[lower];
    return sorted[lower] + (sorted[upper] - sorted[lower]) * (rank - lower);
  };
  const sum = sorted.reduce((acc, v) => acc + v, 0);
  return {
    min: sorted[0],
    median: percentile(50),
    mean: sum / n,
    p95: percentile(95),
    p99: percentile(99),
    max: sorted[n - 1],
  };
}

// Small worker pool: runs `count` jobs with at most `concurrency` in flight.
async function runPool(count, concurrency, job) {
  let next = 0;
  const workers = [];
  const size = Math.min(concurrency, count);
  for (let w = 0; w < size; w++) {
    workers.push(
      (async () => {
        while (true) {
          const index = next;
          next += 1;
          if (index >= count) return;
          await job(index);
        }
      })()
    );
  }
  await Promise.all(workers);
}

function makeRandom(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// One position per avatar: roughly a quarter inside the query radius, the rest outside it.
function generatePositions(count, radius, rand) {
  const positions = [];
  const insideTarget = Math.round(count * INSIDE_FRACTION);
  for (let i = 0; i < count; i++) {
    if (i < insideTarget && radius > 1) {
      const angle = rand() * 2 * Math.PI;
      const dist = Math.sqrt(rand()) * (radius - 1);
      positions.push([Math.round(CENTRE_X + Math.cos(angle) * dist), Math.round(CENTRE_Y + Math.sin(angle) * dist)]);
    } else {
      let x;
      let y;
      do {
        x = Math.round(rand() * OFFICE_MAX_X);
        y = Math.round(rand() * OFFICE_MAX_Y);
      } while (Math.hypot(x - CENTRE_X, y - CENTRE_Y) <= radius + 5);
      positions.push([x, y]);
    }
  }
  return positions;
}

function refuseProductionUri(uri) {
  const lower = String(uri).toLowerCase();
  if (lower.includes('production') || lower.includes('prod.mongodb')) {
    throw new Error('Refusing to run: MONGODB_URI appears to target a production database.');
  }
}

const nsToMs = (ns) => Number(ns) / 1e6;
const fmt = (v) => (typeof v === 'number' ? v.toFixed(3) : 'n/a');

async function main() {
  const loadEnv = require('../loadEnv');
  loadEnv();
  const args = parseArgs(process.argv.slice(2));
  const useMemory = args.memory || !process.env.MONGODB_URI;

  const mongoose = require('mongoose');
  let mem = null;
  let connected = false;
  const checks = [];
  const check = (label, ok, detail) => {
    checks.push(ok);
    console.log((ok ? 'PASS ' : 'FAIL ') + label + (detail ? ' | ' + detail : ''));
  };

  try {
    let uri;
    if (useMemory) {
      const { MongoMemoryServer } = require('mongodb-memory-server');
      mem = await MongoMemoryServer.create();
      uri = mem.getUri();
    } else {
      uri = process.env.MONGODB_URI;
      refuseProductionUri(uri);
    }
    console.log('Mode: ' + (useMemory ? 'in-memory single node MongoDB on this machine' : 'database named by MONGODB_URI'));

    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
      maxPoolSize: Math.max(args.concurrency, 10),
    });
    connected = true;

    const User = require('../User');
    const { canvasToGeoJSON } = require('../canvasToGeo');
    const { findUsersNearCanvasPoint } = require('../proximityService');
    await User.init();

    const rand = makeRandom(16);
    const reseed = async (first) => {
      const positions = generatePositions(args.users, args.radius, rand);
      const operations = positions.map(([x, y], i) => ({
        updateOne: {
          filter: { userId: LOAD_PREFIX + i },
          update: {
            $set: {
              userId: LOAD_PREFIX + i,
              displayName: 'Load avatar ' + i,
              status: 'online',
              canvasX: x,
              canvasY: y,
              location: { type: 'Point', coordinates: canvasToGeoJSON(x, y) },
              lastSeenAt: new Date(),
            },
          },
          upsert: first,
        },
      }));
      await User.bulkWrite(operations, { ordered: false });
    };

    await reseed(true);
    const seeded = await User.countDocuments({ userId: { $regex: '^' + LOAD_PREFIX } });
    console.log('Seeded avatars: ' + seeded + ' (about ' + Math.round(INSIDE_FRACTION * 100) +
      '% inside the ' + args.radius + ' pixel radius of the test point ' + CENTRE_X + ',' + CENTRE_Y + ')');

    // Warm up: open the connection pool and prime the server before measuring.
    // These queries are not counted in the statistics.
    await runPool(args.concurrency, args.concurrency, () =>
      findUsersNearCanvasPoint(CENTRE_X, CENTRE_Y, args.radius)
    );

    const latencies = [];
    let errors = 0;
    let firstError = null;
    let matchTotal = 0;
    let reseeds = 0;
    let queryWallNs = 0n;
    let remaining = args.total;

    // Waves of up to `concurrency` queries. Avatars are moved between waves.
    while (remaining > 0) {
      const waveSize = Math.min(args.concurrency, remaining);
      if (remaining !== args.total) {
        await reseed(false);
        reseeds += 1;
      }
      const waveStart = process.hrtime.bigint();
      await runPool(waveSize, args.concurrency, async () => {
        const start = process.hrtime.bigint();
        try {
          const found = await findUsersNearCanvasPoint(CENTRE_X, CENTRE_Y, args.radius);
          latencies.push(nsToMs(process.hrtime.bigint() - start));
          matchTotal += found.length;
        } catch (error) {
          errors += 1;
          if (!firstError) firstError = error.message;
        }
      });
      queryWallNs += process.hrtime.bigint() - waveStart;
      remaining -= waveSize;
    }

    const wallMs = nsToMs(queryWallNs);
    const completed = latencies.length + errors;
    const stats = computeLatencyStats(latencies);
    const throughput = wallMs > 0 ? (latencies.length / wallMs) * 1000 : 0;

    console.log('');
    console.log('=== Load test results (in-memory single node MongoDB, not a production network figure) ===');
    console.log('total queries: ' + args.total);
    console.log('completed queries: ' + completed);
    console.log('concurrency: ' + args.concurrency);
    console.log('radius pixels: ' + args.radius);
    console.log('avatar re-seeds between waves: ' + reseeds);
    console.log('wall clock ms (query waves only, re-seeding excluded): ' + fmt(wallMs));
    console.log('throughput queries per second: ' + throughput.toFixed(1));
    console.log('latency min ms: ' + fmt(stats.min));
    console.log('latency median ms: ' + fmt(stats.median));
    console.log('latency mean ms: ' + fmt(stats.mean));
    console.log('latency p95 ms: ' + fmt(stats.p95));
    console.log('latency p99 ms: ' + fmt(stats.p99));
    console.log('latency max ms: ' + fmt(stats.max));
    console.log('average matches per query: ' + (latencies.length ? (matchTotal / latencies.length).toFixed(1) : 'n/a'));
    console.log('errors: ' + errors + (firstError ? ' (first error: ' + firstError + ')' : ''));
    console.log('');

    check('error count is zero', errors === 0, 'errors=' + errors);
    check('all requested queries completed', completed === args.total,
      'completed=' + completed + ' requested=' + args.total);
    check('p95 latency strictly under ' + P95_BUDGET_MS + ' ms',
      typeof stats.p95 === 'number' && stats.p95 < P95_BUDGET_MS,
      'p95=' + fmt(stats.p95) + 'ms budget=' + P95_BUDGET_MS + 'ms');

    if (useMemory) {
      await mongoose.connection.dropDatabase();
      console.log('Temporary database dropped.');
    } else {
      await User.deleteMany({ userId: { $regex: '^' + LOAD_PREFIX } });
      console.log('Load test avatars removed from the target database.');
    }
  } catch (error) {
    checks.push(false);
    console.log('FAIL load test aborted | ' + error.message);
  } finally {
    if (connected && mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
    }
    if (mem) {
      await mem.stop();
    }
  }

  const failed = checks.filter((c) => !c).length;
  console.log('Summary: PASS ' + (checks.length - failed) + '  FAIL ' + failed);
  return failed === 0 ? 0 : 1;
}

module.exports = { computeLatencyStats, parseArgs, runPool, generatePositions, P95_BUDGET_MS };

if (require.main === module) {
  main()
    .then((code) => process.exit(code))
    .catch((error) => {
      console.error('Load test failed:', error.message);
      process.exit(1);
    });
}
