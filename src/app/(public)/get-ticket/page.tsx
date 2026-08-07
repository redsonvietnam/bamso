"use client";

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Service } from '@prisma/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Ticket, User, ArrowLeft, QrCode, Mic, MicOff } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { apiClient } from '@/lib/api-client';
import { parseCCCDName } from '@/lib/cccd-parser';
import QRScanner from '@/components/qr-scanner/QRScanner';

function parseModes(service: Service): string[] {
  const m = service.allowedModes;
  if (Array.isArray(m)) return m;
  if (typeof m === 'string') try { return JSON.parse(m); } catch { return ['quick', 'manual', 'qr']; }
  return ['quick', 'manual', 'qr'];
}

interface SpeechRecognitionResult {
  transcript: string;
}
interface SpeechRecognitionEvent {
  results: { [index: number]: { [index: number]: SpeechRecognitionResult } };
}
interface SpeechRecognitionInstance {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}
type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;
interface SpeechRecognitionWindow extends Window {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
}

export default function GetTicketPage() {
    const router = useRouter();
    const [services, setServices] = useState<Service[]>([]);
    const [agencyName, setAgencyName] = useState('Hệ thống quản lý hàng đợi');
    const [selectedService, setSelectedService] = useState<Service | null>(null);
    const [mode, setMode] = useState<'quick' | 'form' | 'scan' | 'qr-confirm' | null>(null);
    const [customerName, setCustomerName] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [isCreating, setIsCreating] = useState(false);
    const [isListening, setIsListening] = useState(false);
    const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [svc, settings] = await Promise.all([
                    apiClient.get<Service[]>('/api/services'),
                    apiClient.get<{ key: string, value: string }>('/api/settings?key=agency_name'),
                ]);
                setServices(svc);
                if (settings.value) setAgencyName(settings.value);
            } catch {
                toast.error('Không thể tải dữ liệu.');
            } finally {
                setIsLoading(false);
            }
        };

        fetchData();
    }, []);

    const handleQuickTicket = async () => {
        if (!selectedService) return;

        setIsCreating(true);
        try {
            const ticket = await apiClient.post<{ id: string }>('/api/tickets', { serviceId: selectedService.id });
            router.push(`/waiting?ticketId=${ticket.id}`);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Lỗi tạo vé.');
        } finally {
            setIsCreating(false);
        }
    };

    const handleCreateTicket = async () => {
        if (!selectedService) return;

        if (mode === 'form') {
            if (!customerName.trim()) {
                toast.error('Vui lòng nhập tên.');
                return;
            }
        }

        setIsCreating(true);
        try {
            const body: Record<string, string> = { serviceId: selectedService.id };

            if (customerName.trim()) {
                body.customerName = customerName.trim();
            }

            const ticket = await apiClient.post<{ id: string }>('/api/tickets', body);
            router.push(`/waiting?ticketId=${ticket.id}`);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Lỗi tạo vé.');
        } finally {
            setIsCreating(false);
        }
    };

