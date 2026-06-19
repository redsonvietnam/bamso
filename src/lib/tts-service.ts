import { apiClient } from '@/lib/api-client';

export const EDGE_VI_VOICES = [
  { id: 'vi-VN-HoaiMyNeural', name: 'Hoài My (Nữ)' },
  { id: 'vi-VN-NamMinhNeural', name: 'Nam Minh (Nam)' },
  { id: 'vi-VN-LanAnhNeural', name: 'Lan Anh (Nữ, Tự nhiên)' },
  { id: 'vi-VN-NguyenBaoNeural', name: 'Nguyên Bảo (Nam, Tự nhiên)' },
  { id: 'vi-VN-MyDuyenNeural', name: 'My Duyên (Nữ)' },
  { id: 'vi-VN-MyLinhNeural', name: 'My Linh (Nữ, Tự nhiên)' },
  { id: 'vi-VN-QuynhChiNeural', name: 'Quỳnh Chi (Nữ)' },
  { id: 'vi-VN-BichNgocNeural', name: 'Bích Ngọc (Nữ, Tự nhiên)' },
  { id: 'vi-VN-ThiLeNeural', name: 'Thi Lệ (Nữ, Tự nhiên)' },
];

export const DEFAULT_TTS_SETTINGS: Record<string, string> = {
  tts_enabled: 'true',
  tts_speed: '0.9',
  tts_volume: '1',
  tts_provider: 'google',
  tts_edge_voice: 'vi-VN-HoaiMyNeural',
  tts_announcement_template: 'Mời số {ticketNumber} đến {pos} để phục vụ',
  tts_prepare_template: 'Số {ticketNumber} chuẩn bị',
  thank_you_voice_template: 'Cảm ơn bạn. Số {ticketNumber} đã được phục vụ xong.',
};

export type TTSVoice = { id: string; name: string };
export type TTSSettings = Record<string, string>;

export function formatNumberForTTS(text: string): string {
  return text.replace(/\d+/g, (s) =>
    s
      .split('')
      .map((d) => 'không một hai ba bốn năm sáu bảy tám chín'.split(' ')[parseInt(d)])
      .join(' ')
  );
}

export function formatTemplateMessage(
  template: string,
  data: { ticketNumber?: string; pos?: string }
): string {
  let msg = template;
  if (data.ticketNumber) msg = msg.replace('{ticketNumber}', data.ticketNumber);
  if (data.pos) msg = msg.replace('{pos}', data.pos);
  return msg;
}

export function buildTtsAudioUrl(text: string, provider: string, voice?: string): string {
  if (provider === 'edge' && voice) {
    return `/api/tts?provider=edge&voice=${encodeURIComponent(voice)}&text=${encodeURIComponent(text)}`;
  }
  return `/api/tts?text=${encodeURIComponent(text)}`;
}

export function playAudio(url: string, volume: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const audio = new Audio(url);
    audio.volume = volume;
    audio.onended = () => resolve();
    audio.onerror = () => reject(new Error('Audio play failed'));
    audio.play().catch(reject);
  });
}

export function speakWithWebSpeech(text: string, rate: number, volume: number): void {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'vi-VN';
  utterance.rate = rate;
  utterance.volume = volume;
  const voices = window.speechSynthesis.getVoices();
  const viVoice = voices.find((v) => v.lang.startsWith('vi') || v.name.toLowerCase().includes('vietnamese'));
  if (viVoice) utterance.voice = viVoice;
  window.speechSynthesis.speak(utterance);
}

export async function loadTTSSettings(): Promise<Record<string, string>> {
  const data = await apiClient.get<{ key: string; value: string }[]>('/api/settings');
  const map: Record<string, string> = { ...DEFAULT_TTS_SETTINGS };
  data.forEach((s) => {
    if (s.key in DEFAULT_TTS_SETTINGS) {
      map[s.key] = s.value;
    }
  });
  return map;
}

export async function saveTTSSetting(key: string, value: string): Promise<void> {
  await apiClient.put('/api/settings', { key, value });
}
