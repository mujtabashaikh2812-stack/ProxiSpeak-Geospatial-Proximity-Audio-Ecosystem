'use strict';

const mongoose = require('mongoose');
const {
  UserSession,
  InMemoryUserSessionStore,
} = require('../models/UserSession');
const { calculateDistance } = require('./spatialEngine');
const { detectZone, getActiveZones } = require('./zoneManager');

const ROOM_CAPACITIES = {
  'conf-a': 8,
  'podium': 3,
  'breakout-beta': 6,
  'quiet-lounge': 4,
  'open-office': 50,
};

/**
 * SessionAnalyticsEngine
 * 
 * Manages real-time avatar presence lifecycles, zone dwell times,
 * movement distance odometers, and real-time room occupancy headcounts.
 */
class SessionAnalyticsEngine {
  constructor(options = {}) {
    this.activeSessions = new Map();
    this.zoneOccupancy = new Map();
    this.roomCapacities = { ...ROOM_CAPACITIES, ...(options.customCapacities || {}) };
    this.store = options.store || new InMemoryUserSessionStore();
    this.isMongooseActive = Boolean(
      options.forceMongoose !== undefined
        ? options.forceMongoose
        : mongoose.connection && mongoose.connection.readyState === 1 && UserSession
    );

    // Initialize default zone occupancy sets
    this._initZones();
  }

  _initZones() {
    const zones = getActiveZones();
    for (const z of zones) {
      if (!this.zoneOccupancy.has(z.id)) {
        this.zoneOccupancy.set(z.id, new Set());
      }
    }
    if (!this.zoneOccupancy.has('open-office')) {
      this.zoneOccupancy.set('open-office', new Set());
    }
  }

  _clone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  /**
   * Initializes a new session when an avatar joins the virtual office
   * @param {object} user - User metadata from socket handshake
   * @returns {object} Initialized session
   */
  startSession(user) {
    if (!user || !user.userId) return null;

    const userId = String(user.userId);
    const now = new Date();
    const sessionId = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const zone = user.zone || 'open-office';
    const zoneName = user.zoneName || 'Open Workspace';

    const session = {
      sessionId,
      userId,
      displayName: user.displayName || `User-${userId.slice(0, 4)}`,
      socketId: user.socketId || null,
      joinedAt: now,
      leftAt: null,
      totalDwellSeconds: 0,
      totalDistancePixels: 0,
      initialZone: zone,
      currentZone: zone,
      zonesVisited: [
        {
          zoneId: zone,
          zoneName,
          enteredAt: now,
          leftAt: null,
          dwellSeconds: 0,
        },
      ],
      lastPosition: {
        x: Number(user.canvasX) || 0,
        y: Number(user.canvasY) || 0,
      },
      audioStats: {
        proximityPeersEngaged: 0,
        speakingSeconds: 0,
        stageBroadcastCount: zone === 'podium' ? 1 : 0,
      },
    };

    this.activeSessions.set(userId, session);

    // Register user in room occupancy
    if (!this.zoneOccupancy.has(zone)) {
      this.zoneOccupancy.set(zone, new Set());
    }
    this.zoneOccupancy.get(zone).add(userId);

    return this._clone(session);
  }

  /**
   * Records avatar movement and updates the cumulative distance odometer
   * @param {string} userId - User identifier
   * @param {number} x - Target canvas X
   * @param {number} y - Target canvas Y
   */
  recordMovement(userId, x, y) {
    const session = this.activeSessions.get(String(userId));
    if (!session) return null;

    if (typeof x === 'number' && typeof y === 'number') {
      const delta = calculateDistance(session.lastPosition.x, session.lastPosition.y, x, y);
      session.totalDistancePixels += Math.round(delta * 10) / 10;
      session.lastPosition = { x, y };
    }

    return {
      userId,
      totalDistancePixels: session.totalDistancePixels,
      lastPosition: session.lastPosition,
    };
  }

  /**
   * Records zone transition: closes active zone visit, records dwell time, and enters new zone
   * @param {string} userId - User identifier
   * @param {string} oldZoneId - Origin zone
   * @param {string} newZoneId - Destination zone
   * @param {string} newZoneName - Human-readable name
   */
  recordZoneTransition(userId, oldZoneId, newZoneId, newZoneName = '') {
    const session = this.activeSessions.get(String(userId));
    if (!session) return this.getRoomOccupancy();

    const now = new Date();

    // Close previous open zone visit
    for (let i = session.zonesVisited.length - 1; i >= 0; i--) {
      const visit = session.zonesVisited[i];
      if (visit.leftAt === null) {
        visit.leftAt = now;
        visit.dwellSeconds = Math.max(0, Math.floor((now.getTime() - new Date(visit.enteredAt).getTime()) / 1000));
        break;
      }
    }

    // Update occupancy sets
    if (oldZoneId && this.zoneOccupancy.has(oldZoneId)) {
      this.zoneOccupancy.get(oldZoneId).delete(String(userId));
    }

    if (!this.zoneOccupancy.has(newZoneId)) {
      this.zoneOccupancy.set(newZoneId, new Set());
    }
    this.zoneOccupancy.get(newZoneId).add(String(userId));

    // Append new zone entry
    session.currentZone = newZoneId;
    session.zonesVisited.push({
      zoneId: newZoneId,
      zoneName: newZoneName || newZoneId,
      enteredAt: now,
      leftAt: null,
      dwellSeconds: 0,
    });

    if (newZoneId === 'podium') {
      session.audioStats.stageBroadcastCount++;
    }

    return this.getRoomOccupancy();
  }

