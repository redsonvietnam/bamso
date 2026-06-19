import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Check } from 'lucide-react';
import { DEFAULT_TTS_SETTINGS } from '@/lib/tts-service';

interface TemplateEditorProps {
  announcementTemplate: string;
  prepareTemplate: string;
  thankYouVoiceTemplate: string;
  savingKey: string | null;
  onAnnouncementChange: (value: string) => void;
  onPrepareChange: (value: string) => void;
  onThankYouVoiceChange: (value: string) => void;
  onSaveAnnouncement: () => void;
  onSavePrepare: () => void;
  onSaveThankYouVoice: () => void;
}

export function TemplateEditor({
  announcementTemplate, prepareTemplate, thankYouVoiceTemplate, savingKey,
  onAnnouncementChange, onPrepareChange, onThankYouVoiceChange,
  onSaveAnnouncement, onSavePrepare, onSaveThankYouVoice,
}: TemplateEditorProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Mẫu thông báo</CardTitle>
        <CardDescription>Tùy chỉnh nội dung thông báo. Dùng {'{ticketNumber}'} cho số vé, {'{pos}'} cho tên quầy.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label className="text-sm">Khi gọi số mới</Label>
          <div className="flex gap-3 mt-1">
            <Input
              value={announcementTemplate}
              onChange={(e) => onAnnouncementChange(e.target.value)}
              className="max-w-md font-mono text-sm"
            />
            <Button size="sm" onClick={onSaveAnnouncement} disabled={savingKey === 'tts_announcement_template'}>
              <Check className="w-4 h-4 mr-1" /> Lưu
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-1">Mặc định: <code className="bg-muted px-1 rounded">{DEFAULT_TTS_SETTINGS.tts_announcement_template}</code></p>
        </div>
        <div>
          <Label className="text-sm">Khi chuẩn bị đến lượt</Label>
          <div className="flex gap-3 mt-1">
            <Input
              value={prepareTemplate}
              onChange={(e) => onPrepareChange(e.target.value)}
              className="max-w-md font-mono text-sm"
            />
            <Button size="sm" onClick={onSavePrepare} disabled={savingKey === 'tts_prepare_template'}>
              <Check className="w-4 h-4 mr-1" /> Lưu
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-1">Mặc định: <code className="bg-muted px-1 rounded">{DEFAULT_TTS_SETTINGS.tts_prepare_template}</code></p>
        </div>
        <div>
          <Label className="text-sm">Khi cảm ơn sau khi hoàn thành</Label>
          <div className="flex gap-3 mt-1">
            <Input
              value={thankYouVoiceTemplate}
              onChange={(e) => onThankYouVoiceChange(e.target.value)}
              className="max-w-md font-mono text-sm"
            />
            <Button size="sm" onClick={onSaveThankYouVoice} disabled={savingKey === 'thank_you_voice_template'}>
              <Check className="w-4 h-4 mr-1" /> Lưu
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-1">Mặc định: <code className="bg-muted px-1 rounded">{DEFAULT_TTS_SETTINGS.thank_you_voice_template}</code></p>
        </div>
      </CardContent>
    </Card>
  );
}
