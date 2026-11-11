'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
let MongoMemoryServer = null;
try {
  ({ MongoMemoryServer } = require('mongodb-memory-server'));
} catch (_) {
  MongoMemoryServer = null;
}
const { connectDB } = require('../db');
const User = require('../User');
const { canvasToGeoJSON } = require('../canvasToGeo');
const {
  getUserProfile,
  updateUserAvatar,
  getProfilesForUsers,
  registerUserRoutes,
} = require('../routes/userRoutes');

const PREFIX = 'userroutes:test:';
let dbAvailable = false;
let memoryServer = null;

function makeUser(suffix, extra) {
  const x = 300;
  const y = 400;
  const [lng, lat] = canvasToGeoJSON(x, y);
  return Object.assign(
    {
      userId: PREFIX + suffix,
      displayName: 'Profile ' + suffix,
      location: { type: 'Point', coordinates: [lng, lat] },
      canvasX: x,
      canvasY: y,
    },
    extra || {}
  );
}

async function cleanUsers() {
  await User.deleteMany({ userId: { $regex: '^' + PREFIX } });
}

test.before(async () => {
  try {
    await connectDB();
    dbAvailable = true;
  } catch (err) {
    if (!MongoMemoryServer) {
      dbAvailable = false;
      return;
    }
    try {
      memoryServer = await MongoMemoryServer.create();
      const uri = await memoryServer.getUri();
      process.env.MONGODB_URI = uri;
      await mongoose.connect(uri);
      dbAvailable = true;
    } catch (memErr) {
      dbAvailable = false;
    }
  }
  if (dbAvailable) {
    await User.init();
    await cleanUsers();
  }
});

test.after(async () => {
  if (dbAvailable && mongoose.connection.readyState === 1) await cleanUsers();
  if (mongoose.connection.readyState !== 0) await mongoose.connection.close();
  if (memoryServer) await memoryServer.stop();
});

function skip(t) {
  if (!dbAvailable) { t.skip('no db'); return true; }
  return false;
}

test('getUserProfile with a blank id returns 400 naming userId', async () => {
  const r = await getUserProfile('   ');
  assert.equal(r.status, 400);
  assert.match(r.body.error, /userId/);
});

test('getUserProfile with a non string id returns 400', async () => {
  const r = await getUserProfile(42);
  assert.equal(r.status, 400);
});

test('getUserProfile for an unknown id returns 404', async (t) => {
  if (skip(t)) return;
  const r = await getUserProfile(PREFIX + 'does-not-exist');
  assert.equal(r.status, 404);
});

test('getUserProfile returns a saved user profile without internals', async (t) => {
  if (skip(t)) return;
  await User.create(makeUser('saved', { avatarColor: '#aabbcc', shirtSpriteId: 'shirt-7', statusMessage: 'hello', status: 'online' }));
  const r = await getUserProfile(PREFIX + 'saved');
  assert.equal(r.status, 200);
  const u = r.body.user;
  assert.equal(u.userId, PREFIX + 'saved');
  assert.equal(u.displayName, 'Profile saved');
  assert.equal(u.avatarColor, '#aabbcc');
  assert.equal(u.shirtSpriteId, 'shirt-7');
  assert.equal(u.statusMessage, 'hello');
  assert.equal(u.status, 'online');
  assert.equal(u.canvasX, 300);
  assert.equal(u.canvasY, 400);
  assert.ok(u.lastSeenAt);
  assert.equal(u._id, undefined);
  assert.equal(u.__v, undefined);
  assert.equal(u.location, undefined);
});

test('getUserProfile falls back to the Mongo _id when the string is a valid ObjectId', async (t) => {
  if (skip(t)) return;
  const created = await User.create(makeUser('byobjectid'));
  const r = await getUserProfile(String(created._id));
  assert.equal(r.status, 200);
  assert.equal(r.body.user.userId, PREFIX + 'byobjectid');
});

