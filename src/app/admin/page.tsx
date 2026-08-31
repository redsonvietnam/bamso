"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '@/stores/auth.store';
import { Button } from '@/components/ui/button';
import { LogOut, Settings, Users, ListChecks, BarChart3, Volume2, Palette } from 'lucide-react';
import ServicesPanel from '@/components/admin/ServicesPanel';
import StaffPanel from '@/components/admin/StaffPanel';
import SettingsPanel from '@/components/admin/SettingsPanel';
import StatsPanel from '@/components/admin/StatsPanel';
import TtsPanel from '@/components/admin/TtsPanel';
import ThemeBuilderPanel from '@/components/admin/ThemeBuilderPanel';
import { PageWatermark } from '@/components/ui/dong-son-motif';
import { useHeaderRight } from '@/components/layout/app-shell';
import { apiClient } from '@/lib/api-client';

type Tab = 'services' | 'staff' | 'settings' | 'stats' | 'tts' | 'themes';

export default function AdminPage() {
    const { fetchMe, logout } = useAuthStore();
    const [activeTab, setActiveTab] = useState<Tab>('services');
    const [watermarkOpacity, setWatermarkOpacity] = useState<number | undefined>(undefined);

    useEffect(() => {
        fetchMe();
    }, [fetchMe]);

    useEffect(() => {
        apiClient.get<{ key: string; value: string }[]>('/api/settings').then((data) => {
            const val = data.find((s) => s.key === 'surface_opacity')?.value;
            if (val !== undefined && !Number.isNaN(Number(val))) {
                setWatermarkOpacity(Number(val) / 100);
            }
        }).catch(() => {});
    }, []);

    const handleLogout = useCallback(async () => {
        await logout();
        window.location.href = '/login';
    }, [logout]);

    useHeaderRight(
        <Button variant="outline" size="sm" onClick={handleLogout}>
            <LogOut className="w-4 h-4 mr-2" /> Đăng xuất
        </Button>
    );

    const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
        { id: 'services', label: 'Dịch vụ', icon: <ListChecks className="w-4 h-4" /> },
        { id: 'staff', label: 'Nhân viên', icon: <Users className="w-4 h-4" /> },
        { id: 'stats', label: 'Thống kê', icon: <BarChart3 className="w-4 h-4" /> },
        { id: 'settings', label: 'Cài đặt', icon: <Settings className="w-4 h-4" /> },
        { id: 'tts', label: 'Giọng nói', icon: <Volume2 className="w-4 h-4" /> },
        { id: 'themes', label: 'Giao diện', icon: <Palette className="w-4 h-4" /> },
    ];

    return (
        <div className="relative min-h-full bg-background overflow-hidden">
            <PageWatermark
                className="left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-[31.25rem] w-[31.25rem]"
                opacity={watermarkOpacity}
            />

            <div className="relative z-10 max-w-6xl mx-auto px-6 py-8">
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
                {activeTab === 'tts' && <TtsPanel />}
                {activeTab === 'themes' && <ThemeBuilderPanel />}
            </div>
        </div>
    );
}
