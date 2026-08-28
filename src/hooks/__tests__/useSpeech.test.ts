/**
 * WS-47: Verify fetchTtsSettings fetches each TTS key individually via
 * GET /api/settings?key=<key> (public endpoint, no auth required).
 *
 * Before the fix, useSpeech fetched /api/settings (no key), which required
 * ADMIN authentication and broke TTS for unauthenticated clients.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGet = vi.fn();

vi.mock('@/lib/api-client', () => ({
    apiClient: { get: mockGet },
}));

vi.mock('@/lib/logger', () => ({
    logger: { warn: vi.fn(), error: vi.fn(), log: vi.fn(), debug: vi.fn() },
}));

// Reset module registry before each test so the module-level cache is cleared.
beforeEach(() => {
    vi.resetModules();
    mockGet.mockReset();
});

const TTS_KEYS = [
    'tts_enabled',
    'tts_speed',
    'tts_volume',
    'tts_provider',
    'tts_edge_voice',
    'tts_announcement_template',
    'tts_prepare_template',
] as const;

async function freshImport() {
    // Re-import after resetModules to get a fresh module with empty cache.
    return import('@/hooks/useSpeech');
}

describe('WS-47: fetchTtsSettings — per-key public fetch', () => {
    it('fetches each of the 7 TTS keys individually (not bulk /api/settings)', async () => {
        mockGet.mockImplementation(async (url: string) => {
            const key = new URL(url, 'http://localhost').searchParams.get('key');
            return { key, value: 'test-value' };
        });

        const { fetchTtsSettingsForTest } = await freshImport();
        const result = await fetchTtsSettingsForTest();

        // Must have made exactly 7 calls, one per key.
        expect(mockGet).toHaveBeenCalledTimes(TTS_KEYS.length);

        // Each call must target /api/settings?key=<specific-key>.
        const calledKeys = mockGet.mock.calls.map((call: unknown[]) => {
            const url = call[0] as string;
            return new URL(url, 'http://localhost').searchParams.get('key');
        });

        for (const key of TTS_KEYS) {
            expect(calledKeys).toContain(key);
        }

        // No bulk fetch (i.e. no call to /api/settings without a ?key= param).
        const bulkCalls = mockGet.mock.calls.filter(
            (call: unknown[]) => !(call[0] as string).includes('?key=')
        );
        expect(bulkCalls).toHaveLength(0);

        // Result should contain all TTS keys.
        for (const key of TTS_KEYS) {
            expect(result).toHaveProperty(key);
        }
    });

    it('applies fetched values over defaults', async () => {
        mockGet.mockImplementation(async (url: string) => {
            const key = new URL(url, 'http://localhost').searchParams.get('key');
            if (key === 'tts_enabled') return { key, value: 'false' };
            if (key === 'tts_speed') return { key, value: '1.5' };
            if (key === 'tts_provider') return { key, value: 'edge' };
            return { key, value: undefined }; // simulate missing
        });

        const { fetchTtsSettingsForTest } = await freshImport();
        const result = await fetchTtsSettingsForTest();

        expect(result.tts_enabled).toBe('false');
        expect(result.tts_speed).toBe('1.5');
        expect(result.tts_provider).toBe('edge');
    });

    it('falls back to DEFAULT_TTS_SETTINGS when all key fetches fail', async () => {
        mockGet.mockRejectedValue(new Error('Network error'));

        const { fetchTtsSettingsForTest, DEFAULT_TTS_SETTINGS } = await freshImport();
        const result = await fetchTtsSettingsForTest();

        // Should not throw, should return defaults.
        expect(result).toEqual(DEFAULT_TTS_SETTINGS);
    });

    it('falls back to defaults for individual failing keys', async () => {
        const { fetchTtsSettingsForTest, DEFAULT_TTS_SETTINGS } = await freshImport();

        // Only tts_speed succeeds; all others fail.
        mockGet.mockImplementation(async (url: string) => {
            const key = new URL(url, 'http://localhost').searchParams.get('key');
            if (key === 'tts_speed') return { key, value: '2.0' };
            throw new Error('fetch failed');
        });

        const result = await fetchTtsSettingsForTest();

        expect(result.tts_speed).toBe('2.0');
        // Other keys should remain at defaults.
        expect(result.tts_enabled).toBe(DEFAULT_TTS_SETTINGS.tts_enabled);
        expect(result.tts_provider).toBe(DEFAULT_TTS_SETTINGS.tts_provider);
    });
});
