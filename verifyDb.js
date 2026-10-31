'use strict';
const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const User = require('./User');
const { runSeed } = require('./seed');
const { findUsersNearCanvasPoint } = require('./proximityService');
const { canvasToGeoJSON } = require('./canvasToGeo');
const { pruneStaleSessions } = require('./sessionPruner');
const { seedZones } = require('./scripts/seedZones');
const { OfficeZone, zoneContainsCanvasPoint } = require('./models/OfficeZone');

const QUERY_CENTRE_X = 500;
const QUERY_CENTRE_Y = 500;
const RADIUS_PIXELS = 100;
const WARM_UP = 5;
const MEASURED_RUNS = 30;

const SEED_USER_IDS = [
  'seed:proxispeak:v1:seed-user-1',
  'seed:proxispeak:v1:seed-user-2',
  'seed:proxispeak:v1:seed-user-3',
  'seed:proxispeak:v1:seed-user-4',
  'seed:proxispeak:v1:seed-user-5',
  'seed:proxispeak:v1:seed-user-6',
  'seed:proxispeak:v1:seed-user-7',
  'seed:proxispeak:v1:seed-user-8',
  'seed:proxispeak:v1:seed-user-9',
  'seed:proxispeak:v1:seed-user-10',
];

let passCount = 0;
let failCount = 0;
let measuredValues = [];

function record(label, ok, detail) {
  const verdict = ok ? 'PASS' : 'FAIL';
  const line = `${verdict} ${label}${detail ? ' | ' + detail : ''}`;
  console.log(line);
  if (ok) {
    passCount += 1;
  } else {
    failCount += 1;
  }
  measuredValues.push(line);
}

async function connectAgain(seedUri) {
  if (mongoose.connection.readyState === 1) {
    return;
  }
  await mongoose.connect(seedUri, { serverSelectionTimeoutMS: 5000 });
}

function percentile(sorted, p) {
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
}

function stats(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    min: sorted[0],
    max: sorted[sorted.length - 1],
    avg: values.reduce((sum, v) => sum + v, 0) / values.length,
    median: percentile(sorted, 50),
    p95: percentile(sorted, 95),
  };
}

function nsToMs(ns) {
  return Number(ns) / 1_000_000;
}

function printTiming(label, s) {
  console.log(label);
  console.log('  min: ' + s.min.toFixed(3) + ' ms');
  console.log('  median: ' + s.median.toFixed(3) + ' ms');
  console.log('  average: ' + s.avg.toFixed(3) + ' ms');
  console.log('  p95: ' + s.p95.toFixed(3) + ' ms');
  console.log('  max: ' + s.max.toFixed(3) + ' ms');
}

