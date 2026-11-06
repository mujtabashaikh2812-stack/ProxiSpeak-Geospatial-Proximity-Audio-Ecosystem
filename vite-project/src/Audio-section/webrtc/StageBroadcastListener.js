/**
 * StageBroadcastListener
 * 
 * Subscribes to Town Hall Podium events emitted by Mujtaba's signaling backend:
 * - spotlight:speaker_entered
 * - peer:zone_changed
 * 
 * When a remote peer is speaking on stage:
 * 1. Overrides distance attenuation (unattenuated 1.0 volume).
 * 2. Centers stereo panning (pan = 0.0) so speaker is heard clearly in both ears.
 * 3. Notifies application state to trigger visual HUD highlights.
 */

export function attachStageBroadcastListener(socket, multiPeerCoordinator, onStageChange = () => {}) {
  let activeStageSpeaker = null;

  const handleSpeakerEntered = ({ userId, displayName, message }) => {
    console.log(`[StageBroadcast] VIP Speaker entered podium: ${displayName} (${userId})`);
    activeStageSpeaker = userId;

    // Apply unattenuated center broadcast
    if (multiPeerCoordinator) {
      multiPeerCoordinator.updatePeerSpatial(userId, {
        volume: 1.0,
        pan: 0.0,
      });
    }

    onStageChange({
      isStageActive: true,
      speakerId: userId,
      displayName,
      message,
    });
  };

  const handlePeerZoneChanged = ({ userId, zone, isOnStage }) => {
    if (isOnStage) {
      activeStageSpeaker = userId;
      if (multiPeerCoordinator) {
        multiPeerCoordinator.updatePeerSpatial(userId, {
          volume: 1.0,
          pan: 0.0,
        });
      }
      onStageChange({
        isStageActive: true,
        speakerId: userId,
      });
    } else if (activeStageSpeaker === userId && !isOnStage) {
      console.log(`[StageBroadcast] Speaker left podium: ${userId}`);
      activeStageSpeaker = null;
      onStageChange({
        isStageActive: false,
        speakerId: null,
      });
    }
  };

  socket.on('spotlight:speaker_entered', handleSpeakerEntered);
  socket.on('peer:zone_changed', handlePeerZoneChanged);

  return {
    getActiveStageSpeaker: () => activeStageSpeaker,
    isStageActive: () => Boolean(activeStageSpeaker),
    destroy: () => {
      socket.off('spotlight:speaker_entered', handleSpeakerEntered);
      socket.off('peer:zone_changed', handlePeerZoneChanged);
      activeStageSpeaker = null;
    },
  };
}
