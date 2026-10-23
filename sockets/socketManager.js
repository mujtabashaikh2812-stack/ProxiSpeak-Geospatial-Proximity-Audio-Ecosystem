'use strict';

const { Server } = require('socket.io');
const config = require('../config/serverConfig');
const { registerSignalingHandlers } = require('./signalingHandler');
const {
  evaluateProximityOnMove,
  cleanupUserProximity,
  getNearbyPeersForUser,
  EARSHOT_RADIUS,
} = require('../services/spatialEngine');

/**
 * In-memory active user registry:
 * Maps socket.id -> {
 *   socketId: string,
 *   userId: string,
 *   displayName: string,
 *   canvasX: number,
 *   canvasY: number,
 *   joinedAt: string
 * }
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

    // Register WebRTC P2P signaling handlers (offer, answer, ICE candidates)
    registerSignalingHandlers(io, socket, activeUsers, userToSocket);

    // User announces presence and initial canvas position
    socket.on('user:join', (payload = {}) => {
      const { userId, displayName, canvasX = 100, canvasY = 100 } = payload;

      if (!userId) {
        socket.emit('error:join', { message: 'userId is required to join' });
        return;
      }

      const userData = {
        socketId: socket.id,
        userId: String(userId),
        displayName: displayName || `User-${userId.slice(0, 4)}`,
        canvasX: Number(canvasX) || 0,
        canvasY: Number(canvasY) || 0,
        joinedAt: new Date().toISOString(),
      };

      activeUsers.set(socket.id, userData);
      userToSocket.set(userData.userId, socket.id);

      // Send the joining user the current list of other connected players
      const allOtherUsers = Array.from(activeUsers.values()).filter(
        (u) => u.socketId !== socket.id
      );

      // Initial nearby peers within 100px earshot
      const nearbyPeers = getNearbyPeersForUser(userData, allOtherUsers, EARSHOT_RADIUS);

      socket.emit('room:state', {
        peers: allOtherUsers,
        nearbyPeers,
        earshotRadius: EARSHOT_RADIUS,
      });

      // Notify all other clients about the newly joined player
      socket.broadcast.emit('user:joined', userData);

      // Evaluate if initial spawn is already near anyone
      const initialTransitions = evaluateProximityOnMove(
        userData,
        Array.from(activeUsers.values()),
        EARSHOT_RADIUS
      );
      dispatchProximityTransitions(io, initialTransitions);

      console.log(`[Socket] User joined: ${userData.displayName} (${userData.userId}) at [${userData.canvasX}, ${userData.canvasY}]`);
    });

    // Player movement broadcast & real-time proximity evaluation
    socket.on('player:move', (coords = {}) => {
      const user = activeUsers.get(socket.id);
      if (!user) return;

      const { x, y } = coords;
      if (typeof x === 'number' && typeof y === 'number') {
        user.canvasX = x;
        user.canvasY = y;

        // 1. Broadcast new position to all other connected peers
        socket.broadcast.emit('player:moved', {
          socketId: socket.id,
          userId: user.userId,
          canvasX: user.canvasX,
          canvasY: user.canvasY,
        });

        // 2. Evaluate proximity transitions (enter, update distance, exit earshot)
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

        // Clean up active proximity pairs and notify affected peers
        const departures = cleanupUserProximity(user.userId, remainingUsers);
        for (const dep of departures) {
          io.to(dep.targetSocketId).emit('proximity:leave', {
            peerId: dep.disconnectedUserId,
            reason: 'disconnected',
          });
        }

        // Notify other clients to remove avatar and close WebRTC peer connection
        socket.broadcast.emit('user:left', {
          socketId: socket.id,
          userId: user.userId,
          reason,
        });

        console.log(`[Socket] User left: ${user.displayName} (${user.userId}) - Reason: ${reason}`);
      } else {
        console.log(`[Socket] Unregistered peer disconnected: ${socket.id} (${reason})`);
      }
    });
  });

  return io;
}

/**
 * Dispatches proximity lifecycle events directly to the affected peer sockets
 */
function dispatchProximityTransitions(io, transitions) {
  for (const t of transitions) {
    const { type, peerA, peerB, distance } = t;

    if (type === 'enter') {
      // Both peers are notified that they entered each other's earshot
      io.to(peerA.socketId).emit('proximity:enter', {
        peerId: peerB.userId,
        peerSocketId: peerB.socketId,
        displayName: peerB.displayName,
        distance,
      });
      io.to(peerB.socketId).emit('proximity:enter', {
        peerId: peerA.userId,
        peerSocketId: peerA.socketId,
        displayName: peerA.displayName,
        distance,
      });
      console.log(`[Proximity] Earshot entered: ${peerA.displayName} <-> ${peerB.displayName} (${distance}px)`);
    } else if (type === 'update') {
      // Both peers receive continuous distance updates for dynamic Web Audio API gain adjustment
      io.to(peerA.socketId).emit('proximity:update', {
        peerId: peerB.userId,
        distance,
      });
      io.to(peerB.socketId).emit('proximity:update', {
        peerId: peerA.userId,
        distance,
      });
    } else if (type === 'leave') {
      // Both peers are notified that they walked out of earshot
      io.to(peerA.socketId).emit('proximity:leave', {
        peerId: peerB.userId,
        distance,
      });
      io.to(peerB.socketId).emit('proximity:leave', {
        peerId: peerA.userId,
        distance,
      });
      console.log(`[Proximity] Earshot left: ${peerA.displayName} <-> ${peerB.displayName} (${distance}px)`);
    }
  }
}

function getActiveUsers() {
  return Array.from(activeUsers.values());
}

function getSocketByUserId(userId) {
  const socketId = userToSocket.get(userId);
  return socketId || null;
}

module.exports = {
  initSocketServer,
  getActiveUsers,
  getSocketByUserId,
  activeUsers,
  userToSocket,
};
