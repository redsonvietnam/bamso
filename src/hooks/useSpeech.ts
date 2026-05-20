"use client";

import { useCallback } from 'react';

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
 */
export function useSpeech() {
    /**
     * Định dạng văn bản: Chuyển "A001" thành "A không không một" để AI đọc từng số.
     */
    const formatTextForSpeech = (text: string) => {
        return text
            .split('')
            .map((char) => DIGIT_MAP[char] || char)
            .join(' ');
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

    const speak = useCallback((text: string) => {
        const formattedText = formatTextForSpeech(text);
        const audioUrl = `/api/tts?text=${encodeURIComponent(formattedText)}`;

        const audio = new Audio(audioUrl);

        audio.play().catch((err) => {
            console.warn('Google TTS Proxy failed, falling back to Web Speech API:', err);
            speakWithWebSpeech(formattedText);
        });
    }, []);

    return {
        speak,
        formatTextForSpeech
    };
}