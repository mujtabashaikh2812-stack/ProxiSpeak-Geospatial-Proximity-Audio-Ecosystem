import { useEffect, useRef, useState } from "react";
import { socket } from "./Socket";

export default function AudioSection() {
  const [muted, setMuted] = useState(false);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState("");
  const [connected, setConnected] = useState(false);

  const streamRef = useRef(null);
  const frameRef = useRef(null);
  const ctxRef = useRef(null);

  useEffect(() => {
    socket.connect();
    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));

    return () => {
      socket.off("connect");
      socket.off("disconnect");
      socket.disconnect();
    };
  }, []);

  useEffect(() => {
    let active = true;

    async function startMic() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (!active) return stream.getTracks().forEach((t) => t.stop());

        streamRef.current = stream;

        const ctx = new AudioContext();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        ctx.createMediaStreamSource(stream).connect(analyser);
        ctxRef.current = ctx;

        const data = new Uint8Array(analyser.frequencyBinCount);
        const tick = () => {
          analyser.getByteFrequencyData(data);
          const avg = data.reduce((a, b) => a + b, 0) / data.length;
          setLevel(Math.min(100, Math.round((avg / 128) * 100)));
          frameRef.current = requestAnimationFrame(tick);
        };
        tick();
      } catch (err) {
        setError(
          err.name === "NotAllowedError"
            ? "Microphone permission denied. Allow it in the browser address bar."
            : "No microphone found or it could not be started."
        );
      }
    }

    startMic();

    return () => {
      active = false;
      cancelAnimationFrame(frameRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      ctxRef.current?.close();
    };
  }, []);

  const toggleMute = () => {
    const next = !muted;
    streamRef.current?.getAudioTracks().forEach((t) => (t.enabled = !next));
    setMuted(next);
  };

  return (
    <div className="mx-auto mt-10 w-full max-w-sm rounded-xl border p-5 shadow">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Audio</h2>
        <span className={connected ? "text-green-600" : "text-red-500"}>
          {connected ? "Connected" : "Disconnected"}
        </span>
      </div>

      {error ? (
        <p className="text-sm text-red-500">{error}</p>
      ) : (
        <>
          <div className="mb-4 h-3 w-full overflow-hidden rounded bg-gray-200">
            <div
              className="h-full bg-green-500 transition-all duration-75"
              style={{ width: `${muted ? 0 : level}%` }}
            />
          </div>

          <button
            onClick={toggleMute}
            className={`w-full rounded-lg py-2 font-medium text-white ${
              muted ? "bg-red-500" : "bg-blue-600"
            }`}
          >
            {muted ? "Unmute" : "Mute"}
          </button>
        </>
      )}
    </div>
  );
}