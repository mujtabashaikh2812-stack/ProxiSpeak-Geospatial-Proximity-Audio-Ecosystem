'use strict';

const mongoose = require('mongoose');
const User = require('./User');
const { connectDB, getUri } = require('./db');
const { canvasToGeoJSON } = require('./canvasToGeo');

const SEED_NAMESPACE_PREFIX = 'seed:proxispeak:v1:';
const QUERY_CENTRE_X = 500;
const QUERY_CENTRE_Y = 500;
const RADIUS_PIXELS = 100;

const SEED_USERS = [
  { canvasX: 500, canvasY: 500, displayName: 'Seed User 1' },
  { canvasX: 550, canvasY: 500, displayName: 'Seed User 2' },
  { canvasX: 500, canvasY: 550, displayName: 'Seed User 3' },
  { canvasX: 530, canvasY: 530, displayName: 'Seed User 4' },
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

async function ensure2dsphereIndex() {
  const indexes = await User.collection.indexes();
  const has2dsphere = indexes.some(
    (idx) => idx.key && idx.key.location === '2dsphere'
  );
  if (!has2dsphere) {
    console.log('2dsphere index not found. Creating location 2dsphere index...');
    await User.collection.createIndex({ location: '2dsphere' });
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

  await connectDB();

  console.log('Connected to host:', mongoose.connection.host);
  console.log('Database name:', mongoose.connection.name);
  console.log('Seed namespace prefix:', SEED_NAMESPACE_PREFIX);

  try {
    await ensure2dsphereIndex();

    const operations = SEED_USERS.map((userData) => {
      const [longitude, latitude] = canvasToGeoJSON(userData.canvasX, userData.canvasY);
      const userId = `${SEED_NAMESPACE_PREFIX}${userData.displayName.toLowerCase().replace(/\s+/g, '-')}`;

      return {
        updateOne: {
          filter: { userId },
          update: {
            $set: {
              userId,
              location: { type: 'Point', coordinates: [longitude, latitude] },
              canvasX: userData.canvasX,
              canvasY: userData.canvasY,
              displayName: userData.displayName,
            },
          },
          upsert: true,
        },
      };
    });

    const result = await User.bulkWrite(operations);

    const seedCount = await User.countDocuments({ userId: { $regex: `^${SEED_NAMESPACE_PREFIX}` } });

    const finalIndexes = await User.collection.indexes();
    const has2dsphereFinal = finalIndexes.some(
      (idx) => idx.key && idx.key.location === '2dsphere'
    );

    console.log('Seed users inserted or updated:', operations.length);
    console.log('bulkWrite result - upserted:', result.upsertedCount, 'modified:', result.modifiedCount);
    console.log('Users in seed namespace:', seedCount);
    console.log('2dsphere index verified:', has2dsphereFinal);
    console.log('Indexes:', JSON.stringify(finalIndexes.map((i) => ({ name: i.name, key: i.key })), null, 2));

    return { insertedOrUpdated: operations.length, seedCount, has2dsphereIndex: has2dsphereFinal };
  } finally {
    await mongoose.connection.close();
    console.log('Database connection closed.');
  }
}

module.exports = { runSeed };

if (require.main === module) {
  runSeed()
    .then(() => {
      console.log('Seed completed successfully.');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Seed failed:', error.message);
      process.exit(1);
    });
}
