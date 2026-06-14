"use client";

import React, { useState } from 'react';
import { Ticket, Service } from '@prisma/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import LiveTracker from '@/components/customer/LiveTracker';
import { Search, RotateCcw } from 'lucide-react';
import { logger } from '@/lib/logger';

export default function TrackPage() {
    const [query, setQuery] = useState('');
    const [foundTicket, setFoundTicket] = useState<(Ticket & { service: Service }) | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!query.trim()) {
            toast.error('Vui lòng nhập số phiếu hoặc số điện thoại.');
            return;
        }

        setIsLoading(true);
        setFoundTicket(null); // Clear previous result
        try {
            const res = await fetch(`/api/tickets/track?query=${encodeURIComponent(query.trim())}`);
            const data = await res.json();

            if (!res.ok) {
                toast.error(data.error || 'Đã xảy ra lỗi khi tra cứu.');
                return;
            }

            setFoundTicket(data);
            toast.success('Tìm thấy vé của bạn!');
        } catch (error) {
            logger.error('Search error:', error);
            toast.error('Lỗi kết nối hoặc hệ thống. Vui lòng thử lại.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleReset = () => {
        setQuery('');
        setFoundTicket(null);
        setIsLoading(false);
    };

    return (
        <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-green-50 via-white to-emerald-50 py-12 px-4 sm:px-6 lg:px-8">
            {foundTicket ? (
                <div className="space-y-6">
                    <LiveTracker initialTicket={foundTicket} />
                    <div className="text-center">
                        <Button onClick={handleReset} variant="outline" className="mt-4">
                            <RotateCcw className="mr-2 h-4 w-4" /> Tra cứu số khác
                        </Button>
                    </div>
                </div>
            ) : (
                <Card className="w-full max-w-md">
                    <CardHeader>
                        <CardTitle className="text-2xl text-center">Tra cứu vé của bạn</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleSearch} className="space-y-4">
                            <div className="grid w-full items-center gap-1.5">
                                <Label htmlFor="query">Số phiếu hoặc Số điện thoại</Label>
                                <Input
                                    id="query"
                                    type="text"
                                    placeholder="Ví dụ: A001 hoặc 0901234567"
                                    value={query}
                                    onChange={(e) => setQuery(e.target.value)}
                                    disabled={isLoading}
                                />
                            </div>
                            <Button type="submit" className="w-full" disabled={isLoading}>
                                {isLoading ? 'Đang tra cứu...' : 'Tra cứu'}
                                {!isLoading && <Search className="ml-2 h-4 w-4" />}
                            </Button>
                        </form>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}