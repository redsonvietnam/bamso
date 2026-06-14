import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Play } from 'lucide-react';
import { EDGE_VI_VOICES } from '@/lib/tts-service';

interface VoiceSelectorProps {
  provider: string;
  edgeVoice: string;
  onProviderChange: (provider: string) => void;
  onEdgeVoiceChange: (voiceId: string) => void;
  onTest: () => void;
  onTestWebSpeech: () => void;
  onTestEdge: (voiceId: string) => void;
}

export function VoiceSelector({
  provider, edgeVoice, onProviderChange, onEdgeVoiceChange,
  onTest, onTestWebSpeech, onTestEdge,
}: VoiceSelectorProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Công cụ đọc giọng nói</CardTitle>
        <CardDescription>Chọn engine TTS.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-6 mb-4">
          {(['google', 'edge', 'webspeech'] as const).map((p) => (
            <label key={p} className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio" name="tts_provider"
                value={p}
                checked={provider === p}
                onChange={() => onProviderChange(p)}
              />
              <span className="text-sm font-medium">
                {p === 'google' ? 'Google TTS' : p === 'edge' ? 'Microsoft Edge TTS' : 'Web Speech API'}
              </span>
            </label>
          ))}
        </div>

        {provider === 'edge' && (
          <div className="mt-4 space-y-3">
            <Label className="text-sm font-medium">Chọn giọng đọc Edge TTS:</Label>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              {EDGE_VI_VOICES.map((v) => (
                <div
                  key={v.id}
                  className={`flex items-center justify-between gap-2 p-2 rounded-lg border cursor-pointer transition-colors ${edgeVoice === v.id
                    ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/30'}`}
                  onClick={() => onEdgeVoiceChange(v.id)}
                >
                  <span className="text-sm">{v.name}</span>
                  <button className="p-1 hover:bg-muted rounded" onClick={(e) => { e.stopPropagation(); onTestEdge(v.id); }} title={`Phát thử ${v.name}`}>
                    <Play className="w-3.5 h-3.5 text-muted-foreground" />
                  </button>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-1">💡 Microsoft Edge TTS cần server kết nối Internet để gọi API.</p>
          </div>
        )}

        <div className="flex gap-2 mt-4">
          <Button variant="outline" size="sm" onClick={onTest}><Play className="w-4 h-4 mr-1" /> Phát thử</Button>
          <Button variant="outline" size="sm" onClick={onTestWebSpeech}><Play className="w-4 h-4 mr-1" /> Phát thử Web Speech</Button>
        </div>
      </CardContent>
    </Card>
  );
}
