# 🧪 Kế Hoạch Kiểm Thử Toàn Diện — Bamso Queue Management System

> **Môi trường:** http://localhost:3000  
> **Tài khoản test:** admin / admin@2026 | staff1 / staff1@2026 | staff2 / staff2@2026  
> **Dữ liệu mẫu:** Dịch vụ A (Ưu tiên), Dịch vụ B (Thông thường)

---

## MODULE 1 — Health & Database

| # | Test Case | Bước thực hiện | Kết quả mong đợi | Trạng thái |
|---|-----------|---------------|-----------------|-----------|
| 1.1 | Health Check API | `GET /api/health` | `{"ok":true,"db":"connected"}` | ⬜ |
| 1.2 | DB kết nối với Postgres | Chạy dev server, mở `/` | Không có lỗi `PrismaClientInitializationError` | ⬜ |

---

## MODULE 2 — Auth & Phân Quyền

| # | Test Case | Bước thực hiện | Kết quả mong đợi | Trạng thái |
|---|-----------|---------------|-----------------|-----------|
| 2.1 | Login thành công (Admin) | Mở `/login`, nhập `admin` / `admin@2026`, bấm Đăng nhập | Redirect sang `/admin` | ⬜ |
| 2.2 | Login thành công (Staff) | Nhập `staff1` / `staff1@2026` | Redirect sang `/canbo` | ⬜ |
| 2.3 | Login sai mật khẩu | Nhập `admin` / `saimatkhau` | Toast lỗi hiện ra, không redirect | ⬜ |
| 2.4 | Truy cập protected route khi chưa login | Mở `/admin` khi chưa login | Redirect về `/login` | ⬜ |
| 2.5 | Staff không được vào `/admin` | Login staff1, thử mở `/admin` | Redirect về `/canbo` hoặc 403 | ⬜ |
| 2.6 | Logout | Đang ở `/admin`, bấm nút Đăng xuất | Redirect về `/login`, cookie bị xóa | ⬜ |
| 2.7 | Demo token API (STAFF role) | `GET /api/demo-token?role=STAFF` | Trả về `{token: "..."}` hợp lệ | ⬜ |

---

## MODULE 3 — Lấy Số (Ticket Creation)

| # | Test Case | Bước thực hiện | Kết quả mong đợi | Trạng thái |
|---|-----------|---------------|-----------------|-----------|
| 3.1 | Lấy số từ trang chủ (mobile) | Mở `/`, chọn Dịch vụ A, bấm Lấy số | Hiển thị số vé (A001, A002,...) | ⬜ |
| 3.2 | Lấy số từ trang Get-ticket | Mở `/get-ticket`, chọn dịch vụ, điền thông tin, lấy số | Số vé được cấp, hiển thị xác nhận | ⬜ |
| 3.3 | Lấy số từ Kiosk | Mở `/kiosk`, chọn dịch vụ | Số vé được cấp, hiển thị màn hình kiosk | ⬜ |
| 3.4 | Ticket number tăng dần | Lấy 3 vé liên tiếp cùng dịch vụ | A001 → A002 → A003 | ⬜ |
| 3.5 | **[FIXED]** Lấy số ngày mới không bị duplicate | Lấy số vào ngày hôm nay sau khi đã có vé ngày hôm qua | Không lỗi `duplicate key`, số vé hợp lệ | ⬜ |
| 3.6 | POST thiếu serviceId | `POST /api/tickets` không có body | HTTP 400 với `code: MISSING_SERVICE_ID` | ⬜ |
| 3.7 | POST với serviceId không tồn tại | `POST /api/tickets` với `serviceId` ngẫu nhiên | HTTP 400 / 500 với thông báo lỗi rõ ràng | ⬜ |
| 3.8 | POST với dịch vụ không active | Tắt Dịch vụ B trong Admin, thử lấy số Dịch vụ B | Thông báo "Dịch vụ không hoạt động" | ⬜ |

---

## MODULE 4 — Hàng Đợi (Queue Management — Staff Panel)

