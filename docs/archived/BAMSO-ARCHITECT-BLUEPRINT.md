# BAMSO REFACTOR ARCHITECTURE BLUEPRINT
**Project:** BAMSO (Queue Management System)  
**Architect:** Claude (AI)  
**Date:** 2026-06-14  
**Status:** Planning Phase  
**Execution Agents:** Cline + Antigravity (9Router)  

---

## 🎯 EXECUTIVE SUMMARY

**Current State:** Working MVP but hitting architectural limits
- In-memory SSE broker → cannot scale horizontally
- Raw fetch calls scattered across components → hard to maintain
- Large monolithic components → difficult to test/refactor
- Hardcoded Vietnamese strings → no i18n support

**Target State:** Production-ready, scalable architecture
- Redis pub/sub for real-time (multi-instance support)
- Centralized API layer with error handling
- Small, testable components with clear separation
- i18n support + improved error boundaries
- Improved UI/UX with design system

**Effort Estimate:** 3-4 weeks (4 sprints × 1 week)  
**Risk Level:** MEDIUM (real-time layer changes, DB refactoring)  
**Rollback Plan:** Feature flags + canary deployment

---

## 📐 ARCHITECTURE OVERVIEW

### Current Architecture (BEFORE)
```
┌─────────────────────────────────────────┐
│         Next.js App Router              │
├─────────────────────────────────────────┤
│                                         │
│  Components (React)                     │
│  ├─ Raw fetch() calls everywhere        │
│  ├─ Large monolithic components         │
│  └─ State scattered (useState + Zustand)│
│                                         │
│  Route Handlers (API)                   │
│  ├─ Direct Prisma calls                 │
│  ├─ SSEBroker singleton (in-memory)     │
│  └─ Console logs, minimal error handling│
│                                         │
│  Prisma ORM                             │
│  └─ SQLite (single-writer limitation)   │
│                                         │
└─────────────────────────────────────────┘

⚠️ Issues:
- SSEBroker fails on multi-instance
- No abstracted API layer
- Components coupled to HTTP details
- Hard to test, extend, maintain
```

### Target Architecture (AFTER)
```
┌──────────────────────────────────────────────┐
│         Next.js 16 + App Router              │
├──────────────────────────────────────────────┤
│                                              │
│  UI Layer (React 19 + Tailwind 4)            │
│  ├─ Small, composable components            │
│  ├─ Hooks for data fetching (custom hooks)  │
│  ├─ Zustand for client-side state           │
│  └─ i18n support (next-intl or similar)     │
│                                              │
│  API Layer (TypeScript)                      │
│  ├─ Unified fetch wrapper with error        │
│  ├─ React Query / SWR for caching           │
│  ├─ Consistent response format              │
│  └─ Global error boundaries                 │
│                                              │
│  Business Logic Layer                        │
│  ├─ queue-service.ts (refactored)           │
│  ├─ tts-service.ts (extracted)              │
│  ├─ auth-service.ts (centralized)           │
│  └─ Clean separation of concerns            │
│                                              │
│  Real-time Layer                            │
│  ├─ Redis pub/sub (multi-instance safe)    │
│  ├─ SSEBroker wrapper (abstracted)          │
│  ├─ WebSocket option for future            │
│  └─ Automatic reconnection handling         │
│                                              │
│  Database Layer                              │
│  ├─ Prisma ORM (SQLite — PostgreSQL là plan cũ) │
│  ├─ Migration scripts                       │
│  ├─ Data validation schemas                 │
│  └─ Query optimization                      │
│                                              │
└──────────────────────────────────────────────┘

✅ Benefits:
- Scalable to multiple instances
- Clear data flow
- Easy to test
- Maintainable and extensible
- Type-safe end-to-end
```

---

## 📊 DEPENDENCY MAPPING (CodeGraph Analysis)

