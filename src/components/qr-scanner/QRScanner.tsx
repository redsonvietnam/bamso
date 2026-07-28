import { useEffect, useRef, useCallback } from 'react';
import { toast } from 'sonner';

type QRScannerProps = {
    onScanSuccess: (decodedText: string) => void;
    onScanError?: (error: string) => void;
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

const QRScanner: React.FC<QRScannerProps> = ({ onScanSuccess, onScanError }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const cleanupRef = useRef<(() => void) | null>(null);
    const aborterRef = useRef<AbortController | null>(null);

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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let fallbackHtml5Qrcode: any = null;

        const start = async () => {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
                });
                streamRef.current = stream;
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                }

                const hasNative = 'BarcodeDetector' in window;
                if (hasNative) {
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
                    cleanupRef.current = stop;
                    return;
                }
            } catch {
                // BarcodeDetector not available or getUserMedia failed — fallback below
            }

            // Fallback: html5-qrcode
            try {
                const Html5Qrcode = (await import('html5-qrcode')).Html5Qrcode;
                const html5QrCode = new Html5Qrcode('reader-fallback');
                fallbackHtml5Qrcode = html5QrCode;
                await html5QrCode.start(
                    { facingMode: 'environment' },
                    { fps: 10, qrbox: (w: number, h: number) => ({ width: w, height: h }) },
                    (text: string) => {
                        stopAll();
                        onScanSuccess(text);
                    },
                    () => {}
                );
            } catch {
                stopAll();
                const msg = 'Không thể mở camera. Vui lòng kiểm tra quyền truy cập.';
                toast.error(msg);
                onScanError?.(msg);
            }
        };

        start();

        return () => {
            stopAll();
            if (fallbackHtml5Qrcode) {
                fallbackHtml5Qrcode.stop().catch(() => {});
                fallbackHtml5Qrcode.clear();
            }
        };
    }, [onScanSuccess, onScanError, stopAll]);

    return (
        <div className="relative w-full h-full bg-black">
            <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="absolute inset-0 w-full h-full object-cover"
            />
            <div id="reader-fallback" className="absolute inset-0 w-full h-full" />
            <p className="absolute bottom-8 left-0 right-0 text-center text-white bg-black/40 py-2 px-4 mx-8 rounded-lg text-sm">
                Đưa toàn bộ thẻ vào khung
            </p>
        </div>
    );
};

export default QRScanner;
