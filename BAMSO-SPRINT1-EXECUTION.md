# BAMSO REFACTOR - EXECUTION GUIDE FOR CLINE/ANTIGRAVITY
**Quick Reference for Agent Execution**

---

## 🚀 START HERE - SPRINT 1, TASK 1.1

### Task 1.1: Code Quality Foundation

**Time Estimate:** 2-3 hours  
**Risk Level:** LOW (no breaking changes)  
**Current Status:** Not Started

---

## STEP 1: Analyze Current State

```bash
# Run this in terminal to understand codebase
gitnexus analyze

# This will create .gitnexus/ folder with codebase graph
# Open in browser (URL shown) to see dependency tree
```

---

## STEP 2: Remove Console Logs

**CodeBuff Command (Run in Cline/Antigravity):**

```
Goal: Remove console.log/error from production code and replace with centralized logger

File Scope: src/app/api/* + src/lib/* + src/components/*

Steps:
1. Create src/lib/logger.ts with:
   - log(message, context?) → only if NODE_ENV !== 'production'
   - error(message, error?, context?) → send to error tracking
   - warn(message, context?)
   - debug(message, context?)

2. Find all console.log/console.error in codebase (use grep)
3. Replace console.log() → logger.log()
4. Replace console.error() → logger.error()
5. Keep console.log in:
   - Testing files

6. Update src/lib/logger.ts imports in all files

Files to Modify (actual files confirmed in codebase):
- src/app/api/queue/call-next/route.ts
- src/app/api/queue/skip/route.ts
- src/app/api/queue/complete/route.ts
- src/app/api/queue/restore/route.ts
- src/app/api/services/route.ts
- src/app/api/staff/route.ts
- src/app/api/settings/route.ts
- src/app/api/stats/route.ts
- src/app/api/tickets/route.ts
- src/app/api/tts/route.ts
- src/app/api/health/route.ts
- src/app/api/auth/route.ts
- src/app/api/demo-token/route.ts
- src/lib/auth.ts
- src/lib/sse-broker.ts
- src/hooks/useAudioUnlock.ts
- src/hooks/useSpeech.ts
- src/stores/queue.store.ts
- src/stores/auth.store.ts
- src/components/display/DisplayBoard.tsx
- src/components/customer/WaitingTracker.tsx
- src/components/customer/LiveTracker.tsx
- src/components/admin/TtsPanel.tsx
- src/components/admin/ServicesPanel.tsx
- src/components/admin/StaffPanel.tsx
- src/components/admin/StatsPanel.tsx
- src/components/admin/SettingsPanel.tsx
- src/proxy.ts (DEBUG log)

Acceptance Criteria:
✅ No console.log in src/app/api/* or src/lib/*
✅ All loggers use logger.ts
✅ logger.ts exports 4 methods (log, error, warn, debug)
✅ npm run lint passes
✅ No TypeScript errors
```

**Expected Output:**
- New file: `src/lib/logger.ts`
- 10+ files modified (console calls replaced)
- No breaking changes

---

## STEP 3: Bổ sung TypeScript Strict Checks

> ⚠️ **Lưu ý thực tế:** `"strict": true` đã được bật trong `tsconfig.json`. KHÔNG cần enable lại.

**CodeBuff Command:**

```
Goal: Bổ sung strict checks còn thiếu và fix violations

Steps:
1. Update tsconfig.json — CHỈ thêm 2 option sau (strict đã có rồi):
   - "noUnusedLocals": true
   - "noUnusedParameters": true
   (KHÔNG thêm noImplicitReturns vì có thể break nhiều thứ)

2. Chạy 'npm run type-check' để xem errors mới
3. Fix các TypeScript errors nếu có:
   - Xóa biến/param không dùng (prefix _ nếu cần giữ)
   - Add return type annotations còn thiếu
   
4. Focus files:
   - src/lib/sse-broker.ts (QueueClient, DisplayClient types đã OK)
   - src/components/* (props types, useState generics)
   - src/stores/*.ts (return types)

Acceptance Criteria:
✅ tsconfig.json có thêm noUnusedLocals + noUnusedParameters
✅ npm run type-check returns 0 errors
✅ Không có unused variables/params
```

**Expected Output:**
- Modified: `tsconfig.json` (2 dòng thêm)
- Một số files xóa unused variables
- 0 TypeScript errors

---

## STEP 4: Configure ESLint & Prettier

> ⚠️ **Lưu ý thực tế:** Project dùng **ESLint v9 Flat Config** (`eslint.config.mjs`). KHÔNG dùng `.eslintrc.json` — format này deprecated với ESLint v9.

**CodeBuff Command:**

