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

function mockFetchStatus(status: number) {
  fetchMock.mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue({}),
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

describe('APIClient retry policy', () => {
  it('retries GET on network error (default retries = 2, 3 attempts)', async () => {
    vi.useFakeTimers();
    const client = new APIClient();
    fetchMock.mockRejectedValue(new Error('network down'));

    const request = client.get('/api/x');
    const expectation = expect(request).rejects.toThrow('network down');

    await vi.runAllTimersAsync();
    await expectation;

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('retries GET on HTTP 502 (3 attempts)', async () => {
    vi.useFakeTimers();
    const client = new APIClient();
    mockFetchStatus(502);

    const request = client.get('/api/x');
    const expectation = expect(request).rejects.toMatchObject({ status: 502 });

    await vi.runAllTimersAsync();
    await expectation;

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('retries GET on HTTP 503 (3 attempts)', async () => {
    vi.useFakeTimers();
    const client = new APIClient();
    mockFetchStatus(503);

    const request = client.get('/api/x');
    const expectation = expect(request).rejects.toMatchObject({ status: 503 });

    await vi.runAllTimersAsync();
    await expectation;

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('retries GET on HTTP 504 (3 attempts)', async () => {
    vi.useFakeTimers();
    const client = new APIClient();
    mockFetchStatus(504);

    const request = client.get('/api/x');
    const expectation = expect(request).rejects.toMatchObject({ status: 504 });

    await vi.runAllTimersAsync();
    await expectation;

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it.each([400, 401, 403, 404, 409])('does not retry GET on HTTP %i', async (status) => {
    const client = new APIClient();
    mockFetchStatus(status);

    await expect(client.get('/api/x')).rejects.toMatchObject({ status });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not retry GET on HTTP 500', async () => {
    const client = new APIClient();
    mockFetchStatus(500);

    await expect(client.get('/api/x')).rejects.toMatchObject({ status: 500 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('clamps negative retries to a single attempt', async () => {
    const client = new APIClient();
    fetchMock.mockRejectedValue(new Error('network down'));

    await expect(client.get('/api/x', { retries: -3 })).rejects.toThrow('network down');

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not retry POST after network error', async () => {
    const client = new APIClient();
    fetchMock.mockRejectedValue(new Error('network down'));

    await expect(client.post('/api/x', { a: 1 })).rejects.toThrow('network down');

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not retry PUT after network error', async () => {
    const client = new APIClient();
    fetchMock.mockRejectedValue(new Error('network down'));

    await expect(client.put('/api/x', { a: 1 })).rejects.toThrow('network down');

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not retry PATCH after network error', async () => {
    const client = new APIClient();
    fetchMock.mockRejectedValue(new Error('network down'));

    await expect(client.patch('/api/x', { a: 1 })).rejects.toThrow('network down');

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not retry DELETE after network error', async () => {
    const client = new APIClient();
    fetchMock.mockRejectedValue(new Error('network down'));

    await expect(client.delete('/api/x')).rejects.toThrow('network down');

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not retry POST on HTTP 503', async () => {
    const client = new APIClient();
    mockFetchStatus(503);

    await expect(client.post('/api/x', { a: 1 })).rejects.toMatchObject({ status: 503 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not retry GET on abort/timeout (single attempt)', async () => {
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

  it('honors retries: 0 (single attempt)', async () => {
    const client = new APIClient();
    fetchMock.mockRejectedValue(new Error('network down'));

    await expect(client.get('/api/x', { retries: 0 })).rejects.toThrow('network down');

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('honors retries: 2 (3 attempts)', async () => {
    vi.useFakeTimers();
    const client = new APIClient();
    fetchMock.mockRejectedValue(new Error('network down'));

    const request = client.get('/api/x', { retries: 2 });
    const expectation = expect(request).rejects.toThrow('network down');

    await vi.runAllTimersAsync();
    await expectation;

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('passes retries option through the get() convenience method', async () => {
    vi.useFakeTimers();
    const client = new APIClient();
    fetchMock
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce({ ok: true, json: vi.fn().mockResolvedValue({ ok: true }) });

    const request = client.get('/api/x', { retries: 1 });
    const expectation = expect(request).resolves.toEqual({ ok: true });

    await vi.runAllTimersAsync();
    await expectation;

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
