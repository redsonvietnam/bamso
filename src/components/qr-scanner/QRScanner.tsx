import { useEffect, useRef, useCallback, useState } from 'react';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';
import { isIRCamera, resolveCameraSelection } from './camera-selection';

type QRScannerProps = {
    onScanSuccess: (decodedText: string) => void;
    onScanError?: (error: string) => void;
    forceFallback?: boolean;
    debugMode?: boolean;
};

type CameraZoomRange = { min: number; max: number; step: number };
type QRBoundingBox = { width: number };
const INITIAL_CAMERA_ZOOM = 2;

function hasUsableVideoGeometry(video: HTMLVideoElement): boolean {
    return video.videoWidth > 0 && video.videoHeight > 0 && video.clientWidth > 0 && video.clientHeight > 0;
}

export function getCameraZoomRange(track: MediaStreamTrack): CameraZoomRange | null {
    if (!track.getCapabilities) return null;
    const capabilities = track.getCapabilities() as MediaTrackCapabilities & {
        zoom?: { min?: number; max?: number; step?: number };
    };
    const zoom = capabilities.zoom;
    if (!zoom || typeof zoom.min !== 'number' || typeof zoom.max !== 'number' || zoom.max <= zoom.min) return null;
    const step = typeof zoom.step === 'number' && zoom.step > 0 ? zoom.step : 0.1;
    return { min: zoom.min, max: zoom.max, step };
}

function normalizeZoom(value: number, range: CameraZoomRange): number {
    const clamped = Math.min(range.max, Math.max(range.min, value));
    const stepped = range.min + Math.round((clamped - range.min) / range.step) * range.step;
    return Number(Math.min(range.max, Math.max(range.min, stepped)).toFixed(2));
}

export function createCameraZoomController(
    track: MediaStreamTrack,
    video: HTMLVideoElement,
    log: (message: string, data?: unknown) => void
) {
    const range = getCameraZoomRange(track);
    let currentZoom = (track.getSettings() as MediaTrackSettings & { zoom?: number }).zoom ?? range?.min ?? 1;
    let updateInFlight = false;

    const applyZoom = async (requestedZoom: number) => {
        if (!range || updateInFlight) return;
        const nextZoom = normalizeZoom(requestedZoom, range);
        if (Math.abs(nextZoom - currentZoom) < range.step / 2) return;
        updateInFlight = true;
        try {
            await track.applyConstraints({ advanced: [{ zoom: nextZoom } as MediaTrackConstraintSet] });
            currentZoom = nextZoom;
            log('Camera zoom updated:', { zoom: currentZoom });
        } catch (error) {
            log('Camera zoom is unavailable on this device:', error);
        } finally {
            updateInFlight = false;
        }
    };

    return {
        supported: Boolean(range),
        async initialise() {
            if (!range) return;
            await applyZoom(Math.max(currentZoom, Math.min(range.max, INITIAL_CAMERA_ZOOM)));
            log('Camera zoom capability:', range);
        },
        observe(boundingBox: QRBoundingBox) {
            if (!range || !video.videoWidth || !boundingBox.width) return;
            const relativeWidth = boundingBox.width / video.videoWidth;
            if (relativeWidth < 0.2) void applyZoom(currentZoom + range.step);
            if (relativeWidth > 0.55) void applyZoom(currentZoom - range.step);
        },
    };
}

