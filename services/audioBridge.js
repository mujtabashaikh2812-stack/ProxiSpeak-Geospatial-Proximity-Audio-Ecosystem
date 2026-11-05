'use strict';

const { calculateDistance } = require('./spatialEngine');
const { detectZone, evaluateAcousticRelation } = require('./zoneManager');
const { defaultOcclusionEngine } = require('./occlusionEngine');

/**
 * AudioBridge
 * 
 * Multi-Room Audio Bridge & Priority Stage Broadcast Coordinator
 * 
 * Computes exact Web Audio API routing parameters for client-side rendering:
 * 1. Stereo Panning (-1.0 to +1.0) for StereoPannerNode / PannerNode
 * 2. Distance-based inverse-square gain curve for GainNode
 * 3. Town Hall Stage Podium VIP broadcast override (global unattenuated center mix)
 * 4. Soundproof meeting room isolation (Conference Room Alpha & Quiet Lounge)
 * 5. Raycast wall occlusion low-pass filter cutoff (BiquadFilterNode)
 * 6. Voice Activity Detection (VAD) & mute state gating to conserve Web Audio cycles
 */

const DEFAULT_EARSHOT = 100;

class AudioBridge {
  constructor(options = {}) {
    this.earshotRadius = options.earshotRadius || DEFAULT_EARSHOT;
    this.userAudioStates = new Map(); // userId -> { isMuted, isSpeaking, volumeBoost }
    this.metrics = {
      totalMatrixComputations: 0,
      activeStageBroadcasts: 0,
      activeRoomMixes: 0,
      gatedSilentStreams: 0,
    };
  }

  /**
   * Updates user audio input state (mute / speaking telemetry)
   * @param {string} userId - User identifier
   * @param {object} state - { isMuted: boolean, isSpeaking: boolean, volumeBoost: number }
   */
  setUserAudioState(userId, state = {}) {
    const existing = this.userAudioStates.get(String(userId)) || {
      isMuted: false,
      isSpeaking: true,
      volumeBoost: 1.0,
    };

    const updated = {
      ...existing,
      ...state,
      userId: String(userId),
      updatedAt: new Date(),
    };

    this.userAudioStates.set(String(userId), updated);
    return updated;
  }

  /**
   * Retrieves audio state for a user
   */
  getUserAudioState(userId) {
    return (
      this.userAudioStates.get(String(userId)) || {
        userId: String(userId),
        isMuted: false,
        isSpeaking: true,
        volumeBoost: 1.0,
      }
    );
  }

  /**
   * Cleans up audio state upon avatar disconnect
   */
  cleanupUser(userId) {
    return this.userAudioStates.delete(String(userId));
  }

  /**
   * Computes stereo spatial panning (-1.0 to +1.0)
   * -1.0 = 100% Left ear, 0.0 = Dead Center, +1.0 = 100% Right ear
   * @param {number} listenerX - Listener avatar X
   * @param {number} listenerY - Listener avatar Y
   * @param {number} speakerX - Speaker avatar X
   * @param {number} speakerY - Speaker avatar Y
   * @returns {number} Pan value rounded to 3 decimal places
   */
  computeStereoPan(listenerX, listenerY, speakerX, speakerY) {
    const dx = speakerX - listenerX;
    const dy = speakerY - listenerY;
    const distance = Math.hypot(dx, dy);

    if (distance < 1e-4) return 0.0; // Same position -> centered

    // Normalised horizontal projection
    const pan = dx / distance;
    return Math.round(Math.max(-1.0, Math.min(1.0, pan)) * 1000) / 1000;
  }

