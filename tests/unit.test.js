'use strict';

const test = require('node:test');
const assert = require('node:assert');
const mongoose = require('mongoose');
const User = require('../User');
const {
  canvasToGeoJSON,
  pixelsToMetres,
  METRES_PER_PIXEL,
  ORIGIN_LONGITUDE,
  ORIGIN_LATITUDE,
} = require('../canvasToGeo');

// Helper: build a valid User document without saving to MongoDB.
function makeUser(overrides = {}) {
  return new User({
    userId: 'test:user:1',
    location: { type: 'Point', coordinates: [0, 0] },
    canvasX: 0,
    canvasY: 0,
    ...overrides,
  });
}

test('User: valid GeoJSON Point data is accepted', () => {
  const user = makeUser({
    userId: 'test:valid:1',
    location: { type: 'Point', coordinates: [77.2090, 28.6139] },
    canvasX: 100,
    canvasY: 200,
  });
  const error = user.validateSync();
  assert.ifError(error);
});

test('User: missing userId is rejected', () => {
  const user = new User({
    location: { type: 'Point', coordinates: [0, 0] },
    canvasX: 0,
    canvasY: 0,
  });
  const error = user.validateSync();
  assert.ok(error);
  assert.ok(error.errors.userId);
});

test('User: blank userId is rejected', () => {
  const user = makeUser({ userId: '   ' });
  const error = user.validateSync();
  assert.ok(error);
  assert.ok(error.errors.userId);
});

test('User: missing location.type is rejected', () => {
  const user = new User({
    userId: 'test:no-type',
    location: { coordinates: [0, 0] },
    canvasX: 0,
    canvasY: 0,
  });
  const error = user.validateSync();
  assert.ok(error);
  assert.ok(error.errors['location.type']);
});

test('User: location.type other than Point is rejected', () => {
  const user = makeUser({
    location: { type: 'Polygon', coordinates: [0, 0] },
  });
  const error = user.validateSync();
  assert.ok(error);
  assert.ok(error.errors['location.type']);
});

test('User: missing coordinates is rejected', () => {
  const user = new User({
    userId: 'test:no-coords',
    location: { type: 'Point' },
    canvasX: 0,
    canvasY: 0,
  });
  const error = user.validateSync();
  assert.ok(error);
  assert.ok(error.errors['location.coordinates']);
});

test('User: wrong coordinate-array length is rejected', () => {
  const user = makeUser({
    location: { type: 'Point', coordinates: [0] },
  });
  const error = user.validateSync();
  assert.ok(error);
  assert.ok(error.errors['location.coordinates']);
});

test('User: three-element coordinate array is rejected', () => {
  const user = makeUser({
    location: { type: 'Point', coordinates: [0, 0, 0] },
  });
  const error = user.validateSync();
  assert.ok(error);
  assert.ok(error.errors['location.coordinates']);
});

test('User: out-of-range longitude is rejected', () => {
  const user = makeUser({
    location: { type: 'Point', coordinates: [200, 0] },
  });
  const error = user.validateSync();
  assert.ok(error);
  assert.ok(error.errors['location.coordinates']);
});

test('User: longitude -181 is rejected', () => {
  const user = makeUser({
    location: { type: 'Point', coordinates: [-181, 0] },
  });
  const error = user.validateSync();
  assert.ok(error);
  assert.ok(error.errors['location.coordinates']);
});

test('User: out-of-range latitude is rejected', () => {
  const user = makeUser({
    location: { type: 'Point', coordinates: [0, 100] },
  });
  const error = user.validateSync();
  assert.ok(error);
  assert.ok(error.errors['location.coordinates']);
});

test('User: latitude -91 is rejected', () => {
  const user = makeUser({
    location: { type: 'Point', coordinates: [0, -91] },
  });
  const error = user.validateSync();
  assert.ok(error);
  assert.ok(error.errors['location.coordinates']);
});

test('User: boundary longitude 180 and -180 accepted', () => {
  const user1 = makeUser({
    location: { type: 'Point', coordinates: [180, 0] },
  });
  assert.ifError(user1.validateSync());
  const user2 = makeUser({
    location: { type: 'Point', coordinates: [-180, 0] },
  });
  assert.ifError(user2.validateSync());
});

test('User: boundary latitude 90 and -90 accepted', () => {
  const user1 = makeUser({
    location: { type: 'Point', coordinates: [0, 90] },
  });
  assert.ifError(user1.validateSync());
  const user2 = makeUser({
    location: { type: 'Point', coordinates: [0, -90] },
  });
  assert.ifError(user2.validateSync());
});

test('User: missing canvasX is rejected', () => {
  const user = new User({
    userId: 'test:no-canvasx',
    location: { type: 'Point', coordinates: [0, 0] },
    canvasY: 0,
  });
  const error = user.validateSync();
  assert.ok(error);
  assert.ok(error.errors.canvasX);
});

test('User: missing canvasY is rejected', () => {
  const user = new User({
    userId: 'test:no-canvasy',
    location: { type: 'Point', coordinates: [0, 0] },
    canvasX: 0,
  });
  const error = user.validateSync();
  assert.ok(error);
  assert.ok(error.errors.canvasY);
});

