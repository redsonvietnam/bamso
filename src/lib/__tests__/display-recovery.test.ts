import { describe, expect, it } from 'vitest';
import {
    applyDisplayCallEvent,
    shouldAnnounceDisplayEvent,
    type DisplayCallState,
} from '@/lib/display-recovery';

const emptyState = (): DisplayCallState => ({
    currentCalls: {},
    lastCalledTicket: null,
    counters: [],
});

describe('display recovery replay contract', () => {
    it('historical replay updates display state without changing durable event identity', () => {
        const state = applyDisplayCallEvent(emptyState(), {
            ticketNumber: 'A001',
            pos: 'Quầy 2',
            customerName: 'Nguyễn Văn A',
        }, 100);

        expect(state.currentCalls['Quầy 2']).toEqual({
            ticketNumber: 'A001',
            pos: 'Quầy 2',
            customerName: 'Nguyễn Văn A',
            timestamp: 100,
        });
        expect(state.lastCalledTicket?.ticketNumber).toBe('A001');
    });

    it('historical replay is silent while live events announce', () => {
        expect(shouldAnnounceDisplayEvent(true)).toBe(false);
        expect(shouldAnnounceDisplayEvent(false)).toBe(true);
        expect(shouldAnnounceDisplayEvent(undefined)).toBe(true);
    });

    it('preserves deterministic display ordering for recovered calls', () => {
        let state = emptyState();
        state = applyDisplayCallEvent(state, {
            ticketNumber: 'B002',
            pos: 'Quầy 2',
            customerName: null,
        }, 200);
        state = applyDisplayCallEvent(state, {
            ticketNumber: 'A001',
            pos: 'Quầy 1',
            customerName: null,
        }, 100);

        expect(state.counters).toEqual(['Quầy 1', 'Quầy 2']);
        expect(state.currentCalls['Quầy 1']?.ticketNumber).toBe('A001');
        expect(state.currentCalls['Quầy 2']?.ticketNumber).toBe('B002');
    });
});
