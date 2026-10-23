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
  // 3-4-5 right triangle
  assert.equal(calculateDistance(0, 0, 30, 40), 50);
  assert.equal(calculateDistance(100, 100, 100, 100), 0);
  assert.equal(calculateDistance(10, 20, 10, 80), 60);
});

test('isWithinEarshot should respect the 100px default threshold', () => {
  assert.equal(isWithinEarshot(0, 0, 60, 80), true); // distance = 100px (boundary)
  assert.equal(isWithinEarshot(0, 0, 30, 40), true); // distance = 50px (< 100px)
  assert.equal(isWithinEarshot(0, 0, 80, 80), false); // distance = ~113px (> 100px)
});

test('evaluateProximityOnMove should trigger enter, update, and leave transitions', () => {
  activeProximityPairs.clear();

  const userA = { userId: 'alice', socketId: 's-alice', displayName: 'Alice', canvasX: 0, canvasY: 0 };
  const userB = { userId: 'bob', socketId: 's-bob', displayName: 'Bob', canvasX: 50, canvasY: 50 };
  const allUsers = [userA, userB];

  // 1. Enter earshot: distance = ~70.71px (<= 100px)
  const transitionsEnter = evaluateProximityOnMove(userA, allUsers, 100);
  assert.equal(transitionsEnter.length, 1);
  assert.equal(transitionsEnter[0].type, 'enter');
  assert.equal(transitionsEnter[0].distance, 70.71);
  assert.equal(activeProximityPairs.size, 1);

  // 2. Continuous distance update: Alice moves closer to (40, 40)
  userA.canvasX = 40;
  userA.canvasY = 40;
  const transitionsUpdate = evaluateProximityOnMove(userA, allUsers, 100);
  assert.equal(transitionsUpdate.length, 1);
  assert.equal(transitionsUpdate[0].type, 'update');
  assert.equal(transitionsUpdate[0].distance, 14.14);

  // 3. Leave earshot: Alice walks away to (300, 300)
  userA.canvasX = 300;
  userA.canvasY = 300;
  const transitionsLeave = evaluateProximityOnMove(userA, allUsers, 100);
  assert.equal(transitionsLeave.length, 1);
  assert.equal(transitionsLeave[0].type, 'leave');
  assert.equal(activeProximityPairs.size, 0);
});

test('getNearbyPeersForUser should filter and sort by distance', () => {
  const alice = { userId: 'alice', socketId: 's-a', displayName: 'Alice', canvasX: 100, canvasY: 100 };
  const bob = { userId: 'bob', socketId: 's-b', displayName: 'Bob', canvasX: 120, canvasY: 100 }; // 20px
  const charlie = { userId: 'charlie', socketId: 's-c', displayName: 'Charlie', canvasX: 160, canvasY: 100 }; // 60px
  const dave = { userId: 'dave', socketId: 's-d', displayName: 'Dave', canvasX: 500, canvasY: 500 }; // far

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
