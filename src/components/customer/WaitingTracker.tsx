'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Ticket, Service } from '@prisma/client';
import { Button } from '@/components/ui/button';
import { ExternalLink, Search, List } from 'lucide-react';
import { TicketStatus } from '@/lib/constants';
import { useQueueStatus } from '@/hooks/useQueueStatus';
import { QueueStatusCard } from '@/components/customer/QueueStatusCard';
import { NextCallerDisplay } from '@/components/customer/NextCallerDisplay';
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

      <div className="mt-4">
        <NextCallerDisplay currentServed={currentServed} />
      </div>

      <div className="mt-4">
        <EstimatedWaitTime ticket={ticket} queueAhead={queueAhead} />
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Button
          variant="outline"
          className="rounded-2xl border-slate-300 bg-white py-6 text-base font-semibold text-slate-900 shadow-sm"
          onClick={() => router.push('/track')}
        >
          <Search className="mr-2 h-4 w-4" />
          Tra cứu vé khác
        </Button>
        <Button
          variant="outline"
          className="rounded-2xl border-slate-300 bg-white py-6 text-base font-semibold text-slate-900 shadow-sm"
          onClick={() =>
            document.getElementById('service-queue')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }
        >
          <List className="mr-2 h-4 w-4" />
          Xem danh sách quầy
        </Button>
      </div>

      <div id="service-queue" className="mt-4">
        <ServiceQueueList tickets={serviceQueueTickets} />
      </div>

      <Button
        variant="ghost"
        className="mt-4 w-full rounded-2xl py-6 text-sm font-medium text-slate-600"
        onClick={() => router.push('/track')}
      >
        <ExternalLink className="mr-2 h-4 w-4" />
        Mở trang tra cứu riêng
      </Button>
    </div>
  );
}