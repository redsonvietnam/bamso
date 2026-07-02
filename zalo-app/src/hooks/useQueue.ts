import { useState, useEffect } from 'react';
import { ticketsApi } from '../api/client';

export function useQueue(ticketId: string) {
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchStatus() {
      try {
        const data = await ticketsApi.track(ticketId);
        setStatus(data);
        setError(null);
      } catch (err) {
        setError('Không thể cập nhật trạng thái hàng đợi');
      } finally {
        setLoading(false);
      }
    }

    // Initial fetch
    fetchStatus();

    // Poll every 10 seconds
    const interval = setInterval(fetchStatus, 10000);

    return () => clearInterval(interval);
  }, [ticketId]);

  return { status, loading, error };
}
