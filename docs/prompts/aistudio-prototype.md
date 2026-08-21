# Prompt — Thiết kế Prototype cho Google AI Studio

> Dán toàn bộ nội dung bên dưới vào Google AI Studio (Gemini) để tạo ra prototype
> clickable hoàn chỉnh cho **Bamso — Hệ thống Quản lý Hàng đợi Dịch vụ Công**.

---

## Vai trò

Bạn là chuyên gia thiết kế UI/UX và front-end. Hãy tạo ra một **prototype tương tác
đầy đủ** cho ứng dụng web dưới đây, theo đúng design system, ngôn ngữ giao diện
tiếng Việt, và luồng nghiệp vụ thực tế.

## Mô tả ứng dụng

**Bamso — Hệ thống Quản lý Hàng đợi Tự động** dùng tại **Công an xã / bộ phận
một cửa (dịch vụ công)**. Khách dân lấy số thứ tự, chờ gọi qua loa + màn hình TV,
cán bộ quầy gọi/hỗ trợ từng vé. Hệ thống có 4 nhóm người dùng:

1. **KHÁCH DÂN** — lấy số (web mobile hoặc máy kiosk), theo dõi vé realtime.
2. **STAFF (Cán bộ quầy)** — gọi số tiếp theo, hoàn thành, bỏ qua, khôi phục vé nhỡ.
3. **DISPLAY (Màn hình TV phòng chờ)** — hiển thị số đang gọi, phát âm thanh tiếng Việt.
4. **ADMIN (Quản trị)** — cấu hình dịch vụ, quầy, nhân viên, thông báo, giọng nói, thống kê.

Công nghệ thật: Next.js 16 + Prisma + SQLite, realtime qua SSE, JWT HttpOnly cookie.

## Design System (BẮT BUỘC tuân theo)

### Màu sắc
- `primary` / `brand-navy`: **#142E6B** (màu chủ đạo, cảm giác nhà nước, tin cậy)
- `brand-red`: **#C8102E** (dải/band trạng thái, màu Công an)
- `brand-gold`: **#C9A227** (điểm nhấn, số trên nền navy, số hiển thị)
- `brand-navy-deep`: **#0B1C47** (nền màn hình TV display)
- `background`: **#F8FAFC**; `surface`: **#FFFFFF**; `surface-muted`: **#F1F5F9**
- `border`: **#E2E8F0**; `foreground`: **#111827**; `muted-foreground`: **#6B7280**
- Trạng thái vé: PENDING (xám/amber), CALLED (amber), IN_PROGRESS (blue), COMPLETED (green), MISSED (orange)

### Typography
- Body: **Be Vietnam Pro** (tối ưu dấu tiếng Việt)
- Display/lớn: **Oswald** (số vé, hero)
- Mono: **JetBrains Mono** (thời gian, số liệu)

### Hình khối & bố cục
- Bo góc nhẹ nhàng, bóng đổ mềm, card màu trắng trên nền xám nhạt.
- **AgencyHeader**: dải đỏ mảnh trên đỉnh + thanh navy, chữ trắng, emblem trống đồng vàng.
- **Motif trống đồng (Đông Sơn)**: hoa văn SVG inline, watermark nền 4–7% opacity,
  không che nội dung tương tác.
- Màn hình Display (TV): nền navy đậm, số trắng khổng lồ, accent vàng, trống đồng
  watermark vàng 7%.

## Danh sách màn hình cần thiết kế (mỗi màn 1 frame riêng, điều hướng click được)

### 1. Trang chủ — Lấy số (`/get-ticket`)
- AgencyHeader: tên cơ quan (vd "Công an xã"), subtitle "Dịch vụ công", nút back.
- Hero: "Chọn dịch vụ để lấy số" + dòng phụ "Quý bà con vui lòng chọn thủ tục cần thực hiện".
- Lưới card dịch vụ (2 cột mobile / 2–4 cột desktop): icon tròn màu theo service
  chứa ký hiệu (vd A, B, C), tên dịch vụ, mô tả.
- **Flow khi chọn dịch vụ**: hiện card chọn hình thức lấy số:
  - **Lấy số nhanh** (nút chính) → vào màn Waiting.
  - **Nhập tay** → form: Họ tên (có nút mic nhập giọng nói), SĐT tùy chọn, nút "Xác nhận lấy số".
  - **Quét CCCD / VNeID** → màn hình quét QR (khung camera đen, góc vuông), nút "Quét lại",
    sau khi nhận diện: hiện tên → "Xác nhận lấy số".

### 2. Trạng thái vé / Chờ đợi (`/waiting?ticketId=`)
- AgencyHeader với title "Trạng thái vé", badge vàng "Trạng thái vé".
- Card vé: icon prefix màu service, tên dịch vụ, tên khách, "Cập nhật realtime",
  nút bật/tắt âm thanh, badge kết nối.
- **QueueStatusCard**: hiển thị số vé lớn, trạng thái, số người đang chờ trước bạn,
  mức gần đến lượt (màu đổi theo độ gần).
- Ô "Hiện đang phục vụ": số vé + quầy đang phục vụ.
- 2 nút: "Lấy số mới" + "Xem hàng chờ".
- Danh sách hàng chờ của dịch vụ (số vé + vị trí).
- **Overlay cảm ơn** khi đến lượt: "Cảm ơn bạn đã sử dụng dịch vụ", nút đóng.

