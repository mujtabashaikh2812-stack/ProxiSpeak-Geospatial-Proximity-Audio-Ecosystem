import React, { useState, useEffect, useRef } from 'react';
import { createSignalingBridge } from './webrtc/SignalingBridge';
import { MultiPeerCoordinator } from './webrtc/MultiPeerCoordinator';
import { attachStageBroadcastListener } from './webrtc/StageBroadcastListener';
import { DeviceSelectorModal } from './Components/DeviceSelectorModal';
import { AudioTelemetryHUD } from './Components/AudioTelemetryHUD';
import { getAudioContext } from './AudioContext';

/**
 * SpatialAudioContainer
 * 
 * Top-level React coordinator connecting all WebRTC and spatial audio sub-components:
 * - SignalingBridge to live Socket.io events
 * - MultiPeerCoordinator managing up to 6 audio peer connections
 * - StageBroadcastListener for Town Hall Podium audio amplification
 * - DeviceSelectorModal for microphone hardware selection
 * - AudioTelemetryHUD for real-time QoS statistics display
 */
export function SpatialAudioContainer({ socket, myUserId, localStream, peers = [] }) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [isMuted, setIsMuted] = useState(false);
  const [activeStageSpeaker, setActiveStageSpeaker] = useState(null);
  const [telemetry, setTelemetry] = useState({
    activePeersCount: 0,
    rttMs: 25,
    bitrateKbps: 48,
    packetLossPct: 0.1,
    quality: 'EXCELLENT',
  });

  const coordinatorRef = useRef(null);
  const bridgeRef = useRef(null);
  const stageListenerRef = useRef(null);

  useEffect(() => {
    if (!socket || !localStream) return;

    // 1. Initialize MultiPeerCoordinator
    const coordinator = new MultiPeerCoordinator(socket, localStream, {
      audioContext: getAudioContext(),
      onRemoteStream: (peerId, stream) => {
        console.log(`[SpatialAudioContainer] Remote stream attached for ${peerId}`);
        setTelemetry((prev) => ({
          ...prev,
          activePeersCount: coordinator.getConnectedPeerCount(),
        }));
      },
      onPeerDisconnected: (peerId) => {
        setTelemetry((prev) => ({
          ...prev,
          activePeersCount: coordinator.getConnectedPeerCount(),
        }));
      },
    });
    coordinatorRef.current = coordinator;

    // 2. Initialize Live Signaling Bridge
    const bridge = createSignalingBridge(socket, coordinator, {
      myUserId,
      onStatusChange: (status) => {
        setTelemetry((prev) => ({
          ...prev,
          activePeersCount: coordinator.getConnectedPeerCount(),
        }));
      },
    });
    bridgeRef.current = bridge;

    // 3. Attach Stage Broadcast VIP Listener
    const stageListener = attachStageBroadcastListener(socket, coordinator, ({ isStageActive, speakerId }) => {
      setActiveStageSpeaker(isStageActive ? speakerId : null);
    });
    stageListenerRef.current = stageListener;

    // 4. Periodically ping signaling server for latency RTT telemetry
    const pingInterval = setInterval(() => {
      const now = Date.now();
      socket.emit('telemetry:ping', { timestamp: now });
    }, 5000);

    socket.on('telemetry:pong', (data) => {
      if (data && typeof data.rttMs === 'number') {
        setTelemetry((prev) => ({
          ...prev,
          rttMs: data.rttMs,
          quality: data.quality || 'EXCELLENT',
          bitrateKbps: data.recommendedBitrateKbps || 48,
        }));
      }
    });

    return () => {
      clearInterval(pingInterval);
      socket.off('telemetry:pong');
      if (stageListenerRef.current) stageListenerRef.current.destroy();
      if (bridgeRef.current) bridgeRef.current.destroy();
      if (coordinatorRef.current) coordinatorRef.current.destroy();
    };
  }, [socket, localStream, myUserId]);

  const toggleMute = () => {
    if (!localStream) return;
    const newMuted = !isMuted;
    localStream.getAudioTracks().forEach((t) => {
      t.enabled = !newMuted;
    });
    setIsMuted(newMuted);

    if (socket) {
      socket.emit('audio:state', {
        isMuted: newMuted,
        isSpeaking: !newMuted,
      });
    }
  };

  return (
    <div style={{ position: 'relative' }}>
      {/* Top HUD Controls Bar */}
      <div style={controlsBarStyle}>
        <button
          onClick={toggleMute}
          style={isMuted ? muteBtnActiveStyle : muteBtnStyle}
        >
          {isMuted ? '🔇 Mic Muted' : '🎙️ Mic Active'}
        </button>

        <button
          onClick={() => setIsModalOpen(true)}
          style={deviceSettingsBtnStyle}
        >
          ⚙️ Audio Hardware
        </button>
      </div>

      {/* Real-time WebRTC Quality of Service HUD */}
      <AudioTelemetryHUD
        activePeersCount={telemetry.activePeersCount}
        maxMeshCap={6}
        rttMs={telemetry.rttMs}
        bitrateKbps={telemetry.bitrateKbps}
        packetLossPct={telemetry.packetLossPct}
        quality={telemetry.quality}
        isStageActive={Boolean(activeStageSpeaker)}
      />

      {/* Hardware Selector Modal */}
      <DeviceSelectorModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        currentDeviceId={selectedDeviceId}
        onDeviceSelected={(id) => setSelectedDeviceId(id)}
      />
    </div>
  );
}

const controlsBarStyle = {
  position: 'fixed',
  top: '16px',
  right: '16px',
  display: 'flex',
  gap: '10px',
  zIndex: 800,
};

const buttonBase = {
  padding: '8px 14px',
  borderRadius: '8px',
  fontSize: '0.8rem',
  fontWeight: 600,
  cursor: 'pointer',
  border: '1px solid #334155',
  backdropFilter: 'blur(6px)',
  outline: 'none',
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
};

const muteBtnStyle = {
  ...buttonBase,
  background: 'rgba(34, 197, 94, 0.2)',
  borderColor: '#22c55e',
  color: '#86efac',
};

const muteBtnActiveStyle = {
  ...buttonBase,
  background: 'rgba(239, 68, 68, 0.25)',
  borderColor: '#ef4444',
  color: '#fca5a5',
};

const deviceSettingsBtnStyle = {
  ...buttonBase,
  background: 'rgba(30, 41, 59, 0.8)',
  borderColor: '#475569',
  color: '#cbd5e1',
};
