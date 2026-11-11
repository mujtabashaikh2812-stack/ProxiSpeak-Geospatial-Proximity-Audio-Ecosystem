import { useMicrophone } from '../../UseMicrophone';
import { useMicLevel } from '../../UseMiceLevel';
import MicToogle from './MicToogle';
import LevelMetter from './LevelMetter'
import MicError from './MicError';

// Pass className to place it, e.g. "fixed bottom-4 left-1/2 -translate-x-1/2"
export default function MicHud({ className = '' }) {
  const mic = useMicrophone();
  const level = useMicLevel(mic.stream);

  return (
    <div className={`flex flex-col items-center gap-2 ${className}`}>
      <MicError message={mic.error} />
      <div className="flex items-center gap-4 rounded-full bg-slate-900/90 px-4 py-2 shadow-lg">
        <MicToogle
          isActive={mic.isActive}
          isMuted={mic.isMuted}
          isStarting={mic.isStarting}
          onStart={mic.start}
          onToggleMute={mic.toggleMute}
        />
        {mic.isActive && <LevelMetter level={level} muted={mic.isMuted} />}
      </div>
    </div>
  );
}