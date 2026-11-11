'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  ReleaseCoordinator,
  defaultReleaseCoordinator,
  RELEASE_METADATA,
} = require('../services/releaseCoordinator');

test('evaluateReleaseReadiness: certifies 20-day streak compliance and production readiness', async () => {
  const coordinator = new ReleaseCoordinator();
  const report = await coordinator.evaluateReleaseReadiness();

  assert.equal(report.readinessStatus, 'PRODUCTION_READY');
  assert.equal(report.overallHealth, 'OPTIMAL');

  // Verify 20-day streak audit
  assert.equal(report.streakAudit.totalDaysLogged, 20);
  assert.equal(report.streakAudit.stipendEligibility, 'QUALIFIED');
  assert.equal(report.streakAudit.complianceRate, '100%');

  // Verify release metadata
  assert.equal(report.release.version, '1.0.0');
  assert.equal(report.release.lead, 'Mujtaba Shaikh');
  assert.equal(report.release.releaseDate, '2026-11-11');

  // Verify subsystems
  assert.equal(report.systemScorecard.totalSubsystems, 15);
  assert.equal(report.systemScorecard.verifiedSubsystems, 15);
  assert.equal(report.systemScorecard.testPassRate, '100%');

  // Verify cross-pod deliverables
  assert.equal(typeof report.podContributions.leadMujtaba, 'string');
  assert.equal(typeof report.podContributions.devSantosh, 'string');
  assert.equal(typeof report.podContributions.devAkhila, 'string');
  assert.equal(typeof report.podContributions.devKuldeep, 'string');

  // Verify monitoring and observability endpoints
  assert.equal(report.monitoring.prometheusScraper, '/metrics');
  assert.equal(report.monitoring.telemetryJson, '/api/metrics/json');
  assert.equal(report.monitoring.healthAudit, '/api/system/health-audit');
});

test('defaultReleaseCoordinator singleton is operational', async () => {
  const report = await defaultReleaseCoordinator.evaluateReleaseReadiness();
  assert.equal(report.readinessStatus, 'PRODUCTION_READY');
  assert.equal(report.release.version, '1.0.0');
});
