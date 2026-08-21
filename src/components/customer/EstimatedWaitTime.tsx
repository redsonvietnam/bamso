'use client';

import { useState, useEffect } from 'react';
import { Ticket, Service } from '@prisma/client';
import { apiClient } from '@/lib/api-client';
import { estimateWaitTime } from '@/lib/queue-estimate';

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
  const [avgServiceTime, setAvgServiceTime] = useState<number | null>(null);

  useEffect(() => {
    if (ticket.status !== 'PENDING') return;

    apiClient
      .get<{ avgServiceTimeSeconds: number | null }>(
        `/api/queue/estimate?serviceId=${ticket.serviceId}`
      )
      .then((data) => setAvgServiceTime(data.avgServiceTimeSeconds))
      .catch(() => {});
  }, [ticket.serviceId, ticket.status]);

  const queueText = getQueueText(ticket, queueAhead);
  const estimate = estimateWaitTime(queueAhead, avgServiceTime);

  return (
    <div className="rounded-2xl border border-border bg-muted p-4">
      <p className="text-sm font-semibold text-foreground">Trạng thái hiện tại</p>
      <p className="mt-1 text-sm text-muted-foreground">{queueText}</p>
      {ticket.status === 'PENDING' && queueAhead > 0 && estimate.available && (
        <p className="mt-1 text-sm text-muted-foreground">
          Ước tính khoảng {estimate.minutes} phút
        </p>
      )}
      {ticket.status === 'PENDING' && queueAhead === 0 && (
        <p className="mt-1 text-sm text-muted-foreground">Bạn đang được phục vụ</p>
      )}
    </div>
  );
}
