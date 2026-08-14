export type APIResponse<T> = {
  success: boolean;
  data: T;
  error?: string;
};

export type APIError = {
  code: string;
  message: string;
  status: number;
};

export type APIClientConfig = {
  baseUrl?: string;
  credentials?: RequestCredentials;
  headers?: Record<string, string>;
};

export type RequestOptions = {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  timeout?: number;
};
