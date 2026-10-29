'use strict';

const { getPubSubPair } = require('./redisClient');
const {
  calculateDistance,
  EARSHOT_RADIUS,
} = require('./spatialEngine');
const { evaluateAcousticRelation } = require('./zoneManager');

const CLUSTER_CHANNELS = {
  BROADCAST: 'proxispeak:cluster:broadcast',
  UNICAST: 'proxispeak:cluster:unicast',
  HEARTBEAT: 'proxispeak:cluster:heartbeat',
};

/**
 * SocketClusterAdapter
 * 
 * Provides Redis Pub/Sub horizontal scaling and multi-instance clustering
 * for ProxiSpeak Socket.io signaling servers.
 * 
 * Enables:
 * 1. Cross-instance coordinate broadcasting (player movements).
 * 2. Cross-instance WebRTC signaling relay (offer, answer, ICE) between peers on different servers.
 * 3. Cross-instance proximity evaluation (computes earshot and acoustic barriers between local & remote users).
 * 4. Cluster node heartbeat tracking & node telemetry diagnostics.
 * 5. Resilient in-memory fallback for local development and unit tests.
 */
class SocketClusterAdapter {
  constructor(io, options = {}) {
    this.io = io;
    this.instanceId = options.instanceId || `node_${process.pid}_${Math.random().toString(36).slice(2, 8)}`;
    this.localUsers = options.localUsers || new Map();
    this.localUserToSocket = options.localUserToSocket || new Map();
    this.earshotRadius = options.earshotRadius || EARSHOT_RADIUS;

    // Remote users connected to OTHER instances in the cluster: userId -> userData
    this.remoteUsers = new Map();

    // Active cluster nodes: instanceId -> { lastHeartbeat, userCount }
    this.clusterNodes = new Map();

    // Active cross-instance proximity pairs: Set of "localUserId:remoteUserId"
    this.crossInstanceProximityPairs = new Set();

    // Pub/Sub client handles
    if (options.pubClient && options.subClient) {
      this.pubClient = options.pubClient;
      this.subClient = options.subClient;
    } else {
      const pair = getPubSubPair();
      this.pubClient = pair.pubClient;
      this.subClient = pair.subClient;
    }

    // Telemetry & metrics
    this.metrics = {
      messagesPublished: 0,
      messagesReceived: 0,
      broadcastsRelayed: 0,
      unicastsRouted: 0,
      heartbeatsSent: 0,
      crossInstanceProximityEvents: 0,
      startedAt: new Date().toISOString(),
    };

    // Heartbeat timer handle
    this.heartbeatIntervalMs = options.heartbeatIntervalMs || 15000;
    this.heartbeatTimer = null;

    // Bound message listener for clean detachment
    this._messageListener = (channel, msg) => this.handleIncomingMessage(channel, msg);

    this.isInitialized = false;
  }

  /**
   * Initializes Redis Pub/Sub channels and starts heartbeat broadcasting
   */
  async init() {
    if (this.isInitialized) return this;

    try {
      if (this.subClient && typeof this.subClient.subscribe === 'function') {
        await this.subClient.subscribe(
          CLUSTER_CHANNELS.BROADCAST,
          CLUSTER_CHANNELS.UNICAST,
          CLUSTER_CHANNELS.HEARTBEAT
        );

        this.subClient.on('message', this._messageListener);
      }

      // Start periodic heartbeat if enabled
      if (this.heartbeatIntervalMs > 0) {
        this.heartbeatTimer = setInterval(() => {
          this.sendHeartbeat().catch((err) => {
            console.warn(`[ClusterAdapter] Heartbeat publish failed: ${err.message}`);
          });
        }, this.heartbeatIntervalMs);

        if (typeof this.heartbeatTimer.unref === 'function') {
          this.heartbeatTimer.unref();
        }

        // Send initial heartbeat announcement immediately
        await this.sendHeartbeat();
      }

      this.isInitialized = true;
      console.log(`[ClusterAdapter] Initialized instance ${this.instanceId} on Redis Pub/Sub bus`);
    } catch (err) {
      console.error(`[ClusterAdapter] Initialization failed: ${err.message}`);
    }

    return this;
  }

