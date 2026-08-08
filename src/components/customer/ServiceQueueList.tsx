import { Ticket, Service } from '@prisma/client';

function getStatusLabel(status: string) {
  switch (status) {
    case 'PENDING': return 'Đang chờ';
    case 'CALLED': return 'Đến lượt';
    case 'IN_PROGRESS': return 'Đang phục vụ';
    case 'COMPLETED': return 'Hoàn tất';
    case 'MISSED': return 'Nhỡ lượt';
    default: return status;
  }
}

interface ServiceQueueListProps {
  tickets: (Ticket & { service: Service })[];
}

export function ServiceQueueList({ tickets }: ServiceQueueListProps) {
  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm">
      <div className="border-b px-4 py-3">
        <p className="text-sm font-semibold text-foreground">Danh sách hàng chờ của quầy</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Chỉ hiển thị các số đang chờ, đang gọi và đang phục vụ của dịch vụ này.
        </p>
      </div>
      <div className="divide-y">
        {tickets.length > 0 ? (
          tickets.map((item) => (
            <div key={item.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div>
                <p className="text-base font-semibold text-foreground">{item.ticketNumber}</p>
                <p className="text-xs text-muted-foreground">
                  {item.customerName && <span className="font-medium text-muted-foreground">{item.customerName} · </span>}
                  {getStatusLabel(item.status)} · Vị trí {item.position}
                </p>
              </div>
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
                  item.status === 'CALLED'
                    ? 'bg-amber-100 text-amber-800'
                    : item.status === 'IN_PROGRESS'
                      ? 'bg-blue-100 text-blue-800'
                      : 'bg-muted text-muted-foreground'
                }`}
              >
                {getStatusLabel(item.status)}
              </span>
            </div>
          ))
        ) : (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            Chưa có ai trong hàng chờ của quầy này.
          </div>
        )}
      </div>
    </div>
  );
}
