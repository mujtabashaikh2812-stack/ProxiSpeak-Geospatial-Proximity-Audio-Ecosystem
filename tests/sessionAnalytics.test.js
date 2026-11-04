'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { InMemoryUserSessionStore } = require('../models/UserSession');
const {
  SessionAnalyticsEngine,
  defaultSessionAnalytics,
  ROOM_CAPACITIES,
} = require('../services/sessionAnalytics');

test('InMemoryUserSessionStore: performs CRUD operations and filter queries', async () => {
  const store = new InMemoryUserSessionStore();

  const created = await store.create({
    sessionId: 'sess_1',
    userId: 'user_alice',
    displayName: 'Alice Engineer',
    joinedAt: new Date(Date.now() - 60000),
    initialZone: 'conf-a',
    currentZone: 'conf-a',
  });

  assert.equal(created.sessionId, 'sess_1');
  assert.equal(created.userId, 'user_alice');
  assert.equal(created.currentZone, 'conf-a');

  // Find active
  const active = await store.find({ active: true });
  assert.equal(active.length, 1);

  // Update
  const updated = await store.findOneAndUpdate(
    { sessionId: 'sess_1' },
    { $set: { leftAt: new Date(), totalDwellSeconds: 60 } }
  );
  assert.equal(updated.totalDwellSeconds, 60);

  // Completed
  const activeAfterClose = await store.find({ active: true });
  assert.equal(activeAfterClose.length, 0);
  assert.equal(await store.countDocuments(), 1);
});

test('SessionAnalyticsEngine: starts session with accurate metadata and zone tracking', () => {
  const engine = new SessionAnalyticsEngine();

  const session = engine.startSession({
    userId: 'bob-backend',
    displayName: 'Bob Backend',
    socketId: 'sock-123',
    canvasX: 100,
    canvasY: 150,
    zone: 'conf-a',
    zoneName: 'Conference Room Alpha',
  });

  assert.equal(session.userId, 'bob-backend');
  assert.equal(session.displayName, 'Bob Backend');
  assert.equal(session.socketId, 'sock-123');
  assert.equal(session.currentZone, 'conf-a');
  assert.equal(session.lastPosition.x, 100);
  assert.equal(session.lastPosition.y, 150);
  assert.equal(session.zonesVisited.length, 1);
  assert.equal(session.zonesVisited[0].zoneId, 'conf-a');
  assert.equal(session.zonesVisited[0].leftAt, null);

  const occupancy = engine.getRoomOccupancy();
  assert.equal(occupancy['conf-a'].count, 1);
  assert.equal(occupancy['conf-a'].occupants[0].userId, 'bob-backend');
});

test('SessionAnalyticsEngine: accumulates movement distance odometer accurately', () => {
  const engine = new SessionAnalyticsEngine();

  engine.startSession({
    userId: 'charlie-walker',
    canvasX: 0,
    canvasY: 0,
    zone: 'open-office',
  });

  // Move 30px right, 40px down -> Euclidean distance = 50px
  const move1 = engine.recordMovement('charlie-walker', 30, 40);
  assert.equal(move1.totalDistancePixels, 50);

  // Move another 50px right -> distance from (30,40) to (80,40) is 50px -> total = 100px
  const move2 = engine.recordMovement('charlie-walker', 80, 40);
  assert.equal(move2.totalDistancePixels, 100);

  const active = engine.getActiveSessions().find((s) => s.userId === 'charlie-walker');
  assert.equal(active.totalDistancePixels, 100);
});

