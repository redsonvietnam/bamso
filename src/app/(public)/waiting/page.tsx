"use client";

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Ticket, Service } from '@prisma/client';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import WaitingTracker from '@/components/customer/WaitingTracker';
import { PageWatermark } from '@/components/ui/dong-son-motif';
import { ArrowLeft, Ticket as TicketIcon, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { apiClient } from '@/lib/api-client';

function WaitingContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const ticketId = searchParams.get('ticketId');

  const [ticket, setTicket] = useState<(Ticket & { service: Service }) | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ticketId) {
      const id = setTimeout(() => {
        setError('Không tìm thấy thông tin vé.');
        setIsLoading(false);
      });
      return () => clearTimeout(id);
    }

    const fetchTicket = async () => {
      try {
        const data = await apiClient.get<(Ticket & { service: Service })>(`/api/tickets/track?query=${encodeURIComponent(ticketId)}`);
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
      <div className="flex min-h-full items-center justify-center bg-background px-4">
        <div className="w-full max-w-md space-y-5">
          <div className="flex justify-center">
            <div className="h-2 w-16 rounded-full bg-brand-gold" />
          </div>
          <Skeleton className="h-10 w-40 mx-auto" />
          <Skeleton className="h-72 w-full rounded-3xl" />
          <Skeleton className="h-16 w-full rounded-2xl" />
          <div className="flex gap-3">
            <Skeleton className="h-14 flex-1 rounded-2xl" />
            <Skeleton className="h-14 flex-1 rounded-2xl" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !ticket) {
    return (
      <div className="flex min-h-full items-center justify-center bg-background px-4">
        <Card className="w-full max-w-sm sketch-radius riso-paper-card glass-card border-border shadow-lg">
          <CardContent className="p-8 text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-rose-50 flex items-center justify-center mx-auto">
              <TicketIcon className="w-8 h-8 text-rose-500" />
            </div>
            <h2 className="text-xl font-bold text-foreground">Không tìm thấy vé</h2>
            <p className="text-sm text-muted-foreground">{error || 'Vé không tồn tại hoặc đã bị xoá.'}</p>
            <div className="flex gap-3 justify-center pt-2">
              <Button variant="outline" className="rounded-xl" onClick={() => router.push('/get-ticket')}>
                <ArrowLeft className="w-4 h-4 mr-2" /> Lấy số mới
              </Button>
              <Button className="rounded-xl bg-primary hover:bg-primary/90" onClick={() => router.push('/track')}>
                <Search className="w-4 h-4 mr-2" /> Tra cứu
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="relative min-h-full bg-background overflow-hidden">
      <PageWatermark className="left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-[31.25rem] w-[31.25rem] opacity-[0.10]" />
      <div className="mx-auto max-w-5xl px-4 pt-6 sm:px-6">
        <div className="flex items-center justify-center gap-2 rounded-full bg-primary/10 px-3 py-1.5 w-fit mx-auto">
          <span className="h-2 w-2 rounded-full bg-brand-gold" />
          <span className="text-xs font-medium text-primary">Trạng thái vé — {ticket.service.name}</span>
        </div>
      </div>
      <WaitingTracker initialTicket={ticket} />
    </div>
  );
}

export default function WaitingPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-full items-center justify-center bg-background px-4">
        <div className="w-full max-w-md space-y-5">
          <div className="flex justify-center">
            <div className="h-2 w-16 rounded-full bg-brand-gold" />
          </div>
          <Skeleton className="h-10 w-40 mx-auto" />
          <Skeleton className="h-72 w-full rounded-3xl" />
          <Skeleton className="h-16 w-full rounded-2xl" />
          <div className="flex gap-3">
            <Skeleton className="h-14 flex-1 rounded-2xl" />
            <Skeleton className="h-14 flex-1 rounded-2xl" />
          </div>
        </div>
      </div>
    }>
      <WaitingContent />
    </Suspense>
  );
}