**Critical Dependencies:**
```
Route Handler (call-next)
├─ queue-service.ts (CORE - 260 lines)
│  ├─ prisma (database)
│  └─ lib/constants.ts (TicketStatus)
├─ sse-broker.ts (REAL-TIME - 135 lines)
├─ api-auth.ts (auth via JWT cookie)
└─ [error-handler.ts] ← TO BE CREATED

Components
├─ TtsPanel.tsx (~21KB - SPLIT)
│  ├─ api/tts/route.ts
│  ├─ lib/edge-tts-wrapper.js (plain JS, import OK vì allowJs: true)
│  └─ tts-service.ts (TO BE EXTRACTED)
├─ WaitingTracker.tsx (~17KB - SPLIT)
│  └─ stores/queue.store.ts
├─ QueuePanel.tsx (staff interface — 12KB)
│  └─ api/queue/* routes
└─ DisplayBoard.tsx (src/components/display/)
   ├─ api/sse route
   └─ api/tickets route

Stores (Zustand)
├─ src/stores/queue.store.ts (SSE + fetch)
└─ src/stores/auth.store.ts (JWT cookie auth)

Hooks
├─ src/hooks/useSpeech.ts (TTS playback logic - 11KB)
└─ src/hooks/useAudioUnlock.ts

Impact Areas (nếu SSEBroker thay đổi):
- src/app/api/queue/* (5+ routes)
- src/components/display/DisplayBoard.tsx
- src/components/staff/QueuePanel.tsx
- src/stores/queue.store.ts
```

**High-Risk Changes:**
🔴 SSEBroker refactor → affects real-time for all clients
🟡 Prisma schema changes → need migrations
🟡 API response format changes → frontend updates needed

---

## 🔧 REFACTORING ROADMAP

### Phase 1: Foundation (Sprint 1-2 weeks)
**Goal:** Lay groundwork for larger changes. Low-risk, high-impact foundation.

#### Task 1.1: Setup Code Quality Foundation
```
Duration: 2-3 hours
Impact: Code quality + consistency

Changes:
- ✅ Remove console.log statements (replace with proper logging) — 50+ occurrences
- ✅ Thêm noUnusedLocals/noUnusedParameters vào tsconfig.json
       (strict: true ĐÃ BẬT — không cần enable lại)
- ✅ Update eslint.config.mjs với strict rules
       (ESLint v9 flat config — KHÔNG dùng .eslintrc.json)
- ✅ Configure .prettierrc for consistent formatting
```

**Lưu ý thực tế:**
- `tsconfig.json` ĐÃ có `"strict": true` → chỉ thêm `noUnusedLocals` + `noUnusedParameters`
- `eslint.config.mjs` là flat config (ESLint v9) → MODIFY file này, không tạo `.eslintrc.json`

**CodeBuff Command:**
```bash
codebuff --mode multi \
  "1. Find all console.log/error in src/ and api routes. 
       Replace with a centralized logger utility.
   2. Enable TypeScript strict mode in tsconfig.json.
   3. Run ESLint --fix to auto-fix linting issues.
   4. Add .prettierrc config for formatting consistency.
   5. Update package.json scripts with lint:fix and type:check."
```

**CodeGraph Check (thay thế gitnexus):**
```bash
# Sau khi thay đổi nhiều files, sync lại index
codegraph sync .
```

**Acceptance Criteria:**
- ✅ No console.log in production code (allowed in dev only)
- ✅ ESLint passes with 0 warnings
- ✅ tsconfig.json có thêm noUnusedLocals + noUnusedParameters
- ✅ npm run lint:fix runs without errors
- ✅ All files formatted with prettier

---

#### Task 1.2: Create Centralized API Client Layer
```
Duration: 3-4 hours
Impact: Remove fetch() from components, enable caching

Files to Create:
- src/lib/api-client.ts (core fetch wrapper)
- src/lib/api-endpoints.ts (centralized endpoints)
- src/hooks/useAPI.ts (custom hook for data fetching)
- src/lib/error-handler.ts (error formatting) ← NEW file
```

