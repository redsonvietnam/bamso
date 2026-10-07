import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  formatNumberForTTS,
  formatTemplateMessage,
  formatTextForSpeech,
  loadTTSSettings,
  DEFAULT_TTS_SETTINGS,
} from '@/lib/tts-service';
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

  it('keeps the generic number formatter digit-by-digit', () => {
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

describe('formatTextForSpeech ticket pronunciation', () => {
  it.each([
    ['A18', 'a mười tám'],
    ['A20', 'a hai mươi'],
    ['A21', 'a hai mươi mốt'],
    ['B34', 'bê ba mươi tư'],
    ['A11', 'a mười một'],
    ['A14', 'a mười bốn'],
    ['A15', 'a mười lăm'],
    ['A24', 'a hai mươi tư'],
    ['A25', 'a hai mươi lăm'],
    ['A0', 'a không'],
    ['A7', 'a bảy'],
    ['A10', 'a mười'],
    ['A30', 'a ba mươi'],
    ['A99', 'a chín mươi chín'],
  ])('reads ticket code %s naturally', (input, expected) => {
    expect(formatTextForSpeech(input)).toBe(expected);
  });

  it('keeps the existing digit-by-digit pronunciation', () => {
    expect(formatTextForSpeech('Số 120')).toBe('Số một hai không');
  });

  it('uses an explicit fallback for unknown and mixed prefixes', () => {
    expect(formatTextForSpeech('C12')).toBe('mã C một hai');
    expect(formatTextForSpeech('AB12')).toBe('mã AB một hai');
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

  it.each(['1', 'quầy 1', 'Quầy số 1', 'Q1'])('normalizes counter value %s without duplicating quầy', (pos) => {
    const msg = formatTemplateMessage('Mời số {ticketNumber} đến quầy {pos} để phục vụ', {
      ticketNumber: 'A001',
      pos,
    });

    expect(msg).toContain('A001');
    expect(msg).toContain('Quầy 1');
    expect(msg.match(/quầy/gi)).toHaveLength(1);
  });

  it('gives a bare counter number exactly one quầy in the default announcement template', () => {
    const msg = formatTemplateMessage('Mời số {ticketNumber} đến {pos} để phục vụ', {
      ticketNumber: 'A12',
      pos: '1',
    });

    expect(msg).toBe('Mời số A12 đến Quầy 1 để phục vụ');
    expect(msg.match(/quầy/gi)).toHaveLength(1);
  });

  it('keeps one quầy after full TTS formatting', () => {
    const msg = formatTextForSpeech(
      formatTemplateMessage('Mời số {ticketNumber} đến {pos} để phục vụ', {
        ticketNumber: 'A12',
        pos: 'Q1',
      })
    );

    expect(msg).toBe('Mời số a mười hai đến Quầy một để phục vụ');
    expect(msg.match(/quầy/gi)).toHaveLength(1);
  });

  it('returns template unchanged when data is empty', () => {
    const msg = formatTemplateMessage('Xin mời số {ticketNumber}', {});
    expect(msg).toBe('Xin mời số {ticketNumber}');
  });
});
