const config = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

export function createPeerManager(socket, localStream, onRemoteStream, onPeerClosed) {
  const peers = new Map(); // peerId -> RTCPeerConnection

  function createPeer(peerId) {
    const pc = new RTCPeerConnection(config);
    localStream.getTracks().forEach((t) => pc.addTrack(t, localStream));

    pc.onicecandidate = (e) => {
      if (e.candidate) socket.emit('webrtc:ice', { to: peerId, candidate: e.candidate });
    };
    pc.ontrack = (e) => onRemoteStream(peerId, e.streams[0]);
    pc.onconnectionstatechange = () => {
      if (['failed', 'closed', 'disconnected'].includes(pc.connectionState)) closePeer(peerId);
    };

    peers.set(peerId, pc);
    return pc;
  }

  // Caller side
  async function callPeer(peerId) {
    const pc = createPeer(peerId);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.emit('webrtc:offer', { to: peerId, sdp: pc.localDescription });
  }

  // Receiver side
  socket.on('webrtc:offer', async ({ from, sdp }) => {
    const pc = createPeer(from);
    await pc.setRemoteDescription(sdp);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    socket.emit('webrtc:answer', { to: from, sdp: pc.localDescription });
  });

  socket.on('webrtc:answer', async ({ from, sdp }) => {
    await peers.get(from)?.setRemoteDescription(sdp);
  });

  socket.on('webrtc:ice', async ({ from, candidate }) => {
    try { await peers.get(from)?.addIceCandidate(candidate); } catch (e) { console.warn(e); }
  });

  function closePeer(peerId) {
    peers.get(peerId)?.close();
    peers.delete(peerId);
    onPeerClosed(peerId);
  }

  return { callPeer, closePeer };
}