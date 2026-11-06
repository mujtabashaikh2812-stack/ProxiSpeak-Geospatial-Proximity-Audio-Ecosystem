'use strict';

/**
 * TelemetryMonitor
 * 
 * Real-Time Network Quality of Service (QoS) & Audio Telemetry Engine
 * 
 * Monitors avatar WebSocket and WebRTC stream health:
 * 1. Rolling Round-Trip Time (RTT) & Network Jitter (last 30 samples).
 * 2. Adaptive Connection Quality Rating (EXCELLENT, GOOD, FAIR, DEGRADED).
 * 3. Audio Packet Loss & Degradation Detection.
 * 4. Dynamic WebRTC Audio Bitrate Adaptation Recommendations (Opus 16kbps?"64kbps).
 * 5. System-wide network health diagnostics for observability and review demos.
 */

const SAMPLE_BUFFER_SIZE = 30;

const QUALITY_THRESHOLDS = {
  EXCELLENT: { maxRttMs: 40, maxJitterMs: 15, maxLossPct: 1, recommendedBitrateKbps: 64 },
  GOOD:      { maxRttMs: 90, maxJitterMs: 30, maxLossPct: 3, recommendedBitrateKbps: 48 },
  FAIR:      { maxRttMs: 160, maxJitterMs: 60, maxLossPct: 7, recommendedBitrateKbps: 32 },
  DEGRADED:  { maxRttMs: Infinity, maxJitterMs: Infinity, maxLossPct: 100, recommendedBitrateKbps: 16 },
};

class TelemetryMonitor {
  constructor(options = {}) {
    this.bufferSize = options.bufferSize || SAMPLE_BUFFER_SIZE;
    this.peerTelemetry = new Map(); // userId -> { rttSamples, packetReports, lastQuality, lastSeen }
    this.metrics = {
      totalPingsProcessed: 0,
      qualityChangesDetected: 0,
      degradedConnectionsCount: 0,
    };
  }

  _getOrCreatePeer(userId) {
    const id = String(userId);
    if (!this.peerTelemetry.has(id)) {
      this.peerTelemetry.set(id, {
        userId: id,
        rttSamples: [],
        packetReports: [],
        lastQuality: 'EXCELLENT',
        firstConnectedAt: new Date().toISOString(),
        lastSeen: new Date().toISOString(),
      });
    }
    return this.peerTelemetry.get(id);
  }

  /**
   * Records a round-trip ping measurement
   * @param {string} userId - User identifier
   * @param {number} clientSentTimestampMs - Timestamp sent by client
   * @returns {object} { rttMs, quality, jitterMs }
   */
  recordPing(userId, clientSentTimestampMs) {
    this.metrics.totalPingsProcessed++;
    const peer = this._getOrCreatePeer(userId);
    const now = Date.now();
    const rtt = Math.max(1, Math.round(now - Number(clientSentTimestampMs)));

    peer.rttSamples.push(rtt);
    if (peer.rttSamples.length > this.bufferSize) {
      peer.rttSamples.shift();
    }

    peer.lastSeen = new Date().toISOString();

    const analysis = this.analyzePeerHealth(userId);
    if (analysis.quality !== peer.lastQuality) {
      this.metrics.qualityChangesDetected++;
      if (analysis.quality === 'DEGRADED') {
        this.metrics.degradedConnectionsCount++;
      }
      peer.lastQuality = analysis.quality;
    }

    return {
      userId: peer.userId,
      rttMs: rtt,
      averageRttMs: analysis.averageRttMs,
      jitterMs: analysis.jitterMs,
      quality: analysis.quality,
      recommendedBitrateKbps: analysis.recommendedBitrateKbps,
      timestamp: now,
    };
  }

  /**
   * Records WebRTC client packet telemetry
   * @param {string} userId
   * @param {object} report - { packetsSent, packetsLost, bytesSent, audioLevel }
   */
  recordPacketReport(userId, report = {}) {
    const peer = this._getOrCreatePeer(userId);
    const validated = {
      timestamp: Date.now(),
      packetsSent: Number(report.packetsSent) || 0,
      packetsLost: Number(report.packetsLost) || 0,
      bytesSent: Number(report.bytesSent) || 0,
      audioLevel: typeof report.audioLevel === 'number' ? report.audioLevel : null,
    };

    peer.packetReports.push(validated);
    if (peer.packetReports.length > this.bufferSize) {
      peer.packetReports.shift();
    }

    return this.analyzePeerHealth(userId);
  }

