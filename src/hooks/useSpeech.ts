"use client";

import { useCallback, useRef, useState } from 'react';

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

/**
 * Hook useSpeech
 * Xử lý phát âm thanh thông báo với cơ chế tự động tách số và fallback sang Web Speech API.
 * Hỗ trợ queuing: các lời nói được gọi trước khi audio unlocked sẽ được xếp hàng và phát sau.
 */
export function useSpeech() {
    const [isAudioUnlocked, setIsAudioUnlocked] = useState(false);
    const queueRef = useRef<string[]>([]);
    const processingRef = useRef(false);

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
     * Fallback: Sử dụng Web Speech API có sẵn trong trình duyệt.
     */
    const speakWithWebSpeech = (text: string) => {
        if (typeof window !== 'undefined' && window.speechSynthesis) {
            // Hủy các câu đang đọc dở để tránh chồng lấn
            window.speechSynthesis.cancel();

            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = 'vi-VN';
            utterance.rate = 0.9; // Đọc chậm một chút để rõ ràng hơn
            window.speechSynthesis.speak(utterance);
        }
    };

    /**
     * Xử lý từng item trong queue.
     */
    const processQueue = useCallback(() => {
        if (processingRef.current || queueRef.current.length === 0) return;
        processingRef.current = true;

        const text = queueRef.current.shift()!;
        const formattedText = formatTextForSpeech(text);
        const audioUrl = `/api/tts?text=${encodeURIComponent(formattedText)}`;

        const audio = new Audio(audioUrl);
        audio.play().then(() => {
            processingRef.current = false;
            // Process next item in queue
            processQueue();
        }).catch((err) => {
            console.warn('Google TTS Proxy failed, falling back to Web Speech API:', err);
            speakWithWebSpeech(formattedText);
            processingRef.current = false;
            processQueue();
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
     */
    const speak = useCallback((text: string) => {
        if (!isAudioUnlocked) {
            // Chưa unlock → xếp hàng để phát sau
            queueRef.current.push(text);
            return;
        }
        // Đã unlock → xử lý ngay (hoặc thêm vào queue)
        queueRef.current.push(text);
        processQueue();
    }, [isAudioUnlocked, processQueue]);

    return {
        speak,
        formatTextForSpeech,
        isAudioUnlocked,
        unlockAudio,
    };
}