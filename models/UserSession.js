'use strict';

const mongoose = require('mongoose');

/**
 * Mongoose Schema for User Presence Sessions & Dwell-Time Analytics
 * 
 * Tracks avatar lifecycles, zone dwell times (e.g. Conference Room Alpha,
 * Town Hall Podium, Quiet Lounge), movement odometer distance, and audio engagement.
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
    socketId: {
      type: String,
      trim: true,
      default: null,
    },
    joinedAt: {
      type: Date,
      required: [true, 'joinedAt is required'],
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
    zonesVisited: [ZoneVisitSubSchema],
    lastPosition: {
      x: { type: Number, default: 0 },
      y: { type: Number, default: 0 },
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

UserSessionSchema.index({ userId: 1, enteredAt: -1 });
UserSessionSchema.index({ currentZone: 1 });

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
      socketId: data.socketId || null,
      joinedAt: data.joinedAt ? new Date(data.joinedAt) : new Date(),
      leftAt: data.leftAt ? new Date(data.leftAt) : null,
      totalDwellSeconds: data.totalDwellSeconds || 0,
      totalDistancePixels: data.totalDistancePixels || 0,
      initialZone: data.initialZone || 'open-office',
      currentZone: data.currentZone || 'open-office',
      zonesVisited: Array.isArray(data.zonesVisited) ? this._clone(data.zonesVisited) : [],
      lastPosition: {
        x: data.lastPosition?.x || 0,
        y: data.lastPosition?.y || 0,
      },
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
    if (filter.active === true) {
      results = results.filter((s) => s.leftAt === null);
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
