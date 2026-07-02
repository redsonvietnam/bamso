# Technical Implementation Plan: Zalo Mini App Integration

## 1. Tech Stack
- **Frontend:** Zalo Mini App Framework (React-based).
- **Backend:** Existing Bamso Next.js API.
- **Communication:** HTTPS REST API + SSE (with Polling fallback).
- **Deployment:** Zalo Mini App Studio $\rightarrow$ Zalo Developer Portal.

## 2. Architecture
The Zalo Mini App acts as a lightweight client that consumes the existing Bamso API.

### API Endpoints to be used:
- `GET /api/services`: Fetch available services.
- `POST /api/tickets`: Create a new ticket.
- `GET /api/sse/queue`: Stream real-time updates for a specific service.

## 3. Implementation Steps

### Phase 1: Backend Preparation
- Update CORS settings in `src/middleware.ts` or API routes to allow requests from Zalo Mini App domains.
- Verify that the `/api/tickets` and `/api/services` endpoints are accessible without complex auth (or implement a simple API key for the Mini App).

### Phase 2: Mini App Development
- **Setup:** Initialize project in Zalo Mini App Studio.
- **UI Development:**
    - `ServicePage`: List of services with "Take Ticket" buttons.
    - `TrackingPage`: Display ticket number, current calling number, and wait position.
- **Integration:**
    - Implement API client for service fetching and ticket creation.
    - Implement SSE listener for real-time queue updates.

### Phase 3: Verification
- Test the full flow: Zalo App $\rightarrow$ Backend $\rightarrow$ DB $\rightarrow$ Display Board.
- Validate UI responsiveness on different screen sizes.

## 4. Risks & Mitigations
- **SSE Connectivity:** If SSE fails in the Zalo environment, implement a `useQueuePolling` hook.
- **Domain Restrictions:** Ensure the backend is deployed on a public HTTPS URL (e.g., Vercel/Railway) for Zalo to reach.
