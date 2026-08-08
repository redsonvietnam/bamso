"use client";

import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

interface AgencyHeaderProps {
  title?: string;
  subtitle?: string;
  right?: React.ReactNode;
  backTo?: string;
  brandTitle?: string;
  brandSubtitle?: string;
}

export function AgencyHeader({ title, right, backTo }: AgencyHeaderProps) {
  const router = useRouter();

  return (
    <header className="header-chrome sticky top-0 z-10 w-full bg-white/80 backdrop-blur-sm border-b border-t-4 border-brand-red shadow-sm">
      <div className="mx-auto flex h-20 max-w-6xl items-center justify-between gap-2 px-3 sm:h-28 sm:gap-6 sm:px-6">
        <div className="flex items-center gap-2 min-w-0 sm:gap-5">
          {backTo && (
            <button
              type="button"
              onClick={() => router.push(backTo)}
              className="-ml-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground"
              aria-label="Quay lại"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
          )}
          <div className="h-14 w-14 shrink-0 overflow-hidden rounded-full sm:h-28 sm:w-28">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/bca/huy-hieu-cong-an-nhan.png" alt="Logo" className="h-full w-full object-contain" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-xs font-black uppercase tracking-wide text-brand-red sm:text-xl">CÔNG AN TỈNH LÂM ĐỒNG</p>
            <p className="truncate text-sm font-black uppercase tracking-wide text-foreground sm:text-2xl">CÔNG AN XÃ NÂM NUNG</p>
            {title && <p className="truncate text-xs font-medium text-muted-foreground sm:text-sm">{title}</p>}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1 text-right sm:gap-2">
          <div className="hidden sm:block">
            <p className="text-lg font-bold uppercase tracking-wide text-muted-foreground">Hệ thống lấy số dịch vụ công</p>
          </div>
          {right}
        </div>
      </div>
    </header>
  );
}