```
Goal: Setup consistent code formatting and linting

Files to Create/Modify:
- eslint.config.mjs (MODIFY — thêm rules vào flat config hiện có)
- .prettierrc (CREATE — formatting config)
- Update package.json with lint scripts

Steps:
1. MODIFY eslint.config.mjs (KHÔNG tạo .eslintrc.json):
   import { defineConfig, globalIgnores } from "eslint/config";
   import nextVitals from "eslint-config-next/core-web-vitals";
   import nextTs from "eslint-config-next/typescript";

   const eslintConfig = defineConfig([
     ...nextVitals,
     ...nextTs,
     globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
     {
       rules: {
         "no-console": "warn",
         "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_" }],
         "prefer-const": "error",
         "no-var": "error"
       }
     }
   ]);

   export default eslintConfig;

2. Create .prettierrc:
   {
     "semi": true,
     "trailingComma": "es5",
     "singleQuote": true,
     "printWidth": 100,
     "tabWidth": 2
   }

3. Update package.json scripts:
   - "lint": "eslint src --max-warnings=0"
   - "lint:fix": "eslint src --fix"
   - "format": "prettier --write src"
   - "type-check": "tsc --noEmit"

4. Run 'npm run lint:fix' to auto-fix issues

Acceptance Criteria:
✅ eslint.config.mjs cập nhật với strict rules
✅ .prettierrc created
✅ package.json scripts updated
✅ npm run lint passes with 0 warnings
✅ npm run format runs without errors
```

**Expected Output:**
- Modified: `eslint.config.mjs` (thêm rules block)
- New file: `.prettierrc`
- Modified: `package.json`
- Code auto-formatted

---

## STEP 5: Verify All Changes

**Run these commands:**

```bash
# 1. Type check
npm run type-check

# 2. Lint
npm run lint

# 3. Format
npm run format

# 4. Build
npm run build

# All should pass with 0 errors
```

**Acceptance Criteria Checklist:**

- ✅ `npm run type-check` → 0 errors
- ✅ `npm run lint` → 0 warnings
- ✅ `npm run format` → no changes
- ✅ `npm run build` → success
- ✅ No console.log in production code
- ✅ All imports/exports correct

---

## STEP 6: CodeGraph Impact Check

```bash
# Sync sau khi thay đổi nhiều files
codegraph sync .
```

---

## STEP 7: Commit & Review

```bash
# Stage changes
git add .

# Commit with message
git commit -m "chore: setup code quality foundation - add logger, enable strict TS, configure eslint/prettier"

# Push feature branch
git push origin feat/refactor-code-quality

# Create PR in GitHub with checklist
```

---

## TASK 1.2: Centralized API Client Layer

### Time Estimate: 3-4 hours

**CodeBuff Command:**

```
Goal: Create centralized fetch wrapper + hooks to replace raw fetch() calls

Files to Create:
1. src/lib/api-client.ts - Core fetch wrapper
2. src/lib/api-endpoints.ts - Centralized endpoint constants
3. src/hooks/useAPI.ts - Custom hook for data fetching
4. src/types/api.ts - Type definitions for API

Step 1: Create src/lib/api-client.ts
- Class: APIClient
- Methods:
  * async request<T>(method: string, endpoint: string, body?: any): Promise<T>
  * async get<T>(endpoint: string): Promise<T>
  * async post<T>(endpoint: string, body: any): Promise<T>
  * async put<T>(endpoint: string, body: any): Promise<T>
  * async delete<T>(endpoint: string): Promise<T>
- Features:
  * Retry logic (3 attempts with exponential backoff)
  * Error normalization
  * Request/response logging via logger
  * Type-safe responses
  * credentials: 'include' để gửi cookie JWT tự động (KHÔNG inject auth header — project dùng cookie-based auth, không phải Bearer token)

Step 2: Create src/lib/api-endpoints.ts
- Export constants: API_ENDPOINTS = { QUEUE: { CALL_NEXT: '/api/queue/call-next' }, ... }
- Factory function: buildEndpoint(base, params) for dynamic URLs

Step 3: Create src/hooks/useAPI.ts
- Custom hook: useAPI<T>(endpoint: string)
  * Returns: { data: T | null, loading: bool, error: Error | null, refetch: () => void }
  * Auto-fetches on mount
  * Refetch function
- Custom hook: useMutate<T>(endpoint: string, method: 'POST'|'PUT'|'DELETE')
  * Returns: { mutate: (data) => Promise<T>, loading, error }

Step 4: Create src/types/api.ts
- Type: APIResponse<T> = { success: bool, data: T, error?: string }
- Type: APIError = { code: string, message: string, status: number }

Step 5: Replace raw fetch() calls
- Find all fetch() in components
- Replace with useAPI hook
- Update state management to use hook return values
- Test all components

Files to Modify:
- src/app/page.tsx
- src/app/admin/page.tsx
- src/app/kiosk/page.tsx
- src/components/customer/*.tsx
- src/components/admin/*.tsx
- src/components/staff/*.tsx
- src/hooks/*.ts

Acceptance Criteria:
✅ src/lib/api-client.ts created + exported
✅ src/hooks/useAPI.ts working in 3+ components
✅ All fetch() calls replaced
✅ Retry logic tested (manually)
✅ Error handling works
✅ Types are consistent
✅ 0 TypeScript errors
✅ Components test pass
```

**CodeGraph Checks:**

```bash
# Sync codebase index sau khi thay đổi nhiều files
codegraph sync .
```

