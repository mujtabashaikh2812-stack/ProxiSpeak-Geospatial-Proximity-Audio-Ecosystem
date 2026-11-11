'use strict';

// Compound spatial index migration for the users collection.
//
// Usage:
//   node scripts/migrateIndexes.js               migrate the database named by MONGODB_URI
//   node scripts/migrateIndexes.js --memory      prove the migration on a temporary in-memory MongoDB
//   node scripts/migrateIndexes.js --dropLegacy  also drop the single field location_2dsphere index
//
// The compound index { status: 1, location: '2dsphere' } serves queries that filter by
// status and then search by distance. The single field location index is KEPT by default,
// because proximityService.js runs $near queries that do not filter by status and still
// rely on it. Dropping it is opt in through --dropLegacy.

const loadEnv = require('../loadEnv');
loadEnv();

const COMPOUND_INDEX_NAME = 'status_1_location_2dsphere';
const LEGACY_INDEX_NAME = 'location_2dsphere';
const COMPOUND_INDEX_KEY = { status: 1, location: '2dsphere' };
const LEGACY_INDEX_KEY = { location: '2dsphere' };
const PROOF_PREFIX = 'migrate:proof:';

function parseArgs(argv) {
  const list = Array.isArray(argv) ? argv : [];
  return {
    memory: list.includes('--memory'),
    dropLegacy: list.includes('--dropLegacy'),
  };
}

function keysEqual(a, b) {
  if (!a || !b) return false;
  const ak = Object.keys(a);
  const bk = Object.keys(b);
  if (ak.length !== bk.length) return false;
  return ak.every((k, i) => bk[i] === k && String(a[k]) === String(b[k]));
}

function isCompoundIndex(idx) {
  return !!idx && (idx.name === COMPOUND_INDEX_NAME || keysEqual(idx.key, COMPOUND_INDEX_KEY));
}

function isLegacyIndex(idx) {
  return !!idx && (idx.name === LEGACY_INDEX_NAME || keysEqual(idx.key, LEGACY_INDEX_KEY));
}

// Pure planning step: decides what to do from the current index list and the flags.
function planIndexActions(existingIndexes, options = {}) {
  const list = Array.isArray(existingIndexes) ? existingIndexes : [];
  const compoundPresent = list.some(isCompoundIndex);
  const legacyPresent = list.some(isLegacyIndex);
  const dropLegacy = options.dropLegacy === true;
  return {
    createCompound: !compoundPresent,
    dropLegacy: dropLegacy && legacyPresent,
    keepLegacy: !dropLegacy && legacyPresent,
  };
}

// Applies the plan to a collection-like object (indexes, createIndex, dropIndex).
async function applyMigration(collection, options = {}, log = () => {}) {
  const before = await collection.indexes();
  const plan = planIndexActions(before, options);
  let created = false;
  let dropped = false;

  if (plan.createCompound) {
    await collection.createIndex(COMPOUND_INDEX_KEY, { name: COMPOUND_INDEX_NAME });
    created = true;
    log('Created index ' + COMPOUND_INDEX_NAME);
  } else {
    log('Index ' + COMPOUND_INDEX_NAME + ' already present, nothing to create.');
  }

  if (plan.dropLegacy) {
    const legacy = before.find(isLegacyIndex);
    await collection.dropIndex(legacy.name);
    dropped = true;
    log('Dropped legacy single field index ' + legacy.name + ' (--dropLegacy was passed).');
  } else if (plan.keepLegacy) {
    log('Kept legacy single field index ' + LEGACY_INDEX_NAME + ' (--dropLegacy not passed).');
  }

  const after = await collection.indexes();
  return { before, after, plan, created, dropped };
}

// Finds every index name mentioned anywhere in an explain plan tree.
function collectIndexNames(node, found = []) {
  if (Array.isArray(node)) {
    node.forEach((n) => collectIndexNames(n, found));
  } else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      if (k === 'indexName' && typeof v === 'string') {
        found.push(v);
      } else {
        collectIndexNames(v, found);
      }
    }
  }
  return found;
}

function winningIndexName(explain) {
  const planner = explain && explain.queryPlanner;
  const names = collectIndexNames(planner && planner.winningPlan);
  return names.length > 0 ? names[0] : null;
}

