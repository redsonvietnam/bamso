# Hệ Thống Quản Lý Hàng Đợi Tự Động (Queue Management System — v1.0)

Chào mừng bạn đến với phiên bản tái cấu trúc hoàn chỉnh (**Rebuild v1.0**) của Hệ thống Quản lý Hàng đợi Tự động. Dự án được phát triển dựa trên **Next.js 16 (App Router)**, **Prisma ORM**, và **PostgreSQL**, loại bỏ hoàn toàn các nợ kỹ thuật từ phiên bản thử nghiệm (prototype) để đem lại hiệu năng tối đa và độ tin cậy tuyệt đối.

---

## 🚀 Đặc Điểm Nổi Bật & Stack Công Nghệ

*   **Core:** [Next.js 16](https://nextjs.org/) (App Router & React 19) + TypeScript strict mode.
*   **Database:** PostgreSQL phục vụ lưu trữ giao dịch thực tế kết hợp [Prisma ORM](https://www.prisma.io/).
*   **Real-time:** Native Server-Sent Events (SSE) giúp đồng bộ hóa trạng thái hai chiều siêu nhẹ, tự động kết nối lại khi rớt mạng, thay thế cho WebSocket cồng kềnh hoặc Polling gây chậm tải.
*   **Xác thực bảo mật:** Sử dụng thư viện [Jose](https://github.com/panva/jose) phát hành JWT lưu giữ an toàn trong **HttpOnly Cookie**, chặn hoàn toàn lỗ hổng XSS từ localStorage.
*   **Quản lý State:** Sử dụng [Zustand](https://zustand-demo.pmnd.rs/) để quản lý trạng thái luồng dữ liệu (Auth & Queue) tập trung tại Client.
*   **Giao diện & Tiện ích:** Tailwind CSS, Shadcn/UI, Recharts (Biểu đồ thống kê thực tế), Sonner Toast.
*   **Âm thanh:** Tích hợp bộ đọc giọng nói tự động Tiếng Việt (Google Translate TTS Proxy + Web Speech API fallback).

---

## 📐 Kiến Trúc Core & Giải Pháp Thiết Kế

### 1. Phân Quyền Định Tuyến (Next.js 16 Proxy)
Thay vì sử dụng `middleware.ts` (đã lỗi thời và xung đột với Next.js 16), dự án sử dụng bộ đánh chặn trung gian [src/proxy.ts](file:///d:/Bamso/src/proxy.ts) để kiểm tra token quyền hạn chặt chẽ cho 4 nhóm tài khoản:
*   `ADMIN`: Toàn quyền quản trị, cấu hình và xem biểu đồ phân tích.
*   `STAFF`: Cán bộ trực quầy thao tác gọi số, bỏ qua, hoàn thành vé.
*   `KIOSK`: Giao diện máy tính bảng công cộng để người dân tự lấy số.
*   `DISPLAY`: Màn hình TV lớn hiển thị số và phát âm thanh tại phòng chờ.

### 2. Thuật Toán Sắp Xếp Hàng Đợi (`position` field)
Khắc phục triệt để lỗi race-condition và sai lệch báo cáo do hack thời gian `createdAt`:
*   Mỗi vé (`Ticket`) sở hữu cột số nguyên `position` duy nhất xác định thứ tự phục vụ.
*   **Gọi số tiếp theo (Call Next):** Lấy vé có trạng thái `PENDING` và có `position` nhỏ nhất trong ngày của dịch vụ đó.
*   **Bỏ qua (Skip):** Tăng `position` của vé bị bỏ qua lên sau $N$ số tiếp theo dựa theo cấu hình `skip_rules` (ví dụ: lùi 1, lùi 3, hoặc chuyển hẳn sang trạng thái `MISSED`).
*   **Khôi phục (Restore):** Thiết lập `position = min(position) - 1` của các vé đang chờ để đưa vé bị lỡ lượt quay lại vị trí ưu tiên đầu tiên của hàng đợi.

### 3. Server-Sent Events (SSE) Broker
Tệp [sse-broker.ts](file:///d:/Bamso/src/lib/sse-broker.ts) quản lý tập trung danh sách các kết nối client lắng nghe. Khi cơ sở dữ liệu thay đổi (tạo vé, gọi vé, hoàn tất, bỏ qua), server sẽ ngay lập tức phát tín hiệu (broadcast) tới:
*   Màn hình cán bộ quầy (`/canbo`) để cập nhật danh sách chờ.
*   Màn hình TV phòng chờ (`/display`) để phát âm thanh gọi và đổi vị trí vé hiển thị.
*   Trang tra cứu cá nhân của khách hàng (`/track`) để thông báo thời gian thực khi đến lượt.

---

## 🛠️ Cài Đặt & Sử Dụng

### 1. Thiết lập Biến Môi Trường (`.env`)
Tạo tệp `.env` tại thư mục gốc với đường dẫn kết nối PostgreSQL thích hợp (Dự án cục bộ đang chạy trên cổng `5433`):
```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5433/queue_system?schema=public"
JWT_SECRET="YOUR_SUPER_SECRET_KEY_FOR_JWT_SIGNING_2026"
```

### 2. Cài đặt Thư viện & Khởi tạo Database
Chạy chuỗi lệnh sau để cài đặt và nạp dữ liệu mẫu ban đầu:
```bash
# Cài đặt thư viện
npm install

# Đồng bộ cấu trúc bảng vào PostgreSQL
npx prisma db push

# Nạp dữ liệu mẫu (Admin, Staff1, Dịch vụ A, Dịch vụ B, Cấu hình mặc định)
npx prisma db seed
```

### 3. Khởi chạy 1-Click (Dành cho Windows)
Để thuận tiện cho nhà phát triển, tệp script [run-local.bat](file:///d:/Bamso/run-local.bat) đã được thiết lập. Chỉ cần click đúp vào tệp này:
1.  Script tự động kiểm tra và khởi động PostgreSQL cục bộ trên cổng `5433` (nếu chưa chạy).
2.  Khởi chạy Next.js Development Server trên cổng `3000`.
3.  Tự động mở trình duyệt mặc định truy cập thẳng vào trang **Demo Showcase** (`http://localhost:3000/demo`).

---

## 🧪 Quy Trình Kiểm Thử Tự Động (Integration Test)

Hệ thống đi kèm một kịch bản kiểm thử API tích hợp đầu-cuối tự động tại [e2e-test.mjs](file:///d:/Bamso/scratch/e2e-test.mjs). Bạn có thể khởi chạy để xác minh tính ổn định của hệ thống:

```bash
node scratch/e2e-test.mjs
```

Kịch bản này sẽ giả lập chính xác:
1.  Kết nối kiểm tra sức khỏe cơ sở dữ liệu (`/api/health`).
2.  Khách hàng tự lấy số mới (`POST /api/tickets`).
3.  Nhân viên lấy token xác thực và thực hiện gọi số tiếp theo (`POST /api/queue/call-next`).
4.  Nhân viên thực hiện thao tác bỏ qua vé (`PUT /api/queue/skip`) và kiểm tra thuật toán đẩy lùi vị trí.
5.  Gọi lại vé và nhấn nút hoàn thành giao dịch (`PUT /api/queue/complete`).
