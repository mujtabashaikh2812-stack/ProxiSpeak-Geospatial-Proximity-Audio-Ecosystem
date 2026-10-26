'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  calculateDistance,
  isWithinEarshot,
  evaluateProximityOnMove,
  cleanupUserProximity,
  getNearbyPeersForUser,
  activeProximityPairs,
} = require('../services/spatialEngine');

test('calculateDistance should accurately compute 2D Euclidean distance', () => {
  assert.equal(calculateDistance(0, 0, 30, 40), 50);
  assert.equal(calculateDistance(100, 100, 100, 100), 0);
  assert.equal(calculateDistance(10, 20, 10, 80), 60);
});

test('isWithinEarshot should respect the 100px default threshold in open office space', () => {
  // Points in Open Workspace (outside conference room bounds)
  assert.equal(isWithinEarshot(400, 400, 460, 480), true); // distance = 100px (boundary)
  assert.equal(isWithinEarshot(400, 400, 430, 440), true); // distance = 50px (< 100px)
  assert.equal(isWithinEarshot(400, 400, 480, 480), false); // distance = ~113px (> 100px)
});

test('evaluateProximityOnMove should trigger enter, update, and leave transitions', () => {
  activeProximityPairs.clear();

  // Test in Open Workspace
  const userA = { userId: 'alice', socketId: 's-alice', displayName: 'Alice', canvasX: 400, canvasY: 400 };
  const userB = { userId: 'bob', socketId: 's-bob', displayName: 'Bob', canvasX: 450, canvasY: 450 };
  const allUsers = [userA, userB];

  // 1. Enter earshot: distance = ~70.71px (<= 100px)
  const transitionsEnter = evaluateProximityOnMove(userA, allUsers, 100);
  assert.equal(transitionsEnter.length, 1);
  assert.equal(transitionsEnter[0].type, 'enter');
  assert.equal(transitionsEnter[0].distance, 70.71);
  assert.equal(activeProximityPairs.size, 1);

  // 2. Continuous distance update: Alice moves closer to (440, 440)
  userA.canvasX = 440;
  userA.canvasY = 440;
  const transitionsUpdate = evaluateProximityOnMove(userA, allUsers, 100);
  assert.equal(transitionsUpdate.length, 1);
  assert.equal(transitionsUpdate[0].type, 'update');
  assert.equal(transitionsUpdate[0].distance, 14.14);

  // 3. Leave earshot: Alice walks away to (700, 700)
  userA.canvasX = 700;
  userA.canvasY = 700;
  const transitionsLeave = evaluateProximityOnMove(userA, allUsers, 100);
  assert.equal(transitionsLeave.length, 1);
  assert.equal(transitionsLeave[0].type, 'leave');
  assert.equal(activeProximityPairs.size, 0);
});

test('getNearbyPeersForUser should filter and sort by distance in open office', () => {
  const alice = { userId: 'alice', socketId: 's-a', displayName: 'Alice', canvasX: 400, canvasY: 400 };
  const bob = { userId: 'bob', socketId: 's-b', displayName: 'Bob', canvasX: 420, canvasY: 400 }; // 20px
  const charlie = { userId: 'charlie', socketId: 's-c', displayName: 'Charlie', canvasX: 460, canvasY: 400 }; // 60px
  const dave = { userId: 'dave', socketId: 's-d', displayName: 'Dave', canvasX: 800, canvasY: 800 }; // far

  const nearby = getNearbyPeersForUser(alice, [alice, bob, charlie, dave], 100);
  assert.equal(nearby.length, 2);
  assert.equal(nearby[0].userId, 'bob');
  assert.equal(nearby[1].userId, 'charlie');
});

test('cleanupUserProximity should clear active pairs on disconnect', () => {
  activeProximityPairs.clear();
  activeProximityPairs.add('alice::bob');
  activeProximityPairs.add('alice::charlie');

  const remaining = [
    { userId: 'bob', socketId: 's-bob' },
    { userId: 'charlie', socketId: 's-charlie' },
  ];

  const departures = cleanupUserProximity('alice', remaining);
  assert.equal(departures.length, 2);
  assert.equal(activeProximityPairs.size, 0);
});
