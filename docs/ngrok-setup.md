# Hướng dẫn tạo HTTPS tunnel để test app trên điện thoại

## Vấn đề
Khi chạy app Next.js, truy cập từ điện thoại qua IP (ví dụ: `http://192.168.1.x:3000`) sẽ gặp:
- **Camera không mở được** — trình duyệt yêu cầu HTTPS/localhost cho `getUserMedia`
- **Giao diện chỉ hiện khung, nội dung trống** — dev mode dùng WebSocket HMR bị block qua HTTP IP
- **SSE realtime không hoạt động** — kết nối bị gián đoạn

## Giải pháp: Dùng tunnel HTTPS

Có 2 cách,推荐 dùng **Cloudflare** (nhanh, miễn phí, không cần đăng ký):

---

## Cách 1: Cloudflare (推荐 — không cần account)

### Bước 1: Cài cloudflared
```bash
# Windows (winget)
winget install cloudflare.cloudflared

# Hoặc tải trực tiếp từ:
# https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/
```

### Bước 2: Chạy tunnel
```bash
# Build production trước (BẮT BUỘC — dev mode không hoạt động qua tunnel)
npm run build
npm run start

# Terminal khác: chạy cloudflared
cloudflared tunnel --url http://localhost:3000
```

### Bước 3: Sử dụng
Terminal sẽ hiển thị:
```
https://xxxx-xxxx-xxxx.trycloudflare.com
```
Mở URL này trên điện thoại → camera hoạt động, giao diện đầy đủ.

### Lưu ý
- Mỗi lần chạy lại sẽ có URL mới
- Miễn phí, không cần đăng ký, không cần auth token
- Production mode (`npm run start`) BẮT BUỘC — dev mode (`npm run dev`) sẽ fail

---

## Cách 2: ngrok (cần đăng ký tài khoản)

### Bước 1: Tải ngrok
```bash
# Windows (winget)
winget install ngrok/ngrok

# Hoặc tải từ https://ngrok.com/download
```

### Bước 2: Đăng ký và lấy Auth Token
1. Đăng ký: https://dashboard.ngrok.com/signup
2. Copy Auth Token: https://dashboard.ngrok.com/get-started/your-authtunk

### Bước 3: Kích hoạt
```bash
# Chỉ cần chạy 1 lần
ngrok config add-authtoken <YOUR_AUTHTOKEN>

# Chạy tunnel
ngrok http 3000
```

### Bước 4: Sử dụng
Terminal sẽ hiển thị:
```
https://xxxx.ngrok-free.app
```

### Lưu ý
- Cần đăng ký tài khoản miễn phí
- Phiên bản miễn phí hết hạn sau vài giờ
- Mỗi lần restart cần chạy lại

---

## So sánh

| | Cloudflare | ngrok |
|---|---|---|
| Cần đăng ký | Không | Có |
| Cần auth token | Không | Có |
| URL mới mỗi lần | Có | Có |
| Hết hạn | Không | Có (miễn phí) |
| Tốc độ | Nhanh | Trung bình |

---

## Quan trọng: Dev mode vs Production mode

```bash
# ❌ DEV MODE — KHÔNG hoạt động qua tunnel
npm run dev

# ✅ PRODUCTION MODE — Hoạt động qua tunnel
npm run build
npm run start
```

Dev mode dùng WebSocket HMR → bị block qua tunnel → giao diện chỉ hiện skeleton/loading.
