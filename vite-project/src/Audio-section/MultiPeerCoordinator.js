import { getAudioContext } from "./AudioContext";
import { createWallFilter, setOccluded } from "./WallFilter";
import { distanceToVolume } from "./Distancevolume"; // rename to your export
import { xToPan } from "./Spitialpanner"; // rename to your export

const RTC_CONFIG = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

export default class MultiPeerCoordinator {
  peers = new Map(); // peerId -> { peerConnection, gainNode, pannerNode, wallFilter, source, stream }
  localStream = null;

  constructor(bridge, myId, maxPeers = 6) {
    this.bridge = bridge;
    this.myId = myId;
    this.maxPeers = maxPeers;
    bridge.listen({
      offer: this.handleOffer,
      answer: this.handleAnswer,
      ice: this.handleIce,
      hangup: this.removePeer,
    });
  }

  setMaxPeers(count) {
    this.maxPeers = count;
  }

  setLocalStream(stream) {
    this.localStream = stream;
    const track = stream?.getAudioTracks()[0];
    this.peers.forEach(({ peerConnection }) =>
      peerConnection.getSenders().find((s) => s.track?.kind === "audio")?.replaceTrack(track)
    );
  }

  createPeer(peerId) {
    if (this.peers.has(peerId)) return this.peers.get(peerId);
    if (this.peers.size >= this.maxPeers) return null;

    const ctx = getAudioContext();
    const peerConnection = new RTCPeerConnection(RTC_CONFIG);
    const wallFilter = createWallFilter();
    const pannerNode = ctx.createStereoPanner();
    const gainNode = ctx.createGain();
    wallFilter.connect(pannerNode).connect(gainNode).connect(ctx.destination);

    const peer = { peerConnection, gainNode, pannerNode, wallFilter, source: null, stream: null };

    this.localStream?.getTracks().forEach((t) => peerConnection.addTrack(t, this.localStream));

    peerConnection.onicecandidate = ({ candidate }) =>
      candidate && this.bridge.sendIce(peerId, candidate);

    peerConnection.onconnectionstatechange = () => {
      if (["failed", "closed"].includes(peerConnection.connectionState)) this.removePeer(peerId);
    };

    peerConnection.ontrack = ({ streams: [stream] }) => {
      new Audio().srcObject = stream; // Chrome needs this for Web Audio to receive remote audio
      peer.stream = stream;
      peer.source = ctx.createMediaStreamSource(stream);
      peer.source.connect(wallFilter);
    };

    this.peers.set(peerId, peer);
    return peer;
  }

  // Call when the server says a person is nearby. Smaller id sends the offer.
  async addPeer(peerId) {
    const peer = this.createPeer(peerId);
    if (!peer || this.myId > peerId) return;
    const pc = peer.peerConnection;
    await pc.setLocalDescription(await pc.createOffer());
    this.bridge.sendOffer(peerId, pc.localDescription);
  }

  handleOffer = async (from, sdp) => {
    const peer = this.createPeer(from);
    if (!peer) return;
    const pc = peer.peerConnection;
    await pc.setRemoteDescription(sdp);
    await pc.setLocalDescription(await pc.createAnswer());
    this.bridge.sendAnswer(from, pc.localDescription);
  };

  handleAnswer = (from, sdp) => this.peers.get(from)?.peerConnection.setRemoteDescription(sdp);

  handleIce = (from, candidate) => this.peers.get(from)?.peerConnection.addIceCandidate(candidate);

  // Call every time positions change.
  updatePeer(peerId, { distance, dx, occluded, isOnStage }) {
    const peer = this.peers.get(peerId);
    if (!peer) return;
    const { currentTime } = getAudioContext();
    peer.gainNode.gain.setTargetAtTime(isOnStage ? 1 : distanceToVolume(distance), currentTime, 0.05);
    peer.pannerNode.pan.setTargetAtTime(isOnStage ? 0 : xToPan(dx), currentTime, 0.05);
    setOccluded(peer.wallFilter, occluded && !isOnStage);
  }

  removePeer = (peerId) => {
    const peer = this.peers.get(peerId);
    if (!peer) return;
    peer.source?.disconnect();
    peer.wallFilter.disconnect();
    peer.pannerNode.disconnect();
    peer.gainNode.disconnect();
    peer.peerConnection.close();
    this.peers.delete(peerId);
  };

  leavePeer(peerId) {
    this.bridge.sendHangup(peerId);
    this.removePeer(peerId);
  }

  closeAll() {
    [...this.peers.keys()].forEach((id) => this.leavePeer(id));
    this.bridge.stop();
  }
}