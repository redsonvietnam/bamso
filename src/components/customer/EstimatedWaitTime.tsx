import { Ticket, Service } from '@prisma/client';

interface EstimatedWaitTimeProps {
  ticket: Ticket & { service: Service };
  queueAhead: number;
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

export function EstimatedWaitTime({ ticket, queueAhead }: EstimatedWaitTimeProps) {
  const queueText = getQueueText(ticket, queueAhead);

  return (
    <div className="rounded-2xl border border-border bg-muted p-4">
      <p className="text-sm font-semibold text-foreground">Trạng thái hiện tại</p>
      <p className="mt-1 text-sm text-muted-foreground">{queueText}</p>
    </div>
  );
}
