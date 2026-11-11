import { useCallback, useEffect, useRef, useState } from 'react';
import { resumeAudioContext } from './AudioContext';

const ERROR_MESSAGES = {
  NotAllowedError:
    'Microphone access is blocked. Click the lock icon in the address bar, allow the microphone, then try again.',
  NotFoundError: 'No microphone found. Connect one and try again.',
  NotReadableError: 'Another app is using your microphone. Close it and try again.',
  OverconstrainedError: 'Your microphone does not support the requested settings.',
  SecurityError: 'Microphone access needs https or localhost.',
};

export function useMicrophone() {
  const [stream, setStream] = useState(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState(null);
  const streamRef = useRef(null);

  // Call from a button click (browsers need a user gesture for audio).
  const start = useCallback(async () => {
    if (streamRef.current) return;
    setError(null);
    setIsStarting(true);
    try {
      await resumeAudioContext();
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      streamRef.current = mediaStream;
      setStream(mediaStream);
      setIsMuted(false);
    } catch (err) {
      setError(ERROR_MESSAGES[err.name] || `Could not start the microphone (${err.name}).`);
    } finally {
      setIsStarting(false);
    }
  }, []);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setStream(null);
    setIsMuted(false);
  }, []);

  // Mute by disabling the track (the stream and WebRTC connections stay alive).
  const toggleMute = useCallback(() => {
    const s = streamRef.current;
    if (!s) return;
    const nextMuted = !isMuted;
    s.getAudioTracks().forEach((t) => (t.enabled = !nextMuted));
    setIsMuted(nextMuted);
  }, [isMuted]);

  // Release the mic when the component unmounts.
  useEffect(() => () => streamRef.current?.getTracks().forEach((t) => t.stop()), []);

  return { stream, isMuted, isStarting, error, isActive: !!stream, start, stop, toggleMute };
}