import { describe, it, expect } from 'vitest';
import { logger } from '@/lib/logger';

describe('logger', () => {
  it('has log, warn, error, debug methods', () => {
    expect(typeof logger.log).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.error).toBe('function');
    expect(typeof logger.debug).toBe('function');
  });

  it('log runs without throwing', () => {
    expect(() => logger.log('test')).not.toThrow();
  });

  it('error runs without throwing', () => {
    expect(() => logger.error('test error')).not.toThrow();
  });
});
