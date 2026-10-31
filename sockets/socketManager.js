'use strict';

const { Server } = require('socket.io');
const config = require('../config/serverConfig');
const { registerSignalingHandlers } = require('./signalingHandler');
const {
  evaluateProximityOnMove,
  cleanupUserProximity,
  getNearbyPeersForUser,
  detectZone,
  OFFICE_ZONES,
  EARSHOT_RADIUS,
} = require('../services/spatialEngine');
const { defaultThrottle } = require('../services/throttleEngine');
const { SocketClusterAdapter } = require('../services/socketClusterAdapter');
const { defaultMeshManager } = require('../services/meshManager');
const { defaultSpatialCache } = require('../services/spatialCache');

/**
 * In-memory active user registry
 */
const activeUsers = new Map();

/**
 * Reverse lookup: maps userId -> socket.id
 */
const userToSocket = new Map();

let clusterAdapter = null;

function initSocketServer(httpServer, options = {}) {
  const io = new Server(httpServer, {
    cors: {
      origin: config.clientOrigins,
      methods: ['GET', 'POST'],
      credentials: true,
    },
    pingInterval: 25000,
    pingTimeout: 20000,
  });

  // Initialize Socket.io Redis Cluster Adapter for horizontal scaling
  clusterAdapter = new SocketClusterAdapter(io, {
    localUsers: activeUsers,
    localUserToSocket: userToSocket,
    earshotRadius: EARSHOT_RADIUS,
    ...options.clusterOptions,
  });
  clusterAdapter.init().catch((err) => {
    console.warn(`[SocketServer] Cluster adapter init warning: ${err.message}`);
  });

  io.on('connection', (socket) => {
    console.log(`[Socket] Peer connected: ${socket.id}`);

    // Register WebRTC P2P signaling handlers (with cluster relay support)
    registerSignalingHandlers(io, socket, activeUsers, userToSocket, clusterAdapter);

    // User announces presence and initial canvas position
    socket.on('user:join', (payload = {}) => {
      const { userId, displayName, canvasX = 120, canvasY = 120 } = payload;

      if (!userId) {
        socket.emit('error:join', { message: 'userId is required to join' });
        return;
      }

      const currentZone = detectZone(canvasX, canvasY);

      const userData = {
        socketId: socket.id,
        userId: String(userId),
        displayName: displayName || `User-${userId.slice(0, 4)}`,
        canvasX: Number(canvasX) || 0,
        canvasY: Number(canvasY) || 0,
        zone: currentZone.id,
        zoneName: currentZone.name,
        isOnStage: currentZone.id === 'podium',
        joinedAt: new Date().toISOString(),
      };

      activeUsers.set(socket.id, userData);
      userToSocket.set(userData.userId, socket.id);

      // Register initial position with throttle engine
      defaultThrottle.processMovement(userData.userId, userData.canvasX, userData.canvasY);

      const allOtherUsers = Array.from(activeUsers.values()).filter(
        (u) => u.socketId !== socket.id
      );

      const allClusterPeers = clusterAdapter
        ? clusterAdapter.getAllClusterUsers().filter((u) => u.userId !== userData.userId)
        : allOtherUsers;

      let nearbyPeers = defaultSpatialCache.getCachedNearbyPeers(userData);
      if (!nearbyPeers) {
        nearbyPeers = getNearbyPeersForUser(userData, allClusterPeers, EARSHOT_RADIUS);
        defaultSpatialCache.setCachedNearbyPeers(userData, nearbyPeers);
      }
      const meshAlloc = defaultMeshManager.evaluateMeshAllocation(userData, nearbyPeers);

      // Send initial room layout & state to joining user
      socket.emit('room:state', {
        user: userData,
        peers: allClusterPeers,
        nearbyPeers,
        meshAllocation: {
          activePeers: meshAlloc.activePeers,
          maxMeshCap: meshAlloc.maxMeshCap,
          isCapped: meshAlloc.isCapped,
        },
        zones: OFFICE_ZONES,
        earshotRadius: EARSHOT_RADIUS,
      });

      // Notify all other clients on this node about the newly joined player
      socket.broadcast.emit('user:joined', userData);

      // Broadcast new player across Redis cluster bus
      if (clusterAdapter) {
        clusterAdapter.broadcast('user:joined', userData);
      }

      // Initial proximity check
      const initialTransitions = evaluateProximityOnMove(
        userData,
        Array.from(activeUsers.values()),
        EARSHOT_RADIUS
      );
      dispatchProximityTransitions(io, initialTransitions);

      console.log(`[Socket] User joined: ${userData.displayName} at [${userData.canvasX}, ${userData.canvasY}] (${userData.zoneName})`);
    });

    // Player movement broadcast with 30Hz Rate-Limiting & Delta Compression
    socket.on('player:move', (coords = {}) => {
      const user = activeUsers.get(socket.id);
      if (!user) return;

      const { x, y } = coords;
      if (typeof x === 'number' && typeof y === 'number') {
        user.canvasX = x;
        user.canvasY = y;

        // Rate-limit check (30Hz tick & sub-pixel delta compression)
        const throttleCheck = defaultThrottle.processMovement(user.userId, x, y);
        if (!throttleCheck.shouldBroadcast) {
          return; // Suppress redundant frame
        }

        // Check if user transitioned to a new zone or podium
        const newZone = detectZone(x, y);
        const prevZoneId = user.zone;
        if (newZone.id !== prevZoneId) {
          user.zone = newZone.id;
          user.zoneName = newZone.name;
          user.isOnStage = newZone.id === 'podium';

          socket.emit('zone:changed', {
            zone: newZone.id,
            zoneName: newZone.name,
            isOnStage: user.isOnStage,
          });

          socket.broadcast.emit('peer:zone_changed', {
            userId: user.userId,
            socketId: socket.id,
            zone: newZone.id,
            zoneName: newZone.name,
            isOnStage: user.isOnStage,
          });

          if (clusterAdapter) {
            clusterAdapter.broadcast('peer:zone_changed', {
              userId: user.userId,
              socketId: socket.id,
              zone: newZone.id,
              zoneName: newZone.name,
              isOnStage: user.isOnStage,
            });
          }

          if (user.isOnStage) {
            io.emit('spotlight:speaker_entered', {
              userId: user.userId,
              displayName: user.displayName,
              message: `${user.displayName} is speaking on the Town Hall Podium!`,
            });

            if (clusterAdapter) {
              clusterAdapter.broadcast('spotlight:speaker_entered', {
                userId: user.userId,
                displayName: user.displayName,
                message: `${user.displayName} is speaking on the Town Hall Podium!`,
              });
            }
          }
        }

        // 1. Broadcast throttled movement to other peers
        socket.broadcast.emit('player:moved', {
          socketId: socket.id,
          userId: user.userId,
          canvasX: user.canvasX,
          canvasY: user.canvasY,
          zone: user.zone,
          isOnStage: user.isOnStage,
        });

        // Broadcast across Redis cluster bus
        if (clusterAdapter) {
          clusterAdapter.broadcast('player:moved', {
            socketId: socket.id,
            userId: user.userId,
            displayName: user.displayName,
            canvasX: user.canvasX,
            canvasY: user.canvasY,
            zone: user.zone,
            zoneName: user.zoneName,
            isOnStage: user.isOnStage,
          });
        }

        // 2. Evaluate acoustic & proximity transitions
        const allUsers = Array.from(activeUsers.values());
        const transitions = evaluateProximityOnMove(user, allUsers, EARSHOT_RADIUS);
        dispatchProximityTransitions(io, transitions);

        // 3. Dynamic WebRTC Mesh Connection Capping & Priority Allocation (with Spatial Caching)
        let nearbyPeers = defaultSpatialCache.getCachedNearbyPeers(user);
        if (!nearbyPeers) {
          nearbyPeers = getNearbyPeersForUser(user, allUsers, EARSHOT_RADIUS);
          defaultSpatialCache.setCachedNearbyPeers(user, nearbyPeers);
        }

        const meshAlloc = defaultMeshManager.evaluateMeshAllocation(user, nearbyPeers);
        if (meshAlloc.isCapped || meshAlloc.promoted.length > 0 || meshAlloc.demoted.length > 0) {
          socket.emit('mesh:update', {
            activePeerIds: meshAlloc.activePeers.map((p) => p.userId),
            promoted: meshAlloc.promoted.map((p) => p.userId),
            demoted: meshAlloc.demoted.map((p) => p.userId),
            isCapped: meshAlloc.isCapped,
            maxMeshCap: meshAlloc.maxMeshCap,
          });
        }
      }
    });

    // Handle peer disconnect
    socket.on('disconnect', (reason) => {
      const user = activeUsers.get(socket.id);
      if (user) {
        activeUsers.delete(socket.id);
        userToSocket.delete(user.userId);
        defaultThrottle.cleanupPlayer(user.userId);
        defaultMeshManager.cleanupUser(user.userId);
        defaultSpatialCache.invalidateUser(user.userId);

        const remainingUsers = Array.from(activeUsers.values());

        const departures = cleanupUserProximity(user.userId, remainingUsers);
        for (const dep of departures) {
          io.to(dep.targetSocketId).emit('proximity:leave', {
            peerId: dep.disconnectedUserId,
            reason: 'disconnected',
          });
        }

        socket.broadcast.emit('user:left', {
          socketId: socket.id,
          userId: user.userId,
          reason,
        });

        if (clusterAdapter) {
          clusterAdapter.broadcast('user:left', {
            socketId: socket.id,
            userId: user.userId,
            reason,
          });
        }

        console.log(`[Socket] User left: ${user.displayName} (${user.userId}) - Reason: ${reason}`);
      }
    });
  });

  return io;
}

