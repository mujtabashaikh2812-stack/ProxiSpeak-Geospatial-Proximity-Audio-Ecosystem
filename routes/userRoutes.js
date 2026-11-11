'use strict';

// Framework free user profile handlers (Day 17). Every function returns a plain
// { status, body } object and never throws. The :id in the URL is the User
// document's userId string (the business key). The Mongo _id is only used as a
// fallback when the string is a valid 24 character ObjectId.

const User = require('../User');

const MAX_BATCH_SIZE = 100;
const MAX_STATUS_MESSAGE_LENGTH = 140;
const MAX_SHIRT_SPRITE_ID_LENGTH = 64;
const AVATAR_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
const OBJECT_ID_PATTERN = /^[0-9a-fA-F]{24}$/;
const PROFILE_FIELDS =
  'userId displayName avatarColor shirtSpriteId statusMessage status canvasX canvasY lastSeenAt';

function badRequest(message) {
  return { status: 400, body: { error: message } };
}

function isBlankOrNotString(value) {
  return typeof value !== 'string' || value.trim() === '';
}

function toProfile(doc) {
  return {
    userId: doc.userId,
    displayName: doc.displayName,
    avatarColor: doc.avatarColor === undefined ? null : doc.avatarColor,
    shirtSpriteId: doc.shirtSpriteId === undefined ? null : doc.shirtSpriteId,
    statusMessage: doc.statusMessage === undefined ? '' : doc.statusMessage,
    status: doc.status,
    canvasX: doc.canvasX,
    canvasY: doc.canvasY,
    lastSeenAt: doc.lastSeenAt,
  };
}

function validateUserId(userId) {
  if (isBlankOrNotString(userId)) {
    return 'userId must be a non-blank string';
  }
  return null;
}

async function getUserProfile(userId) {
  const idError = validateUserId(userId);
  if (idError) return badRequest(idError);

  try {
    const id = userId.trim();
    let doc = await User.findOne({ userId: id }).select(PROFILE_FIELDS).lean();
    if (!doc && OBJECT_ID_PATTERN.test(id)) {
      doc = await User.findOne({ _id: id }).select(PROFILE_FIELDS).lean();
    }
    if (!doc) {
      return { status: 404, body: { error: 'user not found' } };
    }
    return { status: 200, body: { user: toProfile(doc) } };
  } catch (err) {
    return { status: 500, body: { error: 'could not read the user profile' } };
  }
}

// Returns { error } when the payload is invalid, otherwise { update } with the
// cleaned values to apply. Nothing here touches the database.
function validateAvatarPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { error: 'payload must be an object with avatarColor, shirtSpriteId or statusMessage' };
  }
  const update = {};
  const hasColor = payload.avatarColor !== undefined;
  const hasSprite = payload.shirtSpriteId !== undefined;
  const hasMessage = payload.statusMessage !== undefined;

  if (!hasColor && !hasSprite && !hasMessage) {
    return { error: 'payload must contain at least one of avatarColor, shirtSpriteId, statusMessage' };
  }

  if (hasColor) {
    if (payload.avatarColor === null) {
      update.avatarColor = null;
    } else {
      if (typeof payload.avatarColor !== 'string' || !AVATAR_COLOR_PATTERN.test(payload.avatarColor.trim())) {
        return { error: 'avatarColor must be a hex colour: a hash followed by six hexadecimal digits, for example #1a2b3c' };
      }
      update.avatarColor = payload.avatarColor.trim();
    }
  }

  if (hasSprite) {
    if (payload.shirtSpriteId === null) {
      update.shirtSpriteId = null;
    } else {
      if (isBlankOrNotString(payload.shirtSpriteId)) {
        return { error: 'shirtSpriteId must be a non-blank string or null' };
      }
      const sprite = payload.shirtSpriteId.trim();
      if (sprite.length > MAX_SHIRT_SPRITE_ID_LENGTH) {
        return { error: 'shirtSpriteId must be at most ' + MAX_SHIRT_SPRITE_ID_LENGTH + ' characters' };
      }
      update.shirtSpriteId = sprite;
    }
  }

  if (hasMessage) {
    if (typeof payload.statusMessage !== 'string') {
      return { error: 'statusMessage must be a string' };
    }
    const message = payload.statusMessage.trim();
    if (message.length > MAX_STATUS_MESSAGE_LENGTH) {
      return { error: 'statusMessage must be at most ' + MAX_STATUS_MESSAGE_LENGTH + ' characters' };
    }
    update.statusMessage = message;
  }

  return { update };
}

async function updateUserAvatar(userId, payload) {
  const idError = validateUserId(userId);
  if (idError) return badRequest(idError);

  const checked = validateAvatarPayload(payload);
  if (checked.error) return badRequest(checked.error);

  try {
    const id = userId.trim();
    const options = { new: true, runValidators: true };
    let doc = await User.findOneAndUpdate({ userId: id }, { $set: checked.update }, options)
      .select(PROFILE_FIELDS)
      .lean();
    if (!doc && OBJECT_ID_PATTERN.test(id)) {
      doc = await User.findOneAndUpdate({ _id: id }, { $set: checked.update }, options)
        .select(PROFILE_FIELDS)
        .lean();
    }
    if (!doc) {
      return { status: 404, body: { error: 'user not found' } };
    }
    return { status: 200, body: { user: toProfile(doc) } };
  } catch (err) {
    if (err && err.name === 'ValidationError') {
      const errors = {};
      for (const key of Object.keys(err.errors || {})) {
        errors[key] = err.errors[key].message;
      }
      return { status: 400, body: { error: errors } };
    }
    return { status: 500, body: { error: 'could not save the user profile' } };
  }
}

async function getProfilesForUsers(userIds) {
  if (!Array.isArray(userIds)) {
    return badRequest('userIds must be an array of userId strings');
  }
  if (userIds.length > MAX_BATCH_SIZE) {
    return badRequest('userIds must contain at most ' + MAX_BATCH_SIZE + ' entries');
  }
  for (const id of userIds) {
    if (isBlankOrNotString(id)) {
      return badRequest('every entry in userIds must be a non-blank string');
    }
  }

  try {
    const unique = Array.from(new Set(userIds.map((id) => id.trim())));
    const docs = unique.length === 0
      ? []
      : await User.find({ userId: { $in: unique } }).select(PROFILE_FIELDS).sort({ userId: 1 }).lean();
    const users = docs.map(toProfile);
    return { status: 200, body: { count: users.length, users } };
  } catch (err) {
    return { status: 500, body: { error: 'could not read the user profiles' } };
  }
}

function sendResult(res, result) {
  if (res && typeof res.status === 'function') {
    res.status(result.status).json(result.body);
  }
  return result;
}

function registerUserRoutes(app, basePath) {
  if (!app || typeof app.get !== 'function' || typeof app.put !== 'function') {
    throw new Error('registerUserRoutes requires an Express-like app with get and put methods');
  }
  const base = basePath || '/api/db/users';
  app.get(base + '/:id', async (req, res) => {
    const result = await getUserProfile(req && req.params && req.params.id);
    return sendResult(res, result);
  });
  app.put(base + '/:id/avatar', async (req, res) => {
    const result = await updateUserAvatar(req && req.params && req.params.id, req && req.body);
    return sendResult(res, result);
  });
}

module.exports = {
  getUserProfile,
  updateUserAvatar,
  getProfilesForUsers,
  registerUserRoutes,
};
