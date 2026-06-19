'use client';

import { useMemo, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Ticket, Service } from '@prisma/client';
import { Button } from '@/components/ui/button';
import { ExternalLink, List } from 'lucide-react';
import { TicketStatus } from '@/lib/constants';
import { useQueueStatus } from '@/hooks/useQueueStatus';
import { QueueStatusCard } from '@/components/customer/QueueStatusCard';
import { ServiceQueueList } from '@/components/customer/ServiceQueueList';
import { SoundToggle, ConnectionBadge } from '@/components/customer/WaitingTrackerControls';
import ThankYouOverlay from '@/components/customer/ThankYouOverlay';
import { apiClient } from '@/lib/api-client';

interface WaitingTrackerProps {
  initialTicket: Ticket & { service: Service };
}

export default function WaitingTracker({ initialTicket }: WaitingTrackerProps) {
  const router = useRouter();
  const [thankYouMessage, setThankYouMessage] = useState('Cảm ơn bạn đã sử dụng dịch vụ');

  useEffect(() => {
    apiClient.get<{ value: string }>('/api/settings?key=thank_you_text')
      .then((res) => { if (res.value) setThankYouMessage(res.value); })
      .catch(() => {});
  }, []);

  const {
    ticket,
    allTickets,
    isConnected,
    soundEnabled,
    queueAhead,
    proximityLevel,
    currentServed,
    showThankYou,
    dismissThankYou,
    handleToggleSound,
  } = useQueueStatus(initialTicket);

  const serviceQueueTickets = useMemo(() => {
    return allTickets
      .filter((t) => t.status === TicketStatus.PENDING || t.status === TicketStatus.CALLED || t.status === TicketStatus.IN_PROGRESS)
      .sort((a, b) => a.position - b.position);
  }, [allTickets]);

  return (
    <>
      {showThankYou && (
        <ThankYouOverlay
          ticketNumber={ticket.ticketNumber}
          serviceName={ticket.service.name}
          servicePrefix={ticket.service.prefix}
          serviceColor={ticket.service.color}
          message={thankYouMessage}
          onDismiss={dismissThankYou}
        />
      )}
      <div className="mx-auto w-full max-w-xl px-4 py-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className="flex h-11 w-11 items-center justify-center rounded-2xl text-white shadow-sm"
            style={{ backgroundColor: ticket.service.color }}
          >
            <span className="text-base font-bold">{ticket.service.prefix}</span>
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900">{ticket.service.name}</p>
            <p className="text-xs text-slate-500">Cập nhật realtime</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <SoundToggle soundEnabled={soundEnabled} onToggle={handleToggleSound} />
          <ConnectionBadge isConnected={isConnected} />
        </div>
      </div>

      <QueueStatusCard ticket={ticket} queueAhead={queueAhead} proximityLevel={proximityLevel} />

      {ticket.status === 'PENDING' && currentServed && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-xs font-medium uppercase tracking-[0.1em] text-emerald-600">
            Hiện đang phục vụ
          </p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-emerald-800">
              {currentServed.ticketNumber}
            </span>
            {currentServed.pos && (
              <span className="text-sm text-emerald-600">
                &middot; Quầy {currentServed.pos}
              </span>
            )}
          </div>
        </div>
      )}

      <div className="flex gap-3">
        <Button
          variant="outline"
          className="flex-1 rounded-2xl border-slate-300 bg-white py-6 text-base font-semibold text-slate-900 shadow-sm hover:bg-slate-50"
          onClick={() => router.push('/get-ticket')}
        >
          <ExternalLink className="mr-2 h-4 w-4" />
          Lấy số mới
        </Button>
        <Button
          variant="outline"
          className="flex-1 rounded-2xl border-slate-300 bg-white py-6 text-base font-semibold text-slate-900 shadow-sm hover:bg-slate-50"
          onClick={() =>
            document.getElementById('service-queue')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }
        >
          <List className="mr-2 h-4 w-4" />
          Xem hàng chờ
        </Button>
      </div>

      <div id="service-queue">
        <ServiceQueueList tickets={serviceQueueTickets} />
      </div>
      </div>
    </>
  );
}
