import { useEffect, useRef, useCallback, useState } from 'react';
import { toast } from 'sonner';
import type { Html5Qrcode } from 'html5-qrcode';
import { logger } from '@/lib/logger';

type QRScannerProps = {
    onScanSuccess: (decodedText: string) => void;
    onScanError?: (error: string) => void;
    forceFallback?: boolean;
    debugMode?: boolean;
};

async function tryBarcodeDetector(
    video: HTMLVideoElement,
    signal: AbortSignal,
    onSuccess: (text: string) => void,
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

const IR_KEYWORDS = ['ir', 'infrared', 'depth', 'hello', 'face', 'windows hello'];
const RGB_KEYWORDS = ['integrated', 'webcam', 'rgb', 'hd', 'front', 'camera', 'built-in'];

function isIRCamera(label: string): boolean {
    const lower = label.toLowerCase();
    return IR_KEYWORDS.some(k => lower.includes(k));
}

function isRGBCamera(label: string): boolean {
    const lower = label.toLowerCase();
    return RGB_KEYWORDS.some(k => lower.includes(k));
}

function pickBestDevice(devices: MediaDeviceInfo[]): MediaDeviceInfo | null {
    const rgb = devices.find(d => d.label && isRGBCamera(d.label) && !isIRCamera(d.label));
    if (rgb) return rgb;
    const nonIR = devices.find(d => d.label && !isIRCamera(d.label));
    if (nonIR) return nonIR;
    const anyLabeled = devices.find(d => d.label);
    if (anyLabeled) return anyLabeled;
    return devices[0] ?? null;
}

const QRScanner: React.FC<QRScannerProps> = ({ onScanSuccess, onScanError, forceFallback = false, debugMode = false }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const cleanupRef = useRef<(() => void) | null>(null);
    const aborterRef = useRef<AbortController | null>(null);
    const fallbackContainerRef = useRef<HTMLDivElement>(null);
    const [useFallback, setUseFallback] = useState(false);
    const [availableDevices, setAvailableDevices] = useState<MediaDeviceInfo[]>([]);
    const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
    const [retryKey, setRetryKey] = useState(0);
    const [autoSelected, setAutoSelected] = useState(false);
    const [isIRMode, setIsIRMode] = useState(false);

    const log = useCallback((msg: string, data?: unknown) => {
        if (debugMode) {
            logger.debug(`[QRScanner] ${msg}`, data ?? '');
        }
    }, [debugMode]);

    const refreshDevices = useCallback(() => {
        navigator.mediaDevices.enumerateDevices().then(devices => {
            const videoDevices = devices.filter(d => d.kind === 'videoinput');
            setAvailableDevices(videoDevices);
            log('Enumerated video devices:', videoDevices.map(d => ({ deviceId: d.deviceId, label: d.label, groupId: d.groupId })));
        }).catch(err => log('enumerateDevices failed:', err));
    }, [log]);

    useEffect(() => {
        refreshDevices();
    }, [refreshDevices]);

    // Apply crop to fallback video when IR mode changes
    useEffect(() => {
        if (!isIRMode || !fallbackContainerRef.current) return;
        
        const applyCrop = () => {
            const video = fallbackContainerRef.current?.querySelector('video');
            if (video) {
                video.style.position = 'absolute';
                video.style.top = '0';
                video.style.left = '0';
                video.style.width = '100%';
                video.style.height = '200%';
                video.style.objectFit = 'cover';
                video.style.transform = 'scaleY(0.5)';
                video.style.transformOrigin = 'top center';
            }
        };
        
        // Try immediately
        applyCrop();
        
        // Also watch for dynamically added video (html5-qrcode creates it async)
        const observer = new MutationObserver(applyCrop);
        observer.observe(fallbackContainerRef.current, { childList: true, subtree: true });
        
        return () => observer.disconnect();
    }, [isIRMode]);

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
        let fallbackHtml5Qrcode: Html5Qrcode | null = null;
        let cancelled = false;

        const start = async () => {
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
            } else if (!forceFallback) {
                videoConstraints.facingMode = 'environment';
                log('Using facingMode: environment');
            }

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

                const isIR = track.label && isIRCamera(track.label);
                const deviceCount = availableDevices.length;
                
                // Heuristic: if only 1 device OR label suggests IR OR label is empty → likely laptop IR camera
                const shouldCrop = isIR || deviceCount <= 1 || !track.label || track.label.trim() === '';
                
                if (shouldCrop && !selectedDeviceId && !autoSelected) {
                    if (isIR) {
                        log('Detected IR camera (label match), enabling crop mode');
                    } else if (deviceCount <= 1) {
                        log(`Only ${deviceCount} device(s) available, enabling crop mode (heuristic)`);
                    } else if (!track.label || track.label.trim() === '') {
                        log('Camera label is empty, enabling crop mode (heuristic)');
                    }
                    setIsIRMode(true);
                } else if (isIR && !selectedDeviceId && !autoSelected) {
                    log('Detected IR camera, trying to find RGB camera...');
                    const devices = await navigator.mediaDevices.enumerateDevices();
                    const videoDevices = devices.filter(d => d.kind === 'videoinput');
                    const best = pickBestDevice(videoDevices);
                    if (best && best.deviceId !== settings.deviceId) {
                        log('Switching to better camera:', { deviceId: best.deviceId, label: best.label });
                        setSelectedDeviceId(best.deviceId);
                        setAutoSelected(true);
                        stream.getTracks().forEach(t => t.stop());
                        return;
                    }
                    log('Only IR camera available, enabling crop mode');
                    setIsIRMode(true);
                }

                refreshDevices();

                streamRef.current = stream;
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                }

                const hasNative = 'BarcodeDetector' in window;
                if (hasNative && !forceFallback) {
                    const ac = new AbortController();
                    aborterRef.current = ac;
                    const stop = await tryBarcodeDetector(
                        videoRef.current!,
                        ac.signal,
                        (text) => {
                            stopAll();
                            onScanSuccess(text);
                        },
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
            log('Starting html5-qrcode fallback');
            try {
                const Html5Qrcode = (await import('html5-qrcode')).Html5Qrcode;
                if (cancelled) return;
                const html5QrCode = new Html5Qrcode('reader-fallback');
                fallbackHtml5Qrcode = html5QrCode;
                await html5QrCode.start(
                    selectedDeviceId ? { deviceId: { exact: selectedDeviceId } } : { facingMode: 'environment' },
                    { 
                        fps: 10, 
                        qrbox: (w: number, h: number) => ({ 
                            width: Math.max(50, w), 
                            height: Math.max(50, h) 
                        }) 
                    },
                    (text: string) => {
                        stopAll();
                        onScanSuccess(text);
                    },
                    () => {}
                );
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
            if (fallbackHtml5Qrcode) {
                const qr = fallbackHtml5Qrcode;
                qr.stop().then(() => {
                    qr.clear();
                }).catch(() => {
                    qr.clear();
                });
            }
        };
    }, [onScanSuccess, onScanError, stopAll, forceFallback, selectedDeviceId, autoSelected, log, refreshDevices, retryKey, availableDevices.length]);

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
            {!useFallback && (
                <>
                    <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted
                        style={videoStyle}
                    />
                    <div id="reader-fallback" className="absolute inset-0 w-full h-full hidden" />
                </>
            )}
            {useFallback && (
                <>
                    <video ref={videoRef} className="hidden" />
                    <div 
                        id="reader-fallback" 
                        ref={fallbackContainerRef}
                        style={{ position: 'absolute', inset: 0 }}
                    />
                </>
            )}
            
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
                        Current: {useFallback ? 'Fallback (html5-qrcode)' : 'Native (BarcodeDetector)'}
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