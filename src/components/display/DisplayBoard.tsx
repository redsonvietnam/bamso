"use client";

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Ticket } from '@prisma/client';
import { TicketStatus } from '@/lib/constants';
import { Card, CardContent, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Monitor, Users, Volume2 } from 'lucide-react';
import { useSpeech } from '@/hooks/useSpeech';

// Define types for the data received from SSE
interface DisplayCallEvent {
    type: 'DISPLAY_CALL';
    ticketNumber: string;
    pos: string;
    nextTicketNumber?: string;
}

interface QueueUpdateEvent {
    type: 'QUEUE_UPDATE';
    tickets: Ticket[];
}

interface CurrentCall {
    ticketNumber: string;
    pos: string;
    timestamp: number; // To track recent calls for highlighting
}

/**
 * DisplayBoard Component
 * Hiển thị danh sách các số đang được gọi và hàng đợi trên màn hình lớn.
 */
export default function DisplayBoard() {
    const [currentCalls, setCurrentCalls] = useState<Record<string, CurrentCall>>({});
    const [pendingTickets, setPendingTickets] = useState<Ticket[]>([]);
    const [lastCalledTicket, setLastCalledTicket] = useState<CurrentCall | null>(null);
    const [isConnectedQueue, setIsConnectedQueue] = useState(false);
    const [isConnectedDisplay, setIsConnectedDisplay] = useState(false);

    const audioRef = useRef<HTMLAudioElement | null>(null);
    const { speak } = useSpeech();

    useEffect(() => {
        // Initialize audio element
        audioRef.current = new Audio('/sounds/chime.mp3'); // Assuming chime.mp3 is in public/sounds
        audioRef.current.load();

        // SSE for Display Calls
        const displayEventSource = new EventSource('/api/sse/display');
        displayEventSource.onopen = () => setIsConnectedDisplay(true);
        displayEventSource.onmessage = (event) => {
            try {
                const data: DisplayCallEvent = JSON.parse(event.data);
                if (data.type === 'DISPLAY_CALL') {
                    const newCall: CurrentCall = { ticketNumber: data.ticketNumber, pos: data.pos, timestamp: Date.now() };
                    setCurrentCalls(prev => ({ ...prev, [data.pos]: newCall }));
                    setLastCalledTicket(newCall);
                    audioRef.current?.play().catch(e => console.error("Error playing sound:", e));

                    // Announce the ticket call via TTS
                    speak(`Mời số ${data.ticketNumber} đến ${data.pos} để phục vụ`);

                    // Announce the next ticket if available (after a short delay)
                    if (data.nextTicketNumber) {
                        setTimeout(() => {
                            speak(`Số ${data.nextTicketNumber} chuẩn bị`);
                        }, 3000);
                    }

                    // Clear highlight after a few seconds
                    setTimeout(() => setLastCalledTicket(null), 5000);
                }
            } catch (error) {
                console.error('Error parsing display SSE message:', error);
            }
        };
        displayEventSource.onerror = () => setIsConnectedDisplay(false);

        // SSE for Queue Updates (all services)
        const queueEventSource = new EventSource('/api/sse/queue'); // No serviceId filter
        queueEventSource.onopen = () => setIsConnectedQueue(true);
        queueEventSource.onmessage = (event) => {
            try {
                const data: QueueUpdateEvent = JSON.parse(event.data);
                if (data.type === 'QUEUE_UPDATE' && Array.isArray(data.tickets)) {
                    setPendingTickets(data.tickets.filter(t => t.status === TicketStatus.PENDING));
                }
            } catch (error) {
                console.error('Error parsing queue SSE message:', error);
            }
        };
        queueEventSource.onerror = () => setIsConnectedQueue(false);

        return () => {
            displayEventSource.close();
            queueEventSource.close();
        };
    }, [speak]);

    // Sort current calls by position name (e.g., Quầy 1, Quầy 2)
    const sortedCurrentCalls = useMemo(() => {
        return Object.values(currentCalls).sort((a, b) => a.pos.localeCompare(b.pos));
    }, [currentCalls]);

    return (
        <div className="flex h-screen w-screen bg-gray-900 text-white font-sans p-8">
            {/* Left Section: Main Display */}
            <div className="flex-1 flex flex-col pr-8">
                <h1 className="text-6xl font-extrabold text-primary mb-8 text-center">
                    BẢNG GỌI SỐ
                </h1>
                <div className="flex-1 grid grid-cols-2 gap-6">
                    {sortedCurrentCalls.length > 0 ? (
                        sortedCurrentCalls.map((call) => (
                            <Card
                                key={call.pos}
                                className={`bg-gray-800 border-2 ${lastCalledTicket?.pos === call.pos && lastCalledTicket?.ticketNumber === call.ticketNumber
                                    ? 'border-yellow-400 shadow-yellow-500/50 animate-pulse-once'
                                    : 'border-gray-700'
                                    } transition-all duration-500 flex flex-col justify-center items-center p-6`}
                            >
                                <CardTitle className="text-4xl font-bold text-gray-300 mb-4">
                                    {call.pos}
                                </CardTitle>
                                <CardContent className="p-0">
                                    <p className="text-8xl font-black text-yellow-300">
                                        {call.ticketNumber}
                                    </p>
                                </CardContent>
                            </Card>
                        ))
                    ) : (
                        <div className="col-span-2 flex items-center justify-center text-gray-500 text-3xl italic">
                            <Monitor className="w-10 h-10 mr-4" />
                            Chưa có số nào được gọi
                        </div>
                    )}
                </div>
            </div>

            {/* Right Section: Pending Queue */}
            <div className="w-1/4 flex flex-col pl-8 border-l border-gray-700">
                <h2 className="text-4xl font-bold text-gray-300 mb-6 flex items-center">
                    <Users className="w-8 h-8 mr-4" />
                    Đang chờ ({pendingTickets.length})
                </h2>
                <ScrollArea className="flex-1 pr-4">
                    <div className="space-y-4">
                        {pendingTickets.length > 0 ? (
                            pendingTickets.map((ticket) => (
                                <div
                                    key={ticket.id}
                                    className="bg-gray-800 p-4 rounded-lg flex justify-between items-center border border-gray-700"
                                >
                                    <span className="text-4xl font-bold text-white">
                                        {ticket.ticketNumber}
                                    </span>
                                    <span className="text-xl text-gray-400">
                                        Vị trí: {ticket.position}
                                    </span>
                                </div>
                            ))
                        ) : (
                            <div className="text-gray-500 text-2xl italic text-center py-10">
                                Hàng đợi trống
                            </div>
                        )}
                    </div>
                </ScrollArea>
                <div className="mt-8 pt-4 border-t border-gray-700 text-gray-500 text-sm flex justify-between items-center">
                    <span>
                        Trạng thái kết nối:
                        <span className={`ml-2 ${isConnectedQueue && isConnectedDisplay ? 'text-green-400' : 'text-red-400'}`}>
                            {isConnectedQueue && isConnectedDisplay ? 'Đã kết nối' : 'Mất kết nối'}
                        </span>
                    </span>
                    <Volume2 className="w-5 h-5" />
                </div>
            </div>
        </div>
    );
}

// Add a simple keyframe animation for pulse-once
// This would typically go into a global CSS file or be defined with a CSS-in-JS solution
// For now, I'll assume it's handled by a global CSS file or Tailwind config.
/*
@keyframes pulse-once {
  0% { box-shadow: 0 0 0 0 rgba(252, 211, 77, 0.7); }
  70% { box-shadow: 0 0 0 10px rgba(252, 211, 77, 0); }
  100% { box-shadow: 0 0 0 0 rgba(252, 211, 77, 0); }
}
.animate-pulse-once {
  animation: pulse-once 1.5s ease-out forwards;
}
*/