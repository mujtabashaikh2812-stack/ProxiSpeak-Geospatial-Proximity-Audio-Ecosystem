'use strict';

const mongoose = require('mongoose');
const User = require('./User');
const { canvasToGeoJSON, pixelsToMetres, isFiniteNumber } = require('./canvasToGeo');

// Proximity service for Week 2: find users within a canvas pixel radius of a query centre.
// The API centre is a query point (canvas coordinates), not necessarily an actual user.
// Uses MongoDB $near on the 2dsphere-indexed GeoJSON location for candidate retrieval,
// then applies an exact canvas-distance filter for the final result.
//
// Coordinate mapping is provisional (1 metre per pixel) and requires Mujtaba's approval.

function validateCentre(centreX, centreY) {
  if (!isFiniteNumber(centreX)) {
    throw new Error('centreX must be a finite number');
  }
  if (!isFiniteNumber(centreY)) {
    throw new Error('centreY must be a finite number');
  }
}

function validateRadius(radiusPixels) {
  if (!isFiniteNumber(radiusPixels)) {
    throw new Error('radiusPixels must be a finite number');
  }
  if (radiusPixels < 0) {
    throw new Error('radiusPixels must be nonnegative');
  }
}

async function findUsersNearCanvasPoint(centreX, centreY, radiusPixels, options = {}) {
  validateCentre(centreX, centreY);
  validateRadius(radiusPixels);

  const excludeUserId = options.excludeUserId || null;
  const limit = options.limit || 50;

  const [centreLongitude, centreLatitude] = canvasToGeoJSON(centreX, centreY);
  const radiusMetres = pixelsToMetres(radiusPixels);

  // Candidate retrieval via indexed $near query.
  // $maxDistance is in metres for a 2dsphere index.
  // Because METRES_PER_PIXEL = 1 (provisional), radiusMetres === radiusPixels.
  // Spherical distance and flat canvas distance differ slightly; the exact
  // canvas-distance filter below is the final arbiter.
  const candidates = await User.find({
    location: {
      $near: {
        $geometry: { type: 'Point', coordinates: [centreLongitude, centreLatitude] },
        $maxDistance: radiusMetres,
      },
    },
  })
    .select('userId canvasX canvasY displayName location')
    .limit(limit)
    .lean();

  // Exact canvas-distance filter: Euclidean distance on the 2D virtual office canvas.
  const results = candidates
    .filter((user) => {
      if (excludeUserId && user.userId === excludeUserId) {
        return false;
      }
      const distancePixels = Math.hypot(user.canvasX - centreX, user.canvasY - centreY);
      return distancePixels <= radiusPixels;
    })
    .map((user) => ({
      userId: user.userId,
      displayName: user.displayName,
      canvasX: user.canvasX,
      canvasY: user.canvasY,
      distancePixels: Math.round(Math.hypot(user.canvasX - centreX, user.canvasY - centreY) * 100) / 100,
    }));

  return results;
}

module.exports = {
  findUsersNearCanvasPoint,
  validateCentre,
  validateRadius,
};
