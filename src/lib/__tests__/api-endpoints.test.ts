import { describe, it, expect } from 'vitest';
import { API_ENDPOINTS, buildEndpoint } from '@/lib/api-endpoints';

describe('API_ENDPOINTS', () => {
  it('defines auth endpoints', () => {
    expect(API_ENDPOINTS.AUTH.LOGIN).toBe('/api/auth');
    expect(API_ENDPOINTS.AUTH.ME).toBe('/api/auth/me');
    expect(API_ENDPOINTS.AUTH.LOGOUT).toBe('/api/auth/logout');
    expect(API_ENDPOINTS.AUTH.DEMO_TOKEN).toBe('/api/demo-token');
  });

  it('defines queue endpoints', () => {
    expect(API_ENDPOINTS.QUEUE.CALL_NEXT).toBe('/api/queue/call-next');
    expect(API_ENDPOINTS.QUEUE.COMPLETE).toBe('/api/queue/complete');
    expect(API_ENDPOINTS.QUEUE.SKIP).toBe('/api/queue/skip');
    expect(API_ENDPOINTS.QUEUE.RESTORE).toBe('/api/queue/restore');
  });

  it('defines resource endpoints', () => {
    expect(API_ENDPOINTS.SERVICES).toBe('/api/services');
    expect(API_ENDPOINTS.SETTINGS).toBe('/api/settings');
    expect(API_ENDPOINTS.STAFF).toBe('/api/staff');
    expect(API_ENDPOINTS.TICKETS).toBe('/api/tickets');
    expect(API_ENDPOINTS.TICKETS_TRACK).toBe('/api/tickets/track');
    expect(API_ENDPOINTS.STATS).toBe('/api/stats');
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
