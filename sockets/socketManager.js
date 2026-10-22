'use strict';

const { Server } = require('socket.io');
const config = require('../config/serverConfig');
const { registerSignalingHandlers } = require('./signalingHandler');

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
      const existingUsers = Array.from(activeUsers.values()).filter(
        (u) => u.socketId !== socket.id
      );
      socket.emit('room:state', { peers: existingUsers });

      // Notify all other clients about the newly joined player
      socket.broadcast.emit('user:joined', userData);

      console.log(`[Socket] User joined: ${userData.displayName} (${userData.userId}) at [${userData.canvasX}, ${userData.canvasY}]`);
    });

    // Player movement broadcast
    socket.on('player:move', (coords = {}) => {
      const user = activeUsers.get(socket.id);
      if (!user) return;

      const { x, y } = coords;
      if (typeof x === 'number' && typeof y === 'number') {
        user.canvasX = x;
        user.canvasY = y;

        // Broadcast new position to all other connected peers
        socket.broadcast.emit('player:moved', {
          socketId: socket.id,
          userId: user.userId,
          canvasX: user.canvasX,
          canvasY: user.canvasY,
        });
      }
    });

    // Handle peer disconnect
    socket.on('disconnect', (reason) => {
      const user = activeUsers.get(socket.id);
      if (user) {
        activeUsers.delete(socket.id);
        userToSocket.delete(user.userId);

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
};
