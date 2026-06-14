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
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b px-4 py-3">
        <p className="text-sm font-semibold text-slate-900">Danh sách hàng chờ của quầy</p>
        <p className="mt-1 text-xs text-slate-500">
          Chỉ hiển thị các số đang chờ, đang gọi và đang phục vụ của dịch vụ này.
        </p>
      </div>
      <div className="divide-y">
        {tickets.length > 0 ? (
          tickets.map((item) => (
            <div key={item.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div>
                <p className="text-base font-semibold text-slate-900">{item.ticketNumber}</p>
                <p className="text-xs text-slate-500">
                  {getStatusLabel(item.status)} · Vị trí {item.position}
                </p>
              </div>
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
                  item.status === 'CALLED'
                    ? 'bg-amber-100 text-amber-800'
                    : item.status === 'IN_PROGRESS'
                      ? 'bg-blue-100 text-blue-800'
                      : 'bg-slate-100 text-slate-700'
                }`}
              >
                {getStatusLabel(item.status)}
              </span>
            </div>
          ))
        ) : (
          <div className="px-4 py-8 text-center text-sm text-slate-500">
            Chưa có ai trong hàng chờ của quầy này.
          </div>
        )}
      </div>
    </div>
  );
}
