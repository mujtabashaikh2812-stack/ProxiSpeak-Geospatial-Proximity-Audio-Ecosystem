'use strict';

const { calculateDistance, EARSHOT_RADIUS } = require('../services/spatialEngine');
const { evaluateAcousticRelation } = require('../services/zoneManager');
const { defaultMeshManager } = require('../services/meshManager');

/**
 * WebRTC Signaling Handlers with Spatial & Acoustic Zone Gating:
 * Mediates SDP offer/answer handshakes and ICE candidate exchanges between browser peers.
 * Enforces the physical earshot boundary, enclosed meeting room containment,
 * and the Spotlight Podium global broadcast policy.
 */

function registerSignalingHandlers(io, socket, userRegistry, userLookup, clusterAdapter = null) {
  function resolveTarget(target) {
    if (!target) return { socketId: null, user: null };

    if (userRegistry.has(target)) {
      return { socketId: target, user: userRegistry.get(target) };
    }

    const mappedSocketId = userLookup.get(target);
    if (mappedSocketId && userRegistry.has(mappedSocketId)) {
      return { socketId: mappedSocketId, user: userRegistry.get(mappedSocketId) };
    }

    return { socketId: null, user: null };
  }

  // Handle SDP Offer relay
  socket.on('webrtc:offer', (payload = {}) => {
    const { to, sdp } = payload;
    const { socketId: targetSocketId, user: targetUser } = resolveTarget(to);
    const senderUser = userRegistry.get(socket.id);

    if (!senderUser) {
      socket.emit('webrtc:error', { message: 'Caller must join with user:join first' });
      return;
    }

    // Dynamic Mesh Connection Capping Check
    if (!defaultMeshManager.canEstablishConnection(senderUser.userId, to)) {
      console.warn(`[Signaling] Offer suppressed: Mesh connection cap reached between ${senderUser.userId} and ${to}`);
      socket.emit('webrtc:mesh-capped', {
        to,
        message: 'Mesh connection cap reached. Audio connection prioritized for closer peers.',
      });
      return;
    }

    if (!targetSocketId || !targetUser) {
      // Check if target user is hosted on another cluster instance
      if (clusterAdapter && clusterAdapter.getUser(to)) {
        const remoteTarget = clusterAdapter.getUser(to);
        const distance = calculateDistance(
          senderUser.canvasX,
          senderUser.canvasY,
          remoteTarget.canvasX,
          remoteTarget.canvasY
        );

        const acoustic = evaluateAcousticRelation(senderUser, remoteTarget, distance, EARSHOT_RADIUS);

        if (!acoustic.canHear) {
          console.warn(`[Signaling] Cross-cluster offer blocked between ${senderUser.userId} and ${remoteTarget.userId}: ${acoustic.reason}`);
          socket.emit('webrtc:out-of-range', {
            to: remoteTarget.userId,
            distance,
            reason: acoustic.reason,
            message: `Audio connection blocked: ${acoustic.reason}`,
          });
          return;
        }

        const fromIdentifier = senderUser.userId || socket.id;

        clusterAdapter.unicast(remoteTarget.userId, 'webrtc:offer', {
          from: fromIdentifier,
          fromSocketId: socket.id,
          distance,
          mode: acoustic.mode,
          effectiveVolume: acoustic.effectiveVolume,
          sdp,
        });

        console.log(`[Signaling] Relayed cross-cluster offer (${acoustic.mode}) from ${fromIdentifier} to ${to} (dist: ${distance}px)`);
        return;
      }

      console.warn(`[Signaling] Offer rejected: destination peer "${to}" not found or offline`);
      socket.emit('webrtc:error', { message: `Peer ${to} is offline or unreachable` });
      return;
    }

    // Acoustic & Proximity check
    const distance = calculateDistance(
      senderUser.canvasX,
      senderUser.canvasY,
      targetUser.canvasX,
      targetUser.canvasY
    );

    const acoustic = evaluateAcousticRelation(senderUser, targetUser, distance, EARSHOT_RADIUS);

    if (!acoustic.canHear) {
      console.warn(`[Signaling] Offer blocked between ${senderUser.userId} and ${targetUser.userId}: ${acoustic.reason}`);
      socket.emit('webrtc:out-of-range', {
        to: targetUser.userId,
        distance,
        reason: acoustic.reason,
        message: `Audio connection blocked: ${acoustic.reason}`,
      });
      return;
    }

    const fromIdentifier = senderUser.userId || socket.id;

    // Forward offer to target peer with spatial metadata
    io.to(targetSocketId).emit('webrtc:offer', {
      from: fromIdentifier,
      fromSocketId: socket.id,
      distance,
      mode: acoustic.mode,
      effectiveVolume: acoustic.effectiveVolume,
      sdp,
    });

    console.log(`[Signaling] Relayed offer (${acoustic.mode}) from ${fromIdentifier} to ${to} (dist: ${distance}px)`);
  });

  // Handle SDP Answer relay
  socket.on('webrtc:answer', (payload = {}) => {
    const { to, sdp } = payload;
    const { socketId: targetSocketId, user: targetUser } = resolveTarget(to);
    const senderUser = userRegistry.get(socket.id);

    if (!targetSocketId || !targetUser) {
      // Check cross-cluster routing
      if (clusterAdapter && clusterAdapter.getUser(to)) {
        const remoteTarget = clusterAdapter.getUser(to);
        const distance = senderUser
          ? calculateDistance(senderUser.canvasX, senderUser.canvasY, remoteTarget.canvasX, remoteTarget.canvasY)
          : null;

        const fromIdentifier = senderUser ? senderUser.userId : socket.id;

        clusterAdapter.unicast(remoteTarget.userId, 'webrtc:answer', {
          from: fromIdentifier,
          fromSocketId: socket.id,
          distance,
          sdp,
        });

        console.log(`[Signaling] Relayed cross-cluster answer from ${fromIdentifier} to ${to}`);
        return;
      }

      console.warn(`[Signaling] Answer dropped: destination peer "${to}" not found`);
      return;
    }

    const distance = senderUser
      ? calculateDistance(senderUser.canvasX, senderUser.canvasY, targetUser.canvasX, targetUser.canvasY)
      : null;

    const fromIdentifier = senderUser ? senderUser.userId : socket.id;

    io.to(targetSocketId).emit('webrtc:answer', {
      from: fromIdentifier,
      fromSocketId: socket.id,
      distance,
      sdp,
    });

    console.log(`[Signaling] Relayed answer from ${fromIdentifier} to ${to}`);
  });

  // Handle ICE Candidate relay
  socket.on('webrtc:ice', (payload = {}) => {
    const { to, candidate } = payload;
    const { socketId: targetSocketId } = resolveTarget(to);
    const senderUser = userRegistry.get(socket.id);

    if (!targetSocketId) {
      if (clusterAdapter && clusterAdapter.getUser(to)) {
        const remoteTarget = clusterAdapter.getUser(to);
        const fromIdentifier = senderUser ? senderUser.userId : socket.id;

        clusterAdapter.unicast(remoteTarget.userId, 'webrtc:ice', {
          from: fromIdentifier,
          fromSocketId: socket.id,
          candidate,
        });
      }
      return;
    }

    const fromIdentifier = senderUser ? senderUser.userId : socket.id;

    io.to(targetSocketId).emit('webrtc:ice', {
      from: fromIdentifier,
      fromSocketId: socket.id,
      candidate,
    });
  });

  // Handle explicit peer audio disconnection
  socket.on('webrtc:hangup', (payload = {}) => {
    const { to } = payload;
    const { socketId: targetSocketId } = resolveTarget(to);
    const senderUser = userRegistry.get(socket.id);

    if (!targetSocketId) {
      if (clusterAdapter && clusterAdapter.getUser(to)) {
        const remoteTarget = clusterAdapter.getUser(to);
        const fromIdentifier = senderUser ? senderUser.userId : socket.id;

        clusterAdapter.unicast(remoteTarget.userId, 'webrtc:peer-closed', {
          peerId: fromIdentifier,
          socketId: socket.id,
        });
        console.log(`[Signaling] Cross-cluster audio stream closed between ${fromIdentifier} and ${to}`);
      }
      return;
    }

    const fromIdentifier = senderUser ? senderUser.userId : socket.id;

    io.to(targetSocketId).emit('webrtc:peer-closed', {
      peerId: fromIdentifier,
      socketId: socket.id,
    });

    console.log(`[Signaling] Audio stream closed between ${fromIdentifier} and ${to}`);
  });
}

module.exports = { registerSignalingHandlers };
