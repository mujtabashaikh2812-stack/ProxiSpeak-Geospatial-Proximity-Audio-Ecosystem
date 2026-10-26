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

/**
 * In-memory active user registry
 */
const activeUsers = new Map();

/**
 * Reverse lookup: maps userId -> socket.id
 */
const userToSocket = new Map();

function initSocketServer(httpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: config.clientOrigins,
      methods: ['GET', 'POST'],
      credentials: true,
    },
    pingInterval: 25000,
    pingTimeout: 20000,
  });

  io.on('connection', (socket) => {
    console.log(`[Socket] Peer connected: ${socket.id}`);

    // Register WebRTC P2P signaling handlers
    registerSignalingHandlers(io, socket, activeUsers, userToSocket);

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

      const allOtherUsers = Array.from(activeUsers.values()).filter(
        (u) => u.socketId !== socket.id
      );

      const nearbyPeers = getNearbyPeersForUser(userData, allOtherUsers, EARSHOT_RADIUS);

      // Send initial room layout & state to joining user
      socket.emit('room:state', {
        user: userData,
        peers: allOtherUsers,
        nearbyPeers,
        zones: OFFICE_ZONES,
        earshotRadius: EARSHOT_RADIUS,
      });

      // Notify all other clients about the newly joined player
      socket.broadcast.emit('user:joined', userData);

      // Initial proximity check
      const initialTransitions = evaluateProximityOnMove(
        userData,
        Array.from(activeUsers.values()),
        EARSHOT_RADIUS
      );
      dispatchProximityTransitions(io, initialTransitions);

      console.log(`[Socket] User joined: ${userData.displayName} at [${userData.canvasX}, ${userData.canvasY}] (${userData.zoneName})`);
    });

    // Player movement broadcast & real-time proximity evaluation
    socket.on('player:move', (coords = {}) => {
      const user = activeUsers.get(socket.id);
      if (!user) return;

      const { x, y } = coords;
      if (typeof x === 'number' && typeof y === 'number') {
        user.canvasX = x;
        user.canvasY = y;

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

          if (user.isOnStage) {
            io.emit('spotlight:speaker_entered', {
              userId: user.userId,
              displayName: user.displayName,
              message: `${user.displayName} is speaking on the Town Hall Podium!`,
            });
          }
        }

        // 1. Broadcast movement
        socket.broadcast.emit('player:moved', {
          socketId: socket.id,
          userId: user.userId,
          canvasX: user.canvasX,
          canvasY: user.canvasY,
          zone: user.zone,
          isOnStage: user.isOnStage,
        });

        // 2. Evaluate acoustic & proximity transitions
        const allUsers = Array.from(activeUsers.values());
        const transitions = evaluateProximityOnMove(user, allUsers, EARSHOT_RADIUS);
        dispatchProximityTransitions(io, transitions);
      }
    });

    // Handle peer disconnect
    socket.on('disconnect', (reason) => {
      const user = activeUsers.get(socket.id);
      if (user) {
        activeUsers.delete(socket.id);
        userToSocket.delete(user.userId);

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

module.exports = {
  initSocketServer,
  getActiveUsers,
  getSocketByUserId,
  activeUsers,
  userToSocket,
};
