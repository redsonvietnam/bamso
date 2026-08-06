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

# Dev (thủ công) — cần Postgres chạy trước
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
DATABASE_URL="file:./dev.db"          # hoặc postgresql://...
JWT_SECRET="<>=32 ký tự>"
# Tùy chọn:
REDIS_HOST=localhost
REDIS_PORT=6379
DEMO_MODE_ENABLED=false
RATE_LIMIT_DISABLED=false
```

---

## 1. Trạng thái hiện tại

**ĐÃ merge vào repo (mới nhất — 2026-08-06, opencode):**
- **Fix PII leak ĐÃ THỰC SỰ VÀO CODE** (trước đó chỉ nằm ở snapshot, chưa merge — sai sót cần chú ý). 4 file:
  - `src/lib/api-auth.ts` — thêm `authenticateOptional()` (best-effort auth, trả `{ userId, role } | null`, không bao giờ throw)
  - `src/app/api/tickets/route.ts` — `redactTicketsForRole()`, GET redact `customerName`/`phone` trừ khi role là ADMIN/STAFF
  - `src/lib/sse-broker.ts` — `redactForRole()`, `QueueClient.role`, `subscribeQueue(id, controller, serviceId?, role?)`, redact trong `broadcastQueueUpdateLocal`
  - `src/app/api/sse/queue/route.ts` — `authenticateOptional()` → truyền `session?.role ?? null` vào `subscribeQueue`
  - `broadcastDisplayCallLocal` GIỮ NGUYÊN — vẫn gửi `customerName` cho displayClients (hành vi cố ý khi gọi tên khách)
- `tsconfig.json` — thêm `"conversations"` vào `exclude` (các snapshot `file changed/` trùng `declare global`/`class SSEBroker` làm type-check vỡ)
- **Verify:** `npm run type-check` pass; `npm run lint` sạch cho các file đã sửa. Còn **5 lỗi lint pre-existing** trong `src/app/(public)/get-ticket/page.tsx` (`no-explicit-any`) — chưa fix, không liên quan.

**LƯU Ý QUAN TRỌNG cho phiên sau:**
- Thư mục `conversations/` chứa archive từng phiên (`archive/phienX/phienX-acc-*.md`) + SNAPSHOT file đã sửa trong `archive/phienX/file changed/`. **Snapshot KHÔNG phải nguồn đáng tin — trạng thái thật nằm trong `src/`.** Đừng merge lại snapshot đã merge.
- `INDEX.MD` là bản tóm tắt từng phiên (append-only, nén theo quy tắc: giữ quyết định/số liệu/lỗi+fix, bỏ thử-sai).
- Git đang tắt (thư mục `.git_disabled/`).

**ĐÃ xong và verify (từ trước):**
- 18 bug/security fix ghi trong `NEXT_STEPS.md` (demo-token không cấp ADMIN, SSML injection, rate-limit TTS, ticketNumber unique per day, PBKDF2 210k, auto-rehash, JWT_SECRET bắt buộc, Redis dedup, SSE fail-open, race condition callNext/complete/skip/restore, dead code xóa, camera secure-context, null check routes)
- Cấu trúc route, auth, RBAC hoạt động theo thiết kế

**ĐÃ xong nhưng CHƯA verify:**
- Các fix race condition trong `queue-service.ts` — không có unit test, chỉ verify thủ công qua e2e-test
- Redis pub/sub cross-instance — chưa có môi trường multi-instance để test
- Auto-rehash password khi login

**CẦN USER QUYẾT ĐỊNH:**
- Database production: SQLite (hiện tại) hay PostgreSQL? Schema đang dùng SQLite provider
- Redis có cài production không? (hiện fail-open, tức rate-limit bị vô hiệu nếu thiếu Redis)
- `DEMO_MODE_ENABLED` có bật trên production không?

---

## 2. Việc cần làm tiếp theo (theo thứ tự ưu tiên)

1. **Verify fix PII mới merge bằng e2e** — thêm test/`e2e-test.mjs`: anonymous GET `/api/tickets` và `/api/sse/queue` KHÔNG còn thấy `customerName`/`phone` (P1, mới)
2. **Viết test cho `queue-service.ts`** — file rủi ro cao nhất, chưa có test; ưu tiên case restore-trùng-position + race 2 quầy cùng dịch vụ (P1)
3. **Thống nhất auth `/api/settings`** — GET public nhưng PUT tự check role, nên đẩy lên proxy (P1)
4. **SQLite `busy_timeout`** — `db.ts` không config; thêm `?connection_limit=1&socket_timeout=15` hoặc pragma `busy_timeout`; nếu >2-3 quầy song song → chuyển Postgres
5. **Cookie `secure` flag không nhất quán** — `api/auth/route.ts` check `NODE_ENV` + `x-forwarded-proto`; `demo-token` + `logout` chỉ check `NODE_ENV` — nên thống nhất
6. **Xóa field `date` trên Ticket** nếu không dùng (hiện không thấy trong schema — cần verify)
7. **Content-Security-Policy header** trong `next.config.ts` (P2)
8. **CI/CD** — GitHub Actions hoặc husky + lint-staged (P2)
9. **Xác nhận DB provider** cho production (SQLite vs PostgreSQL) + bật lại `.git`
10. **Fix 5 lỗi lint pre-existing** trong `src/app/(public)/get-ticket/page.tsx` (`no-explicit-any`)

---

## 3. Changelog theo phiên (APPEND-ONLY)

**Phiên 1** (acc lxn) — Audit kiến trúc toàn bộ. Phát hiện PII leak: `GET /api/tickets` + `/api/sse/queue` stream `customerName`/`phone` tới anonymous. Tạo `src/lib/api-auth.ts` với `authenticateOptional()` + đề xuất fix nhưng **KHÔNG merge vào code** (chỉ ghi nhận trong HANDOFF/INDEX). Findings mở: SQLite thiếu `busy_timeout`, cookie `secure` không nhất quán, queue-service chưa có test.

**Phiên 2** (acc skde) — Phát hiện phiên 1 báo "Hoàn thành" nhưng fix KHÔNG có trong code (grep: không nơi nào gọi `authenticateOptional`). Author 3 file fix: `tickets/route.ts` (`redactTicketsForRole`), `sse-broker.ts` (`redactForRole`, `QueueClient.role`, `subscribeQueue` nhận `role`), `sse/queue/route.ts` (truyền role). Quyết định: `broadcastDisplayCallLocal` giữ nguyên (cố ý). Snapshot lưu tại `conversations/archive/phien2/file changed/`. **Vẫn CHƯA merge.**

**Phiên 3** (opencode, 2026-08-06) — MERGE fix PII vào repo thật: 4 file (`api-auth.ts`, `tickets/route.ts`, `sse-broker.ts`, `sse/queue/route.ts`) + `tsconfig.json` thêm `"conversations"` vào `exclude` (snapshot trùng `declare global` phá type-check). Fix lint destructure-unused (`customerName: _customerName, phone: _phone`). Verify: `type-check` pass, lint sạch file đụng (5 lỗi pre-existing ở `get-ticket/page.tsx` giữ nguyên). Điểm rút kinh nghiệm: **sau khi AI author file, bắt buộc merge + verify vào `src/`, không để snapshot nằm im.**
