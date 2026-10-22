'use strict';

/**
 * WebRTC Signaling Handlers:
 * Mediates SDP offer/answer handshakes and ICE candidate exchanges between browser peers.
 * Designed to seamlessly interface with the frontend WebRTC PeerManager.
 */

function registerSignalingHandlers(io, socket, userRegistry, userLookup) {
  // Helper to resolve target socket ID whether passed as socketId or userId
  function resolveTargetSocketId(target) {
    if (!target) return null;
    // Check if target is directly a connected socket.id
    if (userRegistry.has(target)) return target;
    // Check if target is a userId
    const mapped = userLookup.get(target);
    if (mapped) return mapped;
    return null;
  }

  // Handle SDP Offer relay (Caller -> Server -> Receiver)
  socket.on('webrtc:offer', (payload = {}) => {
    const { to, sdp } = payload;
    const targetSocketId = resolveTargetSocketId(to);

    if (!targetSocketId) {
      console.warn(`[Signaling] Offer dropped: destination peer "${to}" not found`);
      socket.emit('webrtc:error', { message: `Peer ${to} is offline or unreachable` });
      return;
    }

    const senderUser = userRegistry.get(socket.id);
    const fromIdentifier = senderUser ? senderUser.userId : socket.id;

    // Forward offer to the target peer
    io.to(targetSocketId).emit('webrtc:offer', {
      from: fromIdentifier,
      fromSocketId: socket.id,
      sdp,
    });

    console.log(`[Signaling] Relayed offer from ${fromIdentifier} to ${to}`);
  });

  // Handle SDP Answer relay (Receiver -> Server -> Caller)
  socket.on('webrtc:answer', (payload = {}) => {
    const { to, sdp } = payload;
    const targetSocketId = resolveTargetSocketId(to);

    if (!targetSocketId) {
      console.warn(`[Signaling] Answer dropped: destination peer "${to}" not found`);
      return;
    }

    const senderUser = userRegistry.get(socket.id);
    const fromIdentifier = senderUser ? senderUser.userId : socket.id;

    // Forward answer to the caller peer
    io.to(targetSocketId).emit('webrtc:answer', {
      from: fromIdentifier,
      fromSocketId: socket.id,
      sdp,
    });

    console.log(`[Signaling] Relayed answer from ${fromIdentifier} to ${to}`);
  });

  // Handle ICE Candidate relay (Peer <-> Server <-> Peer)
  socket.on('webrtc:ice', (payload = {}) => {
    const { to, candidate } = payload;
    const targetSocketId = resolveTargetSocketId(to);

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
    const targetSocketId = resolveTargetSocketId(to);

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
