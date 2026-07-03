# Technical Implementation Plan: System Hardening

## 1. Architecture Changes

### A. Redis Pub/Sub Integration
- **Tool:** `ioredis`.
- **Logic:** 
    - Modify `SSEBroker` to use a Redis client for `publish` and `subscribe`.
    - Every server instance will subscribe to `CHANNELS.QUEUE_UPDATE` and `CHANNELS.DISPLAY_CALL`.
    - When a `broadcast` is called, it sends a message to Redis $\rightarrow$ Redis pushes to all subscribed instances $\rightarrow$ Instances push to their local SSE clients.

### B. Query Optimization
- **Target:** `src/lib/sse-broker.ts` -> `broadcastQueueUpdateLocal`.
- **Change:** 
    - Instead of `prisma.ticket.findMany({ where: { createdAt: ... } })`, 
    - Use `prisma.ticket.findMany({ where: { serviceId, createdAt: ... } })`.
    - This reduces memory usage from $O(TotalTickets)$ to $O(ServiceTickets)$.

### C. API Client Hardening
- **Target:** `src/lib/api-client.ts`.
- **Change:** Add a check in the retry loop: `if (method === 'POST') throw lastError;`.

### D. Proxy Security Refactor
- **Target:** `src/proxy.ts`.
- **Change:**
    - `config.matcher` $\rightarrow$ `['/api/:path*', ...]`
    - Define `const PUBLIC_API_ROUTES = ['/api/auth', '/api/services', ...]`
    - Logic: `if (isPublicApiRoute(pathname)) return NextResponse.next();` $\rightarrow$ then proceed to JWT check.

## 2. Execution Sequence

### Step 1: Infrastructure Setup
1. `npm install ioredis`.
2. Setup Redis connection singleton in `src/lib/redis.ts`.

### Step 2: Backend Logic Hardening
1. Refactor `SSEBroker` to use Redis.
2. Optimize Prisma queries in `sse-broker.ts`.
3. Implement "Deny-by-Default" in `proxy.ts`.

### Step 3: Client Hardening
1. Fix `APIClient` retry logic.

### Step 4: Cleanup
1. Remove `zalo-app/`.
2. Remove CORS configs from `next.config.ts`.

### Step 5: Validation
1. Verify SSE across instances.
2. Verify API protection.
3. Run e2e tests.
