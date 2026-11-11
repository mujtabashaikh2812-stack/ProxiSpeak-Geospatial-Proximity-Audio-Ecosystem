'use strict';

const User = require('./User');

function validateMaxIdleMinutes(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new Error('maxIdleMinutes must be a finite positive number');
  }
}

async function pruneStaleSessions(options = {}) {
  const maxIdleMinutes = options.maxIdleMinutes === undefined ? 30 : options.maxIdleMinutes;
  const dryRun = options.dryRun === undefined ? true : options.dryRun;

  validateMaxIdleMinutes(maxIdleMinutes);

  const scannedCount = await User.countDocuments();
  const cutoff = new Date(Date.now() - maxIdleMinutes * 60 * 1000);
  const stale = await User.find({ lastSeenAt: { $lt: cutoff } }).select('userId').lean();
  const staleUserIds = stale.map((u) => u.userId);
  const staleCount = staleUserIds.length;

  let deletedCount = 0;
  if (!dryRun) {
    const result = await User.deleteMany({ lastSeenAt: { $lt: cutoff } });
    deletedCount = result.deletedCount || 0;
  }

  return { scannedCount, staleCount, deletedCount, staleUserIds };
}

module.exports = { pruneStaleSessions };
