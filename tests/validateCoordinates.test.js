'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  OFFICE_MIN_COORD, OFFICE_MAX_X, OFFICE_MAX_Y,
  validateCanvasCoordinate, validateCanvasPoint, sanitizeGeoJSONPoint,
  validateRadiusPixels, validateNearbyRequest, asMiddleware,
} = require('../middleware/validateCoordinates');

test('valid point inside room passes untouched', () => {
  const r = validateCanvasPoint(100, 200);
  assert.equal(r.ok, true);
  assert.equal(r.canvasX, 100);
  assert.equal(r.canvasY, 200);
  assert.equal(r.clamped, false);
});

test('point beyond bounds clamped', () => {
  const r = validateCanvasPoint(1500, 900);
  assert.equal(r.ok, true);
  assert.equal(r.canvasX, 1200);
  assert.equal(r.canvasY, 800);
  assert.equal(r.clamped, true);
});

test('NaN rejected', () => {
  const r = validateCanvasCoordinate(NaN, 'x');
  assert.equal(r.ok, false);
});

test('Infinity rejected', () => {
  assert.equal(validateCanvasCoordinate(Infinity, 'x').ok, false);
});

test('null rejected', () => {
  assert.equal(validateCanvasCoordinate(null, 'x').ok, false);
});

test('undefined rejected', () => {
  assert.equal(validateCanvasCoordinate(undefined, 'x').ok, false);
});

test('empty string rejected', () => {
  assert.equal(validateCanvasCoordinate('', 'x').ok, false);
});

test('array rejected', () => {
  assert.equal(validateCanvasCoordinate([1], 'x').ok, false);
});

test('string 12abc rejected', () => {
  assert.equal(validateCanvasCoordinate('12abc', 'x').ok, false);
});

test('negative clamped to 0', () => {
  const r = validateCanvasCoordinate(-5, 'x');
  assert.equal(r.ok, true);
  assert.equal(r.value, 0);
  assert.equal(r.clamped, true);
});

test('validateCanvasPoint reports both errors', () => {
  const r = validateCanvasPoint(NaN, null);
  assert.equal(r.ok, false);
  assert.equal(r.errors.length, 2);
});

test('sanitizeGeoJSONPoint rejects missing type', () => {
  const r = sanitizeGeoJSONPoint({ coordinates: [0, 0] });
  assert.equal(r.ok, false);
});

test('sanitizeGeoJSONPoint rejects wrong type', () => {
  const r = sanitizeGeoJSONPoint({ type: 'Polygon', coordinates: [0, 0] });
  assert.equal(r.ok, false);
});

test('sanitizeGeoJSONPoint rejects length 1', () => {
  const r = sanitizeGeoJSONPoint({ type: 'Point', coordinates: [0] });
  assert.equal(r.ok, false);
});

test('sanitizeGeoJSONPoint rejects length 3', () => {
  const r = sanitizeGeoJSONPoint({ type: 'Point', coordinates: [0, 0, 0] });
  assert.equal(r.ok, false);
});

test('sanitizeGeoJSONPoint rejects lon 200', () => {
  const r = sanitizeGeoJSONPoint({ type: 'Point', coordinates: [200, 0] });
  assert.equal(r.ok, false);
});

test('sanitizeGeoJSONPoint rejects lat 100', () => {
  const r = sanitizeGeoJSONPoint({ type: 'Point', coordinates: [0, 100] });
  assert.equal(r.ok, false);
});

test('sanitizeGeoJSONPoint rejects swapped pair', () => {
  const r = sanitizeGeoJSONPoint({ type: 'Point', coordinates: [200, 100] });
  // lon 200 already rejected; also test magnitude
  assert.equal(r.ok, false);
});

test('validateRadiusPixels rejects negative', () => {
  const r = validateRadiusPixels(-1);
  assert.equal(r.ok, false);
});

test('validateRadiusPixels rejects NaN', () => {
  const r = validateRadiusPixels(NaN);
  assert.equal(r.ok, false);
});

test('validateRadiusPixels clamps above 100', () => {
  const r = validateRadiusPixels(200);
  assert.equal(r.ok, true);
  assert.equal(r.value, 100);
  assert.equal(r.clamped, true);
});

test('validateNearbyRequest rejects blank userId and reports all bad fields', () => {
  const r = validateNearbyRequest({ userId: '  ', canvasX: NaN, canvasY: null, radiusPixels: -1 });
  assert.equal(r.ok, false);
  assert.ok(r.errors.length >= 3);
});

test('asMiddleware returns 400 for bad input', () => {
  let status, body;
  const res = { status: (s) => { status = s; return res; }, json: (b) => { body = b; } };
  const mw = asMiddleware(() => {});
  mw({ query: { userId: '', canvasX: NaN, canvasY: 0, radiusPixels: 10 } }, res);
  assert.equal(status, 400);
  assert.ok(Array.isArray(body.errors));
});

test('asMiddleware calls handler with sanitized values for good input', () => {
  let received;
  const res = { status: () => res, json: () => res };
  const mw = asMiddleware((v) => { received = v; });
  mw({ query: { userId: 'u', canvasX: 10, canvasY: 20, radiusPixels: 5 } }, res);
  assert.equal(received.ok, true);
  assert.equal(received.canvasX, 10);
});
