"use client";

import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Hook useAudioUnlock
 * Quản lý trạng thái "unlock" audio system của trình duyệt.
 * Browser chặn Audio.play() và SpeechSynthesis.speak() cho đến khi user
 * thực hiện tương tác đầu tiên (click/touch/keypress).
 * 
 * Hook này cung cấp:
 * - isAudioUnlocked: boolean — cho biết audio đã được unlock chưa
 * - unlockAudio: function — được gọi từ user interaction handler
 * - AudioUnlockOverlay: component — overlay yêu cầu user click để kích hoạt
 */
export function useAudioUnlock() {
    const [isAudioUnlocked, setIsAudioUnlocked] = useState(false);
    const audioContextRef = useRef<AudioContext | null>(null);

    const unlockAudio = useCallback(() => {
        if (isAudioUnlocked) return;

        // Tạo và resume AudioContext để "đánh thức" audio system
        try {
            if (!audioContextRef.current) {
                audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
            }
            if (audioContextRef.current.state === 'suspended') {
                audioContextRef.current.resume();
            }
        } catch (e) {
            console.warn('Could not create AudioContext:', e);
        }

        setIsAudioUnlocked(true);
    }, [isAudioUnlocked]);

    // Cleanup AudioContext khi unmount
    useEffect(() => {
        return () => {
            if (audioContextRef.current) {
                audioContextRef.current.close().catch(() => {});
            }
        };
    }, []);

    return { isAudioUnlocked, unlockAudio };
}