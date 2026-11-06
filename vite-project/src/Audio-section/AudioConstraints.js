/**
 * AudioConstraints
 * 
 * Hardware Microphone Constraints & Device Selector Utilities
 * 
 * Configures browser-level Digital Signal Processing (DSP) for clear proximity voice:
 * - Echo cancellation to avoid feedback loops
 * - Dynamic noise suppression for office ambient noise
 * - Auto gain control for consistent speech volume
 */

export const OPTIMAL_AUDIO_CONSTRAINTS = {
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    channelCount: 1, // Mono stream for spatial panner
    sampleRate: 48000,
    sampleSize: 16,
  },
  video: false,
};

/**
 * Enumerates all connected audio input hardware devices (microphones)
 * @returns {Promise<Array<{ deviceId: string, label: string }>>}
 */
export async function getAudioInputDevices() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
    console.warn('[AudioConstraints] enumerateDevices is not supported in this browser');
    return [];
  }

  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices
      .filter((d) => d.kind === 'audioinput')
      .map((d, index) => ({
        deviceId: d.deviceId,
        label: d.label || `Microphone ${index + 1}`,
        groupId: d.groupId,
      }));
  } catch (err) {
    console.error('[AudioConstraints] Failed to enumerate audio devices:', err);
    return [];
  }
}

/**
 * Creates audio constraints with a specifically selected microphone device
 * @param {string} deviceId
 */
export function createDeviceConstraints(deviceId) {
  return {
    audio: {
      ...OPTIMAL_AUDIO_CONSTRAINTS.audio,
      deviceId: deviceId ? { exact: deviceId } : undefined,
    },
    video: false,
  };
}
