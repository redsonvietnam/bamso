import React, { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';

const {
    mockGet,
    mockPost,
    mockPush,
    mockParseCCCDName,
    mockToastError,
    mockToastSuccess,
} = vi.hoisted(() => ({
    mockGet: vi.fn(),
    mockPost: vi.fn(),
    mockPush: vi.fn(),
    mockParseCCCDName: vi.fn(),
    mockToastError: vi.fn(),
    mockToastSuccess: vi.fn(),
}));

vi.mock('next/navigation', () => ({
    useRouter: () => ({ push: mockPush }),
    useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/lib/api-client', () => ({
    apiClient: {
        get: mockGet,
        post: mockPost,
    },
}));

vi.mock('@/lib/cccd-parser', () => ({
    parseCCCDName: mockParseCCCDName,
}));

vi.mock('@/lib/customer-name-handoff', () => ({
    storeCustomerName: vi.fn(),
}));

vi.mock('sonner', () => ({
    toast: {
        error: mockToastError,
        success: mockToastSuccess,
    },
}));

vi.mock('@/components/ui/dong-son-motif', () => ({
    PageWatermark: () => <div data-testid="watermark" />,
}));

vi.mock('@/components/ui/skeleton', () => ({
    Skeleton: () => <div data-testid="skeleton" />,
}));

vi.mock('@/components/qr-scanner/QRScanner', () => ({
    default: (props: { onScanSuccess: (value: string) => void }) => (
        <div data-testid="qr-scanner">
            <button type="button" onClick={() => props.onScanSuccess('VALID-QR')}>Simulate scan</button>
        </div>
    ),
}));

import { GetTicketFlow } from './GetTicketFlow';

const serviceA = {
    id: 'service-a',
    name: 'Cấp CCCD',
    description: 'Dịch vụ CCCD',
    prefix: 'A',
    color: '#000000',
    allowedModes: ['quick', 'manual', 'qr'],
};

const serviceB = {
    id: 'service-b',
    name: 'Cư trú',
    description: 'Dịch vụ cư trú',
    prefix: 'B',
    color: '#111111',
    allowedModes: ['quick', 'manual', 'qr'],
};

let root: Root | null = null;
let container: HTMLDivElement | null = null;

async function renderFlow(homeNameFirst = false) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
        root?.render(<GetTicketFlow homeNameFirst={homeNameFirst} />);
        await Promise.resolve();
    });
    await act(async () => {
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
}

async function waitFor(condition: () => void, timeout = 1000) {
    const started = Date.now();
    while (true) {
        try {
            condition();
            return;
        } catch (error) {
            if (Date.now() - started >= timeout) throw error;
            await act(async () => {
                await new Promise<void>((resolve) => setTimeout(resolve, 10));
            });
        }
    }
}

describe('GetTicketFlow service cards', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGet.mockResolvedValue([serviceA, serviceB]);
        mockPost.mockResolvedValue({ id: 'ticket-1', customerName: 'Nguyễn Văn A' });
        mockParseCCCDName.mockReturnValue('Nguyễn Văn A');
    });

    afterEach(async () => {
        await act(async () => {
            root?.unmount();
        });
        root = null;
        container?.remove();
        container = null;
    });

    it('renders exactly one citizen action for every service', async () => {
        await renderFlow();

        expect(container?.querySelectorAll('button[aria-label^="Lấy nhanh cho dịch vụ"]').length).toBe(2);
        expect(container?.querySelectorAll('button[aria-label^="Nhập tên cho dịch vụ"]').length).toBe(0);
        expect(container?.querySelectorAll('button[aria-label^="Nhập tay cho dịch vụ"]').length).toBe(0);
        expect(container?.querySelectorAll('button[aria-label^="Quét CCCD cho dịch vụ"]').length).toBe(0);
    });

    it('uses the clicked service for citizen quick ticket creation', async () => {
        await renderFlow();
        const quickButtons = Array.from(container?.querySelectorAll<HTMLButtonElement>('button[aria-label^="Lấy nhanh cho dịch vụ"]') ?? []);
        const serviceBButton = quickButtons.find((button) => button.getAttribute('aria-label') === 'Lấy nhanh cho dịch vụ Cư trú');
        expect(serviceBButton).toBeDefined();

        await act(async () => {
            serviceBButton?.click();
            await Promise.resolve();
        });

        await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
        expect(mockPost).toHaveBeenCalledWith('/api/tickets', { serviceId: 'service-b' });
        expect(mockPush).toHaveBeenCalledWith('/waiting?ticketId=ticket-1');
    });

    it('does not expose method-selection actions or leak a preselected service on the citizen flow', async () => {
        await renderFlow();

        expect(container?.querySelector('button[aria-label^="Nhập tên cho dịch vụ"]')).toBeNull();
        expect(container?.querySelector('button[aria-label^="Nhập tay cho dịch vụ"]')).toBeNull();
        expect(container?.querySelector('button[aria-label^="Quét CCCD cho dịch vụ"]')).toBeNull();
        expect(mockPost).not.toHaveBeenCalled();
    });

    it('keeps the citizen action card responsive with no fixed minimum width', async () => {
        await renderFlow();

        const actionButtons = Array.from(container?.querySelectorAll('button[aria-label^="Lấy nhanh cho dịch vụ"]') ?? []);
        expect(actionButtons).toHaveLength(2);
        expect(actionButtons.every((button) => button.className.includes('min-w-0'))).toBe(true);
    });

    it('renders name-first cards on the home flow', async () => {
        await renderFlow(true);

        expect(container?.querySelectorAll('input[aria-label^="Họ và tên cho dịch vụ"]').length).toBe(2);
        expect(container?.querySelectorAll('button[aria-label^="Lấy số cho dịch vụ"]').length).toBe(2);
        expect(container?.querySelectorAll('button[aria-label^="Lấy nhanh cho dịch vụ"]').length).toBe(0);
    });

    it('validates empty and whitespace-only names before creating a home ticket', async () => {
        await renderFlow(true);

        const input = container?.querySelector<HTMLInputElement>('input[aria-label="Họ và tên cho dịch vụ Cấp CCCD"]');
        const button = container?.querySelector<HTMLButtonElement>('button[aria-label="Lấy số cho dịch vụ Cấp CCCD"]');
        expect(input).toBeDefined();
        expect(button).toBeDefined();

        await act(async () => {
            input?.dispatchEvent(new Event('input', { bubbles: true }));
            button?.click();
            await Promise.resolve();
        });
        expect(mockPost).not.toHaveBeenCalled();
        expect(container?.querySelector('[role="alert"]')?.textContent).toBe('Vui lòng nhập tên.');

        await act(async () => {
            if (input) {
                const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
                setter?.call(input, '   ');
                input.dispatchEvent(new Event('input', { bubbles: true }));
            }
            button?.click();
            await Promise.resolve();
        });
        expect(mockPost).not.toHaveBeenCalled();
    });

    it('trims the customer name and preserves the existing waiting success behavior', async () => {
        await renderFlow(true);

        const input = container?.querySelector<HTMLInputElement>('input[aria-label="Họ và tên cho dịch vụ Cư trú"]');
        const button = container?.querySelector<HTMLButtonElement>('button[aria-label="Lấy số cho dịch vụ Cư trú"]');
        expect(input).toBeDefined();
        expect(button).toBeDefined();

        await act(async () => {
            if (input) {
                const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
                setter?.call(input, '  Nguyễn Văn B  ');
                input.dispatchEvent(new Event('input', { bubbles: true }));
            }
            button?.click();
            await Promise.resolve();
        });

        await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
        expect(mockPost).toHaveBeenCalledWith('/api/tickets', {
            serviceId: 'service-b',
            customerName: 'Nguyễn Văn B',
        });
        expect(mockPush).toHaveBeenCalledWith('/waiting?ticketId=ticket-1');
    });

    it('keeps the existing default citizen flow unchanged when homeNameFirst is not enabled', async () => {
        await renderFlow();

        expect(container?.querySelectorAll('button[aria-label^="Lấy nhanh cho dịch vụ"]').length).toBe(2);
        expect(container?.querySelectorAll('input[aria-label^="Họ và tên cho dịch vụ"]').length).toBe(0);
    });

});