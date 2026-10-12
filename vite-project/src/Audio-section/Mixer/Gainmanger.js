import { createSpatialPanner, setPannerPosition } from './spatialPanner';
import { OPEN_FREQ, OCCLUDED_FREQ, OCCLUDED_GAIN } from './occlusion';

const SMOOTH = 0.05; // seconds, avoids clicks when values change

// Audio chain for ONE remote player:
// stream -> lowpass filter (walls) -> GainNode (distance) -> PannerNode (left/right) -> speakers
export function createPeerAudio(ctx, stream) {
  // Chrome only sends WebRTC audio into Web Audio if the stream is also
  // attached to a muted media element. The sound itself comes from the chain below.
  const el = new Audio();
  el.srcObject = stream;
  el.muted = true;
  el.play().catch(() => {});

  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser(); // tap before volume changes, for speaking detection
  analyser.fftSize = 512;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = OPEN_FREQ;
  const gain = ctx.createGain();
  gain.gain.value = 0; // silent until the first position update
  const panner = createSpatialPanner(ctx);

  source.connect(analyser);
  source.connect(filter);
  filter.connect(gain);
  gain.connect(panner);
  panner.connect(ctx.destination);

  const data = new Uint8Array(analyser.fftSize);

  function getLevel() {
    analyser.getByteTimeDomainData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i += 1) {
      const n = (data[i] - 128) / 128;
      sum += n * n;
    }
    return Math.sqrt(sum / data.length);
  }

  function update({ volume, offsetX, offsetY, occluded }) {
    const t = ctx.currentTime;
    gain.gain.setTargetAtTime(occluded ? volume * OCCLUDED_GAIN : volume, t, SMOOTH);
    filter.frequency.setTargetAtTime(occluded ? OCCLUDED_FREQ : OPEN_FREQ, t, SMOOTH);
    setPannerPosition(panner, offsetX, offsetY);
  }

  function dispose() {
    [source, analyser, filter, gain, panner].forEach((node) => node.disconnect());
    el.pause();
    el.srcObject = null;
  }

  return { update, getLevel, dispose };
}