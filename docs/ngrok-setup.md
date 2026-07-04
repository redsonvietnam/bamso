# Hướng dẫn cài đặt và sử dụng ngrok để test app trên điện thoại

## Vấn đề
Khi chạy app Next.js bằng `npm run dev`, truy cập từ điện thoại qua IP (ví dụ: `http://192.168.1.x:3000`) sẽ gặp lỗi giao diện không tải đầy đủ (chỉ có khung) và đặc biệt **không thể mở camera** do trình duyệt yêu cầu HTTPS.

## Giải pháp
Sử dụng **ngrok** để tạo đường dẫn HTTPS tạm thời trỏ về máy tính của bạn.

## Các bước thực hiện

### Bước 1: Tải ngrok
Đã tải sẵn file `ngrok.exe` tại đường dẫn:
```
C:\Users\User\AppData\Local\Temp\opencode\ngrok.exe
```

### Bước 2: Đăng ký tài khoản và lấy Auth Token
1. Truy cập [https://dashboard.ngrok.com/signup](https://dashboard.ngrok.com/signup) để đăng ký tài khoản miễn phí.
2. Sau khi đăng nhập, vào [Get your authtoken](https://dashboard.ngrok.com/get-started/your-authtoken) để copy Auth Token.

### Bước 3: Kích hoạt ngrok
Mở **CMD** hoặc **PowerShell** và chạy các lệnh sau:

1. Thêm Auth Token (chỉ cần chạy 1 lần sau khi cài đặt):
```bash
C:\Users\User\AppData\Local\Temp\opencode\ngrok config add-authtoken <YOUR_AUTHTOKEN>
```
*(Thay thế `<YOUR_AUTHTOKEN>` bằng chuỗi token bạn vừa copy)*

2. Khởi động ngrok để tạo đường dẫn HTTPS cho port 3000:
```bash
C:\Users\User\AppData\Local\Temp\opencode\ngrok http 3000
```

### Bước 4: Sử dụng
Sau khi chạy lệnh trên, terminal sẽ hiển thị một đường dẫn dạng:
```
https://<random_subdomain>.ngrok-free.app
```
Hãy dùng đường dẫn này truy cập trên điện thoại của bạn. Khi đó:
- Giao diện sẽ hiển thị đầy đủ.
- **Camera sẽ hoạt động** (cho phép quét CCCD).

## Lưu ý
- Mỗi khi khởi động lại máy tính hoặc dừng ngrok, bạn cần chạy lại lệnh `ngrok http 3000` để tạo đường dẫn mới.
- Phiên bản ngrok miễn phí sẽ hết hạn sau một thời gian ngắn (vài giờ) và cần khởi động lại.