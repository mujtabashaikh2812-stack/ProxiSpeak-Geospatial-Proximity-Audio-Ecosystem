function MicIcon({ muted }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
      {muted && <path d="M4 4l16 16" />}
    </svg>
  );
}

export default function MicToogle({ isActive, isMuted, isStarting, onStart, onToggleMute }) {
  if (!isActive) {
    return (
      <button
        type="button"
        onClick={onStart}
        disabled={isStarting}
        className="flex items-center gap-2 rounded-full bg-emerald-500 px-4 py-2 text-sm font-medium text-slate-900 hover:bg-emerald-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:opacity-60"
      >
        <MicIcon muted={false} />
        {isStarting ? 'Starting…' : 'Enable microphone'}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onToggleMute}
      aria-pressed={isMuted}
      aria-label={isMuted ? 'Unmute microphone' : 'Mute microphone'}
      className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-white ${
        isMuted ? 'bg-red-500 text-white hover:bg-red-400' : 'bg-slate-700 text-white hover:bg-slate-600'
      }`}
    >
      <MicIcon muted={isMuted} />
      {isMuted ? 'Unmute' : 'Mute'}
    </button>
  );
}