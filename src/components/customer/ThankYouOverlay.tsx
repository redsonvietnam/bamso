'use client';

import { useEffect, useRef } from 'react';
import { CheckCircle2, X } from 'lucide-react';

interface ThankYouOverlayProps {
  ticketNumber: string;
  serviceName: string;
  servicePrefix: string;
  serviceColor: string;
  message: string;
  supersedeKey?: string | number | null;
  onDismiss: () => void;
}

const THANK_YOU_DURATION_MS = 3500;

export default function ThankYouOverlay({
  ticketNumber,
  serviceName,
  servicePrefix,
  serviceColor,
  message,
  supersedeKey,
  onDismiss,
}: ThankYouOverlayProps) {
  const initialSupersedeKeyRef = useRef(supersedeKey);

  useEffect(() => {
    const timer = window.setTimeout(onDismiss, THANK_YOU_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [onDismiss]);

  useEffect(() => {
    if (initialSupersedeKeyRef.current === supersedeKey) return;
    initialSupersedeKeyRef.current = supersedeKey;
    onDismiss();
  }, [supersedeKey, onDismiss]);

  return (
    <div className="pointer-events-none fixed inset-x-4 top-4 z-50 flex justify-center">
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-auto w-full max-w-md rounded-2xl border bg-card/95 p-4 shadow-lg backdrop-blur-sm animate-in fade-in slide-in-from-top-2 duration-300"
      >
        <div className="flex items-start gap-3">
          <div
            className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
            style={{ backgroundColor: `${serviceColor}15` }}
          >
            <CheckCircle2 className="h-5 w-5" style={{ color: serviceColor }} />
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground">{message}</p>
            <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
              <span className="font-bold" style={{ color: serviceColor }}>
                {ticketNumber}
              </span>
              <span aria-hidden="true">·</span>
              <span className="truncate">{servicePrefix} · {serviceName}</span>
            </div>
          </div>

          <button
            type="button"
            onClick={onDismiss}
            className="shrink-0 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Đóng thông báo hoàn thành"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}
