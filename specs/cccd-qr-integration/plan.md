# Plan: CCCD QR Code Integration - Next Steps

## Mục tiêu chính
Đảm bảo tính năng quét QR CCCD hoạt động đầy đủ trên thiết bị di động.

## Trạng thái hiện tại
Tính năng đã được code xong và tích hợp vào ứng dụng. Các vấn đề về network (Hot Reload trên mobile) và camera (yêu cầu HTTPS) đã được xác định và có hướng dẫn giải quyết bằng `ngrok`.

## Các bước tiếp theo

### Bước 1: Chuẩn bị dữ liệu mẫu để kiểm thử (Mock Data)
- [ ] Tạo các mã QR giả lập CCCD với các trường hợp khác nhau (tên có dấu, không dấu, độ dài khác nhau) dưới dạng chuỗi text.
  - *Mục đích:* Giúp người dùng dễ dàng kiểm tra tính năng mà không cần CCCD thật.
  - *Định dạng sẽ là:* `[Số CCCD]|[Họ tên]|[Ngày sinh]|[Giới tính]|[Quốc tịch]|[Ngày cấp]`
  - *Ví dụ mẫu sẽ được cung cấp ngay sau khi cập nhật file plan.*

### Bước 2: Hướng dẫn người dùng chạy ngrok và kiểm thử E2E trên mobile
- [ ] **Khởi động server:** Chạy `npm run dev` trên máy tính của bạn.
- [ ] **Khởi động ngrok:** Thực hiện theo hướng dẫn trong `docs/ngrok-setup.md` để khởi động `ngrok` và lấy URL HTTPS.
- [ ] **Kiểm thử trên điện thoại:**
    1. Truy cập URL ngrok trên điện thoại.
    2. Chọn một dịch vụ.
    3. Nhấn nút "Quét CCCD".
    4. Cấp quyền truy cập camera (nếu được hỏi).
    5. Quét các mã QR mẫu (sẽ cung cấp bên dưới) hoặc CCCD thật của bạn.
    6. Xác nhận tên được trích xuất hiển thị chính xác.
    7. Hoàn tất lấy số.
- [ ] **Báo cáo kết quả:** Yêu cầu người dùng báo cáo lại kết quả kiểm thử (camera có bật không, quét có nhận diện được không, tên có đúng không, có lấy được số không).

### Bước 3: Tối ưu hóa trải nghiệm người dùng (Mobile UX - nếu cần)
- [ ] Dựa trên phản hồi kiểm thử của người dùng, thực hiện các điều chỉnh về giao diện, độ nhạy của camera, hoặc thông báo lỗi để tối ưu hóa trải nghiệm trên thiết bị di động.
