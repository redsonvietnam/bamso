# HANDOFF.md

## 0. Tổng quan dự án

**Là gì:** Hệ thống quản lý hàng đợi (Queue Management System) dành cho cơ quan hành chính công. Người dân tự lấy số tại kiosk, cán bộ gọi số, màn hình TV phát âm thanh.

**Stack:**
- Next.js 16.2.6 (App Router) + React 19 + TypeScript strict
- Prisma 6.3 ORM — SQLite mặc định (`prisma/dev.db`), có thể switch PostgreSQL qua `DATABASE_URL`
- Auth: `jose` JWT → HttpOnly cookie `auth_token`
- Real-time: SSE (Server-Sent Events) qua `src/lib/sse-broker.ts`
- State client: Zustand
- Redis: tùy chọn — dùng cho rate-limit + cross-instance pub/sub (fail-open nếu thiếu)
- TTS: Google Translate TTS proxy + Web Speech API fallback
- UI: Tailwind CSS v4, Radix UI Select, Recharts, Sonner toast, Lucide icons

**Cấu trúc chính:**
```
src/
  app/
    (auth)/login         — trang đăng nhập
    (public)/            — get-ticket, track, waiting, display
    admin/               — dashboard admin (ADMIN only)
    canbo/               — giao diện cán bộ quầy (STAFF/ADMIN)
    kiosk/               — máy tính bảng tự lấy số (public)
    demo/                — showcase demo
    api/
      auth/              — POST đăng nhập, DELETE logout
      queue/             — call-next, complete, skip, restore (STAFF/ADMIN)
      tickets/           — POST tạo vé, GET track
      services/          — CRUD dịch vụ
      settings/          — GET/PUT cấu hình
      sse/               — stream SSE queue + display
      stats/             — thống kê (ADMIN)
      staff/             — CRUD tài khoản staff (ADMIN)
      tts/               — text-to-speech proxy
      health/            — health check
      demo-token/        — demo token (disabled by default)
  lib/
    queue-service.ts     — callNext/complete/skip/restore (QUAN TRỌNG NHẤT)
    sse-broker.ts        — singleton SSE broker, Redis pub/sub
    auth.ts              — signJWT/verifyJWT
    ticket-service.ts    — tạo vé, tránh trùng ticketNumber
    rate-limit.ts        — Redis-backed, fail-open
    db.ts                — Prisma client singleton
    redis.ts             — ioredis client + pubsub client
  proxy.ts               — middleware auth/RBAC (thay middleware.ts)
  stores/                — Zustand stores (auth, queue)
  components/            — UI components (QRScanner, QueuePanel, v.v.)
```

**Model dữ liệu:**
- `User`: id, username, passwordHash (PBKDF2 210k rounds), name, role (ADMIN/STAFF/KIOSK/DISPLAY)
- `Ticket`: id, ticketNumber, dayKey (YYYY-MM-DD), serviceId, status (PENDING/CALLED/IN_PROGRESS/COMPLETED/MISSED), **position** (integer, dùng để sort — KHÔNG dùng createdAt), missCount, pos (quầy), calledAt, completedAt; unique([serviceId, dayKey, ticketNumber])
- `Service`: id, code, name, color, prefix, order, isActive, allowedModes
- `Settings`: key-value store (vd: `skip_rules`)

**Phần logic dễ vỡ nhất:**
1. `queue-service.ts` — toàn bộ logic callNext/skip/restore dùng `prisma.$transaction` + conditional `updateMany` để chống race condition. Chưa có unit test. Lỗi ở đây = mất số, trùng số, sai thứ tự.
2. `sse-broker.ts` — singleton dùng `global.sseBroker` (tránh duplicate trong dev hot-reload). Nếu mất `this` context khi export function → broker không hoạt động. Đã fix bằng `.bind(sseBroker)`.
3. `proxy.ts` — whitelist route public phải khớp chính xác. Thêm route mới mà quên whitelist → 401.
4. `position` field — thuật toán skip dùng increment/decrement trên các vé khác. Nếu transaction timeout hoặc lỗi giữa chừng → position bị lệch.

**Cách chạy / build / test:**
```bash
# Dev (Windows 1-click)
run-local.bat

# Dev (thủ công) — SQLite file-based, không cần start DB server
npm run dev

# DB
npx prisma db push
npx prisma db seed
npx prisma studio

# Build kiểm tra
npm run build

# Lint / type check
npm run lint
npm run type-check

# Unit test
npm test

# E2E integration test (cần server đang chạy)
node scratch/e2e-test.mjs
```

