"use client";

import { useCallback, useRef, useState, useEffect } from 'react';
import { logger } from '@/lib/logger';
import { apiClient } from '@/lib/api-client';

const DIGIT_MAP: Record<string, string> = {
    '0': 'không',
    '1': 'một',
    '2': 'hai',
    '3': 'ba',
    '4': 'bốn',
    '5': 'năm',
    '6': 'sáu',
    '7': 'bảy',
    '8': 'tám',
    '9': 'chín',
};

export interface TtsSettings {
    tts_enabled: string;
    tts_speed: string;
    tts_volume: string;
    tts_provider: string;
    tts_edge_voice: string;
    tts_announcement_template: string;
    tts_prepare_template: string;
}

const DEFAULT_TTS_SETTINGS: TtsSettings = {
    tts_enabled: 'true',
    tts_speed: '0.9',
    tts_volume: '1',
    tts_provider: 'google',
    tts_edge_voice: 'vi-VN-HoaiMyNeural',
    tts_announcement_template: 'Mời số {ticketNumber} đến {pos} để phục vụ',
    tts_prepare_template: 'Số {ticketNumber} chuẩn bị',
};

let cachedSettings: TtsSettings | null = null;
let settingsFetchPromise: Promise<TtsSettings> | null = null;

const TTS_SETTING_KEYS = [
    'tts_enabled',
    'tts_speed',
    'tts_volume',
    'tts_provider',
    'tts_edge_voice',
    'tts_announcement_template',
    'tts_prepare_template',
] as const;

async function fetchTtsSettings(): Promise<TtsSettings> {
    if (cachedSettings) return cachedSettings;
    if (settingsFetchPromise) return settingsFetchPromise;

    settingsFetchPromise = (async () => {
        try {
            const settings: TtsSettings = { ...DEFAULT_TTS_SETTINGS };
            const results = await Promise.all(
                TTS_SETTING_KEYS.map(async (key) => {
                    try {
                        const data = await apiClient.get<{ key: string; value: string }>(
                            `/api/settings?key=${key}`
                        );
                        return { key, value: data.value };
                    } catch {
                        return { key, value: undefined };
                    }
                })
            );
            results.forEach(({ key, value }) => {
                if (value !== undefined) {
                    (settings as unknown as Record<string, string>)[key] = value;
                }
            });
            cachedSettings = settings;
            return settings;
        } catch {
            // Fallback to defaults
        }
        return DEFAULT_TTS_SETTINGS;
    })();

    return settingsFetchPromise;
}

/**
 * Tìm giọng tiếng Việt có sẵn trong Web Speech API
 * Hiện tại hầu hết browser Windows: Edge có "Microsoft HoaiMy Online (Natural)" (~vi-VN),
 * Chrome chỉ có giọng Anh -> fallback mặc định.
 */
function getVietnameseVoice(): SpeechSynthesisVoice | null {
    if (typeof window === 'undefined' || !window.speechSynthesis) return null;
    const voices = window.speechSynthesis.getVoices();
    // Ưu tiên giọng có locale vi-VN
    const viVoice = voices.find(v =>
        v.lang.startsWith('vi') || v.lang === 'vi-VN'
    );
    if (viVoice) return viVoice;
    // Fallback: tìm bất kỳ giọng nào có tên chứa "Vietnamese"
    const namedVi = voices.find(v =>
        v.name.toLowerCase().includes('vietnamese') ||
        v.name.toLowerCase().includes('hoai') ||
        v.name.toLowerCase().includes('an')
    );
    return namedVi || null;
}

/**
 * Hook useSpeech
 * Xử lý phát âm thanh thông báo với cơ chế tự động tách số và fallback sang Web Speech API.
 * Hỗ trợ queuing: các lời nói được gọi trước khi audio unlocked sẽ được xếp hàng và phát sau.
 * Đọc cài đặt TTS (tốc độ, âm lượng, provider, voice, template) từ DB qua API /api/settings.
 */
