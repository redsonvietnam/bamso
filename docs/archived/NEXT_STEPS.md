# BAMSO — Đã sửa & Còn lại

Cập nhật: 2026-07-29 — Sau khi implement thật sự tất cả các fix.

---

## 1. Đã sửa xong (commit trên nhánh `fix`)

| # | Vấn đề | File | Cách sửa |
|---|--------|------|----------|
| 1 | `/api/demo-token` cấp ADMIN | `src/app/api/demo-token/route.ts` | Chặn trừ khi `DEMO_MODE_ENABLED=true`; KHÔNG BAO GIỜ cấp ADMIN |
| 2 | SSML injection | `src/app/api/tts/route.ts` | `escapeForSsml()` trước khi build SSML |
| 3 | TTS không rate limit | `src/app/api/tts/route.ts` | Rate limit 100 req/phút/IP, text ≤ 500 ký tự |
| 4 | Không có rate limit module | `src/lib/rate-limit.ts` | Mới tạo, Redis-backed, fail-open, có toggle `RATE_LIMIT_DISABLED` |
| 5 | `ticketNumber` có thể trùng | `prisma/schema.prisma`, `src/lib/ticket-service.ts` | Thêm `dayKey`, `@@unique([serviceId, dayKey, ticketNumber])`, retry-on-conflict |
| 6 | PBKDF2 1000 vòng | `src/lib/password.ts` | Nâng 210k, `needsRehash()`, `timingSafeEqual` |
| 7 | Hash cũ yếu mãi | `src/app/api/auth/route.ts` | Auto-rehash khi login thành công |
| 8 | JWT_SECRET fallback | `src/lib/auth.ts` | Bỏ fallback, throw nếu thiếu, yêu cầu ≥32 ký tự ở production |
| 9 | Redis client trùng lặp | `src/lib/redis.ts` | Hợp nhất, thêm `retryStrategy`, `enableOfflineQueue:false` |
| 10 | Redis publish blocking | `src/lib/sse-broker.ts` | Best-effort publish, `.catch()` log lỗi, fail-open |
| 11 | Dead code | `redis-client.ts`, `pub-sub.ts`, `edge-tts-wrapper.js` | Đã xóa |
| 12 | Race condition `callNextTicket` | `src/lib/queue-service.ts` | `updateMany` conditional claim + retry |
| 13 | Race condition `completeTicket` | `src/lib/queue-service.ts` | Atomic: gộp check + update thành 1 `updateMany` |
| 14 | Race condition `skipTicket`/`restoreTicket` | `src/lib/queue-service.ts` | Guard: status phải khớp lúc đọc đầu transaction |
| 15 | Camera lỗi trên HTTP IP | `src/components/qr-scanner/QRScanner.tsx` | Thêm check `window.isSecureContext` + `navigator.mediaDevices` |
| 16 | Rate limit quá chặt | `src/lib/rate-limit.ts` | Tăng limits + thêm env `RATE_LIMIT_DISABLED` |
| 17 | Route files thiếu null check | `call-next/`, `complete/`, `skip/`, `restore/` | Thêm null check cho return từ queue-service |
| 18 | `.env` thiếu hướng dẫn | `.env.example` | Thêm JWT_SECRET, REDIS, DEMO_MODE_ENABLED, RATE_LIMIT_DISABLED |

---

## 2. Còn lại (P1 — nên làm)

| # | Việc | Ghi chú |
|---|------|---------|
| 1 | Viết test cho `queue-service.ts` | File rủi ro cao nhất, chưa có test |
| 2 | `/api/settings` auth không nhất quán | `GET` public nhưng `PUT` tự check `requireRole` — nên thống nhất ở middleware |
| 3 | Xóa field `date` trên Ticket | Không được đọc ở đâu, nên dùng `dayKey` thay thế |
| 4 | Thêm CI/CD | GitHub Actions hoặc git hook với `husky` + `lint-staged` |
| 5 | Content-Security-Policy header | Chưa có trong `next.config.ts` |

---

## 3. Kinh nghiệm rút ra

Xem [`docs/LESSONS-LEARNED.md`](docs/LESSONS-LEARNED.md) — ghi lại toàn bộ lỗi thực tế đã gặp và cách giải quyết.
