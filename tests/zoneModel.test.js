'use strict';

const test = require('node:test');
const assert = require('node:assert');
const mongoose = require('mongoose');
const { OfficeZone, zoneContainsCanvasPoint } = require('../models/OfficeZone');
const { canvasToGeoJSON, canvasRingToGeoRing } = require('../canvasToGeo');

function makeZone(overrides = {}) {
  const ring = canvasRingToGeoRing([[[0, 0], [100, 0], [100, 100], [0, 100]]]);
  return new OfficeZone({
    zoneId: 'zone-1',
    name: 'Zone',
    type: 'enclosed_room',
    boundary: { type: 'Polygon', coordinates: ring },
    ...overrides,
  });
}

test('OfficeZone: valid projected polygon passes validateSync', () => {
  const z = makeZone();
  const err = z.validateSync();
  assert.strictEqual(err, undefined);
});

test('OfficeZone: zoneId required', () => {
  const z = makeZone({ zoneId: undefined });
  const err = z.validateSync();
  assert.ok(err);
  assert.ok(err.errors.zoneId);
});

test('OfficeZone: blank zoneId rejected', () => {
  const z = makeZone({ zoneId: '   ' });
  const err = z.validateSync();
  assert.ok(err);
});

test('OfficeZone: name required', () => {
  const z = makeZone({ name: undefined });
  const err = z.validateSync();
  assert.ok(err);
  assert.ok(err.errors.name);
});

test('OfficeZone: type rejects lobby', () => {
  const z = makeZone({ type: 'lobby' });
  const err = z.validateSync();
  assert.ok(err);
});

test('OfficeZone: type accepts all three allowed values', () => {
  for (const t of ['enclosed_room', 'spotlight_stage', 'open_workspace']) {
    const z = makeZone({ type: t });
    assert.strictEqual(z.validateSync(), undefined, t);
  }
});

test('OfficeZone: defaults for booleans', () => {
  const z = makeZone();
  assert.strictEqual(z.isSoundproof, false);
  assert.strictEqual(z.isSpotlightBroadcast, false);
  assert.strictEqual(z.isActive, true);
});

test('OfficeZone: boundary.type rejects LineString', () => {
  const ring = canvasRingToGeoRing([[[0, 0], [100, 0], [100, 100], [0, 100]]]);
  const z = makeZone({ boundary: { type: 'LineString', coordinates: ring } });
  const err = z.validateSync();
  assert.ok(err);
});

test('OfficeZone: boundary.type accepts Polygon', () => {
  const ring = canvasRingToGeoRing([[[0, 0], [100, 0], [100, 100], [0, 100]]]);
  const z = makeZone({ boundary: { type: 'Polygon', coordinates: ring } });
  assert.strictEqual(z.validateSync(), undefined);
});

test('OfficeZone: ring with only three positions rejected', () => {
  const a = canvasToGeoJSON(0, 0);
  const b = canvasToGeoJSON(100, 0);
  const c = canvasToGeoJSON(100, 100);
  const z = makeZone({ boundary: { type: 'Polygon', coordinates: [[a, b, c, a]] } });
  // force three distinct positions by removing one -> length 3 ring
  const z2 = makeZone({ boundary: { type: 'Polygon', coordinates: [[a, b, c]] } });
  const err = z2.validateSync();
  assert.ok(err);
});

test('OfficeZone: unclosed ring rejected', () => {
  const ring = canvasRingToGeoRing([[[0, 0], [100, 0], [100, 100], [0, 100]]]);
  // remove closing by making a 4-pos open ring manually using projected coords already closed; reopen by dropping last
  const openRing = ring[0].slice(0, -1);
  const z = makeZone({ boundary: { type: 'Polygon', coordinates: [openRing] } });
  const err = z.validateSync();
  assert.ok(err);
});

test('OfficeZone: longitude 200 and latitude 100 rejected', () => {
  const z = makeZone({ boundary: { type: 'Polygon', coordinates: [[[200, 0], [200, 0], [200, 0], [200, 0]]] } });
  const err = z.validateSync();
  assert.ok(err);
});

test('OfficeZone: NaN in coordinates rejected', () => {
  const z = makeZone({ boundary: { type: 'Polygon', coordinates: [[[NaN, 0], [0, 0], [0, 0], [NaN, 0]]] } });
  const err = z.validateSync();
  assert.ok(err);
});

test('OfficeZone: schema indexes contains boundary 2dsphere', () => {
  const idx = OfficeZone.schema.indexes();
  const found = idx.some((e) => e[0] && e[0].boundary === '2dsphere');
  assert.ok(found, JSON.stringify(idx));
});

test('canvasRingToGeoRing: closes open ring, preserves order, converts known pixel', () => {
  const input = [[[10, 20], [30, 40], [50, 60]]];
  const out = canvasRingToGeoRing(input);
  assert.strictEqual(out.length, 1);
  assert.deepStrictEqual(out[0][0], canvasToGeoJSON(10, 20));
  // closed
  const first = out[0][0];
  const last = out[0][out[0].length - 1];
  assert.deepStrictEqual(last, first);
});

test('zoneContainsCanvasPoint: inside true, outside false', () => {
  const ring = canvasRingToGeoRing([[[0, 0], [100, 0], [100, 100], [0, 100]]]);
  const zone = { boundary: { type: 'Polygon', coordinates: ring } };
  assert.strictEqual(zoneContainsCanvasPoint(zone, 50, 50), true);
  assert.strictEqual(zoneContainsCanvasPoint(zone, 200, 200), false);
});
