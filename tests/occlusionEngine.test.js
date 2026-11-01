'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  OcclusionEngine,
  defaultOcclusionEngine,
  checkLineIntersection,
  MATERIAL_PRESETS,
} = require('../services/occlusionEngine');

test('checkLineIntersection: accurately detects intersecting line segments', () => {
  // Line 1: (0, 0) to (100, 100)
  // Line 2: (0, 100) to (100, 0)
  // Intersection should be at (50, 50)
  const result = checkLineIntersection(0, 0, 100, 100, 0, 100, 100, 0);
  assert.equal(result.intersects, true);
  assert.deepEqual(result.point, { x: 50, y: 50 });
});

test('checkLineIntersection: returns false for parallel or disjoint line segments', () => {
  // Parallel horizontal lines
  const parallel = checkLineIntersection(0, 0, 100, 0, 0, 50, 100, 50);
  assert.equal(parallel.intersects, false);

  // Disjoint lines that would cross only if extended (infinite line), but segments do not meet
  const disjoint = checkLineIntersection(0, 0, 10, 0, 20, 50, 20, 100);
  assert.equal(disjoint.intersects, false);
});

test('OcclusionEngine: clear line of sight returns 100% transmission and full 20kHz spectrum', () => {
  const engine = new OcclusionEngine();
  // Ray across open floor where no default obstacles reside: (400, 400) to (450, 400)
  const result = engine.castSoundRay(400, 400, 450, 400);

  assert.equal(result.isOccluded, false);
  assert.equal(result.transmissionMultiplier, 1.0);
  assert.equal(result.occlusionFactor, 0.0);
  assert.equal(result.cutoffFrequencyHz, 20000);
  assert.equal(result.intersectedCount, 0);
});

test('OcclusionEngine: glass partition dampens volume by 35% with 1800Hz cutoff', () => {
  const engine = new OcclusionEngine();
  // Default glass obstacle is at x: 340, from y: 60 to 280
  // Cast ray from (300, 150) to (380, 150) crossing x=340
  const result = engine.castSoundRay(300, 150, 380, 150);

  assert.equal(result.isOccluded, true);
  assert.equal(result.intersectedCount, 1);
  assert.equal(result.intersectedObstacles[0].material, 'glass');
  assert.equal(result.transmissionMultiplier, 0.65); // 1.0 - 0.35 = 0.65
  assert.equal(result.cutoffFrequencyHz, 1800);
});

test('OcclusionEngine: drywall partition dampens volume by 65% with 800Hz voice muffling', () => {
  const engine = new OcclusionEngine();
  // Default drywall obstacle is at x: 200, from y: 300 to 380
  // Cast ray from (180, 340) to (220, 340) crossing x=200
  const result = engine.castSoundRay(180, 340, 220, 340);

  assert.equal(result.isOccluded, true);
  assert.equal(result.intersectedCount, 1);
  assert.equal(result.intersectedObstacles[0].material, 'drywall');
  assert.equal(result.transmissionMultiplier, 0.35); // 1.0 - 0.65 = 0.35
  assert.equal(result.cutoffFrequencyHz, 800);
});

test('OcclusionEngine: compound multi-barrier intersection multiplies attenuation', () => {
  const engine = new OcclusionEngine({ obstacles: [] });

  // Add 2 parallel partitions: Wall 1 at x=50 (glass), Wall 2 at x=100 (drywall)
  engine.registerObstacle({ id: 'w1', x1: 50, y1: 0, x2: 50, y2: 200, material: 'glass' });
  engine.registerObstacle({ id: 'w2', x1: 100, y1: 0, x2: 100, y2: 200, material: 'drywall' });

  // Ray from x=20 to x=150 crosses both walls
  const result = engine.castSoundRay(20, 100, 150, 100);

  assert.equal(result.isOccluded, true);
  assert.equal(result.intersectedCount, 2);
  // Compound transmission: 0.65 * 0.35 = 0.2275 -> 0.227
  assert.equal(result.transmissionMultiplier, 0.227);
  // Cutoff is the minimum between 1800 and 800 -> 800Hz
  assert.equal(result.cutoffFrequencyHz, 800);
});

test('OcclusionEngine: evaluateAvatars computes effectiveVolume and assigns OCCLUDED mode', () => {
  const engine = new OcclusionEngine();
  const alice = { canvasX: 300, canvasY: 150 };
  const bob = { canvasX: 380, canvasY: 150 }; // Crosses glass partition at x=340

  const evaluation = engine.evaluateAvatars(alice, bob, 0.8);

  assert.equal(evaluation.mode, 'OCCLUDED');
  assert.equal(evaluation.baseVolume, 0.8);
  // 0.8 * 0.65 = 0.52
  assert.equal(evaluation.effectiveVolume, 0.52);
  assert.equal(evaluation.cutoffFrequencyHz, 1800);
});

test('OcclusionEngine: dynamic obstacle registration and removal', () => {
  const engine = new OcclusionEngine({ obstacles: [] });
  assert.equal(engine.getAllObstacles().length, 0);

  engine.registerObstacle({
    id: 'temp-divider',
    name: 'Temporary Foam Screen',
    x1: 200,
    y1: 100,
    x2: 200,
    y2: 300,
    material: 'acoustic_foam',
  });

  assert.equal(engine.getAllObstacles().length, 1);
  const ray = engine.castSoundRay(180, 200, 220, 200);
  assert.equal(ray.isOccluded, true);

  engine.removeObstacle('temp-divider');
  assert.equal(engine.getAllObstacles().length, 0);

  const rayAfterRemoval = engine.castSoundRay(180, 200, 220, 200);
  assert.equal(rayAfterRemoval.isOccluded, false);
});

test('OcclusionEngine: getStats reports accurate raycast metrics and dampening averages', () => {
  const engine = new OcclusionEngine({ obstacles: [] });
  engine.registerObstacle({ id: 'test-wall', x1: 50, y1: 0, x2: 50, y2: 100, material: 'drywall' });

  // 1 clear ray, 1 occluded ray
  engine.castSoundRay(10, 10, 20, 20); // clear
  engine.castSoundRay(40, 50, 60, 50); // occluded by test-wall

  const stats = engine.getStats();
  assert.equal(stats.status, 'operational');
  assert.equal(stats.registeredObstaclesCount, 1);
  assert.equal(stats.metrics.totalRaycasts, 2);
  assert.equal(stats.metrics.occlusionsDetected, 1);
  assert.equal(stats.metrics.clearLineOfSightCount, 1);
  assert.equal(stats.metrics.averageDampeningFactor, 0.65);
});
