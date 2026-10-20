'use strict';

const mongoose = require('mongoose');
const User = require('./User');
const { connectDB, getUri } = require('./db');
const { canvasToGeoJSON, pixelsToMetres } = require('./canvasToGeo');

const SEED_NAMESPACE_PREFIX = 'seed:proxispeak:v1:';
const QUERY_CENTRE_X = 500;
const QUERY_CENTRE_Y = 500;
const RADIUS_PIXELS = 100;

const SEED_USERS = [
  // Inside 100 canvas pixels of query centre (500, 500)
  { canvasX: 500, canvasY: 500, displayName: 'Seed User 1' },
  { canvasX: 550, canvasY: 500, displayName: 'Seed User 2' },
  { canvasX: 500, canvasY: 550, displayName: 'Seed User 3' },
  { canvasX: 530, canvasY: 530, displayName: 'Seed User 4' },
  // Outside 100 canvas pixels of query centre
  { canvasX: 700, canvasY: 500, displayName: 'Seed User 5' },
  { canvasX: 500, canvasY: 700, displayName: 'Seed User 6' },
  { canvasX: 900, canvasY: 900, displayName: 'Seed User 7' },
  { canvasX: 100, canvasY: 100, displayName: 'Seed User 8' },
  { canvasX: 800, canvasY: 200, displayName: 'Seed User 9' },
  { canvasX: 200, canvasY: 800, displayName: 'Seed User 10' },
];

function requireSafeOptIn() {
  const explicitFlag = process.argv.includes('--confirm-seed');
  const envOptIn = process.env.SEED_DB === 'development';
  if (!explicitFlag && !envOptIn) {
    throw new Error(
      'Refusing to seed: explicit opt-in required. Set SEED_DB=development or pass --confirm-seed.'
    );
  }
}

function refuseProductionUri(uri) {
  const lower = String(uri).toLowerCase();
  if (lower.includes('production') || lower.includes('prod.mongodb')) {
    throw new Error('Refusing to seed: MONGODB_URI appears to target a production database.');
  }
}

async function ensure2dsphereIndex(session) {
  const indexes = await User.collection.indexes();
  const has2dsphere = indexes.some(
    (idx) =>
      idx.key && idx.key.location === '2dsphere'
  );
  if (!has2dsphere) {
    console.log('2dsphere index not found. Creating location 2dsphere index...');
    await User.collection.createIndex({ location: '2dsphere' }, { session });
    console.log('2dsphere index created.');
  } else {
    console.log('2dsphere index on location already exists.');
  }
  return indexes;
}

async function runSeed() {
  requireSafeOptIn();
  const uri = getUri();
  refuseProductionUri(uri);

  console.log('Seeding database (database name: procsispeak)');
  console.log('Seed namespace prefix:', SEED_NAMESPACE_PREFIX);

  await connectDB();

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const indexes = await ensure2dsphereIndex(session);

    let insertedOrUpdated = 0;
    for (const userData of SEED_USERS) {
      const [longitude, latitude] = canvasToGeoJSON(userData.canvasX, userData.canvasY);
      const userId = `${SEED_NAMESPACE_PREFIX}${userData.displayName.toLowerCase().replace(/\s+/g, '-')}`;

      const result = await User.findOneAndUpdate(
        { userId },
        {
          userId,
          location: { type: 'Point', coordinates: [longitude, latitude] },
          canvasX: userData.canvasX,
          canvasY: userData.canvasY,
          displayName: userData.displayName,
        },
        { upsert: true, new: true, setDefaultsOnInsert: true, session }
      );
      insertedOrUpdated += 1;
    }

    await session.commitTransaction();

    // Count users in this seed namespace
    const seedCount = await User.countDocuments({ userId: { $regex: `^${SEED_NAMESPACE_PREFIX}` } });

    // Re-fetch indexes after seed
    const finalIndexes = await User.collection.indexes();
    const has2dsphereFinal = finalIndexes.some(
      (idx) => idx.key && idx.key.location === '2dsphere'
    );

    console.log('Seed users inserted or updated:', insertedOrUpdated);
    console.log('Users in seed namespace:', seedCount);
    console.log('2dsphere index verified:', has2dsphereFinal);
    console.log('Indexes:', JSON.stringify(finalIndexes.map((i) => ({ name: i.name, key: i.key })), null, 2));

    return { insertedOrUpdated, seedCount, has2dsphereIndex: has2dsphereFinal };
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    await session.endSession();
    await mongoose.connection.close();
    console.log('Database connection closed.');
  }
}

runSeed()
  .then(() => {
    console.log('Seed completed successfully.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Seed failed:', error.message);
    process.exit(1);
  });
