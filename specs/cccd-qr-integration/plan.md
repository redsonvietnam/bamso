# Plan: CCCD QR Code Integration

## Phase 1: Documentation & Setup
- [x] Tạo file đặc tả kỹ thuật: `specs/cccd-qr-integration/spec.md`
- [ ] Tạo file theo dõi tiến độ: `specs/cccd-qr-integration/plan.md`
- [ ] Nghiên cứu và chọn thư viện quét QR nhẹ, tương thích tốt với trình duyệt di động (ví dụ: `html5-qrcode`).
- [ ] Chuẩn bị bộ dữ liệu mẫu (mock data) gồm các chuỗi QR CCCD với các trường dữ liệu khác nhau để phục vụ việc test.

## Phase 2: Core Logic Development
- [ ] Tạo file tiện ích: `src/lib/cccd-parser.ts`.
- [ ] Viết Unit Tests cho `cccd-parser.ts`.

## Phase 3: Frontend Integration
- [ ] Cài đặt thư viện quét QR đã chọn.
- [ ] Cập nhật trang lấy số: `src/app/(public)/get-ticket/page.tsx`.
- [ ] Xây dựng Component `QRScanner`.
- [ ] Tích hợp logic: `Quét thành công` $\rightarrow$ `Parser` $\rightarrow$ `Hiển thị tên để xác nhận`.

## Phase 4: Privacy Audit
- [ ] Kiểm tra Network: Đảm bảo payload gửi lên server chỉ chứa `serviceId` và `customerName`.
- [ ] Kiểm tra Client-side: Xác nhận không có dữ liệu nhạy cảm nào được lưu trong `state` hoặc `localStorage`.

## Phase 5: Verification & Finalization
- [ ] Kiểm thử E2E.
- [ ] Kiểm tra Mobile UX.
- [ ] Chạy `npm run lint` và `npm run typecheck`.
