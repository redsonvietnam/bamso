import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({
  default: {
    ticket: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn() },
}));

import { GET } from '@/app/api/queue/estimate/route';
import prisma from '@/lib/db';

const mockedTicketFindMany = prisma.ticket.findMany as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

function makeRequest(url: string) {
  return new Request(`http://localhost${url}`);
}

describe('GET /api/queue/estimate', () => {
  it('rejects request without serviceId', async () => {
    const res = await GET(makeRequest('/api/queue/estimate'));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.code).toBe('MISSING_SERVICE_ID');
  });

  it('returns null when no completed tickets today', async () => {
    mockedTicketFindMany.mockResolvedValue([]);
    const res = await GET(makeRequest('/api/queue/estimate?serviceId=s1'));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.avgServiceTimeSeconds).toBeNull();
  });

  it('calculates average service time from completed tickets', async () => {
    const now = Date.now();
    mockedTicketFindMany.mockResolvedValue([
      { createdAt: new Date(now - 600000), completedAt: new Date(now - 300000) },
      { createdAt: new Date(now - 400000), completedAt: new Date(now - 100000) },
    ]);
    const res = await GET(makeRequest('/api/queue/estimate?serviceId=s1'));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.avgServiceTimeSeconds).toBe(300);
  });

  it('uses correct date range for today', async () => {
    mockedTicketFindMany.mockResolvedValue([]);
    await GET(makeRequest('/api/queue/estimate?serviceId=s1'));
    expect(mockedTicketFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          serviceId: 's1',
          status: 'COMPLETED',
        }),
      })
    );
  });
});
