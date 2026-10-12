import { useEffect, useMemo, useRef, useState } from 'react';
import { getAudioContext, resumeAudioContext } from '../AudioContext';
import { useSpatialAudio } from '../UseSpatialAudio';
import { distanceBetween, volumeForDistance, EARSHOT_RADIUS } from '../mixer/distanceVolume';
import { hasLineOfSight } from '../mixer/occlusion';

const W = 400;
const H = 300;
const ME = { x: 200, y: 150 };
const WALL = { x: 270, y: 70, w: 16, h: 160 };

// A beeping tone that stands in for another player's voice.
function createFakePeer(ctx) {
  const dest = ctx.createMediaStreamDestination();
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.value = 180;
  const amp = ctx.createGain();
  amp.gain.value = 0.15;
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 2;
  const lfoDepth = ctx.createGain();
  lfoDepth.gain.value = 0.12;
  lfo.connect(lfoDepth);
  lfoDepth.connect(amp.gain);
  osc.connect(amp);
  amp.connect(dest);
  osc.start();
  lfo.start();
  return {
    stream: dest.stream,
    stop() {
      osc.stop();
      lfo.stop();
    },
  };
}

export default function SpatialAudioDemo() {
  const [fake, setFake] = useState(null);
  const fakeRef = useRef(null);
  const [peerPos, setPeerPos] = useState({ x: 300, y: 150 });
  const [wallOn, setWallOn] = useState(false);
  const areaRef = useRef(null);

  const remoteStreams = useMemo(() => (fake ? { fake: fake.stream } : {}), [fake]);
  const peerPositions = useMemo(() => ({ fake: peerPos }), [peerPos]);
  const walls = useMemo(() => (wallOn ? [WALL] : []), [wallOn]);
  const { speakingIds } = useSpatialAudio({ remoteStreams, myPosition: ME, peerPositions, walls });

  useEffect(() => () => fakeRef.current?.stop(), []);

  async function start() {
    await resumeAudioContext();
    const peer = createFakePeer(getAudioContext());
    fakeRef.current = peer;
    setFake(peer);
  }

  function stop() {
    fakeRef.current?.stop();
    fakeRef.current = null;
    setFake(null);
  }

  function movePeer(e) {
    if (e.type === 'pointermove' && e.buttons !== 1) return;
    const r = areaRef.current.getBoundingClientRect();
    setPeerPos({
      x: Math.max(0, Math.min(W, e.clientX - r.left)),
      y: Math.max(0, Math.min(H, e.clientY - r.top)),
    });
  }

  const distance = distanceBetween(ME, peerPos);
  const volume = volumeForDistance(distance);
  const occluded = wallOn && !hasLineOfSight(ME, peerPos, [WALL]);

  return (
    <div className="flex flex-col items-center gap-4 p-6 text-white">
      <p className="text-sm text-slate-300">
        Put on headphones. Click or drag inside the box to move the other player (orange dot).
      </p>

      <div
        ref={areaRef}
        onPointerDown={movePeer}
        onPointerMove={movePeer}
        className="relative touch-none select-none overflow-hidden rounded-lg bg-slate-900"
        style={{ width: W, height: H }}
      >
        <div
          className="absolute rounded-full border border-dashed border-sky-400"
          style={{
            width: EARSHOT_RADIUS * 2,
            height: EARSHOT_RADIUS * 2,
            left: ME.x - EARSHOT_RADIUS,
            top: ME.y - EARSHOT_RADIUS,
          }}
        />
        {wallOn && (
          <div
            className="absolute bg-slate-500"
            style={{ left: WALL.x, top: WALL.y, width: WALL.w, height: WALL.h }}
          />
        )}
        <div className="absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-400" style={{ left: ME.x, top: ME.y }} />
        <div
          className={`absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-orange-400 ${
            speakingIds.includes('fake') ? 'ring-4 ring-orange-200' : ''
          }`}
          style={{ left: peerPos.x, top: peerPos.y }}
        />
      </div>

      <div className="text-sm text-slate-200">
        <p>Distance: {Math.round(distance)} px</p>
        <p>Volume: {Math.round(volume * 100)}%{occluded ? ' (muffled by wall)' : ''}</p>
        <p>Speaking: {speakingIds.includes('fake') ? 'yes' : 'no'}</p>
      </div>

      <div className="flex gap-3">
        {fake ? (
          <button type="button" onClick={stop} className="rounded-full bg-red-500 px-4 py-2 text-sm font-medium">
            Stop test sound
          </button>
        ) : (
          <button type="button" onClick={start} className="rounded-full bg-emerald-500 px-4 py-2 text-sm font-medium text-slate-900">
            Start test sound
          </button>
        )}
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={wallOn} onChange={(e) => setWallOn(e.target.checked)} />
          Wall
        </label>
      </div>
    </div>
  );
}