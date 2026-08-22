"use client";

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Ticket, CheckCircle, XCircle, Clock, Users, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { apiClient } from '@/lib/api-client';
import { buildStatsCsv } from '@/lib/stats-csv';
import { logger } from '@/lib/logger';

type StatsData = {
    summary: {
        total: number;
        completed: number;
        missed: number;
        pending: number;
        active: number;
        avgWaitTimeSeconds: number;
    };
    hourly: { hour: string; count: number }[];
    services: { id: string; name: string; code: string; color: string; total: number; completed: number; pending: number }[];
    peakHours: { hour: string; count: number }[];
};

function todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function StatsPanel() {
    const [stats, setStats] = useState<StatsData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [fromDate, setFromDate] = useState(todayStr());
    const [toDate, setToDate] = useState(todayStr());
    const [selectedService, setSelectedService] = useState<string>('');

    useEffect(() => {
        const fetchStats = async () => {
            setIsLoading(true);
            try {
                const url = selectedService
                    ? `/api/stats?from=${fromDate}&to=${toDate}&serviceId=${selectedService}`
                    : `/api/stats?from=${fromDate}&to=${toDate}`;
                const data = await apiClient.get<StatsData>(url);
                setStats(data);
            } catch (error) {
                logger.error('Error fetching stats:', error);
            } finally {
                setIsLoading(false);
            }
        };

        fetchStats();
    }, [fromDate, toDate, selectedService]);

    const handleExportCsv = () => {
        if (!stats) return;
        const blob = new Blob([buildStatsCsv(stats, dateRangeLabel)], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `thong-ke-bamso-${dateRangeLabel}.csv`);
        link.click();
        URL.revokeObjectURL(url);
    };

    const formatWaitTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}p ${secs}g`;
    };

    const pieData = stats ? [
        { name: 'Hoàn thành', value: stats.summary.completed, color: '#22c55e' },
        { name: 'Đang phục vụ', value: stats.summary.active, color: '#3b82f6' },
        { name: 'Đang chờ', value: stats.summary.pending, color: '#f59e0b' },
        { name: 'Nhỡ lượt', value: stats.summary.missed, color: '#ef4444' },
    ].filter(d => d.value > 0) : [];

    const dateRangeLabel = fromDate === toDate
        ? fromDate
        : `${fromDate} → ${toDate}`;

    if (isLoading) return <p className="text-muted-foreground">Đang tải thống kê...</p>;
    if (!stats) return <p className="text-muted-foreground">Không có dữ liệu.</p>;

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <h2 className="text-xl font-semibold">Thống kê</h2>
                <div className="flex items-center gap-2">
                    <label className="text-sm text-muted-foreground">Từ</label>
                    <input
                        type="date"
                        value={fromDate}
                        onChange={(e) => setFromDate(e.target.value)}
                        className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                    />
                    <label className="text-sm text-muted-foreground">đến</label>
                    <input
                        type="date"
                        value={toDate}
                        onChange={(e) => setToDate(e.target.value)}
                        className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                    />
                    <select
                        value={selectedService}
                        onChange={(e) => setSelectedService(e.target.value)}
                        className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                        <option value="">Tất cả dịch vụ</option>
                        {stats.services?.map((s) => (
                            <option key={s.id} value={s.id}>
                                {s.name}
                            </option>
                        ))}
                        {stats.services?.length === 0 && <option value="">Không có dịch vụ</option>}
                    </select>
                    <Button variant="outline" size="sm" onClick={handleExportCsv}>
                        <Download className="w-4 h-4 mr-2" /> Xuất CSV
                    </Button>
                </div>
            </div>

            <p className="text-sm text-muted-foreground">Kỳ: {dateRangeLabel}</p>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                <SummaryCard icon={<Ticket className="w-5 h-5" />} label="Tổng số" value={stats.summary.total} color="text-blue-600" />
                <SummaryCard icon={<CheckCircle className="w-5 h-5" />} label="Hoàn thành" value={stats.summary.completed} color="text-green-600" />
                <SummaryCard icon={<Users className="w-5 h-5" />} label="Đang chờ" value={stats.summary.pending} color="text-yellow-600" />
                <SummaryCard icon={<Clock className="w-5 h-5" />} label="Đang phục vụ" value={stats.summary.active} color="text-blue-500" />
                <SummaryCard icon={<XCircle className="w-5 h-5" />} label="Nhỡ lượt" value={stats.summary.missed} color="text-red-600" />
                <SummaryCard icon={<Clock className="w-5 h-5" />} label="Chờ TB" value={formatWaitTime(stats.summary.avgWaitTimeSeconds)} color="text-purple-600" />
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Hourly Chart */}
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Số vé theo giờ</CardTitle>
                        <CardDescription>Lượng vé tạo ra trong từng khung giờ</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ResponsiveContainer width="100%" height={250}>
                            <BarChart data={stats.hourly}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="hour" tick={{ fontSize: 11 }} />
                                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                                <Tooltip />
                                <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>

                {/* Pie Chart */}
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Tỷ lệ trạng thái vé</CardTitle>
                        <CardDescription>Phân bổ vé theo trạng thái</CardDescription>
                    </CardHeader>
                    <CardContent className="flex items-center justify-center">
                        {pieData.length > 0 ? (
                            <ResponsiveContainer width="100%" height={250}>
                                <PieChart>
                                    <Pie
                                        data={pieData}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={60}
                                        outerRadius={90}
                                        paddingAngle={2}
                                        dataKey="value"
                                        label={({ name, value }) => `${name}: ${value}`}
                                    >
                                        {pieData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.color} />
                                        ))}
                                    </Pie>
                                    <Tooltip />
                                </PieChart>
                            </ResponsiveContainer>
                        ) : (
                            <p className="text-muted-foreground py-12 text-center">Chưa có dữ liệu vé.</p>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Peak Hours Chart */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Giờ cao điểm</CardTitle>
                    <CardDescription>Lượng vé cao nhất trong ngày</CardDescription>
                </CardHeader>
                <CardContent>
                    <ResponsiveContainer width="100%" height={250}>
                        <BarChart data={stats.peakHours ?? []}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="hour" tick={{ fontSize: 11 }} />
                            <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                            <Tooltip />
                            <Bar dataKey="count" fill="#ef4444" radius={[4, 4, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </CardContent>
            </Card>

            {/* Service Breakdown */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Chi tiết theo dịch vụ</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="border rounded-lg overflow-hidden">
                        <table className="w-full text-sm">
                            <thead className="bg-muted">
                                <tr>
                                    <th className="text-left p-3 font-medium">Dịch vụ</th>
                                    <th className="text-center p-3 font-medium">Tổng</th>
                                    <th className="text-center p-3 font-medium">Hoàn thành</th>
                                    <th className="text-center p-3 font-medium">Đang chờ</th>
                                    <th className="text-center p-3 font-medium">Tỷ lệ hoàn thành</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {stats.services.map((s) => {
                                    const completionRate = s.total > 0 ? Math.round((s.completed / s.total) * 100) : 0;
                                    return (
                                        <tr key={s.id} className="hover:bg-muted/50">
                                            <td className="p-3">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-4 h-4 rounded-full" style={{ backgroundColor: s.color }} />
                                                    <span className="font-medium">{s.name}</span>
                                                    <span className="text-muted-foreground text-xs">({s.code})</span>
                                                </div>
                                            </td>
                                            <td className="p-3 text-center font-semibold">{s.total}</td>
                                            <td className="p-3 text-center text-green-600">{s.completed}</td>
                                            <td className="p-3 text-center text-yellow-600">{s.pending}</td>
                                            <td className="p-3 text-center">
                                                <div className="flex items-center justify-center gap-2">
                                                    <div className="w-20 bg-muted rounded-full h-2">
                                                        <div
                                                            className="bg-green-500 h-2 rounded-full"
                                                            style={{ width: `${completionRate}%` }}
                                                        />
                                                    </div>
                                                    <span className="text-xs font-medium">{completionRate}%</span>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

function SummaryCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number | string; color: string }) {
    return (
        <Card>
            <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                    <span className={color}>{icon}</span>
                    <span className="text-xs text-muted-foreground">{label}</span>
                </div>
                <p className="text-2xl font-bold mt-1">{value}</p>
            </CardContent>
        </Card>
    );
}
