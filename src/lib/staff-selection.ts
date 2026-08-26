import { logger } from '@/lib/logger';

const STORAGE_PREFIX = 'bamso:staff-selection:';

interface StoredSelection {
    serviceId: string;
    pos: string;
}

function storageKey(userId: string): string {
    return `${STORAGE_PREFIX}${userId}`;
}

export function saveStaffSelection(userId: string, serviceId: string, pos: string): void {
    try {
        localStorage.setItem(storageKey(userId), JSON.stringify({ serviceId, pos }));
    } catch {
        logger.warn('Failed to save staff selection to localStorage');
    }
}

export function loadStaffSelection(userId: string): StoredSelection | null {
    try {
        const raw = localStorage.getItem(storageKey(userId));
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (
            typeof parsed !== 'object' ||
            parsed === null ||
            typeof parsed.serviceId !== 'string' ||
            typeof parsed.pos !== 'string' ||
            parsed.serviceId.length === 0 ||
            parsed.pos.length === 0
        ) {
            clearStaffSelection(userId);
            return null;
        }
        return parsed;
    } catch {
        clearStaffSelection(userId);
        return null;
    }
}

export function clearStaffSelection(userId: string): void {
    try {
        localStorage.removeItem(storageKey(userId));
    } catch {
        // Silently ignore — localStorage is UX convenience, not authorization
    }
}
