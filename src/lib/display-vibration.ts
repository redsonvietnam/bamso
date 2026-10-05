export function markDisplayCallEventSeen(eventId: string, seenEventIds: Set<string>): boolean {
    if (seenEventIds.has(eventId)) return false;

    seenEventIds.add(eventId);
    if (seenEventIds.size > 500) {
        const first = seenEventIds.values().next().value;
        if (first) seenEventIds.delete(first);
    }
    return true;
}
