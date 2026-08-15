import { describe, expect, it } from 'vitest';
import { readJsonObject, requiredPositiveInteger, requiredStringFields } from '@/lib/api-validation';

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
            expect(await result.response.json()).toEqual({
                error: 'Request body không hợp lệ',
                code: 'INVALID_JSON',
            });
        }
    });

    it('rejects non-object JSON bodies', async () => {
        const result = await readJsonObject(new Request('http://localhost', {
            method: 'POST',
            body: JSON.stringify(['ticket']),
            headers: { 'content-type': 'application/json' },
        }));

        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.response.status).toBe(400);
        }
    });

    it('requires non-empty string fields', () => {
        expect(requiredStringFields({ serviceId: 'svc', ticketId: '  ' }, ['serviceId', 'ticketId']))
            .toEqual(['ticketId']);
    });

    it('accepts only positive integers for queue positions', () => {
        expect(requiredPositiveInteger(1)).toBe(true);
        expect(requiredPositiveInteger(2)).toBe(true);
        expect(requiredPositiveInteger(0)).toBe(false);
        expect(requiredPositiveInteger(-1)).toBe(false);
        expect(requiredPositiveInteger(1.5)).toBe(false);
        expect(requiredPositiveInteger('1')).toBe(false);
    });
});