  /**
   * Computes inverse-square distance gain attenuation
   * Gain curve: Gain = (1 - distance / earshot)^2
   * @param {number} distance - Euclidean distance in pixels
   * @param {number} maxRadius - Earshot radius
   * @returns {number} Gain multiplier (0.0 to 1.0)
   */
  computeDistanceGain(distance, maxRadius = this.earshotRadius) {
    if (distance >= maxRadius) return 0.0;
    if (distance <= 10) return 1.0; // Near-field full volume

    const normalised = 1 - distance / maxRadius;
    const curvedGain = Math.pow(normalised, 1.6); // Natural psychoacoustic curve
    return Math.round(Math.max(0.05, Math.min(1.0, curvedGain)) * 1000) / 1000;
  }

  /**
   * Computes full audio routing parameters between listener and speaker
   * @param {object} listener - { userId, canvasX, canvasY }
   * @param {object} speaker - { userId, canvasX, canvasY, displayName }
   * @returns {object} Audio node configuration { gain, pan, cutoffFrequencyHz, streamType, canHear }
   */
  evaluatePairAudio(listener, speaker) {
    this.metrics.totalMatrixComputations++;

    const speakerState = this.getUserAudioState(speaker.userId);

    // 1. Check Voice Activity / Mute Gating
    if (speakerState.isMuted) {
      this.metrics.gatedSilentStreams++;
      return {
        speakerId: speaker.userId,
        displayName: speaker.displayName || speaker.userId,
        gain: 0.0,
        pan: 0.0,
        cutoffFrequencyHz: 20000,
        streamType: 'muted',
        canHear: false,
        reason: 'Speaker is muted',
        isGated: true,
      };
    }

    const lx = Number(listener.canvasX) || 0;
    const ly = Number(listener.canvasY) || 0;
    const sx = Number(speaker.canvasX) || 0;
    const sy = Number(speaker.canvasY) || 0;

    const distance = Math.round(calculateDistance(lx, ly, sx, sy) * 10) / 10;
    const pan = this.computeStereoPan(lx, ly, sx, sy);

    const zoneL = detectZone(lx, ly);
    const zoneS = detectZone(sx, sy);

    // 2. Town Hall Stage Podium Priority Broadcast
    if (zoneS.id === 'podium' || zoneS.isSpotlightBroadcast) {
      this.metrics.activeStageBroadcasts++;
      return {
        speakerId: speaker.userId,
        displayName: speaker.displayName || speaker.userId,
        distance,
        gain: 1.0, // Full broadcast volume
        pan: 0.0,  // Centered stage channel
        cutoffFrequencyHz: 20000,
        streamType: 'stage_broadcast',
        canHear: true,
        reason: 'VIP Town Hall Stage broadcast overrides proximity',
        isGated: false,
      };
    }

    // 3. Shared Enclosed Meeting Room (Conference Alpha, Quiet Lounge)
    const isSameEnclosedRoom =
      zoneL.id === zoneS.id &&
      (zoneL.id === 'conf-a' || zoneL.isSoundproof || zoneL.type === 'enclosed_room');

    if (isSameEnclosedRoom) {
      this.metrics.activeRoomMixes++;
      return {
        speakerId: speaker.userId,
        displayName: speaker.displayName || speaker.userId,
        distance,
        gain: 0.95,
        pan: pan * 0.5, // Subtle conference table panning
        cutoffFrequencyHz: 20000,
        streamType: 'room_mix',
        room: zoneL.name,
        canHear: true,
        reason: `Shared enclosed room (${zoneL.name})`,
        isGated: false,
      };
    }

    // 4. Acoustic Wall Soundproofing Isolation
    const listenerInRoom = zoneL.id === 'conf-a' || zoneL.isSoundproof || zoneL.type === 'enclosed_room';
    const speakerInRoom = zoneS.id === 'conf-a' || zoneS.isSoundproof || zoneS.type === 'enclosed_room';

    if ((listenerInRoom && !speakerInRoom) || (!listenerInRoom && speakerInRoom) || (listenerInRoom && speakerInRoom && zoneL.id !== zoneS.id)) {
      return {
        speakerId: speaker.userId,
        displayName: speaker.displayName || speaker.userId,
        distance,
        gain: 0.0,
        pan: 0.0,
        cutoffFrequencyHz: 20000,
        streamType: 'blocked',
        canHear: false,
        reason: 'Acoustic walls block sound transmission',
        isGated: true,
      };
    }

    // 5. Open Space Proximity with Raycasting Wall Occlusion
    if (distance > this.earshotRadius) {
      return {
        speakerId: speaker.userId,
        displayName: speaker.displayName || speaker.userId,
        distance,
        gain: 0.0,
        pan: 0.0,
        cutoffFrequencyHz: 20000,
        streamType: 'out_of_range',
        canHear: false,
        reason: 'Beyond 100px earshot radius',
        isGated: true,
      };
    }

    const baseGain = this.computeDistanceGain(distance, this.earshotRadius);

    // Cast acoustic ray across obstacles
    const ray = defaultOcclusionEngine.castSoundRay(sx, sy, lx, ly);

    if (ray.isOccluded) {
      const occludedGain = Math.round(baseGain * ray.transmissionMultiplier * 1000) / 1000;
      return {
        speakerId: speaker.userId,
        displayName: speaker.displayName || speaker.userId,
        distance,
        gain: occludedGain,
        pan,
        cutoffFrequencyHz: ray.cutoffFrequencyHz,
        occlusionFactor: ray.occlusionFactor,
        streamType: 'occluded',
        canHear: occludedGain > 0.01,
        reason: `Acoustic occlusion via ${ray.intersectedObstacles.map((o) => o.name).join(', ')}`,
        isGated: false,
      };
    }

    return {
      speakerId: speaker.userId,
      displayName: speaker.displayName || speaker.userId,
      distance,
      gain: baseGain,
      pan,
      cutoffFrequencyHz: 20000,
      streamType: 'proximity',
      canHear: true,
      reason: 'Clear line-of-sight proximity audio',
      isGated: false,
    };
  }

