import { logger } from '@/lib/logger';
import type { APIClientConfig, RequestOptions } from '@/types/api';

const DEFAULT_CONFIG: APIClientConfig = {
  credentials: 'include',
  headers: { 'Content-Type': 'application/json' },
};

async function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class APIClient {
  private config: APIClientConfig;

  constructor(config: APIClientConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async request<T>(endpoint: string, options: RequestOptions): Promise<T> {
    const url = `${this.config.baseUrl ?? ''}${endpoint}`;
    const { body, method, headers, signal } = options;

    const fetchOptions: RequestInit = {
      method,
      credentials: this.config.credentials,
      signal,
      headers: { ...this.config.headers, ...headers },
    };

    if (body && method !== 'GET') {
      fetchOptions.body = JSON.stringify(body);
    }

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        if (attempt > 0) {
          await delay(Math.min(1000 * 2 ** attempt, 5000));
        }

        const res = await fetch(url, fetchOptions);

        if (!res.ok) {
          const errorBody = await res.json().catch(() => ({}));
          const error = new Error(errorBody.error ?? `Request failed with status ${res.status}`);
          (error as Error & { status?: number }).status = res.status;
          throw error;
        }

        return (await res.json()) as T;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        // IMPORTANT: Do NOT retry non-idempotent requests (POST, PATCH) 
        // to prevent duplicate data creation on the server.
        if (method === 'POST' || method === 'PATCH') {
          throw lastError;
        }

        if (error instanceof DOMException && error.name === 'AbortError') {
          throw error;
        }
        logger.warn(`API request failed (attempt ${attempt + 1}/3): ${endpoint}`, {
          error: lastError.message,
        });
      }
    }

    throw lastError ?? new Error('Request failed');
  }

  get<T>(endpoint: string, signal?: AbortSignal): Promise<T> {
    return this.request<T>(endpoint, { method: 'GET', signal });
  }

  post<T>(endpoint: string, body?: unknown): Promise<T> {
    return this.request<T>(endpoint, { method: 'POST', body });
  }

  put<T>(endpoint: string, body?: unknown): Promise<T> {
    return this.request<T>(endpoint, { method: 'PUT', body });
  }

  delete<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: 'DELETE' });
  }
}

export const apiClient = new APIClient();
