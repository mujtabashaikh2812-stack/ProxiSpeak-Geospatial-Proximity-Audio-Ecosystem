const mongoose = require('mongoose');

const isNonblankString = (value) => typeof value === 'string' && value.trim().length > 0;

const isFiniteNumber = (value) => typeof value === 'number' && Number.isFinite(value);

const UserSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: [true, 'userId is required'],
      trim: true,
      unique: true,
      validate: {
        validator: isNonblankString,
        message: 'userId must be a nonblank string',
      },
    },
    displayName: {
      type: String,
      trim: true,
      required: false,
      maxlength: 80,
    },
    location: {
      type: {
        type: String,
        required: [true, 'location.type is required'],
        enum: {
          values: ['Point'],
          message: 'location.type must be exactly "Point"',
        },
      },
      coordinates: {
        type: [Number],
        required: [true, 'location.coordinates is required'],
        validate: {
          validator: function (value) {
            return (
              Array.isArray(value) &&
              value.length === 2 &&
              value.every(isFiniteNumber) &&
              value[0] >= -180 &&
              value[0] <= 180 &&
              value[1] >= -90 &&
              value[1] <= 90
            );
          },
          message: 'location.coordinates must be exactly two finite numbers: longitude (-180 to 180) and latitude (-90 to 90)',
        },
      },
    },
    canvasX: {
      type: Number,
      required: [true, 'canvasX is required'],
      validate: {
        validator: isFiniteNumber,
        message: 'canvasX must be a finite number',
      },
    },
    canvasY: {
      type: Number,
      required: [true, 'canvasY is required'],
      validate: {
        validator: isFiniteNumber,
        message: 'canvasY must be a finite number',
      },
    },
    lastSeenAt: {
      type: Date,
      required: false,
      default: Date.now, // used by session pruning
    },
    status: {
      type: String,
      enum: {
        values: ['online', 'idle', 'offline'],
        message: 'status must be one of: online, idle, offline',
      },
      default: 'offline',
      trim: true,
    },
    // Profile customization fields exposed by the Day 17 route file (routes/userRoutes.js).
    avatarColor: {
      type: String,
      trim: true,
      default: null,
      validate: {
        validator: (value) => value === null || value === undefined || /^#[0-9a-fA-F]{6}$/.test(value),
        message: 'avatarColor must be a hex colour: a hash followed by six hexadecimal digits, for example #1a2b3c',
      },
    },
    shirtSpriteId: {
      type: String,
      trim: true,
      maxlength: 64,
      default: null,
    },
    statusMessage: {
      type: String,
      trim: true,
      maxlength: 140,
      default: '',
    },
  },
  { strict: true }
);

UserSchema.index({ location: '2dsphere' });

// Compound index for queries that filter by status and then search by distance.
// The single field location index above is retained for queries that do not filter status.
UserSchema.index({ status: 1, location: '2dsphere' });

module.exports = mongoose.model('User', UserSchema);
