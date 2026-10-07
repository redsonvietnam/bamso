import React, { act } from 'react';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';

const { mockGet } = vi.hoisted(() => ({ mockGet: vi.fn() }));
vi.mock('@/lib/api-client', () => ({ apiClient: { get: mockGet } }));

import KioskQueuePeek, { getKioskQueueSnapshot } from './KioskQueuePeek';
import { TicketStatus } from '@/lib/constants';
import type { Ticket } from '@prisma/client';

function ticket(ticketNumber: string, status: TicketStatus, position: number) {
    return {
        id: ticketNumber,
        ticketNumber,
        status,
        position,
        serviceId: ticketNumber.startsWith('A') ? 'service-a' : 'service-b',
    } as Ticket;
}

class MockEventSource {
    onmessage: ((event: MessageEvent) => void) | null = null;
    close = vi.fn();
    constructor(_url: string) {}
}
const originalEventSource = globalThis.EventSource;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

async function renderPeek() {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
        root?.render(<KioskQueuePeek />);
        await Promise.resolve();
    });
}

describe('KioskQueuePeek', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        globalThis.EventSource = MockEventSource as unknown as typeof EventSource;
        mockGet.mockResolvedValue([]);
    });

    afterEach(async () => {
        await act(async () => root?.unmount());
        root = null;
        container?.remove();
        container = null;
        globalThis.EventSource = originalEventSource;
    });

    it('shows the current ticket and at most three next tickets', () => {
        const snapshot = getKioskQueueSnapshot([
            ticket('A12', TicketStatus.IN_PROGRESS, 12),
            ticket('A13', TicketStatus.PENDING, 13),
            ticket('A14', TicketStatus.PENDING, 14),
            ticket('A15', TicketStatus.PENDING, 15),
            ticket('A16', TicketStatus.PENDING, 16),
        ]);

        expect(snapshot.current?.ticketNumber).toBe('A12');
        expect(snapshot.next.map((item) => item.ticketNumber)).toEqual(['A13', 'A14', 'A15']);
    });

    it('shows fewer than three next tickets when fewer are waiting', () => {
        const snapshot = getKioskQueueSnapshot([
            ticket('B02', TicketStatus.CALLED, 2),
            ticket('B03', TicketStatus.PENDING, 3),
        ]);

        expect(snapshot.current?.ticketNumber).toBe('B02');
        expect(snapshot.next.map((item) => item.ticketNumber)).toEqual(['B03']);
    });

    it('handles no current ticket', () => {
        const snapshot = getKioskQueueSnapshot([
            ticket('A03', TicketStatus.PENDING, 3),
        ]);

        expect(snapshot.current).toBeNull();
        expect(snapshot.next.map((item) => item.ticketNumber)).toEqual(['A03']);
    });

    it('handles an empty queue', () => {
        expect(getKioskQueueSnapshot([])).toEqual({ current: null, next: [] });
    });

    it('renders a compact mobile-only region and friendly empty states', async () => {
        await renderPeek();

        const region = container?.querySelector('section[aria-label="Tình hình hàng đợi"]');
        expect(region?.className).toContain('md:hidden');
        expect(region?.textContent).toContain('Đang phục vụ:');
        expect(region?.textContent).toContain('Chưa có số');
        expect(region?.textContent).toContain('Chưa có số chờ');
    });

    it('retains desktop kiosk presentation by keeping the existing DisplayBoard breakpoint', () => {
        // Read the page source without importing the whole Kiosk dependency graph.
        const source = readFileSync(path.join(process.cwd(), 'src', 'app', 'kiosk', 'page.tsx'), 'utf8');
        expect(source).toContain('hidden md:flex');
        expect(source).toContain('md:w-[45%]');
        expect(source).toContain('<DisplayBoard variant="compact" />');
    });
});
