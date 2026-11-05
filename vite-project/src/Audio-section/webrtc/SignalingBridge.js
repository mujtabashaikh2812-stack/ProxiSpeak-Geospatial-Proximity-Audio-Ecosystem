/**
 * SignalingBridge
 * 
 * Bridges client WebRTC PeerManager with live Socket.io signaling events:
 * - webrtc:offer (sets remote description, generates and replies with answer SDP)
 * - webrtc:answer (sets remote description on caller connection)
 * - webrtc:ice (adds trickle ICE candidates to active peer connection)
 * - webrtc:hangup (cleanly terminates connection and audio nodes)
 * - proximity:enter (automatically initiates WebRTC offer when avatar enters 100px earshot)
 * - proximity:leave (automatically closes peer connection when avatar leaves earshot)
 */

export function createSignalingBridge(socket, peerManager, options = {}) {
  const onStatusChange = options.onStatusChange || (() => {});
  const activeProximityPeers = new Set();

  // Listen for incoming SDP Offer
  const handleOffer = async ({ from, sdp }) => {
    try {
      console.log(`[SignalingBridge] Received WebRTC offer from peer: ${from}`);
      onStatusChange({ event: 'offer:received', peerId: from });
      const pc = peerManager.getOrCreatePeer(from);
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));

      // Process any queued ICE candidates
      peerManager.flushPendingIceCandidates(from);

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      socket.emit('webrtc:answer', {
        to: from,
        sdp: pc.localDescription,
      });
      onStatusChange({ event: 'answer:sent', peerId: from });
    } catch (err) {
      console.error(`[SignalingBridge] Failed to handle offer from ${from}:`, err);
    }
  };

  // Listen for incoming SDP Answer
  const handleAnswer = async ({ from, sdp }) => {
    try {
      console.log(`[SignalingBridge] Received WebRTC answer from peer: ${from}`);
      const pc = peerManager.getPeer(from);
      if (pc) {
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        peerManager.flushPendingIceCandidates(from);
        onStatusChange({ event: 'answer:applied', peerId: from });
      }
    } catch (err) {
      console.error(`[SignalingBridge] Failed to handle answer from ${from}:`, err);
    }
  };

  // Listen for incoming ICE Candidate
  const handleIceCandidate = async ({ from, candidate }) => {
    try {
      if (!candidate) return;
      const pc = peerManager.getPeer(from);
      if (pc && pc.remoteDescription && pc.remoteDescription.type) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } else {
        // Queue candidate until remote description is set
        peerManager.queueIceCandidate(from, candidate);
      }
    } catch (err) {
      console.warn(`[SignalingBridge] Could not add ICE candidate from ${from}:`, err);
    }
  };

  // Listen for peer hangup/departure
  const handleHangup = ({ from, reason }) => {
    console.log(`[SignalingBridge] Peer hangup: ${from} (reason: ${reason || 'normal'})`);
    activeProximityPeers.delete(from);
    peerManager.closePeer(from);
    onStatusChange({ event: 'peer:closed', peerId: from, reason });
  };

  // Automatic Proximity Trigger: avatar enters 100px earshot
  const handleProximityEnter = ({ peerId, peerSocketId, displayName, distance }) => {
    console.log(`[SignalingBridge] Proximity ENTER detected with ${displayName || peerId} (${distance}px)`);
    activeProximityPeers.add(peerId);

    // Call peer if we have deterministic tie-break priority (lexicographical user ID check)
    const myId = options.myUserId || socket.id;
    if (myId < peerId) {
      peerManager.callPeer(peerId).catch((err) => {
        console.warn(`[SignalingBridge] Auto-call to ${peerId} failed:`, err);
      });
    }
    onStatusChange({ event: 'proximity:enter', peerId, distance });
  };

  // Automatic Proximity Trigger: avatar leaves 100px earshot
  const handleProximityLeave = ({ peerId, reason }) => {
    console.log(`[SignalingBridge] Proximity LEAVE detected with ${peerId} (${reason})`);
    activeProximityPeers.delete(peerId);
    peerManager.closePeer(peerId);
    onStatusChange({ event: 'proximity:leave', peerId, reason });
  };

  // Register socket listeners
  socket.on('webrtc:offer', handleOffer);
  socket.on('webrtc:answer', handleAnswer);
  socket.on('webrtc:ice', handleIceCandidate);
  socket.on('webrtc:hangup', handleHangup);
  socket.on('proximity:enter', handleProximityEnter);
  socket.on('proximity:leave', handleProximityLeave);

  function destroy() {
    socket.off('webrtc:offer', handleOffer);
    socket.off('webrtc:answer', handleAnswer);
    socket.off('webrtc:ice', handleIceCandidate);
    socket.off('webrtc:hangup', handleHangup);
    socket.off('proximity:enter', handleProximityEnter);
    socket.off('proximity:leave', handleProximityLeave);
    activeProximityPeers.clear();
  }

  return {
    destroy,
    getActiveProximityPeers: () => Array.from(activeProximityPeers),
  };
}
