'use client';

import { useEffect } from 'react';
import { logger } from '@/lib/logger';

type Props = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function GlobalError({ error, reset }: Props) {
  useEffect(() => {
    logger.error('[GlobalError]', error);
  }, [error]);

  return (
    <html lang="vi">
      <body className="flex min-h-screen items-center justify-center p-4">
        <div className="max-w-md text-center space-y-4">
          <div className="text-6xl">⚠️</div>
          <h1 className="text-xl font-semibold">Lỗi hệ thống</h1>
          <p className="text-sm text-muted-foreground">
            Đã xảy ra lỗi. Vui lòng thử lại sau.
          </p>
          <button
            onClick={reset}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Thử lại
          </button>
        </div>
      </body>
    </html>
  );
}
