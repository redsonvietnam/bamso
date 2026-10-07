import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    DISPLAY_VIBRATION_STORAGE_KEY,
    loadDisplayVibrationPreference,
    markDisplayCallEventSeen,
    saveDisplayVibrationPreference,
    vibrateDisplayCall,
} from '@/lib/display-vibration';

describe('display vibration', () => {
    beforeEach(() => {
        window.localStorage.clear();
        vi.restoreAllMocks();
    });

    it('defaults to disabled and persists the device-local toggle', () => {
        expect(loadDisplayVibrationPreference()).toBe(false);

        saveDisplayVibrationPreference(true);
        expect(loadDisplayVibrationPreference()).toBe(true);
        expect(window.localStorage.getItem(DISPLAY_VIBRATION_STORAGE_KEY)).toBe('true');

        saveDisplayVibrationPreference(false);
        expect(loadDisplayVibrationPreference()).toBe(false);
    });

    it('accepts a new event once and rejects duplicate deliveries with the same identity', () => {
        const seen = new Set<string>();

        expect(markDisplayCallEventSeen('event-1', seen)).toBe(true);
        expect(markDisplayCallEventSeen('event-1', seen)).toBe(false);
        expect(seen).toEqual(new Set(['event-1']));
    });

    it('vibrates once for a duplicate event delivery', () => {
        const seen = new Set<string>();
        const vibrate = vi.fn(() => true);
        Object.defineProperty(navigator, 'vibrate', { configurable: true, value: vibrate });

        for (const delivery of ['event-2', 'event-2']) {
            if (markDisplayCallEventSeen(delivery, seen)) {
                vibrateDisplayCall(true);
            }
        }

        expect(vibrate).toHaveBeenCalledTimes(1);
    });

    it('vibrates when enabled', () => {
        const vibrate = vi.fn(() => true);
        Object.defineProperty(navigator, 'vibrate', { configurable: true, value: vibrate });

        expect(vibrateDisplayCall(true)).toBe(true);
        expect(vibrate).toHaveBeenCalledTimes(1);
        expect(vibrate).toHaveBeenCalledWith(80);
    });

    it('does not vibrate when disabled', () => {
        const vibrate = vi.fn(() => true);
        Object.defineProperty(navigator, 'vibrate', { configurable: true, value: vibrate });

        expect(vibrateDisplayCall(false)).toBe(false);
        expect(vibrate).not.toHaveBeenCalled();
    });

    it('does not crash when vibration is unsupported', () => {
        const original = Object.getOwnPropertyDescriptor(navigator, 'vibrate');
        try {
            Object.defineProperty(navigator, 'vibrate', { configurable: true, value: undefined });
            expect(() => vibrateDisplayCall(true)).not.toThrow();
            expect(vibrateDisplayCall(true)).toBe(false);
        } finally {
            Object.defineProperty(navigator, 'vibrate', {
                configurable: true,
                value: original?.value,
            });
        }
    });

    it('does not crash when the browser rejects vibration', () => {
        Object.defineProperty(navigator, 'vibrate', {
            configurable: true,
            value: () => {
                throw new Error('blocked');
            },
        });

        expect(vibrateDisplayCall(true)).toBe(false);
    });
});
