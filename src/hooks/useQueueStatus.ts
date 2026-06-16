'use client';

import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { Ticket, Service } from '@prisma/client';
import { useSpeech } from '@/hooks/useSpeech';
import { logger } from '@/lib/logger';

type ProximityLevel = 0 | 1 | 2 | 3;

export function useQueueStatus(initialTicket: Ticket & { service: Service }) {
  const [ticket, setTicket] = useState(initialTicket);
  const [allTickets, setAllTickets] = useState<(Ticket & { service: Service })[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [lastSpokenLevel, setLastSpokenLevel] = useState<ProximityLevel>(0);
  const [showThankYou, setShowThankYou] = useState(false);
  const { speak, isAudioUnlocked, unlockAudio } = useSpeech();

  const prevStatusRef = useRef(ticket.status);
  const thankYouTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearThankYouTimer = useCallback(() => {
    if (thankYouTimerRef.current) {
      clearTimeout(thankYouTimerRef.current);
      thankYouTimerRef.current = null;
    }
  }, []);

  const dismissThankYou = useCallback(() => {
    clearThankYouTimer();
    setShowThankYou(false);
  }, [clearThankYouTimer]);

  useEffect(() => {
    const eventSource = new EventSource(`/api/sse/queue?serviceId=${ticket.serviceId}`);
    eventSource.onopen = () => setIsConnected(true);
    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'QUEUE_UPDATE' && Array.isArray(data.tickets)) {
          setAllTickets(data.tickets);
          const updatedTicket = data.tickets.find((t: Ticket) => t.id === ticket.id);
          if (updatedTicket) {
            const prevStatus = prevStatusRef.current;
            const newStatus = updatedTicket.status;
            if (
              (prevStatus === 'CALLED' || prevStatus === 'IN_PROGRESS') &&
              newStatus === 'COMPLETED'
            ) {
              clearThankYouTimer();
              setShowThankYou(true);
              thankYouTimerRef.current = setTimeout(() => setShowThankYou(false), 15000);
            }
            prevStatusRef.current = newStatus;
            setTicket((prev) => ({ ...updatedTicket, service: prev.service }));
          }
        }
      } catch (error) {
        logger.error('Error parsing SSE message:', error);
      }
    };
    eventSource.onerror = () => setIsConnected(false);
    return () => {
      eventSource.close();
      clearThankYouTimer();
    };
  }, [ticket.id, ticket.serviceId, clearThankYouTimer]);

  useEffect(() => {
    if (showThankYou) {
      speak(`Cảm ơn bạn. Số ${ticket.ticketNumber} đã được phục vụ xong.`);
      const audio = new Audio('/sounds/chime.mp3');
      audio.play().catch(() => {});
    }
  }, [showThankYou, speak, ticket.ticketNumber]);

  const queueAhead = useMemo(() => {
    if (ticket.status !== 'PENDING') return 0;
    return allTickets.filter((t) => t.status === 'PENDING' && t.position < ticket.position).length;
  }, [allTickets, ticket.position, ticket.status]);

  const proximityLevel = useMemo<ProximityLevel>(() => {
    if (ticket.status !== 'PENDING') return 0;
    if (queueAhead <= 1) return 3;
    if (queueAhead <= 2) return 2;
    if (queueAhead <= 3) return 1;
    return 0;
  }, [queueAhead, ticket.status]);

  useEffect(() => {
    if (proximityLevel > 0 && proximityLevel !== lastSpokenLevel && soundEnabled && ticket.status === 'PENDING') {
      const message =
        proximityLevel === 3
          ? `Số ${ticket.ticketNumber} sắp đến lượt. Xin mời quý khách chuẩn bị.`
          : proximityLevel === 2
            ? `Số ${ticket.ticketNumber} sắp đến lượt, chỉ còn 2 lượt nữa.`
            : `Số ${ticket.ticketNumber} sắp đến lượt, chỉ còn 3 lượt nữa.`;
      speak(message);
      const id = setTimeout(() => setLastSpokenLevel(proximityLevel));
      return () => clearTimeout(id);
    }
    if (proximityLevel === 0 && lastSpokenLevel > 0) {
      const id = setTimeout(() => setLastSpokenLevel(0));
      return () => clearTimeout(id);
    }
  }, [proximityLevel, lastSpokenLevel, soundEnabled, ticket.ticketNumber, ticket.status, speak]);

  const currentServed = useMemo(() => {
    return allTickets.find((t) => t.status === 'CALLED' || t.status === 'IN_PROGRESS');
  }, [allTickets]);

  const handleToggleSound = useCallback(() => {
    const newEnabled = !soundEnabled;
    setSoundEnabled(newEnabled);
    if (newEnabled) unlockAudio();
  }, [soundEnabled, unlockAudio]);

  return {
    ticket,
    allTickets,
    isConnected,
    soundEnabled,
    isAudioUnlocked,
    queueAhead,
    proximityLevel,
    currentServed,
    showThankYou,
    dismissThankYou,
    handleToggleSound,
    unlockAudio,
  };
}
