'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  MetricsExporter,
  defaultMetricsExporter,
} = require('../services/metricsExporter');

test('collectMetrics: aggregates comprehensive telemetry across all subsystems', () => {
  const exporter = new MetricsExporter();
  const data = exporter.collectMetrics();

  assert.equal(typeof data.timestamp, 'string');

  // Process & Memory metrics
  assert.equal(typeof data.process.uptimeSeconds, 'number');
  assert.equal(data.process.uptimeSeconds >= 0, true);
  assert.equal(typeof data.process.memoryHeapUsedBytes, 'number');
  assert.equal(typeof data.process.memoryHeapTotalBytes, 'number');
  assert.equal(typeof data.process.memoryRssBytes, 'number');

  // Spatial metrics
  assert.equal(typeof data.spatial.activeUsersCount, 'number');
  assert.equal(typeof data.spatial.activeProximityPairsCount, 'number');
  assert.equal(data.spatial.earshotRadiusPixels, 100);

  // Throttle metrics
  assert.equal(typeof data.throttle.totalEmitsReceived, 'number');
  assert.equal(typeof data.throttle.broadcastsDispatched, 'number');
  assert.equal(typeof data.throttle.bandwidthSavedRatio, 'number');

  // Cache metrics
  assert.equal(typeof data.cache.currentEntries, 'number');
  assert.equal(typeof data.cache.hits, 'number');
  assert.equal(typeof data.cache.misses, 'number');

  // Mesh metrics
  assert.equal(data.mesh.maxPeerCap, 6);
  assert.equal(typeof data.mesh.activeStreams, 'number');

  // Audio & Benchmark metrics
  assert.equal(typeof data.audio.matrixComputationsTotal, 'number');
  assert.equal(typeof data.audio.benchmarkOpsPerSec, 'number');

  // Occlusion metrics
  assert.equal(typeof data.occlusion.totalRaycasts, 'number');

  // Subsystem health
  assert.equal(data.health.server, 1);
  assert.equal(data.health.redis, 1);
  assert.equal(data.health.spatialEngine, 1);
  assert.equal(data.health.audioBridge, 1);
});

test('generatePrometheusMetrics: exports standard Prometheus plaintext format', () => {
  const exporter = new MetricsExporter();
  const text = exporter.generatePrometheusMetrics();

  assert.equal(typeof text, 'string');
  assert.equal(text.length > 500, true);

  // Validate Prometheus HELP and TYPE headers
  assert.equal(text.includes('# HELP proxispeak_process_uptime_seconds'), true);
  assert.equal(text.includes('# TYPE proxispeak_process_uptime_seconds gauge'), true);
  assert.equal(text.includes('proxispeak_process_uptime_seconds'), true);

  assert.equal(text.includes('# HELP proxispeak_process_memory_heap_used_bytes'), true);
  assert.equal(text.includes('# TYPE proxispeak_process_memory_heap_used_bytes gauge'), true);

  assert.equal(text.includes('# HELP proxispeak_active_users'), true);
  assert.equal(text.includes('# TYPE proxispeak_active_users gauge'), true);

  assert.equal(text.includes('# HELP proxispeak_throttle_emits_received_total'), true);
  assert.equal(text.includes('# TYPE proxispeak_throttle_emits_received_total counter'), true);

  assert.equal(text.includes('# HELP proxispeak_mesh_max_peer_cap'), true);
  assert.equal(text.includes('# TYPE proxispeak_mesh_max_peer_cap gauge'), true);
  assert.equal(text.includes('proxispeak_mesh_max_peer_cap 6'), true);

  assert.equal(text.includes('# HELP proxispeak_audio_matrix_computations_total'), true);
  assert.equal(text.includes('# TYPE proxispeak_audio_matrix_computations_total counter'), true);

  assert.equal(text.includes('# HELP proxispeak_audio_benchmark_ops_per_second'), true);
  assert.equal(text.includes('# TYPE proxispeak_audio_benchmark_ops_per_second gauge'), true);

  // Validate labeled gauge metric lines
  assert.equal(text.includes('proxispeak_system_health{subsystem="server"} 1'), true);
  assert.equal(text.includes('proxispeak_system_health{subsystem="redis"} 1'), true);
  assert.equal(text.includes('proxispeak_system_health{subsystem="spatial_engine"} 1'), true);
  assert.equal(text.includes('proxispeak_system_health{subsystem="audio_bridge"} 1'), true);
});

test('MetricsExporter: custom prefix support', () => {
  const customExporter = new MetricsExporter({ prefix: 'custom_proxi' });
  const text = customExporter.generatePrometheusMetrics();

  assert.equal(text.includes('custom_proxi_active_users'), true);
  assert.equal(text.includes('custom_proxi_process_uptime_seconds'), true);
});

test('defaultMetricsExporter singleton is operational', () => {
  const metrics = defaultMetricsExporter.generatePrometheusMetrics();
  assert.equal(typeof metrics, 'string');
  assert.equal(metrics.includes('proxispeak_'), true);
});