**Biến môi trường cần thiết** (xem `.env.example`):
```env
DATABASE_URL="file:./dev.db?socket_timeout=5&connection_limit=1"  # SQLite busy_timeout=5s
JWT_SECRET="<>=32 ký tự>"
# Tùy chọn:
REDIS_HOST=localhost
REDIS_PORT=6379
DEMO_MODE_ENABLED=false
RATE_LIMIT_DISABLED=false
```

---

## 1. Trạng thái hiện tại

**Đã hoàn thành và xác minh (2026-08-07):**
- **Toàn bộ test suite (`npm test`) đã PASS:** Bao gồm cả các test cũ của `cccd-parser.test.ts` và unit test mới cho `queue-service.ts`.
- **E2E test (`e2e-test.mjs`) đã PASS:** Xác minh toàn bộ luồng nghiệp vụ và logic PII redaction.
- **Fix lỗi đồng bộ real-time (SSE):** Đã sửa lỗi mất đồng bộ trên các client khi hot-reload bằng cách quản lý `EventSource` qua biến `global`.
- **Thống nhất auth `/api/settings`:** `proxy.ts` giờ chặn mọi method khác GET (vd PUT) với session ADMIN; GET vẫn public. Route handler giữ `requireRole` làm lớp phòng thủ kép. (commit `e59ef71`)
- **Unit test cho `sse-broker.ts`:** 18 test (broadcast theo serviceId, redaction theo role, fail-open Redis, unsubscribe khi enqueue throw). Export class `SSEBroker` để test không phụ thuộc singleton. (commit `75f0d89`)
- **SQLite `busy_timeout` + `connection_limit`:** `DATABASE_URL` thêm `?socket_timeout=5&connection_limit=1` (thực thi trong CR-3B, `.env` hiện có config này). Prisma `socket_timeout` map tới SQLite `busy_timeout` (giây).

**Vấn đề còn tồn tại:**
- Không còn. `npm run lint` sạch (0 error, 0 warning).

**Quyết định cần đưa ra:**
- Database production: **SQLite** (user đã chốt). `connection_limit=1` reduces/mitigates SQLITE_BUSY risk for single-instance SQLite deployment by limiting the Prisma connection pool to one connection; `socket_timeout=5` allows SQLite lock waits up to 5 seconds before failing.
- Redis có cài production không? (chưa chốt)
- `DEMO_MODE_ENABLED` có bật trên production không? (chưa chốt)

---

## 2. Việc cần làm tiếp theo (theo thứ tự ưu tiên)

1.  ✅ ~~**Thống nhất auth `/api/settings`**~~ — Đã làm (P1, commit `e59ef71`).
2.  ✅ ~~**Viết test cho `sse-broker.ts`**~~ — Đã làm (P2, commit `75f0d89`, 18 test).
3.  ✅ ~~**SQLite `busy_timeout`**~~ — Đã thêm `?socket_timeout=5&connection_limit=1` vào DATABASE_URL (CR-3B).
4.  ✅ ~~**Cookie `secure` flag không nhất quán**~~ — Đã làm (P2): helper `isSecureCookie()` trong `src/lib/cookie.ts`.
5.  ✅ ~~**Fix 5 lỗi lint pre-existing**~~ trong `src/app/(public)/get-ticket/page.tsx`. (P3) — Đã làm, `npm run lint` sạch 100%.
6.  ✅ ~~**Content-Security-Policy header**~~ trong `next.config.ts`. (P3) — Đã làm, verify header thực tế qua server production.
7.  ✅ ~~**CI/CD**~~ — GitHub Actions `.github/workflows/ci.yml` đã được tạo (CR-4). Job `verify`: ubuntu-latest, Node 22, SQLite, pipeline: checkout → setup → npm ci → prisma generate → lint → type-check → test → build.
8.  ✅ ~~**Xác nhận DB provider**~~ cho production (SQLite vs PostgreSQL) + bật lại `.git`. — SQLite (user quyết định). `.git` đã hoạt động bình thường.


---

## 3. Changelog theo phiên (APPEND-ONLY)

**Phiên 1** (acc lxn) — Audit kiến trúc toàn bộ. Phát hiện PII leak: `GET /api/tickets` + `/api/sse/queue` stream `customerName`/`phone` tới anonymous. Tạo `src/lib/api-auth.ts` với `authenticateOptional()` + đề xuất fix nhưng **KHÔNG merge vào code** (chỉ ghi nhận trong HANDOFF/INDEX). Findings mở: SQLite thiếu `busy_timeout`, cookie `secure` không nhất quán, queue-service chưa có test.

