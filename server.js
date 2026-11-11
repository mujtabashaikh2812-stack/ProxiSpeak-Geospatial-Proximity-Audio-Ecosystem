'use strict';

const path = require('path');
const http = require('http');
const express = require('express');
const cors = require('cors');
const config = require('./config/serverConfig');
const { initSocketServer, getActiveUsers, getClusterAdapter } = require('./sockets/socketManager');
const {
  getNearbyPeersForUser,
  activeProximityPairs,
  OFFICE_ZONES,
  EARSHOT_RADIUS,
} = require('./services/spatialEngine');
const { defaultThrottle } = require('./services/throttleEngine');
const { checkRedisHealth } = require('./services/redisClient');
const { defaultMeshManager } = require('./services/meshManager');
const { defaultSpatialCache } = require('./services/spatialCache');
const { defaultOcclusionEngine } = require('./services/occlusionEngine');
const { defaultIntegrationHarness } = require('./services/integrationHarness');
const { defaultLayoutPersistence } = require('./services/layoutPersistence');
const { defaultSessionAnalytics } = require('./services/sessionAnalytics');
const { defaultAudioBridge } = require('./services/audioBridge');
const { defaultTelemetryMonitor } = require('./services/telemetryMonitor');
const { defaultAudioBenchmark } = require('./services/audioBenchmark');
const { defaultMetricsExporter } = require('./services/metricsExporter');
const { defaultReleaseCoordinator } = require('./services/releaseCoordinator');

const app = express();
const server = http.createServer(app);

// Initialize Socket.io real-time engine
const io = initSocketServer(server);

// Cross-Origin Resource Sharing (CORS) Middleware
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (config.clientOrigins.includes(origin) || config.nodeEnv === 'development') {
        return callback(null, true);
      }
      return callback(new Error(`Origin ${origin} not allowed by CORS`));
    },
    credentials: true,
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static frontend visual test playground
app.use(express.static(path.join(__dirname, 'public')));

// Serve Akhila's 2D canvas client demo
app.use('/akhila', express.static(path.join(__dirname, 'client-akhila')));

// Health check endpoint for monitoring & uptime checks
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'online',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    activePeers: getActiveUsers().length,
    activeProximityClusters: activeProximityPairs.size,
    zonesCount: OFFICE_ZONES.length,
    service: 'ProxiSpeak Signaling Server',
  });
});

// Redis pub/sub cluster health & resilience diagnostics (Week 3 Scaling)
app.get('/api/health/redis', async (req, res) => {
  const health = await checkRedisHealth();
  res.status(200).json(health);
});

// Cluster status & multi-instance diagnostics (Week 3 Scaling)
app.get('/api/cluster/status', (req, res) => {
  const adapter = getClusterAdapter();
  if (!adapter) {
    return res.status(200).json({ status: 'standalone', clusterActive: false });
  }
  res.status(200).json(adapter.getClusterStatus());
});

// Cluster-wide all connected peers inspection endpoint
app.get('/api/cluster/peers', (req, res) => {
  const adapter = getClusterAdapter();
  const allPeers = adapter ? adapter.getAllClusterUsers() : getActiveUsers();
  res.status(200).json({
    totalClusterPeers: allPeers.length,
    peers: allPeers,
  });
});

// Active users inspection endpoint
app.get('/api/users/active', (req, res) => {
  const users = getActiveUsers();
  res.status(200).json({
    count: users.length,
    users,
  });
});

// Office zones and acoustic layout endpoint
app.get('/api/zones', (req, res) => {
  res.status(200).json({
    zones: OFFICE_ZONES,
    defaultEarshotRadius: EARSHOT_RADIUS,
  });
});

// Spatial proximity endpoint: get peers in earshot for a specific user
app.get('/api/proximity/nearby/:userId', (req, res) => {
  const { userId } = req.params;
  const users = getActiveUsers();
  const target = users.find((u) => u.userId === userId);

  if (!target) {
    return res.status(404).json({ error: `User with id "${userId}" is not currently connected` });
  }

  const nearby = getNearbyPeersForUser(target, users, EARSHOT_RADIUS);
  res.status(200).json({
    userId,
    canvasPosition: { x: target.canvasX, y: target.canvasY },
    zone: target.zoneName || 'Open Workspace',
    earshotRadiusPixels: EARSHOT_RADIUS,
    count: nearby.length,
    nearbyPeers: nearby,
  });
});

