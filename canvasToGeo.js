'use strict';

// Virtual-office coordinate conversion utility.
// These coordinates are synthetic virtual-office positions, NOT real GPS locations.
// This mapping is provisional and requires Mujtaba's approval before production use.

// Approximate metres per degree of latitude (constant everywhere on Earth).
const METRES_PER_DEGREE_LATITUDE = 111320;

// Approximate metres per degree of longitude at the origin latitude.
// At originLat = 0 this equals METRES_PER_DEGREE_LATITUDE.
const METRES_PER_DEGREE_LONGITUDE_AT_ORIGIN = 111320;

// Synthetic origin: canvas (0, 0) maps to GeoJSON (originLongitude, originLatitude).
// These are arbitrary virtual-world reference values, not real places.
const ORIGIN_LONGITUDE = 0;
const ORIGIN_LATITUDE = 0;

// Provisional development scale: 1 canvas pixel = 1 metre.
// This is a default for development only and must be confirmed by the team.
const METRES_PER_PIXEL = 1;

// Canvas y-axis direction: increases downward (standard HTML5 Canvas coordinate system).
// As canvasY increases, the mapped latitude decreases (moves south).

// Supported world bounds in canvas pixels, chosen so mapped GeoJSON coordinates
// always stay within valid longitude (-180 to 180) and latitude (-90 to 90) limits.
const MAX_CANVAS_COORD = 100000;

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

// Converts canvas (x, y) pixel coordinates to a GeoJSON [longitude, latitude] pair.
// canvasX increases to the right (east). canvasY increases downward (south).
function canvasToGeoJSON(canvasX, canvasY) {
  if (!isFiniteNumber(canvasX)) {
    throw new Error('canvasX must be a finite number');
  }
  if (!isFiniteNumber(canvasY)) {
    throw new Error('canvasY must be a finite number');
  }

  if (Math.abs(canvasX) > MAX_CANVAS_COORD || Math.abs(canvasY) > MAX_CANVAS_COORD) {
    throw new Error(
      `Canvas coordinates out of supported bounds: x and y must be between -${MAX_CANVAS_COORD} and ${MAX_CANVAS_COORD}`
    );
  }

  const metresEast = canvasX * METRES_PER_PIXEL;
  const metresSouth = canvasY * METRES_PER_PIXEL;

  const deltaLongitude = metresEast / METRES_PER_DEGREE_LONGITUDE_AT_ORIGIN;
  const deltaLatitude = metresSouth / METRES_PER_DEGREE_LATITUDE;

  const longitude = ORIGIN_LONGITUDE + deltaLongitude;
  const latitude = ORIGIN_LATITUDE - deltaLatitude;

  if (longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) {
    throw new Error('Mapped GeoJSON coordinates are outside valid bounds');
  }

  return [Number(longitude.toFixed(6)), Number(latitude.toFixed(6))];
}

// Converts a radius in canvas pixels to a radius in metres for MongoDB $near queries.
// radiusMetres = radiusPixels * METRES_PER_PIXEL
function pixelsToMetres(radiusPixels) {
  if (!isFiniteNumber(radiusPixels) || radiusPixels < 0) {
    throw new Error('radiusPixels must be a finite nonnegative number');
  }
  return radiusPixels * METRES_PER_PIXEL;
}

module.exports = {
  canvasToGeoJSON,
  pixelsToMetres,
  METRES_PER_PIXEL,
  ORIGIN_LONGITUDE,
  ORIGIN_LATITUDE,
  MAX_CANVAS_COORD,
  isFiniteNumber,
};
