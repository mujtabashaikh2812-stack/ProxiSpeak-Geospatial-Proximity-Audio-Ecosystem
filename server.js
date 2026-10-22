'use strict';

const http = require('http');
const express = require('express');
const cors = require('cors');
const config = require('./config/serverConfig');
const { initSocketServer, getActiveUsers } = require('./sockets/socketManager');

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
    service: 'ProxiSpeak Signaling Server',
  });
});

// Active users inspection endpoint (useful for audit & debugging)
app.get('/api/users/active', (req, res) => {
  const users = getActiveUsers();
  res.status(200).json({
    count: users.length,
    users,
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
    },
  });
});

if (require.main === module) {
  server.listen(config.port, () => {
    console.log(`[ProxiSpeak Server] Running on http://localhost:${config.port}`);
    console.log(`[ProxiSpeak Server] Environment: ${config.nodeEnv}`);
    console.log(`[ProxiSpeak Server] Socket.io attached and ready for peer connections`);
  });
}

module.exports = { app, server, io };
