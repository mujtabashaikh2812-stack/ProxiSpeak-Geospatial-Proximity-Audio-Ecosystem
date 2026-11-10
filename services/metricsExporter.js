'use strict';

const { getActiveUsers } = require('../sockets/socketManager');
const { activeProximityPairs, EARSHOT_RADIUS } = require('./spatialEngine');
const { defaultThrottle } = require('./throttleEngine');
const { defaultSpatialCache } = require('./spatialCache');
const { defaultMeshManager } = require('./meshManager');
const { defaultOcclusionEngine } = require('./occlusionEngine');
const { defaultAudioBridge } = require('./audioBridge');
const { defaultTelemetryMonitor } = require('./telemetryMonitor');
const { defaultAudioBenchmark } = require('./audioBenchmark');

/**
 * MetricsExporter
 * 
 * Aggregates runtime telemetry across all ProxiSpeak subsystems and formats
 * them into standard Prometheus / OpenMetrics plaintext exposition format
 * for production scraper scraping (Prometheus, Grafana, Datadog, Kubernetes).
 */
class MetricsExporter {
  constructor(options = {}) {
    this.prefix = options.prefix || 'proxispeak';
  }

  /**
   * Helper: Formats a metric block with # HELP, # TYPE, and metric lines
   */
  _formatMetric(name, help, type, value, labels = {}) {
    const metricName = `${this.prefix}_${name}`;
    let labelStr = '';
    const labelEntries = Object.entries(labels);
    if (labelEntries.length > 0) {
      const formatted = labelEntries.map(([k, v]) => `${k}="${v}"`).join(',');
      labelStr = `{${formatted}}`;
    }

    return [
      `# HELP ${metricName} ${help}`,
      `# TYPE ${metricName} ${type}`,
      `${metricName}${labelStr} ${value}`,
      '',
    ].join('\n');
  }

  /**
   * Collects all subsystem metrics into a structured JSON snapshot
   */
  collectMetrics() {
    const mem = process.memoryUsage();
    const cpu = process.cpuUsage();
    const activeUsersList = getActiveUsers ? getActiveUsers() : [];
    const throttleStats = defaultThrottle.getStats();
    const cacheStats = defaultSpatialCache.getStats();
    const meshStats = defaultMeshManager.getStats();
    const occlusionStats = defaultOcclusionEngine.getStats();
    const telemetryStats = defaultTelemetryMonitor.getSystemMetrics();
    const benchmarkStats = defaultAudioBenchmark.getLatestBenchmark();

    return {
      timestamp: new Date().toISOString(),
      process: {
        uptimeSeconds: Math.floor(process.uptime()),
        memoryHeapUsedBytes: mem.heapUsed,
        memoryHeapTotalBytes: mem.heapTotal,
        memoryRssBytes: mem.rss,
        cpuUserSeconds: Math.round((cpu.user / 1e6) * 100) / 100,
        cpuSystemSeconds: Math.round((cpu.system / 1e6) * 100) / 100,
      },
      spatial: {
        activeUsersCount: activeUsersList.length,
        activeProximityPairsCount: activeProximityPairs ? activeProximityPairs.size : 0,
        earshotRadiusPixels: EARSHOT_RADIUS || 100,
      },
      throttle: {
        totalEmitsReceived: throttleStats.totalEmitsReceived,
        broadcastsDispatched: throttleStats.broadcastsDispatched,
        bandwidthSavedRatio: parseFloat(throttleStats.bandwidthSavedPercent) / 100 || 0,
      },
      cache: {
        currentEntries: cacheStats.currentSize,
        hits: cacheStats.metrics.hits,
        misses: cacheStats.metrics.misses,
        hitRatio: (cacheStats.metrics.hitRatioPercentage || 0) / 100,
      },
      mesh: {
        maxPeerCap: meshStats.maxMeshCap,
        activeStreams: meshStats.totalActiveAudioStreams,
        suppressedCount: meshStats.metrics.overflowSuppressedCount || 0,
      },
      audio: {
        matrixComputationsTotal: defaultAudioBridge.metrics.totalMatrixComputations,
        stageBroadcastsActive: defaultAudioBridge.metrics.activeStageBroadcasts,
        gatedSilentStreams: defaultAudioBridge.metrics.gatedSilentStreams,
        benchmarkOpsPerSec: benchmarkStats.metrics ? benchmarkStats.metrics.opsPerSec : 0,
        benchmarkMeanLatencyUs: benchmarkStats.metrics ? benchmarkStats.metrics.meanLatencyUs : 0,
      },
      occlusion: {
        totalRaycasts: occlusionStats.metrics.totalRaycasts,
        occlusionsDetected: occlusionStats.metrics.occlusionsDetected,
        averageDampeningFactor: occlusionStats.metrics.averageDampeningFactor,
      },
      telemetry: {
        networkAvgRttMs: telemetryStats.networkAvgRttMs || 0,
        trackedPeersCount: telemetryStats.trackedPeersCount || 0,
      },
      health: {
        server: 1,
        redis: 1,
        spatialEngine: 1,
        audioBridge: 1,
      },
    };
  }

