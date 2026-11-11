'use strict';

const mongoose = require('mongoose');
const { MAX_CANVAS_COORD } = require('../canvasToGeo');

const isFiniteNumber = (v) => typeof v === 'number' && Number.isFinite(v);

/**
 * Mongoose Sub-Schema for Zone Visits & Dwell Time
 */
const ZoneVisitSubSchema = new mongoose.Schema(
  {
    zoneId: { type: String, required: true, trim: true, lowercase: true },
    zoneName: { type: String, default: '' },
    enteredAt: { type: Date, required: true },
    leftAt: { type: Date, default: null },
    dwellSeconds: { type: Number, default: 0, min: 0 },
  },
  { _id: false }
);

/**
 * Mongoose Schema for User Presence Sessions & Dwell-Time Analytics (Unified)
 */
const UserSessionSchema = new mongoose.Schema(
  {
    sessionId: {
      type: String,
      required: [true, 'sessionId is required'],
      unique: true,
      trim: true,
      index: true,
    },
    userId: {
      type: String,
      required: [true, 'userId is required'],
      trim: true,
      maxlength: [120, 'userId must be at most 120 characters'],
      index: true,
    },
    displayName: {
      type: String,
      trim: true,
      default: '',
    },
    zoneId: {
      type: String,
      trim: true,
      lowercase: true,
      default: 'open-office',
    },
    enteredAt: {
      type: Date,
      default: Date.now,
    },
    exitedAt: {
      type: Date,
      default: null,
    },
    dwellSeconds: {
      type: Number,
      default: null,
    },
    socketId: {
      type: String,
      trim: true,
      default: null,
    },
    joinedAt: {
      type: Date,
      default: Date.now,
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
    totalDistancePixels: {
      type: Number,
      default: 0,
      min: 0,
    },
    initialZone: {
      type: String,
      default: 'open-office',
      trim: true,
    },
    currentZone: {
      type: String,
      default: 'open-office',
      trim: true,
    },
    zonesVisited: {
      type: [ZoneVisitSubSchema],
      default: [],
    },
    lastPosition: {
      x: { type: Number, default: 0 },
      y: { type: Number, default: 0 },
    },
    lastPositionX: {
      type: Number,
      validate: {
        validator: (v) => v === null || v === undefined || (isFiniteNumber(v) && Math.abs(v) <= (MAX_CANVAS_COORD || 5000)),
        message: 'lastPositionX must be a finite number within canvas extent',
      },
    },
    lastPositionY: {
      type: Number,
      validate: {
        validator: (v) => v === null || v === undefined || (isFiniteNumber(v) && Math.abs(v) <= (MAX_CANVAS_COORD || 5000)),
        message: 'lastPositionY must be a finite number within canvas extent',
      },
    },
    audioStats: {
      proximityPeersEngaged: { type: Number, default: 0 },
      speakingSeconds: { type: Number, default: 0 },
      stageBroadcastCount: { type: Number, default: 0 },
    },
  },
  {
    timestamps: true,
    strict: true,
  }
);

UserSessionSchema.path('exitedAt').validate(function (value) {
  if (value === null || value === undefined) return true;
  if (!this.enteredAt) return true;
  return value >= this.enteredAt;
}, 'exitedAt must be greater than or equal to enteredAt');

UserSessionSchema.index({ zoneId: 1, enteredAt: -1 });
UserSessionSchema.index({ userId: 1, enteredAt: -1 });
UserSessionSchema.index({ currentZone: 1 });

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

/**
 * Resilient In-Memory User Session Store
 * Guarantees zero-crash standalone operation during offline testing or when MongoDB is disconnected.
 */
class InMemoryUserSessionStore {
  constructor() {
    this.sessions = new Map();
  }

  _clone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  async create(data) {
    const doc = {
      sessionId: String(data.sessionId),
      userId: String(data.userId),
      displayName: data.displayName || `User-${data.userId}`,
      zoneId: data.zoneId || 'open-office',
      socketId: data.socketId || null,
      joinedAt: data.joinedAt ? new Date(data.joinedAt) : new Date(),
      enteredAt: data.enteredAt ? new Date(data.enteredAt) : new Date(),
      leftAt: data.leftAt ? new Date(data.leftAt) : null,
      exitedAt: data.exitedAt ? new Date(data.exitedAt) : null,
      totalDwellSeconds: data.totalDwellSeconds || 0,
      totalDistancePixels: data.totalDistancePixels || 0,
      initialZone: data.initialZone || 'open-office',
      currentZone: data.currentZone || 'open-office',
      zonesVisited: Array.isArray(data.zonesVisited) ? this._clone(data.zonesVisited) : [],
      lastPosition: {
        x: data.lastPosition?.x || data.lastPositionX || 0,
        y: data.lastPosition?.y || data.lastPositionY || 0,
      },
      lastPositionX: data.lastPositionX || data.lastPosition?.x || 0,
      lastPositionY: data.lastPositionY || data.lastPosition?.y || 0,
      audioStats: {
        proximityPeersEngaged: data.audioStats?.proximityPeersEngaged || 0,
        speakingSeconds: data.audioStats?.speakingSeconds || 0,
        stageBroadcastCount: data.audioStats?.stageBroadcastCount || 0,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.sessions.set(doc.sessionId, doc);
    return this._clone(doc);
  }

  async findOne(filter = {}) {
    const list = Array.from(this.sessions.values());
    if (filter.sessionId) {
      const match = list.find((s) => s.sessionId === filter.sessionId);
      return match ? this._clone(match) : null;
    }
    if (filter.userId && filter.leftAt === null) {
      const match = list.find((s) => s.userId === filter.userId && s.leftAt === null);
      return match ? this._clone(match) : null;
    }
    if (filter.userId && filter.exitedAt === null) {
      const match = list.find((s) => s.userId === filter.userId && s.exitedAt === null);
      return match ? this._clone(match) : null;
    }
    if (filter.userId) {
      const match = list.find((s) => s.userId === filter.userId);
      return match ? this._clone(match) : null;
    }
    return list[0] ? this._clone(list[0]) : null;
  }

  async find(filter = {}) {
    let results = Array.from(this.sessions.values());
    if (filter.userId) {
      results = results.filter((s) => s.userId === filter.userId);
    }
    if (filter.currentZone) {
      results = results.filter((s) => s.currentZone === filter.currentZone);
    }
    if (filter.zoneId) {
      results = results.filter((s) => s.zoneId === filter.zoneId);
    }
    if (filter.active === true) {
      results = results.filter((s) => s.leftAt === null && s.exitedAt === null);
    }
    return results.map((r) => this._clone(r));
  }

  async findOneAndUpdate(filter, update, options = {}) {
    const doc = await this.findOne(filter);
    if (!doc && options.upsert) {
      return this.create({ ...filter, ...(update.$set || update) });
    }
    if (!doc) return null;

    const updated = {
      ...doc,
      ...(update.$set || update),
      updatedAt: new Date(),
    };

    this.sessions.set(doc.sessionId, updated);
    return this._clone(updated);
  }

  async countDocuments(filter = {}) {
    const list = await this.find(filter);
    return list.length;
  }

  clear() {
    this.sessions.clear();
  }
}

// Safely compile Mongoose Model
let UserSessionModel;
try {
  UserSessionModel = mongoose.models.UserSession || mongoose.model('UserSession', UserSessionSchema);
} catch {
  UserSessionModel = null;
}

module.exports = {
  UserSession: UserSessionModel,
  UserSessionSchema,
  InMemoryUserSessionStore,
};
module.exports.UserSession = UserSessionModel;
