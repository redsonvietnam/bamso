"use client";

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Check, Plus, X } from 'lucide-react';

export default function SettingsPanel() {
    const [settings, setSettings] = useState<Record<string, string>>({});
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        const fetchSettings = async () => {
            try {
                const res = await fetch('/api/settings');
                if (res.ok) {
                    const data = await res.json();
                    const map: Record<string, string> = {};
                    data.forEach((s: { key: string; value: string }) => { map[s.key] = s.value; });
                    setSettings(map);
                }
            } catch (error) {
                console.error('Error fetching settings:', error);
            } finally {
                setIsLoading(false);
            }
        };

        fetchSettings();
    }, []);

    const handleSave = async (key: string, value: string) => {
        setIsSaving(true);
        try {
            const res = await fetch('/api/settings', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key, value }),
            });

            if (!res.ok) throw new Error('Lỗi lưu cài đặt.');

            toast.success('Đã lưu cài đặt.');
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Lỗi lưu cài đặt.');
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) return <p className="text-muted-foreground">Đang tải...</p>;

    return (
        <div className="space-y-6">
            <h2 className="text-xl font-semibold">Cài đặt hệ thống</h2>

            <Card>
                <CardHeader>
                    <CardTitle>Tên cơ quan / tổ chức</CardTitle>
                    <CardDescription>Hiển thị trên trang chủ và kiosk</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex gap-3">
                        <Input
                            value={settings['agency_name'] || ''}
                            onChange={(e) => setSettings({ ...settings, agency_name: e.target.value })}
                            placeholder="Ví dụ: Trung tâm phục vụ hành chính công"
                            className="max-w-md"
                        />
                        <Button
                            onClick={() => handleSave('agency_name', settings['agency_name'] || '')}
                            disabled={isSaving}
                        >
                            <Check className="w-4 h-4 mr-1" /> Lưu
                        </Button>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Luật bỏ qua (Skip Rules)</CardTitle>
                    <CardDescription>
                        Định dạng: số lần bỏ qua được đẩy lại, cách nhau bởi dấu phẩy.
                        Cuối cùng là MISSED để đánh dấu nhỡ lượt.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex gap-3">
                        <Input
                            value={settings['skip_rules'] || '1,3,5,MISSED'}
                            onChange={(e) => setSettings({ ...settings, skip_rules: e.target.value })}
                            placeholder="1,3,5,MISSED"
                            className="max-w-md font-mono"
                        />
                        <Button
                            onClick={() => handleSave('skip_rules', settings['skip_rules'] || '1,3,5,MISSED')}
                            disabled={isSaving}
                        >
                            <Check className="w-4 h-4 mr-1" /> Lưu
                        </Button>
                    </div>
                    <p className="text-sm text-muted-foreground mt-2">
                        Mặc định: <code className="bg-muted px-1 py-0.5 rounded">1,3,5,MISSED</code> — Lần 1 đẩy sau 1 vé, lần 2 đẩy sau 3 vé, lần 3 đẩy sau 5 vé, lần 4 → MISSED
                    </p>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Danh sách quầy</CardTitle>
                    <CardDescription>
                        Các quầy mà cán bộ có thể chọn khi trực. Mỗi quầy cách nhau bằng dấu phẩy (ví dụ: Quầy 1, Quầy 2, Quầy 3).
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex gap-3">
                        <Input
                            value={settings['counters'] || ''}
                            onChange={(e) => setSettings({ ...settings, counters: e.target.value })}
                            placeholder="Quầy 1, Quầy 2, Quầy 3"
                            className="max-w-md"
                        />
                        <Button
                            onClick={() => handleSave('counters', settings['counters'] || '')}
                            disabled={isSaving}
                        >
                            <Check className="w-4 h-4 mr-1" /> Lưu
                        </Button>
                    </div>
                    {settings['counters'] && settings['counters'].split(',').filter(Boolean).length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2">
                            {settings['counters'].split(',').map((counter, i) => (
                                <span key={i} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium">
                                    {counter.trim()}
                                </span>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