  /**
   * Finalizes active session upon user disconnect, computes total dwell time, and persists to store
   * @param {string} userId - User identifier
   * @returns {Promise<object|null>} Completed session summary
   */
  async endSession(userId) {
    const session = this.activeSessions.get(String(userId));
    if (!session) return null;

    const now = new Date();
    session.leftAt = now;
    session.totalDwellSeconds = Math.max(
      0,
      Math.floor((now.getTime() - new Date(session.joinedAt).getTime()) / 1000)
    );

    // Close any unclosed zone visit
    for (let i = session.zonesVisited.length - 1; i >= 0; i--) {
      const visit = session.zonesVisited[i];
      if (visit.leftAt === null) {
        visit.leftAt = now;
        visit.dwellSeconds = Math.max(
          0,
          Math.floor((now.getTime() - new Date(visit.enteredAt).getTime()) / 1000)
        );
      }
    }

    // Remove user from room occupancy
    if (session.currentZone && this.zoneOccupancy.has(session.currentZone)) {
      this.zoneOccupancy.get(session.currentZone).delete(String(userId));
    }

    // Persist to storage (MongoDB if connected, otherwise in-memory store)
    try {
      if (this.isMongooseActive && UserSession) {
        await UserSession.create(session);
      } else {
        await this.store.create(session);
      }
    } catch (err) {
      console.warn(`[SessionAnalytics] Persistence fallback warning: ${err.message}`);
    }

    this.activeSessions.delete(String(userId));
    return this._clone(session);
  }

  /**
   * Returns current real-time room occupancy headcounts and capacity metrics
   */
  getRoomOccupancy() {
    this._initZones();
    const occupancyReport = {};

    for (const [zoneId, usersSet] of this.zoneOccupancy.entries()) {
      const count = usersSet.size;
      const capacity = this.roomCapacities[zoneId] || 10;
      const pct = Math.round((count / capacity) * 100);

      const occupantDetails = Array.from(usersSet).map((uId) => {
        const s = this.activeSessions.get(uId);
        return {
          userId: uId,
          displayName: s ? s.displayName : uId,
        };
      });

      occupancyReport[zoneId] = {
        count,
        capacity,
        occupancyPercentage: pct,
        isAtCapacity: count >= capacity,
        occupants: occupantDetails,
      };
    }

    return occupancyReport;
  }

  /**
   * Returns in-flight active sessions with live dwell-time counters
   */
  getActiveSessions() {
    const list = [];
    const now = Date.now();

    for (const session of this.activeSessions.values()) {
      const copy = this._clone(session);
      copy.liveDwellSeconds = Math.max(0, Math.floor((now - new Date(session.joinedAt).getTime()) / 1000));
      list.push(copy);
    }

    return list;
  }

  /**
   * Retrieves historical completed sessions for a given user
   */
  async getUserHistory(userId) {
    if (this.isMongooseActive && UserSession) {
      return UserSession.find({ userId: String(userId) }).lean().exec();
    }
    return this.store.find({ userId: String(userId) });
  }

  /**
   * Aggregates system-wide analytics telemetry
   */
  async getAggregatedMetrics() {
    const active = this.getActiveSessions();
    let historical = [];

    if (this.isMongooseActive && UserSession) {
      historical = await UserSession.find({}).lean().exec();
    } else {
      historical = await this.store.find({});
    }

    const allSessions = [...historical, ...active];
    const totalSessions = allSessions.length;

    let totalDuration = 0;
    let totalDistance = 0;
    const zoneCounts = {};

    for (const s of allSessions) {
      totalDuration += s.totalDwellSeconds || s.liveDwellSeconds || 0;
      totalDistance += s.totalDistancePixels || 0;

      if (Array.isArray(s.zonesVisited)) {
        for (const zv of s.zonesVisited) {
          zoneCounts[zv.zoneId] = (zoneCounts[zv.zoneId] || 0) + 1;
        }
      }
    }

    const avgDuration = totalSessions > 0 ? Math.round(totalDuration / totalSessions) : 0;
    const avgDistance = totalSessions > 0 ? Math.round(totalDistance / totalSessions) : 0;

    let mostVisitedZone = 'open-office';
    let maxVisits = 0;
    for (const [zId, visits] of Object.entries(zoneCounts)) {
      if (visits > maxVisits) {
        maxVisits = visits;
        mostVisitedZone = zId;
      }
    }

    return {
      service: 'ProxiSpeak Acoustic Session & Occupancy Analytics Engine',
      status: 'operational',
      activeUsersCount: active.length,
      historicalSessionsCount: historical.length,
      totalSessionsTracked: totalSessions,
      averages: {
        averageSessionDurationSeconds: avgDuration,
        averageDistanceTraveledPixels: avgDistance,
      },
      mostVisitedZone: {
        zoneId: mostVisitedZone,
        totalVisits: maxVisits,
      },
      roomOccupancy: this.getRoomOccupancy(),
      storageMode: this.isMongooseActive ? 'mongodb' : 'in-memory-fallback',
    };
  }

  reset() {
    this.activeSessions.clear();
    this.zoneOccupancy.clear();
    this._initZones();
    if (this.store.clear) this.store.clear();
  }
}

// Singleton default instance
const defaultSessionAnalytics = new SessionAnalyticsEngine();

module.exports = {
  SessionAnalyticsEngine,
  defaultSessionAnalytics,
  ROOM_CAPACITIES,
};