  /**
   * Broadcast an event to all other server instances across the Redis cluster
   * @param {string} event - Event name (e.g. 'player:moved', 'user:joined')
   * @param {object} payload - Event payload
   */
  async broadcast(event, payload) {
    if (!this.pubClient || typeof this.pubClient.publish !== 'function') return;

    const envelope = {
      originInstanceId: this.instanceId,
      channel: CLUSTER_CHANNELS.BROADCAST,
      event,
      payload,
      timestamp: Date.now(),
    };

    try {
      await this.pubClient.publish(CLUSTER_CHANNELS.BROADCAST, JSON.stringify(envelope));
      this.metrics.messagesPublished++;
    } catch (err) {
      console.warn(`[ClusterAdapter] Failed to broadcast event "${event}": ${err.message}`);
    }
  }

  /**
   * Unicast an event to a specific target user residing on ANY instance in the cluster
   * @param {string} targetUserId - Target recipient's userId
   * @param {string} event - Event name (e.g. 'webrtc:offer', 'webrtc:answer')
   * @param {object} payload - Message payload
   */
  async unicast(targetUserId, event, payload) {
    if (!this.pubClient || typeof this.pubClient.publish !== 'function') return;

    const envelope = {
      originInstanceId: this.instanceId,
      channel: CLUSTER_CHANNELS.UNICAST,
      targetUserId: String(targetUserId),
      event,
      payload,
      timestamp: Date.now(),
    };

    try {
      await this.pubClient.publish(CLUSTER_CHANNELS.UNICAST, JSON.stringify(envelope));
      this.metrics.messagesPublished++;
    } catch (err) {
      console.warn(`[ClusterAdapter] Failed to unicast event "${event}" to "${targetUserId}": ${err.message}`);
    }
  }

  /**
   * Send heartbeat to cluster bus to maintain active node roster
   */
  async sendHeartbeat() {
    if (!this.pubClient || typeof this.pubClient.publish !== 'function') return;

    const envelope = {
      originInstanceId: this.instanceId,
      channel: CLUSTER_CHANNELS.HEARTBEAT,
      activeUsersCount: this.localUsers ? this.localUsers.size : 0,
      timestamp: Date.now(),
    };

    try {
      await this.pubClient.publish(CLUSTER_CHANNELS.HEARTBEAT, JSON.stringify(envelope));
      this.metrics.heartbeatsSent++;
    } catch (err) {
      // Non-fatal warning
    }
  }

  /**
   * Handles incoming Pub/Sub message from Redis
   */
  handleIncomingMessage(channel, rawMessage) {
    try {
      const envelope = typeof rawMessage === 'string' ? JSON.parse(rawMessage) : rawMessage;

      // Ignore loopback messages originating from this exact server instance
      if (envelope.originInstanceId === this.instanceId) {
        return;
      }

      this.metrics.messagesReceived++;

      switch (channel) {
        case CLUSTER_CHANNELS.BROADCAST:
          this.handleBroadcast(envelope);
          break;
        case CLUSTER_CHANNELS.UNICAST:
          this.handleUnicast(envelope);
          break;
        case CLUSTER_CHANNELS.HEARTBEAT:
          this.handleHeartbeat(envelope);
          break;
        default:
          break;
      }
    } catch (err) {
      console.warn(`[ClusterAdapter] Malformed cluster message on channel ${channel}: ${err.message}`);
    }
  }