test('new profile fields default to null, null and empty string', async (t) => {
  if (skip(t)) return;
  await User.create(makeUser('defaults'));
  const r = await getUserProfile(PREFIX + 'defaults');
  assert.equal(r.status, 200);
  assert.equal(r.body.user.avatarColor, null);
  assert.equal(r.body.user.shirtSpriteId, null);
  assert.equal(r.body.user.statusMessage, '');
});

test('updateUserAvatar with a valid hex colour returns 200 and persists', async (t) => {
  if (skip(t)) return;
  await User.create(makeUser('colour'));
  const r = await updateUserAvatar(PREFIX + 'colour', { avatarColor: '#FF8800' });
  assert.equal(r.status, 200);
  assert.equal(r.body.user.avatarColor, '#FF8800');
  const stored = await User.findOne({ userId: PREFIX + 'colour' }).lean();
  assert.equal(stored.avatarColor, '#FF8800');
});

test('updateUserAvatar stores colour, sprite and message together', async (t) => {
  if (skip(t)) return;
  await User.create(makeUser('all3'));
  const r = await updateUserAvatar(PREFIX + 'all3', { avatarColor: '#102030', shirtSpriteId: ' shirt-12 ', statusMessage: ' in a meeting ' });
  assert.equal(r.status, 200);
  assert.equal(r.body.user.shirtSpriteId, 'shirt-12');
  assert.equal(r.body.user.statusMessage, 'in a meeting');
  const stored = await User.findOne({ userId: PREFIX + 'all3' }).lean();
  assert.equal(stored.avatarColor, '#102030');
  assert.equal(stored.shirtSpriteId, 'shirt-12');
  assert.equal(stored.statusMessage, 'in a meeting');
});

test('updateUserAvatar changes only the supplied fields', async (t) => {
  if (skip(t)) return;
  await User.create(makeUser('partial', { avatarColor: '#111111', statusMessage: 'keep me' }));
  const r = await updateUserAvatar(PREFIX + 'partial', { shirtSpriteId: 'shirt-1' });
  assert.equal(r.status, 200);
  assert.equal(r.body.user.avatarColor, '#111111');
  assert.equal(r.body.user.statusMessage, 'keep me');
  assert.equal(r.body.user.shirtSpriteId, 'shirt-1');
});

test('updateUserAvatar rejects invalid colours with 400 naming avatarColor', async () => {
  for (const bad of ['red', '#12345', '#12345g', '123456', '#1234567']) {
    const r = await updateUserAvatar(PREFIX + 'whatever', { avatarColor: bad });
    assert.equal(r.status, 400, 'colour ' + bad);
    assert.match(r.body.error, /avatarColor/);
  }
});

test('updateUserAvatar with an empty payload returns 400', async () => {
  for (const payload of [{}, null, undefined, [], 'x', { other: 1 }]) {
    const r = await updateUserAvatar(PREFIX + 'whatever', payload);
    assert.equal(r.status, 400);
  }
});

test('updateUserAvatar with a status message longer than 140 characters returns 400', async () => {
  const r = await updateUserAvatar(PREFIX + 'whatever', { statusMessage: 'x'.repeat(141) });
  assert.equal(r.status, 400);
  assert.match(r.body.error, /statusMessage/);
});

test('updateUserAvatar accepts a status message of exactly 140 characters', async (t) => {
  if (skip(t)) return;
  await User.create(makeUser('limit140'));
  const r = await updateUserAvatar(PREFIX + 'limit140', { statusMessage: 'y'.repeat(140) });
  assert.equal(r.status, 200);
  assert.equal(r.body.user.statusMessage.length, 140);
});

test('updateUserAvatar with a shirtSpriteId longer than 64 characters returns 400', async () => {
  const r = await updateUserAvatar(PREFIX + 'whatever', { shirtSpriteId: 's'.repeat(65) });
  assert.equal(r.status, 400);
  assert.match(r.body.error, /shirtSpriteId/);
});

