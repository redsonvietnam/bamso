import { beforeEach, describe, expect, it } from 'vitest';
import { saveStaffSelection, loadStaffSelection, clearStaffSelection } from '@/lib/staff-selection';

const STORAGE_KEY_PREFIX = 'bamso:staff-selection:';

function setStoredValue(key: string, value: string) {
   Storage.prototype.setItem.call(localStorage, key, value);
}

beforeEach(() => {
    localStorage.clear();
});

describe('staff-selection persistence', () => {
    const userId = 'user-123';
    const serviceId = 'service-abc';
    const pos = 'Quầy 5';

    it('saves and loads valid selection', () => {
        saveStaffSelection(userId, serviceId, pos);
        const result = loadStaffSelection(userId);
        expect(result).toEqual({ serviceId, pos });
    });

    it('returns null when no selection exists', () => {
        const result = loadStaffSelection(userId);
        expect(result).toBeNull();
    });

    it('returns null and clears for different userId', () => {
        saveStaffSelection(userId, serviceId, pos);
        const result = loadStaffSelection('other-user');
        expect(result).toBeNull();
    });

    it('clears selection correctly', () => {
        saveStaffSelection(userId, serviceId, pos);
        clearStaffSelection(userId);
        const result = loadStaffSelection(userId);
        expect(result).toBeNull();
    });

    it('handles corrupted localStorage JSON', () => {
        setStoredValue(`${STORAGE_KEY_PREFIX}${userId}`, 'NOT-JSON');
        const result = loadStaffSelection(userId);
        expect(result).toBeNull();
        // Corrupted value should be cleared
        expect(localStorage.getItem(`${STORAGE_KEY_PREFIX}${userId}`)).toBeNull();
    });

    it('handles invalid shape (missing serviceId)', () => {
        setStoredValue(`${STORAGE_KEY_PREFIX}${userId}`, JSON.stringify({ pos: 'Quầy 1' }));
        const result = loadStaffSelection(userId);
        expect(result).toBeNull();
    });

    it('handles invalid shape (missing pos)', () => {
        setStoredValue(`${STORAGE_KEY_PREFIX}${userId}`, JSON.stringify({ serviceId: 'abc' }));
        const result = loadStaffSelection(userId);
        expect(result).toBeNull();
    });

    it('handles invalid shape (empty strings)', () => {
        setStoredValue(`${STORAGE_KEY_PREFIX}${userId}`, JSON.stringify({ serviceId: '', pos: '' }));
        const result = loadStaffSelection(userId);
        expect(result).toBeNull();
    });

    it('does not leak between different staff IDs', () => {
        saveStaffSelection('staff-a', 'svc-1', 'Counter A');
        saveStaffSelection('staff-b', 'svc-2', 'Counter B');

        const a = loadStaffSelection('staff-a');
        const b = loadStaffSelection('staff-b');

        expect(a).toEqual({ serviceId: 'svc-1', pos: 'Counter A' });
        expect(b).toEqual({ serviceId: 'svc-2', pos: 'Counter B' });
    });

    it('overwrites previous selection for same user', () => {
        saveStaffSelection(userId, 'svc-1', 'Counter 1');
        saveStaffSelection(userId, 'svc-2', 'Counter 2');
        const result = loadStaffSelection(userId);
        expect(result).toEqual({ serviceId: 'svc-2', pos: 'Counter 2' });
    });
});
