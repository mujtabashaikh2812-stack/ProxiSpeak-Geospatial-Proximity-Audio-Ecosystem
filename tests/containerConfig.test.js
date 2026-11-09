'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.join(__dirname, '..');

test('Dockerfile: validates multi-stage architecture, security hardening and healthcheck', () => {
  const dockerfilePath = path.join(ROOT_DIR, 'Dockerfile');
  assert.equal(fs.existsSync(dockerfilePath), true, 'Dockerfile must exist at project root');

  const content = fs.readFileSync(dockerfilePath, 'utf8');

  // 1. Alpine lightweight base image
  assert.equal(content.includes('FROM node:20-alpine'), true, 'Must use lightweight node:20-alpine image');

  // 2. PID 1 init process manager
  assert.equal(content.includes('dumb-init'), true, 'Must install dumb-init for zombie process reaping and signal handling');

  // 3. Security: Unprivileged execution
  assert.equal(content.includes('USER node'), true, 'Must execute as unprivileged node user (non-root)');

  // 4. Exposed application port
  assert.equal(content.includes('EXPOSE 5000'), true, 'Must expose port 5000');

  // 5. Container healthcheck probe
  assert.equal(content.includes('HEALTHCHECK'), true, 'Must define HEALTHCHECK probe');
  assert.equal(content.includes('/api/health'), true, 'HEALTHCHECK probe must target /api/health');

  // 6. Clean entrypoint and command
  assert.equal(content.includes('ENTRYPOINT'), true, 'Must define ENTRYPOINT');
  assert.equal(content.includes('CMD ["node", "server.js"]'), true, 'Must run node server.js');
});

test('.dockerignore: ensures sensitive credentials and ephemeral files are excluded', () => {
  const ignorePath = path.join(ROOT_DIR, '.dockerignore');
  assert.equal(fs.existsSync(ignorePath), true, '.dockerignore must exist at project root');

  const content = fs.readFileSync(ignorePath, 'utf8');
  const lines = content.split('\n').map((l) => l.trim()).filter(Boolean);

  assert.equal(lines.includes('node_modules'), true, 'Must exclude local node_modules');
  assert.equal(lines.includes('.git'), true, 'Must exclude .git repository files');
  assert.equal(lines.includes('.env'), true, 'Must exclude .env credential files');
  assert.equal(lines.includes('tests/'), true, 'Must exclude tests/ from production bundle');
});

test('docker-compose.prod.yml: verifies multi-container orchestration topology', () => {
  const composePath = path.join(ROOT_DIR, 'docker-compose.prod.yml');
  assert.equal(fs.existsSync(composePath), true, 'docker-compose.prod.yml must exist at project root');

  const content = fs.readFileSync(composePath, 'utf8');

  // Verify services exist
  assert.equal(content.includes('app:'), true, 'Must define app service');
  assert.equal(content.includes('redis:'), true, 'Must define redis service');
  assert.equal(content.includes('mongodb:'), true, 'Must define mongodb service');

  // Verify health-based startup dependencies
  assert.equal(content.includes('service_healthy'), true, 'app must wait for healthy dependencies');

  // Verify resource caps and limits
  assert.equal(content.includes('memory: 1024M'), true, 'app must cap memory at 1024M');
  assert.equal(content.includes("cpus: '1.0'"), true, 'app must cap CPU at 1.0 core');

  // Verify Redis caching & AOF durability
  assert.equal(content.includes('--appendonly'), true, 'Redis must use append-only file persistence');
  assert.equal(content.includes('volatile-lru'), true, 'Redis must use LRU eviction policy');

  // Verify persistent volumes and bridge network
  assert.equal(content.includes('mongo_data:'), true, 'Must declare persistent mongo_data volume');
  assert.equal(content.includes('redis_data:'), true, 'Must declare persistent redis_data volume');
  assert.equal(content.includes('proxispeak-net:'), true, 'Must declare isolated bridge network');
});

test('package.json: includes container deployment scripts', () => {
  const pkgPath = path.join(ROOT_DIR, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

  assert.equal(typeof pkg.scripts['docker:build'], 'string', 'Must provide docker:build script');
  assert.equal(typeof pkg.scripts['docker:up'], 'string', 'Must provide docker:up script');
  assert.equal(typeof pkg.scripts['docker:down'], 'string', 'Must provide docker:down script');
});