  /**
   * Computes the complete multi-peer audio routing matrix for a listener
   * @param {object} listener - Listener user object
   * @param {Array<object>} allPeers - All other connected peers
   * @returns {object} Routing matrix report
   */
  computeAudioMatrix(listener, allPeers = []) {
    const audibleStreams = [];
    const blockedStreams = [];

    for (const peer of allPeers) {
      if (peer.userId === listener.userId) continue;

      const routing = this.evaluatePairAudio(listener, peer);
      if (routing.canHear) {
        audibleStreams.push(routing);
      } else {
        blockedStreams.push(routing);
      }
    }

    return {
      listenerId: listener.userId,
      listenerPosition: { x: listener.canvasX, y: listener.canvasY },
      totalPeersEvaluated: allPeers.length - 1,
      audibleCount: audibleStreams.length,
      blockedCount: blockedStreams.length,
      audibleStreams,
      blockedStreams,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * System-wide diagnostic telemetry
   */
  getDiagnostics() {
    return {
      service: 'Multi-Room Audio Bridge & Priority Stage Broadcast Coordinator',
      status: 'operational',
      earshotRadiusPixels: this.earshotRadius,
      trackedAudioStatesCount: this.userAudioStates.size,
      metrics: {
        totalMatrixComputations: this.metrics.totalMatrixComputations,
        activeStageBroadcasts: this.metrics.activeStageBroadcasts,
        activeRoomMixes: this.metrics.activeRoomMixes,
        gatedSilentStreams: this.metrics.gatedSilentStreams,
      },
    };
  }

  reset() {
    this.userAudioStates.clear();
    this.metrics = {
      totalMatrixComputations: 0,
      activeStageBroadcasts: 0,
      activeRoomMixes: 0,
      gatedSilentStreams: 0,
    };
  }
}

// Singleton default instance
const defaultAudioBridge = new AudioBridge();

module.exports = {
  AudioBridge,
  defaultAudioBridge,
};
