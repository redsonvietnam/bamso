import { Ticket, Service } from '@prisma/client';
import { Clock, UserCheck, MonitorPlay, AlertTriangle, CheckCircle2, Bell, BellRing } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

interface QueueStatusCardProps {
  ticket: Ticket & { service: Service };
  queueAhead: number;
  proximityLevel: number;
}

type ProximityLevel = 0 | 1 | 2 | 3;

function getStatusStyle(status: string, proximityLevel: ProximityLevel) {
  switch (status) {
    case 'PENDING':
      return {
        label: proximityLevel >= 3 ? 'Sắp đến lượt' : proximityLevel >= 1 ? 'Đang chờ' : 'Đã nhận số',
        icon: proximityLevel >= 3 ? <BellRing className="h-4 w-4" /> : proximityLevel >= 1 ? <Bell className="h-4 w-4" /> : <Clock className="h-4 w-4" />,
        tone: proximityLevel >= 3 ? 'bg-rose-600 text-white' : proximityLevel >= 2 ? 'bg-amber-600 text-white' : proximityLevel >= 1 ? 'bg-yellow-600 text-white' : 'bg-slate-900 text-white',
        border: proximityLevel >= 3 ? 'border-rose-200' : 'border-slate-200',
      };
    case 'CALLED':
      return { label: 'Đến lượt', icon: <MonitorPlay className="h-4 w-4" />, tone: 'bg-amber-600 text-white', border: 'border-amber-200' };
    case 'IN_PROGRESS':
      return { label: 'Đang phục vụ', icon: <UserCheck className="h-4 w-4" />, tone: 'bg-blue-600 text-white', border: 'border-blue-200' };
    case 'COMPLETED':
      return { label: 'Hoàn tất', icon: <CheckCircle2 className="h-4 w-4" />, tone: 'bg-emerald-600 text-white', border: 'border-emerald-200' };
    default:
      return { label: status, icon: <AlertTriangle className="h-4 w-4" />, tone: 'bg-slate-600 text-white', border: 'border-slate-200' };
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
  const status = getStatusStyle(ticket.status, proximityLevel as ProximityLevel);
  const queueText = getQueueText(ticket, queueAhead);

  return (
    <Card className={`overflow-hidden border shadow-sm ${status.border}`}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold ${status.tone}`}>
              {status.icon}
              {status.label}
            </span>
            <p className="mt-3 text-sm text-slate-500">Số của bạn</p>
            <div className="mt-1 text-5xl font-black tracking-tight text-slate-950">
              {ticket.ticketNumber}
            </div>
            <p className="mt-2 text-sm text-slate-600">{queueText}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-right shadow-sm">
            <p className="text-xs uppercase tracking-[0.16em] text-slate-400">Phía trước</p>
            <p className="mt-1 text-2xl font-black text-slate-900">
              {ticket.status === 'PENDING' ? queueAhead : 0}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
