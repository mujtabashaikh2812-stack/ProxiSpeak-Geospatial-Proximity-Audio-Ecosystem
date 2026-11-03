'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  validateLayoutData,
  InMemoryOfficeLayoutStore,
} = require('../models/OfficeLayout');

const {
  LayoutPersistenceService,
  defaultLayoutPersistence,
  DEFAULT_OFFICE_LAYOUT,
} = require('../services/layoutPersistence');

const { detectZone, evaluateAcousticRelation } = require('../services/zoneManager');
const { defaultOcclusionEngine } = require('../services/occlusionEngine');

test('validateLayoutData: validates valid floorplan configurations', () => {
  const result = validateLayoutData(DEFAULT_OFFICE_LAYOUT);
  assert.equal(result.valid, true);
  assert.equal(result.errors.length, 0);
});

test('validateLayoutData: catches missing layoutId and invalid dimensions', () => {
  const badLayout = {
    name: 'Invalid Floorplan',
    dimensions: { width: 50, height: 100 }, // Under 200 min
    zones: [
      { zoneId: 'bad-zone', name: 'Bad Zone', bounds: { x: 0, y: 0, width: -10, height: 0 } },
    ],
    obstacles: [
      { id: 'bad-wall', material: 'unsupported_titanium', x1: 0, y1: 0, x2: 'not-a-number', y2: 0 },
    ],
  };

  const result = validateLayoutData(badLayout);
  assert.equal(result.valid, false);
  assert.equal(result.errors.length >= 4, true);
  assert.equal(result.errors.some((e) => e.includes('layoutId is required')), true);
  assert.equal(result.errors.some((e) => e.includes('dimensions.width must be a number >= 200')), true);
  assert.equal(result.errors.some((e) => e.includes('bounds width and height must be positive')), true);
  assert.equal(result.errors.some((e) => e.includes('material must be one of')), true);
});

test('InMemoryOfficeLayoutStore: executes resilient CRUD operations', async () => {
  const store = new InMemoryOfficeLayoutStore();

  const created = await store.create({
    layoutId: 'test-lab',
    name: 'Research & Development Lab',
    dimensions: { width: 800, height: 600 },
    zones: [],
    obstacles: [],
  });

  assert.equal(created.layoutId, 'test-lab');
  assert.equal(created.version, 1);

  // Read
  const found = await store.findOne({ layoutId: 'test-lab' });
  assert.equal(found.name, 'Research & Development Lab');

  // Update
  const updated = await store.findOneAndUpdate(
    { layoutId: 'test-lab' },
    { $set: { name: 'Advanced AI Research Lab' }, $inc: { version: 1 } }
  );
  assert.equal(updated.name, 'Advanced AI Research Lab');
  assert.equal(updated.version, 2);

  // Count & Delete
  assert.equal(await store.countDocuments(), 1);
  const deleteRes = await store.deleteOne({ layoutId: 'test-lab' });
  assert.equal(deleteRes.deletedCount, 1);
  assert.equal(await store.countDocuments(), 0);
});

test('LayoutPersistenceService: loads default office layout with 4 zones and 6 obstacles', () => {
  const service = new LayoutPersistenceService();
  const layout = service.getActiveLayout();

  assert.equal(layout.layoutId, 'default-office');
  assert.equal(layout.dimensions.width, 1200);
  assert.equal(layout.dimensions.height, 800);
  assert.equal(layout.zones.length, 4);
  assert.equal(layout.obstacles.length, 6);
  assert.equal(layout.furniture.length, 8);

  const zoneIds = layout.zones.map((z) => z.zoneId);
  assert.equal(zoneIds.includes('conf-a'), true);
  assert.equal(zoneIds.includes('podium'), true);
  assert.equal(zoneIds.includes('breakout-beta'), true);
  assert.equal(zoneIds.includes('quiet-lounge'), true);
});

test('LayoutPersistenceService: synchronizes zones dynamically with ZoneManager', async () => {
  const service = new LayoutPersistenceService();

  // Create custom layout with a newly added "Design Studio" zone
  const customLayout = {
    layoutId: 'design-floor',
    name: 'Design Studio Floorplan',
    dimensions: { width: 1400, height: 900 },
    zones: [
      {
        zoneId: 'design-studio',
        name: 'Design Innovation Studio',
        type: 'enclosed_room',
        bounds: { x: 300, y: 300, width: 200, height: 150 },
        isSoundproof: true,
      },
    ],
    obstacles: [],
    furniture: [],
  };

  await service.saveLayout(customLayout);

  // Coordinate (350, 350) is inside Design Innovation Studio
  const detected = detectZone(350, 350);
  assert.equal(detected.id, 'design-studio');
  assert.equal(detected.name, 'Design Innovation Studio');
  assert.equal(detected.isSoundproof, true);

  // Cleanly restore default layout
  await service.resetToDefaultLayout();
  const resetZone = detectZone(350, 350);
  assert.equal(resetZone.id, 'open-office');
});

test('LayoutPersistenceService: synchronizes obstacles dynamically with OcclusionEngine', async () => {
  const service = new LayoutPersistenceService();

  // Add custom layout with a single glass wall directly between (100, 100) and (300, 100)
  const layoutWithWall = {
    layoutId: 'acoustics-test',
    name: 'Occlusion Test Layout',
    dimensions: { width: 1000, height: 1000 },
    zones: [],
    obstacles: [
      {
        id: 'test-glass-barrier',
        name: 'Test Glass Wall',
        x1: 200,
        y1: 50,
        x2: 200,
        y2: 250,
        material: 'glass',
      },
    ],
    furniture: [],
  };

  await service.saveLayout(layoutWithWall);

  // Ray from (100, 100) to (300, 100) intersects wall at (200, 100)
  const ray = defaultOcclusionEngine.castSoundRay(100, 100, 300, 100);
  assert.equal(ray.isOccluded, true);
  assert.equal(ray.intersectedCount, 1);
  assert.equal(ray.intersectedObstacles[0].name, 'Test Glass Wall');
  assert.equal(ray.transmissionMultiplier, 0.65); // 1 - 0.35 glass dampening

  // Ray away from the wall (100, 400) to (300, 400) has clear line of sight
  const clearRay = defaultOcclusionEngine.castSoundRay(100, 400, 300, 400);
  assert.equal(clearRay.isOccluded, false);

  // Reset to default
  await service.resetToDefaultLayout();
});

test('LayoutPersistenceService: saveLayout rejects malformed layouts without crashing', async () => {
  const service = new LayoutPersistenceService();

  await assert.rejects(
    async () => {
      await service.saveLayout({ layoutId: '', name: '' });
    },
    { message: /Invalid layout data/ }
  );
});

test('LayoutPersistenceService: getLayoutSummary provides complete telemetry metrics', () => {
  const summary = defaultLayoutPersistence.getLayoutSummary();

  assert.equal(summary.status, 'operational');
  assert.equal(summary.layoutId, 'default-office');
  assert.equal(typeof summary.storageMode, 'string');
  assert.equal(summary.counts.zones >= 2, true);
  assert.equal(summary.counts.obstacles >= 4, true);
  assert.equal(summary.counts.furniture >= 4, true);
  assert.notEqual(summary.lastSyncedAt, null);
});