// Spatial proximity pairs inspection endpoint
app.get('/api/proximity/pairs', (req, res) => {
  res.status(200).json({
    earshotRadiusPixels: EARSHOT_RADIUS,
    activePairsCount: activeProximityPairs.size,
    pairs: Array.from(activeProximityPairs),
  });
});

// Network throttle & performance statistics endpoint (Week 3 Scaling)
app.get('/api/performance/throttle', (req, res) => {
  res.status(200).json({
    service: 'Coordinate Throttle & Delta Compressor',
    performance: defaultThrottle.getStats(),
  });
});

// WebRTC Mesh capping & connection allocation performance diagnostics (Week 3 Scaling)
app.get('/api/performance/mesh', (req, res) => {
  res.status(200).json(defaultMeshManager.getStats());
});

// Spatial coordinate & proximity cache performance diagnostics (Week 3 Scaling)
app.get('/api/performance/cache', (req, res) => {
  res.status(200).json(defaultSpatialCache.getStats());
});

// Physics-aware acoustic raycasting & wall occlusion diagnostics (Week 4 Physics)
app.get('/api/performance/occlusion', (req, res) => {
  res.status(200).json(defaultOcclusionEngine.getStats());
});

// Office acoustic obstacles inspection endpoint
app.get('/api/zones/obstacles', (req, res) => {
  res.status(200).json({
    count: defaultOcclusionEngine.getAllObstacles().length,
    obstacles: defaultOcclusionEngine.getAllObstacles(),
  });
});

// Multi-Pod full system integration health audit scorecard (Week 3–4 Milestone)
app.get('/api/system/health-audit', async (req, res) => {
  const scorecard = await defaultIntegrationHarness.runFullSystemAudit();
  res.status(200).json(scorecard);
});

// Recent system health audit history
app.get('/api/system/health-history', (req, res) => {
  res.status(200).json({
    history: defaultIntegrationHarness.auditHistory,
  });
});

// Persistent office layout inspection endpoint (Week 4 Spatial Persistence)
app.get('/api/layout/active', (req, res) => {
  res.status(200).json({
    layout: defaultLayoutPersistence.getActiveLayout(),
    summary: defaultLayoutPersistence.getLayoutSummary(),
  });
});

// Layout summary telemetry endpoint
app.get('/api/layout/summary', (req, res) => {
  res.status(200).json(defaultLayoutPersistence.getLayoutSummary());
});

// Update persistent active office layout
app.put('/api/layout/active', async (req, res) => {
  try {
    const updated = await defaultLayoutPersistence.saveLayout(req.body);
    res.status(200).json({
      message: 'Layout successfully updated and synchronized with live engines',
      layout: updated,
      summary: defaultLayoutPersistence.getLayoutSummary(),
    });
  } catch (err) {
    res.status(400).json({
      error: 'Failed to update layout',
      details: err.message,
    });
  }
});

// Reset office layout to factory default floorplan
app.post('/api/layout/reset', async (req, res) => {
  try {
    const layout = await defaultLayoutPersistence.resetToDefaultLayout();
    res.status(200).json({
      message: 'Layout reset to factory default and synchronized with live engines',
      layout,
      summary: defaultLayoutPersistence.getLayoutSummary(),
    });
  } catch (err) {
    res.status(500).json({
      error: 'Failed to reset layout',
      details: err.message,
    });
  }
});

// Real-time room occupancy and capacity telemetry endpoint (Week 4 Telemetry)
app.get('/api/analytics/occupancy', (req, res) => {
  res.status(200).json({
    occupancy: defaultSessionAnalytics.getRoomOccupancy(),
  });
});

// Active in-flight user sessions with live dwell-time counters
app.get('/api/analytics/sessions/active', (req, res) => {
  res.status(200).json({
    count: defaultSessionAnalytics.getActiveSessions().length,
    sessions: defaultSessionAnalytics.getActiveSessions(),
  });
});

// System-wide aggregated analytics metrics (averages, distance, popular zones)
app.get('/api/analytics/summary', async (req, res) => {
  const metrics = await defaultSessionAnalytics.getAggregatedMetrics();
  res.status(200).json(metrics);
});

// User session history endpoint
app.get('/api/analytics/sessions/:userId', async (req, res) => {
  const { userId } = req.params;
  const history = await defaultSessionAnalytics.getUserHistory(userId);
  res.status(200).json({
    userId,
    count: history.length,
    history,
  });
});

