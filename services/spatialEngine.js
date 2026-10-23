'use strict';

const config = require('../config/serverConfig');

/**
 * Spatial Proximity Engine
 * Evaluates real-time 2D Euclidean distances between connected avatars
 * and manages proximity state transitions (enter, update, exit earshot).
 */

const EARSHOT_RADIUS = config.earshotRadius || 100;

// Set of active connected peer pairs currently within earshot: Set<"userIdA:userIdB">
// Always stored with alphabetically sorted userIds to avoid duplicate pairs
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
 * Check if two users are within earshot radius
 */
function isWithinEarshot(x1, y1, x2, y2, radius = EARSHOT_RADIUS) {
  return calculateDistance(x1, y1, x2, y2) <= radius;
}

/**
 * Evaluates proximity changes when a user moves.
 * Returns an array of transition events:
 * - { type: 'enter', peerA, peerB, distance }
 * - { type: 'update', peerA, peerB, distance }
 * - { type: 'leave', peerA, peerB, distance }
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
    const nowInEarshot = distance <= radius;

    if (!wasInEarshot && nowInEarshot) {
      // Just entered earshot -> Trigger WebRTC initiation
      activeProximityPairs.add(pairKey);
      transitions.push({
        type: 'enter',
        peerA: movedUser,
        peerB: peer,
        distance,
      });
    } else if (wasInEarshot && nowInEarshot) {
      // Still in earshot -> Trigger volume update
      transitions.push({
        type: 'update',
        peerA: movedUser,
        peerB: peer,
        distance,
      });
    } else if (wasInEarshot && !nowInEarshot) {
      // Moved out of earshot -> Trigger audio teardown
      activeProximityPairs.delete(pairKey);
      transitions.push({
        type: 'leave',
        peerA: movedUser,
        peerB: peer,
        distance,
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
 * Returns all peers currently in earshot of a given user
 */
function getNearbyPeersForUser(targetUser, allUsers, radius = EARSHOT_RADIUS) {
  return allUsers
    .filter((peer) => peer.userId !== targetUser.userId)
    .map((peer) => ({
      userId: peer.userId,
      socketId: peer.socketId,
      displayName: peer.displayName,
      canvasX: peer.canvasX,
      canvasY: peer.canvasY,
      distance: calculateDistance(
        targetUser.canvasX,
        targetUser.canvasY,
        peer.canvasX,
        peer.canvasY
      ),
    }))
    .filter((peer) => peer.distance <= radius)
    .sort((a, b) => a.distance - b.distance);
}

module.exports = {
  EARSHOT_RADIUS,
  calculateDistance,
  isWithinEarshot,
  evaluateProximityOnMove,
  cleanupUserProximity,
  getNearbyPeersForUser,
  activeProximityPairs,
};