function dispatchProximityTransitions(io, transitions) {
  for (const t of transitions) {
    const { type, peerA, peerB, distance, mode, effectiveVolume, reason } = t;

    if (type === 'enter') {
      io.to(peerA.socketId).emit('proximity:enter', {
        peerId: peerB.userId,
        peerSocketId: peerB.socketId,
        displayName: peerB.displayName,
        distance,
        mode,
        effectiveVolume,
      });
      io.to(peerB.socketId).emit('proximity:enter', {
        peerId: peerA.userId,
        peerSocketId: peerA.socketId,
        displayName: peerA.displayName,
        distance,
        mode,
        effectiveVolume,
      });
    } else if (type === 'update') {
      io.to(peerA.socketId).emit('proximity:update', {
        peerId: peerB.userId,
        distance,
        mode,
        effectiveVolume,
      });
      io.to(peerB.socketId).emit('proximity:update', {
        peerId: peerA.userId,
        distance,
        mode,
        effectiveVolume,
      });
    } else if (type === 'leave') {
      io.to(peerA.socketId).emit('proximity:leave', {
        peerId: peerB.userId,
        distance,
        reason,
      });
      io.to(peerB.socketId).emit('proximity:leave', {
        peerId: peerA.userId,
        distance,
        reason,
      });
    }
  }
}

function getActiveUsers() {
  return Array.from(activeUsers.values());
}

function getSocketByUserId(userId) {
  return userToSocket.get(userId) || null;
}

function getClusterAdapter() {
  return clusterAdapter;
}

module.exports = {
  initSocketServer,
  getActiveUsers,
  getSocketByUserId,
  getClusterAdapter,
  defaultMeshManager,
  defaultSpatialCache,
  activeUsers,
  userToSocket,
};
