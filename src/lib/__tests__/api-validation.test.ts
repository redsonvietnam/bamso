import { describe, expect, it } from 'vitest';
import { readJsonObject, requiredPositiveInteger, requiredStringFields } from '@/lib/api-validation';

async function parseBody(body: unknown) {
    return readJsonObject(new Request('http://localhost', {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'content-type': 'application/json' },
    }));
}

describe('api validation helpers', () => {
    it('rejects malformed JSON with a stable 400 response', async () => {
        const result = await readJsonObject(new Request('http://localhost', {
            method: 'POST',
            body: '{invalid',
            headers: { 'content-type': 'application/json' },
        }));

        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.response.status).toBe(400);
            await expect(result.response.json()).resolves.toEqual({
                error: 'Request body không hợp lệ',
                code: 'INVALID_JSON',
            });
        }
    });

    it.each([
        ['null', null],
        ['array', ['ticket']],
        ['string', 'ticket'],
        ['number', 123],
        ['boolean', true],
    ])('rejects non-object JSON body: %s', async (_label, body) => {
        const result = await parseBody(body);

        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.response.status).toBe(400);
            await expect(result.response.json()).resolves.toEqual({
                error: 'Request body phải là JSON object',
                code: 'INVALID_BODY',
            });
        }
    });

    it('accepts a JSON object body', async () => {
        const result = await parseBody({ serviceId: 'svc-1' });
        expect(result).toEqual({ ok: true, value: { serviceId: 'svc-1' } });
    });

    it.each([
        ['missing', {}],
        ['null', { ticketId: null }],
        ['number', { ticketId: 123 }],
        ['boolean', { ticketId: true }],
        ['object', { ticketId: { id: 'ticket-1' } }],
        ['array', { ticketId: ['ticket-1'] }],
        ['empty string', { ticketId: '' }],
        ['whitespace', { ticketId: '   ' }],
    ])('rejects invalid required string: %s', (_label, body) => {
        expect(requiredStringFields(body, ['ticketId'])).toEqual(['ticketId']);
    });

    it('accepts a valid required string', () => {
        expect(requiredStringFields({ ticketId: 'ticket-1' }, ['ticketId'])).toEqual([]);
    });

    it.each([
        [1, true],
        [2, true],
        [0, false],
        [-1, false],
        [1.5, false],
        ['1', false],
        [null, false],
        [true, false],
        [Infinity, false],
        [NaN, false],
    ])('validates positive integer queue position: %p', (value, expected) => {
        expect(requiredPositiveInteger(value)).toBe(expected);
    });
});
