'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  AudioBenchmarkHarness,
  defaultAudioBenchmark,
  BENCHMARK_THRESHOLDS,
} = require('../services/audioBenchmark');

test('simulateGainRamp: smooths gain transitions exponentially towards target', () => {
  const harness = new AudioBenchmarkHarness();

  // Smoothing from 1.0 down to 0.2 with tau = 15ms
  const at0ms = harness.simulateGainRamp(1.0, 0.2, 0, 15);
  const at15ms = harness.simulateGainRamp(1.0, 0.2, 15, 15);
  const at60ms = harness.simulateGainRamp(1.0, 0.2, 60, 15);

  assert.equal(at0ms, 1.0, 'At 0ms, gain should be start value');
  assert.equal(at15ms < 1.0 && at15ms > 0.2, true, 'At 15ms, gain should intermediate');
  assert.equal(Math.abs(at60ms - 0.2) < 0.02, true, 'At 4*tau, should be ~98% converged to target');
});

test('computeEqualPowerGains: strictly conserves acoustic energy across stereo field', () => {
  const harness = new AudioBenchmarkHarness();

  const pans = [-1.0, -0.75, -0.5, 0.0, 0.5, 0.75, 1.0];

  pans.forEach((p) => {
    const { left, right, totalEnergy } = harness.computeEqualPowerGains(p);

    assert.equal(typeof left, 'number');
    assert.equal(typeof right, 'number');
    assert.equal(
      Math.abs(totalEnergy - 1.0) <= BENCHMARK_THRESHOLDS.ENERGY_CONSERVATION_TOLERANCE,
      true,
      `Energy at pan ${p} should be conserved (~1.0), got ${totalEnergy}`
    );
  });

  // Check extremes
  const hardLeft = harness.computeEqualPowerGains(-1.0);
  assert.equal(hardLeft.left >= 0.99, true);
  assert.equal(hardLeft.right <= 0.01, true);

  const hardRight = harness.computeEqualPowerGains(1.0);
  assert.equal(hardRight.left <= 0.01, true);
  assert.equal(hardRight.right >= 0.99, true);
});

test('benchmarkGainCurves: validates monotonic distance decay and ramp points', () => {
  const harness = new AudioBenchmarkHarness();
  const audit = harness.benchmarkGainCurves({ steps: 50, earshot: 100 });

  assert.equal(audit.status, 'PASS');
  assert.equal(audit.isMonotonic, true);
  assert.equal(audit.nearFieldGain, 1.0);
  assert.equal(audit.farFieldGain <= 0.05, true);
  assert.equal(audit.samplePoints, 51);
});

test('benchmarkStereoPanning: performs 360-degree radial sweep and verifies conservation', () => {
  const harness = new AudioBenchmarkHarness();
  const audit = harness.benchmarkStereoPanning({ samples: 36 });

  assert.equal(audit.status, 'PASS');
  assert.equal(audit.energyConserved, true);
  assert.equal(audit.maxEnergyDeviation <= 0.05, true);
  assert.equal(audit.samplesEvaluated, 37);
});

test('benchmarkOcclusionFilters: verifies material transmission dB and cutoff frequencies', () => {
  const harness = new AudioBenchmarkHarness();
  const audit = harness.benchmarkOcclusionFilters();

  assert.equal(audit.status, 'PASS');
  assert.equal(audit.filterTiersCount, 5);

  const glass = audit.materials.find((m) => m.material === 'glass');
  assert.equal(glass.lossDb, -6);
  assert.equal(glass.cutoffHz, 8500);

  const concrete = audit.materials.find((m) => m.material === 'concrete');
  assert.equal(concrete.lossDb, -30);
  assert.equal(concrete.cutoffHz, 800);
});

test('benchmarkThroughput: verifies high-frequency multi-peer audio DSP routing throughput', () => {
  const harness = new AudioBenchmarkHarness();
  const audit = harness.benchmarkThroughput({ numAvatars: 15, iterations: 10 });

  assert.equal(audit.status, 'PASS');
  assert.equal(audit.totalPairsComputed, 15 * 14 * 10);
  assert.equal(typeof audit.opsPerSec, 'number');
  assert.equal(audit.opsPerSec >= 20000, true);
  assert.equal(audit.concurrencyCapacity.is60FpsCompliant, true);
});

test('runFullSuite: compiles executive health scorecard and records history', () => {
  const harness = new AudioBenchmarkHarness({ historyLimit: 5 });
  const scorecard = harness.runFullSuite({ numAvatars: 10, iterations: 5 });

  assert.equal(scorecard.overallStatus, 'HEALTHY');
  assert.equal(['OPTIMAL', 'EXCELLENT', 'ACCEPTABLE'].includes(scorecard.overallRating), true);
  assert.equal(typeof scorecard.metrics.opsPerSec, 'number');
  assert.equal(typeof scorecard.headroomSummary, 'string');
  assert.equal(scorecard.headroomSummary.includes('audio pairs/frame'), true);

  const history = harness.getHistory();
  assert.equal(history.length, 1);
  assert.equal(history[0].benchmarkId, scorecard.benchmarkId);
});

test('historyLimit: caps historical execution records at configured limit', () => {
  const harness = new AudioBenchmarkHarness({ historyLimit: 3 });

  for (let i = 0; i < 6; i++) {
    harness.runFullSuite({ numAvatars: 6, iterations: 2 });
  }

  const history = harness.getHistory();
  assert.equal(history.length, 3);
});

test('defaultAudioBenchmark singleton is operational', () => {
  const latest = defaultAudioBenchmark.getLatestBenchmark();
  assert.equal(latest.overallStatus, 'HEALTHY');
});