test('SessionAnalyticsEngine: handles zone transitions and records dwell time', async () => {
  const engine = new SessionAnalyticsEngine();

  engine.startSession({
    userId: 'diana-speaker',
    zone: 'open-office',
    zoneName: 'Open Workspace',
  });

  // Wait 15ms to ensure measurable timestamp difference
  await new Promise((r) => setTimeout(r, 15));

  // Diana steps onto the Town Hall Stage
  engine.recordZoneTransition('diana-speaker', 'open-office', 'podium', 'Town Hall Stage & Podium');

  const occupancy = engine.getRoomOccupancy();
  assert.equal(occupancy['open-office'].count, 0);
  assert.equal(occupancy['podium'].count, 1);
  assert.equal(occupancy['podium'].occupants[0].userId, 'diana-speaker');

  const active = engine.getActiveSessions().find((s) => s.userId === 'diana-speaker');
  assert.equal(active.currentZone, 'podium');
  assert.equal(active.zonesVisited.length, 2);
  assert.equal(active.zonesVisited[0].zoneId, 'open-office');
  assert.notEqual(active.zonesVisited[0].leftAt, null);
  assert.equal(active.zonesVisited[1].zoneId, 'podium');
  assert.equal(active.zonesVisited[1].leftAt, null);
  assert.equal(active.audioStats.stageBroadcastCount, 1);
});

test('SessionAnalyticsEngine: terminates session, calculates total dwell time, and removes from room occupancy', async () => {
  const engine = new SessionAnalyticsEngine();

  engine.startSession({
    userId: 'evan-guest',
    zone: 'conf-a',
    zoneName: 'Conference Room Alpha',
  });

  assert.equal(engine.getRoomOccupancy()['conf-a'].count, 1);

  await new Promise((r) => setTimeout(r, 20));

  const completed = await engine.endSession('evan-guest');
  assert.equal(completed.userId, 'evan-guest');
  assert.notEqual(completed.leftAt, null);
  assert.equal(typeof completed.totalDwellSeconds, 'number');

  // Room occupancy should decrement to 0
  assert.equal(engine.getRoomOccupancy()['conf-a'].count, 0);
  assert.equal(engine.getActiveSessions().length, 0);

  // Session persisted in store
  const history = await engine.getUserHistory('evan-guest');
  assert.equal(history.length, 1);
  assert.equal(history[0].userId, 'evan-guest');
});

test('SessionAnalyticsEngine: room occupancy flags when room reaches capacity limit', () => {
  const engine = new SessionAnalyticsEngine({
    customCapacities: { 'conf-a': 2 },
  });

  engine.startSession({ userId: 'user1', zone: 'conf-a' });
  let occ = engine.getRoomOccupancy();
  assert.equal(occ['conf-a'].count, 1);
  assert.equal(occ['conf-a'].isAtCapacity, false);
  assert.equal(occ['conf-a'].occupancyPercentage, 50);

  engine.startSession({ userId: 'user2', zone: 'conf-a' });
  occ = engine.getRoomOccupancy();
  assert.equal(occ['conf-a'].count, 2);
  assert.equal(occ['conf-a'].isAtCapacity, true);
  assert.equal(occ['conf-a'].occupancyPercentage, 100);
});

test('SessionAnalyticsEngine: getAggregatedMetrics provides system-wide telemetry', async () => {
  const engine = new SessionAnalyticsEngine();

  engine.startSession({ userId: 'u1', canvasX: 0, canvasY: 0, zone: 'conf-a' });
  engine.recordMovement('u1', 60, 80); // 100px

  const metrics = await engine.getAggregatedMetrics();
  assert.equal(metrics.service.includes('Analytics Engine'), true);
  assert.equal(metrics.status, 'operational');
  assert.equal(metrics.activeUsersCount, 1);
  assert.equal(typeof metrics.averages.averageDistanceTraveledPixels, 'number');
  assert.notEqual(metrics.roomOccupancy, null);
});

test('defaultSessionAnalytics singleton is available and operational', () => {
  assert.notEqual(defaultSessionAnalytics, null);
  const occ = defaultSessionAnalytics.getRoomOccupancy();
  assert.notEqual(occ['open-office'], null);
  assert.notEqual(occ['conf-a'], null);
  assert.notEqual(occ['podium'], null);
});
