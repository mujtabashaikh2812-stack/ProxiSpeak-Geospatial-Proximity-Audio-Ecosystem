'use strict';

const mongoose = require('mongoose');

/**
 * Mongoose Schema for Persistent 2D Virtual Office Layouts
 * 
 * Defines the geometric boundaries, acoustic properties, furniture placements,
 * and sound-blocking obstacle definitions for ProxiSpeak virtual spaces.
 */

const ZoneSubSchema = new mongoose.Schema(
  {
    zoneId: {
      type: String,
      required: [true, 'zoneId is required'],
      trim: true,
      lowercase: true,
    },
    name: {
      type: String,
      required: [true, 'Zone name is required'],
      trim: true,
      maxlength: [80, 'Zone name cannot exceed 80 characters'],
    },
    type: {
      type: String,
      required: [true, 'Zone type is required'],
      enum: {
        values: ['enclosed_room', 'spotlight_stage', 'open_workspace', 'quiet_lounge', 'breakout_pod'],
        message: 'Invalid zone type: {VALUE}',
      },
      default: 'open_workspace',
    },
    bounds: {
      x: { type: Number, required: true },
      y: { type: Number, required: true },
      width: { type: Number, required: true, min: [1, 'Width must be positive'] },
      height: { type: Number, required: true, min: [1, 'Height must be positive'] },
    },
    isSoundproof: { type: Boolean, default: false },
    isSpotlightBroadcast: { type: Boolean, default: false },
    theme: {
      fill: { type: String, default: 'rgba(224, 242, 254, 0.65)' },
      border: { type: String, default: '#0284c7' },
      labelColor: { type: String, default: '#0369a1' },
    },
    description: { type: String, default: '' },
  },
  { _id: false }
);

const ObstacleSubSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      required: [true, 'Obstacle id is required'],
      trim: true,
    },
    name: {
      type: String,
      required: [true, 'Obstacle name is required'],
      trim: true,
    },
    x1: { type: Number, required: true },
    y1: { type: Number, required: true },
    x2: { type: Number, required: true },
    y2: { type: Number, required: true },
    material: {
      type: String,
      required: [true, 'Material is required'],
      enum: {
        values: ['glass', 'drywall', 'acoustic_foam', 'concrete'],
        message: 'Invalid obstacle material: {VALUE}',
      },
      default: 'drywall',
    },
    dampeningFactor: {
      type: Number,
      min: 0,
      max: 1,
    },
    cutoffFrequencyHz: {
      type: Number,
      min: 20,
      max: 20000,
    },
  },
  { _id: false }
);

const FurnitureSubSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    type: {
      type: String,
      enum: ['desk', 'pod', 'table', 'chair', 'whiteboard', 'plant', 'podium', 'screen', 'sofa'],
      default: 'desk',
    },
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    width: { type: Number, default: 40, min: 1 },
    height: { type: Number, default: 40, min: 1 },
    rotation: { type: Number, default: 0 },
  },
  { _id: false }
);

const OfficeLayoutSchema = new mongoose.Schema(
  {
    layoutId: {
      type: String,
      required: [true, 'layoutId is required'],
      unique: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Layout name is required'],
      trim: true,
      maxlength: [100, 'Layout name cannot exceed 100 characters'],
    },
    description: { type: String, default: '' },
    version: { type: Number, default: 1, min: 1 },
    isDefault: { type: Boolean, default: false, index: true },
    dimensions: {
      width: { type: Number, default: 1200, min: [200, 'Canvas width must be at least 200px'] },
      height: { type: Number, default: 800, min: [200, 'Canvas height must be at least 200px'] },
    },
    zones: [ZoneSubSchema],
    obstacles: [ObstacleSubSchema],
    furniture: [FurnitureSubSchema],
    metadata: {
      author: { type: String, default: 'system' },
      lastModifiedBy: { type: String, default: 'lead-mujtaba' },
      tags: [{ type: String, trim: true }],
    },
  },
  {
    timestamps: true,
    strict: true,
  }
);

