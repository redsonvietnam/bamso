import { Ticket, Service } from '@prisma/client';
import { Clock, UserCheck, MonitorPlay, AlertTriangle, CheckCircle2, Bell, BellRing, Users } from 'lucide-react';

interface QueueStatusCardProps {
  ticket: Ticket & { service: Service };
  queueAhead: number;
  proximityLevel: number;
}

type ProximityLevel = 0 | 1 | 2 | 3;

function getStatusConfig(status: string, proximityLevel: ProximityLevel) {
  switch (status) {
    case 'PENDING': {
      if (proximityLevel >= 3) return {
        label: 'Sắp đến lượt', icon: BellRing,
        badge: 'bg-rose-50 text-rose-700 border-rose-200', dot: 'bg-rose-500',
        accent: 'bg-rose-500',
        attention: false,
      };
      if (proximityLevel >= 1) return {
        label: 'Đang chờ', icon: Bell,
        badge: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'bg-amber-500',
        accent: 'bg-amber-500',
        attention: false,
      };
      return {
        label: 'Đã nhận số', icon: Clock,
        badge: 'bg-muted text-muted-foreground border-border', dot: 'bg-muted-foreground',
        accent: 'bg-muted-foreground',
        attention: false,
      };
    }
    case 'CALLED':
      return { 
        label: 'Đến lượt', icon: MonitorPlay, badge: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'bg-amber-500', accent: 'bg-amber-500',
        attention: true,
      };
    case 'IN_PROGRESS':
      return { label: 'Đang phục vụ', icon: UserCheck, badge: 'bg-blue-50 text-blue-700 border-blue-200', dot: 'bg-blue-500', accent: 'bg-blue-500', attention: false };
    case 'COMPLETED':
      return { label: 'Hoàn tất', icon: CheckCircle2, badge: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500', accent: 'bg-emerald-500', attention: false };
    default:
      return { label: status, icon: AlertTriangle, badge: 'bg-muted text-muted-foreground border-border', dot: 'bg-muted-foreground', accent: 'bg-muted-foreground', attention: false };
  }
}

function getQueueText(ticket: Ticket & { service: Service }, queueAhead: number) {
  if (ticket.status === 'PENDING') {
    return queueAhead > 0 ? `Còn ${queueAhead} lượt nữa` : 'Bạn là người tiếp theo';
  }
  if (ticket.status === 'CALLED') return `Mời đến ${ticket.pos || 'quầy phục vụ'}`;
  if (ticket.status === 'IN_PROGRESS') return `Đang phục vụ tại ${ticket.pos || 'quầy'}`;
  if (ticket.status === 'COMPLETED') return 'Cảm ơn bạn đã sử dụng dịch vụ';
  return 'Đang cập nhật trạng thái';
}

export function QueueStatusCard({ ticket, queueAhead, proximityLevel }: QueueStatusCardProps) {
  const config = getStatusConfig(ticket.status, proximityLevel as ProximityLevel);
  const queueText = getQueueText(ticket, queueAhead);
  const Icon = config.icon;

  return (
    <div className={`overflow-hidden sketch-radius riso-paper-card glass-card rounded-3xl border border-border bg-card shadow-lg shadow-border/50 ${config.attention ? 'ring-4 ring-amber-500 shadow-amber-500/50 animate-pulse' : ''}`}>
      <div className={`h-1.5 w-full ${config.accent}`} />

      <div className="p-6">
        <span className={`inline-flex items-center gap-1.5 sticker rounded-full border px-3 py-1 text-xs font-semibold ${config.badge}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${config.dot}`} />
          <Icon className="h-3.5 w-3.5" />
          {config.label}
        </span>

        {config.attention && (
          <p className="mt-4 text-center font-display text-2xl font-bold text-amber-600 animate-pulse">
            ĐÃ ĐẾN LƯỢT CỦA BẠN!
          </p>
        )}

        <p className="mt-5 text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
          Số của bạn
        </p>

        <p className={`mt-1 font-display text-6xl font-bold tracking-tight text-foreground leading-none ${config.attention ? 'text-amber-600' : ''}`}>
          {ticket.ticketNumber}
        </p>

        {ticket.customerName && (
          <p className="mt-2 text-base font-semibold text-muted-foreground">
            {ticket.customerName}
          </p>
        )}

        {ticket.status === 'PENDING' ? (
          <div className="mt-5 flex items-center justify-between gap-4 rounded-2xl bg-muted p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-card shadow-sm">
                <Users className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Phía trước</p>
                <p className="text-xl font-bold text-foreground">{queueAhead} người</p>
              </div>
            </div>
            <p className="text-right text-sm font-medium text-muted-foreground">{queueText}</p>
          </div>
        ) : (
          <p className="mt-5 text-sm font-semibold text-foreground">{queueText}</p>
        )}
      </div>
    </div>
  );
}
