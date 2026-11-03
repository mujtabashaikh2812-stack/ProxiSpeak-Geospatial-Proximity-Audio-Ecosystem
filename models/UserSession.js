'use strict';

const mongoose = require('mongoose');
const { MAX_CANVAS_COORD } = require('../canvasToGeo');

const isFiniteNumber = (v) => typeof v === 'number' && Number.isFinite(v);

const UserSessionSchema = new mongoose.Schema(
  {
    sessionId: {
      type: String,
      required: [true, 'sessionId is required'],
      unique: true,
      trim: true,
    },
    userId: {
      type: String,
      required: [true, 'userId is required'],
      trim: true,
      maxlength: [120, 'userId must be at most 120 characters'],
    },
    zoneId: {
      type: String,
      required: [true, 'zoneId is required'],
      trim: true,
      lowercase: true,
    },
    enteredAt: {
      type: Date,
      required: [true, 'enteredAt is required'],
    },
    exitedAt: {
      type: Date,
      default: null,
    },
    dwellSeconds: {
      type: Number,
      default: null,
    },
    // The following fields mirror enteredAt/exitedAt/dwellSeconds for the task sheet contract.
    // sessionHistory.js keeps both pairs in sync.
    socketId: {
      type: String,
      trim: true,
      default: null,
    },
    joinedAt: {
      type: Date,
      default: null,
    },
    leftAt: {
      type: Date,
      default: null,
    },
    totalDwellSeconds: {
      type: Number,
      default: 0,
      min: 0,
    },
    zonesVisited: {
      type: [
        {
          _id: false,
          zoneId: { type: String, required: true, trim: true, lowercase: true },
          enteredAt: { type: Date, required: true },
          leftAt: { type: Date, default: null },
        },
      ],
      default: [],
    },
    lastPositionX: {
      type: Number,
      validate: { validator: (v) => v === null || v === undefined || (isFiniteNumber(v) && Math.abs(v) <= MAX_CANVAS_COORD), message: 'lastPositionX must be a finite number within canvas extent' },
    },
    lastPositionY: {
      type: Number,
      validate: { validator: (v) => v === null || v === undefined || (isFiniteNumber(v) && Math.abs(v) <= MAX_CANVAS_COORD), message: 'lastPositionY must be a finite number within canvas extent' },
    },
  },
  { strict: true, timestamps: true }
);

UserSessionSchema.path('exitedAt').validate(function (value) {
  if (value === null || value === undefined) return true;
  if (!this.enteredAt) return true;
  return value >= this.enteredAt;
}, 'exitedAt must be greater than or equal to enteredAt');

UserSessionSchema.index({ sessionId: 1 }, { unique: true });
UserSessionSchema.index({ zoneId: 1, enteredAt: -1 });
UserSessionSchema.index({ userId: 1, enteredAt: -1 });
// Partial unique index: one open session per user at most.
UserSessionSchema.index({ userId: 1 }, { unique: true, partialFilterExpression: { exitedAt: null } });

UserSessionSchema.statics.recordZoneEntry = async function (userId, zoneId) {
  if (typeof userId !== 'string' || userId.trim() === '') {
    return { status: 400, body: { error: 'userId must be a non-empty string', field: 'userId' } };
  }
  if (typeof zoneId !== 'string' || zoneId.trim() === '') {
    return { status: 400, body: { error: 'zoneId must be a non-empty string', field: 'zoneId' } };
  }
  const session = await this.findOne({ userId: userId.trim(), exitedAt: null });
  if (!session) return { status: 404, body: { error: 'no open session for user', field: 'userId' } };
  const last = session.zonesVisited.length ? session.zonesVisited[session.zonesVisited.length - 1] : null;
  if (last && last.zoneId === zoneId.trim().toLowerCase() && last.leftAt === null) {
    return { status: 409, body: { error: 'zone entry already open', field: 'zoneId' } };
  }
  session.zonesVisited.push({ zoneId: zoneId.trim().toLowerCase(), enteredAt: new Date() });
  if (session.joinedAt === null) session.joinedAt = new Date();
  await session.save();
  return { status: 200, body: { session: session.toObject ? session.toObject() : session } };
};

UserSessionSchema.statics.recordZoneExit = async function (userId, zoneId) {
  if (typeof userId !== 'string' || userId.trim() === '') {
    return { status: 400, body: { error: 'userId must be a non-empty string', field: 'userId' } };
  }
  if (typeof zoneId !== 'string' || zoneId.trim() === '') {
    return { status: 400, body: { error: 'zoneId must be a non-empty string', field: 'zoneId' } };
  }
  const session = await this.findOne({ userId: userId.trim(), exitedAt: null });
  if (!session) return { status: 404, body: { error: 'no open session for user', field: 'userId' } };
  let entry = null;
  for (let i = session.zonesVisited.length - 1; i >= 0; i--) {
    if (session.zonesVisited[i].zoneId === zoneId.trim().toLowerCase() && session.zonesVisited[i].leftAt === null) {
      entry = session.zonesVisited[i];
      break;
    }
  }
  if (!entry) return { status: 404, body: { error: 'zone entry not found', field: 'zoneId' } };
  const now = new Date();
  entry.leftAt = now;
  const elapsed = Math.floor((now.getTime() - entry.enteredAt.getTime()) / 1000);
  session.totalDwellSeconds = (session.totalDwellSeconds || 0) + elapsed;
  await session.save();
  return { status: 200, body: { session: session.toObject ? session.toObject() : session } };
};

const UserSession = mongoose.model('UserSession', UserSessionSchema);

module.exports = { UserSession };
module.exports.UserSession = UserSession;
