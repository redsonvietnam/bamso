import { Ticket, Service } from '@prisma/client';

interface NextCallerDisplayProps {
  currentServed: (Ticket & { service: Service }) | undefined;
}

export function NextCallerDisplay({ currentServed }: NextCallerDisplayProps) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="rounded-2xl border border-border bg-card p-4">
        <p className="text-sm font-medium text-muted-foreground">Đang phục vụ</p>
        <p className="mt-1 text-lg font-semibold text-foreground">
          {currentServed ? currentServed.ticketNumber : '—'}
        </p>
      </div>
      <div className="rounded-2xl border border-border bg-card p-4">
        <p className="text-sm font-medium text-muted-foreground">Quầy</p>
        <p className="mt-1 text-lg font-semibold text-foreground">
          {currentServed?.pos || '—'}
        </p>
      </div>
    </div>
  );
}
