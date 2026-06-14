import { Ticket, Service } from '@prisma/client';

interface NextCallerDisplayProps {
  currentServed: (Ticket & { service: Service }) | undefined;
}

export function NextCallerDisplay({ currentServed }: NextCallerDisplayProps) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <p className="text-sm font-medium text-slate-500">Đang phục vụ</p>
        <p className="mt-1 text-lg font-semibold text-slate-900">
          {currentServed ? currentServed.ticketNumber : '—'}
        </p>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <p className="text-sm font-medium text-slate-500">Quầy</p>
        <p className="mt-1 text-lg font-semibold text-slate-900">
          {currentServed?.pos || '—'}
        </p>
      </div>
    </div>
  );
}
