'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';
import {
  loadTTSSettings,
  saveTTSSetting,
  buildTtsAudioUrl,
  playAudio,
  speakWithWebSpeech,
  formatNumberForTTS,
  formatTemplateMessage,
  DEFAULT_TTS_SETTINGS,
} from '@/lib/tts-service';

type TTSSettings = Record<string, string>;

export function useTTS() {
  const [settings, setSettings] = useState<TTSSettings>({});
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadTTSSettings()
      .then((data) => {
        if (!cancelled) setSettings(data);
      })
      .catch((err) => {
        logger.error('Error loading TTS settings:', err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const updateSetting = useCallback((key: string, value: string) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }, []);

  const saveSetting = useCallback(async (key: string, value: string) => {
    setSavingKey(key);
    try {
      await saveTTSSetting(key, value);
      toast.success('Đã lưu cài đặt.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Lỗi lưu cài đặt.');
    } finally {
      setSavingKey(null);
    }
  }, []);

  const handleTest = useCallback(async () => {
    const template = settings['tts_announcement_template'] || DEFAULT_TTS_SETTINGS.tts_announcement_template;
    const text = formatTemplateMessage(template, { ticketNumber: 'A001', pos: 'Quầy 1' });
    const formattedText = formatNumberForTTS(text);
    const provider = settings['tts_provider'] || 'google';
    const volume = parseFloat(settings['tts_volume'] || '1');

    if (provider === 'webspeech') {
      speakWithWebSpeech(formattedText, parseFloat(settings['tts_speed'] || '0.9'), volume);
      return;
    }

    const voice = provider === 'edge' ? settings['tts_edge_voice'] : undefined;
    const url = buildTtsAudioUrl(formattedText, provider, voice);

    try {
      await playAudio(url, volume);
    } catch {
      speakWithWebSpeech(formattedText, parseFloat(settings['tts_speed'] || '0.9'), volume);
    }
  }, [settings]);

  const handleTestEdgeVoice = useCallback(
    async (voiceId: string) => {
      const template = settings['tts_announcement_template'] || DEFAULT_TTS_SETTINGS.tts_announcement_template;
      const text = formatTemplateMessage(template, { ticketNumber: 'A001', pos: 'Quầy 1' });
      const formattedText = formatNumberForTTS(text);
      const url = buildTtsAudioUrl(formattedText, 'edge', voiceId);
      try {
        await playAudio(url, parseFloat(settings['tts_volume'] || '1'));
      } catch {
        toast.error('Không thể phát thử giọng.');
      }
    },
    [settings]
  );

  const handleTestWebSpeech = useCallback(() => {
    const text = formatNumberForTTS('Mời số A001 đến Quầy một để phục vụ');
    speakWithWebSpeech(text, parseFloat(settings['tts_speed'] || '0.9'), parseFloat(settings['tts_volume'] || '1'));
  }, [settings]);

  return {
    settings,
    loading,
    savingKey,
    updateSetting,
    saveSetting,
    handleTest,
    handleTestEdgeVoice,
    handleTestWebSpeech,
  };
}