  /**
   * Processes cross-instance broadcast events
   */
  handleBroadcast(envelope) {
    const { event, payload, originInstanceId } = envelope;
    if (!event || !payload) return;

    switch (event) {
      case 'user:joined': {
        const remoteUser = {
          ...payload,
          isRemote: true,
          instanceId: originInstanceId,
          lastSeen: Date.now(),
        };
        this.remoteUsers.set(remoteUser.userId, remoteUser);

        // Relay to all local sockets on this instance
        if (this.io && typeof this.io.emit === 'function') {
          this.io.emit('user:joined', payload);
        }
        this.metrics.broadcastsRelayed++;

        // Evaluate proximity with local users
        this.evaluateCrossInstanceProximity(remoteUser);
        break;
      }

      case 'player:moved': {
        const existing = this.remoteUsers.get(payload.userId);
        const remoteUser = {
          ...(existing || {}),
          ...payload,
          isRemote: true,
          instanceId: originInstanceId,
          lastSeen: Date.now(),
        };
        this.remoteUsers.set(payload.userId, remoteUser);

        // Relay to local sockets
        if (this.io && typeof this.io.emit === 'function') {
          this.io.emit('player:moved', payload);
        }
        this.metrics.broadcastsRelayed++;

        // Evaluate proximity with local users
        this.evaluateCrossInstanceProximity(remoteUser);
        break;
      }

      case 'user:left': {
        const userId = payload.userId;
        this.remoteUsers.delete(userId);

        // Clean up cross-instance proximity pairs
        this.cleanupRemoteUserProximity(userId);

        // Relay departure to local sockets
        if (this.io && typeof this.io.emit === 'function') {
          this.io.emit('user:left', payload);
        }
        this.metrics.broadcastsRelayed++;
        break;
      }

      case 'peer:zone_changed': {
        const existing = this.remoteUsers.get(payload.userId);
        if (existing) {
          existing.zone = payload.zone;
          existing.zoneName = payload.zoneName;
          existing.isOnStage = payload.isOnStage;
        }

        if (this.io && typeof this.io.emit === 'function') {
          this.io.emit('peer:zone_changed', payload);
        }
        this.metrics.broadcastsRelayed++;
        break;
      }

      case 'spotlight:speaker_entered': {
        if (this.io && typeof this.io.emit === 'function') {
          this.io.emit('spotlight:speaker_entered', payload);
        }
        this.metrics.broadcastsRelayed++;
        break;
      }

      default: {
        // Forward any other broadcast events
        if (this.io && typeof this.io.emit === 'function') {
          this.io.emit(event, payload);
        }
        this.metrics.broadcastsRelayed++;
        break;
      }
    }
  }

  /**
   * Routes a cross-instance unicast event to the locally connected socket
   */
  handleUnicast(envelope) {
    const { targetUserId, event, payload } = envelope;
    if (!targetUserId || !event) return;

    const localSocketId = this.localUserToSocket.get(String(targetUserId));
    if (localSocketId && this.io) {
      this.io.to(localSocketId).emit(event, payload);
      this.metrics.unicastsRouted++;
      console.log(`[ClusterAdapter] Routed cross-instance unicast "${event}" to local user "${targetUserId}"`);
    }
  }

  /**
   * Tracks cluster node liveness via heartbeat envelope
   */
  handleHeartbeat(envelope) {
    const { originInstanceId, activeUsersCount, timestamp } = envelope;
    if (!originInstanceId) return;

    this.clusterNodes.set(originInstanceId, {
      lastHeartbeat: timestamp || Date.now(),
      activeUsersCount: Number(activeUsersCount) || 0,
    });
  }

  /**
   * Evaluates proximity & acoustic gating between a remote peer and all local users
   */
  evaluateCrossInstanceProximity(remoteUser) {
    if (!this.io || !this.localUsers) return;

    for (const localUser of this.localUsers.values()) {
      const distance = calculateDistance(
        localUser.canvasX,
        localUser.canvasY,
        remoteUser.canvasX,
        remoteUser.canvasY
      );

      const acoustic = evaluateAcousticRelation(
        localUser,
        remoteUser,
        distance,
        this.earshotRadius
      );

      const pairKey = `${localUser.userId}:${remoteUser.userId}`;
      const isAlreadyInProximity = this.crossInstanceProximityPairs.has(pairKey);

      if (acoustic.canHear) {
        if (!isAlreadyInProximity) {
          // ENTER event
          this.crossInstanceProximityPairs.add(pairKey);
          this.io.to(localUser.socketId).emit('proximity:enter', {
            peerId: remoteUser.userId,
            peerSocketId: remoteUser.socketId || null,
            displayName: remoteUser.displayName,
            distance,
            mode: acoustic.mode,
            effectiveVolume: acoustic.effectiveVolume,
            isRemote: true,
          });
          this.metrics.crossInstanceProximityEvents++;
        } else {
          // UPDATE event
          this.io.to(localUser.socketId).emit('proximity:update', {
            peerId: remoteUser.userId,
            distance,
            mode: acoustic.mode,
            effectiveVolume: acoustic.effectiveVolume,
            isRemote: true,
          });
        }
      } else if (isAlreadyInProximity) {
        // LEAVE event
        this.crossInstanceProximityPairs.delete(pairKey);
        this.io.to(localUser.socketId).emit('proximity:leave', {
          peerId: remoteUser.userId,
          distance,
          reason: acoustic.reason || 'out_of_range',
          isRemote: true,
        });
        this.metrics.crossInstanceProximityEvents++;
      }
    }
  }