function refuseProductionUri(uri) {
  const lower = String(uri).toLowerCase();
  if (lower.includes('production') || lower.includes('prod.mongodb')) {
    throw new Error('Refusing to migrate: MONGODB_URI appears to target a production database.');
  }
}

function printIndexes(label, indexes) {
  console.log(label);
  for (const idx of indexes) {
    console.log('  ' + idx.name + ' ' + JSON.stringify(idx.key));
  }
}

// Deterministic pseudo random numbers so the proof data is the same every run.
function makeRandom(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function buildProofUsers(canvasToGeoJSON, centreX, centreY, radius) {
  const rand = makeRandom(15);
  const users = [];
  let n = 0;
  const add = (status, x, y) => {
    n += 1;
    users.push({
      userId: PROOF_PREFIX + status + ':' + n,
      displayName: 'Proof ' + status + ' ' + n,
      status,
      canvasX: x,
      canvasY: y,
      location: { type: 'Point', coordinates: canvasToGeoJSON(x, y) },
    });
  };
  const inside = () => {
    const angle = rand() * 2 * Math.PI;
    const dist = Math.sqrt(rand()) * (radius - 5);
    return [Math.round(centreX + Math.cos(angle) * dist), Math.round(centreY + Math.sin(angle) * dist)];
  };
  const anywhere = () => [Math.round(rand() * 1200), Math.round(rand() * 800)];
  // Offline users sit inside the radius on purpose, so a query that failed to
  // use the status prefix would have to look at them.
  for (let i = 0; i < 40; i++) { const [x, y] = inside(); add('online', x, y); }
  for (let i = 0; i < 40; i++) { const [x, y] = inside(); add('offline', x, y); }
  for (let i = 0; i < 20; i++) { const [x, y] = inside(); add('idle', x, y); }
  for (let i = 0; i < 60; i++) { const [x, y] = anywhere(); add('online', x, y); }
  for (let i = 0; i < 60; i++) { const [x, y] = anywhere(); add('offline', x, y); }
  return users;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const results = [];
  const check = (label, ok, detail) => {
    results.push(ok);
    console.log((ok ? 'PASS ' : 'FAIL ') + label + (detail ? ' | ' + detail : ''));
  };

  let mem = null;
  let mongoose = null;
  let connected = false;

  try {
    mongoose = require('mongoose');
    // Index building is done by this script, not by Mongoose at connect time.
    mongoose.set('autoIndex', false);

    let uri;
    if (args.memory) {
      const { MongoMemoryServer } = require('mongodb-memory-server');
      mem = await MongoMemoryServer.create();
      uri = mem.getUri();
      console.log('Mode: temporary in-memory MongoDB (--memory)');
    } else {
      const { getUri } = require('../db');
      uri = getUri();
      refuseProductionUri(uri);
      console.log('Mode: database named by MONGODB_URI');
    }

    await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000, autoIndex: false });
    connected = true;
    console.log('Connected to host: ' + mongoose.connection.host);
    console.log('Database name: ' + mongoose.connection.name);

    const User = require('../User');
    const { canvasToGeoJSON } = require('../canvasToGeo');
    const collection = User.collection;

    if (args.memory) {
      // Recreate the state before this migration: only the single field index exists.
      await collection.createIndex(LEGACY_INDEX_KEY, { name: LEGACY_INDEX_NAME });
    }

    const centreX = 500;
    const centreY = 400;
    const radius = 100;
    const proofUsers = buildProofUsers(canvasToGeoJSON, centreX, centreY, radius);
    await User.insertMany(proofUsers);
    const totalOnline = await User.countDocuments({ status: 'online' });
    const totalOffline = await User.countDocuments({ status: 'offline' });
    console.log('Proof data: ' + totalOnline + ' online and ' + totalOffline + ' offline users in the collection.');

    // ---- first run ----
    console.log('');
    console.log('--- Migration run 1 ---');
    const run1 = await applyMigration(collection, { dropLegacy: args.dropLegacy }, (m) => console.log(m));
    printIndexes('Indexes before:', run1.before);
    printIndexes('Indexes after:', run1.after);
    const compoundAfter1 = run1.after.filter(isCompoundIndex);
    check('compound index present after the run', compoundAfter1.length === 1,
      'name=' + (compoundAfter1[0] ? compoundAfter1[0].name : 'none'));

    // ---- second run: idempotency ----
    console.log('');
    console.log('--- Migration run 2 (idempotency) ---');
    const run2 = await applyMigration(collection, { dropLegacy: args.dropLegacy }, (m) => console.log(m));
    printIndexes('Indexes after run 2:', run2.after);
    const compoundAfter2 = run2.after.filter(isCompoundIndex);
    check('second run creates no duplicate and leaves exactly one compound index',
      run2.created === false && compoundAfter2.length === 1,
      'created=' + run2.created + ' compoundCount=' + compoundAfter2.length);

    // ---- explain proof ----
    console.log('');
    console.log('--- explain("executionStats") for status online with $near ---');
    const [centreLng, centreLat] = canvasToGeoJSON(centreX, centreY);
    const query = {
      status: 'online',
      location: {
        $near: {
          $geometry: { type: 'Point', coordinates: [centreLng, centreLat] },
          $maxDistance: radius,
        },
      },
    };
    const explain = await User.find(query).explain('executionStats');
    const stats = explain.executionStats;
    const planName = winningIndexName(explain);
    const onlineInRadius = stats.nReturned;
    console.log('Winning plan index name: ' + planName);
    console.log('keysExamined: ' + stats.totalKeysExamined);
    console.log('docsExamined: ' + stats.totalDocsExamined);
    console.log('nReturned: ' + stats.nReturned);
    console.log('executionTimeMillis: ' + stats.executionTimeMillis);
    console.log('Online users in the collection: ' + totalOnline + ', offline users in the collection: ' + totalOffline);

    check('explain selected an index whose name contains status',
      typeof planName === 'string' && planName.includes('status'),
      'index=' + planName);

    const legacyNow = (await collection.indexes()).some(isLegacyIndex);
    if (args.dropLegacy) {
      check('legacy location index dropped because --dropLegacy was passed', !legacyNow,
        'legacyPresent=' + legacyNow);
    } else {
      check('legacy location index still present because --dropLegacy was not passed', legacyNow,
        'legacyPresent=' + legacyNow);
    }

    // The sheet's claim: the status online query examines no offline document.
    // Offline users were placed inside the search radius on purpose, so if they were
    // examined docsExamined would exceed the number of online users.
    check('no offline document was examined by the online query',
      planName === COMPOUND_INDEX_NAME && stats.totalDocsExamined <= totalOnline,
      'winningIndex=' + planName + ' docsExamined=' + stats.totalDocsExamined +
        ' onlineUsers=' + totalOnline + ' offlineUsers=' + totalOffline +
        ' onlineReturned=' + onlineInRadius);

    // Informational contrast: the same query forced through the single field index.
    if (legacyNow) {
      const legacyExplain = await User.find(query).hint(LEGACY_INDEX_NAME).explain('executionStats');
      const ls = legacyExplain.executionStats;
      console.log('Contrast (same query forced onto ' + LEGACY_INDEX_NAME + '): keysExamined=' +
        ls.totalKeysExamined + ' docsExamined=' + ls.totalDocsExamined +
        ' executionTimeMillis=' + ls.executionTimeMillis);
    }

    // ---- cleanup of proof data ----
    if (args.memory) {
      await mongoose.connection.dropDatabase();
      console.log('Temporary database dropped.');
    } else {
      await User.deleteMany({ userId: { $regex: '^' + PROOF_PREFIX } });
      console.log('Proof users removed from the target database.');
    }
  } catch (error) {
    results.push(false);
    console.log('FAIL migration aborted | ' + error.message);
  } finally {
    if (connected && mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
    }
    if (mem) {
      await mem.stop();
    }
  }

  const failed = results.filter((r) => !r).length;
  console.log('');
  console.log('Summary: PASS ' + (results.length - failed) + '  FAIL ' + failed);
  return failed === 0 ? 0 : 1;
}

module.exports = {
  COMPOUND_INDEX_NAME,
  LEGACY_INDEX_NAME,
  COMPOUND_INDEX_KEY,
  parseArgs,
  planIndexActions,
  applyMigration,
  winningIndexName,
  isCompoundIndex,
  isLegacyIndex,
};

if (require.main === module) {
  main()
    .then((code) => process.exit(code))
    .catch((error) => {
      console.error('Migration failed:', error.message);
      process.exit(1);
    });
}
