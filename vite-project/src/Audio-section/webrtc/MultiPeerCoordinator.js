import { DEFAULT_RTC_CONFIG, attachIceDiagnostics } from './IceConfig';
import { getAudioContext } from '../AudioContext';

const MAX_CONCURRENT_PEERS = 6;

/**
 * MultiPeerCoordinator
 * 
 * Manages full multi-peer WebRTC spatial audio mesh (up to 6 concurrent peers).
 * Integrates RTCPeerConnection stream pipelines with Web Audio GainNode & StereoPannerNode.
 */
export class MultiPeerCoordinator {
  constructor(socket, localStream, options = {}) {
    this.socket = socket;
    this.localStream = localStream;
    this.maxPeers = options.maxPeers || MAX_CONCURRENT_PEERS;
    this.audioContext = options.audioContext || getAudioContext();

    this.peers = new Map(); // peerId -> { pc, stream, sourceNode, gainNode, pannerNode, isMuted }
    this.pendingIceCandidates = new Map(); // peerId -> Array<RTCIceCandidate>
    this.demotedPeers = new Set(); // peerIds demoted by backend mesh cap
    this.onRemoteStream = options.onRemoteStream || (() => {});
    this.onPeerDisconnected = options.onPeerDisconnected || (() => {});

    // Bind backend mesh capping listener if socket provided
    if (this.socket) {
      this.bindMeshUpdateListener(this.socket);
    }
  }

  /**
   * Listens for backend WebRTC mesh connection capping and priority reallocations
   */
  bindMeshUpdateListener(socket) {
    socket.on('mesh:update', ({ activePeerIds = [], promoted = [], demoted = [], isCapped }) => {
      console.log(`[MultiPeerCoordinator] Mesh update: ${activePeerIds.length} active peers, isCapped: ${isCapped}`);

      // Handle demoted peers (surpassed max 6 peer cap)
      for (const peerId of demoted) {
        this.demotedPeers.add(peerId);
        const peerData = this.peers.get(peerId);
        if (peerData && peerData.gainNode) {
          const now = this.audioContext.currentTime;
          peerData.gainNode.gain.linearRampToValueAtTime(0.0, now + 0.1);
        }
      }

      // Handle promoted peers (freed up mesh slot)
      for (const peerId of promoted) {
        this.demotedPeers.delete(peerId);
        const peerData = this.peers.get(peerId);
        if (peerData && peerData.gainNode) {
          const now = this.audioContext.currentTime;
          peerData.gainNode.gain.linearRampToValueAtTime(1.0, now + 0.1);
        }
      }
    });
  }

  isPeerDemoted(peerId) {
    return this.demotedPeers.has(peerId);
  }

  getOrCreatePeer(peerId) {
    if (this.peers.has(peerId)) {
      return this.peers.get(peerId).pc;
    }
    return this.createPeer(peerId);
  }

  getPeer(peerId) {
    return this.peers.get(peerId)?.pc || null;
  }

