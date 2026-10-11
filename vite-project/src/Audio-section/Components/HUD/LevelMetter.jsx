const SEGMENTS = 12;

export default function LevelMetter({ level = 0, muted = false }) {
  const lit = muted ? 0 : Math.round(level * SEGMENTS);

  return (
    <div
      role="meter"
      aria-label="Microphone level"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round((muted ? 0 : level) * 100)}
      className="flex h-6 items-end gap-0.5"
    >
      {Array.from({ length: SEGMENTS }, (_, i) => {
        const on = i < lit;
        const color =
          i >= SEGMENTS - 2 ? 'bg-red-400' : i >= SEGMENTS - 5 ? 'bg-amber-300' : 'bg-emerald-400';
        return (
          <span
            key={i}
            className={`w-1.5 rounded-sm transition-colors duration-75 ${on ? color : 'bg-slate-600'}`}
            style={{ height: `${40 + (i / (SEGMENTS - 1)) * 60}%` }}
          />
        );
      })}
    </div>
  );
}