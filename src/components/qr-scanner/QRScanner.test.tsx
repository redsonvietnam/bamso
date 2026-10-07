import React, { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';

const {
    mockToastError,
    mockLoggerDebug,
    mockZxingDecode,
    mockZxingStop,
    MockBrowserQRCodeReader,
} = vi.hoisted(() => {
    const mockToastError = vi.fn();
    const mockLoggerDebug = vi.fn();
    const mockZxingDecode = vi.fn();
    const mockZxingStop = vi.fn();

    class BrowserQRCodeReaderMock {
        decodeFromVideoElement = mockZxingDecode;
    }

    return {
        mockToastError,
        mockLoggerDebug,
        mockZxingDecode,
        mockZxingStop,
        MockBrowserQRCodeReader: BrowserQRCodeReaderMock,
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

vi.mock('@zxing/browser', () => ({
    BrowserQRCodeReader: MockBrowserQRCodeReader,
}));

import QRScanner, { createCameraZoomController, waitForFirstUsableFrame } from './QRScanner';

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
        Object.defineProperties(HTMLVideoElement.prototype, {
            videoWidth: { configurable: true, value: 1280 },
            videoHeight: { configurable: true, value: 720 },
            clientWidth: { configurable: true, value: 640 },
            clientHeight: { configurable: true, value: 480 },
            readyState: { configurable: true, value: HTMLMediaElement.HAVE_CURRENT_DATA },
        });
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

    async function renderScanner(props: Partial<React.ComponentProps<typeof QRScanner>> = {}) {
        if (!container) throw new Error('Test container missing');
        root = createRoot(container);
        const mergedProps: React.ComponentProps<typeof QRScanner> = {
            onScanSuccess: vi.fn(),
            ...props,
        };
        await act(async () => {
            root?.render(<QRScanner {...mergedProps} />);
        });
        await flushAsyncWork();
        return container;
    }

    it('waits for rendered video geometry before allowing frame readiness', async () => {
        const video = document.createElement('video');
        let renderedWidth = 0;
        const originalRequestFrame = window.requestAnimationFrame;
        const originalCancelFrame = window.cancelAnimationFrame;
        window.requestAnimationFrame = (callback: FrameRequestCallback) =>
            window.setTimeout(() => callback(performance.now()), 0) as unknown as number;
        window.cancelAnimationFrame = (id: number) => window.clearTimeout(id);
        Object.defineProperties(video, {
            videoWidth: { configurable: true, value: 1280 },
            videoHeight: { configurable: true, value: 720 },
            readyState: { configurable: true, value: HTMLMediaElement.HAVE_CURRENT_DATA },
            clientWidth: { configurable: true, get: () => renderedWidth },
            clientHeight: { configurable: true, value: 480 },
        });
        const controller = new AbortController();
        const ready = waitForFirstUsableFrame(video, controller.signal);

        await new Promise(resolve => setTimeout(resolve, 0));
        expect(renderedWidth).toBe(0);
        renderedWidth = 640;
        await ready;
        window.requestAnimationFrame = originalRequestFrame;
        window.cancelAnimationFrame = originalCancelFrame;
    });

    it('uses supported camera zoom and adapts when the QR is too small', async () => {
        const track = {
            getCapabilities: vi.fn(() => ({ zoom: { min: 1, max: 2, step: 0.1 } })),
            getSettings: vi.fn(() => ({})),
            applyConstraints: vi.fn().mockResolvedValue(undefined),
        } as unknown as MediaStreamTrack;
        const video = document.createElement('video');
        Object.defineProperty(video, 'videoWidth', { configurable: true, value: 1000 });
        const controller = createCameraZoomController(track, video, vi.fn());

        expect(controller.supported).toBe(true);
        await controller.initialise();
        controller.observe({ width: 600 });
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(track.applyConstraints).toHaveBeenCalledWith({ advanced: [{ zoom: 2 }] });
        expect(track.applyConstraints).toHaveBeenCalledWith({ advanced: [{ zoom: 1.9 }] });
    });

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

        expect(mockZxingDecode).not.toHaveBeenCalled();
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
        Object.defineProperty(HTMLVideoElement.prototype, 'videoWidth', { configurable: true, value: 1280 });
        Object.defineProperty(HTMLVideoElement.prototype, 'videoHeight', { configurable: true, value: 720 });
        Object.defineProperty(HTMLVideoElement.prototype, 'clientWidth', { configurable: true, value: 640 });
        Object.defineProperty(HTMLVideoElement.prototype, 'clientHeight', { configurable: true, value: 480 });
        Object.defineProperty(HTMLVideoElement.prototype, 'readyState', { configurable: true, value: 4 });
        const frameCallback = vi.fn((callback: (now: number, metadata: { mediaTime: number; expectedDisplayTime: number; width: number; height: number }) => void) => {
            callback(0, { mediaTime: 0, expectedDisplayTime: 0, width: 1280, height: 720 });
            return 1;
        });
        Object.defineProperty(HTMLVideoElement.prototype, 'requestVideoFrameCallback', {
            configurable: true,
            value: frameCallback,
        });

        let detectorInstances = 0;
        class BarcodeDetectorMock {
            constructor(_options: unknown) { detectorInstances += 1; }
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
        expect(frameCallback).toHaveBeenCalled();
        const video = container?.querySelector('video');
        expect(video?.style.visibility).toBe('visible');
        expect(detect).toHaveBeenCalled();
        expect(detectorInstances).toBe(1);
        expect(onScanSuccess).toHaveBeenCalledWith('040123456789');
        expect(track.stop).toHaveBeenCalled();
        expect(mockZxingDecode).not.toHaveBeenCalled();
    });

    it('uses ZXing fallback and forwards a successful scan', async () => {
        const { stream, track } = createVideoStream();
        installMediaDevices({
            getUserMedia: vi.fn().mockResolvedValue(stream),
        });
        const onScanSuccess = vi.fn();

        mockZxingDecode.mockImplementationOnce(async (_video, onResult) => {
            onResult({ getText: () => 'ZXING-QR-001' }, undefined, { stop: mockZxingStop });
            return { stop: mockZxingStop };
        });

        await renderScanner({ forceFallback: true, onScanSuccess });
        await flushAsyncWork();

        expect(mockZxingDecode).toHaveBeenCalledWith(expect.any(HTMLVideoElement), expect.any(Function));
        expect(onScanSuccess).toHaveBeenCalledWith('ZXING-QR-001');
        expect(mockZxingStop).toHaveBeenCalled();
        expect(track.stop).toHaveBeenCalled();
    });

    it('reports fallback startup failure as a camera error', async () => {
        createVideoStream();
        installMediaDevices({
            getUserMedia: vi.fn().mockRejectedValue(new Error('permission denied')),
        });
        const onScanError = vi.fn();

        mockZxingDecode.mockRejectedValueOnce(new Error('fallback failed'));

        await renderScanner({ forceFallback: true, onScanError });
        await flushAsyncWork();

        expect(mockZxingDecode).not.toHaveBeenCalled();
        expect(onScanError).toHaveBeenCalledWith('Không thể mở camera. Vui lòng kiểm tra quyền truy cập.');
        expect(mockToastError).toHaveBeenCalledWith('Không thể mở camera. Vui lòng kiểm tra quyền truy cập.');
    });

    it('stops fallback scanner resources during component unmount', async () => {
        const { stream, track } = createVideoStream();
        installMediaDevices({
            getUserMedia: vi.fn().mockResolvedValue(stream),
        });

        mockZxingDecode.mockResolvedValueOnce({ stop: mockZxingStop });

        await renderScanner({ forceFallback: true });
        await flushAsyncWork();

        await act(async () => {
            root?.unmount();
        });
        await flushAsyncWork();

        expect(track.stop).toHaveBeenCalled();
    });
});
