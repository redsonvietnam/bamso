/**
 * In-memory Redis mock for MFA primitive tests.
 * Simulates SET NX EX, INCR, EXPIRE, TTL, DEL, KEYS — with correct atomic semantics.
 * NOT a process-local security fallback — it's a test double for Redis operations.
 */

interface MockRedisEntry {
    value: string;
    expiresAt: number | null;
}

export class MockRedis {
    private store = new Map<string, MockRedisEntry>();
    private failMode = false;

    setFail(fail: boolean) {
        this.failMode = fail;
    }

    private isExpired(key: string): boolean {
        const entry = this.store.get(key);
        if (!entry) return true;
        if (entry.expiresAt !== null && Date.now() > entry.expiresAt) {
            this.store.delete(key);
            return true;
        }
        return false;
    }

    async set(
        key: string,
        value: string,
        ...args: (string | number)[]
    ): Promise<'OK' | null> {
        if (this.failMode) throw new Error('Redis unavailable');
        const nx = args.includes('NX');
        const exIndex = args.indexOf('EX');
        const ttlSeconds = exIndex !== -1 ? (args[exIndex + 1] as number) : null;

        if (nx && this.store.has(key) && !this.isExpired(key)) {
            return null; // NX fails if key exists
        }

        const expiresAt = ttlSeconds !== null ? Date.now() + ttlSeconds * 1000 : null;
        this.store.set(key, { value, expiresAt });
        return 'OK';
    }

    async get(key: string): Promise<string | null> {
        if (this.failMode) throw new Error('Redis unavailable');
        if (this.isExpired(key)) return null;
        return this.store.get(key)?.value ?? null;
    }

    async incr(key: string): Promise<number> {
        if (this.failMode) throw new Error('Redis unavailable');
        if (this.isExpired(key)) {
            this.store.set(key, { value: '1', expiresAt: null });
            return 1;
        }
        const entry = this.store.get(key);
        if (!entry) {
            this.store.set(key, { value: '1', expiresAt: null });
            return 1;
        }
        const newVal = parseInt(entry.value, 10) + 1;
        entry.value = String(newVal);
        return newVal;
    }

    async expire(key: string, seconds: number): Promise<0 | 1> {
        if (this.isExpired(key)) return 0;
        const entry = this.store.get(key);
        if (!entry) return 0;
        entry.expiresAt = Date.now() + seconds * 1000;
        return 1;
    }

    async ttl(key: string): Promise<number> {
        if (this.isExpired(key)) return -2;
        const entry = this.store.get(key);
        if (!entry) return -2;
        if (entry.expiresAt === null) return -1;
        const remaining = Math.ceil((entry.expiresAt - Date.now()) / 1000);
        return remaining > 0 ? remaining : -2;
    }

    async del(...keys: string[]): Promise<number> {
        if (this.failMode) throw new Error('Redis unavailable');
        let count = 0;
        for (const key of keys) {
            if (this.store.delete(key)) count++;
        }
        return count;
    }

    async keys(pattern: string): Promise<string[]> {
        const prefix = pattern.replace(/\*$/, '');
        const results: string[] = [];
        for (const [key] of this.store) {
            if (this.isExpired(key)) continue;
            if (key.startsWith(prefix)) results.push(key);
        }
        return results;
    }
}
