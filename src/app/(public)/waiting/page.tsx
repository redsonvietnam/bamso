"use client";

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Ticket, Service } from '@prisma/client';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import WaitingTracker from '@/components/customer/WaitingTracker';
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
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-white flex items-center justify-center px-4">
        <div className="w-full max-w-md space-y-5">
          <div className="flex justify-center">
            <div className="h-2 w-16 rounded-full bg-emerald-500" />
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
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-white flex items-center justify-center px-4">
        <Card className="w-full max-w-sm border-slate-200 shadow-lg">
          <CardContent className="p-8 text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-rose-50 flex items-center justify-center mx-auto">
              <TicketIcon className="w-8 h-8 text-rose-500" />
            </div>
            <h2 className="text-xl font-bold text-slate-900">Không tìm thấy vé</h2>
            <p className="text-sm text-slate-500">{error || 'Vé không tồn tại hoặc đã bị xoá.'}</p>
            <div className="flex gap-3 justify-center pt-2">
              <Button variant="outline" className="rounded-xl" onClick={() => router.push('/get-ticket')}>
                <ArrowLeft className="w-4 h-4 mr-2" /> Lấy số mới
              </Button>
              <Button className="rounded-xl bg-emerald-600 hover:bg-emerald-700" onClick={() => router.push('/track')}>
                <Search className="w-4 h-4 mr-2" /> Tra cứu
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-white">
      <header className="bg-white/80 backdrop-blur-sm border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-xl mx-auto px-4 py-3 flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            className="text-slate-600 hover:text-slate-900"
            onClick={() => router.push('/get-ticket')}
          >
            <ArrowLeft className="w-4 h-4 mr-1.5" /> Quay lại
          </Button>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            <span className="text-sm font-medium text-slate-500">Trạng thái vé</span>
          </div>
          <div className="w-20" />
        </div>
      </header>

      <WaitingTracker initialTicket={ticket} />
    </div>
  );
}

export default function WaitingPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-white flex items-center justify-center px-4">
        <div className="w-full max-w-md space-y-5">
          <div className="flex justify-center">
            <div className="h-2 w-16 rounded-full bg-emerald-500" />
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
