import { logger } from '@/lib/logger';
import type { APIClientConfig, RequestOptions } from '@/types/api';

const DEFAULT_CONFIG: APIClientConfig = {
  credentials: 'include',
  headers: { 'Content-Type': 'application/json' },
};

const DEFAULT_TIMEOUT = 10000;

type RequestMethodOptions = Omit<RequestOptions, 'method' | 'body'>;

async function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isAbortSignal(value: unknown): value is AbortSignal {
  return !!value && typeof value === 'object' && 'aborted' in value && 'addEventListener' in value;
}

function normalizeOptions(optionsOrSignal?: RequestMethodOptions | AbortSignal): RequestMethodOptions {
  return isAbortSignal(optionsOrSignal) ? { signal: optionsOrSignal } : optionsOrSignal ?? {};
}

function combineSignals(signals: AbortSignal[]): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController();
  const cleanupCallbacks: Array<() => void> = [];

  const abort = () => {
    if (!controller.signal.aborted) {
      controller.abort();
    }
  };

  for (const signal of signals) {
    if (signal.aborted) {
      abort();
      continue;
    }

    signal.addEventListener('abort', abort, { once: true });
    cleanupCallbacks.push(() => signal.removeEventListener('abort', abort));
  }

  return {
    signal: controller.signal,
    cleanup: () => {
      for (const cleanup of cleanupCallbacks) cleanup();
    },
  };
}

export class APIClient {
  private config: APIClientConfig;

  constructor(config: APIClientConfig = {}) {
    this.config = {
      ...DEFAULT_CONFIG,
      baseUrl: process.env.NEXT_PUBLIC_API_BASE_URL,
      ...config
    };
  }

  async request<T>(endpoint: string, options: RequestOptions): Promise<T> {
    const url = `${this.config.baseUrl ?? ''}${endpoint}`;
    const { body, method, headers, signal, timeout = DEFAULT_TIMEOUT, retries = 2 } = options;

    const requestBody = body && method !== 'GET' ? JSON.stringify(body) : undefined;

    const maxAttempts = method === 'GET' ? Math.max(1, retries + 1) : 1;

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      let cleanup = () => {};
      let finalSignal: AbortSignal | undefined;

      try {
        if (attempt > 0) {
          await delay(Math.min(1000 * 2 ** attempt, 5000));
        }

        const timeoutController = new AbortController();
        const timeoutId = setTimeout(() => timeoutController.abort(), timeout);
        const combined = signal
          ? combineSignals([signal, timeoutController.signal])
          : { signal: timeoutController.signal, cleanup: () => {} };
        finalSignal = combined.signal;
        cleanup = () => {
          clearTimeout(timeoutId);
          combined.cleanup();
        };

        const fetchOptions: RequestInit = {
          method,
          credentials: this.config.credentials,
          signal: combined.signal,
          headers: { ...this.config.headers, ...headers },
        };

        if (requestBody) {
          fetchOptions.body = requestBody;
        }

        try {
          const res = await fetch(url, fetchOptions);

          if (!res.ok) {
            const errorBody = await res.json().catch(() => ({}));
            const error = new Error(
              errorBody.error ?? `Request failed with status ${res.status}`
            );
            (error as Error & { status?: number }).status = res.status;
            throw error;
          }

          return (await res.json()) as T;
        } finally {
          cleanup();
        }
      } catch (error) {
        if (finalSignal?.aborted) {
          throw error;
        }

        lastError = error instanceof Error ? error : new Error(String(error));

        const status = (lastError as { status?: number }).status;
        const isNetworkError = status === undefined;
        const isRetryable = isNetworkError || status === 502 || status === 503 || status === 504;

        if (!isRetryable || attempt >= maxAttempts - 1) {
          throw lastError;
        }

        logger.warn(`API request failed (attempt ${attempt + 1}/${maxAttempts}): ${endpoint}`, {
          error: lastError.message,
        });
      }
    }

    throw lastError ?? new Error('Request failed');
  }

  get<T>(endpoint: string, optionsOrSignal?: RequestMethodOptions | AbortSignal): Promise<T> {
    return this.request<T>(endpoint, { method: 'GET', ...normalizeOptions(optionsOrSignal) });
  }

  post<T>(endpoint: string, body?: unknown, options?: RequestMethodOptions): Promise<T> {
    return this.request<T>(endpoint, { method: 'POST', body, ...options });
  }

  put<T>(endpoint: string, body?: unknown, options?: RequestMethodOptions): Promise<T> {
    return this.request<T>(endpoint, { method: 'PUT', body, ...options });
  }

  patch<T>(endpoint: string, body?: unknown, options?: RequestMethodOptions): Promise<T> {
    return this.request<T>(endpoint, { method: 'PATCH', body, ...options });
  }

  delete<T>(endpoint: string, options?: RequestMethodOptions): Promise<T> {
    return this.request<T>(endpoint, { method: 'DELETE', ...options });
  }
}

export const apiClient = new APIClient();
