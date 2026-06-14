'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useTTS } from '@/hooks/useTTS';
import { TtsToggleCard } from '@/components/admin/TtsToggleCard';
import { TtsSliderControl } from '@/components/admin/TtsSliderControl';
import { VoiceSelector } from '@/components/admin/VoiceSelector';
import { TemplateEditor } from '@/components/admin/TemplateEditor';

export default function TtsPanel() {
  const {
    settings, loading, savingKey,
    updateSetting, saveSetting,
    handleTest, handleTestEdgeVoice, handleTestWebSpeech,
  } = useTTS();

  if (loading) return <p className="text-muted-foreground">Đang tải...</p>;

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Cài đặt giọng nói (TTS)</h2>

      <TtsToggleCard
        enabled={settings['tts_enabled'] === 'true'}
        onToggle={(val) => { updateSetting('tts_enabled', val); saveSetting('tts_enabled', val); }}
      />

      <TtsSliderControl
        cardTitle="Tốc độ đọc"
        cardDescription="Điều chỉnh tốc độ giọng đọc (0.5x – 2.0x)"
        value={settings['tts_speed'] || '0.9'} min="0.5" max="2.0" step="0.1"
        displayValue={`${settings['tts_speed'] || '0.9'}x`}
        isLoading={savingKey === 'tts_speed'}
        onValueChange={(val) => updateSetting('tts_speed', val)}
        onSave={() => saveSetting('tts_speed', settings['tts_speed'] || '0.9')}
      />

      <TtsSliderControl
        cardTitle="Âm lượng"
        cardDescription="Điều chỉnh âm lượng phát thông báo"
        value={settings['tts_volume'] || '1'} min="0" max="1" step="0.1"
        displayValue={`${Math.round(parseFloat(settings['tts_volume'] || '1') * 100)}%`}
        isLoading={savingKey === 'tts_volume'}
        onValueChange={(val) => updateSetting('tts_volume', val)}
        onSave={() => saveSetting('tts_volume', settings['tts_volume'] || '1')}
      />

      <VoiceSelector
        provider={settings['tts_provider'] || 'google'}
        edgeVoice={settings['tts_edge_voice'] || 'vi-VN-HoaiMyNeural'}
        onProviderChange={(p) => { updateSetting('tts_provider', p); saveSetting('tts_provider', p); }}
        onEdgeVoiceChange={(id) => { updateSetting('tts_edge_voice', id); saveSetting('tts_edge_voice', id); }}
        onTest={handleTest}
        onTestWebSpeech={handleTestWebSpeech}
        onTestEdge={handleTestEdgeVoice}
      />

      <TemplateEditor
        announcementTemplate={settings['tts_announcement_template'] || ''}
        prepareTemplate={settings['tts_prepare_template'] || ''}
        savingKey={savingKey}
        onAnnouncementChange={(val) => updateSetting('tts_announcement_template', val)}
        onPrepareChange={(val) => updateSetting('tts_prepare_template', val)}
        onSaveAnnouncement={() => saveSetting('tts_announcement_template', settings['tts_announcement_template'] || '')}
        onSavePrepare={() => saveSetting('tts_prepare_template', settings['tts_prepare_template'] || '')}
      />

      <Card>
        <CardHeader>
          <CardTitle>Ảnh hưởng</CardTitle>
          <CardDescription>Các thay đổi sẽ áp dụng cho toàn bộ hệ thống:</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="text-sm text-muted-foreground space-y-1 list-disc pl-5">
            <li>Bảng hiển thị (Display Board) — đọc số gọi</li>
            <li>Nhân viên (Staff Panel) — đọc số khi gọi</li>
            <li>Theo dõi khách hàng (Waiting Tracker) — nhắc sắp đến lượt</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