| # | Test Case | Bước thực hiện | Kết quả mong đợi | Trạng thái |
|---|-----------|---------------|-----------------|-----------|
| 4.1 | Gọi số tiếp theo (Call Next) | Login staff, chọn dịch vụ A, bấm "Gọi số tiếp theo" | Vé `PENDING` có position nhỏ nhất chuyển sang `CALLED` | ⬜ |
| 4.2 | Hoàn thành (Complete) | Sau khi gọi số, bấm "Hoàn tất" | Vé chuyển sang trạng thái `COMPLETED` | ⬜ |
| 4.3 | Bỏ qua (Skip) lần 1 | Gọi số, bấm "Bỏ qua" | Vé chuyển `PENDING`, missCount = 1, position bị đẩy ra sau | ⬜ |
| 4.4 | Bỏ qua (Skip) lần 2 | Skip vé đó thêm 1 lần | missCount = 2, position đẩy xa hơn | ⬜ |
| 4.5 | Bỏ qua (Skip) đến MISSED | Skip đến khi missCount đạt giới hạn (theo skip_rules) | Vé chuyển `MISSED` | ⬜ |
| 4.6 | Khôi phục (Restore) | Tìm vé `MISSED`, bấm "Khôi phục" | Vé về `PENDING`, position = min - 1 (ưu tiên đầu hàng đợi) | ⬜ |
| 4.7 | Gọi số khi hàng trống | Hàng đợi dịch vụ A rỗng, bấm "Gọi số tiếp theo" | Toast/thông báo "Không còn số thứ tự" (HTTP 404) | ⬜ |
| 4.8 | Thứ tự hàng đợi đúng | Tạo 5 vé, gọi liên tiếp | Gọi đúng thứ tự position 1→2→3→4→5 | ⬜ |

---

## MODULE 5 — SSE Real-time Updates

| # | Test Case | Bước thực hiện | Kết quả mong đợi | Trạng thái |
|---|-----------|---------------|-----------------|-----------|
| 5.1 | Cán bộ nhận cập nhật queue | Mở `/canbo` tab 1, tạo vé mới tab 2 | Danh sách hàng đợi tab 1 tự cập nhật | ⬜ |
| 5.2 | Màn hình Display nhận gọi số | Mở `/display` tab 1, staff gọi số tab 2 | Màn hình hiển thị số vừa gọi ngay lập tức | ⬜ |
| 5.3 | Track page nhận cập nhật | Mở `/track`, tra cứu vé đang PENDING, staff gọi vé đó | Trang track tự cập nhật trạng thái | ⬜ |
| 5.4 | SSE reconnect sau khi mất mạng | Disconnect/reconnect mạng hoặc reload server | EventSource tự kết nối lại, không cần reload trang | ⬜ |

---

## MODULE 6 — Màn Hình Hiển Thị (Display Board)

| # | Test Case | Bước thực hiện | Kết quả mong đợi | Trạng thái |
|---|-----------|---------------|-----------------|-----------|
| 6.1 | Tải màn hình display | Mở `/display` | Hiển thị layout TV với danh sách chờ và ô số đang phục vụ | ⬜ |
| 6.2 | Hiển thị số vừa gọi | Staff gọi số | Số vé và quầy hiển thị nổi bật trên màn hình | ⬜ |
| 6.3 | TTS phát âm thanh | Staff gọi số, có loa | Giọng đọc Tiếng Việt "Mời số A001 đến Quầy số 5" | ⬜ |
| 6.4 | TTS fallback | Tắt internet (Google TTS proxy fail) | Web Speech API fallback tự kích hoạt | ⬜ |
| 6.5 | Highlight số hiện tại | Gọi nhiều số liên tiếp | Số mới nhất được highlight, các số cũ mờ đi | ⬜ |

---

## MODULE 7 — Tra Cứu Vé (Track Page)

| # | Test Case | Bước thực hiện | Kết quả mong đợi | Trạng thái |
|---|-----------|---------------|-----------------|-----------|
| 7.1 | Tra cứu theo số vé | Mở `/track`, nhập `A001` | Hiển thị thông tin vé A001 | ⬜ |
| 7.2 | Tra cứu theo SĐT | Nhập `0909999999` | Hiển thị vé khớp SĐT trong ngày | ⬜ |
| 7.3 | Tra cứu không tìm thấy | Nhập `ZZZZZ` | Thông báo "Không tìm thấy vé" | ⬜ |
| 7.4 | Tra cứu vé ngày hôm qua | Nhập ticketNumber của ngày hôm qua | Không tìm thấy (chỉ tra hôm nay) | ⬜ |
| 7.5 | Màu sắc trạng thái | Tra vé PENDING / CALLED / COMPLETED / MISSED | Màu hiển thị khác nhau theo trạng thái | ⬜ |

---

## MODULE 8 — Admin Panel

### 8A — Quản lý Dịch vụ

| # | Test Case | Bước thực hiện | Kết quả mong đợi | Trạng thái |
|---|-----------|---------------|-----------------|-----------|
| 8.1 | Xem danh sách dịch vụ | Login admin, vào `/admin` tab Dịch vụ | Hiển thị Dịch vụ A và B | ⬜ |
| 8.2 | Thêm dịch vụ mới | Bấm Thêm, điền thông tin, lưu | Dịch vụ mới xuất hiện trong danh sách | ⬜ |
| 8.3 | Sửa dịch vụ | Bấm Sửa dịch vụ A, đổi tên, lưu | Tên cập nhật ngay | ⬜ |
| 8.4 | Bật/tắt dịch vụ | Toggle isActive của dịch vụ B | Dịch vụ B ẩn khỏi trang lấy số | ⬜ |
| 8.5 | Xóa dịch vụ | Thêm dịch vụ test, xóa nó đi | Dịch vụ biến khỏi danh sách | ⬜ |

