'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const User = require('../User');
const {
  COMPOUND_INDEX_NAME,
  LEGACY_INDEX_NAME,
  COMPOUND_INDEX_KEY,
  parseArgs,
  planIndexActions,
  applyMigration,
  isCompoundIndex,
  isLegacyIndex,
} = require('../scripts/migrateIndexes');

// Minimal in-memory stand in for a MongoDB collection, so no connection is needed.
function fakeCollection(initial) {
  const list = initial.map((i) => ({ ...i }));
  return {
    list,
    async indexes() { return list.map((i) => ({ ...i })); },
    async createIndex(key, options) {
      list.push({ name: options.name, key });
      return options.name;
    },
    async dropIndex(name) {
      const at = list.findIndex((i) => i.name === name);
      if (at === -1) throw new Error('index not found');
      list.splice(at, 1);
    },
  };
}

const BASE = [
  { name: '_id_', key: { _id: 1 } },
  { name: LEGACY_INDEX_NAME, key: { location: '2dsphere' } },
];

test('User schema declares the single field location index', () => {
  const found = User.schema.indexes().some(
    ([key]) => Object.keys(key).length === 1 && key.location === '2dsphere'
  );
  assert.equal(found, true);
});

test('User schema declares the compound status plus location index', () => {
  const compound = User.schema.indexes().filter(([key]) => 'status' in key && 'location' in key);
  assert.equal(compound.length, 1);
  const key = compound[0][0];
  assert.equal(key.status, 1);
  assert.equal(key.location, '2dsphere');
  assert.deepEqual(Object.keys(key), ['status', 'location']);
});

test('User status field has the enum and offline default', () => {
  const status = User.schema.path('status');
  assert.ok(status);
  assert.deepEqual([...status.enumValues], ['online', 'idle', 'offline']);
  assert.equal(new User({ userId: 'u' }).status, 'offline');
  const bad = new User({ userId: 'u', status: 'busy' }).validateSync();
  assert.ok(bad && bad.errors.status);
  assert.match(bad.errors.status.message, /online, idle, offline/);
});

test('compound creation twice leaves exactly one compound index', async () => {
  const col = fakeCollection(BASE);
  const first = await applyMigration(col, {});
  const second = await applyMigration(col, {});
  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(col.list.filter(isCompoundIndex).length, 1);
  assert.equal(col.list.find(isCompoundIndex).name, COMPOUND_INDEX_NAME);
  assert.deepEqual(col.list.find(isCompoundIndex).key, COMPOUND_INDEX_KEY);
});

test('default path keeps the legacy index when --dropLegacy is absent', async () => {
  assert.equal(parseArgs([]).dropLegacy, false);
  const lines = [];
  const col = fakeCollection(BASE);
  const result = await applyMigration(col, parseArgs([]), (m) => lines.push(m));
  assert.equal(result.dropped, false);
  assert.equal(col.list.some(isLegacyIndex), true);
  assert.ok(lines.some((l) => l.startsWith('Kept legacy')));
});

test('--dropLegacy drops only the single field index', async () => {
  assert.equal(parseArgs(['--dropLegacy']).dropLegacy, true);
  const col = fakeCollection(BASE);
  const result = await applyMigration(col, parseArgs(['--dropLegacy']));
  assert.equal(result.dropped, true);
  assert.equal(col.list.some(isLegacyIndex), false);
  assert.equal(col.list.filter(isCompoundIndex).length, 1);
  assert.equal(planIndexActions(col.list, { dropLegacy: true }).dropLegacy, false);
});
