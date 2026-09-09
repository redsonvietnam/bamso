import React, { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';

const {
    mockToastError,
    mockLoggerDebug,
    mockHtml5Start,
    mockHtml5Stop,
    mockHtml5Clear,
    MockHtml5Qrcode,
} = vi.hoisted(() => {
    const mockToastError = vi.fn();
    const mockLoggerDebug = vi.fn();
    const mockHtml5Start = vi.fn();
    const mockHtml5Stop = vi.fn().mockResolvedValue(undefined);
    const mockHtml5Clear = vi.fn();

    class Html5QrcodeMock {
        start = mockHtml5Start;
        stop = mockHtml5Stop;
        clear = mockHtml5Clear;
    }

    return {
        mockToastError,
        mockLoggerDebug,
        mockHtml5Start,
        mockHtml5Stop,
        mockHtml5Clear,
        MockHtml5Qrcode: Html5QrcodeMock,
    };
});

vi.mock('sonner', () => ({
    toast: {
        error: mockToastError,
    },
}));

vi.mock('@/lib/logger', () => ({
    logger: {
        debug: mockLoggerDebug,
        error: vi.fn(),
    },
}));

vi.mock('html5-qrcode', () => ({
    Html5Qrcode: MockHtml5Qrcode,
}));

import QRScanner from './QRScanner';

type MockTrack = MediaStreamTrack & {
    stop: ReturnType<typeof vi.fn>;
    getSettings: ReturnType<typeof vi.fn>;
};

type MockStream = MediaStream & {
    getVideoTracks: ReturnType<typeof vi.fn>;
};

function createVideoStream(label = 'USB Camera'): { stream: MockStream; track: MockTrack } {
    const track = {
        kind: 'video',
        id: 'track-1',
        label,
        enabled: true,
        muted: false,
        readyState: 'live' as MediaStreamTrackState,
        contentHint: '',
        onended: null,
        onmute: null,
        onunmute: null,
        clone: vi.fn(),
        getCapabilities: vi.fn(() => ({})),
        getConstraints: vi.fn(() => ({})),
        getSettings: vi.fn(() => ({ deviceId: 'camera-1', width: 1280, height: 720 })),
        applyConstraints: vi.fn().mockResolvedValue(undefined),
        stop: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
    } as unknown as MockTrack;

    const stream = {
        id: 'stream-1',
        active: true,
        getTracks: vi.fn(() => [track]),
        getVideoTracks: vi.fn(() => [track]),
        getAudioTracks: vi.fn(() => []),
        getTrackById: vi.fn(() => track),
        addTrack: vi.fn(),
        removeTrack: vi.fn(),
        clone: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
    } as unknown as MockStream;

    return { stream, track };
}

function installMediaDevices(overrides?: Partial<MediaDevices>) {
    const mediaDevices = {
        enumerateDevices: vi.fn().mockResolvedValue([
            {
                deviceId: 'camera-1',
                groupId: 'group-1',
                kind: 'videoinput',
                label: 'USB Camera',
                toJSON: () => ({}),
            },
        ]),
        getUserMedia: vi.fn(),
        getDisplayMedia: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
        ondevicechange: null,
        ...overrides,
    } as unknown as MediaDevices;

    Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: mediaDevices,
    });

    return mediaDevices;
}

function setSecureContext(value: boolean) {
    Object.defineProperty(window, 'isSecureContext', {
        configurable: true,
        value,
    });
}

function installBarcodeDetector(detectorClass: unknown) {
    Object.defineProperty(window, 'BarcodeDetector', {
        configurable: true,
        value: detectorClass,
    });
}

async function flushAsyncWork() {
    await act(async () => {
        await Promise.resolve();
        await new Promise<void>(resolve => setTimeout(resolve, 0));
    });
}

