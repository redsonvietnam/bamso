/**
 * Canonical business-day semantics for BAMSO.
 *
 * Business timezone is Asia/Ho_Chi_Minh. All business-day logic (ticket
 * dayKey, daily numbering windows, "today" queries, stats ranges, cleanup
 * cutoffs) must derive from these helpers instead of the server local
 * timezone, so behavior is identical regardless of where Node runs.
 *
 * Stored timestamps stay plain timestamps; only the business-day
 * interpretation is pinned to Vietnam time.
 */
export const BUSINESS_TIMEZONE = 'Asia/Ho_Chi_Minh';

// Asia/Ho_Chi_Minh observes a fixed UTC+07:00 with no daylight saving,
// so Vietnam-midnight boundaries are exact UTC instants.
const VIETNAM_OFFSET_MS = 7 * 60 * 60 * 1000;

const dayKeyFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
});

const wallPartsFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: BUSINESS_TIMEZONE,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
});

function businessWallYMD(date: Date): { year: number; month: number; day: number } {
    const parts = wallPartsFormatter.formatToParts(date);
    const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
    return { year: get('year'), month: get('month'), day: get('day') };
}

/** Vietnam calendar date (YYYY-MM-DD) of an instant. */
export function getBusinessDayKey(date: Date = new Date()): string {
    return dayKeyFormatter.format(date);
}

/** Absolute [start, end] instants of an explicit Vietnam calendar date. */
export function getBusinessDayBoundsForYMD(
    year: number,
    month: number,
    day: number
): { startOfDay: Date; endOfDay: Date } {
    const startOfDay = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0) - VIETNAM_OFFSET_MS);
    const endOfDay = new Date(Date.UTC(year, month - 1, day + 1, 0, 0, 0, 0) - VIETNAM_OFFSET_MS - 1);
    return { startOfDay, endOfDay };
}

/** Absolute [start, end] instants of the Vietnam day containing an instant. */
export function getBusinessDayBounds(date: Date = new Date()): { startOfDay: Date; endOfDay: Date } {
    const { year, month, day } = businessWallYMD(date);
    return getBusinessDayBoundsForYMD(year, month, day);
}
