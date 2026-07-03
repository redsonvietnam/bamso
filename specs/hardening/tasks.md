# Task Breakdown: System Hardening

## Phase 1: Infrastructure & Security (The Foundation)
- [ ] **T1.1: Install Redis Client**
    - `npm install ioredis`.
- [ ] **T1.2: Create Redis Singleton**
    - Create `src/lib/redis.ts` to manage the connection pool.
- [ ] **T1.3: Implement Deny-by-Default Proxy**
    - Update `src/proxy.ts` matcher to `'/api/:path*'`.
    - Move public routes check into the function body using a whitelist.
    - Verify all protected routes still work.

## Phase 2: Distributed Real-time (The Core)
- [ ] **T2.1: Redis-powered SSE Broker**
    - Update `src/lib/sse-broker.ts` to use `redis.publish` and `redis.subscribe`.
    - Ensure the `init()` method sets up the Redis subscription.
- [ ] **T2.2: Optimize DB Queries**
    - Update `broadcastQueueUpdateLocal` in `src/lib/sse-broker.ts` to use `serviceId` in `where` clause.
    - Remove `.filter()` call from JavaScript.

## Phase 3: Client Reliability (The Safety)
- [ ] **T3.1: Fix API Client Retries**
    - Modify `src/lib/api-client.ts` to skip retries for `POST` and `PATCH` methods.

## Phase 4: Cleanup (The Polish)
- [ ] **T4.1: Remove Zalo App**
    - `rm -rf zalo-app/`.
    - Remove Zalo-specific CORS from `next.config.ts`.
    - Delete `specs/zalo-integration/`.

## Phase 5: Final Verification
- [ ] **T5.1: Security Audit**
    - Try accessing a random `/api/xyz` route $\rightarrow$ expect 401.
- [ ] **T5.2: Distribution Test**
    - (Manual/Dev) Verify SSE synchronization across multiple instances.
- [ ] **T5.3: E2E Sanity Check**
    - Run `node scratch/e2e-test.mjs`.