const handleScanSuccess = (decodedText: string) => {
        const name = parseCCCDName(decodedText);
        if (!name) {
            toast.error('Không thể nhận diện thông tin từ mã QR.');
            return;
        }

        setCustomerName(name);
        setMode('qr-confirm');
        toast.success(`Đã tìm thấy tên: ${name}`);
    };

    const handleQRConfirmTicket = async () => {
        if (!selectedService || !customerName.trim()) return;

        setIsCreating(true);
        try {
            const ticket = await apiClient.post<{ id: string }>('/api/tickets', {
                serviceId: selectedService.id,
                customerName: customerName.trim(),
            });
            router.push(`/waiting?ticketId=${ticket.id}`);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Lỗi tạo vé.');
            setIsCreating(false);
        }
    };

    const toggleVoice = () => {
        if (isListening) {
            stopVoice();
            return;
        }
        startVoice();
    };

    const startVoice = () => {
        const w = window as SpeechRecognitionWindow;
        const SpeechRecognition = w.SpeechRecognition || w.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            toast.error('Trình duyệt không hỗ trợ nhập giọng nói.');
            return;
        }

        const recognition = new SpeechRecognition();
        recognition.lang = 'vi-VN';
        recognition.continuous = false;
        recognition.interimResults = false;

        recognition.onresult = (event: SpeechRecognitionEvent) => {
            const transcript = event.results[0][0].transcript;
            setCustomerName(transcript);
            toast.success('Đã nhận diện giọng nói.');
            setIsListening(false);
        };

        recognition.onerror = () => {
            toast.error('Không thể nhận diện giọng nói.');
            setIsListening(false);
        };

        recognition.onend = () => setIsListening(false);

        recognitionRef.current = recognition;
        recognition.start();
        setIsListening(true);
    };

    const stopVoice = () => {
        if (recognitionRef.current) {
            recognitionRef.current.stop();
            recognitionRef.current = null;
        }
        setIsListening(false);
    };

    const modes = selectedService ? parseModes(selectedService) : [];

    if (isLoading) {
        return (
            <div className="min-h-screen px-4 py-12">
                <div className="max-w-4xl mx-auto">
                    <div className="text-center mb-10">
                        <Skeleton className="h-10 w-64 mx-auto mb-3" />
                        <Skeleton className="h-5 w-80 mx-auto" />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {[1, 2].map((i) => (
                            <div key={i} className="rounded-lg border bg-card p-6">
                                <div className="flex items-center gap-4">
                                    <Skeleton className="w-14 h-14 rounded-full" />
                                    <div className="flex-1 space-y-2">
                                        <Skeleton className="h-5 w-40" />
                                        <Skeleton className="h-4 w-24" />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    if (selectedService) {
        return (
            <div className="flex min-h-screen items-center justify-center px-4 py-12">
                <Card className="w-full max-w-md shadow-md">
                    <CardHeader className="text-center">
                        <Button
                            variant="ghost"
                            size="sm"
                            className="mb-2 -ml-2 w-fit"
                            onClick={() => {
                                setSelectedService(null);
                                setMode(null);
                                setCustomerName('');
                            }}
                        >
                            <ArrowLeft className="w-4 h-4 mr-2" /> Quay lại
                        </Button>
                        <div
                            className="w-16 h-16 rounded-full mx-auto flex items-center justify-center text-white font-bold text-2xl mb-4"
                            style={{ backgroundColor: selectedService.color }}
                        >
                            {selectedService.prefix}
                        </div>
                        <CardTitle className="text-2xl">{selectedService.name}</CardTitle>
                        <CardDescription>{selectedService.description || ''}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {modes.includes('quick') && (
                            <Button
                                className="w-full h-12 text-lg font-medium"
                                onClick={() => handleQuickTicket()}
                                disabled={isCreating}
                            >
                                <Ticket className="w-5 h-5 mr-2" /> {isCreating ? 'Đang lấy số...' : 'Lấy số nhanh'}
                            </Button>
                        )}

                        {(modes.includes('manual') || modes.includes('qr')) && (
                            <div className="grid grid-cols-2 gap-4">
                                {modes.includes('manual') && (
                                    <Button
                                        variant="outline"
                                        className="w-full h-12 text-sm font-medium"
                                        onClick={() => setMode('form')}
                                        disabled={isCreating}
                                    >
                                        <User className="w-4 h-4 mr-2" /> Nhập tay
                                    </Button>
                                )}
                                {modes.includes('qr') && (
                                    <Button
                                        variant="outline"
                                        className="w-full h-12 text-sm font-medium"
                                        onClick={() => setMode('scan')}
                                        disabled={isCreating}
                                    >
                                        <QrCode className="w-4 h-4 mr-2" /> Quét CCCD / VNeID
                                    </Button>
                                )}
                            </div>
                        )}

                        {mode === 'form' && (
                            <div className="space-y-4 pt-4 border-t mt-4">
                                <div className="space-y-2">
                                    <Label htmlFor="name">Họ và tên</Label>
                                    <div className="flex gap-2">
                                        <Input
                                            id="name"
                                            type="text"
                                            placeholder="Nguyễn Văn A"
                                            value={customerName}
                                            onChange={(e) => setCustomerName(e.target.value)}
                                            className="h-10 flex-1"
                                        />
                                        <Button
                                            type="button"
                                            variant={isListening ? 'destructive' : 'outline'}
                                            size="icon"
                                            className="h-10 w-10 shrink-0"
                                            onClick={toggleVoice}
                                            title={isListening ? 'Đang nghe...' : 'Nhập bằng giọng nói'}
                                        >
                                            {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                                        </Button>
                                    </div>
                                </div>
                                <Button
                                    className="w-full h-12 text-lg font-medium"
                                    onClick={handleCreateTicket}
                                    disabled={isCreating}
                                >
                                    {isCreating ? 'Đang tạo...' : 'Xác nhận lấy số'}
                                </Button>
                            </div>
                        )}

                        {mode === 'qr-confirm' && customerName && (
                            <div className="space-y-4 pt-4 border-t mt-4">
                                <p className="text-center text-lg font-semibold text-green-700">
                                    Tìm thấy tên: <strong>{customerName}</strong>
                                </p>
                                <p className="text-center text-sm text-muted-foreground">
                                    Bấm xác nhận để lấy số với tên này
                                </p>
                                <Button
                                    className="w-full h-12 text-lg font-medium"
                                    onClick={handleQRConfirmTicket}
                                    disabled={isCreating}
                                >
                                    {isCreating ? 'Đang tạo...' : 'Xác nhận lấy số'}
                                </Button>
                                <Button
                                    variant="outline"
                                    className="w-full h-10"
                                    onClick={() => {
                                        setMode(null);
                                        setCustomerName('');
                                    }}
                                    disabled={isCreating}
                                >
                                    Quét lại
                                </Button>
                            </div>
                        )}
                    </CardContent>
                </Card>

                    {mode === 'scan' && (
                        <div className="fixed inset-0 z-20 bg-white flex items-center justify-center">
                            <QRScanner
                                onScanSuccess={handleScanSuccess}
                                onScanError={(err) => toast.error(err)}
                            />
                            <Button
                                variant="ghost"
                                className="absolute top-4 right-4"
                                onClick={() => setMode(null)}
                            >
                                Đóng
                            </Button>
                        </div>
                    )}
            </div>
        );
    }

    return (
        <div className="min-h-screen px-4 py-12">
            <div className="max-w-4xl mx-auto">
                <div className="text-center mb-10">
                    <h1 className="text-4xl font-bold tracking-tight text-foreground">{agencyName}</h1>
                    <p className="text-muted-foreground mt-2 text-lg">Chọn dịch vụ để lấy số</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {services.map((service) => (
                        <Card
                            key={service.id}
                            className="cursor-pointer hover:shadow-xl transition-all border-2 hover:border-primary/50 shadow-md"
                            onClick={() => setSelectedService(service)}
                        >
                            <CardHeader>
                                <div className="flex items-center gap-4">
                                    <div
                                        className="w-14 h-14 rounded-full flex items-center justify-center text-white font-bold text-2xl"
                                        style={{ backgroundColor: service.color }}
                                    >
                                        {service.prefix}
                                    </div>
                                    <div>
                                        <CardTitle className="text-xl">{service.name}</CardTitle>
                                        <CardDescription className="mt-1">
                                            {service.description || 'Nhấn để lấy số'}
                                        </CardDescription>
                                    </div>
                                </div>
                            </CardHeader>
                        </Card>
                    ))}
                </div>

                {services.length === 0 && (
                    <div className="text-center py-12 text-muted-foreground">
                        Hiện chưa có dịch vụ nào đang hoạt động.
                    </div>
                )}
            </div>
        </div>
    );
}
