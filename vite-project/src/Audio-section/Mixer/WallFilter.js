/**
 * WallFilter
 * 
 * Physics-Aware Acoustic Low-Pass Filter (Web Audio BiquadFilterNode)
 * 
 * Simulates high-frequency acoustic muffling when speech travels through
 * glass meeting room dividers, drywall partitions, or acoustic baffles.
 */

export const ACOUSTIC_MATERIAL_PRESETS = {
  glass: {
    cutoffHz: 1800,
    dampening: 0.35,
    qFactor: 0.707,
    name: 'Tempered Glass Divider',
  },
  drywall: {
    cutoffHz: 800,
    dampening: 0.65,
    qFactor: 1.0,
    name: 'Interior Drywall Partition',
  },
  acoustic_foam: {
    cutoffHz: 1200,
    dampening: 0.45,
    qFactor: 0.8,
    name: 'Acoustic Privacy Foam',
  },
  concrete: {
    cutoffHz: 400,
    dampening: 0.85,
    qFactor: 1.2,
    name: 'Concrete Support Column',
  },
};

/**
 * Creates a configured BiquadFilterNode for wall occlusion muffling
 * @param {AudioContext} ctx
 * @param {string} material - Material key from ACOUSTIC_MATERIAL_PRESETS
 * @returns {BiquadFilterNode}
 */
export function createWallFilter(ctx, material = 'drywall') {
  const preset = ACOUSTIC_MATERIAL_PRESETS[material] || ACOUSTIC_MATERIAL_PRESETS.drywall;
  const filter = ctx.createBiquadFilter();

  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(preset.cutoffHz, ctx.currentTime);
  filter.Q.setValueAtTime(preset.qFactor, ctx.currentTime);

  return filter;
}

/**
 * Updates filter frequency smoothly with audio ramp
 * @param {BiquadFilterNode} filter
 * @param {number} cutoffFrequencyHz
 * @param {number} rampTimeSeconds
 */
export function setFilterFrequency(filter, cutoffFrequencyHz, rampTimeSeconds = 0.05) {
  if (!filter || !filter.frequency) return;
  const clamped = Math.max(200, Math.min(20000, cutoffFrequencyHz));
  const ctx = filter.context;
  filter.frequency.linearRampToValueAtTime(clamped, ctx.currentTime + rampTimeSeconds);
}
