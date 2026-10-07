import React, { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { ServiceActionCards, isServiceModeAllowed, parseModes, getServiceActionModes } from './ServiceActionCards';

const services = [
    { id: 'service-a', name: 'Cấp CCCD', description: 'Dịch vụ CCCD', prefix: 'A', color: '#000000', allowedModes: ['quick', 'manual', 'qr'] },
    { id: 'service-b', name: 'Cư trú', description: 'Dịch vụ cư trú', prefix: 'B', color: '#111111', allowedModes: ['quick', 'manual', 'qr'] },
] as never[];

let root: Root | null = null;
let container: HTMLDivElement | null = null;

async function renderCards(mode: 'citizen' | 'citizen-name-first' | 'kiosk', callbacks = {
    onQuick: vi.fn(),
    onManual: vi.fn(),
    onQr: vi.fn(),
}) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
        root?.render(
            <ServiceActionCards
                services={services}
                mode={mode}
                onQuick={callbacks.onQuick}
                onManual={callbacks.onManual}
                onQr={callbacks.onQr}
            />,
        );
        await Promise.resolve();
    });
    return callbacks;
}

afterEach(async () => {
    await act(async () => root?.unmount());
    root = null;
    container?.remove();
    container = null;
});

describe('ServiceActionCards role actions', () => {
    it('preserves quick/manual/qr mode parsing and mapping', () => {
        expect(parseModes('["quick","manual","qr"]')).toEqual(['quick', 'manual', 'qr']);
        expect(getServiceActionModes('citizen')).toEqual(['quick']);
        expect(getServiceActionModes('citizen-name-first')).toEqual(['quick']);
        expect(getServiceActionModes('kiosk')).toEqual(['manual', 'qr']);
    });

    it('makes allowed modes available and disallowed modes unavailable', () => {
        const service = { allowedModes: '["quick","qr"]' } as never;
        expect(isServiceModeAllowed(service, 'quick')).toBe(true);
        expect(isServiceModeAllowed(service, 'qr')).toBe(true);
        expect(isServiceModeAllowed(service, 'manual')).toBe(false);
    });
    it('citizen shows exactly one action per service: Lấy nhanh', async () => {
        await renderCards('citizen');

        expect(container?.querySelectorAll('button[aria-label^="Lấy nhanh cho dịch vụ"]')).toHaveLength(2);
        expect(container?.querySelectorAll('button[aria-label^="Nhập tên cho dịch vụ"]')).toHaveLength(0);
        expect(container?.querySelectorAll('button[aria-label^="Nhập tay cho dịch vụ"]')).toHaveLength(0);
        expect(container?.querySelectorAll('button[aria-label^="Quét CCCD cho dịch vụ"]')).toHaveLength(0);
    });

    it('citizen name-first shows one input and Lấy số per service', async () => {
        await renderCards('citizen-name-first');

        expect(container?.querySelectorAll('input[aria-label^="Họ và tên cho dịch vụ"]')).toHaveLength(2);
        expect(container?.querySelectorAll('button[aria-label^="Lấy số cho dịch vụ"]')).toHaveLength(2);
        expect(container?.querySelectorAll('button[aria-label^="Lấy nhanh cho dịch vụ"]')).toHaveLength(0);
    });

    it('kiosk shows exactly two actions per service: Nhập tên and Quét CCCD', async () => {
        await renderCards('kiosk');

        expect(container?.querySelectorAll('button[aria-label^="Lấy nhanh cho dịch vụ"]')).toHaveLength(0);
        expect(container?.querySelectorAll('button[aria-label^="Nhập tên cho dịch vụ"]')).toHaveLength(2);
        expect(container?.querySelectorAll('button[aria-label^="Quét CCCD cho dịch vụ"]')).toHaveLength(2);
    });

    it('hides disallowed kiosk actions per service contract', async () => {
        const restrictedServices = [
            { id: 'service-a', name: 'Cấp CCCD', description: 'Dịch vụ CCCD', prefix: 'A', color: '#000000', allowedModes: ['manual'] },
            { id: 'service-b', name: 'Cư trú', description: 'Dịch vụ cư trú', prefix: 'B', color: '#111111', allowedModes: ['qr'] },
        ] as never[];
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
        await act(async () => {
            root?.render(
                <ServiceActionCards services={restrictedServices} mode="kiosk" onQuick={vi.fn()} onManual={vi.fn()} onQr={vi.fn()} />,
            );
            await Promise.resolve();
        });
        expect(container?.querySelector('button[aria-label="Nhập tên cho dịch vụ Cấp CCCD"]')).toBeTruthy();
        expect(container?.querySelector('button[aria-label="Quét CCCD cho dịch vụ Cấp CCCD"]')).toBeNull();
        expect(container?.querySelector('button[aria-label="Nhập tên cho dịch vụ Cư trú"]')).toBeNull();
        expect(container?.querySelector('button[aria-label="Quét CCCD cho dịch vụ Cư trú"]')).toBeTruthy();
    });

    it('opens name entry inline and keeps QR action available without invoking submit', async () => {
        const callbacks = await renderCards('kiosk');
        const manual = container?.querySelector('button[aria-label="Nhập tên cho dịch vụ Cư trú"]') as HTMLButtonElement;
        await act(async () => {
            manual.click();
            await Promise.resolve();
        });

        expect(container?.querySelector('input[aria-label="Họ và tên cho dịch vụ Cư trú"]')).toBeTruthy();
        expect(container?.querySelector('button[aria-label="Xác nhận lấy số cho dịch vụ Cư trú"]')).toBeTruthy();
        expect(container?.querySelector('button[aria-label="Hủy nhập tên cho dịch vụ Cư trú"]')).toBeTruthy();
        expect(callbacks.onManual).not.toHaveBeenCalled();

        expect(container?.querySelector('button[aria-label="Quét CCCD cho dịch vụ Cư trú"]')).toBeNull();
    });

    it('validates empty names and trims before submitting the selected kiosk service', async () => {
        const callbacks = await renderCards('kiosk');
        const manual = container?.querySelector('button[aria-label="Nhập tên cho dịch vụ Cấp CCCD"]') as HTMLButtonElement;

        await act(async () => {
            manual.click();
            await Promise.resolve();
        });

        const input = container?.querySelector('input[aria-label="Họ và tên cho dịch vụ Cấp CCCD"]') as HTMLInputElement;
        const submit = container?.querySelector('button[aria-label="Xác nhận lấy số cho dịch vụ Cấp CCCD"]') as HTMLButtonElement;

        await act(async () => {
            submit.click();
            await Promise.resolve();
        });
        expect(callbacks.onManual).not.toHaveBeenCalled();
        expect(container?.querySelector('[role="alert"]')?.textContent).toBe('Vui lòng nhập tên.');

        await act(async () => {
            const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
            setter?.call(input, '  Nguyễn Văn A  ');
            input.dispatchEvent(new Event('input', { bubbles: true }));
            await Promise.resolve();
            submit.click();
            await Promise.resolve();
        });

        expect(callbacks.onManual).toHaveBeenCalledTimes(1);
        expect(callbacks.onManual).toHaveBeenCalledWith(services[0], 'Nguyễn Văn A');
    });

    it('cancels inline name entry and returns to the two kiosk actions', async () => {
        await renderCards('kiosk');
        const manual = container?.querySelector('button[aria-label="Nhập tên cho dịch vụ Cư trú"]') as HTMLButtonElement;

        await act(async () => {
            manual.click();
            await Promise.resolve();
        });
        expect(container?.querySelector('input[aria-label="Họ và tên cho dịch vụ Cư trú"]')).toBeTruthy();

        await act(async () => {
            (container?.querySelector('button[aria-label="Hủy nhập tên cho dịch vụ Cư trú"]') as HTMLButtonElement).click();
            await Promise.resolve();
        });

        const collapsedNamePanel = container?.querySelector('[aria-label="Họ và tên cho dịch vụ Cư trú"]')?.parentElement?.parentElement;
        expect(collapsedNamePanel?.className).toContain('max-h-0');
        expect(container?.querySelector('button[aria-label="Nhập tên cho dịch vụ Cư trú"]')).toBeTruthy();
        expect(container?.querySelector('button[aria-label="Quét CCCD cho dịch vụ Cư trú"]')).toBeTruthy();
    });

    it('uses one service column on small screens and two columns from md+', async () => {
        await renderCards('kiosk');

        const grid = container?.querySelector('[class*="grid-cols-1"]');
        expect(grid?.className).toContain('grid-cols-1');
        expect(grid?.className).toContain('md:grid-cols-2');
    });

    it('keeps action buttons touch-sized and min-width safe', async () => {
        await renderCards('kiosk');

        const buttons = Array.from(container?.querySelectorAll('button[aria-label^="Nhập tên cho dịch vụ"], button[aria-label^="Quét CCCD cho dịch vụ"]') ?? []);
        expect(buttons).toHaveLength(4);
        expect(buttons.every((button) => button.className.includes('h-20'))).toBe(true);
        expect(buttons.every((button) => button.className.includes('min-w-0'))).toBe(true);
    });
});