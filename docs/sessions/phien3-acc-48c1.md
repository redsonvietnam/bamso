# Phiên 3 — E2E test verify fix PII (chưa merge)

## Quyết định ưu tiên (đã chốt)
1. **Viết e2e test verify fix PII TRƯỚC hết** — lý do: fix PII đã bị báo "xong" 2 lần mà không vào code (phiên 1 nói xong nhưng không merge, phiên 2 phát hiện). Cần test tự động khóa cứng behavior để phiên 4 không phải tin lời khai.
2. Sau đó mới tới **unit test `queue-service.ts`** (file rủi ro cao nhất theo HANDOFF — transaction + race condition) — việc lớn hơn.
3. `/api/settings` auth + các P2 (CSP, CI/CD) để sau — không cấp bách.

## Pattern `scratch/e2e-test.mjs`
Plain `fetch`, KHÔNG có test framework, log tiếng Việt có emoji, `throw Error` khi fail, `process.exit(1)`.

## Đã làm — thêm 3 bước mới vào giữa flow gốc (giữ nguyên toàn bộ flow cũ)
Chèn vào `scratch/e2e-test.mjs` (dùng vé tạo ở bước 3 với `CUSTOMER_NAME = 'Kiểm thử tự động'`, `CUSTOMER_PHONE = '0909999999'`):

- **3b — Anonymous GET `/api/tickets`** (không cookie) → fail nếu `anonTicket.customerName === CUSTOMER_NAME || anonTicket.phone === CUSTOMER_PHONE` (LEAK PII)
- **4b — STAFF GET `/api/tickets`** (cookie `auth_token=` từ `GET /api/demo-token?role=STAFF`) → fail nếu **không** thấy PII thật (OVER-REDACT, regression check chống redact quá tay cho role hợp lệ)
- **4c — Anonymous SSE `/api/sse/queue`** → đọc 3 giây đầu (AbortController timeout 3000ms), fail nếu `sseBuffer.includes(CUSTOMER_NAME) || sseBuffer.includes(CUSTOMER_PHONE)`

## Giả định đã ghi rõ trong test
- `GET /api/tickets` trả mảng thẳng hoặc object có `.tickets`/`.data` — code: `Array.isArray(anonList) ? anonList : (anonList.tickets ?? anonList.data ?? [])`. Nếu response thật khác cấu trúc → sửa dòng `anonRows`.
- SSE đoán query param `?serviceId=` — nếu sai, test chỉ log cảnh báo ("Không đọc được dữ liệu nào"), KHÔNG fail cứng.
- 4c nếu không đọc được SSE trong 3s → chỉ cảnh báo, cần kiểm tra thủ công qua trình duyệt.

## Cách chạy
```bash
npm run dev   # server đang chạy
node scratch/e2e-test.mjs
```

## Trạng thái quan trọng
- Snapshot đã sửa nằm ở `conversations/archive/phien3/file changed/e2e-test.mjs` (11727 bytes).
- **CHƯA MERGE vào repo** — `scratch/e2e-test.mjs` hiện tại (6207 bytes) vẫn là bản gốc, không có 3b/4b/4c. (Lặp lại đúng pattern lỗi của phiên 1-2: author xong nhưng không merge.)
- Chưa chạy thử (chưa có server dev chạy lúc phiên đó).
