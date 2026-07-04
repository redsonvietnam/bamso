"use client";

import { useEffect, useRef, useState, useCallback } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import { toast } from 'sonner';

interface QRScannerProps {
    onScanSuccess: (decodedText: string) => void;
    onScanError?: (error: string) => void;
}

export default function QRScanner({ onScanSuccess, onScanError }: QRScannerProps) {
    const scannerRef = useRef<Html5Qrcode | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [isScanning, setIsScanning] = useState(false);

    const stopScanning = useCallback(async () => {
        if (scannerRef.current && scannerRef.current.isScanning) {
            try {
                await scannerRef.current.stop();
                scannerRef.current = null;
            } catch (err) {
                // eslint-disable-next-line no-console
                console.error("Failed to stop scanner:", err);
            }
        }
        setIsScanning(false);
    }, []);

    useEffect(() => {
        return () => {
            // We need to call the actual stop logic here. 
            // Since we can't easily call the async stopScanning in a sync cleanup,
            // we use a direct approach.
            if (scannerRef.current && scannerRef.current.isScanning) {
                scannerRef.current.stop().catch(err => {
                    // eslint-disable-next-line no-console
                    console.error("Failed to stop scanner during cleanup:", err);
                });
            }
        };
    }, []);

    const startScanning = useCallback(async () => {
        if (!containerRef.current) return;

        try {
            const html5QrCode = new Html5Qrcode("reader");
            scannerRef.current = html5QrCode;

            const config = {
                fps: 10,
                qrbox: {
                    width: 250,
                    height: 250,
                },
            };

            await html5QrCode.start(
                { facingMode: "environment" },
                config,
                (decodedText) => {
                    // Success!
                    onScanSuccess(decodedText);
                    // We might want to stop scanning immediately after first success
                    stopScanning();
                },
                (_errorMessage) => {
                    // This callback is called very frequently (every frame if no QR found)
                    // We don't want to toast every time.
                }
            );

            setIsScanning(true);
        } catch (err) {
            // eslint-disable-next-line no-console
            console.error("Failed to start scanner:", err);
            const errMsg = err instanceof Error ? err.message : 'Không thể khởi động camera';
            toast.error(errMsg);
            onScanError?.(errMsg);
        }
    }, [onScanSuccess, onScanError, stopScanning]);

    useEffect(() => {
        if (isScanning) {
            // Use setTimeout to avoid synchronous setState in effect
            const timer = setTimeout(() => {
                startScanning();
            }, 0);
            return () => clearTimeout(timer);
        } else {
            // If isScanning is false, we just ensure the scanner is stopped.
            // We don't call setIsScanning(false) here because it's already false.
            // Just call the actual stop logic.
            if (scannerRef.current && scannerRef.current.isScanning) {
                scannerRef.current.stop().then(() => {
                    scannerRef.current = null;
                }).catch(err => {
                    // eslint-disable-next-line no-console
                    console.error("Failed to stop scanner:", err);
                });
            }
        }
    }, [isScanning, startScanning]);

    return (
        <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black p-4">
            <div className="relative w-full max-w-md overflow-hidden rounded-2xl bg-gray-900 shadow-2xl">
                <div id="reader" ref={containerRef} className="w-full overflow-hidden" />
                
                {/* Overlay for scanning area */}
                <div className="absolute inset-0 pointer-events-none border-[40px] border-black/40" />
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="w-64 h-64 border-2 border-white/50 rounded-lg" />
                </div>

                <div className="absolute bottom-6 left-0 right-0 flex justify-center">
                    <Button 
                        variant="destructive" 
                        size="lg" 
                        className="rounded-full px-8"
                        onClick={() => setIsScanning(false)}
                    >
                        <X className="mr-2 h-5 w-5" /> Hủy
                    </Button>
                </div>
            </div>
            <p className="mt-6 text-center text-white/70">
                Hãy đưa mã QR vào khung hình để quét
            </p>
        </div>
    );
}
