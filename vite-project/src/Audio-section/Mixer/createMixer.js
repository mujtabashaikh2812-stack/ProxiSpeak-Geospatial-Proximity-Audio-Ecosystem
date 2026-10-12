import { getAudioContext } from '../AudioContext';
import { createPeerAudio } from './gainManager';
import { distanceBetween, volumeForDistance } from './distanceVolume';
import { hasLineOfSight } from './occlusion';

const SPEAKING_THRESHOLD = 0.02; // raw volume (0..1) above which someone counts as speaking

// Keeps one audio chain per remote player and updates them all from positions.
export function createMixer() {
  const ctx = getAudioContext();
  const peers = new Map(); // peerId -> { stream, audio }

  function addPeer(id, stream) {
    const existing = peers.get(id);
    if (existing && existing.stream === stream) return;
    existing?.audio.dispose();
    peers.set(id, { stream, audio: createPeerAudio(ctx, stream) });
  }

  function removePeer(id) {
    peers.get(id)?.audio.dispose();
    peers.delete(id);
  }

  // me = { x, y }, positions = { peerId: { x, y } }, walls = [{ x, y, w, h }]
  function update(me, positions, walls = []) {
    if (!me) return;
    peers.forEach(({ audio }, id) => {
      const pos = positions?.[id];
      if (!pos) return; // unknown position: stays silent
      audio.update({
        volume: volumeForDistance(distanceBetween(me, pos)),
        offsetX: pos.x - me.x,
        offsetY: pos.y - me.y,
        occluded: !hasLineOfSight(me, pos, walls),
      });
    });
  }

  function getSpeakingIds() {
    return [...peers]
      .filter(([, p]) => p.audio.getLevel() > SPEAKING_THRESHOLD)
      .map(([id]) => id);
  }

  const peerIds = () => [...peers.keys()];

  function dispose() {
    peers.forEach(({ audio }) => audio.dispose());
    peers.clear();
  }

  return { addPeer, removePeer, update, getSpeakingIds, peerIds, dispose };
}