**Phiên 2** (acc skde) — Phát hiện phiên 1 báo "Hoàn thành" nhưng fix KHÔNG có trong code (grep: không nơi nào gọi `authenticateOptional`). Author 3 file fix: `tickets/route.ts` (`redactTicketsForRole`), `sse-broker.ts` (`redactForRole`, `QueueClient.role`, `subscribeQueue` nhận `role`), `sse/queue/route.ts` (truyền role). Quyết định: `broadcastDisplayCallLocal` giữ nguyên (cố ý). Snapshot lưu tại `conversations/archive/phien2/file changed/`. **Vẫn CHƯA merge.**

**Phiên 3** (opencode, 2026-08-06) — MERGE fix PII vào repo thật: 4 file (`api-auth.ts`, `tickets/route.ts`, `sse-broker.ts`, `sse/queue/route.ts`) + `tsconfig.json` thêm `"conversations"` vào `exclude` (snapshot trùng `declare global` phá type-check). Fix lint destructure-unused (`customerName: _customerName, phone: _phone`). Verify: `type-check` pass, lint sạch file đụng (5 lỗi pre-existing ở `get-ticket/page.tsx` giữ nguyên). Điểm rút kinh nghiệm: **sau khi AI author file, bắt buộc merge + verify vào `src/`, không để snapshot nằm im.**

**Phiên 4** (opencode/fes, 2026-08-07) — Verify PII, sửa lỗi `call-next`, sửa lỗi `cccd-parser` và fix lỗi SSE hot-reload.
1.  **Viết lại test e2e PII:** `scratch/e2e-test.mjs` được viết lại để test SSE một cách đáng tin cậy.
2.  **Sửa lỗi `call-next`:** Sửa lỗi thiếu `async` và lỗi chính tả trong `sse-broker.ts`.
3.  **Thêm Unit Test:** Tạo `src/lib/__tests__/queue-service.test.ts` (19 test case), tất cả đều pass.
4.  **Sửa lỗi test `cccd-parser`:** Sửa lỗi off-by-one index trong `cccd-parser.ts`, giúp toàn bộ `npm test` pass.
5.  **Fix lỗi SSE hot-reload:** Sửa lỗi mất đồng bộ real-time bằng cách dùng biến `global` để quản lý các instance `EventSource` trong `queue.store.ts` và `DisplayBoard.tsx`, đảm bảo chúng tồn tại duy nhất qua các lần hot-reload.
6.  **Verify:** `e2e-test.mjs` và `npm test` đều pass. Trạng thái đồng bộ real-time đã hoạt động bình thường.

**Phiên 5** (opencode, 2026-08-07) — Merge `feature/sse-and-parser-fixes` vào `fix` + 3 task đầu tiên trong HANDOFF.
1.  **Merge:** fast-forward `feature/sse-and-parser-fixes` → `fix` (`bf0887d`). Verify: `npm install` + `type-check` + `build` + `npm test` (49/49) pass. Push lên `origin/fix`.
2.  **Thống nhất auth `/api/settings`:** `src/proxy.ts` — bỏ `/api/settings` khỏi `PUBLIC_API_ROUTES`, thêm block method-aware: GET public, mọi method khác yêu cầu ADMIN (401/403). Route handler giữ `requireRole('ADMIN')` phòng thủ kép. Commit `e59ef71`.
3.  **Unit test `sse-broker.ts`:** `src/lib/__tests__/sse-broker.test.ts` (18 test) — broadcast queue/display theo serviceId, redaction theo role (anon bị strip PII, STAFF/ADMIN giữ), fail-open Redis (publish/subscribe lỗi không crash local broadcast), enqueue throw → unsubscribe client. Export class `SSEBroker` (trước là private) để test tạo instance mới, tránh singleton giữ state giữa các test. Toàn bộ suite 67/67 pass. Commit `75f0d89`.
4.  **SQLite `busy_timeout`:** `DATABASE_URL` thêm `?connection_limit=1&socket_timeout=15` trong `.env` local (verify kết nối OK). `.env.example` bị `.gitignore` chặn (`*.env*`) nên không commit được — config được ghi lại trong HANDOFF.
5.  **Verify:** `npm test` 67/67 pass, `type-check` pass, lint sạch các file đụng (5 lỗi pre-existing `get-ticket/page.tsx` + 2 lỗi mới `QRScanner.tsx` giữ nguyên).

