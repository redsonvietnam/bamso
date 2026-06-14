'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Ticket, Service } from '@prisma/client';
import { Button } from '@/components/ui/button';
import { ExternalLink, List } from 'lucide-react';
import { TicketStatus } from '@/lib/constants';
import { useQueueStatus } from '@/hooks/useQueueStatus';
import { QueueStatusCard } from '@/components/customer/QueueStatusCard';
import { EstimatedWaitTime } from '@/components/customer/EstimatedWaitTime';
import { ServiceQueueList } from '@/components/customer/ServiceQueueList';
import { AudioUnlockBanner, SoundToggle, ConnectionBadge } from '@/components/customer/WaitingTrackerControls';

interface WaitingTrackerProps {
  initialTicket: Ticket & { service: Service };
}

export default function WaitingTracker({ initialTicket }: WaitingTrackerProps) {
  const router = useRouter();
  const {
    ticket,
    allTickets,
    isConnected,
    soundEnabled,
    isAudioUnlocked,
    queueAhead,
    proximityLevel,
    currentServed,
    handleToggleSound,
    unlockAudio,
  } = useQueueStatus(initialTicket);

  const serviceQueueTickets = useMemo(() => {
    return allTickets
      .filter((t) => t.status === TicketStatus.PENDING || t.status === TicketStatus.CALLED || t.status === TicketStatus.IN_PROGRESS)
      .sort((a, b) => a.position - b.position);
  }, [allTickets]);

  return (
    <div className="mx-auto w-full max-w-xl px-4 py-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className="flex h-11 w-11 items-center justify-center rounded-2xl text-white shadow-sm"
            style={{ backgroundColor: ticket.service.color }}
          >
            <span className="text-base font-bold">{ticket.service.prefix}</span>
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900">{ticket.service.name}</p>
            <p className="text-xs text-slate-500">Theo dõi realtime</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <SoundToggle soundEnabled={soundEnabled} onToggle={handleToggleSound} />
          <ConnectionBadge isConnected={isConnected} />
        </div>
      </div>

      <AudioUnlockBanner
        isAudioUnlocked={isAudioUnlocked}
        soundEnabled={soundEnabled}
        onUnlockAudio={unlockAudio}
      />

      <QueueStatusCard ticket={ticket} queueAhead={queueAhead} proximityLevel={proximityLevel} />

      {ticket.status === 'PENDING' && (
        <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-sm font-semibold text-emerald-800">Số đang được phục vụ:</p>
          <p className="mt-1 text-3xl font-black text-emerald-700">
            {currentServed?.ticketNumber || '—'}
          </p>
          <p className="mt-1 text-sm text-emerald-600">
            tại {currentServed?.pos || 'quầy'} · Còn {queueAhead} lượt trước bạn
          </p>
        </div>
      )}

      <div className="mt-4">
        <EstimatedWaitTime ticket={ticket} queueAhead={queueAhead} />
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Button
          variant="outline"
          className="rounded-2xl border-slate-300 bg-white py-6 text-base font-semibold text-slate-900 shadow-sm"
          onClick={() => router.push('/get-ticket')}
        >
          <ExternalLink className="mr-2 h-4 w-4" />
          Lấy số mới
        </Button>
        <Button
          variant="outline"
          className="rounded-2xl border-slate-300 bg-white py-6 text-base font-semibold text-slate-900 shadow-sm"
          onClick={() =>
            document.getElementById('service-queue')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }
        >
          <List className="mr-2 h-4 w-4" />
          Xem danh sách hàng chờ
        </Button>
      </div>

      <div id="service-queue" className="mt-4">
        <ServiceQueueList tickets={serviceQueueTickets} />
      </div>
    </div>
  );
}