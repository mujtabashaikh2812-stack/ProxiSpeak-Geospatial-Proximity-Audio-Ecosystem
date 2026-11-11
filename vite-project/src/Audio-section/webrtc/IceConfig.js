/**
 * IceConfig
 * 
 * WebRTC ICE & STUN Server Configuration
 * 
 * Configures redundant STUN servers for NAT traversal, connection candidate filtering,
 * and connection health diagnostics across local and remote networks.
 */

export const DEFAULT_RTC_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
  ],
  iceCandidatePoolSize: 4,
  bundlePolicy: 'max-bundle',
  rtcpMuxPolicy: 'require',
};

/**
 * Validates and logs ICE candidate attributes
 * @param {RTCIceCandidate} candidate
 * @returns {boolean} Whether candidate is valid
 */
export function isValidCandidate(candidate) {
  if (!candidate || !candidate.candidate) return false;
  // Exclude mDNS or empty candidates if desired
  return candidate.candidate.trim().length > 0;
}

/**
 * Attaches diagnostic state monitors to an RTCPeerConnection instance
 * @param {RTCPeerConnection} pc
 * @param {string} peerId
 * @param {Function} onStateChange - Callback on state transition
 */
export function attachIceDiagnostics(pc, peerId, onStateChange = () => {}) {
  pc.oniceconnectionstatechange = () => {
    const state = pc.iceConnectionState;
    console.log(`[ICE] Peer ${peerId} ICE connection state: ${state}`);
    onStateChange({ type: 'iceConnectionState', peerId, state });
  };

  pc.onicegatheringstatechange = () => {
    const state = pc.iceGatheringState;
    console.log(`[ICE] Peer ${peerId} ICE gathering state: ${state}`);
    onStateChange({ type: 'iceGatheringState', peerId, state });
  };

  pc.onsignalingstatechange = () => {
    const state = pc.signalingState;
    console.log(`[ICE] Peer ${peerId} signaling state: ${state}`);
    onStateChange({ type: 'signalingState', peerId, state });
  };
}
