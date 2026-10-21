'use strict';

const test = require('node:test');
const assert = require('node:assert');
const mongoose = require('mongoose');
const { connectDB } = require('../db');
const User = require('../User');
const { findUsersNearCanvasPoint } = require('../proximityService');
const { canvasToGeoJSON } = require('../canvasToGeo');

const SEED_NAMESPACE_PREFIX = 'seed:proxispeak:v1:';

let dbAvailable = false;

test.before(async () => {
  try {
    await connectDB();
    dbAvailable = true;
  } catch (err) {
    dbAvailable = false;
    console.log('MongoDB not available:', err.message);
  }
});

test.after(async () => {
  if (dbAvailable && mongoose.connection.readyState === 1) {
    await mongoose.connection.close();
  }
});

function skipIfNoDb(t) {
  if (!dbAvailable) {
    t.skip('MongoDB is not available; integration test skipped.');
    return true;
  }
  return false;
}

test('integration: 2dsphere index exists on location in live database', async (t) => {
  if (skipIfNoDb(t)) return;
  const indexes = await User.collection.indexes();
  const has2dsphere = indexes.some((idx) => idx.key && idx.key.location === '2dsphere');
  assert.ok(has2dsphere, 'Expected a 2dsphere index on location in MongoDB');
});

test('integration: seeding twice creates no duplicate seed users', async (t) => {
  if (skipIfNoDb(t)) return;
  const countBefore = await User.countDocuments({ userId: { $regex: `^${SEED_NAMESPACE_PREFIX}` } });
  // Run the seed logic inline (idempotent upsert)
  const seedUsers = [
    { canvasX: 500, canvasY: 500, displayName: 'Seed User 1' },
    { canvasX: 550, canvasY: 500, displayName: 'Seed User 2' },
  ];
  for (const userData of seedUsers) {
    const [longitude, latitude] = canvasToGeoJSON(userData.canvasX, userData.canvasY);
    const userId = `${SEED_NAMESPACE_PREFIX}${userData.displayName.toLowerCase().replace(/\s+/g, '-')}`;
    await User.findOneAndUpdate(
      { userId },
      {
        userId,
        location: { type: 'Point', coordinates: [longitude, latitude] },
        canvasX: userData.canvasX,
        canvasY: userData.canvasY,
        displayName: userData.displayName,
      },
      { upsert: true, new: true }
    );
  }
  const countAfter = await User.countDocuments({ userId: { $regex: `^${SEED_NAMESPACE_PREFIX}` } });
  assert.strictEqual(countAfter, countBefore, 'Seed count should not increase on re-run');
});

test('integration: findUsersNearCanvasPoint excludes requesting user', async (t) => {
  if (skipIfNoDb(t)) return;
  const testUserId = 'integration:exclude:test:1';
  const [longitude, latitude] = canvasToGeoJSON(500, 500);
  await User.findOneAndUpdate(
    { userId: testUserId },
    {
      userId: testUserId,
      location: { type: 'Point', coordinates: [longitude, latitude] },
      canvasX: 500,
      canvasY: 500,
      displayName: 'Integration Exclude Test',
    },
    { upsert: true, new: true }
  );

  const results = await findUsersNearCanvasPoint(500, 500, 100, { excludeUserId: testUserId });
  const found = results.some((u) => u.userId === testUserId);
  assert.ok(!found, 'Excluded user should not appear in results');

  await User.deleteOne({ userId: testUserId });
});
