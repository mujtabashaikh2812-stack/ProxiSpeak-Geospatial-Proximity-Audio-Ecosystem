'use strict';

const http = require('http');
const express = require('express');
const cors = require('cors');
const config = require('./config/serverConfig');
const { initSocketServer, getActiveUsers } = require('./sockets/socketManager');
const {
  getNearbyPeersForUser,
  activeProximityPairs,
  EARSHOT_RADIUS,
} = require('./services/spatialEngine');

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

// Health check endpoint for monitoring & uptime checks
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'online',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    activePeers: getActiveUsers().length,
    activeProximityClusters: activeProximityPairs.size,
    service: 'ProxiSpeak Signaling Server',
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

// Root welcome route
app.get('/', (req, res) => {
  res.status(200).json({
    name: 'ProxiSpeak Geospatial Proximity Audio Server',
    version: '1.0.0',
    endpoints: {
      health: '/api/health',
      activeUsers: '/api/users/active',
      nearbyPeers: '/api/proximity/nearby/:userId',
      activePairs: '/api/proximity/pairs',
    },
  });
});

if (require.main === module) {
  server.listen(config.port, () => {
    console.log(`[ProxiSpeak Server] Running on http://localhost:${config.port}`);
    console.log(`[ProxiSpeak Server] Environment: ${config.nodeEnv}`);
    console.log(`[ProxiSpeak Server] Earshot radius: ${EARSHOT_RADIUS}px`);
  });
}

module.exports = { app, server, io };
