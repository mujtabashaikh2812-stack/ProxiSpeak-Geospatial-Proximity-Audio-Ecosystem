'use strict';

const mongoose = require('mongoose');
const { connectDB, getUri } = require('../db');
const { canvasRingToGeoRing, MAX_CANVAS_COORD } = require('../canvasToGeo');
const { OfficeZone } = require('../models/OfficeZone');

function requireSafeOptIn(confirmSeed) {
  const envOptIn = process.env.SEED_DB === 'development';
  if (!confirmSeed && !envOptIn) {
    throw new Error('Refusing to seed zones: explicit opt-in required. Set SEED_DB=development or pass confirmSeed: true.');
  }
}

function refuseProductionUri(uri) {
  const lower = String(uri).toLowerCase();
  if (lower.includes('production') || lower.includes('prod.mongodb')) {
    throw new Error('Refusing to seed zones: MONGODB_URI appears to target a production database.');
  }
}

async function seedZones(options = {}) {
  const confirmSeed = options.confirmSeed === undefined ? false : options.confirmSeed;
  requireSafeOptIn(confirmSeed);
  const uri = getUri();
  refuseProductionUri(uri);

  const alreadyConnected = mongoose.connection.readyState === 1;
  if (!alreadyConnected) await connectDB();

  try {
    const zones = [
      {
        zoneId: 'conference-alpha',
        name: 'Conference Room Alpha',
        type: 'enclosed_room',
        isSoundproof: true,
        isSpotlightBroadcast: false,
        pixelRing: [[60, 60], [340, 60], [340, 280], [60, 280], [60, 60]],
      },
      {
        zoneId: 'stage-podium',
        name: 'Podium Stage',
        type: 'spotlight_stage',
        isSoundproof: false,
        isSpotlightBroadcast: true,
        pixelRing: [[680, 80], [860, 80], [860, 200], [680, 200], [680, 80]],
      },
      {
        zoneId: 'open-workspace',
        name: 'Open Workspace',
        type: 'open_workspace',
        isSoundproof: false,
        isSpotlightBroadcast: false,
        pixelRing: [[0, 0], [MAX_CANVAS_COORD, 0], [MAX_CANVAS_COORD, MAX_CANVAS_COORD], [0, MAX_CANVAS_COORD], [0, 0]],
      },
    ];

    const operations = zones.map((z) => {
      const geoRing = canvasRingToGeoRing([z.pixelRing]);
      return {
        updateOne: {
          filter: { zoneId: z.zoneId },
          update: {
            $set: {
              zoneId: z.zoneId,
              name: z.name,
              type: z.type,
              isSoundproof: z.isSoundproof,
              isSpotlightBroadcast: z.isSpotlightBroadcast,
              isActive: true,
              boundary: { type: 'Polygon', coordinates: geoRing },
              canvasBoundary: [z.pixelRing],
            },
          },
          upsert: true,
        },
      };
    });

    const result = await OfficeZone.bulkWrite(operations);

    const totalCount = await OfficeZone.countDocuments();
    const zoneList = await OfficeZone.find().select('zoneId type').lean();
    const finalIndexes = await OfficeZone.collection.indexes();
    const hasBoundary2dsphere = finalIndexes.some((idx) => idx.key && idx.key.boundary === '2dsphere');

    console.log('bulkWrite upserted:', result.upsertedCount);
    console.log('bulkWrite modified:', result.modifiedCount);
    console.log('total zones:', totalCount);
    console.log('zones:', JSON.stringify(zoneList.map((z) => ({ zoneId: z.zoneId, type: z.type }))));
    console.log('indexes:', JSON.stringify(finalIndexes.map((i) => ({ name: i.name, key: i.key })), null, 2));

    if (!hasBoundary2dsphere) {
      throw new Error('boundary 2dsphere index missing on zones collection');
    }

    return { upsertedCount: result.upsertedCount, modifiedCount: result.modifiedCount, totalCount, hasBoundary2dsphere };
  } finally {
    if (!alreadyConnected && mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
    }
  }
}

module.exports = { seedZones };

if (require.main === module) {
  seedZones({ confirmSeed: true })
    .then(() => {
      console.log('Zone seed completed successfully.');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Zone seed failed:', error.message);
      process.exit(1);
    });
}
