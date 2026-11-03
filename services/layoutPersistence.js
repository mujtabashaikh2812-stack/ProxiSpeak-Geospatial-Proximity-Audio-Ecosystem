'use strict';

const mongoose = require('mongoose');
const {
  OfficeLayout,
  InMemoryOfficeLayoutStore,
  validateLayoutData,
} = require('../models/OfficeLayout');
const { updateOfficeZones, resetOfficeZones } = require('./zoneManager');
const { defaultOcclusionEngine } = require('./occlusionEngine');

/**
 * Default Virtual Office Layout Specification
 * Aligns perfectly with Akhila's 2D canvas client, acoustic zone manager,
 * and physics-aware raycasting wall occlusion engine.
 */
const DEFAULT_OFFICE_LAYOUT = {
  layoutId: 'default-office',
  name: 'ProxiSpeak Corporate HQ Floorplan',
  description: 'Primary corporate office space with executive conference room, keynote stage, engineering pod, quiet lounge, and acoustic partitions.',
  version: 1,
  isDefault: true,
  dimensions: {
    width: 1200,
    height: 800,
  },
  zones: [
    {
      zoneId: 'conf-a',
      name: 'Conference Room Alpha',
      type: 'enclosed_room',
      bounds: { x: 60, y: 60, width: 280, height: 220 },
      theme: {
        fill: 'rgba(224, 242, 254, 0.65)',
        border: '#0284c7',
        labelColor: '#0369a1',
      },
      description: 'Enclosed meeting room. Sound is contained within walls.',
      isSoundproof: true,
      isSpotlightBroadcast: false,
    },
    {
      zoneId: 'podium',
      name: 'Town Hall Stage & Podium',
      type: 'spotlight_stage',
      bounds: { x: 520, y: 80, width: 140, height: 110 },
      theme: {
        fill: 'rgba(254, 240, 138, 0.75)',
        border: '#ca8a04',
        labelColor: '#854d0e',
      },
      description: 'Broadcast stage. Stepping on the podium amplifies audio to all users in the office.',
      isSoundproof: false,
      isSpotlightBroadcast: true,
    },
    {
      zoneId: 'breakout-beta',
      name: 'Engineering Breakout Pod',
      type: 'breakout_pod',
      bounds: { x: 800, y: 120, width: 220, height: 180 },
      theme: {
        fill: 'rgba(240, 253, 244, 0.65)',
        border: '#16a34a',
        labelColor: '#15803d',
      },
      description: 'Semi-private engineering pod with acoustic baffles.',
      isSoundproof: false,
      isSpotlightBroadcast: false,
    },
    {
      zoneId: 'quiet-lounge',
      name: 'Acoustic Quiet Lounge',
      type: 'quiet_lounge',
      bounds: { x: 100, y: 460, width: 240, height: 200 },
      theme: {
        fill: 'rgba(250, 245, 255, 0.65)',
        border: '#9333ea',
        labelColor: '#7e22ce',
      },
      description: 'Sound-dampened quiet study and focus room.',
      isSoundproof: true,
      isSpotlightBroadcast: false,
    },
  ],
  obstacles: [
    {
      id: 'wall-hallway-glass',
      name: 'Conference Room Hallway Glass Divider',
      x1: 340,
      y1: 60,
      x2: 340,
      y2: 280,
      material: 'glass',
    },
    {
      id: 'wall-desk-baffle',
      name: 'Executive Desk Privacy Divider',
      x1: 200,
      y1: 300,
      x2: 200,
      y2: 380,
      material: 'drywall',
    },
    {
      id: 'wall-pod-divider',
      name: 'Team Pod Acoustic Screen',
      x1: 580,
      y1: 340,
      x2: 580,
      y2: 450,
      material: 'acoustic_foam',
    },
    {
      id: 'pillar-center',
      name: 'Central Concrete Pillar Face',
      x1: 500,
      y1: 220,
      x2: 500,
      y2: 260,
      material: 'concrete',
    },
    {
      id: 'wall-breakout-west',
      name: 'Breakout Pod Glass Partition',
      x1: 800,
      y1: 120,
      x2: 800,
      y2: 300,
      material: 'glass',
    },
    {
      id: 'wall-lounge-north',
      name: 'Quiet Lounge Sound Barrier',
      x1: 100,
      y1: 460,
      x2: 340,
      y2: 460,
      material: 'drywall',
    },
  ],
  furniture: [
    { id: 'desk-lead-mujtaba', name: 'Lead Dev Station (Mujtaba)', type: 'desk', x: 420, y: 360, width: 60, height: 35, rotation: 0 },
    { id: 'desk-dev-kuldeep', name: 'Spatial DB Station (Kuldeep)', type: 'desk', x: 500, y: 360, width: 60, height: 35, rotation: 0 },
    { id: 'desk-dev-santosh', name: 'WebRTC Audio Station (Santosh)', type: 'desk', x: 420, y: 440, width: 60, height: 35, rotation: 0 },
    { id: 'desk-dev-akhila', name: '2D Canvas Station (Akhila)', type: 'desk', x: 500, y: 440, width: 60, height: 35, rotation: 0 },
    { id: 'conf-table-alpha', name: 'Executive Oval Conference Table', type: 'table', x: 120, y: 120, width: 160, height: 80, rotation: 0 },
    { id: 'stage-podium-mic', name: 'Keynote Speaker Podium & Mic', type: 'podium', x: 570, y: 110, width: 40, height: 40, rotation: 0 },
    { id: 'lounge-sofa', name: 'Modular Acoustic Lounge Sofa', type: 'sofa', x: 140, y: 520, width: 120, height: 50, rotation: 0 },
    { id: 'plant-entrance', name: 'Ficus Tree Planter', type: 'plant', x: 370, y: 70, width: 30, height: 30, rotation: 0 },
  ],
  metadata: {
    author: 'Infotact Group 3 Lead',
    lastModifiedBy: 'lead-mujtaba',
    tags: ['production', 'hq', 'spatial-audio', 'multi-zone'],
  },
};

