import React, { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';

const { mockGet, mockPost, mockParse, mockSpeak, mockUnlock } = vi.hoisted(() => ({
    mockGet: vi.fn(),
    mockPost: vi.fn(),
    mockParse: vi.fn(),
    mockSpeak: vi.fn(),
    mockUnlock: vi.fn(),
}));

vi.mock('@/lib/api-client', () => ({ apiClient: { get: mockGet, post: mockPost } }));
vi.mock('@/lib/cccd-parser', () => ({ parseCCCDName: mockParse }));
vi.mock('@/hooks/useSpeech', () => ({ useSpeech: () => ({ speak: mockSpeak, unlockAudio: mockUnlock }) }));
vi.mock('@/components/ui/dong-son-motif', () => ({ PageWatermark: () => <div data-testid="watermark" /> }));
vi.mock('@/components/display/DisplayBoard', () => ({ default: () => <div data-testid="display-board" /> }));
vi.mock('@/components/ui/skeleton', () => ({ Skeleton: () => <div data-testid="skeleton" /> }));
vi.mock('@/components/qr-scanner/QRScanner', () => ({
    default: (props: { onScanSuccess: (value: string) => void }) => (
        <button type="button" onClick={() => props.onScanSuccess('VALID-QR')}>Simulate scan</button>
    ),
}));

import KioskPage from './page';

const serviceA = { id: 'service-a', name: 'Cấp CCCD', description: 'Dịch vụ CCCD', prefix: 'A', color: '#000000', allowedModes: ['quick', 'manual', 'qr'] };
const serviceB = { id: 'service-b', name: 'Cư trú', description: 'Dịch vụ cư trú', prefix: 'B', color: '#111111', allowedModes: ['quick', 'manual', 'qr'] };

let root: Root | null = null;
let container: HTMLDivElement | null = null;

async function renderPage() {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
        root?.render(<KioskPage />);
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
}

async function click(label: string) {
    const button = Array.from(container?.querySelectorAll('button') ?? []).find((candidate) => candidate.textContent?.trim() === label);
    if (!button) throw new Error('Button not found: ' + label);
    await act(async () => {
        button.click();
        await Promise.resolve();
    });
}

describe('KioskPage role entry actions', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGet.mockImplementation((path: string) => {
            if (path === '/api/services') return Promise.resolve([serviceA, serviceB]);
            return Promise.resolve({ value: 'BAMSO' });
        });
        mockPost.mockResolvedValue({ ticketNumber: 'A01' });
        mockParse.mockReturnValue('Nguyễn Văn A');
    });

    afterEach(async () => {
        await act(async () => root?.unmount());
        root = null;
        container?.remove();
        container = null;
    });

    it('shows only Nhập tên and Quét CCCD for every kiosk service', async () => {
        await renderPage();

        expect(container?.querySelectorAll('button[aria-label^="Lấy nhanh cho dịch vụ"]')).toHaveLength(0);
        expect(container?.querySelectorAll('button[aria-label^="Nhập tên cho dịch vụ"]')).toHaveLength(2);
        expect(container?.querySelectorAll('button[aria-label^="Quét CCCD cho dịch vụ"]')).toHaveLength(2);
    });

    it('opens name entry inline without changing route and focuses the input when supported', async () => {
        await renderPage();
        const manual = container?.querySelector('button[aria-label="Nhập tên cho dịch vụ Cư trú"]') as HTMLButtonElement;

        await act(async () => {
            manual.click();
            await Promise.resolve();
        });

        expect(container?.querySelector('input[aria-label="Họ và tên cho dịch vụ Cư trú"]')).toBeTruthy();
        expect(container?.querySelector('button[aria-label="Xác nhận lấy số cho dịch vụ Cư trú"]')).toBeTruthy();
        expect(container?.querySelector('button[aria-label="Hủy nhập tên cho dịch vụ Cư trú"]')).toBeTruthy();
        expect(container?.querySelector('button[aria-label="Quét CCCD cho dịch vụ Cư trú"]')).toBeNull();
        expect(window.location.pathname).toBe('/');
    });

    it('validates empty names, trims valid names, and posts the selected service without changing route', async () => {
        await renderPage();
        const manual = container?.querySelector('button[aria-label="Nhập tên cho dịch vụ Cư trú"]') as HTMLButtonElement;

        await act(async () => {
            manual.click();
            await Promise.resolve();
        });

        const input = container?.querySelector('input[aria-label="Họ và tên cho dịch vụ Cư trú"]') as HTMLInputElement;
        const submit = container?.querySelector('button[aria-label="Xác nhận lấy số cho dịch vụ Cư trú"]') as HTMLButtonElement;

        await act(async () => {
            submit.click();
            await Promise.resolve();
        });
        expect(mockPost).not.toHaveBeenCalledWith('/api/tickets', expect.anything());
        expect(container?.querySelector('[role="alert"]')?.textContent).toBe('Vui lòng nhập tên.');

        await act(async () => {
            const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
            setter?.call(input, '  Nguyễn Văn B  ');
            input.dispatchEvent(new Event('input', { bubbles: true }));
            await Promise.resolve();
            submit.click();
            await Promise.resolve();
        });

        await vi.waitFor(() => expect(mockPost).toHaveBeenCalledWith('/api/tickets', {
            serviceId: 'service-b',
            customerName: 'Nguyễn Văn B',
        }));
        expect(mockPost).toHaveBeenCalledTimes(1);
    });

    it('cancels inline name entry and restores the two kiosk actions', async () => {
        await renderPage();
        await click('Nhập tên');

        expect(container?.querySelector('input[aria-label="Họ và tên cho dịch vụ Cấp CCCD"]')).toBeTruthy();

        await click('Hủy');

        const collapsedNamePanel = container?.querySelector('[aria-label="Họ và tên cho dịch vụ Cấp CCCD"]')?.parentElement?.parentElement;
        expect(collapsedNamePanel?.className).toContain('max-h-0');
        expect(container?.querySelector('button[aria-label="Nhập tên cho dịch vụ Cấp CCCD"]')).toBeTruthy();
        expect(container?.querySelector('button[aria-label="Quét CCCD cho dịch vụ Cấp CCCD"]')).toBeTruthy();
    });
    it('prevents double-submit while ticket creation is pending', async () => {
        let resolvePost: ((value: { ticketNumber: string }) => void) | undefined;
        mockPost.mockImplementationOnce(() => new Promise((resolve) => {
            resolvePost = resolve;
        }));

        await renderPage();
        await click('Nhập tên');

        const input = container?.querySelector('input[aria-label="Họ và tên cho dịch vụ Cấp CCCD"]') as HTMLInputElement;
        const submit = container?.querySelector('button[aria-label="Xác nhận lấy số cho dịch vụ Cấp CCCD"]') as HTMLButtonElement;

        await act(async () => {
            const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
            setter?.call(input, 'Nguyễn Văn A');
            input.dispatchEvent(new Event('input', { bubbles: true }));
            submit.click();
            submit.click();
            await Promise.resolve();
        });

        expect(mockPost).toHaveBeenCalledTimes(1);
        resolvePost?.({ ticketNumber: 'A01' });
        await act(async () => {
            await Promise.resolve();
        });
    });


    it('uses responsive presentation classes: single-column below md and split kiosk at md+', async () => {
        await renderPage();

        const displayBoard = container?.querySelector('[data-testid="display-board"]');
        const displayPanel = displayBoard?.parentElement;
        const rootElement = container?.firstElementChild;

        expect(rootElement?.className).toContain('md:flex-row');
        expect(displayPanel?.className).toContain('hidden');
        expect(displayPanel?.className).toContain('md:flex');
        expect(displayPanel?.className).toContain('md:w-[45%]');
    });

    it('uses the selected service for QR and auto-submits without confirmation', async () => {
        await renderPage();
        const qrB = container?.querySelector('button[aria-label="Quét CCCD cho dịch vụ Cư trú"]') as HTMLButtonElement;
        await act(async () => {
            qrB.click();
            await Promise.resolve();
        });
        await click('Simulate scan');

        expect(mockPost).toHaveBeenCalledWith('/api/tickets', {
            serviceId: 'service-b',
            customerName: 'Nguyễn Văn A',
        });
    });

    it('keeps mobile QR presentation focused on the scanner', async () => {
        await renderPage();
        await act(async () => {
            (container?.querySelector('button[aria-label="Quét CCCD cho dịch vụ Cư trú"]') as HTMLButtonElement).click();
            await Promise.resolve();
        });

        const heading = Array.from(container?.querySelectorAll('h2') ?? [])
            .find(element => element.textContent?.includes('Quét CCCD'));
        expect(heading?.parentElement?.className).toContain('hidden');
        expect(heading?.parentElement?.className).toContain('md:block');
    });
});
