'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  IntegrationHarness,
  defaultIntegrationHarness,
} = require('../services/integrationHarness');

test('IntegrationHarness: runFullSystemAudit executes all 8 subsystem checks with 100% pass rate', async () => {
  const harness = new IntegrationHarness();
  const scorecard = await harness.runFullSystemAudit();

  assert.equal(scorecard.overallStatus, 'HEALTHY');
  assert.equal(scorecard.totalChecks, 8);
  assert.equal(scorecard.passedChecks, 8);
  assert.equal(scorecard.passRatePercentage, 100);
  assert.equal(scorecard.checks.length, 8);

  for (const check of scorecard.checks) {
    assert.equal(check.status, 'PASS', `Check "${check.name}" should pass`);
    assert.equal(typeof check.latencyMs, 'number');
    assert.equal(typeof check.details, 'string');
  }

  assert.notEqual(scorecard.podCoverage, null);
  assert.equal(scorecard.podCoverage.crossPodContract, 'Fully verified and aligned across Week 1–3 milestones');
});

test('IntegrationHarness: auditSpatialProximity verifies Euclidean distance and earshot thresholds', () => {
  const harness = new IntegrationHarness();
  const check = harness.auditSpatialProximity();

  assert.equal(check.status, 'PASS');
  assert.equal(typeof check.latencyMs, 'number');
});

test('IntegrationHarness: auditAcousticZones verifies soundproofing and Town Hall stage broadcast', () => {
  const harness = new IntegrationHarness();
  const check = harness.auditAcousticZones();

  assert.equal(check.status, 'PASS');
  assert.equal(check.details.includes('Conference Room Alpha soundproofing'), true);
});

test('IntegrationHarness: auditRaycastOcclusion verifies line-segment intersections and dampening', () => {
  const harness = new IntegrationHarness();
  const check = harness.auditRaycastOcclusion();

  assert.equal(check.status, 'PASS');
  assert.equal(check.details.includes('raycasting'), true);
});

test('IntegrationHarness: auditMeshCapping verifies dynamic WebRTC capping at maxMeshCap', () => {
  const harness = new IntegrationHarness();
  const check = harness.auditMeshCapping();

  assert.equal(check.status, 'PASS');
  assert.equal(check.details.includes('mesh connection capping enforced'), true);
});

test('IntegrationHarness: auditSpatialCache verifies TTL cache and displacement invalidation', () => {
  const harness = new IntegrationHarness();
  const check = harness.auditSpatialCache();

  assert.equal(check.status, 'PASS');
  assert.equal(check.details.includes('In-memory spatial cache'), true);
});

test('IntegrationHarness: auditThrottleEngine verifies 30Hz rate limiting and delta suppression', () => {
  const harness = new IntegrationHarness();
  const check = harness.auditThrottleEngine();

  assert.equal(check.status, 'PASS');
  assert.equal(check.details.includes('30Hz rate-limiting'), true);
});

test('IntegrationHarness: auditRedisResilience verifies fallback zero-downtime guarantee', async () => {
  const harness = new IntegrationHarness();
  const check = await harness.auditRedisResilience();

  assert.equal(check.status, 'PASS');
  assert.equal(check.details.includes('zero-downtime fallback'), true);
});

test('IntegrationHarness: auditEndToEndUserJourney simulates full avatar lifecycle transitions', () => {
  const harness = new IntegrationHarness();
  const check = harness.auditEndToEndUserJourney();

  assert.equal(check.status, 'PASS');
  assert.equal(check.details.includes('Full avatar lifecycle'), true);
});

test('IntegrationHarness: audit history records successive runs and limits history length', async () => {
  const harness = new IntegrationHarness();
  assert.equal(harness.auditHistory.length, 0);

  await harness.runFullSystemAudit();
  assert.equal(harness.auditHistory.length, 1);

  await harness.runFullSystemAudit();
  assert.equal(harness.auditHistory.length, 2);
  assert.equal(harness.auditHistory[0].status, 'HEALTHY');
});
