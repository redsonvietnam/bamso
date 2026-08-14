import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { APIClient } from '@/lib/api-client';

vi.mock('@/lib/logger', () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    debug: vi.fn(),
  },
}));

const fetchMock = vi.fn();

function mockFetchJson(data: unknown) {
  fetchMock.mockResolvedValue({
    ok: true,
    json: vi.fn().mockResolvedValue(data),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('APIClient timeout and abort handling', () => {
  it('passes a timeout signal to fetch and aborts without retrying', async () => {
    vi.useFakeTimers();
    const client = new APIClient();

    fetchMock.mockImplementation((_url: string, init: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => {
          reject(new DOMException('The operation was aborted.', 'AbortError'));
        });
      });
    });

    const request = client.get('/api/slow', { timeout: 100 });
    const expectation = expect(request).rejects.toMatchObject({ name: 'AbortError' });

    await vi.advanceTimersByTimeAsync(100);

    await expectation;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not retry when the caller aborts the request', async () => {
    const client = new APIClient();
    const controller = new AbortController();

    fetchMock.mockImplementation((_url: string, init: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => {
          reject(new DOMException('The operation was aborted.', 'AbortError'));
        });
      });
    });

    const request = client.get('/api/abort', controller.signal);
    const expectation = expect(request).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort();

    await expectation;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('cleans up caller abort listeners after a successful request', async () => {
    const client = new APIClient();
    const controller = new AbortController();
    const addListener = vi.spyOn(controller.signal, 'addEventListener');
    const removeListener = vi.spyOn(controller.signal, 'removeEventListener');
    mockFetchJson({ ok: true });

    await expect(client.get('/api/ok', { signal: controller.signal })).resolves.toEqual({ ok: true });

    expect(addListener).toHaveBeenCalledWith('abort', expect.any(Function), { once: true });
    expect(removeListener).toHaveBeenCalledWith('abort', expect.any(Function));
  });

  it('clears timeout timers after a successful request', async () => {
    vi.useFakeTimers();
    const client = new APIClient();
    mockFetchJson({ ok: true });

    await expect(client.get('/api/ok', { timeout: 5000 })).resolves.toEqual({ ok: true });

    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not retry POST requests after network errors', async () => {
    const client = new APIClient();
    fetchMock.mockRejectedValue(new Error('network down'));

    await expect(client.post('/api/tickets', { serviceId: 'svc-1' })).rejects.toThrow('network down');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('supports PATCH convenience requests', async () => {
    const client = new APIClient();
    mockFetchJson({ saved: true });

    await expect(client.patch('/api/settings', { theme: 'dark' })).resolves.toEqual({ saved: true });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/settings',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ theme: 'dark' }),
      })
    );
  });
});
