'use strict';

require('dotenv').config();

const config = {
  port: parseInt(process.env.PORT, 10) || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',
  clientOrigins: process.env.CLIENT_ORIGIN
    ? process.env.CLIENT_ORIGIN.split(',').map((origin) => origin.trim())
    : ['http://localhost:5173', 'http://localhost:3000'],
  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/procsispeak',
  earshotRadius: parseInt(process.env.EARSHOT_RADIUS_PIXELS, 10) || 100,
};

module.exports = config;
