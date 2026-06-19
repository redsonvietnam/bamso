'use client';

import { useRouter } from 'next/navigation';
import { CheckCircle2, ExternalLink, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ThankYouOverlayProps {
  ticketNumber: string;
  serviceName: string;
  servicePrefix: string;
  serviceColor: string;
  message: string;
  onDismiss: () => void;
}

export default function ThankYouOverlay({
  ticketNumber,
  serviceName,
  servicePrefix,
  serviceColor,
  message,
  onDismiss,
}: ThankYouOverlayProps) {
  const router = useRouter();

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white animate-in fade-in duration-500">
      <div className="flex flex-col items-center text-center px-6 max-w-sm">
        <div className="rounded-full bg-emerald-50 p-4 mb-6">
          <CheckCircle2 className="w-16 h-16" style={{ color: serviceColor }} />
        </div>

        <h1 className="text-2xl font-bold text-slate-900 mb-6">
          {message}
        </h1>

        <p className="text-5xl font-black tracking-tighter mb-1" style={{ color: serviceColor }}>
          {ticketNumber}
        </p>

        <div
          className="flex items-center gap-2 px-4 py-1.5 rounded-xl mb-4"
          style={{ backgroundColor: `${serviceColor}15` }}
        >
          <span className="text-sm font-bold" style={{ color: serviceColor }}>
            {servicePrefix}
          </span>
          <span className="text-sm text-slate-500">&middot;</span>
          <span className="text-sm text-slate-600">{serviceName}</span>
        </div>

        <div className="flex gap-3 w-full mt-6">
          <Button
            className="flex-1 py-6 rounded-2xl text-base font-semibold border-0 text-white"
            style={{ backgroundColor: serviceColor }}
            onClick={() => router.push('/get-ticket')}
          >
            <ExternalLink className="mr-2 h-4 w-4" />
            Lấy số mới
          </Button>
          <Button
            variant="outline"
            className="flex-1 py-6 rounded-2xl border-slate-300 text-base font-semibold"
            onClick={() => router.push('/')}
          >
            <Home className="mr-2 h-4 w-4" />
            Về trang chủ
          </Button>
        </div>

        <button
          onClick={onDismiss}
          className="mt-6 text-sm text-slate-400 underline underline-offset-2 hover:text-slate-600 transition-colors"
        >
          Tiếp tục xem thông tin
        </button>
      </div>
    </div>
  );
}