> ⚠️ **Auth pattern:** Project dùng JWT cookie (không phải Bearer token).
> APIClient dùng `credentials: 'include'` để browser tự gửi cookie.
> KHÔNG inject auth header từ Zustand store.

**CodeBuff Command:**
```bash
codebuff --mode multi \
  "1. Create src/lib/api-client.ts with:
       - Fetch wrapper with error handling
       - Request/response interceptors
       - Retry logic (3 attempts with backoff)
       - Type-safe generic methods (GET/POST/PUT/DELETE)
   
   2. Create src/lib/api-endpoints.ts:
       - Constants for all API routes
       - Type-safe endpoint builder
   
   3. Create src/hooks/useAPI.ts:
       - Custom hook for GET requests
       - Custom hook for POST mutations
       - Loading/error states
   
   4. Create src/lib/error-handler.ts:
       - Normalize error responses
       - User-friendly error messages
       - Error logging
   
   5. Update TypeScript types:
       - src/types/api.ts (Response, Error formats)"
```

**CodeGraph Check:**
```bash
codegraph sync .
```

**Code Sample to Review:**
```typescript
// src/lib/api-client.ts - Expected Structure
export class APIClient {
  async request<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    endpoint: string,
    body?: unknown
  ): Promise<T> {
    // credentials: 'include' để gửi cookie JWT tự động
    // Retry logic, error handling
    // KHÔNG inject Authorization header
  }
  
  async get<T>(endpoint: string): Promise<T>
  async post<T>(endpoint: string, body: unknown): Promise<T>
  async put<T>(endpoint: string, body: unknown): Promise<T>
  async delete<T>(endpoint: string): Promise<T>
}

// src/hooks/useAPI.ts - Expected Structure
export function useAPI<T>(endpoint: string) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  
  useEffect(() => {
    const fetch = async () => {
      // Use apiClient to fetch
    };
    fetch();
  }, [endpoint]);
  
  return { data, loading, error };
}
```

**Acceptance Criteria:**
- ✅ All fetch() calls replaced with apiClient
- ✅ API responses have consistent format
- ✅ Error handling works for all HTTP methods
- ✅ useAPI hook works in 3+ components (test)
- ✅ Types exported and used correctly
- ✅ Retry logic tested (manual test with offline simulation)

---

#### Task 1.3: Extract & Refactor TTS Service
```
Duration: 2-3 hours
Impact: Reusability, testability, remove from TtsPanel

Files to Create:
- src/lib/tts-service.ts (TTS logic extracted)
- src/hooks/useTTS.ts (hook for TTS operations)

Lưu ý: src/lib/edge-tts-wrapper.js là plain JS file.
Import bình thường vì tsconfig.json có "allowJs": true.
```

**CodeBuff Command:**
```bash
codebuff --file "src/components/admin/TtsPanel.tsx" \
  "1. Extract all TTS-related logic from TtsPanel into src/lib/tts-service.ts:
       - Voice selection logic
       - Template formatting
       - Audio playback
       - Settings save/load
   
   2. Create src/hooks/useTTS.ts:
       - Hook for TTS operations
       - State management (voices, templates, etc)
   
   3. Refactor TtsPanel to use useTTS hook:
       - Remove logic, keep only UI
       - Reduce lines from 414 to ~150
   
   4. Add unit tests for tts-service.ts"
```

**CodeGraph Check:**
```bash
codegraph sync .
```

**Acceptance Criteria:**
- ✅ TtsPanel reduced to <200 lines (UI only)
- ✅ tts-service.ts extracted (~150-200 lines)
- ✅ useTTS hook created and used
- ✅ All TTS functionality preserved
- ✅ TypeScript types for TTS config
- ✅ Tests written for tts-service

---

### Phase 2: Scalability (Sprint 1 week)
**Goal:** Make real-time layer scalable for multi-instance deployment.

