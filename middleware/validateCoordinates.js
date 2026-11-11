'use strict';

// MAX_CANVAS_COORD in canvasToGeo.js is 100000 and is the absolute sanity ceiling.
// OFFICE_MAX_X/OFFICE_MAX_Y below are the actual playable room bounds.
// Clamping happens against the room, not the ceiling.

const OFFICE_MIN_COORD = 0;
const OFFICE_MAX_X = 1200;
const OFFICE_MAX_Y = 800;

function isCleanNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'string') {
    if (value.trim() === '') return false;
    const n = Number(value);
    return Number.isFinite(n) && String(n) === value.trim(); // reject '12abc'
  }
  return false;
}

function toNumber(value) {
  if (typeof value === 'number') return value;
  return Number(value);
}

function validateCanvasCoordinate(value, axis) {
  const label = axis === 'y' ? 'canvasY' : 'canvasX';
  if (!isCleanNumber(value)) {
    return { ok: false, value: null, error: label + ' must be a finite number', clamped: false };
  }
  const num = toNumber(value);
  const max = axis === 'y' ? OFFICE_MAX_Y : OFFICE_MAX_X;
  let clamped = false;
  let out = num;
  if (num < OFFICE_MIN_COORD) { out = OFFICE_MIN_COORD; clamped = true; }
  if (num > max) { out = max; clamped = true; }
  return { ok: true, value: out, error: null, clamped };
}

function validateCanvasPoint(canvasX, canvasY) {
  const xRes = validateCanvasCoordinate(canvasX, 'x');
  const yRes = validateCanvasCoordinate(canvasY, 'y');
  const errors = [];
  if (!xRes.ok) errors.push(xRes.error);
  if (!yRes.ok) errors.push(yRes.error);
  return {
    ok: errors.length === 0,
    canvasX: xRes.ok ? xRes.value : null,
    canvasY: yRes.ok ? yRes.value : null,
    clamped: (xRes.clamped || yRes.clamped) || false,
    errors,
  };
}

function sanitizeGeoJSONPoint(point) {
  if (!point || typeof point !== 'object' || Array.isArray(point)) {
    return { ok: false, point: null, error: 'point must be an object' };
  }
  if (point.type !== 'Point') {
    return { ok: false, point: null, error: 'type must be "Point"' };
  }
  if (!Array.isArray(point.coordinates) || point.coordinates.length !== 2) {
    return { ok: false, point: null, error: 'coordinates must be an array of two numbers' };
  }
  const [lon, lat] = point.coordinates;
  if (typeof lon !== 'number' || !Number.isFinite(lon) || typeof lat !== 'number' || !Number.isFinite(lat)) {
    return { ok: false, point: null, error: 'coordinates must be finite numbers' };
  }
  if (lon < -180 || lon > 180) {
    return { ok: false, point: null, error: 'longitude must be between -180 and 180' };
  }
  if (lat < -90 || lat > 90) {
    return { ok: false, point: null, error: 'latitude must be between -90 and 90' };
  }
  if (Math.abs(lon) > 180) {
    return { ok: false, point: null, error: 'longitude magnitude exceeds 180, coordinates may be swapped' };
  }
  return { ok: true, point, error: null };
}

function validateRadiusPixels(radiusPixels, options) {
  const opts = options || {};
  const max = (typeof opts.max === 'number' && Number.isFinite(opts.max)) ? opts.max : 100;
  if (!isCleanNumber(radiusPixels)) {
    return { ok: false, value: null, clamped: false, error: 'radiusPixels must be a finite number' };
  }
  const num = toNumber(radiusPixels);
  if (num < 0) {
    return { ok: false, value: null, clamped: false, error: 'radiusPixels must be nonnegative' };
  }
  let clamped = false;
  let out = num;
  if (num > max) { out = max; clamped = true; }
  return { ok: true, value: out, clamped, error: null };
}

function validateNearbyRequest(request) {
  const req = request || {};
  const src = req.query || req.body || req;
  const errors = [];
  let userId = src.userId;
  if (typeof userId !== 'string' || userId.trim() === '') {
    errors.push('userId must be a non-blank string');
    userId = null;
  } else {
    userId = userId.trim();
  }
  const xRes = validateCanvasCoordinate(src.canvasX, 'x');
  const yRes = validateCanvasCoordinate(src.canvasY, 'y');
  if (!xRes.ok) errors.push(xRes.error);
  if (!yRes.ok) errors.push(yRes.error);
  const rRes = validateRadiusPixels(src.radiusPixels === undefined ? 100 : src.radiusPixels, { max: src.maxRadius });
  if (!rRes.ok) errors.push(rRes.error);

  return {
    ok: errors.length === 0,
    userId: userId,
    canvasX: xRes.ok ? xRes.value : null,
    canvasY: yRes.ok ? yRes.value : null,
    radiusPixels: rRes.ok ? rRes.value : null,
    errors,
  };
}

function asMiddleware(handler) {
  return function (req, res) {
    const result = validateNearbyRequest(req || {});
    if (!result.ok) {
      if (res && typeof res.status === 'function') {
        res.status(400).json({ errors: result.errors });
      }
      return { status: 400, body: { errors: result.errors } };
    }
    if (typeof handler === 'function') {
      return handler(result, req, res);
    }
    return result;
  };
}

module.exports = {
  OFFICE_MIN_COORD,
  OFFICE_MAX_X,
  OFFICE_MAX_Y,
  validateCanvasCoordinate,
  validateCanvasPoint,
  sanitizeGeoJSONPoint,
  validateRadiusPixels,
  validateNearbyRequest,
  asMiddleware,
};