/**
 * Validates layout data geometry and required attributes
 * @param {object} data - Layout configuration object
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateLayoutData(data) {
  const errors = [];

  if (!data || typeof data !== 'object') {
    return { valid: false, errors: ['Layout data must be a non-null object'] };
  }

  if (!data.layoutId || typeof data.layoutId !== 'string' || !data.layoutId.trim()) {
    errors.push('layoutId is required and must be a non-empty string');
  }

  if (!data.name || typeof data.name !== 'string' || !data.name.trim()) {
    errors.push('name is required and must be a non-empty string');
  }

  if (data.dimensions) {
    if (typeof data.dimensions.width !== 'number' || data.dimensions.width < 200) {
      errors.push('dimensions.width must be a number >= 200');
    }
    if (typeof data.dimensions.height !== 'number' || data.dimensions.height < 200) {
      errors.push('dimensions.height must be a number >= 200');
    }
  }

  if (data.zones) {
    if (!Array.isArray(data.zones)) {
      errors.push('zones must be an array');
    } else {
      data.zones.forEach((zone, idx) => {
        if (!zone.zoneId) errors.push(`zones[${idx}].zoneId is required`);
        if (!zone.name) errors.push(`zones[${idx}].name is required`);
        if (!zone.bounds || typeof zone.bounds !== 'object') {
          errors.push(`zones[${idx}].bounds must be an object with {x, y, width, height}`);
        } else {
          const { x, y, width, height } = zone.bounds;
          if (typeof x !== 'number' || typeof y !== 'number') {
            errors.push(`zones[${idx}].bounds x and y must be numbers`);
          }
          if (typeof width !== 'number' || width <= 0 || typeof height !== 'number' || height <= 0) {
            errors.push(`zones[${idx}].bounds width and height must be positive numbers`);
          }
        }
      });
    }
  }

  if (data.obstacles) {
    if (!Array.isArray(data.obstacles)) {
      errors.push('obstacles must be an array');
    } else {
      const allowedMaterials = ['glass', 'drywall', 'acoustic_foam', 'concrete'];
      data.obstacles.forEach((obs, idx) => {
        if (!obs.id) errors.push(`obstacles[${idx}].id is required`);
        if (!obs.material || !allowedMaterials.includes(obs.material)) {
          errors.push(`obstacles[${idx}].material must be one of: ${allowedMaterials.join(', ')}`);
        }
        for (const coord of ['x1', 'y1', 'x2', 'y2']) {
          if (typeof obs[coord] !== 'number' || !Number.isFinite(obs[coord])) {
            errors.push(`obstacles[${idx}].${coord} must be a finite number`);
          }
        }
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Resilient In-Memory Office Layout Store
 * 
 * Provides an identical CRUD interface to Mongoose models, enabling seamless
 * zero-crash operations in offline test environments, single-node containers,
 * or when MongoDB is unreachable.
 */
class InMemoryOfficeLayoutStore {
  constructor() {
    this.layouts = new Map();
  }

  _clone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  async find(filter = {}) {
    let results = Array.from(this.layouts.values());
    if (filter.isDefault !== undefined) {
      results = results.filter((l) => l.isDefault === filter.isDefault);
    }
    return results.map((r) => this._clone(r));
  }

  async findOne(filter = {}) {
    const list = Array.from(this.layouts.values());
    if (filter.layoutId) {
      const match = list.find((l) => l.layoutId === filter.layoutId.toLowerCase());
      return match ? this._clone(match) : null;
    }
    if (filter.isDefault) {
      const match = list.find((l) => l.isDefault === true);
      return match ? this._clone(match) : null;
    }
    return list[0] ? this._clone(list[0]) : null;
  }

  async create(data) {
    const validation = validateLayoutData(data);
    if (!validation.valid) {
      throw new Error(`Validation Error: ${validation.errors.join('; ')}`);
    }

    const doc = {
      layoutId: data.layoutId.toLowerCase().trim(),
      name: data.name.trim(),
      description: data.description || '',
      version: data.version || 1,
      isDefault: Boolean(data.isDefault),
      dimensions: {
        width: data.dimensions?.width || 1200,
        height: data.dimensions?.height || 800,
      },
      zones: data.zones ? this._clone(data.zones) : [],
      obstacles: data.obstacles ? this._clone(data.obstacles) : [],
      furniture: data.furniture ? this._clone(data.furniture) : [],
      metadata: {
        author: data.metadata?.author || 'system',
        lastModifiedBy: data.metadata?.lastModifiedBy || 'lead-mujtaba',
        tags: data.metadata?.tags || [],
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.layouts.set(doc.layoutId, doc);
    return this._clone(doc);
  }

  async findOneAndUpdate(filter, update, options = {}) {
    const doc = await this.findOne(filter);
    if (!doc && options.upsert) {
      const createData = { ...filter, ...(update.$set || update) };
      return this.create(createData);
    }
    if (!doc) return null;

    const updated = {
      ...doc,
      ...(update.$set || update),
      updatedAt: new Date(),
    };

    if (update.$inc && update.$inc.version) {
      updated.version = (updated.version || 1) + update.$inc.version;
    }

    const validation = validateLayoutData(updated);
    if (!validation.valid) {
      throw new Error(`Validation Error: ${validation.errors.join('; ')}`);
    }

    this.layouts.set(doc.layoutId, updated);
    return this._clone(updated);
  }

  async deleteOne(filter = {}) {
    if (filter.layoutId) {
      const deleted = this.layouts.delete(filter.layoutId.toLowerCase());
      return { deletedCount: deleted ? 1 : 0 };
    }
    return { deletedCount: 0 };
  }

  async countDocuments() {
    return this.layouts.size;
  }

  clear() {
    this.layouts.clear();
  }
}

// Compile Mongoose Model safely
let OfficeLayoutModel;
try {
  OfficeLayoutModel = mongoose.models.OfficeLayout || mongoose.model('OfficeLayout', OfficeLayoutSchema);
} catch {
  OfficeLayoutModel = null;
}

module.exports = {
  OfficeLayout: OfficeLayoutModel,
  OfficeLayoutSchema,
  InMemoryOfficeLayoutStore,
  validateLayoutData,
};