#### Task 2.1: Setup Redis & Pub/Sub
```
Duration: 2-3 hours
Impact: Multi-instance support for real-time updates

Files to Create/Modify:
- src/lib/redis-client.ts (Redis connection)
- src/lib/pub-sub.ts (Pub/Sub wrapper)
- Update src/lib/sse-broker.ts (use Redis backend)
```

**Prerequisites:**
- Redis installed locally (Docker recommended)
- redis-py or node-redis package added to package.json

**CodeBuff Command:**
```bash
codebuff --mode multi \
  "1. Create src/lib/redis-client.ts:
       - Redis connection (with env vars)
       - Connection pooling
       - Error handling
       - Graceful shutdown
   
   2. Create src/lib/pub-sub.ts:
       - Publish method (topic, data)
       - Subscribe method (topic, callback)
       - Unsubscribe cleanup
   
   3. Refactor src/lib/sse-broker.ts:
       - Replace in-memory Set with Redis
       - Keep interface the same (backward compatible)
       - Use pub-sub for cross-instance broadcasting
   
   4. Update src/app/api/queue/* routes:
       - Replace broadcastQueueUpdate() calls
       - Ensure all events go through Redis pub-sub
   
   5. Setup .env.local:
       - REDIS_URL=redis://localhost:6379"
```

**CodeGraph Check:**
```bash
codegraph sync .
```

**Local Testing:**
```bash
# Terminal 1: Start Redis
docker run -d -p 6379:6379 redis:7-alpine

# Terminal 2: Start app
npm run dev

# Terminal 3: Test pub-sub
redis-cli
SUBSCRIBE queue-updates
```

**Acceptance Criteria:**
- ✅ Redis running and connected
- ✅ All events broadcast via Redis pub-sub
- ✅ SSEBroker interface unchanged (backward compatible)
- ✅ Multiple instances can share state
- ✅ Graceful disconnect/reconnect handling
- ✅ Tested with 2 app instances in Docker

---

#### Task 2.2: Add Global Error Boundary & Handler
```
Duration: 1-2 hours
Impact: Better error UX, consistent error handling

Files to Create/Modify:
- src/components/error-boundary.tsx (Error boundary)
- src/app/layout.tsx (wrap with error boundary)
- Update API error responses (consistent format)
```

**CodeBuff Command:**
```bash
codebuff --mode multi \
  "1. Create src/components/error-boundary.tsx:
       - React Error Boundary component
       - Show error UI
       - Log to monitoring service
       - Retry button
   
   2. Create src/app/global-error.tsx:
       - Next.js global error handler
       - Fallback UI for server errors
   
   3. Standardize API error responses:
       - All errors return: { error: string, code: string, status: number }
       - Update all src/app/api/* routes
   
   4. Update error-handler.ts:
       - Parse API errors
       - Show toast notifications
       - Log errors to console (logger)
   
   5. Update Sonner toast setup:
       - Success/error/warning/info styling"
```

**CodeGraph Check:**
```bash
codegraph sync .
```

**Acceptance Criteria:**
- ✅ Global error boundary catches React errors
- ✅ Next.js errors show fallback UI
- ✅ All API errors have consistent format
- ✅ Error messages shown in toast
- ✅ No unhandled promise rejections
- ✅ Manual test: break something, see error UI

---

### Phase 3: Component Refactoring (Sprint 1 week)
**Goal:** Break down large components into smaller, testable pieces.

#### Task 3.1: Split WaitingTracker Component
```
Duration: 2-3 hours
Impact: Easier maintenance, reusability

Current Size: ~17KB (WaitingTracker.tsx)
Target: 4-5 components × ~60-80 lines each

Components to Create:
- WaitingTracker.tsx (orchestrator, ~50 lines)
- QueueStatusCard.tsx (ticket status display)
- NextCallerDisplay.tsx (show next caller)
- EstimatedWaitTime.tsx (wait time calc + display)
- QueueStatsPanel.tsx (statistics)
```