test('updateUserAvatar with a blank id returns 400', async () => {
  const r = await updateUserAvatar('', { avatarColor: '#000000' });
  assert.equal(r.status, 400);
  assert.match(r.body.error, /userId/);
});

test('updateUserAvatar for an unknown user returns 404', async (t) => {
  if (skip(t)) return;
  const r = await updateUserAvatar(PREFIX + 'ghost', { avatarColor: '#000000' });
  assert.equal(r.status, 404);
});

test('updateUserAvatar returns a 500 result instead of throwing on a driver error', async (t) => {
  if (skip(t)) return;
  const original = User.findOneAndUpdate;
  User.findOneAndUpdate = () => { throw Object.assign(new Error('E11000 duplicate key'), { code: 11000 }); };
  try {
    const r = await updateUserAvatar(PREFIX + 'any', { avatarColor: '#000000' });
    assert.equal(r.status, 500);
    assert.ok(r.body.error);
    assert.doesNotMatch(r.body.error, /E11000/);
  } finally {
    User.findOneAndUpdate = original;
  }
});

test('getProfilesForUsers with a non array returns 400', async () => {
  for (const bad of ['a', null, undefined, {}, 5]) {
    const r = await getProfilesForUsers(bad);
    assert.equal(r.status, 400);
  }
});

test('getProfilesForUsers with more than 100 entries returns 400', async () => {
  const ids = Array.from({ length: 101 }, (_, i) => 'u' + i);
  const r = await getProfilesForUsers(ids);
  assert.equal(r.status, 400);
});

test('getProfilesForUsers with a blank entry returns 400', async () => {
  const r = await getProfilesForUsers(['ok', ' ']);
  assert.equal(r.status, 400);
});

test('getProfilesForUsers returns users sorted by userId', async (t) => {
  if (skip(t)) return;
  await User.create([makeUser('batch-c'), makeUser('batch-a'), makeUser('batch-b')]);
  const r = await getProfilesForUsers([PREFIX + 'batch-c', PREFIX + 'batch-a', PREFIX + 'batch-b', PREFIX + 'batch-missing']);
  assert.equal(r.status, 200);
  assert.equal(r.body.count, 3);
  assert.deepEqual(r.body.users.map((u) => u.userId), [PREFIX + 'batch-a', PREFIX + 'batch-b', PREFIX + 'batch-c']);
});

test('getProfilesForUsers with an empty array returns 200 and zero users', async () => {
  const r = await getProfilesForUsers([]);
  assert.equal(r.status, 200);
  assert.equal(r.body.count, 0);
  assert.deepEqual(r.body.users, []);
});

test('registerUserRoutes with a plain object lacking get and put throws a clear error', () => {
  assert.throws(() => registerUserRoutes({}), /Express-like app with get and put/);
  assert.throws(() => registerUserRoutes(null), /Express-like app/);
  assert.throws(() => registerUserRoutes({ get() {} }), /Express-like app/);
});

test('registerUserRoutes registers GET and PUT on the default base path', async (t) => {
  if (skip(t)) return;
  const routes = {};
  const app = {
    get(path, handler) { routes['GET ' + path] = handler; },
    put(path, handler) { routes['PUT ' + path] = handler; },
  };
  registerUserRoutes(app);
  assert.ok(routes['GET /api/db/users/:id']);
  assert.ok(routes['PUT /api/db/users/:id/avatar']);

  await User.create(makeUser('mounted'));
  let sent = null;
  const res = { status(code) { return { json(body) { sent = { status: code, body }; } }; } };
  await routes['PUT /api/db/users/:id/avatar']({ params: { id: PREFIX + 'mounted' }, body: { avatarColor: '#0a0b0c' } }, res);
  assert.equal(sent.status, 200);
  await routes['GET /api/db/users/:id']({ params: { id: PREFIX + 'mounted' } }, res);
  assert.equal(sent.body.user.avatarColor, '#0a0b0c');
});
