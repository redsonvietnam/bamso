import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    BUSINESS_TIMEZONE,
    getBusinessDayBounds,
    getBusinessDayBoundsForYMD,
    getBusinessDayKey,
    getBusinessHour,
} from '@/lib/business-day';

const VN_135959 = new Date('2026-09-13T16:59:00.000Z'); // 23:59 Vietnam, Sep 13
const VN_140000 = new Date('2026-09-13T17:00:00.000Z'); // 00:00 Vietnam, Sep 14
const VN_140005 = new Date('2026-09-13T17:05:00.000Z'); // 00:05 Vietnam, Sep 14

describe('canonical business timezone', () => {
    it('pins Asia/Ho_Chi_Minh', () => {
        expect(BUSINESS_TIMEZONE).toBe('Asia/Ho_Chi_Minh');
    });

    it.each([
        ['23:59 Vietnam Sep 13', VN_135959, '2026-09-13'],
        ['00:00 Vietnam Sep 14', VN_140000, '2026-09-14'],
        ['00:05 Vietnam Sep 14', VN_140005, '2026-09-14'],
    ])('dayKey transitions exactly at Vietnam midnight (%s)', (_label, instant, expected) => {
        expect(getBusinessDayKey(instant)).toBe(expected);
    });

    it('bounds Sep 14 Vietnam to exact UTC instants', () => {
        const { startOfDay, endOfDay } = getBusinessDayBounds(VN_140005);
        expect(startOfDay.toISOString()).toBe('2026-09-13T17:00:00.000Z');
        expect(endOfDay.toISOString()).toBe('2026-09-14T16:59:59.999Z');
    });

    it('bounds Sep 13 Vietnam to exact UTC instants', () => {
        const { startOfDay, endOfDay } = getBusinessDayBounds(VN_135959);
        expect(startOfDay.toISOString()).toBe('2026-09-12T17:00:00.000Z');
        expect(endOfDay.toISOString()).toBe('2026-09-13T16:59:59.999Z');
    });

    it('bounds an explicit Vietnam calendar date identically', () => {
        const { startOfDay, endOfDay } = getBusinessDayBoundsForYMD(2026, 9, 14);
        expect(startOfDay.toISOString()).toBe('2026-09-13T17:00:00.000Z');
        expect(endOfDay.toISOString()).toBe('2026-09-14T16:59:59.999Z');
    });
});

describe('Vietnam wall-clock hour extraction (stats hourly buckets)', () => {
    it.each([
        ['VN midnight Sep 14', '2026-09-13T17:00:00.000Z', 0],
        ['23:59 Vietnam Sep 13', '2026-09-13T16:59:00.000Z', 23],
        ['09:00 Vietnam Sep 13', '2026-09-13T02:00:00.000Z', 9],
        ['17:00 Vietnam Sep 13', '2026-09-13T10:00:00.000Z', 17],
        ['07:30 Vietnam Sep 14', '2026-09-14T00:30:00.000Z', 7],
        ['12:00 Vietnam Sep 14', '2026-09-14T05:00:00.000Z', 12],
    ])('%s extracts hour %i', (_label, iso, expected) => {
        expect(getBusinessHour(new Date(iso))).toBe(expected);
    });
});

describe('business-day helpers follow the current instant', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it.each([
        ['23:59 Vietnam Sep 13', VN_135959, '2026-09-13'],
        ['00:00 Vietnam Sep 14', VN_140000, '2026-09-14'],
        ['00:05 Vietnam Sep 14', VN_140005, '2026-09-14'],
    ])('default dayKey tracks Vietnam midnight (%s)', (_label, instant, expected) => {
        vi.setSystemTime(instant);
        expect(getBusinessDayKey()).toBe(expected);
    });
});
