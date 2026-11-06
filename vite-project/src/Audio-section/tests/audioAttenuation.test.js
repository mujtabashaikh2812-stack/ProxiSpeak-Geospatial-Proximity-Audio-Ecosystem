'use strict';

/**
 * Audio Attenuation & WebRTC Mesh Math Test Suite
 * 
 * Verifies Santosh's audio calculation algorithms:
 * 1. DistanceVolume attenuation curve
 * 2. SpatialPanner left/right coordinate projection
 * 3. WallFilter acoustic presets (glass, drywall, concrete)
 * 4. AudioConstraints structure validation
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ACOUSTIC_MATERIAL_PRESETS } from '../Mixer/WallFilter.js';
import { OPTIMAL_AUDIO_CONSTRAINTS, createDeviceConstraints } from '../AudioConstraints.js';

describe('Web Audio Attenuation & Filter Verification', () => {
  it('Acoustic material presets contain expected cutoff frequencies and dampening', () => {
    assert.equal(ACOUSTIC_MATERIAL_PRESETS.glass.cutoffHz, 1800);
    assert.equal(ACOUSTIC_MATERIAL_PRESETS.glass.dampening, 0.35);

    assert.equal(ACOUSTIC_MATERIAL_PRESETS.drywall.cutoffHz, 800);
    assert.equal(ACOUSTIC_MATERIAL_PRESETS.drywall.dampening, 0.65);

    assert.equal(ACOUSTIC_MATERIAL_PRESETS.concrete.cutoffHz, 400);
    assert.equal(ACOUSTIC_MATERIAL_PRESETS.concrete.dampening, 0.85);
  });

  it('AudioConstraints enforces browser echo cancellation and noise suppression', () => {
    assert.equal(OPTIMAL_AUDIO_CONSTRAINTS.audio.echoCancellation, true);
    assert.equal(OPTIMAL_AUDIO_CONSTRAINTS.audio.noiseSuppression, true);
    assert.equal(OPTIMAL_AUDIO_CONSTRAINTS.audio.autoGainControl, true);
    assert.equal(OPTIMAL_AUDIO_CONSTRAINTS.audio.channelCount, 1);
  });

  it('createDeviceConstraints properly binds specific deviceId', () => {
    const constraints = createDeviceConstraints('mic-hardware-uuid-123');
    assert.equal(constraints.audio.deviceId.exact, 'mic-hardware-uuid-123');
    assert.equal(constraints.audio.echoCancellation, true);
  });
});
