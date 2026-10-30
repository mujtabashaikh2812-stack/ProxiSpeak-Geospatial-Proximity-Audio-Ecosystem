'use strict';

const { calculateDistance, EARSHOT_RADIUS } = require('./spatialEngine');

/**
 * MeshManager
 * 
 * Dynamic WebRTC Mesh Connection Capping & Audio Priority Allocator
 * 
 * Problem:
 * In a full-mesh WebRTC topology, N peers create N*(N-1)/2 audio streams.
 * When 10+ users gather together in an office pod or conference room,
 * browsers suffer severe CPU exhaustion, WebAudio buffer underruns, and network lag.
 * 
 * Solution:
 * MeshManager dynamically caps each peer to at most `maxMeshCap` (default: 6)
 * concurrent high-priority WebRTC audio connections.
 * 
 * Features:
 * 1. Priority scoring: Distance proximity + Acoustic room relevance + Stage VIP override.
 * 2. Hysteresis buffer: Prevents rapid connection/disconnection flapping on perimeter boundaries.
 * 3. Graceful eviction: Smoothly demotes distant peers when closer colleagues approach.
 * 4. VIP Stage spotlight: Town Hall Podium speakers bypass cap restrictions (guaranteed slot).
 * 5. Telemetry & Diagnostics: Real-time tracking of active vs suppressed audio streams.
 */

const DEFAULT_MAX_MESH_CAP = 6;
const DEFAULT_HYSTERESIS_PX = 8;

class MeshManager {
  constructor(options = {}) {
    this.maxMeshCap = options.maxMeshCap || DEFAULT_MAX_MESH_CAP;
    this.hysteresisPx = options.hysteresisPx || DEFAULT_HYSTERESIS_PX;
    this.earshotRadius = options.earshotRadius || EARSHOT_RADIUS;

    // Active mesh registry: userId -> Set<peerUserId>
    this.activeMesh = new Map();

    // Telemetry & metrics
    this.metrics = {
      totalEvaluations: 0,
      totalPromotions: 0,
      totalDemotions: 0,
      overflowSuppressedCount: 0,
      vipOverrides: 0,
      startedAt: new Date().toISOString(),
    };
  }

  /**
   * Calculates dynamic priority score for a peer candidate relative to local user
   * Higher score = higher priority for WebRTC audio slot
   * 
   * @param {object} localUser
   * @param {object} candidatePeer
   * @param {number} distance
   * @param {boolean} isCurrentlyActive - Whether peer already occupies an active mesh slot
   * @returns {number} priority score
   */
  calculatePriorityScore(localUser, candidatePeer, distance, isCurrentlyActive = false) {
    // 1. VIP Spotlight Override: Speaker on stage gets absolute top priority
    if (candidatePeer.isOnStage || candidatePeer.zone === 'podium') {
      return 10000;
    }

    // 2. Enclosed Meeting Room Affinity
    let zoneBonus = 0;
    if (
      localUser.zone === 'conference' &&
      candidatePeer.zone === 'conference'
    ) {
      zoneBonus = 500; // Prioritize peers sharing the private discussion room
    }

    // 3. Distance-based Proximity Score (Inverted: closer = higher score)
    const normalizedDistance = Math.max(0, this.earshotRadius - distance);
    const distanceScore = Math.max(0, normalizedDistance * 10);

    // 4. Hysteresis "Stickiness" Buffer
    // Existing active connections get a bonus equivalent to hysteresisPx
    // This stops rapid connection/disconnection flapping when avatars hover around the boundary
    const hysteresisBonus = isCurrentlyActive ? this.hysteresisPx * 10 : 0;

    return Math.round(distanceScore + zoneBonus + hysteresisBonus);
  }