### 3. Tra cứu vé (`/track`)
- Form tìm kiếm: ô nhập "Số phiếu hoặc Số điện thoại" (placeholder "Ví dụ: A001 hoặc 0901234567"),
  nút "Tra cứu". Sau khi có kết quả → hiển thị card trạng thái realtime + nút "Tra cứu số khác".

### 4. Kiosk — Máy lấy số (tablet, split-screen)
- **Trái (55%)**: header tên cơ quan + đồng hồ; 4 bước:
  - Chọn dịch vụ (lưới 2 cột, thẻ lớn, icon màu chứa prefix).
  - Quét CCCD/VNeID (khung camera, nút quét lại, link "lấy số nhanh không cần quét").
  - Đang tạo phiếu (spinner).
  - Thành công: "Số phiếu của bạn là" + **số khổng lồ** + tên khách + "Tự động quay về sau 5 giây".
- **Phải (45%)**: "Đang phục vụ" — lưới 2 cột card số đang gọi (pos + số vé + tên khách),
  badge trực tuyến, khu "Đang chờ phục vụ" theo từng dịch vụ (count).

### 5. Bảng hiển thị TV (`/display`)
- Nền **navy đậm**, header: "BẢNG GỌI SỐ" (Oswald, vàng) + badge "Hệ thống trực tuyến" + đồng hồ.
- **Banner số vừa gọi**: khung viền vàng, chuông, chữ "Đang gọi số", **số vé cực lớn**
  (~200px), Vị trí quầy, tên khách hàng.
- Lưới card từng quầy: tên quầy, số vé đang phục vụ (7xl), trạng thái (Đang phục vụ /
  Sắp gọi tiếp / Hiện đang rảnh), "Đang chờ" count + danh sách "Sắp gọi" (5 số kế tiếp).
- Card mới được gọi highlight viền vàng + hiệu ứng. Thanh trạng thái mất kết nối đỏ.

### 6. Cán bộ trực quầy (`/canbo`)
- **Bước 1**: chọn dịch vụ hôm nay (lưới card, icon prefix màu). Header có "Xin chào, {tên}".
- **Bước 2**: chọn quầy trực (dropdown "Tên quầy").
- **Bước 3 — Bảng điều khiển quầy**: bố cục 2 cột + cột phụ:
  - Card "Quầy X — Đang phục vụ": **số vé khổng lồ** + tên khách + nút lớn **"Hoàn thành"**
    (xanh/chính) và **"Bỏ qua"** (viền đỏ). Khi trống: nút lớn **"Gọi số tiếp theo"**.
  - Card "Hàng đợi chờ xử lý (N)": danh sách vé + vị trí (scroll).
  - Cột phụ "Danh sách nhỡ (N)": mỗi vé nhỡ có nút "Khôi phục", ghi "Nhỡ N lần".
  - Nút bật/tắt âm thanh, badge Real-time On/Off.

### 7. Admin — Quản trị (`/admin`)
- Header: "Admin — Quản trị hệ thống", nút Đăng xuất.
- Tabs điều hướng: **Dịch vụ | Nhân viên | Thống kê | Cài đặt | Giọng nói**.
  - *Dịch vụ*: danh sách + thêm/sửa dịch vụ (tên, prefix, màu, mô tả, các chế độ lấy số).
  - *Nhân viên*: danh sách tài khoản + vai trò, thêm/sửa.
  - *Thống kê*: các biểu đồ (số vé/ngày, theo dịch vụ, theo trạng thái) + thẻ số KPI.
  - *Cài đặt*: tên cơ quan, danh sách quầy, text cảm ơn, quy tắc bỏ qua (skip_rules).
  - *Giọng nói*: chọn giọng đọc, thanh trượt tốc độ/âm lượng, bật/tắt từng thông báo.

### 8. Đăng nhập (`/login`)
- Header "Công an xã", card "Đăng nhập hệ thống": ô Tên đăng nhập, Mật khẩu, nút "Đăng nhập".

## Yêu cầu kỹ thuật (BẮT BUỘC)

- Xuất ra **MỘT file HTML duy nhất, tự chứa (self-contained)**, chạy được ngay bằng cách
  mở trong trình duyệt, không cần build.
- Prototype **clickable**: mọi nút thay đổi trạng thái/màn hình đều hoạt động (JS inline).
- **Responsive**: màn khách (mobile-first), kiosk (tablet landscape), display (TV full HD).
- Mô phỏng realtime: dùng `setInterval`/ngẫu nhiên để số vé, hàng chờ, đồng hồ tự cập nhật
  và phát ra "thông báo gọi số" trên màn Display (banner bật lên, có thể phát chime/tiếng).
- Ngôn ngữ giao diện: **tiếng Việt** hoàn toàn. Dùng chữ có dấu.
- Font: nạp qua Google Fonts link CDN: **Be Vietnam Pro, Oswald, JetBrains Mono**.
- Tuân thủ chính xác bảng màu và design system ở trên — không sáng tạo lại hướng thị giác.
- Thêm 1 trang **Hub điều hướng** (giống menu demo) liệt kê tất cả màn hình để dễ trình bày
  cho khách hàng/đơn vị.

## Định dạng đầu ra

- Code HTML hoàn chỉnh (1 file), kèm ghi chú ngắn ở cuối file giải thích cách mở và các màn.