export async function waitForFirstUsableFrame(video: HTMLVideoElement, signal: AbortSignal): Promise<void> {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');

    if (!hasUsableVideoGeometry(video)) {
        await new Promise<void>((resolve, reject) => {
            let frameId = 0;
            const onAbort = () => {
                cancelAnimationFrame(frameId);
                signal.removeEventListener('abort', onAbort);
                reject(new DOMException('Aborted', 'AbortError'));
            };
            const checkGeometry = () => {
                if (signal.aborted) {
                    onAbort();
                    return;
                }
                if (hasUsableVideoGeometry(video)) {
                    signal.removeEventListener('abort', onAbort);
                    resolve();
                    return;
                }
                frameId = requestAnimationFrame(checkGeometry);
            };
            signal.addEventListener('abort', onAbort, { once: true });
            frameId = requestAnimationFrame(checkGeometry);
        });
    }

    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');

    if (video.readyState < HTMLMediaElement.HAVE_METADATA || video.videoWidth === 0 || video.videoHeight === 0) {
        await new Promise<void>((resolve, reject) => {
            const onMetadata = () => { cleanup(); resolve(); };
            const onAbort = () => { cleanup(); reject(new DOMException('Aborted', 'AbortError')); };
            const cleanup = () => {
                video.removeEventListener('loadedmetadata', onMetadata);
                signal.removeEventListener('abort', onAbort);
            };
            video.addEventListener('loadedmetadata', onMetadata, { once: true });
            signal.addEventListener('abort', onAbort, { once: true });
        });
    }

    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');

    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        if ('requestVideoFrameCallback' in video) {
            await new Promise<void>((resolve, reject) => {
                const onAbort = () => {
                    signal.removeEventListener('abort', onAbort);
                    reject(new DOMException('Aborted', 'AbortError'));
                };
                signal.addEventListener('abort', onAbort, { once: true });
                video.requestVideoFrameCallback(() => {
                    signal.removeEventListener('abort', onAbort);
                    resolve();
                });
            });
        } else {
            await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
        }
    } else {
        await new Promise<void>((resolve, reject) => {
            const onCanPlay = () => { cleanup(); resolve(); };
            const onAbort = () => { cleanup(); reject(new DOMException('Aborted', 'AbortError')); };
            const cleanup = () => {
                video.removeEventListener('canplay', onCanPlay);
                signal.removeEventListener('abort', onAbort);
            };
            video.addEventListener('canplay', onCanPlay, { once: true });
            signal.addEventListener('abort', onAbort, { once: true });
        });
    }

    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
}

async function tryBarcodeDetector(
    video: HTMLVideoElement,
    signal: AbortSignal,
    onSuccess: (text: string) => void,
    onDetection: (boundingBox: QRBoundingBox) => void,
    _onError: () => void
): Promise<() => void> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const barcodeDetector = new (window as any).BarcodeDetector({ formats: ['qr_code'] });
    let running = true;

    const detect = async () => {
        while (running && !signal.aborted) {
            try {
                if (video.readyState < 2) {
                    await new Promise(r => setTimeout(r, 200));
                    continue;
                }
                const barcodes = await barcodeDetector.detect(video);

                for (const barcode of barcodes) {
                    if (barcode.boundingBox?.width) onDetection({ width: barcode.boundingBox.width });
                    if (barcode.rawValue) {
                        running = false;
                        onSuccess(barcode.rawValue);
                        return;
                    }
                }

                await new Promise(r => setTimeout(r, 50));
            } catch {
                await new Promise(r => setTimeout(r, 200));
            }
        }
    };

    detect();

    return () => { running = false; };
}