  createPeer(peerId) {
    if (this.peers.size >= this.maxPeers && !this.peers.has(peerId)) {
      console.warn(`[MultiPeerCoordinator] Max peer cap (${this.maxPeers}) reached. Cannot connect to ${peerId}.`);
      throw new Error(`Max mesh capacity reached (${this.maxPeers})`);
    }

    const pc = new RTCPeerConnection(DEFAULT_RTC_CONFIG);

    // Attach diagnostic logs
    attachIceDiagnostics(pc, peerId);

    // Add local audio tracks to peer connection
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        pc.addTrack(track, this.localStream);
      });
    }

    // ICE Candidate emission to signaling server
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.socket.emit('webrtc:ice', {
          to: peerId,
          candidate: event.candidate,
        });
      }
    };

    // Inbound remote audio stream handling
    pc.ontrack = (event) => {
      console.log(`[MultiPeerCoordinator] Received remote audio track from ${peerId}`);
      const remoteStream = event.streams[0];
      this._setupPeerAudioNodes(peerId, remoteStream);
      this.onRemoteStream(peerId, remoteStream);
    };

    // Connection lifecycle monitoring
    pc.onconnectionstatechange = () => {
      console.log(`[MultiPeerCoordinator] Peer ${peerId} state: ${pc.connectionState}`);
      if (['failed', 'disconnected', 'closed'].includes(pc.connectionState)) {
        this.closePeer(peerId);
      }
    };

    this.peers.set(peerId, {
      pc,
      stream: null,
      sourceNode: null,
      gainNode: null,
      pannerNode: null,
      isMuted: false,
    });

    return pc;
  }

  _setupPeerAudioNodes(peerId, remoteStream) {
    const peerData = this.peers.get(peerId);
    if (!peerData) return;

    peerData.stream = remoteStream;

    try {
      const ctx = this.audioContext;
      const source = ctx.createMediaStreamSource(remoteStream);
      const gainNode = ctx.createGain();
      gainNode.gain.setValueAtTime(1.0, ctx.currentTime);

      let pannerNode = null;
      if (ctx.createStereoPanner) {
        pannerNode = ctx.createStereoPanner();
        pannerNode.pan.setValueAtTime(0.0, ctx.currentTime);
        source.connect(gainNode).connect(pannerNode).connect(ctx.destination);
      } else {
        source.connect(gainNode).connect(ctx.destination);
      }

      peerData.sourceNode = source;
      peerData.gainNode = gainNode;
      peerData.pannerNode = pannerNode;
    } catch (err) {
      console.warn(`[MultiPeerCoordinator] Web Audio setup warning for ${peerId}:`, err);
    }
  }

  async callPeer(peerId) {
    const pc = this.getOrCreatePeer(peerId);
    const offer = await pc.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: false,
    });
    await pc.setLocalDescription(offer);

    this.socket.emit('webrtc:offer', {
      to: peerId,
      sdp: pc.localDescription,
    });
  }

  queueIceCandidate(peerId, candidate) {
    if (!this.pendingIceCandidates.has(peerId)) {
      this.pendingIceCandidates.set(peerId, []);
    }
    this.pendingIceCandidates.get(peerId).push(candidate);
  }

  flushPendingIceCandidates(peerId) {
    const pending = this.pendingIceCandidates.get(peerId) || [];
    const pc = this.getPeer(peerId);
    if (!pc || pending.length === 0) return;

    for (const candidate of pending) {
      pc.addIceCandidate(new RTCIceCandidate(candidate)).catch((err) => {
        console.warn(`[MultiPeerCoordinator] Could not flush candidate:`, err);
      });
    }
    this.pendingIceCandidates.delete(peerId);
  }

  updatePeerSpatial(peerId, { volume = 1.0, pan = 0.0 }) {
    const peerData = this.peers.get(peerId);
    if (!peerData) return;

    const ctx = this.audioContext;
    const now = ctx.currentTime;

    if (peerData.gainNode) {
      const clampedGain = Math.max(0.0, Math.min(1.5, volume));
      peerData.gainNode.gain.linearRampToValueAtTime(clampedGain, now + 0.05);
    }

    if (peerData.pannerNode && peerData.pannerNode.pan) {
      const clampedPan = Math.max(-1.0, Math.min(1.0, pan));
      peerData.pannerNode.pan.linearRampToValueAtTime(clampedPan, now + 0.05);
    }
  }

  closePeer(peerId) {
    const peerData = this.peers.get(peerId);
    if (!peerData) return;

    try {
      if (peerData.sourceNode) peerData.sourceNode.disconnect();
      if (peerData.gainNode) peerData.gainNode.disconnect();
      if (peerData.pannerNode) peerData.pannerNode.disconnect();
      if (peerData.pc) peerData.pc.close();
    } catch (e) {
      console.warn(`[MultiPeerCoordinator] Disconnect cleanup note:`, e);
    }

    this.peers.delete(peerId);
    this.pendingIceCandidates.delete(peerId);
    this.onPeerDisconnected(peerId);
  }

  destroy() {
    for (const peerId of Array.from(this.peers.keys())) {
      this.closePeer(peerId);
    }
    this.peers.clear();
    this.pendingIceCandidates.clear();
  }

  getConnectedPeerCount() {
    return this.peers.size;
  }
}
