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

const TICKET_PREFIX_PRONUNCIATIONS: Record<string, string> = {
  A: 'a',
  B: 'bê',
};

const VIETNAMESE_DIGITS = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];

function formatVietnameseNumber0To99(value: number): string {
  if (value < 10) return VIETNAMESE_DIGITS[value];
  if (value < 20) {
    if (value === 10) return 'mười';
    if (value === 15) return 'mười lăm';
    return `mười ${VIETNAMESE_DIGITS[value - 10]}`;
  }

  const tens = Math.floor(value / 10);
  const units = value % 10;
  if (units === 0) return `${VIETNAMESE_DIGITS[tens]} mươi`;
  if (units === 1) return `${VIETNAMESE_DIGITS[tens]} mươi mốt`;
  if (units === 4) return `${VIETNAMESE_DIGITS[tens]} mươi tư`;
  if (units === 5) return `${VIETNAMESE_DIGITS[tens]} mươi lăm`;
  return `${VIETNAMESE_DIGITS[tens]} mươi ${VIETNAMESE_DIGITS[units]}`;
}

export function formatNumberForTTS(text: string): string {
  return text.replace(/\d+/g, (s) =>
    s
      .split('')
      .map((d) => VIETNAMESE_DIGITS[parseInt(d)])
      .join(' ')
  );
}

function formatTicketCodeForSpeech(text: string): string {
  const match = text.match(/^([A-Za-z]+)(\d+)$/);
  if (!match) return formatNumberForTTS(text);

  const [, prefix, digits] = match;
  const spokenPrefix = TICKET_PREFIX_PRONUNCIATIONS[prefix.toUpperCase()];
  const fallbackPrefix = spokenPrefix || `mã ${prefix}`;
  const spokenNumber = spokenPrefix && digits.length <= 2
    ? formatVietnameseNumber0To99(Number(digits))
    : formatNumberForTTS(digits);
  return `${fallbackPrefix} ${spokenNumber}`;
}

export function formatTextForSpeech(text: string): string {
  return text
    .replace(/\b[A-Za-z]+\d+\b/g, formatTicketCodeForSpeech)
    .replace(/\d+/g, (digits) => formatNumberForTTS(digits));
}

export function normalizeCounterLabel(pos: string): string {
  const trimmed = pos.trim();
  const match = trimmed.match(/^(?:(?:quầy)(?:\s+số)?\s*|q\s*)(\d+)$/i);
  if (match) return `Quầy ${match[1]}`;
  if (/^\d+$/.test(trimmed)) return `Quầy ${trimmed}`;
  return trimmed;
}

function removeDuplicateCounterPrefix(text: string): string {
  return text.replace(/\bquầy\s+(?:số\s+)?(quầy\b)/gi, '$1');
}

export function formatTemplateMessage(
  template: string,
  data: { ticketNumber?: string; pos?: string }
): string {
  let msg = template;
  if (data.ticketNumber) msg = msg.replace('{ticketNumber}', data.ticketNumber);
  if (data.pos) msg = msg.replace('{pos}', normalizeCounterLabel(data.pos));
  return removeDuplicateCounterPrefix(msg);
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
  const keys = Object.keys(DEFAULT_TTS_SETTINGS);
  const map: Record<string, string> = { ...DEFAULT_TTS_SETTINGS };
  const results = await Promise.all(
    keys.map(async (key) => {
      try {
        const data = await apiClient.get<{ key: string; value: string }>(`/api/settings?key=${key}`);
        return { key, value: data.value };
      } catch {
        return { key, value: undefined };
      }
    })
  );
  results.forEach(({ key, value }) => {
    if (value !== undefined && value !== null) {
      map[key] = value;
    }
  });
  return map;
}

export async function saveTTSSetting(key: string, value: string): Promise<void> {
  await apiClient.put('/api/settings', { key, value });
}
