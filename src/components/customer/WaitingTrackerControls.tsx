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
          ? 'border-border bg-card text-muted-foreground hover:bg-muted'
          : 'border-border bg-muted text-muted-foreground hover:bg-muted'
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
      className={`inline-flex items-center gap-2 sticker rounded-full border px-3 py-2 text-sm ${
        isConnected
          ? 'border-primary/20 bg-primary/5 text-primary'
          : 'border-rose-200 bg-rose-50 text-rose-700'
      }`}
    >
      {isConnected ? <Wifi className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
      <span className="hidden sm:inline">{isConnected ? 'Đã kết nối' : 'Mất kết nối'}</span>
    </div>
  );
}
