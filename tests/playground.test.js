'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const http = require('http');

const { defaultLayoutPersistence } = require('../services/layoutPersistence');
const { defaultSessionAnalytics } = require('../services/sessionAnalytics');
const { defaultTelemetryMonitor } = require('../services/telemetryMonitor');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');

test('Playground Static Files: public/index.html structure and required DOM hooks', () => {
  const htmlPath = path.join(PUBLIC_DIR, 'index.html');
  assert.equal(fs.existsSync(htmlPath), true, 'index.html must exist in public/');

  const html = fs.readFileSync(htmlPath, 'utf8');

  // Verify external stylesheet and script references
  assert.equal(html.includes('href="/style.css"'), true, 'index.html must link style.css');
  assert.equal(html.includes('src="/socket.io/socket.io.js"'), true, 'index.html must include socket.io client script');
  assert.equal(html.includes('src="/app.js"'), true, 'index.html must link app.js');

  // Verify canvas element
  assert.equal(html.includes('id="worldCanvas"'), true, 'index.html must include canvas with id="worldCanvas"');

  // Verify status HUD element IDs
  assert.equal(html.includes('id="current-zone-label"'), true, 'must have #current-zone-label');
  assert.equal(html.includes('id="coords-label"'), true, 'must have #coords-label');
  assert.equal(html.includes('id="peers-count-label"'), true, 'must have #peers-count-label');
  assert.equal(html.includes('id="ping-label"'), true, 'must have #ping-label');
  assert.equal(html.includes('id="mute-toggle-btn"'), true, 'must have #mute-toggle-btn');

  // Verify panels and banner element IDs
  assert.equal(html.includes('id="spotlight-banner"'), true, 'must have #spotlight-banner');
  assert.equal(html.includes('id="occupancy-list"'), true, 'must have #occupancy-list');
  assert.equal(html.includes('id="audible-peers-list"'), true, 'must have #audible-peers-list');
  assert.equal(html.includes('id="event-log"'), true, 'must have #event-log');
});

test('Playground Static Files: public/style.css theme styling and responsive layout rules', () => {
  const cssPath = path.join(PUBLIC_DIR, 'style.css');
  assert.equal(fs.existsSync(cssPath), true, 'style.css must exist in public/');

  const css = fs.readFileSync(cssPath, 'utf8');

  // Verify core UI classes and theme variables
  assert.equal(css.includes('#viewport-container'), true, 'style.css must define #viewport-container');
  assert.equal(css.includes('#sidebar'), true, 'style.css must define #sidebar');
  assert.equal(css.includes('.status-pill'), true, 'style.css must style .status-pill');
  assert.equal(css.includes('.ping-dot'), true, 'style.css must style .ping-dot');
  assert.equal(css.includes('.spotlight-banner'), true, 'style.css must style .spotlight-banner');
  assert.equal(css.includes('.audible-tag'), true, 'style.css must style .audible-tag');
  assert.equal(css.includes('.occluded-tag'), true, 'style.css must style .occluded-tag');
  assert.equal(css.includes('.mute-btn'), true, 'style.css must style .mute-btn');
});

test('Playground Static Files: public/app.js client engine features and socket protocol', () => {
  const jsPath = path.join(PUBLIC_DIR, 'app.js');
  assert.equal(fs.existsSync(jsPath), true, 'app.js must exist in public/');

  const js = fs.readFileSync(jsPath, 'utf8');

  // Verify 60 FPS lerp coordinate interpolation logic
  assert.equal(js.includes('requestAnimationFrame'), true, 'app.js must use requestAnimationFrame for 60 FPS loop');
  assert.equal(js.includes('peer.x +='), true, 'app.js must implement lerp smoothing on peer coordinates');

  // Verify socket event bindings
  assert.equal(js.includes("'user:join'"), true, 'app.js must emit user:join');
  assert.equal(js.includes("'player:move'"), true, 'app.js must emit player:move');
  assert.equal(js.includes("'proximity:enter'"), true, 'app.js must listen for proximity:enter');
  assert.equal(js.includes("'proximity:update'"), true, 'app.js must listen for proximity:update');
  assert.equal(js.includes("'proximity:leave'"), true, 'app.js must listen for proximity:leave');
  assert.equal(js.includes("'spotlight:speaker_entered'"), true, 'app.js must listen for spotlight:speaker_entered');
  assert.equal(js.includes("'telemetry:ping'"), true, 'app.js must emit telemetry:ping');
  assert.equal(js.includes("'telemetry:pong'"), true, 'app.js must listen for telemetry:pong');

  // Verify REST endpoints consumed by client
  assert.equal(js.includes('/api/layout/active'), true, 'app.js must fetch /api/layout/active');
  assert.equal(js.includes('/api/analytics/occupancy'), true, 'app.js must fetch /api/analytics/occupancy');
});

test('Playground API Contract: Layout API payload matches client renderer requirements', async () => {
  const layout = await defaultLayoutPersistence.getActiveLayout();

  assert.equal(typeof layout.name, 'string');
  assert.equal(typeof layout.dimensions.width, 'number');
  assert.equal(typeof layout.dimensions.height, 'number');
  assert.equal(Array.isArray(layout.zones), true);
  assert.equal(Array.isArray(layout.obstacles), true);

  // Each zone must have bounds and acoustic material properties
  for (const zone of layout.zones) {
    assert.equal(typeof zone.zoneId, 'string');
    assert.equal(typeof zone.bounds.x, 'number');
    assert.equal(typeof zone.bounds.y, 'number');
    assert.equal(typeof zone.bounds.width, 'number');
    assert.equal(typeof zone.bounds.height, 'number');
    assert.equal(typeof zone.isSoundproof, 'boolean');
  }

  // Each obstacle must have coordinates and material
  for (const obs of layout.obstacles) {
    assert.equal(typeof obs.x1, 'number');
    assert.equal(typeof obs.y1, 'number');
    assert.equal(typeof obs.x2, 'number');
    assert.equal(typeof obs.y2, 'number');
    assert.equal(typeof obs.material, 'string');
  }
});

test('Playground API Contract: Room occupancy analytics schema matches playground list widget', () => {
  const occupancy = defaultSessionAnalytics.getRoomOccupancy();
  assert.equal(typeof occupancy, 'object');

  // Check known zones
  const expectedZones = ['conf-a', 'podium', 'breakout-beta', 'quiet-lounge', 'open-office'];
  for (const z of expectedZones) {
    assert.equal(z in occupancy, true, `Zone ${z} must be present in occupancy stats`);
    assert.equal(typeof occupancy[z].count, 'number');
    assert.equal(typeof occupancy[z].capacity, 'number');
    assert.equal(typeof occupancy[z].isAtCapacity, 'boolean');
  }
});

test('Playground API Contract: Network QoS telemetry ping responder provides accurate RTT', () => {
  const clientSentTime = Date.now() - 35; // 35ms simulated latency
  const pingResult = defaultTelemetryMonitor.recordPing('playground-tester', clientSentTime);

  assert.equal(pingResult.userId, 'playground-tester');
  assert.equal(typeof pingResult.rttMs, 'number');
  assert.equal(pingResult.rttMs >= 25, true);
  assert.equal(['EXCELLENT', 'GOOD', 'DEGRADED', 'POOR'].includes(pingResult.quality), true);
});