const QRScanner: React.FC<QRScannerProps> = ({ onScanSuccess, onScanError, forceFallback = false, debugMode = false }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const availableDevicesRef = useRef<MediaDeviceInfo[]>([]);
    const cleanupRef = useRef<(() => void) | null>(null);
    const aborterRef = useRef<AbortController | null>(null);
    const [useFallback, setUseFallback] = useState(false);
    const [availableDevices, setAvailableDevices] = useState<MediaDeviceInfo[]>([]);
    const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
    const [retryKey, setRetryKey] = useState(0);
    const [autoSelected, setAutoSelected] = useState(false);
    const [isIRMode, setIsIRMode] = useState(false);
    const [isFirstFrameReady, setIsFirstFrameReady] = useState(false);

    const log = useCallback((msg: string, data?: unknown) => {
        if (debugMode) {
            logger.debug(`[QRScanner] ${msg}`, data ?? '');
        }
    }, [debugMode]);

    const refreshDevices = useCallback(() => {
        if (!navigator.mediaDevices?.enumerateDevices) return;
        navigator.mediaDevices.enumerateDevices().then(devices => {
            const videoDevices = devices.filter(d => d.kind === 'videoinput');
            availableDevicesRef.current = videoDevices;
            setAvailableDevices(videoDevices);
            log('Enumerated video devices:', videoDevices.map(d => ({ deviceId: d.deviceId, label: d.label, groupId: d.groupId })));
        }).catch(err => log('enumerateDevices failed:', err));
    }, [log]);

    useEffect(() => {
        refreshDevices();
    }, [refreshDevices]);

    const stopAll = useCallback(() => {
        cleanupRef.current?.();
        cleanupRef.current = null;
        aborterRef.current?.abort();
        aborterRef.current = null;
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(t => t.stop());
            streamRef.current = null;
        }
    }, []);

    useEffect(() => {
        let cancelled = false;
        let video: HTMLVideoElement | null = null;

        const start = async () => {
            setIsFirstFrameReady(false);
            if (!window.isSecureContext) {
                const msg = 'Camera yêu cầu HTTPS hoặc localhost. Đang truy cập qua HTTP IP — camera bị trình duyệt chặn.';
                toast.error(msg);
                onScanError?.(msg);
                return;
            }

            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                const msg = 'Trình duyệt không hỗ trợ truy cập camera.';
                toast.error(msg);
                onScanError?.(msg);
                return;
            }

            const videoConstraints: MediaTrackConstraints = { 
                width: { ideal: 1280 }, 
                height: { ideal: 720 } 
            };
            
            if (selectedDeviceId) {
                videoConstraints.deviceId = { exact: selectedDeviceId };
                log('Using explicit deviceId:', selectedDeviceId);
            } else {
                videoConstraints.facingMode = 'environment';
                log('Using facingMode: environment');
            }

            let zoomController: ReturnType<typeof createCameraZoomController> | null = null;
            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: videoConstraints,
                });
                if (cancelled) return;
                
                const track = stream.getVideoTracks()[0];
                const settings = track.getSettings();
                log('getUserMedia success - stream settings:', {
                    deviceId: settings.deviceId,
                    label: `"${track.label}"`,  // Quote to see empty string
                    width: settings.width,
                    height: settings.height,
                    frameRate: settings.frameRate,
                    facingMode: settings.facingMode,
                });

                let cameraDevices = availableDevicesRef.current;
                if (isIRCamera(track.label) && !selectedDeviceId && !autoSelected) {
                    try {
                        cameraDevices = (await navigator.mediaDevices.enumerateDevices())
                            .filter(device => device.kind === 'videoinput');
                    } catch {
                        cameraDevices = availableDevicesRef.current;
                    }
                }

                const selection = resolveCameraSelection({
                    currentLabel: track.label,
                    currentDeviceId: settings.deviceId,
                    devices: cameraDevices,
                    selectedDeviceId,
                    autoSelected,
                });

                if (selection.action === 'switch') {
                    log('Detected IR camera, switching to better camera:', {
                        deviceId: selection.device.deviceId,
                        label: selection.device.label,
                    });
                    setSelectedDeviceId(selection.device.deviceId);
                    setAutoSelected(true);
                    stream.getTracks().forEach(t => t.stop());
                    return;
                }

                if (selection.action === 'crop') {
                    if (isIRCamera(track.label)) {
                        log('Detected IR camera, enabling crop mode');
                    } else if (availableDevicesRef.current.length <= 1) {
                        log(`Only ${availableDevicesRef.current.length} device(s) available, enabling crop mode (heuristic)`);
                    } else if (!track.label.trim()) {
                        log('Camera label is empty, enabling crop mode (heuristic)');
                    }
                    setIsIRMode(true);
                }

                refreshDevices();

                streamRef.current = stream;
                video = videoRef.current;
                if (!video) throw new Error('QR video element is unavailable');

                video.srcObject = stream;
                zoomController = createCameraZoomController(track, video, log);
                await zoomController.initialise();

                const hasNative = 'BarcodeDetector' in window;
                if (hasNative && !forceFallback) {
                    const frameAborter = new AbortController();
                    aborterRef.current = frameAborter;
                    await waitForFirstUsableFrame(video, frameAborter.signal);
                    setIsFirstFrameReady(true);
                    const stop = await tryBarcodeDetector(
                        video,
                        frameAborter.signal,
                        (text) => {
                            stopAll();
                            onScanSuccess(text);
                        },
                        zoomController.observe,
                        () => {}
                    );
                    if (cancelled) return;
                    cleanupRef.current = stop;
                    setUseFallback(false);
                    return;
                }
            } catch (err) {
                log('getUserMedia/BarcodeDetector failed, will try fallback:', err);
            }

            if (cancelled) return;

            setUseFallback(true);
            log('Starting ZXing fallback');
            try {
                if (!video) throw new Error('QR video element is unavailable');
                const fallbackAborter = new AbortController();
                aborterRef.current = fallbackAborter;
                await waitForFirstUsableFrame(video, fallbackAborter.signal);
                setIsFirstFrameReady(true);
                const { BrowserQRCodeReader } = await import('@zxing/browser');
                if (cancelled) return;
                if (!zoomController) throw new Error('Camera zoom controller is unavailable');
                const reader = new BrowserQRCodeReader();
                const controls = await reader.decodeFromVideoElement(video, (result, _error, callbackControls) => {
                    const points = result?.getResultPoints?.() ?? [];
                    if (points.length > 1) {
                        const xs = points.map(point => point.getX());
                        zoomController.observe({ width: Math.max(...xs) - Math.min(...xs) });
                    }
                    const text = result?.getText();
                    if (text) {
                        callbackControls.stop();
                        stopAll();
                        onScanSuccess(text);
                    }
                });
                if (cancelled) {
                    controls.stop();
                    return;
                }
                cleanupRef.current = () => controls.stop();
            } catch {
                if (cancelled) return;
                stopAll();
                const msg = 'Không thể mở camera. Vui lòng kiểm tra quyền truy cập.';
                toast.error(msg);
                onScanError?.(msg);
            }
        };

        start();

        return () => {
            cancelled = true;
            stopAll();
        };
    }, [onScanSuccess, onScanError, stopAll, forceFallback, selectedDeviceId, autoSelected, log, refreshDevices, retryKey]);

    const handleForceFallbackRetry = useCallback(() => {
        setSelectedDeviceId(null);
        setAutoSelected(false);
        setIsIRMode(false);
        setRetryKey(k => k + 1);
    }, []);

    // Crop style for IR mode: show only top 50%
    const videoStyle = isIRMode 
        ? { 
            position: 'absolute' as const, 
            top: 0, 
            left: 0, 
            width: '100%', 
            height: '200%',
            objectFit: 'cover' as const,
            transform: 'scaleY(0.5)',
            transformOrigin: 'top center' as const,
          }
        : { 
            position: 'absolute' as const, 
            inset: 0, 
            width: '100%', 
            height: '100%', 
            objectFit: 'cover' as const 
          };

    return (
        <div className="relative w-full h-full bg-black overflow-hidden">
            <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                style={{ ...videoStyle, visibility: isFirstFrameReady ? 'visible' : 'hidden' }}
            />
            
            {/* Debug panel */}
            {debugMode && availableDevices.length > 0 && (
                <div className="absolute top-2 right-2 z-10 bg-black/80 text-white p-2 rounded text-xs max-w-xs">
                    <div className="mb-2 font-bold">Camera Debug</div>
                    <div className="mb-2">
                        <label className="block mb-1">Devices found: {availableDevices.length}</label>
                        <select 
                            value={selectedDeviceId || ''} 
                            onChange={e => { setSelectedDeviceId(e.target.value || null); setAutoSelected(false); setIsIRMode(false); }}
                            className="w-full bg-background text-foreground text-xs p-1 rounded border border-border"
                        >
                            <option value="">Auto (facingMode)</option>
                            {availableDevices.map(d => (
                                <option key={d.deviceId} value={d.deviceId}>
                                    {d.label || `Camera ${d.deviceId.slice(0,8)}...`} {isIRCamera(d.label || '') && '(IR?)'}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                        Current: {useFallback ? 'Fallback (ZXing)' : 'Native (BarcodeDetector)'}
                        {isIRMode && ' | IR Crop: ON'}
                    </div>
                    <button 
                        onClick={handleForceFallbackRetry}
                        className="mt-2 text-[10px] text-muted-foreground hover:text-foreground underline"
                    >
                        Force Fallback & Retry
                    </button>
                </div>
            )}

            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[70%] max-w-[280px] aspect-square border-2 border-white/60 border-dashed rounded-lg pointer-events-none">
                <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 flex flex-col items-center text-white text-sm">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                    </svg>
                    <span className="bg-black/50 px-3 py-1 rounded whitespace-nowrap mt-1">
                        Đặt CCCD sát khung hình
                    </span>
                </div>
            </div>
            <p className="absolute bottom-8 left-0 right-0 text-center text-white bg-black/40 py-2 px-4 mx-8 rounded-lg text-sm">
                Đưa toàn bộ thẻ vào khung
            </p>
        </div>
    );
};

export default QRScanner;
