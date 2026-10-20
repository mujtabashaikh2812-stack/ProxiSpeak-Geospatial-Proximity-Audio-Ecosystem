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
  },
  { strict: true }
);

UserSchema.index({ location: '2dsphere' });

module.exports = mongoose.model('User', UserSchema);