export function useSpeech() {
    const [isAudioUnlocked, setIsAudioUnlocked] = useState(false);
    const [settings, setSettings] = useState<TtsSettings>(DEFAULT_TTS_SETTINGS);
    const queueRef = useRef<string[]>([]);
    const processingRef = useRef(false);
    const settingsRef = useRef<TtsSettings>(DEFAULT_TTS_SETTINGS);

    // Fetch settings on mount
    useEffect(() => {
        fetchTtsSettings().then((s) => {
            setSettings(s);
            settingsRef.current = s;
        });
    }, []);

    /**
     * Định dạng văn bản: Chỉ xử lý các CHỮ SỐ (0-9), giữ nguyên chữ cái và dấu câu.
     * - "A001" → "A không không một" (số được tách từng chữ số)
     * - "Mời số A001 đến Quầy 1" → "Mời số A không không một đến Quầy một" (chữ vẫn liên tục)
     */
    const formatTextForSpeech = (text: string) => {
        return text.replace(/\d+/g, (digitBlock) => {
            return digitBlock
                .split('')
                .map((digit) => DIGIT_MAP[digit])
                .join(' ');
        });
    };

    /**
     * Áp dụng template để tạo câu thông báo.
     */
    const applyTemplate = useCallback((template: string, ticketNumber: string, pos: string) => {
        return template
            .replace('{ticketNumber}', ticketNumber)
            .replace('{pos}', pos);
    }, []);

    /**
     * Fallback: Sử dụng Web Speech API có sẵn trong trình duyệt.
     * Đã cải thiện: tự động chọn giọng tiếng Việt nếu có.
     */
    const speakWithWebSpeech = (text: string, onComplete?: () => void) => {
        if (typeof window !== 'undefined' && window.speechSynthesis) {
            // Hủy các câu đang đọc dở để tránh chồng lấn
            window.speechSynthesis.cancel();

            const rate = parseFloat(settingsRef.current.tts_speed || '0.9');
            const volume = parseFloat(settingsRef.current.tts_volume || '1');

            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = 'vi-VN';
            utterance.rate = rate;
            utterance.volume = volume;

            // Tự động chọn giọng tiếng Việt có sẵn (nếu có)
            const viVoice = getVietnameseVoice();
            if (viVoice) {
                utterance.voice = viVoice;
            }

            utterance.onend = onComplete || (() => { });
            window.speechSynthesis.speak(utterance);
        } else {
            onComplete?.();
        }
    };

    /**
     * Xử lý từng item trong queue.
     * Dùng onended để đảm bảo mỗi câu nói kết thúc hoàn toàn 
     * trước khi chuyển sang câu tiếp theo, tránh chồng lấn âm thanh.
     */
    const processQueue = useCallback(function processQueueFn() {
        if (processingRef.current || queueRef.current.length === 0) return;
        processingRef.current = true;

        const text = queueRef.current.shift()!;
        const formattedText = formatTextForSpeech(text);

        const onComplete = () => {
            processingRef.current = false;
            processQueueFn();
        };

        const provider = settingsRef.current.tts_provider || 'google';
        const volume = parseFloat(settingsRef.current.tts_volume || '1');

        if (provider === 'webspeech') {
            speakWithWebSpeech(formattedText, onComplete);
            return;
        }

        if (provider === 'edge') {
            const edgeVoice = settingsRef.current.tts_edge_voice || 'vi-VN-HoaiMyNeural';
            const url = `/api/tts?provider=edge&voice=${encodeURIComponent(edgeVoice)}&text=${encodeURIComponent(formattedText)}`;
            const audio = new Audio(url);
            audio.volume = volume;
            audio.onended = onComplete;
            audio.onerror = () => {
                logger.warn('Edge TTS failed, falling back to Web Speech API');
                speakWithWebSpeech(formattedText, onComplete);
            };
            audio.play().catch((err) => {
                logger.warn('Edge TTS play failed, falling back to Web Speech API:', err);
                speakWithWebSpeech(formattedText, onComplete);
            });
            return;
        }

        const audioUrl = `/api/tts?text=${encodeURIComponent(formattedText)}`;

        const audio = new Audio(audioUrl);
        audio.volume = volume;
        audio.onended = onComplete;
        audio.onerror = () => {
            logger.warn('Google TTS Proxy failed, falling back to Web Speech API');
            speakWithWebSpeech(formattedText, onComplete);
        };

        audio.play().catch((err) => {
            logger.warn('Google TTS play failed, falling back to Web Speech API:', err);
            speakWithWebSpeech(formattedText, onComplete);
        });
    }, []);

    /**
     * "Đánh thức" audio system sau user interaction.
     * Gọi hàm này từ onClick/onTouch handler.
     */
    const unlockAudio = useCallback(() => {
        if (typeof window === 'undefined') return;
        if (typeof AudioContext !== 'undefined') {
            try {
                const ctx = new AudioContext();
                ctx.resume();
                ctx.close();
            } catch {
                // AudioContext not available, continue anyway
            }
        }
        setIsAudioUnlocked(true);
        // Bắt đầu xử lý queue ngay sau khi unlock
        processQueue();
    }, [processQueue]);

    /**
     * Phát âm thanh thông báo. Tự động xếp hàng nếu chưa unlock audio.
     * Nếu TTS bị tắt (tts_enabled = false) thì không phát gì cả.
     */
    const speak = useCallback((text: string) => {
        if (settingsRef.current.tts_enabled !== 'true') {
            return;
        }

        queueRef.current.push(text);
        processQueue();
    }, [processQueue]);

    /**
     * Phát thông báo sử dụng template từ settings.
     */
    const speakAnnouncement = useCallback((ticketNumber: string, pos: string) => {
        const template = settingsRef.current.tts_announcement_template || DEFAULT_TTS_SETTINGS.tts_announcement_template;
        const text = applyTemplate(template, ticketNumber, pos);
        speak(text);
    }, [speak, applyTemplate]);

    /**
     * Phát thông báo chuẩn bị đến lượt.
     */
    const speakPrepare = useCallback((ticketNumber: string) => {
        const template = settingsRef.current.tts_prepare_template || DEFAULT_TTS_SETTINGS.tts_prepare_template;
        const text = template.replace('{ticketNumber}', ticketNumber).replace('{pos}', '');
        speak(text);
    }, [speak]);

    return {
        speak,
        speakAnnouncement,
        speakPrepare,
        formatTextForSpeech,
        isAudioUnlocked,
        unlockAudio,
        settings,
    };
}