  /**
   * Emits leave transitions to any local user currently in proximity with a departing remote peer
   */
  cleanupRemoteUserProximity(remoteUserId) {
    if (!this.io || !this.localUsers) return;

    for (const localUser of this.localUsers.values()) {
      const pairKey = `${localUser.userId}:${remoteUserId}`;
      if (this.crossInstanceProximityPairs.has(pairKey)) {
        this.crossInstanceProximityPairs.delete(pairKey);
        this.io.to(localUser.socketId).emit('proximity:leave', {
          peerId: remoteUserId,
          reason: 'remote_peer_disconnected',
          isRemote: true,
        });
        this.metrics.crossInstanceProximityEvents++;
      }
    }
  }

  /**
   * Resolves whether a user exists either locally or across the cluster
   */
  getUser(userId) {
    // Check local users first
    for (const u of this.localUsers.values()) {
      if (u.userId === userId) return { ...u, isRemote: false };
    }
    // Check remote users
    if (this.remoteUsers.has(userId)) {
      return { ...this.remoteUsers.get(userId), isRemote: true };
    }
    return null;
  }

  /**
   * Returns merged array of local users + remote cluster users
   */
  getAllClusterUsers() {
    const local = Array.from(this.localUsers.values()).map((u) => ({
      ...u,
      isRemote: false,
      instanceId: this.instanceId,
    }));
    const remote = Array.from(this.remoteUsers.values());
    return [...local, ...remote];
  }

  /**
   * Returns diagnostic status report for monitoring APIs
   */
  getClusterStatus() {
    const now = Date.now();
    // Prune stale cluster nodes (>45 seconds without heartbeat)
    for (const [id, node] of this.clusterNodes.entries()) {
      if (now - node.lastHeartbeat > 45000) {
        this.clusterNodes.delete(id);
      }
    }

    const localCount = this.localUsers ? this.localUsers.size : 0;
    const remoteCount = this.remoteUsers.size;

    return {
      instanceId: this.instanceId,
      isClusterActive: this.isInitialized,
      pubSubMode: this.pubClient && this.pubClient.isMock ? 'in_memory_resilient' : 'distributed_redis',
      localUsersCount: localCount,
      remoteUsersCount: remoteCount,
      totalClusterUsersCount: localCount + remoteCount,
      activeClusterNodesCount: this.clusterNodes.size + 1, // Include current node
      clusterNodes: Array.from(this.clusterNodes.entries()).map(([id, node]) => ({
        instanceId: id,
        lastHeartbeat: new Date(node.lastHeartbeat).toISOString(),
        activeUsersCount: node.activeUsersCount,
      })),
      metrics: { ...this.metrics },
    };
  }

  /**
   * Cleanly closes connections and timers
   */
  async close() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    if (this.subClient && typeof this.subClient.unsubscribe === 'function') {
      try {
        await this.subClient.unsubscribe(
          CLUSTER_CHANNELS.BROADCAST,
          CLUSTER_CHANNELS.UNICAST,
          CLUSTER_CHANNELS.HEARTBEAT
        );
      } catch (_) {}
    }

    if (this.subClient && typeof this.subClient.removeListener === 'function') {
      this.subClient.removeListener('message', this._messageListener);
    }

    this.remoteUsers.clear();
    this.clusterNodes.clear();
    this.crossInstanceProximityPairs.clear();
    this.isInitialized = false;
  }
}

module.exports = {
  SocketClusterAdapter,
  CLUSTER_CHANNELS,
};
