# Phiên 2 — Phát hiện fix PII phiên 1 chưa merge + author 3 file fix

## Kết luận quan trọng nhất
Fix PII của phiên 1 **không thực sự có trong code** dù `INDEX.MD`/`phien1-acc-lxn.md` ghi "Hoàn thành". Kiểm tra thực tế trong zip:
- `lib/api-auth.ts` — `authenticateOptional()` **tồn tại** nhưng **không được import/dùng ở đâu cả**. Grep toàn project: chỉ thấy `requireRole` được dùng ở `stats`, `services`, `queue/*`, `settings`, `staff`; không route nào gọi `authenticateOptional`.
- `api/tickets/route.ts` GET — vẫn `prisma.ticket.findMany(...)` **không có `select`**, không check role, `NextResponse.json(tickets)` trả nguyên object → vẫn leak `customerName` + `phone` cho bất kỳ ai.
- `lib/sse-broker.ts` → `broadcastQueueUpdateLocal` — `findMany` không `select`, chỉ filter theo `client.serviceId` chứ không theo role → vẫn stream `customerName`/`phone` tới mọi client SSE ẩn danh.
- `api/sse/queue/route.ts` — hoàn toàn public, không gọi `authenticateOptional`.

## Fix đã author (3 file, đã sửa trong phiên)

### 1. `src/app/api/tickets/route.ts` (GET)
- Thêm `authenticateOptional()`; hàm `redactTicketsForRole<T extends { customerName?: string | null; phone?: string | null }>(tickets: T[], role: string | null)` — trả nguyên mảng nếu `role && STAFF_ROLES.includes(role)`, ngược lại `tickets.map(({ customerName, phone, ...rest }) => rest)`.
- `const STAFF_ROLES: string[] = [UserRole.ADMIN, UserRole.STAFF];`
- GET vẫn public (kiosk/màn hình chờ cần), POST không đổi (giữ rate-limit `checkRateLimit('tickets:${ip}', RATE_LIMITS.tickets)`).

### 2. `src/lib/sse-broker.ts`
- `QueueClient` thêm field `role?: string | null`.
- Thêm `redactForRole<T extends { customerName?: string | null; phone?: string | null }>(tickets: T[], role: string | null)` — `if (role && STAFF_ROLES.includes(role)) return tickets;` ngược lại strip `{ customerName, phone, ...rest }`.
- `subscribeQueue(id, controller, serviceId?, role?)` — lưu `role` theo từng client.
- `broadcastQueueUpdateLocal` — sau khi filter theo `client.serviceId`, áp `const safe = redactForRole(filtered, client.role ?? null);` rồi enqueue.

### 3. `src/app/api/sse/queue/route.ts`
- Import `authenticateOptional` từ `@/lib/api-auth`.
- `const session = await authenticateOptional();` → `subscribeQueue(clientId, controller, serviceId, session?.role ?? null);`
- `export const dynamic = 'force-dynamic';` (giữ nguyên).

## Quyết định có chủ đích (KHÔNG sửa)
- **`broadcastDisplayCallLocal` không đụng tới** — vẫn gửi `customerName` cho `displayClients` (màn hình gọi số công khai), vì đó là hành vi có chủ đích (đọc tên khi gọi khách), không phải leak. Payload `queueClients` của DISPLAY_CALL không chứa `customerName`, giữ nguyên.

## Ghi chú khi merge
- 3 file snapshot trong zip dùng `\r\n` (giống format gốc) — nếu editor strict về line-ending thì normalize theo convention repo.
- Việc merge vào repo thật **chưa hoàn thành trong phiên này** — đây là todo kế tiếp.
- Cần cập nhật `INDEX.MD`/note phiên trước để không còn ghi "Hoàn thành" khi thực tế chưa merge.
- Đề xuất: viết test hoặc thêm vào `e2e-test.mjs` để verify anonymous GET không còn thấy `customerName`/`phone`.
