'use strict';

const mongoose = require('mongoose');
const { connectDB } = require('./db');
const { findUsersNearCanvasPoint } = require('./proximityService');

const QUERY_CENTRE_X = 500;
const QUERY_CENTRE_Y = 500;
const RADIUS_PIXELS = 100;

async function runDemo() {
  await connectDB();

  try {
    console.log('Proximity query demo');
    console.log('Query centre: canvas (', QUERY_CENTRE_X, ',', QUERY_CENTRE_Y, ')');
    console.log('Search radius:', RADIUS_PIXELS, 'canvas pixels');

    const matches = await findUsersNearCanvasPoint(QUERY_CENTRE_X, QUERY_CENTRE_Y, RADIUS_PIXELS);

    console.log('Matched users:', matches.length);
    console.log('Expected: 4 users within 100 canvas pixels of the query centre.');
    console.log('');

    if (matches.length === 0) {
      console.log('No users matched. Run the seed script first:');
      console.log('  SEED_DB=development node seed.js');
      console.log('');
      console.log('Note: MongoDB must be running for this demo to work.');
      return;
    }

    matches.forEach((user, index) => {
      console.log(
        index + 1,
        '. userId:',
        user.userId,
        '| displayName:',
        user.displayName,
        '| canvas: (',
        user.canvasX,
        ',',
        user.canvasY,
        ') | distance:',
        user.distancePixels,
        'pixels'
      );
    });

    console.log('');
    console.log('Four matches are expected because the seed data places four users at:');
    console.log('  (500, 500) - distance 0');
    console.log('  (550, 500) - distance 50');
    console.log('  (500, 550) - distance 50');
    console.log('  (530, 530) - distance ~42');
    console.log('All are within 100 canvas pixels of the query centre (500, 500).');
    console.log('Six seed users are outside the radius and are correctly excluded.');
  } finally {
    await mongoose.connection.close();
    console.log('Database connection closed.');
  }
}

runDemo().catch((error) => {
  console.error('Demo failed:', error.message);
  process.exit(1);
});
