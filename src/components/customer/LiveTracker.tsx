'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Ticket, Service } from '@prisma/client';
import { Button } from '@/components/ui/button';
import { TicketStatus } from '@/lib/constants';
import { Search, List } from 'lucide-react';
import { useQueueStatus } from '@/hooks/useQueueStatus';
import { QueueStatusCard } from '@/components/customer/QueueStatusCard';
import { NextCallerDisplay } from '@/components/customer/NextCallerDisplay';
import { EstimatedWaitTime } from '@/components/customer/EstimatedWaitTime';
import { ServiceQueueList } from '@/components/customer/ServiceQueueList';
import ThankYouOverlay from '@/components/customer/ThankYouOverlay';

interface LiveTrackerProps {
    initialTicket: Ticket & { service: Service };
}

export default function LiveTracker({ initialTicket }: LiveTrackerProps) {
    const router = useRouter();
    const {
        ticket,
        allTickets,
        queueAhead,
        proximityLevel,
        currentServed,
        showThankYou,
        dismissThankYou,
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
                    onDismiss={dismissThankYou}
                />
            )}
            <div className="mx-auto w-full max-w-xl">
            <div className="flex items-center gap-3 mb-4">
                <div
                    className="flex h-11 w-11 items-center justify-center rounded-2xl text-white shadow-sm"
                    style={{ backgroundColor: ticket.service.color }}
                >
                    <span className="text-base font-bold">{ticket.service.prefix}</span>
                </div>
                <div>
                    <p className="text-sm font-semibold text-slate-900">{ticket.service.name}</p>
                    <p className="text-xs text-slate-500">Tra cứu vé</p>
                </div>
            </div>

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
            </div>
        </>
    );
}
