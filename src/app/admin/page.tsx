"use client";

import React, { useState, useEffect } from 'react';
import { useAuthStore } from '@/stores/auth.store';
import { Button } from '@/components/ui/button';
import { LogOut, Settings, Users, ListChecks, BarChart3 } from 'lucide-react';
import ServicesPanel from '@/components/admin/ServicesPanel';
import StaffPanel from '@/components/admin/StaffPanel';
import SettingsPanel from '@/components/admin/SettingsPanel';
import StatsPanel from '@/components/admin/StatsPanel';

type Tab = 'services' | 'staff' | 'settings' | 'stats';

export default function AdminPage() {
    const { user, fetchMe, logout } = useAuthStore();
    const [activeTab, setActiveTab] = useState<Tab>('services');

    useEffect(() => {
        fetchMe();
    }, [fetchMe]);

    const handleLogout = async () => {
        await logout();
        window.location.href = '/login';
    };

    const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
        { id: 'services', label: 'Dịch vụ', icon: <ListChecks className="w-4 h-4" /> },
        { id: 'staff', label: 'Nhân viên', icon: <Users className="w-4 h-4" /> },
        { id: 'stats', label: 'Thống kê', icon: <BarChart3 className="w-4 h-4" /> },
        { id: 'settings', label: 'Cài đặt', icon: <Settings className="w-4 h-4" /> },
    ];

    return (
        <div className="min-h-screen bg-zinc-50">
            <header className="bg-white border-b px-6 py-4 flex justify-between items-center shadow-sm">
                <div>
                    <h1 className="text-xl font-bold">Admin — Quản trị hệ thống</h1>
                    <p className="text-sm text-muted-foreground">Xin chào, {user?.name}</p>
                </div>
                <Button variant="outline" size="sm" onClick={handleLogout}>
                    <LogOut className="w-4 h-4 mr-2" /> Đăng xuất
                </Button>
            </header>

            <div className="max-w-6xl mx-auto px-6 py-8">
                <div className="flex gap-2 mb-6 border-b pb-1">
                    {tabs.map((tab) => (
                        <Button
                            key={tab.id}
                            variant={activeTab === tab.id ? 'default' : 'ghost'}
                            size="sm"
                            onClick={() => setActiveTab(tab.id)}
                            className="gap-2"
                        >
                            {tab.icon} {tab.label}
                        </Button>
                    ))}
                </div>

                {activeTab === 'services' && <ServicesPanel />}
                {activeTab === 'staff' && <StaffPanel />}
                {activeTab === 'stats' && <StatsPanel />}
                {activeTab === 'settings' && <SettingsPanel />}
            </div>
        </div>
    );
}
