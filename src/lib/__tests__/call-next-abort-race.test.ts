import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { APIClient, CALL_NEXT_TIMEOUT } from '@/lib/api-client';
import { TicketStatus } from '@/lib/constants';

type HarnessTicket = {
  id: string;
  serviceId: string;
  status: TicketStatus;
  position: number;
  pos: string | null;
};

const state: {
  ticket: HarnessTicket;
  displayEvents: Array<{ eventId: string; ticketId: string; status: string }>;
} = {
  ticket: { id: 'ticket-1', serviceId: 'svc-1', status: TicketStatus.PENDING, position: 1, pos: null },
  displayEvents: [],
};

let transactionMode: 'commit' | 'rollback' = 'commit';
let releaseTransaction!: () => void;
let transactionStarted!: Promise<void>;

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), log: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/audit-service', () => ({
  writeAuditLog: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  default: {
    $transaction: vi.fn(),
  },
}));

import prisma from '@/lib/db';
import { callNextTicket } from '@/lib/queue-service';

const mockedPrisma = prisma as unknown as {
  $transaction: ReturnType<typeof vi.fn>;
};

function resetState() {
  state.ticket = {
    id: 'ticket-1',
    serviceId: 'svc-1',
    status: TicketStatus.PENDING as TicketStatus,
    position: 1,
    pos: null,
  };
  state.displayEvents = [];
  transactionMode = 'commit';
}

type HarnessTx = {
  ticket: {
    findMany: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
  };
  displayCallEvent: {
    create: ReturnType<typeof vi.fn>;
  };
};

