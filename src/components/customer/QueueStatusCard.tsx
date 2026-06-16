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
      };
      if (proximityLevel >= 1) return {
        label: 'Đang chờ', icon: Bell,
        badge: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'bg-amber-500',
        accent: 'bg-amber-500',
      };
      return {
        label: 'Đã nhận số', icon: Clock,
        badge: 'bg-slate-100 text-slate-700 border-slate-200', dot: 'bg-slate-400',
        accent: 'bg-slate-400',
      };
    }
    case 'CALLED':
      return { label: 'Đến lượt', icon: MonitorPlay, badge: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'bg-amber-500', accent: 'bg-amber-500' };
    case 'IN_PROGRESS':
      return { label: 'Đang phục vụ', icon: UserCheck, badge: 'bg-blue-50 text-blue-700 border-blue-200', dot: 'bg-blue-500', accent: 'bg-blue-500' };
    case 'COMPLETED':
      return { label: 'Hoàn tất', icon: CheckCircle2, badge: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500', accent: 'bg-emerald-500' };
    default:
      return { label: status, icon: AlertTriangle, badge: 'bg-slate-100 text-slate-700 border-slate-200', dot: 'bg-slate-400', accent: 'bg-slate-400' };
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
    <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-lg shadow-slate-200/50">
      <div className={`h-1.5 w-full ${config.accent}`} />

      <div className="p-6">
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${config.badge}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${config.dot}`} />
          <Icon className="h-3.5 w-3.5" />
          {config.label}
        </span>

        <p className="mt-5 text-xs font-medium uppercase tracking-[0.12em] text-slate-400">
          Số của bạn
        </p>

        <p className="mt-1 font-[family-name:var(--font-display)] text-6xl font-bold tracking-tight text-slate-950 leading-none">
          {ticket.ticketNumber}
        </p>

        {ticket.status === 'PENDING' ? (
          <div className="mt-5 flex items-center justify-between gap-4 rounded-2xl bg-slate-50 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white shadow-sm">
                <Users className="h-5 w-5 text-slate-500" />
              </div>
              <div>
                <p className="text-xs text-slate-500">Phía trước</p>
                <p className="text-xl font-bold text-slate-900">{queueAhead} người</p>
              </div>
            </div>
            <p className="text-right text-sm font-medium text-slate-600">{queueText}</p>
          </div>
        ) : (
          <p className="mt-5 text-sm text-slate-600">{queueText}</p>
        )}
      </div>
    </div>
  );
}
