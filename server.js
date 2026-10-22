'use strict';

const http = require('http');
const express = require('express');
const cors = require('cors');
const config = require('./config/serverConfig');

const app = express();
const server = http.createServer(app);

// Cross-Origin Resource Sharing (CORS) Middleware
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. mobile apps, curl, server-to-server)
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
    service: 'ProxiSpeak Signaling Server',
  });
});

// Root welcome route
app.get('/', (req, res) => {
  res.status(200).json({
    name: 'ProxiSpeak Geospatial Proximity Audio Server',
    version: '1.0.0',
    endpoints: {
      health: '/api/health',
    },
  });
});

if (require.main === module) {
  server.listen(config.port, () => {
    console.log(`[ProxiSpeak Server] Running on http://localhost:${config.port}`);
    console.log(`[ProxiSpeak Server] Environment: ${config.nodeEnv}`);
  });
}

module.exports = { app, server };
