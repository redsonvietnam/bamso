# Specification: CCCD QR Code Integration

## 1. Overview
Tích hợp tính năng quét mã QR trên Căn cước công dân (CCCD) Việt Nam để tự động trích xuất họ tên người dân, giúp tối ưu hóa quy trình lấy số, giảm thiểu việc nhập liệu thủ công và tăng tốc độ phục vụ tại các điểm kiosk/máy lấy số tự động.

## 2. User Stories
- **Là một người dân**, tôi muốn quét mã QR trên thẻ CCCD của mình để không phải gõ tên đầy đủ bằng bàn phím.
- **Là một người dân**, tôi muốn sau khi quét xong, hệ thống hiển thị đúng tên tôi để tôi có thể nhanh chóng chọn dịch vụ và lấy số ngay lập tức.

## 3. Functional Requirements

### 3.1 QR Code Scanning & Parsing
- **Tích hợp Scanner:** Sử dụng thư viện quét QR mã nguồn mở (như `html5-qrcode`) hỗ trợ tốt trên trình duyệt di động.
- **Bộ phân tích (Parser):** Phát triển một hàm utility để phân tách chuỗi dữ liệu từ mã QR CCCD.
    - *Cấu trúc kỳ vọng:* `[Số CCCD]|[Họ và tên]|[Ngày sinh]|[Giới tính]|[Quốc tịch]|[Ngày cấp]`
    - *Hành động:* Trích xuất duy nhất trường `Họ và tên`.
- **Nguyên tắc quyền riêng tư (Privacy First):** 
    - Việc trích xuất chỉ thực hiện ở **Client-side** (trình duyệt của người dùng).
    - Tất cả các thông tin nhạy cảm khác (Số CCCD, Ngày sinh...) phải được loại bỏ ngay lập tức sau khi lấy được tên.
    - **Tuyệt đối không** gửi bất kỳ thông tin nào khác ngoài `customerName` lên server.

### 3.2 User Flow (Luồng người dùng)
1. **Truy cập:** Người dùng vào trang `/get-ticket`.
2. **Kích hoạt:** Người dùng nhấn nút **"Quét CCCD"**.
3. **Quét:** Camera mở lên $\rightarrow$ Người dùng đưa mã QR vào khung hình.
4. **Xác nhận:** Khi quét thành công $\rightarrow$ Hệ thống hiển thị: *"Tìm thấy tên: **[Tên trích xuất]**. Vui lòng chọn dịch vụ."*
5. **Hoàn tất:** Người dùng chọn một dịch vụ $\rightarrow$ Gọi `POST /api/tickets` với `{ serviceId, customerName: "[Tên trích xuất]" }`.
6. **Chuyển hướng:** Hệ thống tự động chuyển người dùng đến trang chờ `/waiting?ticketId=...`.

## 4. Technical Implementation Plan

### 4.1 Dependencies
- Cài đặt thư viện quét QR (ví dụ: `html5-qrcode`).

### 4.2 Software Architecture
- **Utility:** `src/lib/cccd-parser.ts` chứa logic parsing.
- **Frontend UI:** Cập nhật `src/app/(public)/get-ticket/page.tsx`.
    - Thêm trạng thái `mode: 'scan'`.
    - Thêm Component `QRScanner`.
    - Cập nhật logic `handleCreateTicket` để nhận diện dữ liệu từ scanner.

### 4.3 API Integration
- Sử dụng endpoint hiện có: `POST /api/tickets`. Không cần thay đổi backend.

## 5. Security & Privacy Audit
- [ ] Kiểm tra Network Tab: Đảm bảo payload gửi đi chỉ chứa `serviceId` và `customerName`.
- [ ] Kiểm tra Client-side: Xác nhận không có dữ liệu nhạy cảm (số CCCD, ngày sinh...) nào được lưu trong `state` của React hoặc `localStorage`.

## 6. Verification Plan (Test Case)
- [ ] **Test quét thành công:** Quét mã QR mẫu $\rightarrow$ Tên hiển thị đúng $\rightarrow$ Lấy được số.
- [ ] **Test quét thất bại:** Mã QR không đúng định dạng $\rightarrow$ Thông báo lỗi hợp lý.
- [ ] **Test quyền truy cập camera:** Kiểm tra cách ứng dụng xử lý khi người dùng từ chối cấp quyền camera.
- [ ] **Test tính riêng tư:** Kiểm tra không có dữ liệu nhạy cảm nào bị rò rỉ qua API call.