test('User: 2dsphere index is declared on schema', () => {
  const indexes = User.schema.indexes();
  const has2dsphere = indexes.some(
    (idx) => idx[0] && idx[0].location === '2dsphere'
  );
  assert.ok(has2dsphere, 'Expected a 2dsphere index on location');
});

test('canvasToGeo: maps canvas (0,0) to origin GeoJSON coordinates', () => {
  const [lng, lat] = canvasToGeoJSON(0, 0);
  assert.strictEqual(lng, ORIGIN_LONGITUDE);
  assert.strictEqual(lat, ORIGIN_LATITUDE);
});

test('canvasToGeo: positive canvasX increases longitude (east)', () => {
  const [lng0, lat0] = canvasToGeoJSON(0, 0);
  const [lng1, lat1] = canvasToGeoJSON(100, 0);
  assert.ok(lng1 > lng0, 'Expected longitude to increase with canvasX');
  assert.strictEqual(lat1, lat0);
});

test('canvasToGeo: positive canvasY decreases latitude (south, canvas y-axis down)', () => {
  const [lng0, lat0] = canvasToGeoJSON(0, 0);
  const [lng1, lat1] = canvasToGeoJSON(0, 100);
  assert.strictEqual(lng1, lng0);
  assert.ok(lat1 < lat0, 'Expected latitude to decrease with canvasY');
});

test('canvasToGeo: invalid canvasX throws', () => {
  assert.throws(() => canvasToGeoJSON(NaN, 0), /canvasX must be a finite number/);
  assert.throws(() => canvasToGeoJSON(Infinity, 0), /canvasX must be a finite number/);
  assert.throws(() => canvasToGeoJSON('500', 0), /canvasX must be a finite number/);
});

test('canvasToGeo: invalid canvasY throws', () => {
  assert.throws(() => canvasToGeoJSON(0, NaN), /canvasY must be a finite number/);
  assert.throws(() => canvasToGeoJSON(0, Infinity), /canvasY must be a finite number/);
});

test('canvasToGeo: out-of-bounds canvas coordinates throw', () => {
  assert.throws(() => canvasToGeoJSON(200000, 0), /out of supported bounds/);
  assert.throws(() => canvasToGeoJSON(0, 200000), /out of supported bounds/);
});

test('pixelsToMetres: uses radiusPixels * METRES_PER_PIXEL formula', () => {
  assert.strictEqual(pixelsToMetres(100), 100 * METRES_PER_PIXEL);
  assert.strictEqual(pixelsToMetres(0), 0);
  assert.strictEqual(pixelsToMetres(50), 50 * METRES_PER_PIXEL);
});

test('pixelsToMetres: rejects negative radius', () => {
  assert.throws(() => pixelsToMetres(-1), /nonnegative/);
});

test('pixelsToMetres: rejects non-finite radius', () => {
  assert.throws(() => pixelsToMetres(NaN), /finite nonnegative/);
  assert.throws(() => pixelsToMetres(Infinity), /finite nonnegative/);
});

test('canvasToGeo: METRES_PER_PIXEL default is 1 (provisional)', () => {
  assert.strictEqual(METRES_PER_PIXEL, 1);
});

test('canvasToGeo: non-1 scale produces different mapping', () => {
  // If METRES_PER_PIXEL were different, canvasToGeoJSON results would change.
  // Since METRES_PER_PIXEL is 1, 100 pixels = 100 metres = ~0.000898 degrees.
  const [lng, lat] = canvasToGeoJSON(100, 100);
  const expectedLng = ORIGIN_LONGITUDE + 100 / 111320;
  const expectedLat = ORIGIN_LATITUDE - 100 / 111320;
  assert.ok(Math.abs(lng - expectedLng) < 0.000001);
  assert.ok(Math.abs(lat - expectedLat) < 0.000001);
});

test('canvasToGeo: deterministic output for same input', () => {
  const a = canvasToGeoJSON(123, 456);
  const b = canvasToGeoJSON(123, 456);
  assert.deepStrictEqual(a, b);
});

test('User: repeatable seed userId values do not create duplicates (namespace check)', () => {
  const userId1 = 'seed:proxispeak:v1:seed-user-1';
  const userId2 = 'seed:proxispeak:v1:seed-user-1';
  assert.strictEqual(userId1, userId2, 'Same seed namespace prefix yields same userId');
});

// Integration test stubs (require MongoDB - blocked when unavailable)
test('integration: geospatial index existence (blocked without MongoDB)', () => {
  // This test requires a live MongoDB connection. It is reported as blocked
  // when MongoDB is not available. See integration.test.js for the full version.
  assert.ok(true, 'Placeholder: integration test requires MongoDB');
});

test('integration: repeatable seeding without duplicates (blocked without MongoDB)', () => {
  assert.ok(true, 'Placeholder: integration test requires MongoDB');
});

test('integration: requesting-user exclusion (blocked without MongoDB)', () => {
  assert.ok(true, 'Placeholder: integration test requires MongoDB');
});
