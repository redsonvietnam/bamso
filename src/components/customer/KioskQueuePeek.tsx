'use client';

import { useEffect, useState } from 'react';
import { Ticket } from '@prisma/client';
import { TicketStatus } from '@/lib/constants';
import { apiClient } from '@/lib/api-client';

type QueueSnapshot = {
    current: Ticket | null;
    next: Ticket[];
};

export function getKioskQueueSnapshot(tickets: Ticket[]): QueueSnapshot {
    const ordered = [...tickets].sort((a, b) => a.position - b.position);
    const current = ordered.find(
        (ticket) => ticket.status === TicketStatus.CALLED || ticket.status === TicketStatus.IN_PROGRESS,
    ) ?? null;
    const pending = ordered.filter((ticket) => ticket.status === TicketStatus.PENDING);
    const nextServiceId = current?.serviceId ?? pending[0]?.serviceId;
    const next = pending
        .filter((ticket) => nextServiceId === undefined || ticket.serviceId === nextServiceId)
        .slice(0, 3);

    return { current, next };
}

export default function KioskQueuePeek() {
    const [tickets, setTickets] = useState<Ticket[]>([]);

    useEffect(() => {
        let active = true;

        apiClient.get<Ticket[]>('/api/tickets')
            .then((result) => {
                if (active && Array.isArray(result)) setTickets(result);
            })
            .catch(() => {
                // Keep the friendly empty-state fallback when queue data is unavailable.
            });

        const eventSource = typeof EventSource !== 'undefined'
            ? new EventSource('/api/sse/queue')
            : null;
        if (eventSource) {
            eventSource.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    if (data.type === 'QUEUE_UPDATE' && Array.isArray(data.tickets) && active) {
                        setTickets(data.tickets as Ticket[]);
                    }
                } catch {
                    // Ignore malformed updates; the last known snapshot remains visible.
                }
            };
        }

        return () => {
            active = false;
            eventSource?.close();
        };
    }, []);

    const { current, next } = getKioskQueueSnapshot(tickets);

    return (
        <section
            aria-label="Tình hình hàng đợi"
            className="md:hidden rounded-xl border border-border bg-card/90 px-3 py-2.5 shadow-sm"
        >
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="text-xs font-semibold text-muted-foreground">Đang phục vụ:</span>
                <span className="text-lg font-black leading-tight text-foreground">
                    {current?.ticketNumber ?? 'Chưa có số'}
                </span>
            </div>
            <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="text-xs font-semibold text-muted-foreground">Tiếp theo:</span>
                {next.length > 0 ? (
                    <span className="text-sm font-bold text-foreground">
                        {next.map((ticket) => ticket.ticketNumber).join(' · ')}
                    </span>
                ) : (
                    <span className="text-sm text-muted-foreground">Chưa có số chờ</span>
                )}
            </div>
        </section>
    );
}
