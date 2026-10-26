'use strict';

const config = require('../config/serverConfig');
const {
  detectZone,
  evaluateAcousticRelation,
  OFFICE_ZONES,
} = require('./zoneManager');

/**
 * Spatial Proximity & Acoustic Engine
 * Evaluates real-time 2D Euclidean distances, acoustic room boundaries,
 * and Spotlight Podium broadcast states between connected avatars.
 */

const EARSHOT_RADIUS = config.earshotRadius || 100;

// Set of active connected peer pairs currently within audio earshot: Set<"userIdA::userIdB">
const activeProximityPairs = new Set();

function getPairKey(userId1, userId2) {
  return [String(userId1), String(userId2)].sort().join('::');
}

/**
 * Calculate 2D Euclidean distance between two points in canvas space
 */
function calculateDistance(x1, y1, x2, y2) {
  return Math.round(Math.hypot(x2 - x1, y2 - y1) * 100) / 100;
}

/**
 * Check if two coordinates or users are within earshot radius taking acoustic zones into account
 */
function isWithinEarshot(arg1, arg2, arg3, arg4, arg5) {
  let userA, userB, radius;
  if (typeof arg1 === 'number') {
    userA = { canvasX: arg1, canvasY: arg2 };
    userB = { canvasX: arg3, canvasY: arg4 };
    radius = typeof arg5 === 'number' ? arg5 : EARSHOT_RADIUS;
  } else {
    userA = arg1;
    userB = arg2;
    radius = typeof arg3 === 'number' ? arg3 : EARSHOT_RADIUS;
  }
  const distance = calculateDistance(userA.canvasX, userA.canvasY, userB.canvasX, userB.canvasY);
  const acoustic = evaluateAcousticRelation(userA, userB, distance, radius);
  return acoustic.canHear;
}

/**
 * Evaluates proximity and acoustic boundary changes when a user moves.
 * Returns an array of transition events:
 * - { type: 'enter', peerA, peerB, distance, mode, effectiveVolume }
 * - { type: 'update', peerA, peerB, distance, mode, effectiveVolume }
 * - { type: 'leave', peerA, peerB, distance, reason }
 */
function evaluateProximityOnMove(movedUser, allUsers, radius = EARSHOT_RADIUS) {
  const transitions = [];

  for (const peer of allUsers) {
    if (peer.userId === movedUser.userId) continue;

    const distance = calculateDistance(
      movedUser.canvasX,
      movedUser.canvasY,
      peer.canvasX,
      peer.canvasY
    );

    const pairKey = getPairKey(movedUser.userId, peer.userId);
    const wasInEarshot = activeProximityPairs.has(pairKey);

    // Evaluate acoustic boundary (walls, podium, distance)
    const acoustic = evaluateAcousticRelation(movedUser, peer, distance, radius);
    const nowInEarshot = acoustic.canHear;

    if (!wasInEarshot && nowInEarshot) {
      activeProximityPairs.add(pairKey);
      transitions.push({
        type: 'enter',
        peerA: movedUser,
        peerB: peer,
        distance,
        mode: acoustic.mode,
        effectiveVolume: acoustic.effectiveVolume,
        reason: acoustic.reason,
      });
    } else if (wasInEarshot && nowInEarshot) {
      transitions.push({
        type: 'update',
        peerA: movedUser,
        peerB: peer,
        distance,
        mode: acoustic.mode,
        effectiveVolume: acoustic.effectiveVolume,
      });
    } else if (wasInEarshot && !nowInEarshot) {
      activeProximityPairs.delete(pairKey);
      transitions.push({
        type: 'leave',
        peerA: movedUser,
        peerB: peer,
        distance,
        reason: acoustic.reason,
      });
    }
  }

  return transitions;
}

/**
 * Cleans up all pairs involving a disconnected user
 */
function cleanupUserProximity(userId, remainingUsers) {
  const departures = [];
  for (const peer of remainingUsers) {
    const pairKey = getPairKey(userId, peer.userId);
    if (activeProximityPairs.has(pairKey)) {
      activeProximityPairs.delete(pairKey);
      departures.push({
        type: 'leave',
        targetUserId: peer.userId,
        targetSocketId: peer.socketId,
        disconnectedUserId: userId,
      });
    }
  }
  return departures;
}

/**
 * Returns all peers currently audible for a given user (respecting acoustic zones)
 */
function getNearbyPeersForUser(targetUser, allUsers, radius = EARSHOT_RADIUS) {
  return allUsers
    .filter((peer) => peer.userId !== targetUser.userId)
    .map((peer) => {
      const distance = calculateDistance(
        targetUser.canvasX,
        targetUser.canvasY,
        peer.canvasX,
        peer.canvasY
      );
      const acoustic = evaluateAcousticRelation(targetUser, peer, distance, radius);
      return {
        userId: peer.userId,
        socketId: peer.socketId,
        displayName: peer.displayName,
        canvasX: peer.canvasX,
        canvasY: peer.canvasY,
        distance,
        canHear: acoustic.canHear,
        mode: acoustic.mode,
        effectiveVolume: acoustic.effectiveVolume,
        zone: detectZone(peer.canvasX, peer.canvasY).name,
      };
    })
    .filter((peer) => peer.canHear)
    .sort((a, b) => a.distance - b.distance);
}

module.exports = {
  EARSHOT_RADIUS,
  calculateDistance,
  isWithinEarshot,
  evaluateProximityOnMove,
  cleanupUserProximity,
  getNearbyPeersForUser,
  detectZone,
  OFFICE_ZONES,
  activeProximityPairs,
};
