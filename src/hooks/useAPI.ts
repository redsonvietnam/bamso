'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '@/lib/api-client';

export function useAPI<T>(endpoint: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (endpoint) {
      apiClient
        .request<T>(endpoint, { method: 'GET' })
        .then((result) => {
          if (!cancelled) {
            setData(result);
            setError(null);
            setLoading(false);
          }
        })
        .catch((err) => {
          if (!cancelled) {
            setError(err instanceof Error ? err : new Error(String(err)));
            setLoading(false);
          }
        });
    }

    return () => {
      cancelled = true;
    };
  }, [endpoint]);

  const refetch = useCallback(() => {
    if (!endpoint) {
      setData(null);
      setError(null);
      setLoading(false);
      return;
    }

    apiClient
      .request<T>(endpoint, { method: 'GET' })
      .then((result) => {
        setData(result);
        setError(null);
        setLoading(false);
      })
      .catch((err) => {
        setError(err instanceof Error ? err : new Error(String(err)));
        setLoading(false);
      });
  }, [endpoint]);

  return { data, loading, error, refetch };
}

export function useMutate<TResponse, TBody = unknown>(endpoint: string, method: 'POST' | 'PUT' | 'DELETE') {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const mutate = useCallback(
    async (body?: TBody): Promise<TResponse | null> => {
      try {
        const result = await apiClient.request<TResponse>(endpoint, {
          method,
          body,
        });
        return result;
      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)));
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [endpoint, method]
  );

  return { mutate, loading, error };
}
