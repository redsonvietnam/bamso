# BAMSO — Hồ Sơ Kỹ Thuật & Bảo Mật

> Tài liệu này mô tả hiện trạng triển khai BAMSO dựa trên mã nguồn, cấu hình, kiểm thử, và bằng chứng kỹ thuật đã được xác minh. Tài liệu không đưa ra các tuyên bố bảo mật, tuân thủ, hoặc vận hành không thể chứng minh từ kho mã nguồn hoặc môi trường triển khai.

**Phiên bản:** 1.0
**Cập nhật:** 2026-08-31
**Kho mã nguồn:** `https://github.com/redsonvietnam/bamso`
**Nhánh:** `main` — `0df9c42`

---

## Mục lục

1. [Tóm tắt điều hành](#1-tóm-tắt-điều-hành)
2. [Luồng nghiệp vụ](#2-luồng-nghiệp-vụ)
3. [Kiến trúc hệ thống](#3-kiến-trúc-hệ-thống)
4. [Công nghệ](#4-công-nghệ)
5. [Bảo mật](#5-bảo-mật)
6. [Kiến trúc dữ liệu CCCD QR](#6-kiến-trúc-dữ-liệu-cccd-qr)
7. [Thu nhỏ dữ liệu / Bảo mật thông tin](#7-thu-nhỏ-dữ-liệu--bảo-mật-thông-tin)
8. [Khả năng hoạt động cục bộ / Offline](#8-khả-năng-hoạt-động-cục-bộ--offline)
9. [HTTPS / Kiến trúc Camera](#9-https--kiến-trúc-camera)
10. [Độ tin cậy / Phục hồi](#10-độ-tin-cậy--phục-hồi)
11. [Kiểm thử & Chất lượng kỹ thuật](#11-kiểm-thử--chất-lượng-kỹ-thuật)
12. [Sẵn sàng triển khai](#12-sẵn-sàng-triển-khai)
13. [Mô hình mối đe dọa](#13-mô-hình-mối-đe-dọa)
14. [Vì sao BAMSO có lợi thế](#14-vì-sao-bamso-có-lợi-thế)
15. [Hạn chế đã biết](#15-hạn-chế-đã-biết)
16. [Chỉ mục bằng chứng](#16-chỉ-mục-bằng-chứng)

---

## 1. Tóm tắt điều hành

**BAMSO** là ứng dụng web quản lý hàng đợi.ticket cho cơ quan công an tỉnh. Hệ thống cho phép công dân đến liên hệ lấy số thứ tự, nhân viên quầy xử lý yêu cầu, và quản trị viên theo dõi thống kê — tất cả trên giao diện trình duyệt.

**Đối tượng sử dụng:**
- **Công dân:** Lấy số qua kiosk (chọn dịch vụ → quét CCCD hoặc lấy nhanh)
- **Cán bộ/Staff:** Xử lý hàng đợi (gọi số, hoàn thành, bỏ qua, khôi phục)
- **Quản trị viên:** Quản lý dịch vụ, nhân viên, cài đặt, thống kê
- **Màn hình hiển thị:** Hiển thị số đang gọi cho khu vực chờ

**Các thành phần chính:**
- Ứng dụng web Next.js (frontend + API)
- SQLite (cơ sở dữ liệu cục bộ)
- Redis (tùy chọn — rate limiting, SSE pub/sub đa instace)
- QR scanner (quét CCCD công dân)
- TTS (đọc số bằng giọng nói)
- SSE (cập nhật real-time)

**Vì sao triển khai cục bộ phù hợp:** BAMSO xử lý dữ liệu hành chính công tại một địa điểm vật lý. Triển khai cục bộ trên máy Windows tại cơ quan giúp kiểm soát dữ liệu, giảm độ trễ, và hoạt động độc lập với Internet.

---

## 2. Luồng nghiệp vụ

### 2.1 Công dân lấy số

```
Công dân đến → Chọn dịch vụ (kiosk/get-ticket)
   ├── [Nhanh] → Tạo vé ngay (không cần tên)
   ├── [Thủ công] → Nhập tên + SĐT tùy chọn → Tạo vé
   └── [QR] → Quét CCCD → Parse tên → Xác nhận → Tạo vé
         ↓
   Hiển thị số phiếu + chờ gọi
```

### 2.2 Nhân viên xử lý

```
Staff đăng nhập → Chọn quầy (pos)
   → Gọi số tiếp theo (call-next)
   → Phục vụ (in-progress)
   → Hoàn thành (completed) / Bỏ qua (missed)
   → Khôi phục vé nhỡ lượt (restore)
```

### 2.3 Quản trị viên

```
Admin đăng nhập → Quản lý dịch vụ / nhân viên / cài đặt
   → Xem thống kê (theo ngày, giờ cao điểm, CSV export)
   → Dọn dẹp vé cũ (bulk cleanup)
   → Cấu hình TTS, theme, hiển thị
```

### 2.4 Hiển thị

```
Màn hình hiển thị → Kết nối SSE
   → Nhận cập nhật real-time khi có vé mới/gọi số
   → Hiển thị số đang gọi, số tiếp theo
```

---

## 3. Kiến trúc hệ thống

```
┌─────────────────────────────────────────────┐
│            Browser Clients                   │
│  (Kiosk / Get-ticket / Admin / Display)      │
└──────────────────┬──────────────────────────┘
                   │ HTTP / SSE
                   ▼
┌─────────────────────────────────────────────┐
│         BAMSO Web Application                │
│         (Next.js 16 — App Router)            │
├─────────────────────────────────────────────┤
│  Frontend (React 19 + Tailwind CSS 4)       │
│  API Routes (Next.js Route Handlers)        │
│  SSE Broker (Server-Sent Events)            │
│  Middleware (none — auth per-route)          │
├─────────────────────────────────────────────┤
│  Business Services                           │
│  ├── ticket-service (tạo vé, mutex lock)    │
│  ├── queue-service (gọi, bỏ qua, khôi phục)│
│  ├── sse-broker (real-time push)            │
│  └── tts-service (đọc số)                   │
├─────────────────────────────────────────────┤
│  Prisma ORM                                  │
├─────────────────────────────────────────────┤
│  SQLite (file: ./dev.db)                    │
└─────────────────────────────────────────────┘
         │ (tùy chọn)
         ▼
┌─────────────────────────────────────────────┐
│  Redis (rate limiting + SSE pub/sub)        │
│  Không bắt buộc — fail-open nếu mất kết nối│
└─────────────────────────────────────────────┘
```

**Frontend/Backend boundary:** Next.js monolith — frontend (React components) và backend (API route handlers) nằm cùng thư mục `src/`. Frontend gọi API qua `apiClient` (fetch wrapper). Không có tách biệt server/client rõ ràng — tất cả nằm trong cùng process Node.js.

**Data flow:**
1. Browser gửi HTTP request đến API route
2. API route xác thực (nếu cần), validate, xử lý business logic
3. Business logic gọi Prisma ORM → SQLite
4. Kết quả trả về browser
5. SSE broker push cập nhật real-time đến các client đang kết nối

---

## 4. Công nghệ

| Thành phần | Công nghệ | Lý do |
|---|---|---|
| Framework | Next.js 16.2.6 (App Router, Turbopack) | SSR/SSG, API routes, hot reload |
| Ngôn ngữ | TypeScript 5 | Type safety, refactor an toàn |
| Frontend | React 19.2.4 + Tailwind CSS 4 | Component model, utility CSS |
| UI components | Radix UI (Select, Radio, Switch) | Accessibility, unstyled primitives |
| Database | SQLite (file-based) | Đơn giản, không cần server riêng |
| ORM | Prisma 6.3.0 | Type-safe queries, migration |
| Auth | jose (JWT HS256) + PBKDF2 password | Chuẩn ngành, không tùy biến |
| Real-time | SSE (Server-Sent Events) | Đơn giản hơn WebSocket, sufficient |
| Redis | ioredis (optional) | Rate limiting, pub/sub đa instance |
| QR Scanner | html5-qrcode + BarcodeDetector API | Fallback strategy, browser-native |
| QR Display | qrcode.react | Tạo QR code cho URL |
| TTS | Web Speech API + Edge TTS fallback | Local-first, không cần API key |
| Testing | Vitest 4.1.8 + jsdom | Nhanh, ESM-native |
| Linting | ESLint 9 + eslint-config-next | Code quality gate |
| Build | Turbopack (Next.js built-in) | Build nhanh hơn Webpack |

---

## 5. Bảo mật

### 5.1 Xác thực (Authentication)

**Cơ chế:** JWT (HS256) trong HTTP-only cookie.

| Thuộc tính | Giá trị | Nguồn |
|---|---|---|
| Cookie name | `auth_token` | `src/app/api/auth/route.ts:9` |
| Max age | 24 giờ | `src/app/api/auth/route.ts:10` |
| HttpOnly | `true` | `src/app/api/auth/route.ts:67` |
| Secure | Tùy environment + `x-forwarded-proto` | `src/lib/cookie.ts:6-7` |
| SameSite | `lax` | `src/app/api/auth/route.ts:69` |
| JWT algorithm | HS256 | `src/lib/auth.ts:24` |
| Secret | `JWT_SECRET` env var (≥32 chars in prod) | `src/lib/auth.ts:10-12` |

**Login flow:**
1. POST `/api/auth` với `{ username, password }`
2. Kiểm tra rate limit (Redis-backed, 50 req/phút)
3. Tìm user trong DB, verify password (PBKDF2 + timingSafeEqual)
4. Tự động rehash nếu password cũ dùng iterations thấp
5. Sign JWT, set HTTP-only cookie
6. Trả về `{ success: true, user: { id, username, name, role } }`

**Session verification:** GET `/api/auth/me` — đọc cookie, verify JWT, trả về user info.

**Logout:** Xóa cookie `auth_token`.

**Đánh giá:** Xác thực JWT + HTTP-only cookie là cơ chế chuẩn ngành. Không có session storage server-side — JWT tự chứa thông tin. Nếu cần revoke token trước khi hết hạn, cần thêm blacklist (hiện chưa có).

### 5.2 Phân quyền (Authorization / RBAC)

**Vai trò:** `ADMIN`, `STAFF`, `KIOSK`, `DISPLAY` (`src/lib/constants.ts:1-6`)

**Server-side authorization:**
- `requireRole(...allowedRoles)` — kiểm tra JWT cookie + role (`src/lib/api-auth.ts:61-77`)
- `authenticateOptional()` — best-effort, không trả lỗi nếu chưa đăng nhập
- Các route bảo vệ: `/api/staff`, `/api/services` (PUT), `/api/settings` (PUT), `/api/tickets` (DELETE)

**UI hiding vs server-side:** Frontend ẩn nút/functionality dựa trên role, nhưng server-side authorization mới là ranh giới bảo mật thực sự. Nếu client gửi request trực tiếp đến API mà không có role phù hợp, server trả 403.

**Kết luận:** Phân quyền được thực hiện ở cả hai tầng. Server-side là ranh giới bảo mật chính.

### 5.3 Validate đầu vào (Input Validation)

| Khu vực | Validation | Nguồn |
|---|---|---|
| Ticket creation | `serviceId` bắt buộc, string, không rỗng | `api/tickets/route.ts:40-45` |
| Customer name | string, không rỗng, max 100 ký tự | `api/tickets/route.ts:47-66` |
| Phone | string, max 20 ký tự | `api/tickets/route.ts:54-73` |
| Staff creation | username/password/name bắt buộc, password ≥ 8 ký tự | `api/staff/route.ts` |
| Settings update | Key phải nằm trong `PUBLIC_SETTINGS_KEYS` hoặc cần ADMIN | `api/settings/route.ts:29-34` |
| Allowed modes | JSON array, chỉ chứa `quick`, `manual`, `qr` | `lib/api-validation.ts:67-90` |
| QR-derived input | Tên từ CCCD — chỉ validate cơ bản (string, max length) | Frontend only |
| Request body | JSON object check | `lib/api-validation.ts:5-27` |

**Hạn chế:** Validate QR-derived input chỉ xảy ra ở frontend. Backend không validate format CCCD — chấp nhận bất kỳ string nào gửi lên làm `customerName`. Đây là BY DESIGN (không xác thực danh tính), nhưng cần lưu ý.

### 5.4 Bảo mật Database

- **SQLite:** File-based, nằm cùng thư mục dự án (`file:./dev.db`)
- **Prisma ORM:** Type-safe queries, không có raw SQL trong codebase
- **Connection:** `connection_limit=1`, `socket_timeout=5` (phù hợp SQLite)
- **Không có encryption-at-rest** — SQLite không hỗ trợ native encryption
- **Không có backup tự động** — cần quyết định triển khai

### 5.5 Bảo mật Browser

**Content-Security-Policy (CSP):**
```
default-src 'self'
script-src 'self' 'unsafe-inline' (+'unsafe-eval' in dev)
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com
img-src 'self' blob: data: https://api.qrserver.com
connect-src 'self'
frame-ancestors 'none'
object-src 'none'
base-uri 'self'
form-action 'self'
```
Nguồn: `next.config.ts:7-18`

**Đánh giá CSP:**
- `frame-ancestors 'self'` — chặn clickjacking
- `object-src 'none'` — chặn plugin Flash/Silverlight
- `connect-src 'self'` — chỉ cho phép fetch đến cùng origin
- `unsafe-inline` cho scripts — cần thiết cho Next.js hydration, chấp nhận được

**XSS:**
- `escapeHtml()` utility trong `src/lib/utils.ts` — escape `& < > " '`
- React mặc hiểm escape JSX — XSS thường khó xảy ra trừ khi dùng `dangerouslySetInnerHTML`
- Không tìm thấy `dangerouslySetInnerHTML` trong codebase

**Cookie security:** HTTP-only, SameSite=lax, secure khi chạy qua HTTPS (xác định bởi `x-forwarded-proto` header hoặc request URL protocol).

### 5.6 Production Security Hardening (WS-56)

**Mục tiêu:** Loại bỏ credentials mặc định, bảo vệ secrets, cấu hình firewall.

#### Credential Policy

| Hành vi | Trạng thái | Ghi chú |
|---|---|---|
| Seed credentials | Chỉ development | `prisma/seed.ts` tạo default accounts |
| Known default passwords | **KHÔNG an toàn cho production** | `admin@2026`, `canbo1@123`, etc. |
| Password change | Qua Admin panel → Staff management | ADMIN có thể tạo/sửa user |
| Production requirement | **Phải thay đổi default passwords** | Deployment-time operational procedure |

#### JWT Secret Policy

| Hành vi | Trạng thái | Evidence |
|---|---|---|
| Source | `JWT_SECRET` env var | `auth.ts:6` |
| Minimum length | 32 chars (production enforced) | `auth.ts:10-12` |
| Known dev secret | **BỊ CHẶN trong production** | `server.js` startup check |
| Committed to Git | `.env` is gitignored | `.gitignore:36` |
| Secret in logs | KHÔNG | Không có logging secret |

#### HTTPS PFX Password Policy

| Hành vi | Trạng thái | Evidence |
|---|---|---|
| Default | `bamso2026` | `server.js:24` |
| Configurable | `HTTPS_PFX_PASSWORD` env var | `server.js:24` |
| Production warning | Console warning if default used | `server.js` |
| Committed to Git | NO (`certs/` gitignored) | `.gitignore:54` |

#### Rate Limiting

| Hành vi | Trạng thái | Evidence |
|---|---|---|
| Implementation | Redis-backed (fail-open) | `rate-limit.ts:14-49` |
| Auth rate limit | 50 req/phút | `rate-limit.ts:67` |
| Disable flag | `RATE_LIMIT_DISABLED=true` | `.env:4` |
| Production | **PHẢI BẬT** — xóa `RATE_LIMIT_DISABLED` hoặc set `false` | Deployment-time |

#### Windows Firewall

Script triển khai: `scripts/setup-firewall.ps1`
- ALLOW TCP 3443 (HTTPS) từ LAN subnet
- ALLOW TCP 3000 (HTTP redirect) từ LAN subnet
- BLOCK TCP 3443/3000 từ WAN/external
- Không disable Windows Firewall

#### SQLite File Protection

- File: `prisma/dev.db` (+ `dev.db-wal`, `dev.db-shm`)
- ACL: Chỉ BAMSO process account và administrators
- Triển khai: Manual Windows ACL configuration khi deploy

---

## 6. Kiến trúc dữ liệu CCCD QR

### 6.1 Luồng dữ liệu

```
CCCD QR (pipe-delimited string)
   │
   ▼
Camera (getUserMedia → video stream)
   │
   ▼
QR Decoder (BarcodeDetector API / html5-qrcode fallback)
   │
   ▼
Raw QR string (ephemeral — không lưu lại)
   │
   ▼
CCCD Parser (parseCCCDName → chỉ lấy fullName)
   │
   ▼
customerName (string)
   │
   ▼
Ticket API (POST /api/tickets { serviceId, customerName })
   │
   ▼
Prisma → SQLite (Ticket.customerName: String?)
```

### 6.2 Xử lý dữ liệu

| Giai đoạn | Dữ liệu | Lưu trữ? |
|---|---|---|
| Camera capture | Video stream | Không |
| QR decode | Raw QR string | Không (ephemeral) |
| CCCD parser | `fullName` (string) | Không (trong bộ nhớ React) |
| API request | `{ serviceId, customerName }` | — |
| Backend validate | Kiểm tra string, max 100 chars | Không |
| Database | `Ticket.customerName` | **Có** |

### 6.3 Trường dữ liệu CCCD

Định dạng QR CCCD:
```
[ID_NUMBER]|[FULL_NAME]|[DATE_OF_BIRTH]|[GENDER]|[NATIONALITY]|[ISSUE_DATE]
```

| Trường | Đọc từ QR | Lưu vào DB | Hiển thị | Ghi log |
|---|---|---|---|---|
| Raw QR payload | Có (tạm thời) | Không | Không | Không |
| ID number | Không (dead code) | Không | Không | Không |
| Full name | **Có** | **Có** | **Có** | Không |
| Date of birth | Không (dead code) | Không | Không | Không |
| Gender | Không (dead code) | Không | Không | Không |
| Nationality | Không (dead code) | Không | Không | Không |
| Issue date | Không (dead code) | Không | Không | Không |

**Lưu ý:** Hàm `parseFullCCCDData()` tồn tại trong `cccd-parser.ts` nhưng KHÔNG BAO GIỜ được gọi từ mã sản xuất. Chỉ có `parseCCCDName()` (trích xuất tên) được sử dụng.

### 6.4 Khẳng định quan trọng

> **Trích xuất CCCD QR KHÔNG PHẢI xác thực danh tính.**

Hệ thống chỉ đọc dữ liệu từ QR code và sử dụng tên làm nhãn trên phiếu. Không có:
- Xác thực chữ ký số CCCD
- Kiểm tra chứng chỉ
- Kiểm tra thu hồi
- Xác minh tính xác thực CCCD

**Không tồn tại:** QR login, QR authentication, QR credentials, QR session tokens.

---

## 7. Thu nhỏ dữ liệu / Bảo mật thông tin

| Dữ liệu | Đọc | Gửi backend | Lưu DB | Mục đích |
|---|---|---|---|---|
| Raw QR payload | Có | Không | Không | Decode tạm thời |
| Tên đầy đủ | Có | Có | **Có** | Nhận diện phiếu |
| Số CCCD | Không (dead code) | Không | Không | Không cần |
| Ngày sinh | Không (dead code) | Không | Không | Không cần |
| Giới tính | Không (dead code) | Không | Không | Không cần |
| Quốc tịch | Không (dead code) | Không | Không | Không cần |
| Ngày cấp | Không (dead code) | Không | Không | Không cần |
| Số điện thoại | Nhập tay (tùy chọn) | Có | **Có** | Liên hệ (tùy chọn) |

**Kết luận:** Hệ thống đã thực hành thu nhỏ dữ liệu (data minimization). Chỉ có tên và SĐT (tùy chọn) được lưu trữ. Các trường CCCD khác không được trích xuất trong sản phẩm.

**Vì sao thu nhỏ dữ liệu quan trọng:** Giảm thiểu tác động nếu cơ sở dữ liệu bị truy cập trái phép. Dữ liệu CCCD nhạy cảm (số CMND/CCCD, ngày sinh) không tồn tại trong hệ thống.

---

## 8. Khả năng hoạt động cục bộ / Offline

### 8.1 Độc lập Internet

| Chức năng | Cần Internet? | Ghi chú |
|---|---|---|
| Quét QR (BarcodeDetector) | **Không** | API native của trình duyệt |
| Quét QR (html5-qrcode) | **Không** | Library bundled trong JS |
| Parse CCCD | **Không** | Xử lý string thuần |
| Tạo phiếu (API) | **Có** | Cần kết nối đến backend |
| Cập nhật hàng đợi (SSE) | **Có** | Cần kết nối network |
| TTS (Web Speech) | **Không** | Local browser capability |
| Hiển thị QR code | **Không** | Tạo client-side |

### 8.2 Phụ thuộc LAN

| Tình huống | Kết quả |
|---|---|
| Một thiết bị, không có LAN | Hoạt động (nếu backend chạy localhost) |
| Nhiều thiết bị, có LAN | Hoạt động bình thường |
| Nhiều thiết bị, mất LAN | **Mất kết nối** — kiosk/staff không thể gửi request đến server |

### 8.3 Phụ thuộc Server

Nếu server BAMSO không khả dụng:
- Kiosk/get-ticket: Không thể tạo phiếu
- Staff: Không thể gọi/xử lý phiếu
- Display: Mất cập nhật real-time
- Admin: Không thể truy cập

### 8.4 Yêu cầu Trình duyệt

- **Camera (QR scan):** Cần secure context (HTTPS hoặc localhost)
- **TTS:** Web Speech API (hỗ trợ rộng rãi)
- **SSE:** EventSource API (hỗ trợ rộng rãi)
- **JavaScript:** Bắt buộc

### 8.5 Kết luận

```
Internet
   └── TÙY CHỌN cho hoạt động cục bộ cơ bản

LAN
   └── BẮT BUỘC cho hoạt động đa thiết bị

Server BAMSO
   └── PHỤ THUỘC CỐT LÕI cho trạng thái hàng đợi chung
```

---

## 9. HTTPS / Kiến trúc Camera

### 9.1 Yêu cầu Secure Context

`QRScanner.tsx:150-154` kiểm tra `window.isSecureContext`:
- **localhost:** Được coi là secure context → camera hoạt động
- **LAN HTTP (192.168.x.x:3000):** KHÔNG phải secure context → camera BỊ CHẶN
- **HTTPS (192.168.x.x:3443):** Secure context → camera hoạt động

### 9.2 Hạn chế LAN HTTP

Đây là hạn chế của TRÌNH DUYỆT, không phải của ứng dụng. Tất cả các trình duyệt hiện đại đều chặn `getUserMedia` trên HTTP (trừ localhost).

### 9.3 Triển khai HTTPS (WS-55B)

**Cơ chế:** Custom Node.js HTTPS server (`server.js`) wrapping Next.js.

```
server.js
├── HTTPS server (port 3443) — primary client-facing
├── HTTP server (port 3000) — redirects to HTTPS
├── Certificate: self-signed PFX from certs/bamso.pfx
└── Fallback: plain HTTP if no certificate found
```

**Khởi động:**
```bash
# Generate certificate (PowerShell)
powershell -ExecutionPolicy Bypass -File scripts/generate-cert.ps1 -ServerIP 192.168.x.x

# Start HTTPS server
npm run start:https
# hoặc: node server.js
```

**Certificate:**
- Self-signed, RSA 2048, SHA256, validity 10 years
- DNS SAN: `BAMSO-Internal`, `localhost`
- IP SAN: cần PowerShell 7+ hoặc OpenSSL (PS 5.1 chỉ hỗ trợ DNS SAN)
- PFX file: `certs/bamso.pfx` (không commit vào git)
- Password: configurable qua `HTTPS_PFX_PASSWORD` env var

**Port:**
- 3443 (HTTPS) — client-facing, camera hoạt động
- 3000 (HTTP) — redirect to HTTPS hoặc health check nội bộ

### 9.4 Certificate Trust

Certificate tự ký cần được trust trên client machines để tránh browser warning:
1. Copy `certs/bamso.pfx` đến từng client machine
2. Double-click → Install Certificate → Local Machine → Trusted Root Certification Authorities
3. Hoặc dùng Group Policy để distribute

**KHÔNG yêu cầu Internet** — TLS terminates tại BAMSO server, certificate là cục bộ.

### 9.5 Camera hoạt động

```
https://192.168.x.x:3443  ← Camera HOẠT ĐỘNG (secure context)
http://192.168.x.x:3000   ← Camera BỊ CHẶN (redirect to HTTPS)
localhost:3000             ← Camera hoạt động (dev/test only)
```

**Lưu ý:** Internal HTTPS (self-signed certificate) KHÔNG yêu cầu Internet. Đây là TLS cục bộ trên LAN.

---

## 10. Độ tin cậy / Phục hồi

### 10.1 Xử lý lỗi API

- Tất cả API routes có `try/catch` wrapper
- Lỗi được log qua `logger.error()`
- Client nhận lỗi message đã sanitize (không leak internal details)
- `sanitizeApiError()` map lỗi known → message an toàn (`lib/api-validation.ts:40-61`)

### 10.2 Xử lý lỗi Frontend

- Toast notification cho lỗi user-facing (`sonner`)
- Loading states cho async operations
- Error boundaries không được implement rõ ràng (React default)

### 10.3 SSE / Real-time

- SSE broker tự động unsubscribe khi client disconnect
- Redis pub/sub fail-open: mất Redis → chạy single-instance
- Tự động reconnect ở phía client (EventSource API)

### 10.4 Queue Concurrency

- Mutex lock per counter (`createMutex()`) prevents race condition khi gọi số
- Service-level lock cho skip/restore
- Retry logic cho ticket creation (P2002 unique constraint violation)

### 10.5 Server Restart

- SQLite: Dữ liệu persist trên disk — survives restart
- In-memory state (SSE connections): Mất khi restart — client cần reconnect
- Redis: Rate limit counters reset khi restart Redis

### 10.6 Graceful Degradation

| Tình huống | Hành vi |
|---|---|
| Redis mất | Rate limiting bypass (fail-open), SSE single-instance |
| Camera không khả dụng | Hiển thị lỗi, gợi ý "lấy số nhanh" |
| TTS không khả dụng | Fallback sang Web Speech API |
| Network mất | API calls fail, user thấy toast error |

### 10.7 Backup & Recovery (WS-57)

**Mục tiêu:** Backup SQLite database an toàn, consistent, có thể restore trên Windows production.

#### Kiến trúc Backup

| Thành phần | Chi tiết |
|---|---|
| Script | `scripts/backup-db.py` (Python 3, standard library) |
| Consistency | SQLite online backup API (`sqlite3.backup()`) — consistent snapshot ngay cả khi server đang chạy |
| Journal mode | DELETE (không phải WAL) — xác nhận qua Prisma query |
| Source | `prisma/dev.db` (resolved từ `DATABASE_URL`) |
| Destination | `backups/bamso_YYYYMMDD_HHmmss.db` |
| Retention | 30 ngày (default) |
| Frequency | Daily qua Windows Task Scheduler |
| Internet | Không yêu cầu |

#### Quy trình Backup

```
1. Mở source DB (read-only)
2. Tạo destination DB
3. Gọi sqlite3.backup() — SQLite online backup API
4. Đóng connections
5. Verify backup: exists, size > 0, PRAGMA integrity_check = ok
6. Apply retention: xóa backup > 30 ngày
7. Log kết quả
```

#### Integrity Verification

```
backup exists → size > 0 → PRAGMA integrity_check → PASS/FAIL
```

#### Retention Policy

- Chỉ xóa file matching `bamso_YYYYMMDD_HHmmss.db`
- Nếu backup hôm nay fail → KHÔNG xóa backup cũ
- Nếu retention cleanup fail → log warning

#### Restore Procedure

Script: `scripts/restore-db.py`
- Yêu cầu explicit confirmation (`type 'RESTORE'`)
- Backup current DB trước khi restore (safety net)
- Verify backup integrity trước khi restore
- Stop BAMSO server → Replace DB → Verify → Restart
- **KHÔNG tự ý restore trong workstream này**

#### Task Scheduler

Script: `scripts/install-backup-task.ps1`
- Task name: "BAMSO Daily Backup"
- Schedule: Daily at 02:00
- Working directory: project root
- Log: `logs/backup-task.log`
- **DEPLOYMENT-TIME**: Chưa install trên production

#### npm Scripts

| Script | Command |
|---|---|
| `npm run backup` | `python scripts/backup-db.py` |
| `npm run backup:verify` | `python scripts/backup-db.py --dry-run` |
| `npm run restore` | `python scripts/restore-db.py --backup <file>` |
| `npm run backup:install-task` | Install Task Scheduler |

#### Recovery Drill

Đã thực hiện non-production recovery drill:
- Tạo backup → Copy to temp → Integrity check → Inspect schema/data → PASS
- Classification: **CODE-VERIFIED** (chưa phải PRODUCTION-VERIFIED)

#### Security

- Backup script KHÔNG log secrets (JWT_SECRET, passwords, tokens)
- Backup location: `backups/` — gitignored
- ACL đề xuất: BAMSO service account = Modify, Administrators = Full Control

#### Failure Matrix

| Failure | Behavior |
|---|---|
| DB missing | FAIL |
| DB locked/busy | FAIL gracefully (sqlite3.backup handles this) |
| Destination unavailable | FAIL |
| Disk full | FAIL |
| Backup zero bytes | FAIL |
| Integrity check fails | FAIL |
| Retention fails | WARN |
| Old backups absent | PASS (no-op) |
| Backup directory absent | create automatically |
| Internet unavailable | backup still works |
| BAMSO server offline | backup still works (offline backup) |

#### Limitations

- Python required on production machine
- No encryption-at-rest for backup files
- No remote/offsite backup (by design — local-first)
- Task Scheduler installation requires manual step
- Recovery drill is CODE-VERIFIED, not PRODUCTION-VERIFIED

---

## 11. Kiểm thử & Chất lượng kỹ thuật

### 11.1 Kết quả hiện tại

| Chỉ số | Giá trị |
|---|---|
| Test files | 33 passed, 1 skipped |
| Tests | 363 passed, 2 skipped |
| Typecheck (`tsc --noEmit`) | 0 errors |
| Lint (`eslint --max-warnings=0`) | 0 warnings |
| Build (`next build`) | Pass |
| Source files (TS/TSX) | ~147 files |

### 11.2 Phân bổ kiểm thử

| Khu vực | Test file | Tests |
|---|---|---|
| API validation | `api-validation.test.ts` | 26 |
| Settings API | `settings/route.test.ts` | 32 |
| Ticket API | `tickets/route.test.ts` | 20 |
| Queue validation | `queue/validation.test.ts` | 13 |
| Auth | `auth.test.ts` + `auth/route.test.ts` | 20 |
| SSE broker | `sse-broker.test.ts` | 18 |
| Queue service | `queue-service.test.ts` + variants | 27 |
| TTS service | `tts-service.test.ts` | 13 |
| CCCD parser | `cccd-parser.test.ts` | 9 |
| Stats CSV | `stats-csv.test.ts` | 16 |
| Staff | `staff/route.test.ts` + `staff-selection.test.ts` | 19 |
| API client | `api-client.test.ts` | 26 |
| BCA search | `bca-search.test.ts` | 9 |
| Khác | logger, theme, endpoints, motifs | ~27 |

### 11.3 Ý nghĩa của Quality Gates

- **Typecheck:** Đảm bảo type safety — refactor an toàn, phát hiện lỗi compile-time
- **Lint:** Đảm bảo code style nhất quán, phát hiện code smell
- **Build:** Đảm bảo production build thành công
- **Tests:** Đảm bảo regression không xảy ra khi thay đổi code

### 11.4 Khoảng trống kiểm thử

- QR Scanner component: Không có unit test (camera + async logic phức tạp)
- End-to-end flow (QR → ticket → DB): Chưa có E2E test
- Browser integration: Chưa có Playwright/Cypress test

---

## 12. Sẵn sàng triển khai

### 12.1 Đã biết (từ mã nguồn)

| Thành phần | Trạng thái |
|---|---|
| Windows PC server | Hoạt động (Node.js + SQLite) |
| Local LAN | Hoạt động |
| Static IP | Cần cấu hình khi deploy |
| Internal HTTPS | **ĐÃTriển khai** — `server.js` + `scripts/generate-cert.ps1` |
| Certificate | Self-signed PFX, DNS SAN, port 3443 |
| Firewall | **ĐÃTriển khai** — `scripts/setup-firewall.ps1` |
| Startup/restart | **ĐÃTriển khai** — Task Scheduler + `scripts/start-production.ps1` |
| Database backup | **ĐÃTriển khai** — `scripts/backup-db.py` (WS-57) |
| Power failure recovery | SQLite survive restart, nhưng cần UPS |
| Kiosk clients | Trình duyệt Chromium (cần trust certificate) |
| Display clients | Trình duyệt Chromium (cần trust certificate) |
| Staff clients | Trình duyệt Chromium (cần trust certificate) |
| Internet optionality | Core flow hoạt động không cần Internet |

### 12.2 Khuyến nghị

| Hạng mục | Trạng thái | Ghi chú |
|---|---|---|
| HTTPS | **ĐÃTriển khai** | `npm run start:https`, cert via `npm run cert:generate` |
| Backup | **ĐÃTriển khai** | `npm run backup`, Task Scheduler via `npm run backup:install-task` |
| Startup | **ĐÃTriển khai** | `npm run install:service`, auto-start on boot |
| Monitoring | Health check có sẵn | `GET /api/health` |
| Firewall | **ĐÃTriển khai** | `scripts/setup-firewall.ps1` |
| Kiosk | Cấu hình khi deploy | Kiosk mode Chrome/Edge |
| Display | Cấu hình khi deploy | Full-screen Chrome/Edge |

### 12.3 Triển khai HTTPS (WS-55B)

1. **Generate certificate:** `npm run cert:generate` (hoặc `powershell -ExecutionPolicy Bypass -File scripts/generate-cert.ps1 -ServerIP x.x.x.x`)
2. **Copy certs/ folder** đến server production
3. **Trust certificate** trên client machines (Trusted Root Certification Authorities)
4. **Start server:** `npm run start:https`
5. **Verify:** `https://<server-ip>:3443/api/health`

### 12.4 Process Management (WS-58)

**Process Model:** Windows Task Scheduler (native, no extra software)

**Startup Command:**
```
Working directory: D:\bamso (project root)
Executable: powershell.exe
Arguments: -NoProfile -ExecutionPolicy Bypass -File "scripts\start-production.ps1"
```

**Auto-start:** Task Scheduler trigger at system boot (30s delay) + daily safety net at 06:00

**Auto-restart:** Task Scheduler RestartCount=3, RestartInterval=1 minute

**Health Check:** `GET /api/health` — checks DB connectivity

**Graceful Shutdown:** SIGTERM/SIGINT handlers in server.js — closes active servers, 5s timeout

**Logging:** stdout/stderr captured by Task Scheduler; startup log at `logs/startup.log`

**npm Scripts:**
| Script | Command |
|---|---|
| `npm run start:production` | Start with preflight checks |
| `npm run install:service` | Install Task Scheduler |

**DEPLOYMENT-TIME:** Task Scheduler installation requires running `npm run install:service` as Administrator on production machine.

### 12.5 Cần quyết định (WS-54)

- Cấu hình HTTPS nội bộ (đã có WS-55B)
- Chính sách backup database (đã có WS-57)
- Startup tự động khi reboot (đã có WS-58)
- Kiosk lockdown policy
- Network topology (switch, cáp)
- Phân quyền VLAN (nếu có)

---

## 13. Mô hình mối đe dọa

| Mối đe dọa | Risk | Mitigation hiện tại | Residual risk | Khuyến nghị |
|---|---|---|---|---|
| Truy cập admin trái phép | CAO | JWT auth + RBAC server-side | TRUNG BÌNH | Đảm bảo HTTPS, strong passwords |
| Stolen credentials | TRUNG BÌNH | PBKDF2 210K iterations, auto-rehash | THẤP | MFA (future) |
| Client LAN giả mạo API | TRUNG BÌNH | Rate limiting (Redis) | TRUNG BÌNH | Fail-open khi Redis down |
| Forged ticket request | THẤP | Server-side validation | THẤP | Không có business impact lớn |
| Forged QR payload | THẤP | Chỉ extract name, không verify | THẤP | BY DESIGN — không xác thực danh tính |
| XSS | THẤP | React auto-escape + CSP + escapeHtml | THẤP | Không tìm thấy dangerous patterns |
| SQL injection | RẤT THẤP | Prisma ORM (parameterized queries) | RẤT THẤP | Không có raw SQL |
| Exposed database | TRUNG BÌNH | File-based SQLite, không encryption | TRUNG BÌNH | File permissions, backup encryption |
| Compromised Windows server | CAO | Phụ thuộc vào OS security | CAO | Hardening Windows, firewall |
| Lost backup | TRUNG BÌNH | Chưa có backup tự động | CAO | Triển khai backup script |
| Internet outage | THẤP | Core flow offline-capable | RẤT THẤP | LAN vẫn cần thiết |
| LAN outage | TRUNG BÌNH | Multi-device không hoạt động | TRUNG BÌNH | Single-device fallback |
| Server outage | CAO | Tất cả clients mất functionality | CAO | Auto-restart, monitoring |

---

## 14. Vì sao BAMSO có lợi thế

1. **Kiến trúc local-first:** Dữ liệu không rời khỏi mạng nội bộ cơ quan. Không phụ thuộc cloud service nào.

2. **Thu nhỏ dữ liệu tối thiểu:** Chỉ tên công dân được lưu trữ. Số CCCD, ngày sinh, giới tính KHÔNG được lưu — giảm thiểu tác động nếu dữ liệu bị rò rỉ.

3. **Không phụ thuộc cloud QR:** Quét CCCD hoàn toàn cục bộ — không gửi dữ liệu CCCD đến server bên ngoài.

4. **Không có QR authentication:** Không phức tạp hóa bằng hệ thống login QR. Chỉ có username/password chuẩn.

5. **Authorization server-side:** RBAC được enforce ở server, không chỉ ẩn UI.

6. **Codebase typed:** TypeScript giúp phát hiện lỗi trước khi chạy, refactor an toàn.

7. **Tự động kiểm thử:** 363 tests, build gate, lint gate — giảm regression.

8. **Database deterministik:** SQLite file-based — dễ backup, dễ di chuyển, dễ understand.

9. **Client là trình duyệt:** Không cần cài đặt app trên từng thiết bị. Kiosk/display/staff đều chạy trên Chromium.

10. **Nhiều giao diện vận hành:** Kiosk (công dân), get-ticket (web), admin (quản trị), display (màn hình chờ), canbo (staff).

11. **Hoạt động không cần Internet:** Core ticket flow chạy hoàn toàn trên LAN.

---

## 15. Hạn chế đã biết

1. **CCCD QR không phải xác thực danh tính:** Hệ thống chỉ trích xuất tên từ QR, không verify CCCD thật/giả. Đây là BY DESIGN nhưng cần được hiểu rõ.

2. **Server là single point of failure:** Nếu server BAMSO crash, tất cả clients mất functionality. Chưa có redundancy/load balancing.

3. **SQLite có giới hạn scale:** Phù hợp cho quy mô hiện tại (một cơ quan), nhưng nếu cần multi-site hoặc hàng nghìn concurrent users, cần đánh giá lại.

4. **Certificate trust cần distribution:** Certificate self ký cần được cài đặt trên từng client machine (Trusted Root Certification Authorities) để tránh browser warning. certificate chỉ có DNS SAN trên PS 5.1 — cần PS 7+ hoặc OpenSSL cho IP SAN.

5. **LAN bắt buộc cho đa thiết bị:** Kiosk, staff, display phải kết nối cùng mạng với server.

6. **QR Scanner thiếu automated test:** Component phức tạp (camera + async) chưa có unit test.

7. **Backup chưa formalized:** Không có script backup tự động. Database file cần được sao lưu thủ công hoặc qua script tùy chỉnh.

8. **Audit logging chưa đầy đủ:** Không có audit log cho các hành động quan trọng (login, tạo vé, gọi số). Chỉ có error logging.

9. **Không có MFA:** Chỉ dựa vào username/password. Có thể cần bổ sung cho tài khoản admin.

10. **Redis là optional dependency:** Nếu không cấu hình Redis, rate limiting bị bypass (fail-open) và SSE chạy single-instance.

---

## 16. Chỉ mục bằng chứng

| Khẳng định | Nguồn / Bằng chứng |
|---|---|
| Xác thực JWT | `src/lib/auth.ts` (signJWT, verifyJWT), `src/app/api/auth/route.ts` |
| Password hashing | `src/lib/password.ts` (PBKDF2, 210K iterations, timingSafeEqual) |
| RBAC server-side | `src/lib/api-auth.ts` (requireRole), `src/lib/constants.ts` (UserRole) |
| CCCD QR extraction | `src/lib/cccd-parser.ts`, `src/components/qr-scanner/QRScanner.tsx` |
| Thu nhỏ dữ liệu | `src/lib/cccd-parser.ts:13-24` (chỉ extract name), Ticket schema `customerName?` |
| Validate đầu vào | `src/lib/api-validation.ts`, `src/app/api/tickets/route.ts:40-73` |
| CSP headers | `next.config.ts:7-18` |
| Rate limiting | `src/lib/rate-limit.ts` (Redis-backed, fail-open) |
| SSE real-time | `src/lib/sse-broker.ts` (Redis pub/sub optional) |
| Queue concurrency | `src/lib/queue-service.ts:6-28` (createMutex) |
| Kiểm thử | `npm test` → 33 files, 363 tests passed |
| Typecheck | `npx tsc --noEmit` → 0 errors |
| Lint | `npm run lint` → 0 warnings |
| Build | `npm run build` → pass |
| QR Scanner offline | `src/components/qr-scanner/QRScanner.tsx` (BarcodeDetector + html5-qrcode, no network) |
| Camera secure context | `src/components/qr-scanner/QRScanner.tsx:150` (isSecureContext check) |
| DB schema | `prisma/schema.prisma` (User, Service, Ticket, Settings) |
| SQLite config | `.env:1` (DATABASE_URL=file:./dev.db) |
| JWT secret | `.env:2` (JWT_SECRET) |
| Escape HTML | `src/lib/utils.ts:8-15` (escapeHtml function) |
| Auto-rehash | `src/app/api/auth/route.ts:42-49`, `src/lib/password.ts:77-84` |
