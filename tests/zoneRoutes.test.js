'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { connectDB } = require('../db');
const OfficeZone = require('../models/OfficeZone').OfficeZone;
const { seedZones } = require('../scripts/seedZones');
const { listZones, createZone, findZonesContainingCanvasPoint } = require('../routes/zoneRoutes');
const { canvasRingToGeoRing } = require('../canvasToGeo');

let dbAvailable = false;
let memoryServer = null;

test.before(async () => {
  try {
    await connectDB();
    dbAvailable = true;
  } catch (err) {
    try {
      memoryServer = await MongoMemoryServer.create();
      const uri = await memoryServer.getUri();
      process.env.MONGODB_URI = uri;
      await mongoose.connect(uri);
      await OfficeZone.init();
      dbAvailable = true;
    } catch (memErr) {
      dbAvailable = false;
    }
  }
  if (dbAvailable) {
    await OfficeZone.deleteMany({});
    await seedZones({ confirmSeed: true });
  }
});

test.after(async () => {
  if (mongoose.connection.readyState === 1) await mongoose.connection.close();
  if (memoryServer) await memoryServer.stop();
});

function skip(t) {
  if (!dbAvailable) { t.skip('no db'); return true; }
  return false;
}

test('listZones no query returns 200', async (t) => {
  if (skip(t)) return;
  const r = await listZones({});
  assert.equal(r.status, 200);
  assert.ok(r.body.count >= 0);
});

test('listZones invalid type returns 400', async (t) => {
  if (skip(t)) return;
  const r = await listZones({ type: 'lobby' });
  assert.equal(r.status, 400);
});

test('listZones only containsX returns 400', async (t) => {
  if (skip(t)) return;
  const r = await listZones({ containsX: 10 });
  assert.equal(r.status, 400);
});

test('listZones out of range returns 400', async (t) => {
  if (skip(t)) return;
  const r = await listZones({ containsX: 200000, containsY: 0 });
  assert.equal(r.status, 400);
});

test('createZone valid canvasBoundary returns 201 and closed boundary', async (t) => {
  if (skip(t)) return;
  await OfficeZone.deleteMany({ zoneId: 'test-zone' });
  const r = await createZone({
    zoneId: 'test-zone',
    name: 'Test Zone',
    type: 'enclosed_room',
    canvasBoundary: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]],
  });
  assert.equal(r.status, 201);
  const coords = r.body.zone.boundary.coordinates[0];
  assert.deepEqual(coords[0], coords[coords.length - 1]);
  await OfficeZone.deleteMany({ zoneId: 'test-zone' });
});

test('createZone unclosed ring returns 400', async (t) => {
  if (skip(t)) return;
  const r = await createZone({
    zoneId: 'test-zone2',
    name: 'Test Zone 2',
    type: 'enclosed_room',
    canvasBoundary: [[[0, 0], [10, 0], [10, 10], [0, 10]]],
  });
  assert.equal(r.status, 400);
});

test('createZone blank zoneId returns 400', async (t) => {
  if (skip(t)) return;
  const r = await createZone({
    zoneId: '   ',
    name: 'Test Zone 3',
    type: 'enclosed_room',
    canvasBoundary: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]],
  });
  assert.equal(r.status, 400);
});

test('createZone duplicate zoneId returns 409', async (t) => {
  if (skip(t)) return;
  await OfficeZone.deleteMany({ zoneId: 'dup-zone' });
  await createZone({
    zoneId: 'dup-zone',
    name: 'Dup',
    type: 'enclosed_room',
    canvasBoundary: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]],
  });
  const r = await createZone({
    zoneId: 'dup-zone',
    name: 'Dup2',
    type: 'enclosed_room',
    canvasBoundary: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]],
  });
  assert.equal(r.status, 409);
  await OfficeZone.deleteMany({ zoneId: 'dup-zone' });
});

test('findZonesContainingCanvasPoint inside Conference Room Alpha', async (t) => {
  if (skip(t)) return;
  const r = await findZonesContainingCanvasPoint(100, 100);
  assert.equal(r.status, 200);
  const ids = r.body.zones.map((z) => z.zoneId);
  assert.ok(ids.includes('conference-alpha'));
});

test('findZonesContainingCanvasPoint outside returns zero', async (t) => {
  if (skip(t)) return;
  const r = await findZonesContainingCanvasPoint(-50, -50);
  assert.equal(r.status, 200);
  assert.equal(r.body.count, 0);
});
