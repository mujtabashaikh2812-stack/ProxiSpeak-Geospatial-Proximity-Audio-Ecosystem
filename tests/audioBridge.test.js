'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  AudioBridge,
  defaultAudioBridge,
} = require('../services/audioBridge');

test('computeStereoPan: accurately projects 2D avatar angles into stereo pan values', () => {
  const bridge = new AudioBridge();

  // Speaker directly to the right (dx = 50, dy = 0) -> +1.0
  const panRight = bridge.computeStereoPan(100, 100, 150, 100);
  assert.equal(panRight, 1.0);

  // Speaker directly to the left (dx = -50, dy = 0) -> -1.0
  const panLeft = bridge.computeStereoPan(100, 100, 50, 100);
  assert.equal(panLeft, -1.0);

  // Speaker directly above (dx = 0, dy = -50) -> 0.0 (centered)
  const panAbove = bridge.computeStereoPan(100, 100, 100, 50);
  assert.equal(panAbove, 0.0);

  // Speaker at 45 degree angle (dx = 30, dy = 30) -> 30 / sqrt(1800) ~ 0.707
  const panDiag = bridge.computeStereoPan(100, 100, 130, 130);
  assert.equal(panDiag > 0.7 && panDiag < 0.71, true);

  // Speaker at identical position -> 0.0
  const panCoincident = bridge.computeStereoPan(100, 100, 100, 100);
  assert.equal(panCoincident, 0.0);
});

test('computeDistanceGain: computes natural psychoacoustic inverse distance curve', () => {
  const bridge = new AudioBridge({ earshotRadius: 100 });

  // Near field (<= 10px) -> full gain
  assert.equal(bridge.computeDistanceGain(5), 1.0);
  assert.equal(bridge.computeDistanceGain(10), 1.0);

  // Mid distance (50px / 100px) -> attenuation
  const midGain = bridge.computeDistanceGain(50);
  assert.equal(midGain > 0.25 && midGain < 0.45, true);

  // Boundary (100px) -> 0.0
  assert.equal(bridge.computeDistanceGain(100), 0.0);
  assert.equal(bridge.computeDistanceGain(150), 0.0);
});

test('evaluatePairAudio: VIP Town Hall Stage speaker broadcasts to entire office', () => {
  const bridge = new AudioBridge();

  const listenerFarAway = { userId: 'listener-far', canvasX: 950, canvasY: 650 };
  const stageSpeaker = { userId: 'ceo-speaker', displayName: 'CEO Jane', canvasX: 570, canvasY: 110 }; // On podium

  const audio = bridge.evaluatePairAudio(listenerFarAway, stageSpeaker);

  assert.equal(audio.canHear, true);
  assert.equal(audio.streamType, 'stage_broadcast');
  assert.equal(audio.gain, 1.0);
  assert.equal(audio.pan, 0.0); // Center mix
  assert.equal(audio.cutoffFrequencyHz, 20000);
});

test('evaluatePairAudio: peers sharing Conference Room Alpha receive clear room mix', () => {
  const bridge = new AudioBridge();

  const peer1 = { userId: 'dev-1', displayName: 'Dev One', canvasX: 120, canvasY: 120 }; // In conf-a
  const peer2 = { userId: 'dev-2', displayName: 'Dev Two', canvasX: 200, canvasY: 150 }; // In conf-a

  const audio = bridge.evaluatePairAudio(peer1, peer2);

  assert.equal(audio.canHear, true);
  assert.equal(audio.streamType, 'room_mix');
  assert.equal(audio.gain, 0.95);
  assert.equal(audio.cutoffFrequencyHz, 20000);
});

test('evaluatePairAudio: soundproof meeting room blocks sound to outside avatars', () => {
  const bridge = new AudioBridge();

  const insideMeeting = { userId: 'insider', canvasX: 120, canvasY: 120 }; // In conf-a
  const outsideHallway = { userId: 'outsider', canvasX: 380, canvasY: 120 }; // Outside

  const audio = bridge.evaluatePairAudio(outsideHallway, insideMeeting);

  assert.equal(audio.canHear, false);
  assert.equal(audio.gain, 0.0);
  assert.equal(audio.streamType, 'blocked');
});

test('evaluatePairAudio: open office avatars separated by wall receive occluded audio', () => {
  const bridge = new AudioBridge();

  // Drywall baffle is at x = 200, between y = 300 and 380 in open workspace
  const speaker = { userId: 'spk', displayName: 'Spk', canvasX: 180, canvasY: 340 };
  const listener = { userId: 'lst', displayName: 'Lst', canvasX: 220, canvasY: 340 };

  const audio = bridge.evaluatePairAudio(listener, speaker);

  assert.equal(audio.canHear, true);
  assert.equal(audio.streamType, 'occluded');
  assert.equal(audio.cutoffFrequencyHz <= 800, true);
  assert.equal(audio.gain < 1.0, true);
});

test('evaluatePairAudio: muted speaker is gated with zero gain to save audio mixing cycles', () => {
  const bridge = new AudioBridge();

  bridge.setUserAudioState('muted-user', { isMuted: true, isSpeaking: false });

  const listener = { userId: 'lst', canvasX: 400, canvasY: 400 };
  const speaker = { userId: 'muted-user', displayName: 'Quiet Peer', canvasX: 420, canvasY: 400 };

  const audio = bridge.evaluatePairAudio(listener, speaker);

  assert.equal(audio.canHear, false);
  assert.equal(audio.gain, 0.0);
  assert.equal(audio.streamType, 'muted');
  assert.equal(audio.isGated, true);
});

test('computeAudioMatrix: generates full routing report for all connected peers', () => {
  const bridge = new AudioBridge();

  const listener = { userId: 'main-listener', canvasX: 420, canvasY: 360 };
  const peers = [
    listener,
    { userId: 'close-peer', displayName: 'Close Peer', canvasX: 440, canvasY: 360 }, // 20px -> audible
    { userId: 'stage-speaker', displayName: 'Podium Speaker', canvasX: 570, canvasY: 110 }, // Stage -> audible
    { userId: 'far-peer', displayName: 'Far Peer', canvasX: 900, canvasY: 700 }, // Out of range -> blocked
  ];

  const matrix = bridge.computeAudioMatrix(listener, peers);

  assert.equal(matrix.listenerId, 'main-listener');
  assert.equal(matrix.totalPeersEvaluated, 3);
  assert.equal(matrix.audibleCount >= 2, true);
  assert.equal(matrix.blockedCount >= 1, true);

  const diag = bridge.getDiagnostics();
  assert.equal(diag.status, 'operational');
  assert.equal(diag.metrics.totalMatrixComputations >= 3, true);
});
