'use strict';

const mongoose = require('mongoose');
const { MAX_CANVAS_COORD } = require('../canvasToGeo');

const isFiniteNumber = (v) => typeof v === 'number' && Number.isFinite(v);

const UserSessionSchema = new mongoose.Schema(
  {
    sessionId: {
      type: String,
      required: [true, 'sessionId is required'],
      unique: true,
      trim: true,
    },
    userId: {
      type: String,
      required: [true, 'userId is required'],
      trim: true,
      maxlength: [120, 'userId must be at most 120 characters'],
    },
    zoneId: {
      type: String,
      required: [true, 'zoneId is required'],
      trim: true,
      lowercase: true,
    },
    enteredAt: {
      type: Date,
      required: [true, 'enteredAt is required'],
    },
    exitedAt: {
      type: Date,
      default: null,
    },
    dwellSeconds: {
      type: Number,
      default: null,
    },
    lastPositionX: {
      type: Number,
      validate: { validator: (v) => v === null || v === undefined || (isFiniteNumber(v) && Math.abs(v) <= MAX_CANVAS_COORD), message: 'lastPositionX must be a finite number within canvas extent' },
    },
    lastPositionY: {
      type: Number,
      validate: { validator: (v) => v === null || v === undefined || (isFiniteNumber(v) && Math.abs(v) <= MAX_CANVAS_COORD), message: 'lastPositionY must be a finite number within canvas extent' },
    },
  },
  { strict: true, timestamps: true }
);

UserSessionSchema.path('exitedAt').validate(function (value) {
  if (value === null || value === undefined) return true;
  if (!this.enteredAt) return true;
  return value >= this.enteredAt;
}, 'exitedAt must be greater than or equal to enteredAt');

UserSessionSchema.index({ sessionId: 1 }, { unique: true });
UserSessionSchema.index({ zoneId: 1, enteredAt: -1 });
UserSessionSchema.index({ userId: 1, enteredAt: -1 });
// Partial unique index: one open session per user at most.
UserSessionSchema.index({ userId: 1 }, { unique: true, partialFilterExpression: { exitedAt: null } });

const UserSession = mongoose.model('UserSession', UserSessionSchema);

module.exports = { UserSession };
module.exports.UserSession = UserSession;
