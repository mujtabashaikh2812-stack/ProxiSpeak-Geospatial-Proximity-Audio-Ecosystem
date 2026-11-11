'use strict';

const mongoose = require('mongoose');
const { OfficeZone, zoneContainsCanvasPoint } = require('../models/OfficeZone');
const { canvasToGeoJSON, canvasRingToGeoRing, MAX_CANVAS_COORD, isFiniteNumber } = require('../canvasToGeo');

const ZONE_TYPES = ['enclosed_room', 'spotlight_stage', 'open_workspace'];

function isFiniteCanvasCoord(value) {
  return isFiniteNumber(value) && Math.abs(value) <= MAX_CANVAS_COORD;
}

async function listZones(options) {
  const q = options || {};
  const filter = {};

  if (q.type !== undefined && q.type !== null && q.type !== '') {
    if (!ZONE_TYPES.includes(q.type)) {
      return { status: 400, body: { error: 'invalid type: must be one of enclosed_room, spotlight_stage, open_workspace' } };
    }
    filter.type = q.type;
  }

  for (const field of ['isSoundproof', 'isActive']) {
    if (q[field] !== undefined && q[field] !== null && q[field] !== '') {
      if (q[field] !== 'true' && q[field] !== 'false') {
        return { status: 400, body: { error: 'invalid ' + field + ': must be the string "true" or "false"' } };
      }
      filter[field] = q[field] === 'true';
    }
  }

  const hasX = q.containsX !== undefined && q.containsX !== null && q.containsX !== '';
  const hasY = q.containsY !== undefined && q.containsY !== null && q.containsY !== '';
  if (hasX !== hasY) {
    const missing = hasX ? 'containsY' : 'containsX';
    return { status: 400, body: { error: 'missing ' + missing + ': containsX and containsY must both be provided' } };
  }
  if (hasX) {
    if (!isFiniteNumber(q.containsX)) {
      return { status: 400, body: { error: 'invalid containsX: must be a finite number' } };
    }
    if (!isFiniteNumber(q.containsY)) {
      return { status: 400, body: { error: 'invalid containsY: must be a finite number' } };
    }
    if (Math.abs(q.containsX) > MAX_CANVAS_COORD) {
      return { status: 400, body: { error: 'invalid containsX: out of canvas extent' } };
    }
    if (Math.abs(q.containsY) > MAX_CANVAS_COORD) {
      return { status: 400, body: { error: 'invalid containsY: out of canvas extent' } };
    }
    const point = canvasToGeoJSON(q.containsX, q.containsY);
    filter.boundary = { $geoIntersects: { $geometry: { type: 'Point', coordinates: point } } };
  }

  const zones = await OfficeZone.find(filter).sort({ zoneId: 1 }).lean();
  return { status: 200, body: { count: zones.length, zones } };
}

async function createZone(payload) {
  const data = payload || {};
  try {
    if (typeof data.zoneId === 'string' && data.zoneId.trim() === '') {
      return { status: 400, body: { error: 'zoneId must be a non-blank string' } };
    }
    if (typeof data.name === 'string' && data.name.trim() === '') {
      return { status: 400, body: { error: 'name must be a non-blank string' } };
    }

    const doc = {};
    if (data.zoneId !== undefined) doc.zoneId = data.zoneId;
    if (data.name !== undefined) doc.name = data.name;
    if (data.type !== undefined) doc.type = data.type;
    if (data.isSoundproof !== undefined) doc.isSoundproof = data.isSoundproof;
    if (data.isSpotlightBroadcast !== undefined) doc.isSpotlightBroadcast = data.isSpotlightBroadcast;
    if (data.isActive !== undefined) doc.isActive = data.isActive;

    if (data.canvasBoundary !== undefined) {
      const geoRing = canvasRingToGeoRing(data.canvasBoundary);
      doc.boundary = { type: 'Polygon', coordinates: geoRing };
      doc.canvasBoundary = data.canvasBoundary;
    } else if (data.boundary !== undefined) {
      doc.boundary = data.boundary;
    }

    const zone = await OfficeZone.create(doc);
    return { status: 201, body: { zone: zone.toObject ? zone.toObject() : zone } };
  } catch (err) {
    if (err && err.code === 11000) {
      return { status: 409, body: { error: 'duplicate zoneId' } };
    }
    if (err && err.name === 'ValidationError') {
      const errors = {};
      for (const key of Object.keys(err.errors || {})) {
        errors[key] = err.errors[key].message;
      }
      return { status: 400, body: { error: errors } };
    }
    if (err instanceof Error) {
      return { status: 400, body: { error: err.message } };
    }
    return { status: 400, body: { error: String(err) } };
  }
}

// Two-step polygon query: $geoIntersects on the 2dsphere index pre-filters candidates
// in degrees on the projected plane, then zoneContainsCanvasPoint confirms each
// candidate in canvas pixels so the final answer is decided in pixels.
async function findZonesContainingCanvasPoint(canvasX, canvasY) {
  if (!isFiniteNumber(canvasX) || !isFiniteNumber(canvasY)) {
    return { status: 400, body: { error: 'canvasX and canvasY must be finite numbers' } };
  }
  if (Math.abs(canvasX) > MAX_CANVAS_COORD || Math.abs(canvasY) > MAX_CANVAS_COORD) {
    return { status: 400, body: { error: 'canvasX and canvasY must be within canvas extent' } };
  }

  const point = canvasToGeoJSON(canvasX, canvasY);
  const candidates = await OfficeZone.find({
    boundary: { $geoIntersects: { $geometry: { type: 'Point', coordinates: point } } },
  }).lean();

  const zones = candidates.filter((z) => zoneContainsCanvasPoint(z, canvasX, canvasY));
  return { status: 200, body: { count: zones.length, zones } };
}

function registerZoneRoutes(app, basePath) {
  if (!app || typeof app.get !== 'function' || typeof app.post !== 'function') {
    throw new Error('registerZoneRoutes requires an Express-like app with get and post methods');
  }
  const base = basePath || '/api/db/zones';
  app.get(base, async (req, res) => {
    const result = await listZones(req && req.query);
    if (res && typeof res.status === 'function') {
      res.status(result.status).json(result.body);
    }
    return result;
  });
  app.post(base, async (req, res) => {
    const result = await createZone(req && req.body);
    if (res && typeof res.status === 'function') {
      res.status(result.status).json(result.body);
    }
    return result;
  });
}

module.exports = {
  listZones,
  createZone,
  findZonesContainingCanvasPoint,
  registerZoneRoutes,
};