**CodeBuff Command:**
```bash
codebuff --file "src/components/customer/WaitingTracker.tsx" \
  "Split WaitingTracker (343 lines) into 5 smaller components:

   1. Extract QueueStatusCard: Render single ticket status
   2. Extract NextCallerDisplay: Show next caller + position
   3. Extract EstimatedWaitTime: Calculate and display wait time
   4. Extract QueueStatsPanel: Show queue statistics
   5. Refactor WaitingTracker: Orchestrator, use custom hook useQueueStatus

   All components:
   - <150 lines each
   - Props clearly defined (no prop drilling)
   - Memoized if needed (React.memo)
   - Tests written (jest)
   
   Create src/hooks/useQueueStatus.ts:
   - Fetch queue status
   - Calculate wait times
   - Subscribe to updates via SSE
   - Return data + loading + error"
```

**CodeGraph Check:**
```bash
codegraph sync .
```

**Acceptance Criteria:**
- ✅ All 5 components created
- ✅ Each component <150 lines
- ✅ No prop drilling (max 1 level)
- ✅ useQueueStatus hook created
- ✅ Tests pass (jest)
- ✅ Visual inspection: same UI as before

---

#### Task 3.2: Split TtsPanel Component
```
Duration: 2-3 hours
Impact: Easier to maintain TTS configuration

Current Size: 414 lines
Target: 4 components × ~80-100 lines each

Components to Create:
- TtsPanel.tsx (orchestrator)
- VoiceSelector.tsx (voice selection dropdown)
- TemplateEditor.tsx (edit/save templates)
- AudioTester.tsx (test audio preview)
- LanguageSettings.tsx (language/provider selection)
```

**CodeBuff Command:**
```bash
codebuff --file "src/components/admin/TtsPanel.tsx" \
  "Split TtsPanel (414 lines) into 5 focused components:

   1. Extract VoiceSelector: Dropdown to select voice
   2. Extract TemplateEditor: Edit + save message templates
   3. Extract AudioTester: Test audio playback
   4. Extract LanguageSettings: Select TTS provider (Edge/Google) + language
   5. Extract TtsSettingsForm: Form for all settings
   6. Refactor TtsPanel: Use useTTS hook, orchestrate child components

   Use src/lib/tts-service.ts (from Task 1.3)
   All components should be <150 lines"
```

**CodeGraph Check:**
```bash
codegraph sync .
```

**Acceptance Criteria:**
- ✅ All components created + working
- ✅ Each <150 lines
- ✅ TTS functionality preserved
- ✅ Tests written
- ✅ Visual check: UI matches original

---

### Phase 4: Finalization (Sprint 1 week)
**Goal:** Polish, testing, documentation, deployment readiness.

#### Task 4.1: Add Tests & Improve Coverage
```
Duration: 2-3 hours
Impact: Confidence in refactored code

Test Areas:
- Unit tests for services (queue-service, tts-service, api-client)
- Component tests for new split components
- Integration tests for API routes
- E2E tests for critical flows
```

**CodeBuff Command:**
```bash
codebuff --mode multi \
  "1. Add unit tests:
       - src/__tests__/lib/queue-service.test.ts
       - src/__tests__/lib/tts-service.test.ts
       - src/__tests__/lib/api-client.test.ts
       - src/__tests__/hooks/useAPI.test.ts
   
   2. Add component tests:
       - src/__tests__/components/QueueStatusCard.test.tsx
       - src/__tests__/components/VoiceSelector.test.tsx
   
   3. Add integration tests:
       - src/__tests__/api/queue/call-next.test.ts
   
   4. Setup test utilities:
       - src/__tests__/setup.ts
       - src/__tests__/mocks/prisma.ts
       - src/__tests__/mocks/redis.ts
   
   5. Update package.json:
       - Add test:watch, test:coverage scripts
       - Configure Jest coverage thresholds"
```

**Acceptance Criteria:**
- ✅ 80%+ code coverage
- ✅ All critical paths tested
- ✅ npm test passes
- ✅ npm test:coverage shows improvement

---

