import { describe, it, expect } from 'vitest';
import { formatNumberForTTS, formatTemplateMessage } from '@/lib/tts-service';

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
