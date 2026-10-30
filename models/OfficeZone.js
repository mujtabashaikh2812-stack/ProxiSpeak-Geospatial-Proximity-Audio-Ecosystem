'use strict';

const mongoose = require('mongoose');
const { canvasToGeoJSON } = require('../canvasToGeo');

const OfficeZoneSchema = new mongoose.Schema(
  {
    zoneId: {
      type: String,
      required: [true, 'zoneId is required'],
      trim: true,
      unique: true,
      lowercase: true, // examples: conference-alpha, stage-podium
    },
    name: {
      type: String,
      required: [true, 'name is required'],
      trim: true,
      maxlength: [80, 'name must be at most 80 characters'],
    },
    type: {
      type: String,
      required: [true, 'type is required'],
      enum: {
        values: ['enclosed_room', 'spotlight_stage', 'open_workspace'],
        message: 'type must be one of: enclosed_room, spotlight_stage, open_workspace',
      },
    },
    isSoundproof: { type: Boolean, default: false },
    isSpotlightBroadcast: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    boundary: {
      type: {
        type: String,
        enum: ['Polygon'],
        default: 'Polygon',
      },
      coordinates: {
        type: [[[Number]]],
        validate: {
          validator(value) {
            if (!Array.isArray(value) || value.length === 0) return false; // at least one ring
            for (const ring of value) {
              if (!Array.isArray(ring) || ring.length < 4) return false; // at least four positions
              const first = ring[0];
              const last = ring[ring.length - 1];
              if (!Array.isArray(first) || first.length !== 2) return false;
              if (!Array.isArray(last) || last.length !== 2) return false;
              if (first[0] !== last[0] || first[1] !== last[1]) return false; // closed
              for (const pos of ring) {
                if (!Array.isArray(pos) || pos.length !== 2) return false;
                const [lon, lat] = pos;
                if (typeof lon !== 'number' || !Number.isFinite(lon)) return false;
                if (typeof lat !== 'number' || !Number.isFinite(lat)) return false;
                if (lon < -180 || lon > 180) return false;
                if (lat < -90 || lat > 90) return false;
              }
            }
            return true;
          },
          message(props) {
            // determine reason
            const v = props.value;
            if (!Array.isArray(v) || v.length === 0) return 'boundary.coordinates must contain at least one ring';
            for (const ring of v) {
              if (!Array.isArray(ring) || ring.length < 4) return 'each ring must have at least four positions';
              const first = ring[0];
              const last = ring[ring.length - 1];
              if (!Array.isArray(first) || first.length !== 2 || !Array.isArray(last) || last.length !== 2) {
                return 'each position must be a [longitude, latitude] pair';
              }
              if (first[0] !== last[0] || first[1] !== last[1]) return 'ring must be closed (first and last position identical)';
              for (const pos of ring) {
                if (!Array.isArray(pos) || pos.length !== 2) return 'each position must be a [longitude, latitude] pair';
                const [lon, lat] = pos;
                if (typeof lon !== 'number' || !Number.isFinite(lon) || typeof lat !== 'number' || !Number.isFinite(lat)) {
                  return 'all coordinates must be finite numbers';
                }
                if (lon < -180 || lon > 180) return 'longitude must be between -180 and 180';
                if (lat < -90 || lat > 90) return 'latitude must be between -90 and 90';
              }
            }
            return 'invalid boundary.coordinates';
          },
        },
      },
    },
    // holds raw canvas pixels for audit and containment checks; never indexed
    canvasBoundary: {
      type: [[[Number]]],
    },
  },
  { strict: true, timestamps: true }
);

OfficeZoneSchema.index({ boundary: '2dsphere' });

function pointInPolygon(px, py, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    const intersect = ((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function zoneContainsCanvasPoint(zone, x, y) {
  const point = canvasToGeoJSON(x, y);
  const coords = zone && zone.boundary && zone.boundary.coordinates;
  if (!Array.isArray(coords) || coords.length === 0) return false;
  const outer = coords[0];
  if (!pointInPolygon(point[0], point[1], outer)) return false;
  for (let i = 1; i < coords.length; i++) {
    if (pointInPolygon(point[0], point[1], coords[i])) return false; // hole
  }
  return true;
}

const OfficeZone = mongoose.model('OfficeZone', OfficeZoneSchema);

module.exports = { OfficeZone, zoneContainsCanvasPoint };
module.exports.OfficeZone = OfficeZone;
module.exports.default = OfficeZone;