#### Task 4.2: Create Spec Kit Documentation
```
Duration: 1-2 hours
Impact: Architectural clarity, decision tracking

Files to Create:
- docs/ARCHITECTURE.md (architecture decisions)
- docs/API.md (API endpoints + formats)
- docs/MIGRATION.md (refactor migration guide)
- docs/DEPLOYMENT.md (deployment instructions)
```

**CodeBuff Command:**
```bash
codebuff --mode multi \
  "1. Create docs/ARCHITECTURE.md:
       - Current architecture diagram
       - Data flow explanation
       - Key design decisions
       - Future improvements
   
   2. Create docs/API.md:
       - All endpoints documented
       - Request/response formats
       - Error codes
       - Examples (curl, fetch)
   
   3. Create docs/MIGRATION.md:
       - Step-by-step refactor log
       - Breaking changes
       - Database migrations (if any)
       - Rollback procedures
   
   4. Create docs/DEPLOYMENT.md:
       - Production checklist
       - Environment variables
       - Docker build instructions
       - Health checks"
```

**Acceptance Criteria:**
- ✅ All docs created + complete
- ✅ Diagrams included
- ✅ Examples working
- ✅ Reviewed for accuracy

---

#### Task 4.3: UI/Design System Enhancement (Optional - v0 Integration)
```
Duration: 2-3 hours
Impact: Modern, consistent UI

Recommendation: Use v0 to generate design system
- Create shadcn/ui setup (if not already done)
- Generate component library
- Implement theme switching (light/dark)
- Update color scheme to match brand
```

**v0 Prompt (for v0.app):**
```
"Create a modern design system for a Queue Management System with:
- Color palette: [specify brand colors]
- Components: Button, Card, Input, Select, Toast, Modal, Badge
- Theme support: light + dark mode
- Tailwind CSS 4 + Lucide icons
- Responsive design (mobile-first)
- Accessibility (WCAG 2.1 AA)"
```

**Then use CodeBuff to integrate:**
```bash
codebuff --mode multi \
  "1. Integrate v0-generated components into src/components/ui/
   2. Create theme provider (light/dark mode)
   3. Update all existing components to use new design system
   4. Test responsive design on mobile/tablet/desktop
   5. Update Tailwind config if needed"
```

---

## 📋 SPRINT BREAKDOWN

### Sprint 1 (Week 1): Foundation
**Goals:**
- Code quality baseline
- Centralized API layer
- TTS service extraction

**Tasks:**
- [ ] 1.1: Code Quality Foundation (3h)
- [ ] 1.2: API Client Layer (4h)
- [ ] 1.3: TTS Service Extraction (3h)

**Daily Standup Checklist:**
- What was completed?
- What are blockers?
- Any architecture questions?

---

### Sprint 2 (Week 2): Scalability
**Goals:**
- Redis pub-sub setup
- Global error handling
- SSE refactor for multi-instance

**Tasks:**
- [ ] 2.1: Redis & Pub/Sub (3h)
- [ ] 2.2: Error Boundary + Handler (2h)

**Daily Checklist:**
- Redis connection healthy?
- All tests passing?
- Error handling working?

---

### Sprint 3 (Week 3): Components
**Goals:**
- Split large components
- Improve maintainability
- Add component tests

**Tasks:**
- [ ] 3.1: Split WaitingTracker (3h)
- [ ] 3.2: Split TtsPanel (3h)

**Daily Checklist:**
- Components working?
- Tests passing?
- No visual regressions?

---

### Sprint 4 (Week 4): Finalization
**Goals:**
- Test coverage
- Documentation
- Production readiness

**Tasks:**
- [ ] 4.1: Tests & Coverage (3h)
- [ ] 4.2: Spec Kit Documentation (2h)
- [ ] 4.3: UI Design System (2h, optional)

**Final Checklist:**
- 80%+ test coverage?
- All docs complete?
- Ready for production?

---

## 🔄 WORKFLOW: How to Execute

### For Each Task:

