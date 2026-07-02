# Implementation Tasks: Zalo Mini App Integration

## Phase 1: Backend Preparation
- [ ] **T1.1: Update CORS Configuration**
    - Modify API routes or middleware to allow `https://*.zalo.me` and other Zalo origins.
    - File: `src/middleware.ts` (or relevant API route files).
- [ ] **T1.2: API Accessibility Check**
    - Ensure `/api/services` and `/api/tickets` are reachable via public HTTPS.
    - Verify response formats match Mini App expectations.

## Phase 2: Mini App Foundation
- [ ] **T2.1: Project Initialization**
    - Setup Zalo Mini App project structure using Zalo Mini App Studio.
- [ ] **T2.2: API Client Setup**
    - Create a utility for making API requests to the Bamso Backend.
    - Implement error handling for network failures.

## Phase 3: Feature Implementation (Frontend)
- [ ] **T3.1: Service Selection Page**
    - Fetch services from `GET /api/services`.
    - Render a list of services with "Take Ticket" buttons.
- [ ] **T3.2: Ticket Taking Logic**
    - Implement `POST /api/tickets` call on button click.
    - Redirect user to the Tracking Page upon success.
- [ ] **T3.3: Tracking Page UI**
    - Display User's Ticket Number.
    - Display Current Calling Number.
    - Display calculated position in queue.
- [ ] **T3.4: Real-time Update Logic**
    - Implement SSE connection to `/api/sse/queue`.
    - [P] Implement Polling fallback if SSE is unavailable.
    - Update UI state in real-time.

## Phase 4: Verification & QA
- [ ] **T4.1: End-to-End Flow Test**
    - Test: Take ticket via Zalo $\rightarrow$ Check if it appears in Bamso DB $\rightarrow$ Check if it appears on Display Board.
- [ ] **T4.2: UX Audit**
    - Verify alignment with Zalo Design System.
    - Test on real device.
