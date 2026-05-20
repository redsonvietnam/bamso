# CLAUDE.md — Hướng dẫn Phát triển & Lệnh Vận hành

Tệp tin này đóng vai trò hướng dẫn nhanh về các lệnh vận hành cốt lõi và tiêu chuẩn lập trình dành cho các lập trình viên hoặc AI Coding Assistant tiếp theo làm việc trên repository này.

---

## 🛠️ Lệnh Vận Hành Cơ Bản

### 1. Khởi chạy & Phát triển
*   **Chạy môi trường cục bộ (Windows 1-Click):** Click chạy tệp `run-local.bat` ở thư mục gốc để tự động kích hoạt PostgreSQL (cổng 5433) và Next.js Dev Server (cổng 3000).
*   **Chạy thủ công:**
    *   **Postgres DB:** `& "C:\Program Files\PostgreSQL\18\bin\postgres.exe" -D d:\Bamso\pgdata`
    *   **Web Server:** `npm run dev`
*   **Biên dịch kiểm tra (Production Build):** `npm run build`

### 2. Thao tác Cơ sở dữ liệu (Prisma & Postgres)
*   **Đồng bộ cấu trúc bảng:** `npx prisma db push`
*   **Gieo dữ liệu hạt giống (Seed):** `npx prisma db seed`
*   **Xem dữ liệu trực quan qua Web:** `npx prisma studio`

### 3. Kiểm thử Tự động (Integration Test)
*   **Khởi chạy kịch bản E2E Test:** `node scratch/e2e-test.mjs`

---

## 📐 Quy Tắc & Chuẩn Lập Trình (Code Guidelines)

### 1. Quy ước Đặt tên (Naming Conventions)
*   **API Routes:** Sử dụng chữ thường viết nối bằng dấu gạch ngang (kebab-case). Ví dụ: `/api/queue/call-next`, `/api/queue/skip`.
*   **Components:** Viết hoa chữ cái đầu (PascalCase). Ví dụ: `QueuePanel.tsx`, `LiveTracker.tsx`.
*   **Stores & Hooks:** Viết thường chữ đầu (camelCase). Ví dụ: `auth.store.ts`, `useSpeech.ts`.
*   **Database Fields:** Prisma mặc định sử dụng camelCase để đồng bộ hóa cấu trúc TypeScript tốt nhất.

### 2. Thiết kế Kiến trúc & Xử lý Ngoại lệ
*   **Xác thực (Auth):** Bắt buộc sử dụng `jose` để ký và giải mã JWT. Token lưu trữ trong HttpOnly Cookie tên `auth_token`. Tuyệt đối không dùng localStorage cho thông tin bảo mật.
*   **Bảo vệ định tuyến:** Sử dụng tệp chặn điều hướng trung gian [src/proxy.ts](file:///d:/Bamso/src/proxy.ts) để kiểm tra phiên hoạt động và vai trò.
*   **Thứ tự hàng đợi (Queue Ordering):** Toàn bộ việc sắp xếp hàng đợi bắt buộc sử dụng trường số nguyên `position`. Tuyệt đối không dùng `createdAt` để sắp xếp.
*   **Giao dịch (Transactions):** Mọi thao tác gọi số (`callNextTicket`), bỏ qua (`skipTicket`) và khôi phục (`restoreTicket`) bắt buộc phải bọc trong `prisma.$transaction` để chống race-condition.
*   **SSE Broker:** Khi gọi các hàm của `sseBroker` (ví dụ: `broadcastQueueUpdate`), luôn sử dụng các hàm đã được liên kết tường minh `.bind(sseBroker)` để tránh mất ngữ cảnh `this`.
*   **Xử lý lỗi API:** Các API phải trả về định dạng chuẩn `{ error: string, code: string }` kèm HTTP Status Code chính xác (401, 403, 400, 404, 500).
