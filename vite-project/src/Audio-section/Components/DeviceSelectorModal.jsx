import React, { useState, useEffect } from 'react';
import { getAudioInputDevices, createDeviceConstraints } from '../AudioConstraints';

/**
 * DeviceSelectorModal
 * 
 * Hardware Microphone and Speaker Device Selection Modal
 * Allows intern/evaluator to select specific hardware microphones,
 * preview audio input levels with a real-time VU meter, and save constraints.
 */
export function DeviceSelectorModal({ isOpen, onClose, onDeviceSelected, currentDeviceId }) {
  const [devices, setDevices] = useState([]);
  const [selectedId, setSelectedId] = useState(currentDeviceId || '');
  const [micLevel, setMicLevel] = useState(0);
  const [isTesting, setIsTesting] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    getAudioInputDevices()
      .then((devList) => {
        if (!isMounted) return;
        setDevices(devList);
        if (!selectedId && devList.length > 0) {
          setSelectedId(devList[0].deviceId);
        }
      })
      .catch((err) => {
        if (isMounted) setErrorMsg('Failed to enumerate audio hardware devices');
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  // Audio preview tester
  useEffect(() => {
    if (!isTesting || !selectedId) return;

    let stream = null;
    let animId = null;
    let audioCtx = null;

    navigator.mediaDevices
      .getUserMedia(createDeviceConstraints(selectedId))
      .then((s) => {
        stream = s;
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 64;
        source.connect(analyser);

        const dataArray = new Uint8Array(analyser.frequencyBinCount);

        const checkLevel = () => {
          analyser.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i];
          }
          const avg = sum / dataArray.length;
          setMicLevel(Math.min(100, Math.round((avg / 128) * 100)));
          animId = requestAnimationFrame(checkLevel);
        };
        checkLevel();
      })
      .catch((err) => {
        console.warn('[DeviceSelector] Could not test mic:', err);
        setErrorMsg('Could not access microphone');
      });

    return () => {
      if (animId) cancelAnimationFrame(animId);
      if (stream) stream.getTracks().forEach((t) => t.stop());
      if (audioCtx) audioCtx.close();
      setMicLevel(0);
    };
  }, [isTesting, selectedId]);

  if (!isOpen) return null;

  const handleSave = () => {
    if (onDeviceSelected && selectedId) {
      onDeviceSelected(selectedId);
    }
    onClose();
  };

  return (
    <div style={modalOverlayStyle}>
      <div style={modalCardStyle}>
        <div style={headerStyle}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#38bdf8' }}>
            Microphone & Audio Hardware Settings
          </h2>
          <button onClick={onClose} style={closeButtonStyle}>×</button>
        </div>

        {errorMsg && (
          <div style={errorBannerStyle}>{errorMsg}</div>
        )}

        <div style={{ marginTop: '16px' }}>
          <label style={labelStyle}>Select Microphone Device:</label>
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            style={selectStyle}
          >
            {devices.length === 0 && <option value="">No devices found</option>}
            {devices.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label || `Microphone ${d.deviceId.slice(0, 5)}`}
              </option>
            ))}
          </select>
        </div>

        <div style={{ marginTop: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={labelStyle}>Live Microphone Level Test:</span>
            <button
              onClick={() => setIsTesting(!isTesting)}
              style={isTesting ? testActiveButtonStyle : testButtonStyle}
            >
              {isTesting ? 'Stop Test' : 'Test Mic'}
            </button>
          </div>

          <div style={meterContainerStyle}>
            <div
              style={{
                ...meterFillStyle,
                width: `${micLevel}%`,
                background: micLevel > 75 ? '#ef4444' : micLevel > 40 ? '#eab308' : '#22c55e',
              }}
            />
          </div>
        </div>

        <div style={footerStyle}>
          <button onClick={onClose} style={cancelButtonStyle}>Cancel</button>
          <button onClick={handleSave} style={saveButtonStyle}>Apply Device</button>
        </div>
      </div>
    </div>
  );
}

// Inline Styles for pure React zero-dependency rendering
const modalOverlayStyle = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: 'rgba(15, 23, 42, 0.75)',
  backdropFilter: 'blur(4px)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
};

const modalCardStyle = {
  background: '#1e293b',
  border: '1px solid #334155',
  borderRadius: '12px',
  width: '420px',
  maxWidth: '90%',
  padding: '20px',
  color: '#f8fafc',
  boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5)',
};

const headerStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  borderBottom: '1px solid #334155',
  paddingBottom: '12px',
};

const closeButtonStyle = {
  background: 'transparent',
  border: 'none',
  color: '#94a3b8',
  fontSize: '1.5rem',
  cursor: 'pointer',
  padding: '0 4px',
};

const labelStyle = {
  fontSize: '0.85rem',
  fontWeight: 600,
  color: '#cbd5e1',
  display: 'block',
  marginBottom: '6px',
};

const selectStyle = {
  width: '100%',
  padding: '8px 12px',
  background: '#0f172a',
  border: '1px solid #475569',
  borderRadius: '6px',
  color: '#f8fafc',
  fontSize: '0.85rem',
  outline: 'none',
};

const meterContainerStyle = {
  height: '10px',
  background: '#0f172a',
  borderRadius: '9999px',
  overflow: 'hidden',
  marginTop: '8px',
  border: '1px solid #334155',
};

const meterFillStyle = {
  height: '100%',
  transition: 'width 0.08s ease-out',
};

const footerStyle = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: '10px',
  marginTop: '24px',
  borderTop: '1px solid #334155',
  paddingTop: '14px',
};

const buttonBase = {
  padding: '8px 16px',
  borderRadius: '6px',
  fontSize: '0.85rem',
  fontWeight: 600,
  cursor: 'pointer',
  border: 'none',
  outline: 'none',
};

const cancelButtonStyle = {
  ...buttonBase,
  background: '#334155',
  color: '#cbd5e1',
};

const saveButtonStyle = {
  ...buttonBase,
  background: '#0284c7',
  color: '#ffffff',
};

const testButtonStyle = {
  ...buttonBase,
  background: '#0f172a',
  border: '1px solid #475569',
  color: '#38bdf8',
  padding: '4px 10px',
  fontSize: '0.75rem',
};

const testActiveButtonStyle = {
  ...testButtonStyle,
  background: '#0369a1',
  color: '#ffffff',
};

const errorBannerStyle = {
  background: 'rgba(239, 68, 68, 0.2)',
  border: '1px solid #ef4444',
  color: '#fca5a5',
  padding: '8px 12px',
  borderRadius: '6px',
  fontSize: '0.8rem',
  marginTop: '12px',
};
