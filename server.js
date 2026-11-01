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

if (require.main === module) {
  server.listen(config.port, () => {
    console.log(`[ProxiSpeak Server] Running on http://localhost:${config.port}`);
    console.log(`[ProxiSpeak Server] Visual Playground: http://localhost:${config.port}/`);
    console.log(`[ProxiSpeak Server] Earshot radius: ${EARSHOT_RADIUS}px`);
    console.log(`[ProxiSpeak Server] Movement throttle active: 30Hz tick rate`);
  });
}

module.exports = { app, server, io };
