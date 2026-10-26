'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  detectZone,
  isPointInBounds,
  evaluateAcousticRelation,
  OFFICE_ZONES,
} = require('../services/zoneManager');

test('isPointInBounds correctly checks 2D rectangle containment', () => {
  const rect = { x: 50, y: 50, width: 100, height: 100 };
  assert.equal(isPointInBounds(60, 60, rect), true);
  assert.equal(isPointInBounds(50, 50, rect), true); // boundary
  assert.equal(isPointInBounds(150, 150, rect), true); // boundary
  assert.equal(isPointInBounds(40, 60, rect), false); // outside left
  assert.equal(isPointInBounds(60, 160, rect), false); // outside bottom
});

test('detectZone identifies Conference Room Alpha and Spotlight Stage', () => {
  // Inside Conference Room Alpha bounds: x: 60..340, y: 60..280
  const room = detectZone(100, 100);
  assert.equal(room.id, 'conf-a');
  assert.equal(room.type, 'enclosed_room');

  // Inside Spotlight Podium bounds: x: 520..660, y: 80..190
  const podium = detectZone(550, 100);
  assert.equal(podium.id, 'podium');
  assert.equal(podium.type, 'spotlight_stage');

  // Outside in Open Workspace
  const open = detectZone(400, 400);
  assert.equal(open.id, 'open-office');
});

test('evaluateAcousticRelation overrides distance when speaker is on Spotlight Podium', () => {
  const speaker = { userId: 'lead', canvasX: 550, canvasY: 100 }; // on podium
  const audience = { userId: 'peer', canvasX: 50, canvasY: 500 }; // 500px away!

  const result = evaluateAcousticRelation(speaker, audience, 500, 100);
  assert.equal(result.canHear, true);
  assert.equal(result.mode, 'spotlight');
  assert.equal(result.effectiveVolume, 1.0);
  assert.equal(result.speakerOnStage, 'lead');
});

test('evaluateAcousticRelation connects peers sharing the same enclosed meeting room', () => {
  const alice = { userId: 'alice', canvasX: 100, canvasY: 100 }; // in conf-a
  const bob = { userId: 'bob', canvasX: 250, canvasY: 200 }; // also in conf-a, 180px away

  const result = evaluateAcousticRelation(alice, bob, 180, 100);
  assert.equal(result.canHear, true);
  assert.equal(result.mode, 'room');
  assert.equal(result.effectiveVolume, 0.95);
});

test('evaluateAcousticRelation blocks sound when one peer is outside conference room', () => {
  const inside = { userId: 'inside', canvasX: 100, canvasY: 100 }; // in conf-a
  const outside = { userId: 'outside', canvasX: 400, canvasY: 100 }; // in hallway outside

  const result = evaluateAcousticRelation(inside, outside, 300, 100);
  assert.equal(result.canHear, false);
  assert.equal(result.mode, 'blocked');
});

test('evaluateAcousticRelation applies proximity in open office space', () => {
  const userA = { userId: 'a', canvasX: 400, canvasY: 400 };
  const userB = { userId: 'b', canvasX: 450, canvasY: 400 }; // 50px away

  const closeResult = evaluateAcousticRelation(userA, userB, 50, 100);
  assert.equal(closeResult.canHear, true);
  assert.equal(closeResult.mode, 'proximity');
  assert.equal(closeResult.effectiveVolume, 0.5);

  const farResult = evaluateAcousticRelation(userA, userB, 150, 100);
  assert.equal(farResult.canHear, false);
  assert.equal(farResult.effectiveVolume, 0);
});
