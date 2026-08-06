# Phiên 1 — Audit kiến trúc + fix PII leak

## Context
Queue Management System cho cơ quan hành chính công.

**Stack chốt:**
- Next.js 16.2.6 (App Router) + React 19 + TypeScript strict
- Prisma 6.3 ORM — SQLite (`prisma/dev.db`), có thể switch PostgreSQL qua `DATABASE_URL`
- Auth: `jose` JWT → HttpOnly cookie `auth_token`
- Real-time: SSE qua `src/lib/sse-broker.ts`
- State client: Zustand
- Redis: tùy chọn — rate-limit + cross-instance pub/sub (fail-open nếu thiếu)
- TTS: Google Translate TTS proxy + Web Speech API fallback
- UI: Tailwind CSS v4, Radix UI Select, Recharts, Sonner toast, Lucide icons

**Model dữ liệu chốt:**
- `User`: id, username, passwordHash (PBKDF2 210k rounds), name, role (ADMIN/STAFF/KIOSK/DISPLAY)
- `Ticket`: id, ticketNumber, dayKey (YYYY-MM-DD), serviceId, status (PENDING/CALLED/IN_PROGRESS/COMPLETED/MISSED), **position** (integer, dùng để sort — KHÔNG dùng createdAt), missCount, pos (quầy), calledAt, completedAt; unique([serviceId, dayKey, ticketNumber])
- `Service`: id, code, name, color, prefix, order, isActive, allowedModes
- `Settings`: key-value store

**Biến môi trường:**
```env
DATABASE_URL="file:./dev.db"   # hoặc postgresql://...
JWT_SECRET=">=32 ký tự"
# Tùy chọn:
REDIS_HOST=localhost
REDIS_PORT=6379
DEMO_MODE_ENABLED=false
RATE_LIMIT_DISABLED=false
```

**Lệnh chạy:**
```bash
run-local.bat          # Windows 1-click
npm run dev
npx prisma db push
npx prisma db seed
npm run build
npm run lint
npm run type-check
npm test
node scratch/e2e-test.mjs   # E2E, cần server đang chạy
```

---

## Findings từ audit code thật

### 🔴 BUG NGHIÊM TRỌNG — PII leak (ĐÃ FIX trong phiên này)

**Vấn đề:**
- `GET /api/tickets` — không có auth check trong route handler; `proxy.ts` whitelist `/api/tickets` bằng `startsWith` → **ai cũng gọi được**, trả về `customerName` + `phone` toàn bộ vé trong ngày.
- `GET /api/sse/queue` — public hoàn toàn; `sse-broker.ts` dòng 99-106 query `prisma.ticket.findMany` **không có `select`** → stream real-time tên + SĐT công dân tới bất kỳ client ẩn danh nào mở SSE.

**Fix đã làm:**
- Thêm `src/lib/api-auth.ts` — optional auth helper (không throw nếu chưa login, chỉ trả role/null).
- Sửa `src/app/api/tickets/route.ts` — GET vẫn public, nhưng chỉ trả `customerName`/`phone` cho STAFF/ADMIN đã đăng nhập; anonymous chỉ nhận `ticketNumber`, `status`, `position`, `serviceId`, `pos`.
- Sửa `src/lib/sse-broker.ts` + `src/app/api/sse/queue/route.ts` — lọc field theo role từng client SSE.

### 🟠 SQLite thiếu `busy_timeout` (CHƯA FIX)
`db.ts` khởi tạo `PrismaClient()` không config. SQLite chỉ 1 writer — 2 quầy bấm đồng thời có thể nhận `SQLITE_BUSY`. Fix: thêm `?connection_limit=1&socket_timeout=15` vào `DATABASE_URL` hoặc dùng pragma `busy_timeout` qua raw query. Nếu >2-3 quầy song song: chuyển Postgres.

### 🟢 `queue-service.ts` — thiết kế tốt hơn lo ngại ban đầu
- `callNextTicket` dùng **optimistic claim**: `updateMany` với `status: PENDING` rồi check `count === 0` để retry — chống 2 quầy gọi trùng vé đúng cách.
- `skipTicket`/`restoreTicket` dùng `updateMany({where: {status: expectedStatus}})` — optimistic locking đúng.
- **Lỗi nhỏ còn lại:** `restoreTicket` — 2 vé MISSED khôi phục đồng thời có thể tính cùng `newPos = min - 1` → trùng position, sai thứ tự nhẹ. Không mất vé, không lỗi crash.

### 🟡 Điểm nhỏ (chưa fix)
- Cookie `secure` flag không nhất quán: `api/auth/route.ts` check cả `NODE_ENV` lẫn `x-forwarded-proto`; `demo-token` + `logout` chỉ check `NODE_ENV`. Nên thống nhất.
- `pbkdf2Sync` block event loop ~100-200ms/login — ổn với vài chục cán bộ, cần đổi async nếu scale.

---

## Quyết định còn mở (chưa chốt)
- **DB production**: SQLite (schema hiện tại) hay PostgreSQL? README cũ nói Postgres nhưng `prisma/schema.prisma` dòng 9 `provider = "sqlite"`.
- **Redis production**: có cài không? Nếu không, rate-limit bị vô hiệu (fail-open).
- **`DEMO_MODE_ENABLED`** trên production: bật hay tắt?
- **`.git_disabled/`**: git bị tắt (thư mục `.git_disabled/` thay vì `.git/`) — cần bật lại.

---

## Việc cần làm tiếp (theo thứ tự)
1. Verify 3 file đã sửa (api-auth, tickets/route, sse-broker) — build + e2e-test.
2. Cấu hình `busy_timeout` SQLite hoặc chốt chuyển Postgres.
3. Viết test cho `queue-service.ts` — ưu tiên: restore-trùng-position, race 2 quầy cùng dịch vụ.
4. Đồng bộ logic `secure` cookie giữa các route auth.
5. Bật lại `.git`.

---

## Đã xong trước phiên này (18 fix, không cần làm lại)
demo-token không cấp ADMIN, SSML injection, rate-limit TTS, ticketNumber unique per day, PBKDF2 210k rounds, auto-rehash, JWT_SECRET bắt buộc, Redis dedup, SSE fail-open, race condition callNext/complete/skip/restore, dead code xóa, camera secure-context check, null check routes.