  /**
   * Evaluates and updates the capped active mesh roster for a given user
   * 
   * @param {object} localUser - Current user object { userId, canvasX, canvasY, zone }
   * @param {Array<object>} nearbyPeers - All peers currently within earshot
   * @returns {object} { activePeers, promoted, demoted, retained, suppressed, isCapped }
   */
  evaluateMeshAllocation(localUser, nearbyPeers = []) {
    this.metrics.totalEvaluations++;

    const userId = String(localUser.userId);
    const currentActiveSet = this.activeMesh.get(userId) || new Set();

    // Score all candidate peers
    const scoredCandidates = nearbyPeers
      .filter((peer) => peer.userId !== userId)
      .map((peer) => {
        const dist =
          typeof peer.distance === 'number'
            ? peer.distance
            : calculateDistance(
                localUser.canvasX,
                localUser.canvasY,
                peer.canvasX,
                peer.canvasY
              );

        const isCurrentlyActive = currentActiveSet.has(peer.userId);
        const score = this.calculatePriorityScore(
          localUser,
          peer,
          dist,
          isCurrentlyActive
        );

        return {
          ...peer,
          distance: dist,
          priorityScore: score,
          isVip: score >= 10000,
        };
      });

    // Sort by priority score descending (highest priority first)
    scoredCandidates.sort((a, b) => b.priorityScore - a.priorityScore);

    // Allocate up to maxMeshCap slots
    const cappedActiveCandidates = scoredCandidates.slice(0, this.maxMeshCap);
    const suppressedCandidates = scoredCandidates.slice(this.maxMeshCap);

    const newActiveSet = new Set(cappedActiveCandidates.map((p) => p.userId));
    this.activeMesh.set(userId, newActiveSet);

    // Determine state changes
    const promoted = [];
    const retained = [];
    const demoted = [];

    for (const peer of cappedActiveCandidates) {
      if (currentActiveSet.has(peer.userId)) {
        retained.push(peer);
      } else {
        promoted.push(peer);
        this.metrics.totalPromotions++;
      }
    }

    for (const oldPeerId of currentActiveSet) {
      if (!newActiveSet.has(oldPeerId)) {
        const evictedPeer =
          nearbyPeers.find((p) => p.userId === oldPeerId) || { userId: oldPeerId };
        demoted.push(evictedPeer);
        this.metrics.totalDemotions++;
      }
    }

    if (suppressedCandidates.length > 0) {
      this.metrics.overflowSuppressedCount += suppressedCandidates.length;
    }

    // Count VIP overrides
    const vipCount = cappedActiveCandidates.filter((p) => p.isVip).length;
    if (vipCount > 0) {
      this.metrics.vipOverrides += vipCount;
    }

    return {
      userId,
      maxMeshCap: this.maxMeshCap,
      totalCandidatesInEarshot: nearbyPeers.length,
      activeCount: cappedActiveCandidates.length,
      isCapped: nearbyPeers.length > this.maxMeshCap,
      activePeers: cappedActiveCandidates,
      promoted,
      retained,
      demoted,
      suppressed: suppressedCandidates,
    };
  }

  /**
   * Checks whether a new WebRTC handshake between two peers is permitted under current caps
   * 
   * @param {string} userAId
   * @param {string} userBId
   * @returns {boolean} allowed
   */
  canEstablishConnection(userAId, userBId) {
    const meshA = this.activeMesh.get(String(userAId));
    const meshB = this.activeMesh.get(String(userBId));

    // If neither has reached capacity or if they are already in each other's active roster
    const aCanAccept = !meshA || meshA.size < this.maxMeshCap || meshA.has(String(userBId));
    const bCanAccept = !meshB || meshB.size < this.maxMeshCap || meshB.has(String(userAId));

    return aCanAccept && bCanAccept;
  }

  /**
   * Returns active peer IDs currently connected to a user
   */
  getActivePeersForUser(userId) {
    const set = this.activeMesh.get(String(userId));
    return set ? Array.from(set) : [];
  }

  /**
   * Cleans up registry when a user disconnects from the ecosystem
   */
  cleanupUser(userId) {
    const id = String(userId);
    this.activeMesh.delete(id);

    // Remove from other users' active meshes
    for (const [otherId, meshSet] of this.activeMesh.entries()) {
      if (meshSet.has(id)) {
        meshSet.delete(id);
        this.metrics.totalDemotions++;
      }
    }
  }

  /**
   * Updates configuration dynamically
   */
  configure(options = {}) {
    if (typeof options.maxMeshCap === 'number' && options.maxMeshCap > 0) {
      this.maxMeshCap = options.maxMeshCap;
    }
    if (typeof options.hysteresisPx === 'number' && options.hysteresisPx >= 0) {
      this.hysteresisPx = options.hysteresisPx;
    }
  }

  /**
   * Diagnostic statistics report
   */
  getStats() {
    let totalActiveConnections = 0;
    for (const set of this.activeMesh.values()) {
      totalActiveConnections += set.size;
    }

    return {
      service: 'WebRTC Mesh Connection Manager & Priority Allocator',
      status: 'operational',
      maxMeshCap: this.maxMeshCap,
      hysteresisPx: this.hysteresisPx,
      trackedUsersCount: this.activeMesh.size,
      totalActiveAudioStreams: totalActiveConnections,
      metrics: {
        ...this.metrics,
      },
      efficiency: {
        streamsSavedByCapping: this.metrics.overflowSuppressedCount,
        note: 'Prevents browser WebAudio context exhaustion in dense avatar clusters',
      },
    };
  }
}

// Default singleton instance
const defaultMeshManager = new MeshManager();

module.exports = {
  MeshManager,
  defaultMeshManager,
  DEFAULT_MAX_MESH_CAP,
  DEFAULT_HYSTERESIS_PX,
};
