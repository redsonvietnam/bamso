"use client";

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Ticket, Service } from '@prisma/client';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import WaitingTracker from '@/components/customer/WaitingTracker';
import { ArrowLeft, Ticket as TicketIcon, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';

function WaitingContent() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const ticketId = searchParams.get('ticketId');

    const [ticket, setTicket] = useState<(Ticket & { service: Service }) | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!ticketId) {
            setError('Không tìm thấy thông tin vé.');
            setIsLoading(false);
            return;
        }

        const fetchTicket = async () => {
            try {
                const res = await fetch(`/api/tickets/track?query=${encodeURIComponent(ticketId)}`);
                const data = await res.json();

                if (!res.ok) {
                    throw new Error(data.error || 'Không thể tải thông tin vé.');
                }

                setTicket(data);
            } catch (error) {
                const msg = error instanceof Error ? error.message : 'Lỗi khi tải vé.';
                setError(msg);
                toast.error(msg);
            } finally {
                setIsLoading(false);
            }
        };

        fetchTicket();
    }, [ticketId]);

    if (isLoading) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center px-4">
                <div className="w-full max-w-md space-y-4">
                    <Skeleton className="h-12 w-48 mx-auto" />
                    <Skeleton className="h-64 w-full rounded-xl" />
                    <Skeleton className="h-8 w-32 mx-auto" />
                </div>
            </div>
        );
    }

    if (error || !ticket) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center px-4">
                <Card className="w-full max-w-md">
                    <CardContent className="p-8 text-center space-y-4">
                        <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto">
                            <TicketIcon className="w-8 h-8 text-destructive" />
                        </div>
                        <h2 className="text-xl font-bold">Không tìm thấy vé</h2>
                        <p className="text-muted-foreground">{error || 'Vé không tồn tại hoặc đã bị xoá.'}</p>
                        <div className="flex gap-3 justify-center pt-4">
                            <Button variant="outline" onClick={() => router.push('/get-ticket')}>
                                <ArrowLeft className="w-4 h-4 mr-2" /> Lấy số mới
                            </Button>
                            <Button onClick={() => router.push('/track')}>
                                <Home className="w-4 h-4 mr-2" /> Tra cứu
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
            {/* Header */}
            <header className="bg-white/80 backdrop-blur-sm border-b sticky top-0 z-10">
                <div className="max-w-md mx-auto px-4 py-3 flex items-center justify-between">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => router.push('/get-ticket')}
                    >
                        <ArrowLeft className="w-4 h-4 mr-2" /> Quay lại
                    </Button>
                    <span className="text-sm font-medium text-muted-foreground">Trạng thái vé</span>
                    <div className="w-20" /> {/* Spacer */}
                </div>
            </header>

            {/* Waiting Tracker */}
            <WaitingTracker initialTicket={ticket} />
        </div>
    );
}

export default function WaitingPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center px-4">
                <div className="w-full max-w-md space-y-4">
                    <Skeleton className="h-12 w-48 mx-auto" />
                    <Skeleton className="h-64 w-full rounded-xl" />
                    <Skeleton className="h-8 w-32 mx-auto" />
                </div>
            </div>
        }>
            <WaitingContent />
        </Suspense>
    );
}