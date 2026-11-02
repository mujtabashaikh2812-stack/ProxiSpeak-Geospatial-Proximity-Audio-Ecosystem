'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { connectDB } = require('../db');
const { UserSession } = require('../models/UserSession');
const sessionHistory = require('../sessionHistory');

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
      await UserSession.init();
      dbAvailable = true;
    } catch (memErr) {
      dbAvailable = false;
    }
  }
  if (dbAvailable) {
    await UserSession.deleteMany({});
    await UserSession.init();
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

test('openSession creates open session with null exitedAt', async (t) => {
  if (skip(t)) return;
  await UserSession.deleteMany({});
  const r = await sessionHistory.openSession({ userId: 'u1', zoneId: 'conference-alpha', enteredAt: new Date('2026-01-01T00:00:00Z') });
  assert.equal(r.status, 201);
  assert.equal(r.body.session.exitedAt, null);
});

test('second openSession for same userId refused 409', async (t) => {
  if (skip(t)) return;
  const r = await sessionHistory.openSession({ userId: 'u1', zoneId: 'conference-alpha', enteredAt: new Date('2026-01-01T00:01:00Z') });
  assert.equal(r.status, 409);
});

test('closeSession sets exitedAt and positive dwellSeconds', async (t) => {
  if (skip(t)) return;
  await UserSession.deleteMany({});
  await sessionHistory.openSession({ userId: 'u2', zoneId: 'conference-alpha', enteredAt: new Date('2026-01-01T00:00:00Z') });
  const r = await sessionHistory.closeSession({ userId: 'u2', exitedAt: new Date('2026-01-01T00:00:30Z') });
  assert.equal(r.status, 200);
  assert.ok(r.body.session.exitedAt);
  assert.ok(r.body.session.dwellSeconds > 0);
});

test('closeSession with no open session returns 404', async (t) => {
  if (skip(t)) return;
  const r = await sessionHistory.closeSession({ userId: 'nobody' });
  assert.equal(r.status, 404);
});

test('schema rejects exitedAt earlier than enteredAt', async (t) => {
  if (skip(t)) return;
  const doc = new UserSession({ sessionId: 's-bad', userId: 'ux', zoneId: 'conference-alpha', enteredAt: new Date('2026-01-01T01:00:00Z'), exitedAt: new Date('2026-01-01T00:00:00Z') });
  const err = doc.validateSync();
  assert.ok(err);
});

test('getZoneOccupancy counts only open and sorts userIds', async (t) => {
  if (skip(t)) return;
  await UserSession.deleteMany({});
  await sessionHistory.openSession({ userId: 'a', zoneId: 'conference-alpha', enteredAt: new Date() });
  await sessionHistory.openSession({ userId: 'b', zoneId: 'conference-alpha', enteredAt: new Date() });
  const c = await sessionHistory.openSession({ userId: 'c', zoneId: 'conference-alpha', enteredAt: new Date() });
  await sessionHistory.closeSession({ userId: 'c' });
  const r = await sessionHistory.getZoneOccupancy('conference-alpha');
  assert.equal(r.body.occupancy, 2);
  assert.deepEqual(r.body.userIds, ['a', 'b']);
});

test('getDwellTimeForUser sums across two closed sessions and ignores out of range', async (t) => {
  if (skip(t)) return;
  await UserSession.deleteMany({});
  await sessionHistory.openSession({ userId: 'u3', zoneId: 'conference-alpha', enteredAt: new Date('2026-01-01T00:00:00Z') });
  await sessionHistory.closeSession({ userId: 'u3', exitedAt: new Date('2026-01-01T00:00:10Z') });
  await sessionHistory.openSession({ userId: 'u3', zoneId: 'conference-alpha', enteredAt: new Date('2026-02-01T00:00:00Z') });
  await sessionHistory.closeSession({ userId: 'u3', exitedAt: new Date('2026-02-01T00:00:05Z') });
  const r = await sessionHistory.getDwellTimeForUser('u3', { from: '2026-01-01T00:00:00Z', to: '2026-01-31T23:59:59Z' });
  assert.equal(r.body.totalSeconds, 10);
});

test('getDwellTimeByZone orders by totalSeconds desc', async (t) => {
  if (skip(t)) return;
  await UserSession.deleteMany({});
  await sessionHistory.openSession({ userId: 'x', zoneId: 'conference-alpha', enteredAt: new Date('2026-01-01T00:00:00Z') });
  await sessionHistory.closeSession({ userId: 'x', exitedAt: new Date('2026-01-01T00:00:05Z') });
  await sessionHistory.openSession({ userId: 'y', zoneId: 'stage-podium', enteredAt: new Date('2026-01-01T00:00:00Z') });
  await sessionHistory.closeSession({ userId: 'y', exitedAt: new Date('2026-01-01T00:00:20Z') });
  const r = await sessionHistory.getDwellTimeByZone({});
  assert.equal(r.body.zones[0].zoneId, 'stage-podium');
});

test('partial unique index blocks two open sessions at db level', async (t) => {
  if (skip(t)) return;
  await UserSession.deleteMany({});
  await UserSession.init();
  await UserSession.create({ sessionId: 's1', userId: 'dupuser', zoneId: 'conference-alpha', enteredAt: new Date() });
  let thrown = false;
  try {
    await UserSession.create({ sessionId: 's2', userId: 'dupuser', zoneId: 'conference-alpha', enteredAt: new Date() });
  } catch (e) {
    thrown = true;
  }
  assert.ok(thrown);
});
