"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Check, Play, Volume2 } from 'lucide-react';
import { useTTS } from '@/hooks/useTTS';
import { EDGE_VI_VOICES, DEFAULT_TTS_SETTINGS } from '@/lib/tts-service';

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

      <Card>
        <CardHeader>
          <CardTitle>Bật/Tắt thông báo giọng nói</CardTitle>
          <CardDescription>Cho phép hệ thống đọc số thứ tự và thông báo bằng giọng nói</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={settings['tts_enabled'] === 'true'}
                onChange={(e) => {
                  const val = e.target.checked ? 'true' : 'false';
                  updateSetting('tts_enabled', val);
                  saveSetting('tts_enabled', val);
                }}
                className="w-5 h-5"
              />
              <span className="text-sm">{settings['tts_enabled'] === 'true' ? 'Đang bật' : 'Đang tắt'}</span>
            </label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tốc độ đọc</CardTitle>
          <CardDescription>Điều chỉnh tốc độ giọng đọc (0.5x – 2.0x)</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <span className="text-sm font-mono w-12 text-center">{settings['tts_speed'] || '0.9'}x</span>
            <div className="flex-1 max-w-xs">
              <input
                type="range" min="0.5" max="2.0" step="0.1"
                value={settings['tts_speed'] || '0.9'}
                onChange={(e) => updateSetting('tts_speed', e.target.value)}
                className="w-full"
              />
            </div>
            <Button size="sm" onClick={() => saveSetting('tts_speed', settings['tts_speed'] || '0.9')} disabled={savingKey === 'tts_speed'}>
              <Check className="w-4 h-4 mr-1" /> Lưu
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Âm lượng</CardTitle>
          <CardDescription>Điều chỉnh âm lượng phát thông báo</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <Volume2 className="w-4 h-4 text-muted-foreground" />
            <div className="flex-1 max-w-xs">
              <input
                type="range" min="0" max="1" step="0.1"
                value={settings['tts_volume'] || '1'}
                onChange={(e) => updateSetting('tts_volume', e.target.value)}
                className="w-full"
              />
            </div>
            <span className="text-sm font-mono w-8 text-center">{Math.round(parseFloat(settings['tts_volume'] || '1') * 100)}%</span>
            <Button size="sm" onClick={() => saveSetting('tts_volume', settings['tts_volume'] || '1')} disabled={savingKey === 'tts_volume'}>
              <Check className="w-4 h-4 mr-1" /> Lưu
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Công cụ đọc giọng nói</CardTitle>
          <CardDescription>Chọn engine TTS.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-6 mb-4">
            {(['google', 'edge', 'webspeech'] as const).map((provider) => (
              <label key={provider} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio" name="tts_provider"
                  value={provider}
                  checked={(settings['tts_provider'] || 'google') === provider}
                  onChange={() => { updateSetting('tts_provider', provider); saveSetting('tts_provider', provider); }}
                />
                <span className="text-sm font-medium">
                  {provider === 'google' ? 'Google TTS' : provider === 'edge' ? 'Microsoft Edge TTS' : 'Web Speech API'}
                </span>
              </label>
            ))}
          </div>

          {(settings['tts_provider'] || 'google') === 'edge' && (
            <div className="mt-4 space-y-3">
              <Label className="text-sm font-medium">Chọn giọng đọc Edge TTS:</Label>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                {EDGE_VI_VOICES.map((v) => (
                  <div
                    key={v.id}
                    className={`flex items-center justify-between gap-2 p-2 rounded-lg border cursor-pointer transition-colors ${(settings['tts_edge_voice'] || 'vi-VN-HoaiMyNeural') === v.id
                        ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/30'}`}
                    onClick={() => { updateSetting('tts_edge_voice', v.id); saveSetting('tts_edge_voice', v.id); }}
                  >
                    <span className="text-sm">{v.name}</span>
                    <button className="p-1 hover:bg-muted rounded" onClick={(e) => { e.stopPropagation(); handleTestEdgeVoice(v.id); }} title={`Phát thử ${v.name}`}>
                      <Play className="w-3.5 h-3.5 text-muted-foreground" />
                    </button>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-1">💡 Microsoft Edge TTS cần server kết nối Internet để gọi API.</p>
            </div>
          )}

          <div className="flex gap-2 mt-4">
            <Button variant="outline" size="sm" onClick={handleTest}><Play className="w-4 h-4 mr-1" /> Phát thử</Button>
            <Button variant="outline" size="sm" onClick={handleTestWebSpeech}><Play className="w-4 h-4 mr-1" /> Phát thử Web Speech</Button>
          </div>
        </CardContent>
      </Card>

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
                value={settings['tts_announcement_template'] || DEFAULT_TTS_SETTINGS.tts_announcement_template}
                onChange={(e) => updateSetting('tts_announcement_template', e.target.value)}
                className="max-w-md font-mono text-sm"
              />
              <Button size="sm" onClick={() => saveSetting('tts_announcement_template', settings['tts_announcement_template'] || '')} disabled={savingKey === 'tts_announcement_template'}>
                <Check className="w-4 h-4 mr-1" /> Lưu
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Mặc định: <code className="bg-muted px-1 rounded">{DEFAULT_TTS_SETTINGS.tts_announcement_template}</code></p>
          </div>
          <div>
            <Label className="text-sm">Khi chuẩn bị đến lượt</Label>
            <div className="flex gap-3 mt-1">
              <Input
                value={settings['tts_prepare_template'] || DEFAULT_TTS_SETTINGS.tts_prepare_template}
                onChange={(e) => updateSetting('tts_prepare_template', e.target.value)}
                className="max-w-md font-mono text-sm"
              />
              <Button size="sm" onClick={() => saveSetting('tts_prepare_template', settings['tts_prepare_template'] || '')} disabled={savingKey === 'tts_prepare_template'}>
                <Check className="w-4 h-4 mr-1" /> Lưu
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Mặc định: <code className="bg-muted px-1 rounded">{DEFAULT_TTS_SETTINGS.tts_prepare_template}</code></p>
          </div>
        </CardContent>
      </Card>

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
