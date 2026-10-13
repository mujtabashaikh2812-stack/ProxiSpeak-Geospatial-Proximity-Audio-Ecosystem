import { useEffect, useRef, useState } from 'react';
import { createMixer } from '../Mixer/createMixer';

// remoteStreams  = { peerId: MediaStream }      (from useVoiceRoom)
// myPosition     = { x, y }                      (from the canvas)
// peerPositions  = { peerId: { x, y } }          (from the canvas / server)
// walls          = [{ x, y, w, h }]              (from the canvas)
// Keep these objects stable (useMemo / state) so the hook only reruns when they change.
export function useSpatialAudio({ remoteStreams, myPosition, peerPositions, walls }) {
  const mixerRef = useRef(null);
  const [speakingIds, setSpeakingIds] = useState([]);

  // Create / destroy the mixer.
  useEffect(() => {
    const mixer = createMixer();
    mixerRef.current = mixer;
    return () => {
      mixer.dispose();
      mixerRef.current = null;
    };
  }, []);

  // Add new voices, remove the ones that left.
  useEffect(() => {
    const mixer = mixerRef.current;
    if (!mixer) return;
    const ids = Object.keys(remoteStreams || {});
    ids.forEach((id) => mixer.addPeer(id, remoteStreams[id]));
    mixer.peerIds().filter((id) => !ids.includes(id)).forEach((id) => mixer.removePeer(id));
    mixer.update(myPosition, peerPositions, walls);
  }, [remoteStreams, myPosition, peerPositions, walls]);

  // Who is speaking right now (Akhila can use this for the speaking waves).
  useEffect(() => {
    const timer = setInterval(() => {
      const next = mixerRef.current?.getSpeakingIds() ?? [];
      setSpeakingIds((prev) =>
        prev.length === next.length && prev.every((v, i) => v === next[i]) ? prev : next,
      );
    }, 100);
    return () => clearInterval(timer);
  }, []);

  return { speakingIds };
}