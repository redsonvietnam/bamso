"use client";

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Service } from '@prisma/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { ArrowLeft, Mic, MicOff } from 'lucide-react';
import { ServiceActionCards } from '@/components/customer/ServiceActionCards';
import { Skeleton } from '@/components/ui/skeleton';
import { PageWatermark } from '@/components/ui/dong-son-motif';
import { apiClient } from '@/lib/api-client';
import { parseCCCDName } from '@/lib/cccd-parser';
import { storeCustomerName } from '@/lib/customer-name-handoff';
import QRScanner from '@/components/qr-scanner/QRScanner';

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

interface GetTicketFlowProps {
    homeNameFirst?: boolean;
}

export function GetTicketFlow({ homeNameFirst = false }: GetTicketFlowProps) {
    const router = useRouter();
    const [services, setServices] = useState<Service[]>([]);
    const [selectedService, setSelectedService] = useState<Service | null>(null);
    const [mode, setMode] = useState<'quick' | 'form' | 'scan' | null>(null);
    const [customerName, setCustomerName] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [isCreating, setIsCreating] = useState(false);
    const [isListening, setIsListening] = useState(false);
    const [qrScanKey, setQrScanKey] = useState(0);
    const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
    const qrSubmissionLockRef = useRef(false);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const svc = await apiClient.get<Service[]>('/api/services');
                setServices(svc);

            } catch {
                toast.error('Không thể tải dữ liệu.');
            } finally {
                setIsLoading(false);
            }
        };

        fetchData();
    }, []);

    const handleQuickTicket = async (service: Service, name = '') => {
        const trimmedName = name.trim();

        setIsCreating(true);
        try {
            const body: Record<string, string> = { serviceId: service.id };
            if (trimmedName) body.customerName = trimmedName;

            const ticket = await apiClient.post<{ id: string; customerName?: string | null }>('/api/tickets', body);
            if (ticket.customerName) storeCustomerName(ticket.id, ticket.customerName);
            router.push(`/waiting?ticketId=${ticket.id}`);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Lỗi tạo vé.');
        } finally {
            setIsCreating(false);
        }
    };

    const handleCreateTicket = async (service: Service) => {

        if (mode === 'form') {
            if (!customerName.trim()) {
                toast.error('Vui lòng nhập tên.');
                return;
            }
        }

        setIsCreating(true);
        try {
            const body: Record<string, string> = { serviceId: service.id };

            if (customerName.trim()) {
                body.customerName = customerName.trim();
            }

            const ticket = await apiClient.post<{ id: string; customerName?: string | null }>('/api/tickets', body);
            if (ticket.customerName) storeCustomerName(ticket.id, ticket.customerName);
            router.push(`/waiting?ticketId=${ticket.id}`);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Lỗi tạo vé.');
        } finally {
            setIsCreating(false);
        }
    };

    const submitQrTicket = async (service: Service, name: string) => {
        if (!name.trim() || qrSubmissionLockRef.current) return;

        qrSubmissionLockRef.current = true;
        setIsCreating(true);
        try {
            const ticket = await apiClient.post<{ id: string; customerName?: string | null }>('/api/tickets', {
                serviceId: service.id,
                customerName: name.trim(),
            });
            if (ticket.customerName) storeCustomerName(ticket.id, ticket.customerName);
            router.push(`/waiting?ticketId=${ticket.id}`);
        } catch (error) {
            qrSubmissionLockRef.current = false;
            toast.error(error instanceof Error ? error.message : 'Lỗi tạo vé.');
            setCustomerName('');
            setQrScanKey((key) => key + 1);
        } finally {
            setIsCreating(false);
        }
    };

    const handleScanSuccess = (service: Service, decodedText: string) => {
        if (qrSubmissionLockRef.current) return;

        const name = parseCCCDName(decodedText);

        if (!name) {
            toast.error('Không thể nhận diện thông tin từ mã QR.');
            return;
        }

        setCustomerName(name);
        toast.success(`Đã tìm thấy tên: ${name}`);
        void submitQrTicket(service, name);
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

    if (isLoading) {
        return (
            <div className="min-h-full bg-background">
                <div className="mx-auto max-w-4xl px-4 py-12">
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

    if (selectedService && mode === 'form') {
        return (
            <div className="relative min-h-full bg-background overflow-hidden">
                <PageWatermark className="left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-[31.25rem] w-[31.25rem] opacity-[0.10]" />
                <div className="relative z-10 flex min-h-full items-center justify-center px-4 py-8">
                    <Card className="w-full max-w-md sketch-radius riso-paper-card glass-card shadow-md">
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
                            <CardTitle className="text-2xl">{selectedService.name}</CardTitle>
                            <CardDescription>Nhập thông tin để lấy số</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
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
                                        className="h-11 w-11 shrink-0"
                                        onClick={toggleVoice}
                                        title={isListening ? 'Đang nghe...' : 'Nhập bằng giọng nói'}
                                        aria-label={isListening ? 'Đang nghe...' : 'Nhập bằng giọng nói'}
                                    >
                                        {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                                    </Button>
                                </div>
                            </div>
                            <Button
                                className="w-full h-12 text-lg font-medium"
                                onClick={() => handleCreateTicket(selectedService)}
                                disabled={isCreating}
                            >
                                {isCreating ? 'Đang tạo...' : 'Xác nhận lấy số'}
                            </Button>
                        </CardContent>
                    </Card>
                </div>
            </div>
        );
    }

    return (
        <div className="relative min-h-full bg-background overflow-hidden">
            <PageWatermark className="left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-[31.25rem] w-[31.25rem] opacity-[0.10]" />
            <div className="relative z-10 mx-auto max-w-4xl px-4 py-8 sm:py-10">
                <div className="text-center mb-6 sm:mb-8">
                    <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">Chọn dịch vụ để lấy số</h1>
                    <p className="text-muted-foreground mt-2 text-sm sm:text-base">Quý bà con vui lòng chọn thủ tục cần thực hiện</p>
                </div>

                <ServiceActionCards
                    services={services}
                    mode={homeNameFirst ? 'citizen-name-first' : 'citizen'}
                    disabled={isCreating}
                    onQuick={(service, name) => void handleQuickTicket(service, name)}
                    onManual={() => undefined}
                    onQr={() => undefined}
                />

                {services.length === 0 && (
                    <div className="text-center py-12 text-muted-foreground">
                        Hiện chưa có dịch vụ nào đang hoạt động.
                    </div>
                )}
            </div>

            {mode === 'scan' && selectedService && (
                <div className="fixed inset-0 z-20 flex items-center justify-center bg-background">
                    <QRScanner
                        key={qrScanKey}
                        onScanSuccess={(decodedText) => handleScanSuccess(selectedService, decodedText)}
                        onScanError={(err) => toast.error(err)}
                    />
                    <Button
                        variant="ghost"
                        className="absolute right-4 top-4 min-h-11"
                        onClick={() => {
                            setMode(null);
                            setSelectedService(null);
                            setCustomerName('');
                        }}
                        aria-label={'Đóng quét CCCD cho dịch vụ ' + selectedService.name}
                    >
                        Đóng
                    </Button>
                </div>
            )}
        </div>
    );
}