  /**
   * Analyzes network quality and computes statistical jitter
   * @param {string} userId
   * @returns {object} Comprehensive health scorecard for peer
   */
  analyzePeerHealth(userId) {
    const peer = this.peerTelemetry.get(String(userId));
    if (!peer || peer.rttSamples.length === 0) {
      return {
        userId: String(userId),
        status: 'UNKNOWN',
        quality: 'GOOD',
        averageRttMs: 0,
        medianRttMs: 0,
        minRttMs: 0,
        maxRttMs: 0,
        jitterMs: 0,
        packetLossPct: 0,
        recommendedBitrateKbps: 48,
        sampleCount: 0,
      };
    }

    const samples = [...peer.rttSamples];
    const sum = samples.reduce((acc, v) => acc + v, 0);
    const avgRtt = Math.round((sum / samples.length) * 10) / 10;

    // Median RTT
    const sorted = [...samples].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const medianRtt = sorted.length % 2 !== 0 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);

    // Statistical Jitter: Standard Deviation of RTT deltas
    let jitterSum = 0;
    for (let i = 1; i < samples.length; i++) {
      jitterSum += Math.abs(samples[i] - samples[i - 1]);
    }
    const jitter = samples.length > 1 ? Math.round((jitterSum / (samples.length - 1)) * 10) / 10 : 0;

    // Packet loss rate from reports
    let totalSent = 0;
    let totalLost = 0;
    for (const rep of peer.packetReports) {
      totalSent += rep.packetsSent;
      totalLost += rep.packetsLost;
    }
    const lossPct = totalSent > 0 ? Math.round((totalLost / totalSent) * 1000) / 10 : 0;

    // Evaluate Quality Tier
    let quality = 'DEGRADED';
    let recommendedBitrate = 16;

    if (avgRtt <= QUALITY_THRESHOLDS.EXCELLENT.maxRttMs && jitter <= QUALITY_THRESHOLDS.EXCELLENT.maxJitterMs && lossPct <= QUALITY_THRESHOLDS.EXCELLENT.maxLossPct) {
      quality = 'EXCELLENT';
      recommendedBitrate = QUALITY_THRESHOLDS.EXCELLENT.recommendedBitrateKbps;
    } else if (avgRtt <= QUALITY_THRESHOLDS.GOOD.maxRttMs && jitter <= QUALITY_THRESHOLDS.GOOD.maxJitterMs && lossPct <= QUALITY_THRESHOLDS.GOOD.maxLossPct) {
      quality = 'GOOD';
      recommendedBitrate = QUALITY_THRESHOLDS.GOOD.recommendedBitrateKbps;
    } else if (avgRtt <= QUALITY_THRESHOLDS.FAIR.maxRttMs && jitter <= QUALITY_THRESHOLDS.FAIR.maxJitterMs && lossPct <= QUALITY_THRESHOLDS.FAIR.maxLossPct) {
      quality = 'FAIR';
      recommendedBitrate = QUALITY_THRESHOLDS.FAIR.recommendedBitrateKbps;
    }

    return {
      userId: peer.userId,
      status: 'TRACKED',
      quality,
      averageRttMs: avgRtt,
      medianRttMs: medianRtt,
      minRttMs: sorted[0],
      maxRttMs: sorted[sorted.length - 1],
      jitterMs: jitter,
      packetLossPct: lossPct,
      recommendedBitrateKbps: recommendedBitrate,
      sampleCount: samples.length,
      lastSeen: peer.lastSeen,
    };
  }

  /**
   * System-wide aggregated network telemetry
   */
  getSystemMetrics() {
    const peers = Array.from(this.peerTelemetry.values());
    const totalPeers = peers.length;

    let totalAvgRtt = 0;
    let qualityBreakdown = {
      EXCELLENT: 0,
      GOOD: 0,
      FAIR: 0,
      DEGRADED: 0,
    };

    for (const p of peers) {
      const h = this.analyzePeerHealth(p.userId);
      totalAvgRtt += h.averageRttMs;
      if (qualityBreakdown[h.quality] !== undefined) {
        qualityBreakdown[h.quality]++;
      }
    }

    const networkAvgRtt = totalPeers > 0 ? Math.round((totalAvgRtt / totalPeers) * 10) / 10 : 0;

    return {
      service: 'Real-Time Network QoS & Telemetry Health Monitor',
      status: 'operational',
      trackedPeersCount: totalPeers,
      networkAverageRttMs: networkAvgRtt,
      qualityDistribution: qualityBreakdown,
      metrics: {
        totalPingsProcessed: this.metrics.totalPingsProcessed,
        qualityChangesDetected: this.metrics.qualityChangesDetected,
        degradedConnectionsCount: this.metrics.degradedConnectionsCount,
      },
      thresholds: QUALITY_THRESHOLDS,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Cleans up telemetry buffers for a departing avatar
   */
  cleanupUser(userId) {
    return this.peerTelemetry.delete(String(userId));
  }

  reset() {
    this.peerTelemetry.clear();
    this.metrics = {
      totalPingsProcessed: 0,
      qualityChangesDetected: 0,
      degradedConnectionsCount: 0,
    };
  }
}

// Singleton default instance
const defaultTelemetryMonitor = new TelemetryMonitor();

module.exports = {
  TelemetryMonitor,
  defaultTelemetryMonitor,
  QUALITY_THRESHOLDS,
};
