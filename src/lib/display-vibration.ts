export const DISPLAY_VIBRATION_STORAGE_KEY = 'bamso.display.vibration.enabled';

export function loadDisplayVibrationPreference(): boolean {
    if (typeof window === 'undefined') return false;
    try {
        return window.localStorage.getItem(DISPLAY_VIBRATION_STORAGE_KEY) === 'true';
    } catch {
        return false;
    }
}

export function saveDisplayVibrationPreference(enabled: boolean): void {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.setItem(DISPLAY_VIBRATION_STORAGE_KEY, String(enabled));
    } catch {
        // Device-local preference is best-effort only.
    }
}

export function markDisplayCallEventSeen(eventId: string, seenEventIds: Set<string>): boolean {
    if (seenEventIds.has(eventId)) return false;

    seenEventIds.add(eventId);
    if (seenEventIds.size > 500) {
        const first = seenEventIds.values().next().value;
        if (first) seenEventIds.delete(first);
    }
    return true;
}

export function vibrateDisplayCall(enabled: boolean): boolean {
    if (!enabled || typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') {
        return false;
    }

    try {
        return navigator.vibrate(80);
    } catch {
        return false;
    }
}
