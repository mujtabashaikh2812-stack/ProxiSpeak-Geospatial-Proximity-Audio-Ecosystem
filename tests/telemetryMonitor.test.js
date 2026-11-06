'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  TelemetryMonitor,
  defaultTelemetryMonitor,
  QUALITY_THRESHOLDS,
} = require('../services/telemetryMonitor');

test('recordPing: accurately computes RTT from client sent timestamp', () => {
  const monitor = new TelemetryMonitor();
  const sentTime = Date.now() - 25; // 25ms ago

  const result = monitor.recordPing('peer-1', sentTime);

  assert.equal(result.userId, 'peer-1');
  assert.equal(result.rttMs >= 20 && result.rttMs <= 40, true);
  assert.equal(result.quality, 'EXCELLENT');
  assert.equal(result.recommendedBitrateKbps, 64);
});

test('bufferSize: caps rolling RTT samples at buffer limit', () => {
  const monitor = new TelemetryMonitor({ bufferSize: 5 });

  for (let i = 1; i <= 10; i++) {
    monitor.recordPing('peer-buffer', Date.now() - i * 10);
  }

  const analysis = monitor.analyzePeerHealth('peer-buffer');
  assert.equal(analysis.sampleCount, 5);
});

test('analyzePeerHealth: computes accurate statistical jitter between successive pings', () => {
  const monitor = new TelemetryMonitor();
  const now = Date.now();

  // Feed synthetic RTTs: 20ms, 40ms, 30ms -> deltas: |40-20|=20, |30-40|=10 -> avg delta = 15ms
  monitor.recordPing('peer-jitter', now - 20);
  monitor.recordPing('peer-jitter', now - 40);
  monitor.recordPing('peer-jitter', now - 30);

  const health = monitor.analyzePeerHealth('peer-jitter');
  assert.equal(health.jitterMs, 15);
  assert.equal(health.minRttMs >= 20, true);
  assert.equal(health.maxRttMs >= 40, true);
});

test('analyzePeerHealth: classifies connection quality tiers and recommends adaptive bitrates', () => {
  const monitor = new TelemetryMonitor();
  const now = Date.now();

  // 1. Excellent (low latency 20ms)
  monitor.recordPing('p-excellent', now - 20);
  monitor.recordPing('p-excellent', now - 20);
  assert.equal(monitor.analyzePeerHealth('p-excellent').quality, 'EXCELLENT');
  assert.equal(monitor.analyzePeerHealth('p-excellent').recommendedBitrateKbps, 64);

  // 2. Good (mid latency 60ms)
  monitor.recordPing('p-good', now - 60);
  monitor.recordPing('p-good', now - 60);
  assert.equal(monitor.analyzePeerHealth('p-good').quality, 'GOOD');
  assert.equal(monitor.analyzePeerHealth('p-good').recommendedBitrateKbps, 48);

  // 3. Fair (higher latency 120ms)
  monitor.recordPing('p-fair', now - 120);
  monitor.recordPing('p-fair', now - 120);
  assert.equal(monitor.analyzePeerHealth('p-fair').quality, 'FAIR');
  assert.equal(monitor.analyzePeerHealth('p-fair').recommendedBitrateKbps, 32);

  // 4. Degraded (very high latency 250ms)
  monitor.recordPing('p-degraded', now - 250);
  monitor.recordPing('p-degraded', now - 250);
  assert.equal(monitor.analyzePeerHealth('p-degraded').quality, 'DEGRADED');
  assert.equal(monitor.analyzePeerHealth('p-degraded').recommendedBitrateKbps, 16);
});

test('recordPacketReport: calculates packet loss percentages accurately', () => {
  const monitor = new TelemetryMonitor();
  monitor.recordPing('p-loss', Date.now() - 30);

  // 100 packets sent, 5 packets lost -> 5% packet loss
  const health = monitor.recordPacketReport('p-loss', {
    packetsSent: 100,
    packetsLost: 5,
    bytesSent: 32000,
  });

  assert.equal(health.packetLossPct, 5);
  // 5% loss puts it into FAIR tier even if RTT is low
  assert.equal(health.quality, 'FAIR');
});

test('getSystemMetrics: aggregates network metrics across all active peers', () => {
  const monitor = new TelemetryMonitor();
  const now = Date.now();

  monitor.recordPing('user-a', now - 25);
  monitor.recordPing('user-b', now - 75);

  const sys = monitor.getSystemMetrics();

  assert.equal(sys.status, 'operational');
  assert.equal(sys.trackedPeersCount, 2);
  assert.equal(typeof sys.networkAverageRttMs, 'number');
  assert.equal(sys.qualityDistribution.EXCELLENT >= 1, true);
  assert.equal(sys.qualityDistribution.GOOD >= 1, true);
  assert.equal(sys.metrics.totalPingsProcessed, 2);
});

test('cleanupUser: removes peer telemetry on avatar departure', () => {
  const monitor = new TelemetryMonitor();
  monitor.recordPing('departing-user', Date.now() - 30);

  assert.equal(monitor.getSystemMetrics().trackedPeersCount, 1);
  const cleaned = monitor.cleanupUser('departing-user');
  assert.equal(cleaned, true);
  assert.equal(monitor.getSystemMetrics().trackedPeersCount, 0);
});

test('defaultTelemetryMonitor singleton is initialized and operational', () => {
  assert.notEqual(defaultTelemetryMonitor, null);
  const sys = defaultTelemetryMonitor.getSystemMetrics();
  assert.equal(sys.status, 'operational');
  assert.equal(typeof sys.thresholds, 'object');
});
