'use strict';

/**
 * Virtual Office Zone & Acoustic Boundary Manager
 * Handles enclosed meeting rooms, glass sound-barriers,
 * and the Spotlight Podium (Town Hall broadcast stage).
 */

const OFFICE_ZONES = [
  {
    id: 'conf-a',
    name: 'Conference Room Alpha',
    type: 'enclosed_room',
    bounds: { x: 60, y: 60, width: 280, height: 220 },
    theme: {
      fill: 'rgba(224, 242, 254, 0.65)',
      border: '#0284c7',
      labelColor: '#0369a1',
    },
    description: 'Enclosed meeting room. Sound is contained within walls.',
  },
  {
    id: 'podium',
    name: 'Town Hall Stage & Podium',
    type: 'spotlight_stage',
    bounds: { x: 520, y: 80, width: 140, height: 110 },
    theme: {
      fill: 'rgba(254, 240, 138, 0.75)',
      border: '#ca8a04',
      labelColor: '#854d0e',
    },
    description: 'Broadcast stage. Stepping on the podium amplifies audio to all users in the office.',
  },
];

/**
 * Checks if a 2D coordinate falls within a zone rectangle
 */
function isPointInBounds(x, y, bounds) {
  return (
    x >= bounds.x &&
    x <= bounds.x + bounds.width &&
    y >= bounds.y &&
    y <= bounds.y + bounds.height
  );
}

/**
 * Detects which office zone a given coordinate is located in
 */
function detectZone(x, y) {
  for (const zone of OFFICE_ZONES) {
    if (isPointInBounds(x, y, zone.bounds)) {
      return zone;
    }
  }
  return {
    id: 'open-office',
    name: 'Open Workspace',
    type: 'open_floor',
    description: 'General floor. Audio obeys standard 100px proximity rule.',
  };
}

/**
 * Determines acoustic connectivity and volume multipliers between two peers:
 * - If either peer is on the Spotlight Podium -> global broadcast (canHear = true, mode = 'spotlight').
 * - If both peers are in the same enclosed meeting room -> room broadcast (canHear = true, mode = 'room').
 * - If one peer is inside a meeting room and one is outside -> sound blocked by walls (canHear = false).
 * - If both peers are in open space -> standard 100px proximity check (mode = 'proximity').
 */
function evaluateAcousticRelation(userA, userB, distance, earshotRadius = 100) {
  const zoneA = detectZone(userA.canvasX, userA.canvasY);
  const zoneB = detectZone(userB.canvasX, userB.canvasY);

  // 1. Spotlight Podium Check (Broadcast to all)
  if (zoneA.id === 'podium' || zoneB.id === 'podium') {
    return {
      canHear: true,
      mode: 'spotlight',
      speakerOnStage: zoneA.id === 'podium' ? userA.userId : userB.userId,
      effectiveVolume: 1.0,
      reason: 'Stage broadcast overrides proximity',
    };
  }

  // 2. Both peers in the same enclosed meeting room
  if (zoneA.id === 'conf-a' && zoneB.id === 'conf-a') {
    return {
      canHear: true,
      mode: 'room',
      room: zoneA.name,
      effectiveVolume: 0.95,
      reason: 'Shared enclosed conference room',
    };
  }

  // 3. Wall obstruction: One peer is inside the conference room, the other is outside
  if (
    (zoneA.id === 'conf-a' && zoneB.id !== 'conf-a') ||
    (zoneA.id !== 'conf-a' && zoneB.id === 'conf-a')
  ) {
    return {
      canHear: false,
      mode: 'blocked',
      reason: 'Acoustic walls block sound transmission',
    };
  }

  // 4. Default: Open Office Proximity
  const inRange = distance <= earshotRadius;
  return {
    canHear: inRange,
    mode: 'proximity',
    effectiveVolume: inRange ? Math.max(0.1, 1 - distance / earshotRadius) : 0,
    reason: inRange ? 'Within earshot radius' : 'Outside earshot radius',
  };
}

module.exports = {
  OFFICE_ZONES,
  detectZone,
  isPointInBounds,
  evaluateAcousticRelation,
};
