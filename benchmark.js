'use strict';

const mongoose = require('mongoose');
const { connectDB } = require('./db');
const { findUsersNearCanvasPoint } = require('./proximityService');
const User = require('./User');

const QUERY_CENTRE_X = 500;
const QUERY_CENTRE_Y = 500;
const RADIUS_PIXELS = 100;
const ITERATIONS = 35;
const WARM_UP = 5;

function percentile(sortedValues, p) {
  const index = Math.ceil((p / 100) * sortedValues.length) - 1;
  return sortedValues[Math.max(0, Math.min(index, sortedValues.length - 1))];
}

function stats(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const avg = values.reduce((sum, v) => sum + v, 0) / values.length;
  const median = percentile(sorted, 50);
  const p95 = percentile(sorted, 95);
  return { min, max, avg, median, p95 };
}

// Converts nanoseconds (bigint) to milliseconds.
function nsToMs(ns) {
  return Number(ns) / 1_000_000;
}

async function runBenchmark() {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/procsispeak';
  const isLocal = uri.includes('127.0.0.1') || uri.includes('localhost');

  console.log('Proximity benchmark');
  console.log('Database:', isLocal ? 'local (127.0.0.1)' : 'remote (URI not disclosed)');
  console.log('Query centre: canvas (', QUERY_CENTRE_X, ',', QUERY_CENTRE_Y, ')');
  console.log('Search radius:', RADIUS_PIXELS, 'canvas pixels');
  console.log('Warm-up runs:', WARM_UP);
  console.log('Measured iterations:', ITERATIONS);
  console.log('Timer: process.hrtime.bigint() (monotonic, nanoseconds)');
  console.log('');

  await connectDB();

  try {
    // Count dataset size
    const datasetSize = await User.countDocuments({});
    console.log('Dataset size:', datasetSize, 'users');

    // Warm-up
    for (let i = 0; i < WARM_UP; i++) {
      await findUsersNearCanvasPoint(QUERY_CENTRE_X, QUERY_CENTRE_Y, RADIUS_PIXELS);
    }

    const fullServiceTimes = [];
    let matchCount = 0;

    for (let i = 0; i < ITERATIONS; i++) {
      const start = process.hrtime.bigint();
      const matches = await findUsersNearCanvasPoint(QUERY_CENTRE_X, QUERY_CENTRE_Y, RADIUS_PIXELS);
      const end = process.hrtime.bigint();
      fullServiceTimes.push(nsToMs(end - start));
      matchCount = matches.length;
    }

    const serviceStats = stats(fullServiceTimes);

    console.log('');
    console.log('Match count:', matchCount);
    console.log('Full proximity-service timing (ms):');
    console.log('  min:', serviceStats.min.toFixed(3));
    console.log('  median:', serviceStats.median.toFixed(3));
    console.log('  average:', serviceStats.avg.toFixed(3));
    console.log('  p95:', serviceStats.p95.toFixed(3));
    console.log('  max:', serviceStats.max.toFixed(3));
    console.log('');
    console.log('What is timed: full findUsersNearCanvasPoint call, including');
    console.log('MongoDB $near candidate retrieval and canvas-distance filtering.');
    console.log('');
    console.log('Note: Database-query-only timing is not separated because the');
    console.log('proximity service performs both operations in a single call.');
    console.log('');
    console.log('Do not guarantee under-20ms performance from these results.');
    console.log('These are development measurements on a small dataset.');
  } finally {
    await mongoose.connection.close();
    console.log('Database connection closed.');
  }
}

runBenchmark().catch((error) => {
  console.error('Benchmark failed:', error.message);
  process.exit(1);
});
