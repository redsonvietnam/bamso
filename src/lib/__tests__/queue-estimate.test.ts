import { describe, expect, it } from 'vitest';
import { estimateWaitTime } from '@/lib/queue-estimate';

describe('estimateWaitTime', () => {
  it('returns 0 minutes when 0 tickets ahead', () => {
    const result = estimateWaitTime(0, 300);
    expect(result).toEqual({ minutes: 0, available: true });
  });

  it('returns null when avgServiceTime is null', () => {
    const result = estimateWaitTime(3, null);
    expect(result).toEqual({ minutes: null, available: false });
  });

  it('returns null when avgServiceTime is 0', () => {
    const result = estimateWaitTime(3, 0);
    expect(result).toEqual({ minutes: null, available: false });
  });

  it('calculates correct minutes for 1 ticket ahead', () => {
    const result = estimateWaitTime(1, 300);
    expect(result).toEqual({ minutes: 5, available: true });
  });

  it('calculates correct minutes for multiple tickets', () => {
    const result = estimateWaitTime(3, 300);
    expect(result).toEqual({ minutes: 15, available: true });
  });

  it('rounds up to at least 1 minute', () => {
    const result = estimateWaitTime(1, 30);
    expect(result).toEqual({ minutes: 1, available: true });
  });

  it('handles very large duration', () => {
    const result = estimateWaitTime(10, 3600);
    expect(result).toEqual({ minutes: 600, available: true });
  });

  it('handles very small duration', () => {
    const result = estimateWaitTime(1, 10);
    expect(result).toEqual({ minutes: 1, available: true });
  });

  it('returns available true when avgServiceTime is positive', () => {
    const result = estimateWaitTime(2, 120);
    expect(result.available).toBe(true);
    expect(result.minutes).toBe(4);
  });
});