**Phiên 6** (opencode, 2026-08-07) — Thống nhất cookie `secure` flag.
1.  **Helper `src/lib/cookie.ts`:** `isSecureCookie(request)` = `NODE_ENV === 'production' && x-forwarded-proto === 'https'`. Áp dụng nhất quán cho **5 nơi** set/clear `auth_token`.
2.  **Sửa lỗi thiếu `x-forwarded-proto`:** `DELETE /api/auth` trong `auth/route.ts` trước đây chỉ check `NODE_ENV` (secure cookie trên HTTP → mất cookie). `demo-token/route.ts` cũng chỉ check `NODE_ENV`.
3.  **Sửa lỗi clear không kèm `secure`:** `proxy.ts` (2 chỗ clear cookie khi token invalid) — nếu cookie gốc có `secure:true` mà clear thiếu `secure:true` thì trình duyệt không xóa được cookie.
4.  **Verify:** `type-check` pass, `npm test` 67/67 pass.

**Phiên 6b** (opencode, 2026-08-07) — Sạch toàn bộ lint (P3, task 5).
1.  **`get-ticket/page.tsx`:** bỏ 5 `any` — `allowedModes` dùng thẳng type Prisma (bỏ cast), Web Speech API được khai báo kiểu tối thiểu (`SpeechRecognitionInstance`, `SpeechRecognitionWindow`).
2.  **`QRScanner.tsx`:** bỏ `any` cho `fallbackHtml5Qrcode` (dùng `Html5Qrcode` type từ `html5-qrcode`), `let videoConstraints` → `const`, `console.log` → `logger.debug`, thêm `autoSelected`/`refreshDevices` vào deps.
3.  **`QrPanel.tsx`:** `<img>` → `next/image` (unoptimized), thêm `images.remotePatterns` cho `api.qrserver.com` trong `next.config.ts`.
4.  **Verify:** `npm run lint` sạch 100% (0 error, 0 warning), `type-check` pass, `npm test` 67/67, `build` pass.

**Phiên 6c** (opencode, 2026-08-07) — Content-Security-Policy (P3, task 6).
1.  **CSP trong `next.config.ts`:** theo pattern "Without Nonces" của Next docs (app có static prerendering, không dùng nonce). Directives: `default-src 'self'`, `script-src 'self' 'unsafe-inline'` (+ `'unsafe-eval'` dev cho HMR), `style-src 'self' 'unsafe-inline'`, `img-src 'self' blob: data: https://api.qrserver.com`, `font-src 'self' data:`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `frame-ancestors 'none'`, `connect-src 'self'`.
2.  **Không cần whitelist thêm:** TTS/Edge audio đi qua `/api/tts` (same-origin), SSE same-origin, Edge TTS WebSocket chạy server-side (không bị CSP trình duyệt). Nguồn ngoài duy nhất là ảnh QR `api.qrserver.com`.
3.  **Bỏ `upgrade-insecure-requests`:** dev chạy qua HTTP IP/ngrok sẽ bị vỡ.
4.  **Verify:** `build` pass, chạy `next start` port 3999 → header `Content-Security-Policy` xuất hiện đúng (HTTP 200).

**Phiên 6d** (opencode, 2026-08-07) — CI/CD GitHub Actions (P3, task 7).
1.  **`.github/workflows/ci.yml`:** job `verify` chạy trên ubuntu-latest, Node 22, `npm ci` → `npx prisma generate` → `npm run lint` → `npm run type-check` → `npm test` → `npm run build`. Trigger: push `main`/`fix` + PR vào `main`.
2.  **Env cho CI:** `JWT_SECRET` (bắt buộc khi build), `DATABASE_URL` SQLite file, `DEMO_MODE_ENABLED=false`, `RATE_LIMIT_DISABLED=false`.
3.  **Rút kinh nghiệm:** commit trước (`5ed1771`) cuốn nhầm `DisplayBoard.tsx` của phiên song song do dùng `git add -A`. Từ đây chỉ `git add` đúng file thay đổi; phân phạm vi: phiên này chỉ đụng `src/lib`, `src/proxy`, `src/app/api`, `next.config`, `HANDOFF.md`.

**Phiên 6e** (opencode, 2026-08-07) — Chốt DB production (P3, task 8).
1.  **User quyết định SQLite** cho production. Đã ghi vào phần "Quyết định cần đưa ra". `.git` đã hoạt động bình thường (`.git_disabled` không tồn tại) — phần "bật lại `.git`" đã xong từ trước.
2.  **Toàn bộ 8 task HANDOFF ban đầu đã hoàn thành.** Còn lại 2 quyết định mở: Redis production, `DEMO_MODE_ENABLED` production.
3.  **Báo cáo phiên:** `conversations/archive/phien6/phien6-acc-opencode.md` + snapshot `file changed/`. INDEX cập nhật.