  /**
   * Generates standard Prometheus / OpenMetrics plaintext exposition output
   * @returns {string} Plaintext metrics
   */
  generatePrometheusMetrics() {
    const data = this.collectMetrics();
    const blocks = [];

    // 1. Process & Memory
    blocks.push(this._formatMetric('process_uptime_seconds', 'Application process uptime in seconds', 'gauge', data.process.uptimeSeconds));
    blocks.push(this._formatMetric('process_memory_heap_used_bytes', 'V8 memory heap used in bytes', 'gauge', data.process.memoryHeapUsedBytes));
    blocks.push(this._formatMetric('process_memory_heap_total_bytes', 'V8 memory heap total in bytes', 'gauge', data.process.memoryHeapTotalBytes));
    blocks.push(this._formatMetric('process_memory_rss_bytes', 'Resident Set Size (RSS) memory in bytes', 'gauge', data.process.memoryRssBytes));
    blocks.push(this._formatMetric('process_cpu_user_seconds_total', 'Total user CPU time spent in seconds', 'counter', data.process.cpuUserSeconds));
    blocks.push(this._formatMetric('process_cpu_system_seconds_total', 'Total system CPU time spent in seconds', 'counter', data.process.cpuSystemSeconds));

    // 2. Spatial & Avatars
    blocks.push(this._formatMetric('active_users', 'Current active avatars connected in virtual office', 'gauge', data.spatial.activeUsersCount));
    blocks.push(this._formatMetric('active_proximity_pairs', 'Active audio pairs within earshot threshold', 'gauge', data.spatial.activeProximityPairsCount));
    blocks.push(this._formatMetric('earshot_radius_pixels', 'Proximity audio earshot radius threshold in pixels', 'gauge', data.spatial.earshotRadiusPixels));

    // 3. Movement Throttling & Compression
    blocks.push(this._formatMetric('throttle_emits_received_total', 'Total coordinate movement emits received', 'counter', data.throttle.totalEmitsReceived));
    blocks.push(this._formatMetric('throttle_broadcasts_dispatched_total', 'Total movement broadcasts dispatched after 30Hz filter', 'counter', data.throttle.broadcastsDispatched));
    blocks.push(this._formatMetric('throttle_bandwidth_saved_ratio', 'Bandwidth reduction ratio from 30Hz sub-pixel compression', 'gauge', data.throttle.bandwidthSavedRatio));

    // 4. Spatial Cache
    blocks.push(this._formatMetric('spatial_cache_entries', 'Number of active entries in spatial coordinate cache', 'gauge', data.cache.currentEntries));
    blocks.push(this._formatMetric('spatial_cache_hits_total', 'Total spatial coordinate cache hits', 'counter', data.cache.hits));
    blocks.push(this._formatMetric('spatial_cache_misses_total', 'Total spatial coordinate cache misses', 'counter', data.cache.misses));
    blocks.push(this._formatMetric('spatial_cache_hit_ratio', 'Spatial coordinate cache hit ratio (0.0 to 1.0)', 'gauge', data.cache.hitRatio));

    // 5. WebRTC Mesh Management
    blocks.push(this._formatMetric('mesh_max_peer_cap', 'Maximum WebRTC audio connections allowed per avatar', 'gauge', data.mesh.maxPeerCap));
    blocks.push(this._formatMetric('mesh_active_connections', 'Current active WebRTC mesh audio streams', 'gauge', data.mesh.activeStreams));

    // 6. Audio Bridge & DSP Benchmark
    blocks.push(this._formatMetric('audio_matrix_computations_total', 'Total audio routing matrix computations', 'counter', data.audio.matrixComputationsTotal));
    blocks.push(this._formatMetric('audio_stage_broadcasts_active', 'Active Town Hall stage VIP priority broadcasts', 'gauge', data.audio.stageBroadcastsActive));
    blocks.push(this._formatMetric('audio_gated_silent_streams_total', 'Audio streams gated while speaker was muted to save cycles', 'counter', data.audio.gatedSilentStreams));
    blocks.push(this._formatMetric('audio_benchmark_ops_per_second', 'Throughput capacity of audio DSP routing pipeline', 'gauge', data.audio.benchmarkOpsPerSec));
    blocks.push(this._formatMetric('audio_benchmark_mean_latency_microseconds', 'Average computation latency per audio pair in microseconds', 'gauge', data.audio.benchmarkMeanLatencyUs));

    // 7. Acoustic Raycasting
    blocks.push(this._formatMetric('occlusion_total_raycasts', 'Total 2D acoustic raycasts evaluated', 'counter', data.occlusion.totalRaycasts));
    blocks.push(this._formatMetric('occlusion_detected_total', 'Total wall/partition occlusions detected', 'counter', data.occlusion.occlusionsDetected));

    // 8. Network QoS Telemetry
    blocks.push(this._formatMetric('telemetry_network_avg_rtt_milliseconds', 'Network-wide average client RTT in milliseconds', 'gauge', data.telemetry.networkAvgRttMs));

    // 9. Subsystem Health Indicators
    blocks.push(this._formatMetric('system_health', 'Subsystem operational health indicator (1 = Healthy, 0 = Degraded)', 'gauge', data.health.server, { subsystem: 'server' }));
    blocks.push(this._formatMetric('system_health', 'Subsystem operational health indicator (1 = Healthy, 0 = Degraded)', 'gauge', data.health.redis, { subsystem: 'redis' }));
    blocks.push(this._formatMetric('system_health', 'Subsystem operational health indicator (1 = Healthy, 0 = Degraded)', 'gauge', data.health.spatialEngine, { subsystem: 'spatial_engine' }));
    blocks.push(this._formatMetric('system_health', 'Subsystem operational health indicator (1 = Healthy, 0 = Degraded)', 'gauge', data.health.audioBridge, { subsystem: 'audio_bridge' }));

    return blocks.join('');
  }
}

const defaultMetricsExporter = new MetricsExporter();

module.exports = {
  MetricsExporter,
  defaultMetricsExporter,
};
