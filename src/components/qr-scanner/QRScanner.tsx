import { useEffect, useState, useRef } from 'react';
import { toast } from 'sonner';

const Html5Qrcode = (typeof window !== 'undefined' && (require('html5-qrcode') as any).Html5Qrcode) as any;

type QRScannerProps = {
    onScanSuccess: (decodedText: string) => void;
    onScanError?: (error: string) => void;
};

const QRScanner: React.FC<QRScannerProps> = ({ onScanSuccess, onScanError }) => {
    const [isScanning, setIsScanning] = useState(true);
    const scannerRef = useRef<unknown>(null);

    const stopScanning = () => {
        if (scannerRef.current) {
            const qr = scannerRef.current as any;
            _qr.stop();
            _qr.clear();
            scannerRef.current = null;
        }
        setIsScanning(false);
    };

    const requestCameraPermission = async (): Promise<boolean> => {
        try {
            await navigator.mediaDevices.getUserMedia({ video: true });
            return true;
        } catch (_err: unknown) { // eslint-disable-line @typescript-eslint/no-unused-vars
            const msg = 'Không thể truy cập camera. Vui lòng cấp quyền camera trong cài đặt trình duyệt hoặc kiểm tra kết nối.';
            toast.error(msg);
            onScanError?.(msg);
            return false;
        }
    };

    useEffect(() => {
        if (isScanning) {
            const startScanning = async () => {
                try {
                    const hasPermission = await requestCameraPermission();
                    if (!hasPermission) {
                        setIsScanning(false); // Stop scanning if no permission
                        return;
                    }



                    let Html5Qrcode: any = null;
                    if (typeof window !== 'undefined') {
                        const lib = await import('html5-qrcode');
                        Html5Qrcode = lib.Html5Qrcode;
                    }
                    if (!Html5Qrcode) {
                        console.error('Html5Qrcode not available');
                        setIsScanning(false);
                        return;
                    }
                    const html5QrCode = new Html5Qrcode("reader");
                    scannerRef.current = html5QrCode;

                    const config = {
                        fps: 10,
                        qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
                            const minDimension = Math.min(viewfinderWidth, viewfinderHeight);
                            const qrboxSize = Math.floor(minDimension * 0.7); // 70% of the smaller dimension
                            return {
                                width: qrboxSize,
                                height: qrboxSize,
                            };
                        },
                    };

                    await html5QrCode.start(
                        { facingMode: "environment" },
                        config,
                        (decodedText: string) => {
                            onScanSuccess(decodedText);
                            stopScanning();
                        },
                        (_errorMessage: string) => { }
                    );

                    // setIsScanning(true); // This is already true if we reach here
                } catch (error) {
                    console.error(error);
                    setIsScanning(false); // Stop scanning on any other error during start
                    return;
                }
            };
            startScanning();
        }
    }, [isScanning]);

    return <div id="reader" className="w-full h-full" style={{ width: '100%', height: '100%' }} />;
};

export default QRScanner;