/**
 * LayoutPersistenceService
 * 
 * Manages persistent office layout configuration, MongoDB Mongoose synchronization,
 * in-memory fallback operations, and dynamic real-time engine boundary updates.
 */
class LayoutPersistenceService {
  constructor(options = {}) {
    this.memoryStore = options.store || new InMemoryOfficeLayoutStore();
    this.activeLayout = null;
    this.lastSyncedAt = null;
    this.isMongooseActive = Boolean(
      options.forceMongoose !== undefined
        ? options.forceMongoose
        : mongoose.connection && mongoose.connection.readyState === 1 && OfficeLayout
    );

    // Initial synchrony
    this._initDefaultSynchronous();
  }

  _clone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  _initDefaultSynchronous() {
    this.activeLayout = this._clone(DEFAULT_OFFICE_LAYOUT);
    this.syncWithEngines(this.activeLayout);
  }

  /**
   * Initializes persistent storage: loads active layout or seeds default layout
   */
  async init() {
    try {
      let layout = null;
      if (this.isMongooseActive && OfficeLayout) {
        layout = await OfficeLayout.findOne({ isDefault: true }).lean().exec();
        if (!layout) {
          layout = await OfficeLayout.create(DEFAULT_OFFICE_LAYOUT);
          layout = layout.toObject();
        }
      } else {
        layout = await this.memoryStore.findOne({ isDefault: true });
        if (!layout) {
          layout = await this.memoryStore.create(DEFAULT_OFFICE_LAYOUT);
        }
      }

      this.activeLayout = this._clone(layout);
      this.syncWithEngines(this.activeLayout);
      return this.activeLayout;
    } catch (err) {
      console.warn(`[LayoutPersistence] Storage init fallback triggered: ${err.message}`);
      this._initDefaultSynchronous();
      return this.activeLayout;
    }
  }

