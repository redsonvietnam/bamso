# Specification: System Hardening & Scalability (v2.2)

## 1. Overview
The system currently possesses architectural vulnerabilities related to real-time synchronization in serverless environments, inefficient database querying, unsafe API retry mechanisms, and a fragile "Allow-by-Default" security proxy. This specification defines the requirements to transform the prototype into a production-ready system.

## 2. Core Requirements

### R1: Distributed Real-time Synchronization
- The system must synchronize queue updates across multiple server instances.
- **Current Fail:** Local in-memory `pubSub` and `global.sseBroker` fail in serverless environments (Lambda/Vercel).
- **Requirement:** Implement a distributed Pub/Sub mechanism using Redis.

### R2: Database Query Optimization
- Queue status updates must be fetched efficiently from the database.
- **Current Fail:** `broadcastQueueUpdateLocal` fetches all tickets for the day and filters them using `.filter()` in JavaScript (O(N)).
- **Requirement:** Filter by `serviceId` directly in the PostgreSQL query.

### R3: API Idempotency & Safe Retries
- The API client must not cause duplicate data creation during network retries.
- **Current Fail:** `APIClient` retries all requests, including `POST` (Ticket creation).
- **Requirement:** Disable automatic retries for non-idempotent methods (`POST`, `PATCH`).

### R4: Secure-by-Default API Proxy
- All API routes must be protected by default.
- **Current Fail:** Proxy only protects routes explicitly listed in the `matcher`. New routes are public by default.
- **Requirement:** Apply proxy to all `/api` routes and maintain a strict "Public Whitelist".

### R5: codebase Cleanup
- Remove experimental/failed feature remnants.
- **Target:** Remove `zalo-app/` and associated CORS configurations.

## 3. Acceptance Criteria
- [ ] Deploying two separate instances of the server allows an update in Instance A to be reflected in Instance B.
- [ ] DB logs show filtered queries instead of "fetch all".
- [ ] Calling `POST /api/tickets` with a simulated network failure does not result in multiple tickets.
- [ ] Accessing a new, unprotected API route without a token returns a 401.
- [ ] `zalo-app` directory and related configs are removed.
