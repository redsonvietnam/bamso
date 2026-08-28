import { describe, it, expect, vi, beforeEach } from 'vitest';
import { formatNumberForTTS, formatTemplateMessage, loadTTSSettings, DEFAULT_TTS_SETTINGS } from '@/lib/tts-service';
import { apiClient } from '@/lib/api-client';

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    get: vi.fn(),
    put: vi.fn(),
  },
}));

describe('loadTTSSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches each setting by key via public settings endpoint', async () => {
    vi.mocked(apiClient.get).mockImplementation(async (url: string) => {
      if (url === '/api/settings?key=tts_speed') {
        return { key: 'tts_speed', value: '1.2' };
      }
      return { key: '', value: null };
    });

    const settings = await loadTTSSettings();
    expect(settings.tts_speed).toBe('1.2');
    expect(settings.tts_enabled).toBe(DEFAULT_TTS_SETTINGS.tts_enabled);
    expect(apiClient.get).toHaveBeenCalledWith('/api/settings?key=tts_speed');
  });

  it('falls back to defaults if key fetch fails', async () => {
    vi.mocked(apiClient.get).mockRejectedValue(new Error('Network error'));
    const settings = await loadTTSSettings();
    expect(settings).toEqual(DEFAULT_TTS_SETTINGS);
  });
});

describe('formatNumberForTTS', () => {
  it('formats single digit', () => {
    expect(formatNumberForTTS('5')).toBe('năm');
  });

  it('replaces each digit in multi-digit numbers', () => {
    expect(formatNumberForTTS('12')).toBe('một hai');
  });

  it('handles multiple digit groups', () => {
    expect(formatNumberForTTS('A12B3')).toBe('Amột haiBba');
  });

  it('handles number with leading zeros', () => {
    expect(formatNumberForTTS('001')).toBe('không không một');
  });

  it('handles empty string', () => {
    expect(formatNumberForTTS('')).toBe('');
  });

  it('returns text unchanged when no digits', () => {
    expect(formatNumberForTTS('ABC')).toBe('ABC');
  });
});

describe('formatTemplateMessage', () => {
  it('replaces {ticketNumber} with formatted number', () => {
    const msg = formatTemplateMessage('Xin mời số {ticketNumber}', { ticketNumber: 'A001' });
    expect(msg).toContain('A001');
  });

  it('replaces {pos} with counter name', () => {
    const msg = formatTemplateMessage('ra quầy {pos}', { pos: 'Quầy 1' });
    expect(msg).toContain('Quầy 1');
  });

  it('handles message with no placeholders', () => {
    const msg = formatTemplateMessage('Xin cảm ơn', {});
    expect(msg).toBe('Xin cảm ơn');
  });

  it('replaces both placeholders', () => {
    const msg = formatTemplateMessage('Số {ticketNumber} mời đến {pos}', { ticketNumber: 'A001', pos: 'Quầy 1' });
    expect(msg).toContain('A001');
    expect(msg).toContain('Quầy 1');
  });

  it('returns template unchanged when data is empty', () => {
    const msg = formatTemplateMessage('Xin mời số {ticketNumber}', {});
    expect(msg).toBe('Xin mời số {ticketNumber}');
  });
});