describe('QRScanner', () => {
    let root: Root | null = null;
    let container: HTMLDivElement | null = null;
    let originalBarcodeDetector: unknown;

    beforeEach(() => {
        vi.clearAllMocks();
        originalBarcodeDetector = (window as Window & { BarcodeDetector?: unknown }).BarcodeDetector;
        setSecureContext(true);
        installMediaDevices();
        Reflect.deleteProperty(window, 'BarcodeDetector');
        container = document.createElement('div');
        document.body.appendChild(container);
    });

    afterEach(async () => {
        await act(async () => {
            root?.unmount();
        });
        root = null;
        container?.remove();
        container = null;

        if (originalBarcodeDetector === undefined) {
            Reflect.deleteProperty(window, 'BarcodeDetector');
        } else {
            installBarcodeDetector(originalBarcodeDetector);
        }
    });

    async function renderScanner(props: React.ComponentProps<typeof QRScanner> = {}) {
        if (!container) throw new Error('Test container missing');
        root = createRoot(container);
        await act(async () => {
            root?.render(<QRScanner {...props} />);
        });
        await flushAsyncWork();
        return container;
    }

    it('reports insecure-context errors without requesting camera access', async () => {
        setSecureContext(false);
        const mediaDevices = installMediaDevices();
        const onScanError = vi.fn();

        await renderScanner({ onScanError });

        expect(mediaDevices.getUserMedia).not.toHaveBeenCalled();
        expect(onScanError).toHaveBeenCalledWith(
            'Camera yêu cầu HTTPS hoặc localhost. Đang truy cập qua HTTP IP — camera bị trình duyệt chặn.'
        );
        expect(mockToastError).toHaveBeenCalledWith(
            'Camera yêu cầu HTTPS hoặc localhost. Đang truy cập qua HTTP IP — camera bị trình duyệt chặn.'
        );
    });

    it('reports unsupported camera APIs without loading the scanner fallback', async () => {
        setSecureContext(true);
        Object.defineProperty(navigator, 'mediaDevices', {
            configurable: true,
            value: undefined,
        });
        const onScanError = vi.fn();

        await renderScanner({ onScanError });

        expect(mockHtml5Start).not.toHaveBeenCalled();
        expect(onScanError).toHaveBeenCalledWith('Trình duyệt không hỗ trợ truy cập camera.');
        expect(mockToastError).toHaveBeenCalledWith('Trình duyệt không hỗ trợ truy cập camera.');
    });

    it('uses native BarcodeDetector and reports the first decoded QR value', async () => {
        const { stream, track } = createVideoStream();
        const mediaDevices = installMediaDevices({
            getUserMedia: vi.fn().mockResolvedValue(stream),
        });
        const onScanSuccess = vi.fn();
        const detect = vi.fn().mockResolvedValue([{ rawValue: '040123456789' }]);

        class BarcodeDetectorMock {
            constructor(_options: unknown) {}
            detect = detect;
        }

        installBarcodeDetector(BarcodeDetectorMock);
        Object.defineProperty(HTMLVideoElement.prototype, 'readyState', {
            configurable: true,
            value: 4,
        });

        await renderScanner({ onScanSuccess });
        await flushAsyncWork();

        expect(mediaDevices.getUserMedia).toHaveBeenCalledWith({
            video: {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                facingMode: 'environment',
            },
        });
        expect(detect).toHaveBeenCalled();
        expect(onScanSuccess).toHaveBeenCalledWith('040123456789');
        expect(track.stop).toHaveBeenCalled();
        expect(mockHtml5Start).not.toHaveBeenCalled();
    });

    it('falls back to html5-qrcode and forwards a successful scan', async () => {
        const { stream, track } = createVideoStream();
        installMediaDevices({
            getUserMedia: vi.fn().mockResolvedValue(stream),
        });
        const onScanSuccess = vi.fn();

        mockHtml5Start.mockImplementationOnce(async (_camera, _config, onSuccess) => {
            onSuccess('FALLBACK-QR-001');
        });

        await renderScanner({ forceFallback: true, onScanSuccess });
        await flushAsyncWork();

        expect(mockHtml5Start).toHaveBeenCalledWith(
            { facingMode: 'environment' },
            expect.objectContaining({
                fps: 10,
                qrbox: expect.any(Function),
            }),
            expect.any(Function),
            expect.any(Function)
        );
        expect(onScanSuccess).toHaveBeenCalledWith('FALLBACK-QR-001');
        expect(track.stop).toHaveBeenCalled();
    });

    it('reports fallback startup failure as a camera error', async () => {
        const { stream } = createVideoStream();
        installMediaDevices({
            getUserMedia: vi.fn().mockRejectedValue(new Error('permission denied')),
        });
        const onScanError = vi.fn();

        mockHtml5Start.mockRejectedValueOnce(new Error('fallback failed'));

        await renderScanner({ forceFallback: true, onScanError });
        await flushAsyncWork();

        expect(mockHtml5Start).toHaveBeenCalled();
        expect(onScanError).toHaveBeenCalledWith('Không thể mở camera. Vui lòng kiểm tra quyền truy cập.');
        expect(mockToastError).toHaveBeenCalledWith('Không thể mở camera. Vui lòng kiểm tra quyền truy cập.');
        expect(stream.getTracks).not.toHaveBeenCalled();
    });

    it('stops fallback scanner resources during component unmount', async () => {
        const { stream, track } = createVideoStream();
        installMediaDevices({
            getUserMedia: vi.fn().mockRejectedValue(new Error('native camera unavailable')),
        });

        let resolveStart!: () => void;
        mockHtml5Start.mockImplementationOnce(
            () =>
                new Promise<void>(resolve => {
                    resolveStart = resolve;
                })
        );

        await renderScanner({ forceFallback: true });
        await flushAsyncWork();

        await act(async () => {
            root?.unmount();
        });
        await flushAsyncWork();

        expect(mockHtml5Stop).toHaveBeenCalled();
        expect(mockHtml5Clear).toHaveBeenCalled();
        expect(track.stop).not.toHaveBeenCalled();

        resolveStart();
    });
});
