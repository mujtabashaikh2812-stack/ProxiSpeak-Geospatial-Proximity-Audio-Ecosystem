'use strict';

const { isWithinEarshot, calculateDistance, EARSHOT_RADIUS } = require('../services/spatialEngine');

/**
 * WebRTC Signaling Handlers with Spatial Proximity Gating:
 * Mediates SDP offer/answer handshakes and ICE candidate exchanges between browser peers.
 * Enforces the Infotact requirement: only permits audio handshakes if peers are within 100px.
 */

function registerSignalingHandlers(io, socket, userRegistry, userLookup) {
  // Helper to resolve target socket ID and target user object
  function resolveTarget(target) {
    if (!target) return { socketId: null, user: null };

    // Target is a socket.id
    if (userRegistry.has(target)) {
      return { socketId: target, user: userRegistry.get(target) };
    }

    // Target is a userId
    const mappedSocketId = userLookup.get(target);
    if (mappedSocketId && userRegistry.has(mappedSocketId)) {
      return { socketId: mappedSocketId, user: userRegistry.get(mappedSocketId) };
    }

    return { socketId: null, user: null };
  }

  // Handle SDP Offer relay (Caller -> Server -> Receiver)
  socket.on('webrtc:offer', (payload = {}) => {
    const { to, sdp } = payload;
    const { socketId: targetSocketId, user: targetUser } = resolveTarget(to);
    const senderUser = userRegistry.get(socket.id);

    if (!targetSocketId || !targetUser) {
      console.warn(`[Signaling] Offer rejected: destination peer "${to}" not found or offline`);
      socket.emit('webrtc:error', { message: `Peer ${to} is offline or unreachable` });
      return;
    }

    if (!senderUser) {
      socket.emit('webrtc:error', { message: 'Caller must join with user:join first' });
      return;
    }

    // Spatial Proximity Check: enforce 100px earshot gate
    const distance = calculateDistance(
      senderUser.canvasX,
      senderUser.canvasY,
      targetUser.canvasX,
      targetUser.canvasY
    );

    if (distance > EARSHOT_RADIUS) {
      console.warn(`[Signaling] Offer blocked: ${senderUser.userId} and ${targetUser.userId} are ${distance}px apart (> ${EARSHOT_RADIUS}px limit)`);
      socket.emit('webrtc:out-of-range', {
        to: targetUser.userId,
        distance,
        limit: EARSHOT_RADIUS,
        message: 'Cannot initiate audio: peer is outside the 100px earshot radius',
      });
      return;
    }

    const fromIdentifier = senderUser.userId || socket.id;

    // Forward offer to target peer with spatial metadata
    io.to(targetSocketId).emit('webrtc:offer', {
      from: fromIdentifier,
      fromSocketId: socket.id,
      distance,
      sdp,
    });

    console.log(`[Signaling] Relayed proximity-validated offer from ${fromIdentifier} to ${to} (${distance}px)`);
  });

  // Handle SDP Answer relay (Receiver -> Server -> Caller)
  socket.on('webrtc:answer', (payload = {}) => {
    const { to, sdp } = payload;
    const { socketId: targetSocketId, user: targetUser } = resolveTarget(to);
    const senderUser = userRegistry.get(socket.id);

    if (!targetSocketId || !targetUser) {
      console.warn(`[Signaling] Answer dropped: destination peer "${to}" not found`);
      return;
    }

    const distance = senderUser
      ? calculateDistance(senderUser.canvasX, senderUser.canvasY, targetUser.canvasX, targetUser.canvasY)
      : null;

    const fromIdentifier = senderUser ? senderUser.userId : socket.id;

    // Forward answer to caller peer
    io.to(targetSocketId).emit('webrtc:answer', {
      from: fromIdentifier,
      fromSocketId: socket.id,
      distance,
      sdp,
    });

    console.log(`[Signaling] Relayed answer from ${fromIdentifier} to ${to}`);
  });

  // Handle ICE Candidate relay (Peer <-> Server <-> Peer)
  socket.on('webrtc:ice', (payload = {}) => {
    const { to, candidate } = payload;
    const { socketId: targetSocketId } = resolveTarget(to);

    if (!targetSocketId) return;

    const senderUser = userRegistry.get(socket.id);
    const fromIdentifier = senderUser ? senderUser.userId : socket.id;

    // Forward ICE candidate to remote peer
    io.to(targetSocketId).emit('webrtc:ice', {
      from: fromIdentifier,
      fromSocketId: socket.id,
      candidate,
    });
  });

  // Handle explicit peer audio disconnection (e.g. walked out of earshot)
  socket.on('webrtc:hangup', (payload = {}) => {
    const { to } = payload;
    const { socketId: targetSocketId } = resolveTarget(to);

    if (!targetSocketId) return;

    const senderUser = userRegistry.get(socket.id);
    const fromIdentifier = senderUser ? senderUser.userId : socket.id;

    io.to(targetSocketId).emit('webrtc:peer-closed', {
      peerId: fromIdentifier,
      socketId: socket.id,
    });

    console.log(`[Signaling] Audio stream closed between ${fromIdentifier} and ${to}`);
  });
}

module.exports = { registerSignalingHandlers };