// Spatial audio routing matrix for a specific listener avatar (Week 4 Audio Bridge)
app.get('/api/audio/matrix/:userId', (req, res) => {
  const { userId } = req.params;
  const allUsers = getActiveUsers();
  const listener = allUsers.find((u) => u.userId === userId);

  if (!listener) {
    return res.status(404).json({ error: `User with id "${userId}" is not currently connected` });
  }

  const matrix = defaultAudioBridge.computeAudioMatrix(listener, allUsers);
  res.status(200).json(matrix);
});

// Audio bridge system diagnostics
app.get('/api/audio/diagnostics', (req, res) => {
  res.status(200).json(defaultAudioBridge.getDiagnostics());
});

// Update audio state (mute/speaking) via REST
app.post('/api/audio/state/:userId', (req, res) => {
  const { userId } = req.params;
  const { isMuted, isSpeaking, volumeBoost } = req.body;
  const updated = defaultAudioBridge.setUserAudioState(userId, { isMuted, isSpeaking, volumeBoost });
  res.status(200).json({
    message: 'Audio state updated',
    audioState: updated,
  });
});

// System-wide network QoS telemetry & health metrics (Week 4 Observability)
app.get('/api/telemetry/network', (req, res) => {
  res.status(200).json(defaultTelemetryMonitor.getSystemMetrics());
});

// Granular network health scorecard for a specific avatar
app.get('/api/telemetry/peers/:userId', (req, res) => {
  const { userId } = req.params;
  res.status(200).json(defaultTelemetryMonitor.analyzePeerHealth(userId));
});

// Record ping sample for latency telemetry
app.post('/api/telemetry/ping/:userId', (req, res) => {
  const { userId } = req.params;
  const { clientTimestamp = Date.now() - 25 } = req.body;
  const result = defaultTelemetryMonitor.recordPing(userId, clientTimestamp);
  res.status(200).json(result);
});

// Web Audio GainNode & AudioWorklet Attenuation Benchmark Endpoints (Day 17)
app.get('/api/audio/benchmark/latest', (req, res) => {
  res.status(200).json(defaultAudioBenchmark.getLatestBenchmark());
});

app.post('/api/audio/benchmark/run', (req, res) => {
  const { numAvatars = 25, iterations = 15 } = req.body || {};
  const scorecard = defaultAudioBenchmark.runFullSuite({
    numAvatars: Number(numAvatars),
    iterations: Number(iterations),
  });
  res.status(200).json(scorecard);
});

app.get('/api/audio/benchmark/history', (req, res) => {
  res.status(200).json({
    count: defaultAudioBenchmark.getHistory().length,
    history: defaultAudioBenchmark.getHistory(),
  });
});

// Prometheus & OpenMetrics Plaintext Scraper Endpoint (Day 19 Observability)
app.get('/metrics', (req, res) => {
  res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
  res.status(200).send(defaultMetricsExporter.generatePrometheusMetrics());
});

// JSON Telemetry Snapshot for dashboards & health monitors
app.get('/api/metrics/json', (req, res) => {
  res.status(200).json(defaultMetricsExporter.collectMetrics());
});

// Final Release v1.0.0 Ecosystem Verification Gateway (Day 20 Grand Finale)
app.get('/api/system/release', async (req, res) => {
  try {
    const report = await defaultReleaseCoordinator.evaluateReleaseReadiness();
    res.status(200).json(report);
  } catch (err) {
    res.status(500).json({ error: 'Failed to evaluate release readiness', details: err.message });
  }
});

if (require.main === module) {
  server.listen(config.port, () => {
    console.log(`[ProxiSpeak Server] Running on http://localhost:${config.port}`);
    console.log(`[ProxiSpeak Server] Visual Playground: http://localhost:${config.port}/`);
    console.log(`[ProxiSpeak Server] Prometheus Metrics: http://localhost:${config.port}/metrics`);
    console.log(`[ProxiSpeak Server] Release Manifest: http://localhost:${config.port}/api/system/release`);
    console.log(`[ProxiSpeak Server] Earshot radius: ${EARSHOT_RADIUS}px`);
    console.log(`[ProxiSpeak Server] Movement throttle active: 30Hz tick rate`);
  });
}

module.exports = { app, server, io };
