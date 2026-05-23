"use client";

import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Check, Play, Volume2 } from 'lucide-react';

const EDGE_VI_VOICES = [
    { id: 'vi-VN-HoaiMyNeural', name: 'Hoài My (Nữ)' },
    { id: 'vi-VN-NamMinhNeural', name: 'Nam Minh (Nam)' },
    { id: 'vi-VN-LanAnhNeural', name: 'Lan Anh (Nữ, Tự nhiên)' },
    { id: 'vi-VN-NguyenBaoNeural', name: 'Nguyên Bảo (Nam, Tự nhiên)' },
    { id: 'vi-VN-MyDuyenNeural', name: 'My Duyên (Nữ)' },
    { id: 'vi-VN-MyLinhNeural', name: 'My Linh (Nữ, Tự nhiên)' },
    { id: 'vi-VN-QuynhChiNeural', name: 'Quỳnh Chi (Nữ)' },
    { id: 'vi-VN-BichNgocNeural', name: 'Bích Ngọc (Nữ, Tự nhiên)' },
    { id: 'vi-VN-ThiLeNeural', name: 'Thi Lệ (Nữ, Tự nhiên)' },
];

const DEFAULT_TTS_SETTINGS = {
    tts_enabled: 'true',
    tts_speed: '0.9',
    tts_volume: '1',
    tts_provider: 'google',
    tts_edge_voice: 'vi-VN-HoaiMyNeural',
    tts_announcement_template: 'Mời số {ticketNumber} đến {pos} để phục vụ',
    tts_prepare_template: 'Số {ticketNumber} chuẩn bị',
};