### 8B — Quản lý Nhân viên

| # | Test Case | Bước thực hiện | Kết quả mong đợi | Trạng thái |
|---|-----------|---------------|-----------------|-----------|
| 8.6 | Xem danh sách nhân viên | Vào tab Nhân viên | Hiển thị admin, staff1, staff2 | ⬜ |
| 8.7 | Thêm nhân viên mới | Bấm Thêm, điền username/password/role | Nhân viên mới được tạo | ⬜ |
| 8.8 | Sửa thông tin nhân viên | Sửa tên staff1 | Tên cập nhật | ⬜ |
| 8.9 | Xóa nhân viên | Xóa nhân viên test | Nhân viên biến khỏi danh sách | ⬜ |
| 8.10 | Nhân viên mới đăng nhập được | Tạo staff3, logout, login với staff3 | Login thành công vào `/canbo` | ⬜ |

### 8C — Thống Kê (Stats)

| # | Test Case | Bước thực hiện | Kết quả mong đợi | Trạng thái |
|---|-----------|---------------|-----------------|-----------|
| 8.11 | Xem trang thống kê | Vào tab Thống kê | Hiển thị biểu đồ và số liệu | ⬜ |
| 8.12 | Số vé hôm nay | Tạo 3 vé, xem stats | Tổng vé hôm nay = 3 (hoặc cộng vào số hiện có) | ⬜ |
| 8.13 | Tỉ lệ hoàn thành | Complete 2/3 vé, xem stats | Tỉ lệ hiển thị chính xác | ⬜ |

### 8D — Cài Đặt (Settings)

| # | Test Case | Bước thực hiện | Kết quả mong đợi | Trạng thái |
|---|-----------|---------------|-----------------|-----------|
| 8.14 | Xem cài đặt | Vào tab Cài đặt | Hiển thị tên cơ quan và skip_rules | ⬜ |
| 8.15 | Lưu tên cơ quan | Điền "Phòng Hành chính", lưu | `GET /api/settings?key=agency_name` trả về đúng | ⬜ |

---

## MODULE 9 — Demo & Kiosk

| # | Test Case | Bước thực hiện | Kết quả mong đợi | Trạng thái |
|---|-----------|---------------|-----------------|-----------|
| 9.1 | Trang Demo | Mở `/demo` | Hiển thị layout showcase đầy đủ | ⬜ |
| 9.2 | Kiosk lấy số | Mở `/kiosk`, chọn dịch vụ | Số vé được cấp, hiển thị màn hình xác nhận | ⬜ |
| 9.3 | Kiosk với `?kiosk=true` | Mở `/kiosk?kiosk=true` | Giao diện kiosk tablet đầy màn hình | ⬜ |

---

## MODULE 10 — API Automation E2E

| # | Test Case | Bước thực hiện | Kết quả mong đợi | Trạng thái |
|---|-----------|---------------|-----------------|-----------|
| 10.1 | Chạy e2e-test.mjs | `node scratch/e2e-test.mjs` | Toàn bộ 8 bước PASS, không có lỗi | ⬜ |
| 10.2 | Race condition call-next | Gọi đồng thời 5 request `call-next` | Mỗi request lấy 1 vé khác nhau, không có vé bị cấp 2 lần | ⬜ |

---

## TỔNG KẾT

| Module | Tổng | ✅ Pass | ❌ Fail | ⬜ Chưa test |
|--------|------|--------|--------|------------|
| 1. Health | 2 | | | 2 |
| 2. Auth | 7 | | | 7 |
| 3. Ticket | 8 | | | 8 |
| 4. Queue | 8 | | | 8 |
| 5. SSE | 4 | | | 4 |
| 6. Display | 5 | | | 5 |
| 7. Track | 5 | | | 5 |
| 8. Admin | 15 | | | 15 |
| 9. Demo/Kiosk | 3 | | | 3 |
| 10. E2E API | 2 | | | 2 |
| **TỔNG** | **59** | | | **59** |

---

## Ghi Chú Bug Đã Phát Hiện & Fix

| Bug | Mô tả | Trạng thái |
|-----|-------|-----------|
| Duplicate ticketNumber | `ticketNumber` có `@unique` constraint → lỗi khi lấy số ngày mới (A001 bị trùng). Fix: bỏ `@unique` trong schema + `prisma db push`. | ✅ Đã fix |
| DB không khởi động | Dev server cần PostgreSQL chạy trước. Nếu chạy `npm run dev` trực tiếp mà không qua `run-local.bat` thì lỗi `Can't reach database server`. | ✅ Đã ghi nhận |
