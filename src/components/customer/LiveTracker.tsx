"use client";

import { useState, useEffect, useMemo } from 'react';
import { Ticket, Service } from '@prisma/client';
import { TicketStatus } from '@/lib/constants';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Clock, UserCheck, AlertCircle, CheckCircle2, MonitorPlay } from 'lucide-react';
import { logger } from '@/lib/logger';

interface LiveTrackerProps {
    initialTicket: Ticket & { service: Service };
}

/**
 * LiveTracker Component
 * Lắng nghe sự kiện SSE để cập nhật trạng thái vé theo thời gian thực.
 */
export default function LiveTracker({ initialTicket }: LiveTrackerProps) {
    const [ticket, setTicket] = useState<Ticket & { service: Service }>(initialTicket);
    const [allTickets, setAllTickets] = useState<Ticket[]>([]);
    const [isConnected, setIsConnected] = useState(false);

    useEffect(() => {
        // Khởi tạo kết nối SSE tới service cụ thể của vé
        const eventSource = new EventSource(`/api/sse/queue?serviceId=${ticket.serviceId}`);

        eventSource.onopen = () => {
            setIsConnected(true);
            logger.log('SSE Connected to queue');
        };

        eventSource.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);

                if (data.type === 'QUEUE_UPDATE' && Array.isArray(data.tickets)) {
                    const tickets = data.tickets as Ticket[];
                    setAllTickets(tickets);

                    // Tìm vé của người dùng trong danh sách cập nhật
                    const updatedTicket = tickets.find((t) => t.id === ticket.id);
                    if (updatedTicket) {
                        // Lưu ý: data từ SSE có thể không kèm object service, ta giữ lại service cũ
                        setTicket(prev => ({ ...updatedTicket, service: prev.service }));
                    }
                }
            } catch (error) {
                logger.error('Error parsing SSE message:', error);
            }
        };

        eventSource.onerror = (error) => {
            logger.error('SSE connection error:', error);
            setIsConnected(false);
            // EventSource sẽ tự động cố gắng reconnect theo mặc định
        };

        // Cleanup khi component unmount
        return () => {
            eventSource.close();
        };
    }, [ticket.id, ticket.serviceId]);

    // Tính toán số người đang chờ trước mình (chỉ tính các vé PENDING có position nhỏ hơn)
    const peopleAhead = useMemo(() => {
        if (ticket.status !== 'PENDING') return 0;
        return allTickets.filter(t =>
            t.status === 'PENDING' &&
            t.position < ticket.position
        ).length;
    }, [allTickets, ticket.status, ticket.position]);

    // Cấu hình giao diện dựa trên trạng thái vé
    const statusConfig = {
        PENDING: {
            color: 'bg-slate-100 text-slate-700 border-slate-200',
            icon: <Clock className="w-5 h-5" />,
            label: 'Đang chờ phục vụ',
            description: peopleAhead > 0 ? `Còn ${peopleAhead} người phía trước` : 'Bạn là người tiếp theo',
        },
        CALLED: {
            color: 'bg-yellow-400 text-yellow-950 border-yellow-500 animate-pulse',
            icon: <MonitorPlay className="w-5 h-5" />,
            label: 'ĐẾN LƯỢT',
            description: `Mời bạn đến ${ticket.pos || 'quầy phục vụ'}`,
        },
        IN_PROGRESS: {
            color: 'bg-blue-500 text-white border-blue-600',
            icon: <UserCheck className="w-5 h-5" />,
            label: 'Đang xử lý',
            description: `Đang phục vụ tại ${ticket.pos || 'quầy'}`,
        },
        COMPLETED: {
            color: 'bg-green-500 text-white border-green-600',
            icon: <CheckCircle2 className="w-5 h-5" />,
            label: 'Hoàn tất',
            description: 'Cảm ơn bạn đã sử dụng dịch vụ',
        },
        MISSED: {
            color: 'bg-red-500 text-white border-red-600',
            icon: <AlertCircle className="w-5 h-5" />,
            label: 'Nhỡ lượt',
            description: 'Vui lòng liên hệ nhân viên để được hỗ trợ',
        },
    };

    const currentConfig = statusConfig[ticket.status as TicketStatus] || statusConfig.PENDING;

    return (
        <Card className="w-full max-w-md mx-auto overflow-hidden border-2 transition-all duration-500">
            <CardHeader className="pb-2">
                <div className="flex justify-between items-center">
                    <Badge variant="outline" className="text-xs font-normal">
                        {ticket.service.name}
                    </Badge>
                    <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} title={isConnected ? 'Đã kết nối' : 'Mất kết nối'} />
                </div>
                <CardTitle className="text-center pt-4 text-4xl font-black tracking-widest text-primary">
                    {ticket.ticketNumber}
                </CardTitle>
            </CardHeader>
            <CardContent className="text-center space-y-6 pb-8">
                <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full border ${currentConfig.color} font-bold text-lg`}>
                    {currentConfig.icon}
                    {currentConfig.label}
                </div>

                <div className="space-y-1">
                    <p className="text-muted-foreground text-sm uppercase tracking-wider">Trạng thái</p>
                    <p className="text-xl font-semibold">{currentConfig.description}</p>
                </div>

                {ticket.status === 'PENDING' && (
                    <div className="pt-4 border-t border-dashed">
                        <p className="text-xs text-muted-foreground italic">
                            Vui lòng theo dõi bảng hiển thị hoặc thông báo âm thanh
                        </p>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}