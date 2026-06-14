import { describe, it, expect } from 'vitest';
import { API_ENDPOINTS, buildEndpoint } from '@/lib/api-endpoints';

describe('API_ENDPOINTS', () => {
  it('defines auth endpoints', () => {
    expect(API_ENDPOINTS.AUTH.LOGIN).toBe('/api/auth');
    expect(API_ENDPOINTS.AUTH.ME).toBe('/api/auth/me');
  });

  it('defines queue endpoints', () => {
    expect(API_ENDPOINTS.QUEUE.CALL_NEXT).toBe('/api/queue/call-next');
    expect(API_ENDPOINTS.QUEUE.COMPLETE).toBe('/api/queue/complete');
  });
});

describe('buildEndpoint', () => {
  it('builds query string with single param', () => {
    expect(buildEndpoint('/api/tickets', { id: '123' })).toBe('/api/tickets?id=123');
  });

  it('builds query string with multiple params', () => {
    expect(buildEndpoint('/api/tickets', { serviceId: '1', status: 'PENDING' })).toBe('/api/tickets?serviceId=1&status=PENDING');
  });

  it('handles empty params', () => {
    expect(buildEndpoint('/api/tickets', {})).toBe('/api/tickets?');
  });
});
