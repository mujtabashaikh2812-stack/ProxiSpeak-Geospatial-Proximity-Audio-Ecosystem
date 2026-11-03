'use strict';

const { UserSession } = require('./models/UserSession');

function errResult(status, field, message) {
  return { status, body: { error: message, field } };
}

function isFiniteNumber(v) { return typeof v === 'number' && Number.isFinite(v); }

function validateUserId(userId) {
  if (typeof userId !== 'string' || userId.trim() === '') return 'userId must be a non-empty string';
  if (userId.length > 120) return 'userId must be at most 120 characters';
  return null;
}

async function openSession({ userId, zoneId, enteredAt, positionX, positionY } = {}) {
  const uErr = validateUserId(userId);
  if (uErr) return { status: 400, body: { error: uErr, field: 'userId' } };
  if (typeof zoneId !== 'string' || zoneId.trim() === '') return { status: 400, body: { error: 'zoneId must be a non-empty string', field: 'zoneId' } };
  const entered = enteredAt === undefined ? new Date() : new Date(enteredAt);
  if (Number.isNaN(entered.getTime())) return { status: 400, body: { error: 'enteredAt must be a valid date', field: 'enteredAt' } };
  if (positionX !== undefined && !isFiniteNumber(positionX)) return { status: 400, body: { error: 'positionX must be a finite number', field: 'positionX' } };
  if (positionY !== undefined && !isFiniteNumber(positionY)) return { status: 400, body: { error: 'positionY must be a finite number', field: 'positionY' } };

  const existing = await UserSession.findOne({ userId: userId.trim(), exitedAt: null }).lean();
  if (existing) return { status: 409, body: { error: 'user already has an open session', field: 'userId' } };

  const doc = await UserSession.create({
    sessionId: `session:${userId.trim()}:${entered.getTime()}`,
    userId: userId.trim(),
    zoneId: zoneId.trim().toLowerCase(),
    enteredAt: entered,
    joinedAt: entered,
    totalDwellSeconds: 0,
    lastPositionX: positionX,
    lastPositionY: positionY,
  });
  return { status: 201, body: { session: doc.toObject ? doc.toObject() : doc } };
}

async function closeSession({ userId, exitedAt } = {}) {
  const uErr = validateUserId(userId);
  if (uErr) return { status: 400, body: { error: uErr, field: 'userId' } };
  const session = await UserSession.findOne({ userId: userId.trim(), exitedAt: null });
  if (!session) return { status: 404, body: { error: 'no open session for user', field: 'userId' } };
  const exited = exitedAt === undefined ? new Date() : new Date(exitedAt);
  if (Number.isNaN(exited.getTime())) return { status: 400, body: { error: 'exitedAt must be a valid date', field: 'exitedAt' } };
  if (exited < session.enteredAt) return { status: 400, body: { error: 'exitedAt must be >= enteredAt', field: 'exitedAt' } };
  session.exitedAt = exited;
  session.leftAt = exited;
  session.dwellSeconds = Math.floor((exited.getTime() - session.enteredAt.getTime()) / 1000);
  session.totalDwellSeconds = session.dwellSeconds;
  if (Array.isArray(session.zonesVisited)) {
    for (const zv of session.zonesVisited) {
      if (zv.leftAt === null) zv.leftAt = exited;
    }
  }
  await session.save();
  return { status: 200, body: { session: session.toObject ? session.toObject() : session } };
}

async function getZoneOccupancy(zoneId) {
  if (typeof zoneId !== 'string' || zoneId.trim() === '') return { status: 400, body: { error: 'zoneId must be a non-empty string', field: 'zoneId' } };
  const sessions = await UserSession.find({ zoneId: zoneId.trim().toLowerCase(), exitedAt: null }).lean();
  const userIds = sessions.map((s) => s.userId).sort();
  return { status: 200, body: { zoneId: zoneId.trim().toLowerCase(), occupancy: userIds.length, userIds } };
}

async function getDwellTimeForUser(userId, options) {
  const uErr = validateUserId(userId);
  if (uErr) return { status: 400, body: { error: uErr, field: 'userId' } };
  const opts = options || {};
  const filter = { userId: userId.trim(), exitedAt: { $ne: null } };
  if (opts.from) {
    const from = new Date(opts.from);
    if (Number.isNaN(from.getTime())) return { status: 400, body: { error: 'from must be a valid date', field: 'from' } };
    filter.enteredAt = Object.assign(filter.enteredAt || {}, { $gte: from });
  }
  if (opts.to) {
    const to = new Date(opts.to);
    if (Number.isNaN(to.getTime())) return { status: 400, body: { error: 'to must be a valid date', field: 'to' } };
    filter.enteredAt = Object.assign(filter.enteredAt || {}, { $lte: to });
  }
  const sessions = await UserSession.find(filter).sort({ enteredAt: 1 }).lean();
  const totalSeconds = sessions.reduce((sum, s) => sum + (s.dwellSeconds || 0), 0);
  return { status: 200, body: { userId: userId.trim(), totalSeconds, sessions } };
}

async function getDwellTimeByZone(options) {
  const opts = options || {};
  const match = { exitedAt: { $ne: null } };
  if (opts.from) {
    const from = new Date(opts.from);
    if (Number.isNaN(from.getTime())) return { status: 400, body: { error: 'from must be a valid date', field: 'from' } };
    match.enteredAt = Object.assign(match.enteredAt || {}, { $gte: from });
  }
  if (opts.to) {
    const to = new Date(opts.to);
    if (Number.isNaN(to.getTime())) return { status: 400, body: { error: 'to must be a valid date', field: 'to' } };
    match.enteredAt = Object.assign(match.enteredAt || {}, { $lte: to });
  }
  // Single aggregation: sum and average dwellSeconds per zone.
  const results = await UserSession.aggregate([
    { $match: match },
    { $group: { _id: '$zoneId', totalSeconds: { $sum: '$dwellSeconds' }, avgSeconds: { $avg: '$dwellSeconds' }, sessionCount: { $sum: 1 } } },
    { $sort: { totalSeconds: -1 } },
    { $project: { _id: 0, zoneId: '$_id', totalSeconds: 1, avgSeconds: 1, sessionCount: 1 } },
  ]);
  return { status: 200, body: { zones: results } };
}

module.exports = {
  openSession,
  closeSession,
  getZoneOccupancy,
  getDwellTimeForUser,
  getDwellTimeByZone,
};
