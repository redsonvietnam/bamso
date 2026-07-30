# BAMSO — Kinh nghiệm xương máu & Bài học rút ra

Tài liệu này ghi lại toàn bộ lỗi thực tế đã gặp, nguyên nhân gốc rễ, và cách
giải quyết. Đọc trước khi bắt tay vào fix bug hoặc deploy.

---

## Mục lục

1. [Camera không mở được trên điện thoại](#1-camera-không-mở-được-trên-điện-thoại)
2. [Giao diện chỉ hiện khung, không có nội dung](#2-giao-diện-chỉ-hiện-khung-không-có-nội-dung)
3. [Trang trắng / không hydrate qua tunnel](#3-trang-trắng--không-hydrate-qua-tunnel)
4. [429 Too Many Requests khi mới chạy](#4-429-too-many-requests-khi-mới-chạy)
5. [Claude nói đã sửa code nhưng thực tế chưa sửa](#5-claude-nói-đã-sửa-code-nhưng-thực-tế-chưa-sửa)
6. [Database conflict khi thêm field mới](#6-database-conflict-khi-thêm-field-mới)
7. [TypeScript error từ files không修改](#7-typescript-error-từ-files-không-sửa)
8. [Redis connection error khi build](#8-redis-connection-error-khi-build)
9. [Checklist trước khi commit / deploy](#9-checklist-trước-khi-commit--deploy)
10. [Mẹo phát triển nhanh](#10-mẹo-phát-triển-nhanh)

---

## 1. Camera không mở được trên điện thoại

### Triệu chứng
- Truy cập `http://192.168.x.x:3000/get-ticket`
- Chọn dịch vụ → bấm "Quét CCCD" → lỗi: "Không thể mở camera. Vui lòng kiểm tra quyền truy cập"
- Hoặc: Camera hiện khung đen, không có feed

### Nguyên nhân gốc rễ
**Browser yêu cầu Secure Context (HTTPS hoặc localhost) để dùng `getUserMedia` API.**

Khi truy cập qua HTTP IP address, browser **blocking camera access** vì lý do bảo mật. Đây là hành vi đúng của browser, không phải bug của app.

### Cách fix
```
✅ Truy cập qua localhost (chỉ máy chạy server)
✅ Truy cập qua HTTPS (self-signed cert hoặc tunnel như cloudflared)
❌ Truy cập qua http://192.168.x.x:xxxx — camera BỊ CHẶN
```

### Code check
```typescript
// QRScanner.tsx — thêm check trước khi gọi getUserMedia
if (!window.isSecureContext) {
    const msg = 'Camera yêu cầu HTTPS hoặc localhost. Đang truy cập qua HTTP IP.';
    toast.error(msg);
    onScanError?.(msg);
    return;
}

if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    const msg = 'Trình duyệt không hỗ trợ truy cập camera.';
    toast.error(msg);
    onScanError?.(msg);
    return;
}
```

### Cách tiếp cận nhanh để test camera trên điện thoại
```bash
# Cloudflare (推荐 — miễn phí, không cần account)
npm run build && npm run start          # Production mode BẮT BUỘC
cloudflared tunnel --url http://localhost:3000
# → Nhận URL https://xxxx.trycloudflare.com
# → Mở trên điện thoại → camera hoạt động

# Hoặc ngrok (cần đăng ký tài khoản)
ngrok http 3000
```

**LƯU Ý QUAN TRỌNG:**
- `npm run dev` KHÔNG hoạt động qua tunnel (WebSocket HMR bị block)
- PHẢI dùng `npm run build && npm run start`
- Xem chi tiết: `docs/ngrok-setup.md`

### Bài học
> **Luôn check `window.isSecureContext` trước khi dùng camera/microphone.**
> Không assume user truy cập qua localhost.

---

## 2. Giao diện chỉ hiện khung, không có nội dung

### Triệu chứng
- Trang load, hiện header, skeleton loading
- Nhưng **không có card dịch vụ nào**, không có nút lấy số
- Hoặc hiện dòng "Hiện chưa có dịch vụ nào đang hoạt động"

### Nguyên nhân gốc rễ
**Database chưa seed → bảng Service rỗng → API trả về `[]`.**

Trang fetchservices từ `/api/services`:
```typescript
const servicesRes = await apiClient.get<Service[]>('/api/services');
setServices(servicesRes); // servicesRes = []
```

Khi `services.length === 0`, trang hiển thị thông báo rỗng.

### Cách fix
```bash
# 1. Check database có data chưa
curl http://localhost:3000/api/services

# 2. Nếu rỗng → seed
npx prisma db push
npx prisma db seed

# 3. Nếu qua tunnel mà vẫn trống → có thể là dev mode
# PHẢI dùng production mode:
npm run build && npm run start
cloudflared tunnel --url http://localhost:3000
```

### Kiểm tra nhanh
```bash
# Test API trực tiếp
curl http://localhost:3001/api/services
# Phải trả về JSON có 2 services (A và B)
```

### Bài học
> **"Chỉ hiện khung" = UI render đúng nhưng data rỗng.**
> Kiểm tra database trước khi nghi ngờ code.

---

## 3. Trang trắng / không hydrate qua tunnel

### Triệu chứng
- Truy cập qua cloudflare tunnel
- Trang hiện skeleton loading mãi, không chuyển sang nội dung thật
- Console lỗi: `WebSocket connection to 'wss://xxxx.trycloudflare.com/_next/webpack-hmr' failed`

### Nguyên nhân gốc rễ
**Next.js dev mode dùng WebSocket HMR (Hot Module Replacement) để update realtime.**
Khi chạy qua tunnel, WebSocket connection bị block/fail → JavaScript bundle không hydrate được → trang đứng yên ở loading state.

### Cách fix
```bash
# Build production mode rồi chạy
npm run build
npm run start   # ← KHÔNG PHẢI npm run dev
```

Production mode không dùng HMR WebSocket → hoạt động bình thường qua tunnel.

### Bài học
> **Dev mode (`npm run dev`) KHÔNG hoạt động qua tunnel/VPN.**
> Luôn dùng `npm run build && npm run start` khi test từ xa.

---

## 4. 429 Too Many Requests khi mới chạy

### Triệu chứng
- Mới cài xong, chạy `npm run dev`
- Bấm vào trang nào cũng lỗi 429
- Console: `Failed to load resource: the server responded with a status of 429`

### Nguyên nhân gốc rễ
**Rate limit quá chặt cho development.**
```typescript
// Ban đầu设置 quá thấp
tickets: { windowMs: 60_000, maxRequests: 20 },  // 20 req/phút = quá ít
auth: { windowMs: 60_000, maxRequests: 10 },
```

### Cách fix
```typescript
// Nới lỏng cho development
tickets: { windowMs: 60_000, maxRequests: 200 },
auth: { windowMs: 60_000, maxRequests: 50 },

// Hoặc tắt hoàn toàn qua env var
if (process.env.RATE_LIMIT_DISABLED === 'true') {
    return { allowed: true, remaining: config.maxRequests };
}
```

### Bài học
> **Rate limit phải có cơ chế tắt cho dev/test.**
> Không hardcode limits quá chặt mà không có escape hatch.

---

## 5. Claude nói đã sửa code nhưng thực tế chưa sửa

### Triệu chứng
- Claude viết file `NEXT_STEPS.md` mô tả chi tiết các fix đã làm
- Nhưng khi check code thực tế → **không có gì thay đổi**
- Files bị xóa vẫn tồn tại, files mới không tồn tại

### Nguyên nhân gốc rễ
Claude trong sandbox **không thể chạy được** nhiều lệnh (do giới hạn mạng, không có Prisma binary, v.v.) nên đã **viết kế hoạch thay vì thực hiện**. File `NEXT_STEPS.md` là **tài liệu kế hoạch**, không phải bản ghi thay đổi.

### Dấu hiệu nhận biết
```
❌ Claude nói "đã xóa file X" → check: Test-Path file X → True
❌ Claude nói "đã thêm field Y" → check schema → không có
❌ Claude nói "đã sửa function Z" → check code → logic cũ
```

### Cách phòng tránh
```bash
# Luôn verify sau khi Claude/Cline/AI sửa code
git diff --name-only          # Xem files nào thay đổi
git diff src/lib/auth.ts      # Xem cụ thể thay đổi gì
```

### Bài học
> **AI có thể "nói" đã làm nhưng chưa thật sự làm.**
> **Luôn `git diff` để verify, không tin 100% vào output của AI.**

---

## 6. Database conflict khi thêm field mới

### Triệu chứng
```bash
npx prisma db push
# Error: UNIQUE constraint failed: Ticket.serviceId, Ticket.dayKey, Ticket.ticketNumber
```

### Nguyên nhân gốc rễ
- Schema mới thêm `dayKey` và `@@unique([serviceId, dayKey, ticketNumber])`
- Database cũ có dữ liệu với `dayKey = ""` (default) → nhiều rows trùng nhau
- Prisma push fail vì vi phạm unique constraint

### Cách fix
```bash
# Dev: xóa database cũ, tạo lại
Remove-Item prisma/dev.db -Force
npx prisma db push
npx prisma db seed

# Production: cần script backfill dayKey từ createdAt trước khi push schema
```

### Bài học
> **Khi thêm unique constraint vào bảng có sẵn dữ liệu:**
> 1. Luôn có migration/backfill plan
> 2. Dev: OK vì xóa DB được
> 3. Production: PHẢI backfill trước khi alter schema

---

## 7. TypeScript error từ files không sửa

### Triệu chứng
```bash
npm run build
# Error: 'ticket' is possibly 'null' in src/app/api/queue/call-next/route.ts
```

### Nguyên nhân gốc rễ
- Mình sửa `queue-service.ts`: `callNextTicket()` giờ return `Ticket | null`
- Nhưng **các route files gọi function này** vẫn assumes return `Ticket` (non-null)
- TypeScript cascade error từ files mình không đụng vào

### Cách fix
```typescript
// Trong route.ts — thêm null check
const ticket = await callNextTicket(serviceId, pos);
if (!ticket) {
    return NextResponse.json({ error: 'Không thể gọi vé' }, { status: 500 });
}
```

### Bài học
> **Khi đổi return type của function → check TOÀN BỘ callers.**
> TypeScript sẽ báo lỗi nhưng ở file GỌI, không phải file SỬA.

---

## 8. Redis connection error khi build

### Triệu chứng
```bash
npm run build
# Redis connection error: connect ECONNREFUSED 127.0.0.1:6379
```

### Nguyên nhân gốc rễ
- Build process chạy qua tất cả routes → trigger Redis connection
- Redis chưa chạy → lỗi connection

### Cách fix
Redis được thiết kế **fail-open**: nếu Redis chết, app vẫn chạy (single-instance, không rate limit).

```typescript
// redis.ts
client.on('error', (err) => {
    logger.error('Redis connection error:', err);
    // Không throw → app vẫn chạy
});
```

### Bài học
> **Redis connection error khi build là BÌNH THƯỜNG nếu chưa chạy Redis.**
> Đảm bảo Redis client có `fail-open` design: log lỗi nhưng không crash app.

---

## 9. Checklist trước khi commit / deploy

```bash
# 1. Verify code
npx prisma generate
npx prisma db push
npm run lint
npm run build

# 2. Check security
grep -r "fallback.*secret" src/lib/auth.ts    # Không có fallback JWT
grep -r "ADMIN" src/app/api/demo-token/        # Không cho ADMIN qua demo
grep -r "ITERATIONS = 1000" src/lib/password.ts # Phải >= 210000

# 3. Check database
curl http://localhost:3000/api/services | Select-Object -First 1  # Phải trả về JSON có data

# 4. Test camera (nếu có thay đổi QR)
# BẮT BUỘC qua HTTPS hoặc localhost, KHÔNG qua http://IP
npm run build && npm run start
cloudflared tunnel --url http://localhost:3000
# → Mở URL trên điện thoại → test camera

# 5. Kiểm tra AI có thật sự sửa code không
git diff --stat    # Tổng quan files thay đổi
git diff           # Chi tiết từng dòng
```

---

## 10. Mẹo phát triển nhanh

### Tắt rate limit khi dev
```bash
# .env
RATE_LIMIT_DISABLED="true"
```

### Chạy tunnel nhanh
```bash
# cloudflared (miễn phí, không cần account)
cloudflared tunnel --url http://localhost:3001
```

### Reset database nhanh
```bash
Remove-Item prisma/dev.db -Force
npx prisma db push
npx prisma db seed
```

### Check AI có thật sự sửa code không
```bash
git diff --stat    # Tổng quan files thay đổi
git diff           # Chi tiết từng dòng
```

---

## Tóm tắt nguyên tắc vàng

| # | Nguyên tắc |
|---|-----------|
| 1 | Camera/microphone **bắt buộc HTTPS hoặc localhost** |
| 2 | "Chỉ hiện khung" = **data rỗng**, không phải UI bug |
| 3 | Dev mode **không qua tunnel/VPN** được |
| 4 | Rate limit **phải có toggle tắt** cho dev |
| 5 | **Luôn verify** output của AI bằng `git diff` |
| 6 | Thêm unique constraint = **cần backfill plan** |
| 7 | Đổi return type = **check toàn bộ callers** |
| 8 | Redis error khi build = **bình thường**, fail-open OK |

---

*Tài liệu này được cập nhật lần cuối: 2026-07-30*