async function main() {
  console.log('=== verifyDb.js: in-memory single-node MongoDB verification ===');
  console.log('All timings below come from an in-memory single-node MongoDB on this laptop and are not production latency figures.');
  console.log('');

  const mem = await MongoMemoryServer.create();
  const uri = await mem.getUri();
  await mongoose.connect(uri);

  try {
    await User.init();
    // ---- Check 1: 2dsphere index exists in the live database ----
    const indexes = await User.collection.indexes();
    const indexList = indexes.map((i) => ({ name: i.name, key: i.key }));
    const has2dsphere = indexList.some((i) => i.key && i.key.location === '2dsphere');
    record('Check 1: location 2dsphere index exists in live database', has2dsphere,
      'indexes=' + JSON.stringify(indexList));
    // ---- Check 2: seed idempotency ----
    process.env.MONGODB_URI = uri;
    process.env.SEED_DB = 'development';
const seedResult1 = await runSeed();
    await connectAgain(uri);
    const seedResult2 = await runSeed();
    await connectAgain(uri);
    const seedCount1 = seedResult1.seedCount;
    const seedCount2 = seedResult2.seedCount;
    const seedIdempotent = seedCount1 === 10 && seedCount2 === 10 && seedCount1 === seedCount2;
    record('Check 2: seed idempotency (10 users after each run)', seedIdempotent,
      'run1=' + seedCount1 + ' run2=' + seedCount2);
    // ---- Check 3: proximity correctness ----
    const matches = await findUsersNearCanvasPoint(QUERY_CENTRE_X, QUERY_CENTRE_Y, RADIUS_PIXELS);
    const matchIds = matches.map((u) => u.userId).sort();
    const expectedInside = SEED_USER_IDS.slice(0, 4).sort();
    const expectedOutside = SEED_USER_IDS.slice(4).sort();
    const allInside = expectedInside.every((id) => matchIds.includes(id));
    const noOutside = expectedOutside.every((id) => !matchIds.includes(id));
    const correctCount = matches.length === 4;
    record('Check 3: proximity returns exactly four seed users', correctCount && allInside && noOutside,
      'returned=' + JSON.stringify(matchIds));
    // ---- Check 4: boundary behaviour ----
    const [boundaryLng, boundaryLat] = canvasToGeoJSON(QUERY_CENTRE_X, QUERY_CENTRE_Y);
    const tempInside = 'verify:boundary:inside';
    const tempOutside = 'verify:boundary:outside';
    const [insideLng, insideLat] = canvasToGeoJSON(QUERY_CENTRE_X + RADIUS_PIXELS, QUERY_CENTRE_Y);
    const [outsideLng, outsideLat] = canvasToGeoJSON(QUERY_CENTRE_X + 100.5, QUERY_CENTRE_Y);
    await User.replaceOne(
      { userId: tempInside },
      { userId: tempInside, location: { type: 'Point', coordinates: [insideLng, insideLat] }, canvasX: QUERY_CENTRE_X + RADIUS_PIXELS, canvasY: QUERY_CENTRE_Y, displayName: 'Boundary Inside' },
      { upsert: true },
    );
    await User.replaceOne(
      { userId: tempOutside },
      { userId: tempOutside, location: { type: 'Point', coordinates: [outsideLng, outsideLat] }, canvasX: QUERY_CENTRE_X + 100.5, canvasY: QUERY_CENTRE_Y, displayName: 'Boundary Outside' },
      { upsert: true },
    );
    const boundaryMatches = await findUsersNearCanvasPoint(QUERY_CENTRE_X, QUERY_CENTRE_Y, RADIUS_PIXELS);
    const insideReturned = boundaryMatches.some((u) => u.userId === tempInside);
    const outsideReturned = boundaryMatches.some((u) => u.userId === tempOutside);
    const boundaryOk = insideReturned && !outsideReturned;
    record('Check 4: boundary accepts 100px and rejects 100.5px', boundaryOk,
      'insideReturned=' + insideReturned + ' outsideReturned=' + outsideReturned);
    await User.deleteOne({ userId: tempInside });
    await User.deleteOne({ userId: tempOutside });
    // ---- Check 5: exclusion ----
    const firstClustered = matches[0].userId;
    const excludedMatches = await findUsersNearCanvasPoint(QUERY_CENTRE_X, QUERY_CENTRE_Y, RADIUS_PIXELS, { excludeUserId: firstClustered });
    const excludedPresent = excludedMatches.some((u) => u.userId === firstClustered);
    const othersPresent = excludedMatches.length === 3 && SEED_USER_IDS.slice(0, 4).filter((id) => id !== firstClustered).every((id) => excludedMatches.some((u) => u.userId === id));
    record('Check 5: excludeUserId removes the requesting user', !excludedPresent && othersPresent,
      'excluded=' + firstClustered + ' remaining=' + excludedMatches.length);
    // ---- Check 6: benchmark ----
    const datasetSize = await User.countDocuments({});
    const [benchCentreLng, benchCentreLat] = canvasToGeoJSON(QUERY_CENTRE_X, QUERY_CENTRE_Y);
    const maxDistance = RADIUS_PIXELS + 1;

    for (let i = 0; i < WARM_UP; i++) {
      await User.find({ location: { $near: { $geometry: { type: 'Point', coordinates: [benchCentreLng, benchCentreLat] }, $maxDistance: maxDistance } } })
        .select('userId canvasX canvasY displayName').lean();
      await findUsersNearCanvasPoint(QUERY_CENTRE_X, QUERY_CENTRE_Y, RADIUS_PIXELS);
    }

    const dbQueryTimes = [];
    const serviceTimes = [];
    let matchCount = 0;
    for (let i = 0; i < MEASURED_RUNS; i++) {
      const dbStart = process.hrtime.bigint();
      await User.find({ location: { $near: { $geometry: { type: 'Point', coordinates: [benchCentreLng, benchCentreLat] }, $maxDistance: maxDistance } } })
        .select('userId canvasX canvasY displayName').lean();
      const dbEnd = process.hrtime.bigint();
      dbQueryTimes.push(nsToMs(dbEnd - dbStart));

      const svcStart = process.hrtime.bigint();
      const svcMatches = await findUsersNearCanvasPoint(QUERY_CENTRE_X, QUERY_CENTRE_Y, RADIUS_PIXELS);
      const svcEnd = process.hrtime.bigint();
      serviceTimes.push(nsToMs(svcEnd - svcStart));
      matchCount = svcMatches.length;
    }

    const dbStats = stats(dbQueryTimes);
    const svcStats = stats(serviceTimes);
    const under20ms = svcStats.avg < 20;

    console.log('');
    console.log('Benchmark (in-memory single-node MongoDB on this laptop, not production latency):');
    console.log('  dataset size: ' + datasetSize + ' users');
    console.log('  match count: ' + matchCount);
    console.log('  measured iterations: ' + MEASURED_RUNS + ' (after ' + WARM_UP + ' warm-up runs)');
    printTiming('  Raw $near database query timing (ms):', dbStats);
    printTiming('  Full proximity service timing (ms):', svcStats);
    record('Check 6: benchmark measured (min/median/avg/p95/max printed)', true,
      'fullServiceAvg=' + svcStats.avg.toFixed(3) + 'ms under20ms=' + under20ms);
    console.log('  Full service average ' + (under20ms ? 'is' : 'is NOT') + ' under 20 milliseconds.');
    // ---- Check 7: pruning dryRun reports 2 stale and deletes nothing ----
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    await User.create([
      { userId: 'prune:test:1', location: { type: 'Point', coordinates: [0, 0] }, canvasX: 0, canvasY: 0, lastSeenAt: twoHoursAgo },
      { userId: 'prune:test:2', location: { type: 'Point', coordinates: [0, 0] }, canvasX: 0, canvasY: 0, lastSeenAt: twoHoursAgo },
      { userId: 'prune:test:3', location: { type: 'Point', coordinates: [0, 0] }, canvasX: 0, canvasY: 0 },
    ]);
    const dry = await pruneStaleSessions({ maxIdleMinutes: 30, dryRun: true });
    const dryOk = dry.staleCount === 2 && dry.deletedCount === 0;
    const real = await pruneStaleSessions({ maxIdleMinutes: 30, dryRun: false });
    const remaining = await User.countDocuments({ userId: /^prune:test:/ });
    const realOk = real.deletedCount === 2 && remaining === 1;
    const pruneOk = dryOk && realOk;
    record('Check 7: pruning dryRun keeps 2 stale, dryRun false deletes 2', pruneOk,
      'dryStale=' + dry.staleCount + ' dryDeleted=' + dry.deletedCount + ' realDeleted=' + real.deletedCount + ' remaining=' + remaining);
    await User.deleteMany({ userId: /^prune:test:/ });

    // ---- Check 8: office zone seeder writes 3 and is idempotent ----
    const brokenRing = [[[0, 0], [10, 0], [10, 10]]]; // unclosed
    const brokenZone = new OfficeZone({
      zoneId: 'broken-zone',
      name: 'Broken',
      type: 'enclosed_room',
      boundary: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] },
      canvasBoundary: brokenRing,
    });
    const brokenErr = brokenZone.validateSync();
    const brokenOk = !!brokenErr && !!brokenErr.errors.canvasBoundary;

    await seedZones({ confirmSeed: true });
    const count1 = await OfficeZone.countDocuments();
    await seedZones({ confirmSeed: true });
    const count2 = await OfficeZone.countDocuments();
    const alpha = await OfficeZone.findOne({ zoneId: 'conference-alpha' }).lean();
    const inside = zoneContainsCanvasPoint(alpha, 100, 100);
    const outside = zoneContainsCanvasPoint(alpha, 500, 500);
    const idx = await OfficeZone.collection.indexes();
    const hasBoundary = idx.some((i) => i.key && i.key.boundary === '2dsphere');
    const check9Ok = brokenOk && count1 === 3 && count2 === 3 && inside === true && outside === false && hasBoundary;
    record('Check 8: office zone seeder writes 3, idempotent, containment and index verified', check9Ok,
      'brokenRejected=' + brokenOk + ' count1=' + count1 + ' count2=' + count2 + ' inside=' + inside + ' outside=' + outside + ' hasBoundary2dsphere=' + hasBoundary);
    await OfficeZone.deleteMany({});

    // ---- Check 9: cleanup ----
    await mongoose.connection.dropDatabase();
    record('Check 9: test database dropped and memory server stopped', true, 'dropped');

  } finally {
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
    }
    await mem.stop();
  }

  console.log('');
  console.log('=== Summary ===');
  console.log('PASS: ' + passCount + '  FAIL: ' + failCount);
  console.log('All numbers above were measured on an in-memory single-node MongoDB on this laptop.');
  process.exit(failCount === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error('verifyDb.js failed:', error.message);
  process.exit(1);
});
