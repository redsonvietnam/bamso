"use client";

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TtsSliderControl } from '@/components/admin/TtsSliderControl';
import { toast } from 'sonner';
import { Check, Palette } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { logger } from '@/lib/logger';
import { FONT_OPTIONS } from '@/lib/theme/fonts';
import { useThemes } from '@/lib/theme/use-themes';
import { PRESET_THEMES } from '@/lib/theme/presets';
import { hslToHex } from '@/lib/theme/color';

export default function SettingsPanel() {
    const { customs } = useThemes();
    const all = [...PRESET_THEMES, ...customs];
    const [settings, setSettings] = useState<Record<string, string>>({});
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        const fetchSettings = async () => {
            try {
                const data = await apiClient.get<{ key: string; value: string }[]>('/api/settings');
                const map: Record<string, string> = {};
                data.forEach((s: { key: string; value: string }) => { map[s.key] = s.value; });
                setSettings(map);
            } catch (error) {
                logger.error('Error fetching settings:', error);
            } finally {
                setIsLoading(false);
            }
        };

        fetchSettings();
    }, []);

    const handleSave = async (key: string, value: string) => {
        setIsSaving(true);
        try {
            await apiClient.put('/api/settings', { key, value });
            toast.success('Đã lưu cài đặt.');
            window.dispatchEvent(new Event('bamso:settings-updated'));
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Lỗi lưu cài đặt.');
        } finally {
            setIsSaving(false);
        }
    };

    const handleSaveFonts = async () => {
        setIsSaving(true);
        try {
            await apiClient.put('/api/settings', { key: 'font_sans', value: settings['font_sans'] || '' });
            await apiClient.put('/api/settings', { key: 'font_display', value: settings['font_display'] || '' });
            toast.success('Đã lưu cài đặt phông chữ.');
            window.dispatchEvent(new Event('bamso:settings-updated'));
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Lỗi lưu cài đặt phông chữ.');
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) return <p className="text-muted-foreground">Đang tải...</p>;

    return (
        <div className="space-y-6">
            <h2 className="text-xl font-semibold">Cài đặt hệ thống</h2>

            <TtsSliderControl
                cardTitle="Độ đục của thẻ / bề mặt"
                cardDescription="Điều chỉnh độ trong suốt của thẻ (card), nền mờ (muted) và nền phụ (secondary). Càng thấp càng trong suốt, nền trang lọt qua nhiều hơn. Không áp dụng cho theme Glass (luôn giữ hiệu ứng kính mờ)."
                value={settings['surface_opacity'] || '100'}
                min="0" max="100" step="5"
                displayValue={`${settings['surface_opacity'] || '100'}%`}
                isLoading={isSaving}
                onValueChange={(val) => setSettings({ ...settings, surface_opacity: val })}
                onSave={() => handleSave('surface_opacity', settings['surface_opacity'] || '100')}
             />

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Palette className="w-5 h-5" />
                        Giao diện hệ thống
                    </CardTitle>
                    <CardDescription>
                        Chọn giao diện mặc định cho toàn bộ máy khách và thiết bị.
                        Người dùng ở trang chủ, trang chờ, kiosk, màn hình hiển thị... sẽ thấy giao diện này.
                        Chỉ Admin mới có thể thay đổi.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Label>Chọn giao diện</Label>
                    <Select
                        value={settings['system_theme'] || 'doodle'}
                        onValueChange={(v) => setSettings({ ...settings, system_theme: v })}
                    >
                        <SelectTrigger className="mt-1 max-w-xs">
                            <SelectValue placeholder="Chọn giao diện" />
                        </SelectTrigger>
                        <SelectContent>
                            {all.map((t) => (
                                <SelectItem key={t.id} value={t.id}>
                                    <div className="flex items-center gap-2">
                                        <span
                                            className="h-3 w-3 rounded-full"
                                            style={{ backgroundColor: t.colors.primary ? hslToHex(t.colors.primary) : '#ccc' }}
                                        />
                                        <span>{t.name}</span>
                                        <span className="text-xs text-muted-foreground">
                                            {t.builtIn ? '(mặc định)' : '(tùy chỉnh)'}
                                        </span>
                                    </div>
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Button
                        className="mt-4"
                        onClick={() => handleSave('system_theme', settings['system_theme'] || 'doodle')}
                        disabled={isSaving}
                    >
                        <Check className="w-4 h-4 mr-1" /> Lưu giao diện hệ thống
                    </Button>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Phông chữ toàn cục</CardTitle>
                    <CardDescription>
                        Đè phông chữ cho toàn bộ hệ thống (áp dụng với mọi giao diện, kể cả giao diện mặc định).
                        Để trống để dùng phông chữ theo từng giao diện.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <Label>Font chữ thường (body)</Label>
                            <Select value={settings['font_sans'] || 'default'} onValueChange={(v) => setSettings({ ...settings, font_sans: v === 'default' ? '' : v })}>
                                <SelectTrigger className="mt-1"><SelectValue placeholder="Theo giao diện" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="default">Theo giao diện</SelectItem>
                                    {FONT_OPTIONS.map((f) => (
                                        <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <Label>Font chữ tiêu đề (display)</Label>
                            <Select value={settings['font_display'] || 'default'} onValueChange={(v) => setSettings({ ...settings, font_display: v === 'default' ? '' : v })}>
                                <SelectTrigger className="mt-1"><SelectValue placeholder="Theo giao diện" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="default">Theo giao diện</SelectItem>
                                    {FONT_OPTIONS.map((f) => (
                                        <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <Button className="mt-4" onClick={handleSaveFonts} disabled={isSaving}>
                        <Check className="w-4 h-4 mr-1" /> Lưu phông chữ
                    </Button>
                </CardContent>
            </Card>

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
                    <CardTitle>Lời cảm ơn khi hoàn thành</CardTitle>
                    <CardDescription>
                        Hiển thị trên màn hình khách hàng khi vé được phục vụ xong.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex gap-3">
                        <Input
                            value={settings['thank_you_text'] || 'Cảm ơn bạn đã sử dụng dịch vụ'}
                            onChange={(e) => setSettings({ ...settings, thank_you_text: e.target.value })}
                            placeholder="Cảm ơn bạn đã sử dụng dịch vụ"
                            className="max-w-md"
                        />
                        <Button
                            onClick={() => handleSave('thank_you_text', settings['thank_you_text'] || 'Cảm ơn bạn đã sử dụng dịch vụ')}
                            disabled={isSaving}
                        >
                            <Check className="w-4 h-4 mr-1" /> Lưu
                        </Button>
                    </div>
                    <p className="text-sm text-muted-foreground mt-2">
                        Mặc định: <code className="bg-muted px-1 py-0.5 rounded">Cảm ơn bạn đã sử dụng dịch vụ</code>
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
