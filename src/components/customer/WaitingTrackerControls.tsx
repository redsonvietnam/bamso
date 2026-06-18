import { Volume2, VolumeX, Wifi, AlertTriangle } from 'lucide-react';

export function SoundToggle({ soundEnabled, onToggle }: {
  soundEnabled: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className={`rounded-full border px-3 py-2 text-sm transition ${
        soundEnabled
          ? 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
          : 'border-slate-200 bg-slate-100 text-slate-500 hover:bg-slate-200'
      }`}
      title={soundEnabled ? 'Tắt âm thanh' : 'Bật âm thanh'}
    >
      <span className="inline-flex items-center gap-2">
        {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
        <span className="hidden sm:inline">Âm thanh</span>
      </span>
    </button>
  );
}

export function ConnectionBadge({ isConnected }: { isConnected: boolean }) {
  return (
    <div
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm ${
        isConnected
          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
          : 'border-rose-200 bg-rose-50 text-rose-700'
      }`}
    >
      {isConnected ? <Wifi className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
      <span className="hidden sm:inline">{isConnected ? 'Đã kết nối' : 'Mất kết nối'}</span>
    </div>
  );
}