export default function TtsPanel() {
    const [settings, setSettings] = useState<Record<string, string>>({});
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState<string | null>(null);
    const [testingProvider, setTestingProvider] = useState<string | null>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    useEffect(() => {
        const fetchSettings = async () => {
            try {
                const res = await fetch('/api/settings');
                if (res.ok) {
                    const data = await res.json();
                    const map: Record<string, string> = { ...DEFAULT_TTS_SETTINGS };
                    data.forEach((s: { key: string; value: string }) => {
                        const keys = Object.keys(DEFAULT_TTS_SETTINGS);
                        if (keys.includes(s.key)) {
                            map[s.key] = s.value;
                        }
                    });
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
        setIsSaving(key);
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
            setIsSaving(null);
        }
    };

    const updateSetting = (key: string, value: string) => {
        setSettings(prev => ({ ...prev, [key]: value }));
    };

    const handleTest = async () => {
        setTestingProvider('google');
        const template = settings['tts_announcement_template'] || DEFAULT_TTS_SETTINGS.tts_announcement_template;
        const text = template
            .replace('{ticketNumber}', 'A001')
            .replace('{pos}', 'Quầy 1');
        const formattedText = text.replace(/\d+/g, (s) =>
            s.split('').map(d => 'không một hai ba bốn năm sáu bảy tám chín'.split(' ')[parseInt(d)]).join(' ')
        );
        const provider = settings['tts_provider'] || 'google';
        let url: string;

        if (provider === 'edge') {
            const voice = settings['tts_edge_voice'] || 'vi-VN-HoaiMyNeural';
            url = `/api/tts?provider=edge&voice=${encodeURIComponent(voice)}&text=${encodeURIComponent(formattedText)}`;
        } else {
            url = `/api/tts?text=${encodeURIComponent(formattedText)}`;
        }

        try {
            const audio = new Audio(url);
            audio.volume = parseFloat(settings['tts_volume'] || '1');
            audio.play().catch(() => {
                // fallback Web Speech
                if (typeof window !== 'undefined' && window.speechSynthesis) {
                    window.speechSynthesis.cancel();
                    const utterance = new SpeechSynthesisUtterance(text);
                    utterance.lang = 'vi-VN';
                    utterance.rate = parseFloat(settings['tts_speed'] || '0.9');
                    utterance.volume = parseFloat(settings['tts_volume'] || '1');
                    window.speechSynthesis.speak(utterance);
                }
            });
        } catch {
            toast.error('Không thể phát thử.');
        } finally {
            setTestingProvider(null);
        }
    };

    const handleTestEdgeVoice = async (voiceId: string) => {
        const template = settings['tts_announcement_template'] || DEFAULT_TTS_SETTINGS.tts_announcement_template;
        const text = template
            .replace('{ticketNumber}', 'A001')
            .replace('{pos}', 'Quầy 1');
        const formattedText = text.replace(/\d+/g, (s) =>
            s.split('').map(d => 'không một hai ba bốn năm sáu bảy tám chín'.split(' ')[parseInt(d)]).join(' ')
        );
        const url = `/api/tts?provider=edge&voice=${encodeURIComponent(voiceId)}&text=${encodeURIComponent(formattedText)}`;
        try {
            const audio = new Audio(url);
            audio.volume = parseFloat(settings['tts_volume'] || '1');
            audio.play();
        } catch {
            toast.error('Không thể phát thử giọng.');
        }
    };

    const handleTestWebSpeech = () => {
        if (typeof window !== 'undefined' && window.speechSynthesis) {
            window.speechSynthesis.cancel();
            const text = 'Mời số A không không một đến Quầy một để phục vụ';
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = 'vi-VN';
            utterance.rate = parseFloat(settings['tts_speed'] || '0.9');
            utterance.volume = parseFloat(settings['tts_volume'] || '1');

            // Try to find Vietnamese voice
            const voices = window.speechSynthesis.getVoices();
            const viVoice = voices.find(v => v.lang.startsWith('vi') || v.name.toLowerCase().includes('vietnamese'));
            if (viVoice) utterance.voice = viVoice;

            window.speechSynthesis.speak(utterance);
        } else {
            toast.error('Trình duyệt không hỗ trợ Web Speech API.');
        }
    };

    if (isLoading) return <p className="text-muted-foreground">Đang tải...</p>;

    return (
        <div className="space-y-6">
            <h2 className="text-xl font-semibold">Cài đặt giọng nói (TTS)</h2>

            {/* Bật/Tắt TTS */}
            <Card>
                <CardHeader>
                    <CardTitle>Bật/Tắt thông báo giọng nói</CardTitle>
                    <CardDescription>
                        Cho phép hệ thống đọc số thứ tự và thông báo bằng giọng nói
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex items-center gap-3">
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={settings['tts_enabled'] === 'true'}
                                onChange={(e) => {
                                    const val = e.target.checked ? 'true' : 'false';
                                    updateSetting('tts_enabled', val);
                                    handleSave('tts_enabled', val);
                                }}
                                className="w-5 h-5"
                            />
                            <span className="text-sm">
                                {settings['tts_enabled'] === 'true' ? 'Đang bật' : 'Đang tắt'}
                            </span>
                        </label>
                    </div>
                </CardContent>
            </Card>

            {/* Tốc độ đọc */}
            <Card>
                <CardHeader>
                    <CardTitle>Tốc độ đọc</CardTitle>
                    <CardDescription>
                        Điều chỉnh tốc độ giọng đọc (0.5x – 2.0x)
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex items-center gap-4">
                        <span className="text-sm font-mono w-12 text-center">
                            {settings['tts_speed'] || '0.9'}x
                        </span>
                        <div className="flex-1 max-w-xs">
                            <input
                                type="range"
                                min="0.5"
                                max="2.0"
                                step="0.1"
                                value={settings['tts_speed'] || '0.9'}
                                onChange={(e) => updateSetting('tts_speed', e.target.value)}
                                className="w-full"
                            />
                        </div>
                        <Button
                            size="sm"
                            onClick={() => handleSave('tts_speed', settings['tts_speed'] || '0.9')}
                            disabled={isSaving === 'tts_speed'}
                        >
                            <Check className="w-4 h-4 mr-1" /> Lưu
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* Âm lượng */}
            <Card>
                <CardHeader>
                    <CardTitle>Âm lượng</CardTitle>
                    <CardDescription>
                        Điều chỉnh âm lượng phát thông báo
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex items-center gap-4">
                        <Volume2 className="w-4 h-4 text-muted-foreground" />
                        <div className="flex-1 max-w-xs">
                            <input
                                type="range"
                                min="0"
                                max="1"
                                step="0.1"
                                value={settings['tts_volume'] || '1'}
                                onChange={(e) => updateSetting('tts_volume', e.target.value)}
                                className="w-full"
                            />
                        </div>
                        <span className="text-sm font-mono w-8 text-center">
                            {Math.round(parseFloat(settings['tts_volume'] || '1') * 100)}%
                        </span>
                        <Button
                            size="sm"
                            onClick={() => handleSave('tts_volume', settings['tts_volume'] || '1')}
                            disabled={isSaving === 'tts_volume'}
                        >
                            <Check className="w-4 h-4 mr-1" /> Lưu
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* Provider */}
            <Card>
                <CardHeader>
                    <CardTitle>Công cụ đọc giọng nói</CardTitle>
                    <CardDescription>
                        Chọn engine TTS.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex items-center gap-6 mb-4">
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="radio"
                                name="tts_provider"
                                value="google"
                                checked={(settings['tts_provider'] || 'google') === 'google'}
                                onChange={() => {
                                    updateSetting('tts_provider', 'google');
                                    handleSave('tts_provider', 'google');
                                }}
                            />
                            <span className="text-sm font-medium">Google TTS</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="radio"
                                name="tts_provider"
                                value="edge"
                                checked={(settings['tts_provider'] || 'google') === 'edge'}
                                onChange={() => {
                                    updateSetting('tts_provider', 'edge');
                                    handleSave('tts_provider', 'edge');
                                }}
                            />
                            <span className="text-sm font-medium">Microsoft Edge TTS</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="radio"
                                name="tts_provider"
                                value="webspeech"
                                checked={(settings['tts_provider'] || 'google') === 'webspeech'}
                                onChange={() => {
                                    updateSetting('tts_provider', 'webspeech');
                                    handleSave('tts_provider', 'webspeech');
                                }}
                            />
                            <span className="text-sm font-medium">Web Speech API</span>
                        </label>
                    </div>

                    {/* Edge TTS Voice Selector (chỉ hiện khi chọn Edge) */}
                    {(settings['tts_provider'] || 'google') === 'edge' && (
                        <div className="mt-4 space-y-3">
                            <Label className="text-sm font-medium">Chọn giọng đọc Edge TTS:</Label>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                                {EDGE_VI_VOICES.map((v) => (
                                    <div
                                        key={v.id}
                                        className={`flex items-center justify-between gap-2 p-2 rounded-lg border cursor-pointer transition-colors ${(settings['tts_edge_voice'] || 'vi-VN-HoaiMyNeural') === v.id
                                                ? 'border-primary bg-primary/5'
                                                : 'border-border hover:border-primary/30'
                                            }`}
                                        onClick={() => {
                                            updateSetting('tts_edge_voice', v.id);
                                            handleSave('tts_edge_voice', v.id);
                                        }}
                                    >
                                        <span className="text-sm">{v.name}</span>
                                        <button
                                            className="p-1 hover:bg-muted rounded"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleTestEdgeVoice(v.id);
                                            }}
                                            title={`Phát thử ${v.name}`}
                                        >
                                            <Play className="w-3.5 h-3.5 text-muted-foreground" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
                                💡 Microsoft Edge TTS cần server kết nối Internet để gọi API. Chất lượng giọng rất tự nhiên.
                            </p>
                        </div>
                    )}

                    <div className="flex gap-2 mt-4">
                        <Button variant="outline" size="sm" onClick={handleTest}>
                            <Play className="w-4 h-4 mr-1" /> Phát thử
                        </Button>
                        <Button variant="outline" size="sm" onClick={handleTestWebSpeech}>
                            <Play className="w-4 h-4 mr-1" /> Phát thử Web Speech
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* Template thông báo */}
            <Card>
                <CardHeader>
                    <CardTitle>Mẫu thông báo</CardTitle>
                    <CardDescription>
                        Tùy chỉnh nội dung thông báo.
                        Dùng {'{ticketNumber}'} cho số vé, {'{pos}'} cho tên quầy.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div>
                        <Label className="text-sm">Khi gọi số mới</Label>
                        <div className="flex gap-3 mt-1">
                            <Input
                                value={settings['tts_announcement_template'] || DEFAULT_TTS_SETTINGS.tts_announcement_template}
                                onChange={(e) => updateSetting('tts_announcement_template', e.target.value)}
                                className="max-w-md font-mono text-sm"
                            />
                            <Button
                                size="sm"
                                onClick={() => handleSave('tts_announcement_template', settings['tts_announcement_template'] || '')}
                                disabled={isSaving === 'tts_announcement_template'}
                            >
                                <Check className="w-4 h-4 mr-1" /> Lưu
                            </Button>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                            Mặc định: <code className="bg-muted px-1 rounded">{DEFAULT_TTS_SETTINGS.tts_announcement_template}</code>
                        </p>
                    </div>
                    <div>
                        <Label className="text-sm">Khi chuẩn bị đến lượt</Label>
                        <div className="flex gap-3 mt-1">
                            <Input
                                value={settings['tts_prepare_template'] || DEFAULT_TTS_SETTINGS.tts_prepare_template}
                                onChange={(e) => updateSetting('tts_prepare_template', e.target.value)}
                                className="max-w-md font-mono text-sm"
                            />
                            <Button
                                size="sm"
                                onClick={() => handleSave('tts_prepare_template', settings['tts_prepare_template'] || '')}
                                disabled={isSaving === 'tts_prepare_template'}
                            >
                                <Check className="w-4 h-4 mr-1" /> Lưu
                            </Button>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                            Mặc định: <code className="bg-muted px-1 rounded">{DEFAULT_TTS_SETTINGS.tts_prepare_template}</code>
                        </p>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Ảnh hưởng</CardTitle>
                    <CardDescription>
                        Các thay đổi sẽ áp dụng cho toàn bộ hệ thống:
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <ul className="text-sm text-muted-foreground space-y-1 list-disc pl-5">
                        <li>Bảng hiển thị (Display Board) — đọc số gọi</li>
                        <li>Nhân viên (Staff Panel) — đọc số khi gọi</li>
                        <li>Theo dõi khách hàng (Waiting Tracker) — nhắc sắp đến lượt</li>
                    </ul>
                </CardContent>
            </Card>
        </div>
    );
}