---

## TASK 1.3: Extract TTS Service

### Time Estimate: 2-3 hours

**CodeBuff Command:**

```
Goal: Extract TTS logic from TtsPanel.tsx into reusable service + hook

Current: TtsPanel.tsx = 414 lines (logic + UI mixed)
Target: TtsPanel.tsx = ~150 lines (UI only) + tts-service.ts (logic)

Files to Create:
1. src/lib/tts-service.ts - TTS business logic
2. src/hooks/useTTS.ts - Custom hook for TTS operations

Step 1: Create src/lib/tts-service.ts
- Extract from TtsPanel:
  * selectVoiceHandler() - Choose voice
  * formatNumberForTTS(number) - Format numbers for TTS
  * formatTemplateMessage(template, data) - Format message template
  * testAudioPreview(text, voice) - Play test audio
  * saveTTSSettings(settings) - Save settings to API
  * loadTTSSettings() - Load settings from API
- Type exports: TTSVoice, TTSSettings, TTSTemplate

Step 2: Create src/hooks/useTTS.ts
- Hook: useTTS()
  * Returns: { 
      voices: TTSVoice[],
      settings: TTSSettings,
      templates: TTSTemplate[],
      selectVoice: (voice) => void,
      testAudio: (text) => Promise<void>,
      saveSettings: (settings) => Promise<void>,
      loading: bool,
      error: Error | null
    }
  * Uses useAPI hook from task 1.2
  * Manages state with useState/useContext

Step 3: Refactor TtsPanel.tsx
- Remove all logic → use useTTS hook
- Keep only JSX
- Update state: const { voices, settings, ... } = useTTS()
- Call hook functions from JSX handlers
- Reduce file from 414 → ~150 lines

Step 4: Update tests
- Create src/__tests__/lib/tts-service.test.ts
- Create src/__tests__/hooks/useTTS.test.ts
- Mock API responses

Files to Modify:
- src/components/admin/TtsPanel.tsx (remove logic)

Files to Create:
- src/lib/tts-service.ts
- src/hooks/useTTS.ts
- src/__tests__/lib/tts-service.test.ts
- src/__tests__/hooks/useTTS.test.ts

Acceptance Criteria:
✅ tts-service.ts created + all functions work
✅ useTTS hook created + used in TtsPanel
✅ TtsPanel reduced to <200 lines
✅ All TTS functionality preserved
✅ Tests passing for tts-service.ts
✅ Visual: TtsPanel looks/behaves identical
✅ 0 TypeScript errors
```

**Note về TTS:**
> `src/lib/edge-tts-wrapper.js` là plain JavaScript (không phải .ts). Import bình thường vì `tsconfig.json` có `"allowJs": true`.

**CodeGraph Check:**

```bash
codegraph sync .
```

---

## AFTER SPRINT 1 COMPLETION

### Commit & Tag

```bash
git add .
git commit -m "feat(sprint-1): code quality foundation + api client + tts service

- Add centralized logger (replaces console.log)
- Enable TypeScript strict mode
- Configure ESLint + Prettier
- Create APIClient + useAPI hook
- Extract TTS logic to service + hook
- Reduce TtsPanel from 414 → 150 lines
- Add tests for new services

BREAKING CHANGE: None (backward compatible)
"

git tag sprint-1-complete
git push origin feat/refactor-code-quality
```

### Create Pull Request

Title: `[REFACTOR] Sprint 1: Code Quality Foundation`

Description:
```
## Changes
- ✅ Task 1.1: Code Quality Foundation
- ✅ Task 1.2: API Client Layer
- ✅ Task 1.3: TTS Service Extraction

## Testing
- ✅ npm run type-check: 0 errors
- ✅ npm run lint: 0 warnings
- ✅ npm test: all passing
- ✅ npm run build: success

## Impact
- Reduced console.log statements: 50+ → 0 (production)
- Added type safety: ~20 files improved
- Component size reduced: TtsPanel 414 → 150 lines
- New testable services: APIClient, TTSService

## Screenshots (if UI changed)
[None - refactor only]

## Checklist
- ✅ Code review requested
- ✅ Tests passing
- ✅ No breaking changes
- ✅ Documentation updated
```

---

## MONITORING CHECKPOINT

After Sprint 1, verify:

| Metric | Before | After | Target |
|--------|--------|-------|--------|
| ESLint Violations | Many | 0 | 0 ✅ |
| TypeScript Errors | Unknown | 0 | 0 ✅ |
| Test Coverage | ~0% | ~10% | 80% |
| Largest File | 414 lines | 150 lines | <150 ✅ |
| Code Duplication | Unknown | TBD | <5% |

---

## NEXT: SPRINT 2

When Sprint 1 complete, proceed to:

```
SPRINT 2: Scalability
├─ Task 2.1: Redis & Pub/Sub (3h)
└─ Task 2.2: Error Boundary (2h)
```

See main `BAMSO-ARCHITECT-BLUEPRINT.md` for details.

---

**END OF EXECUTION GUIDE**