  /**
   * Returns current active layout
   */
  getActiveLayout() {
    if (!this.activeLayout) {
      this._initDefaultSynchronous();
    }
    return this._clone(this.activeLayout);
  }

  /**
   * Persists a new or updated layout and synchronizes live engines
   * @param {object} layoutData - Floorplan configuration object
   * @returns {Promise<object>} Saved layout
   */
  async saveLayout(layoutData) {
    const validation = validateLayoutData(layoutData);
    if (!validation.valid) {
      throw new Error(`Invalid layout data: ${validation.errors.join('; ')}`);
    }

    const payload = this._clone(layoutData);
    payload.layoutId = payload.layoutId.toLowerCase().trim();
    payload.version = (payload.version || 1) + 1;
    payload.updatedAt = new Date();

    let saved = null;
    if (this.isMongooseActive && OfficeLayout) {
      saved = await OfficeLayout.findOneAndUpdate(
        { layoutId: payload.layoutId },
        { $set: payload },
        { upsert: true, new: true, runValidators: true }
      ).lean().exec();
    } else {
      saved = await this.memoryStore.findOneAndUpdate(
        { layoutId: payload.layoutId },
        payload,
        { upsert: true }
      );
    }

    this.activeLayout = this._clone(saved);
    this.syncWithEngines(this.activeLayout);
    return this.activeLayout;
  }

  /**
   * Restores active office layout back to factory default preset
   */
  async resetToDefaultLayout() {
    const defaultData = this._clone(DEFAULT_OFFICE_LAYOUT);
    defaultData.version = (this.activeLayout ? this.activeLayout.version : 1) + 1;

    let saved = null;
    if (this.isMongooseActive && OfficeLayout) {
      saved = await OfficeLayout.findOneAndUpdate(
        { layoutId: 'default-office' },
        { $set: defaultData },
        { upsert: true, new: true }
      ).lean().exec();
    } else {
      saved = await this.memoryStore.findOneAndUpdate(
        { layoutId: 'default-office' },
        defaultData,
        { upsert: true }
      );
    }

    this.activeLayout = this._clone(saved || defaultData);
    this.syncWithEngines(this.activeLayout);
    return this.activeLayout;
  }

  /**
   * Synchronizes active layout boundaries and obstacles with live real-time engines
   * @param {object} layout - Layout object containing zones and obstacles
   */
  syncWithEngines(layout) {
    if (!layout) return false;

    // 1. Sync zones with ZoneManager
    if (Array.isArray(layout.zones)) {
      updateOfficeZones(layout.zones);
    }

    // 2. Sync obstacles with OcclusionEngine
    if (Array.isArray(layout.obstacles)) {
      defaultOcclusionEngine.loadObstacles(layout.obstacles);
    }

    this.lastSyncedAt = new Date().toISOString();
    return true;
  }

  /**
   * Returns diagnostic summary telemetry of active layout
   */
  getLayoutSummary() {
    const layout = this.getActiveLayout();
    return {
      service: 'Persistent Office Layout & Geospatial Floorplan Engine',
      status: 'operational',
      layoutId: layout.layoutId,
      name: layout.name,
      version: layout.version,
      isDefault: layout.isDefault,
      storageMode: this.isMongooseActive ? 'mongodb' : 'in-memory-fallback',
      dimensions: layout.dimensions,
      counts: {
        zones: layout.zones ? layout.zones.length : 0,
        obstacles: layout.obstacles ? layout.obstacles.length : 0,
        furniture: layout.furniture ? layout.furniture.length : 0,
      },
      lastSyncedAt: this.lastSyncedAt,
    };
  }
}

// Singleton default instance
const defaultLayoutPersistence = new LayoutPersistenceService();

module.exports = {
  LayoutPersistenceService,
  defaultLayoutPersistence,
  DEFAULT_OFFICE_LAYOUT,
};