function installTransactionHarness() {
  mockedPrisma.$transaction.mockImplementation(
    async (
      callback: (tx: HarnessTx) => Promise<unknown>,
      options?: { timeout?: number },
    ) => {
      expect(options?.timeout).toBe(15000);

      if (transactionMode === 'rollback') {
        await new Promise<void>((resolve) => setTimeout(resolve, 15000));
        throw new Error('P2028: Transaction exceeded timeout');
      }

      await transactionStarted;

      const tx = {
        ticket: {
          findMany: vi.fn().mockResolvedValue(
            state.ticket.status === TicketStatus.CALLED ? [{ id: state.ticket.id }] : [],
          ),
          updateMany: vi.fn().mockImplementation(async ({
            where,
            data,
          }: {
            where: { id?: string; status?: TicketStatus; pos?: string };
            data: Partial<HarnessTicket>;
          }) => {
            if (where?.id === state.ticket.id && where.status === TicketStatus.PENDING) {
              if (state.ticket.status !== TicketStatus.PENDING) return { count: 0 };
              state.ticket = { ...state.ticket, ...data };
              return { count: 1 };
            }

            if (where?.pos === 'Q1') {
              if (state.ticket.status === TicketStatus.CALLED || state.ticket.status === TicketStatus.IN_PROGRESS) {
                state.ticket = { ...state.ticket, ...data };
                return { count: 1 };
              }
              return { count: 0 };
            }

            return { count: 0 };
          }),
          findFirst: vi.fn().mockImplementation(async ({
            where,
          }: {
            where: { serviceId?: string; status?: TicketStatus };
          }) => {
            if (where?.serviceId === 'svc-1' && where?.status === TicketStatus.PENDING) {
              return state.ticket.status === TicketStatus.PENDING ? state.ticket : null;
            }
            return null;
          }),
          findUnique: vi.fn().mockImplementation(async () => ({
            ...state.ticket,
            service: { id: 'svc-1' },
          })),
        },
        displayCallEvent: {
          create: vi.fn().mockImplementation(async ({
            data,
          }: {
            data: Record<string, unknown>;
          }) => {
            const event = { id: 'row-1', ...data };
            state.displayEvents.push({
              eventId: String(data.eventId),
              ticketId: String(data.ticketId),
              status: String(data.status),
            });
            return event;
          }),
        },
      };

      return callback(tx);
    },
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  resetState();
  transactionStarted = new Promise<void>((resolve) => {
    releaseTransaction = resolve;
  });
  installTransactionHarness();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('A2.5 controlled call-next abort race', () => {
  it('Scenario 1: server completes before the 10s client timeout', async () => {
    releaseTransaction();

    const result = await callNextTicket('svc-1', 'Q1', undefined, { includeDisplayEvent: true });

    expect(result.ticket.status).toBe(TicketStatus.CALLED);
    expect(result.ticket.id).toBe('ticket-1');
    expect(state.displayEvents).toHaveLength(1);
    expect(state.displayEvents[0]).toMatchObject({
      ticketId: 'ticket-1',
      status: 'PENDING',
    });
  });

  it('Scenario 2: server commits at 12s and the call-next client remains alive', async () => {
    const client = new APIClient();
    let serverPromise: Promise<unknown> | undefined;

    const fetchMock = vi.fn().mockImplementation((_url: string, _init: RequestInit) => {
      serverPromise = callNextTicket('svc-1', 'Q1', undefined, { includeDisplayEvent: true });

      return serverPromise.then(() => ({
        ok: true,
        json: vi.fn().mockResolvedValue({ ticketId: 'ticket-1' }),
      }));
    });
    vi.stubGlobal('fetch', fetchMock);

    const clientRequest = client.post(
      '/api/queue/call-next',
      { serviceId: 'svc-1', pos: 'Q1' },
      { timeout: CALL_NEXT_TIMEOUT, retries: 0 },
    );

    setTimeout(releaseTransaction, 12000);
    await vi.advanceTimersByTimeAsync(12000);
    await serverPromise;

    await expect(clientRequest).resolves.toEqual({ ticketId: 'ticket-1' });
    expect(state.ticket.status).toBe(TicketStatus.CALLED);
    expect(state.displayEvents).toHaveLength(1);
    expect(state.displayEvents[0]).toMatchObject({
      ticketId: 'ticket-1',
      status: 'PENDING',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('A3: a server completion beyond the call-next timeout is no longer hidden before 16s', async () => {
    const client = new APIClient();
    let resolveServer!: () => void;
    const serverCompletion = new Promise<void>((resolve) => {
      resolveServer = resolve;
    });
    const fetchMock = vi.fn().mockImplementation((_url: string, init: RequestInit) => (
      Promise.race([
        serverCompletion.then(() => ({
          ok: true,
          json: vi.fn().mockResolvedValue({ ticketId: 'ticket-1' }),
        })),
        new Promise<never>((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => {
            reject(new DOMException('The operation was aborted.', 'AbortError'));
          });
        }),
      ])
    ));
    vi.stubGlobal('fetch', fetchMock);

    const clientRequest = client.post(
      '/api/queue/call-next',
      { serviceId: 'svc-1', pos: 'Q1' },
      { timeout: CALL_NEXT_TIMEOUT, retries: 0 },
    );
    const clientResult = expect(clientRequest).rejects.toThrow(`Request timed out after ${CALL_NEXT_TIMEOUT}ms`);

    await vi.advanceTimersByTimeAsync(CALL_NEXT_TIMEOUT - 1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await clientResult;

    resolveServer();
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('Scenario 3: server exceeds the 15s transaction boundary and does not commit', async () => {
    transactionMode = 'rollback';
    const serverPromise = callNextTicket('svc-1', 'Q1', undefined, { includeDisplayEvent: true });
    const serverResult = expect(serverPromise).rejects.toThrow('Transaction exceeded timeout');

    await vi.advanceTimersByTimeAsync(15000);
    await serverResult;

    expect(state.ticket.status).toBe(TicketStatus.PENDING);
    expect(state.displayEvents).toHaveLength(0);
    expect(mockedPrisma.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      { timeout: 15000 },
    );
  });
});