**Step 1: Create Feature Branch**
```bash
git checkout -b feat/refactor-[task-name]
# Example: feat/refactor-api-client-layer
```

**Step 2: Run CodeGraph Analysis**
```bash
# Identify files that will be affected
gitnexus analyze

# Check impact of changes
gitnexus impact "src/lib/[new-file]"
```

**Step 3: Use CodeBuff for Implementation**
```bash
# Open Cline/Antigravity in terminal
codebuff "[Task description from above]"

# It will:
# - Analyze current code
# - Suggest refactoring
# - Create new files
# - Update existing files
# - Provide test cases
```

**Step 4: Verify with CodeGraph**
```bash
# Sync sau khi thay đổi lớn
codegraph sync .
```

**Step 5: Run Tests**
```bash
npm test
npm run lint
npm run type-check
```

**Step 6: Create PR & Document**
```bash
# Before merging, document in Spec Kit format:
# 1. What changed (spec)
# 2. How it changed (plan)
# 3. Testing done (acceptance criteria)
```

---

## 📊 MONITORING & METRICS

Track these metrics during refactor:

| Metric | Baseline | Target | Sprint |
|--------|----------|--------|--------|
| Test Coverage | ~0% | 80%+ | 4 |
| Avg Component Lines | 200+ | <150 | 3 |
| Code Duplication | High | <5% | 1-2 |
| API Error Rate | Unknown | <1% | 2 |
| Bundle Size | ? | -10% | 1 |
| ESLint Violations | Many | 0 | 1 |
| TypeScript Errors | Unknown | 0 | 1 |
| Build Time | ? | <30s | All |

---

## 🚨 RISKS & MITIGATION

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|-----------|
| SSE refactor breaks real-time | HIGH | MEDIUM | Feature flags + canary deploy |
| Database schema changes | HIGH | MEDIUM | Migration scripts + rollback plan |
| Component refactor visual bugs | MEDIUM | MEDIUM | Visual regression tests + QA |
| Performance regression | MEDIUM | LOW | Benchmark before/after |
| Team coordination (2 agents) | LOW | MEDIUM | Daily standups + clear task boundaries |

---

## ✅ DONE CRITERIA (OVERALL)

Refactor is complete when:
- ✅ All sprints finished
- ✅ 80%+ test coverage
- ✅ 0 TypeScript errors
- ✅ 0 ESLint violations
- ✅ All docs updated
- ✅ No visual regressions
- ✅ Performance metrics stable/improved
- ✅ Real-time works in multi-instance
- ✅ Error handling works across app
- ✅ Code review approved by team
- ✅ Deployed to staging + tested
- ✅ Merged to main branch
- ✅ Production deployment successful

---

## 📞 NEXT STEPS

1. **Confirm this plan** with team (Cline/Antigravity)
2. **Create feature branch:** `git checkout -b refactor/phase-1`
3. **Start Sprint 1, Task 1.1** → Code Quality Foundation
4. **Run CodeBuff** with the command provided above
5. **Report progress** after each task
6. **Adjust plan** if needed based on findings

---

## 📎 APPENDIX

### CodeBuff Execution Template
```bash
# Open Cline or Antigravity
# Run this in terminal:

codebuff "[TASK_NAME]" \
  --branch "feat/refactor-[name]" \
  --mode "multi-file" \
  --include-tests true \
  --commit-message "[FEAT] [Task Name] - Part of Phase [X] refactor"
```

### CodeGraph Checkpoint Template
```bash
# Sau khi CodeBuff hoàn thành:
codegraph sync .

# Review trước khi commit
```

### Spec Kit Documentation Template
```bash
# Create .speckit/[task-name].md
# Format:
# - What: [description]
# - Why: [rationale]
# - How: [implementation details]
# - Testing: [test plan]
# - Status: [in-progress/done/blocked]
```

---

**END OF BLUEPRINT**

---

*Generated by: Claude (Architect)*  
*For: Cline + Antigravity Execution*  
*Last Updated: 2026-06-14*
