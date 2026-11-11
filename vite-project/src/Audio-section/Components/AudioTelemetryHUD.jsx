import React from 'react';

/**
 * AudioTelemetryHUD
 * 
 * Floating Heads-Up Display rendering real-time WebRTC stream statistics:
 * - Active mesh peer count (vs 6-peer cap)
 * - Audio bitrate (kbps)
 * - Network Round-Trip Time (RTT) in ms
 * - Audio packet loss percentage
 * - Stage broadcast indicator
 */
export function AudioTelemetryHUD({
  activePeersCount = 0,
  maxMeshCap = 6,
  rttMs = 28,
  bitrateKbps = 48,
  packetLossPct = 0.1,
  isStageActive = false,
  quality = 'EXCELLENT',
}) {
  const getQualityColor = () => {
    switch (quality) {
      case 'EXCELLENT': return '#22c55e'; // Green
      case 'GOOD':      return '#38bdf8'; // Sky blue
      case 'FAIR':      return '#eab308'; // Amber
      case 'DEGRADED':  return '#ef4444'; // Red
      default:          return '#94a3b8';
    }
  };

  return (
    <div style={hudContainerStyle}>
      <div style={hudHeaderStyle}>
        <span style={indicatorDot(getQualityColor())} />
        <span style={{ fontWeight: 700, fontSize: '0.75rem', letterSpacing: '0.05em' }}>
          AUDIO QoS TELEMETRY
        </span>
        <span style={{ ...qualityBadgeStyle, color: getQualityColor() }}>
          {quality}
        </span>
      </div>

      <div style={metricsGridStyle}>
        <div style={metricItemStyle}>
          <span style={metricLabelStyle}>Peers</span>
          <span style={metricValueStyle}>
            {activePeersCount} / {maxMeshCap}
          </span>
        </div>

        <div style={metricItemStyle}>
          <span style={metricLabelStyle}>RTT Ping</span>
          <span style={metricValueStyle}>{rttMs} ms</span>
        </div>

        <div style={metricItemStyle}>
          <span style={metricLabelStyle}>Bitrate</span>
          <span style={metricValueStyle}>{bitrateKbps} kbps</span>
        </div>

        <div style={metricItemStyle}>
          <span style={metricLabelStyle}>Packet Loss</span>
          <span style={metricValueStyle}>{packetLossPct}%</span>
        </div>
      </div>

      {isStageActive && (
        <div style={stageActiveBannerStyle}>
          🎤 Town Hall Podium Broadcast Active
        </div>
      )}
    </div>
  );
}

const hudContainerStyle = {
  position: 'fixed',
  bottom: '20px',
  right: '20px',
  background: 'rgba(15, 23, 42, 0.85)',
  backdropFilter: 'blur(8px)',
  border: '1px solid #334155',
  borderRadius: '10px',
  padding: '12px 14px',
  color: '#f8fafc',
  width: '260px',
  boxShadow: '0 4px 20px rgba(0, 0, 0, 0.4)',
  zIndex: 900,
  fontFamily: 'Consolas, monospace',
};

const hudHeaderStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  borderBottom: '1px solid #1e293b',
  paddingBottom: '8px',
  marginBottom: '8px',
};

const indicatorDot = (color) => ({
  width: '8px',
  height: '8px',
  borderRadius: '50%',
  backgroundColor: color,
  display: 'inline-block',
  boxShadow: `0 0 8px ${color}`,
});

const qualityBadgeStyle = {
  fontSize: '0.7rem',
  fontWeight: 700,
  textTransform: 'uppercase',
};

const metricsGridStyle = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: '8px',
};

const metricItemStyle = {
  display: 'flex',
  flexDirection: 'column',
};

const metricLabelStyle = {
  fontSize: '0.65rem',
  color: '#64748b',
  textTransform: 'uppercase',
};

const metricValueStyle = {
  fontSize: '0.85rem',
  fontWeight: 700,
  color: '#cbd5e1',
};

const stageActiveBannerStyle = {
  marginTop: '8px',
  padding: '4px 6px',
  background: 'rgba(202, 138, 4, 0.25)',
  border: '1px solid #ca8a04',
  borderRadius: '4px',
  fontSize: '0.7rem',
  color: '#fef08a',
  textAlign: 'center',
  fontWeight: 600,
};
