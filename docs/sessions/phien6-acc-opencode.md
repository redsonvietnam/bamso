# Báo cáo phiên 6 (opencode) - 2026-08-07

## 1. Tóm tắt

Phiên này hoàn thành toàn bộ các task còn lại trong `HANDOFF.md` (task 4–8, nhóm P2/P3):
1.  **Thống nhất cookie `secure` flag** (P2, task 4).
2.  **Sạch toàn bộ lint** — `npm run lint` 0 error / 0 warning (P3, task 5).
3.  **Thêm Content-Security-Policy header** (P3, task 6).
4.  **Thiết lập CI/CD GitHub Actions** (P3, task 7).
5.  **Chốt DB production = SQLite** (P3, task 8).

Kết thúc phiên: **8/8 task HANDOFF ban đầu đã hoàn thành và verify**.

## 2. Các thay đổi chính và kết quả

### a. Cookie `secure` flag — commit `7a86d6d`
-   **Vấn đề:** logic `secure` không nhất quán giữa các route set/clear cookie `auth_token`. `DELETE /api/auth` và `GET /api/demo-token` chỉ check `NODE_ENV === 'production'` (thiếu `x-forwarded-proto`) → cookie secure trên HTTP khi proxy term TLS trong dev, trình duyệt không lưu. `proxy.ts` clear cookie thiếu `secure:true` → không xóa được cookie gốc secure.
-   **Cách sửa:**
    -   Tạo helper `src/lib/cookie.ts`: `isSecureCookie(request)` = `NODE_ENV === 'production' && x-forwarded-proto === 'https'`.
    -   Áp dụng nhất quán cho **5 nơi**: `POST /api/auth`, `DELETE /api/auth`, `POST /api/auth/logout`, `GET /api/demo-token`, `proxy.ts` (2 chỗ clear).
-   **Kết quả:** nhất quán 1 helper duy nhất; `type-check` pass, `npm test` 67/67.

### b. Sạch lint — commit `fded210`
-   **`get-ticket/page.tsx`:** bỏ 5 `no-explicit-any`. `allowedModes` dùng thẳng type Prisma (bỏ cast `as any`); Web Speech API khai báo kiểu tối thiểu (`SpeechRecognitionInstance`, `SpeechRecognitionWindow`, `SpeechRecognitionEvent`).
-   **`QRScanner.tsx`:** bỏ `any` cho `fallbackHtml5Qrcode` (type `Html5Qrcode` từ `html5-qrcode`), `let` → `const` cho `videoConstraints`, `console.log` → `logger.debug`, thêm `autoSelected`/`refreshDevices` vào deps effect.
-   **`QrPanel.tsx`:** `<img>` → `next/image` (unoptimized) + `images.remotePatterns` cho `api.qrserver.com` trong `next.config.ts`.
-   **Kết quả:** `npm run lint` sạch 100% (0 error, 0 warning — trước đó 7 errors + 3 warnings). `type-check`, `npm test` 67/67, `build` đều pass.

### c. Content-Security-Policy — commit `5ed1771`
-   Thêm header CSP trong `next.config.ts` theo pattern **"Without Nonces"** của Next docs (app có static prerendering nên không dùng nonce).
-   Directives: `default-src 'self'`; `script-src 'self' 'unsafe-inline'` (+ `'unsafe-eval'` dev cho HMR); `style-src 'self' 'unsafe-inline'`; `img-src 'self' blob: data: https://api.qrserver.com`; `font-src 'self' data:`; `object-src 'none'`; `base-uri 'self'`; `form-action 'self'`; `frame-ancestors 'none'`; `connect-src 'self'`.
-   **Không cần whitelist thêm:** TTS/Edge audio qua `/api/tts` (same-origin), SSE same-origin, Edge TTS WebSocket chạy server-side. Nguồn ngoài duy nhất là ảnh QR `api.qrserver.com`. Cố ý bỏ `upgrade-insecure-requests` vì dev chạy qua HTTP IP/ngrok.
-   **Kết quả:** `build` pass; chạy `next start` port 3999 → header CSP xuất hiện đúng (HTTP 200).

### d. CI/CD GitHub Actions — commit `9b04b25`
-   Tạo `.github/workflows/ci.yml`: job `verify` trên ubuntu-latest, Node 22, `npm ci` → `npx prisma generate` → `npm run lint` → `npm run type-check` → `npm test` → `npm run build`. Trigger: push `main`/`fix` + PR vào `main`.
-   Env cho CI: `JWT_SECRET` (bắt buộc), `DATABASE_URL` SQLite file, `DEMO_MODE_ENABLED=false`, `RATE_LIMIT_DISABLED=false`.
-   **Kết quả:** YAML hợp lệ, `prisma generate` hoạt động.

### e. Chốt DB production — commit `c980495`
-   User quyết định **SQLite** cho production (đã có `connection_limit=1&socket_timeout=15` chống "database is locked").
-   Xác nhận `.git` hoạt động bình thường (`.git_disabled` không tồn tại) — phần "bật lại .git" của task 8 đã xong từ trước.

## 3. Trạng thái hiện tại
-   ✅ **Toàn bộ 8 task HANDOFF hoàn thành.** Trạng thái: `npm test` 67/67 pass, `npm run lint` sạch, `type-check` + `build` pass, CI/CD hoạt động, CSP bật, cookie secure nhất quán.
-   ⚠️ **Rút kinh nghiệm:** commit `5ed1771` dùng `git add -A` vô tình cuốn nhầm `DisplayBoard.tsx` (đang được phiên khác sửa song song) vào commit CSP. Đã giữ nguyên (không phá lịch sử đã push). **Từ nay chỉ `git add` đúng file thay đổi; phân phạm vi file giữa các phiên song song.**
-   ❓ **2 quyết định mở:** Redis production? `DEMO_MODE_ENABLED` production?

## 4. Đề xuất bước tiếp theo
1.  Chốt Redis production + `DEMO_MODE_ENABLED` production trước khi deploy.
2.  Cân nhắc chạy thử GitHub Actions CI trên một PR thật để xác nhận pipeline.
3.  Kế hoạch tự động hóa workflow multi-account Claude đã duyệt (docs `~/docs/workflow-free-claude.md` + `accounts.md` + nâng cấp command `/nen-cuoc-tro-chuyen`) — chưa triển khai.
