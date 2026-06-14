export const API_ENDPOINTS = {
  AUTH: {
    LOGIN: '/api/auth',
    ME: '/api/auth/me',
    LOGOUT: '/api/auth/logout',
    DEMO_TOKEN: '/api/demo-token',
  },
  SERVICES: '/api/services',
  SETTINGS: '/api/settings',
  STAFF: '/api/staff',
  TICKETS: '/api/tickets',
  TICKETS_TRACK: '/api/tickets/track',
  STATS: '/api/stats',
  QUEUE: {
    CALL_NEXT: '/api/queue/call-next',
    COMPLETE: '/api/queue/complete',
    SKIP: '/api/queue/skip',
    RESTORE: '/api/queue/restore',
  },
} as const;

export function buildEndpoint(base: string, params: Record<string, string>): string {
  const searchParams = new URLSearchParams(params);
  return `${base}?${searchParams.toString()}`;
}
