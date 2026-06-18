# 🧪 Kế Hoạch Kiểm Thử Toàn Diện — Bamso Queue Management System

> **Môi trường:** http://localhost:3000  
> **Tài khoản test:** admin / admin@2026 | canbo1 / canbo1@2026 | staff2 / staff2@2026  
> **Dữ liệu mẫu:** Dịch vụ A (Ưu tiên), Dịch vụ B (Thông thường)

---

## MODULE 1 — Health & Database

| # | Test Case | Bước thực hiện | Kết quả mong đợi | Trạng thái |
|---|-----------|---------------|-----------------|-----------|
| 1.1 | Health Check API | `GET /api/health` | `{"ok":true,"db":"connected"}` | ✅ |
| 1.2 | DB kết nối | Chạy dev server, mở `/` | Không có lỗi `PrismaClientInitializationError` | ✅ |
| 1.3 | **[OBSERVED] DB Schema** | `prisma/schema.prisma` | `provider = "sqlite"` | ✅ |

---

## MODULE 2 — Auth & Phân Quyền

| # | Test Case | Bước thực hiện | Kết quả mong đợi | Trạng thái |
|---|-----------|---------------|-----------------|-----------|
| 2.1 | Login thành công (Admin) | Mở `/login`, nhập `admin` / `admin@2026`, bấm Đăng nhập | Redirect sang `/admin` | ✅ |
| 2.2 | Login thành công (Staff) | Nhập `canbo1` / `canbo1@2026` | Redirect sang `/canbo` | ✅ |
| 2.3 | Login sai mật khẩu | Nhập `admin` / `saimatkhau` | Toast lỗi hiện ra, không redirect | ✅ |
| 2.4 | Truy cập protected route khi chưa login | Mở `/admin` khi chưa login | Redirect về `/login` (proxy.ts) | ✅ |
| 2.5 | Staff không được vào `/admin` | Login canbo1, thử mở `/admin` | Redirect về `/canbo` hoặc 403 | ✅ |
| 2.6 | Logout | Đang ở `/admin`, bấm nút Đăng xuất | Redirect về `/login`, cookie bị xóa | ✅ |
| 2.7 | Demo token API (STAFF role) | `GET /api/demo-token?role=STAFF` | Trả về `{token: "..."}` hợp lệ | ✅ |
| 2.8 | **[VERIFIED] Login thiếu username** | `POST /api/auth` với body `{password: "abc"}` | HTTP 400 `code: MISSING_CREDENTIALS` | ✅ |
| 2.9 | **[VERIFIED] Login thiếu password** | `POST /api/auth` với body `{username: "admin"}` | HTTP 400 `code: MISSING_CREDENTIALS` | ✅ |
| 2.10 | **[VERIFIED] Login với user không tồn tại** | `POST /api/auth` với `{username: "notexist", password: "abc"}` | HTTP 401 `code: INVALID_CREDENTIALS` | ✅ |
| 2.11 | **[VERIFIED] GET /api/auth/me với token hợp lệ** | Login admin, gọi `GET /api/auth/me` | Trả về `{id, username, name, role}` | ✅ |
| 2.12 | **[VERIFIED] GET /api/auth/me không có token** | Gọi `GET /api/auth/me` không kèm cookie | HTTP 401 `code: UNAUTHORIZED` | ✅ |
| 2.13 | **[VERIFIED] GET /api/auth/me với token hết hạn** | Gọi với token cũ/giả mạo | HTTP 401 `code: UNAUTHORIZED` | ✅ |
| 2.14 | **[VERIFIED] Demo token với role ADMIN** | `GET /api/demo-token?role=ADMIN` | Trả về `{token, role: "ADMIN"}` | ✅ |
| 2.15 | **[VERIFIED] Demo token với role KIOSK** | `GET /api/demo-token?role=KIOSK` | Trả về `{token, role: "KIOSK"}` | ✅ |
| 2.16 | **[VERIFIED] Demo token với role DISPLAY** | `GET /api/demo-token?role=DISPLAY` | Trả về `{token, role: "DISPLAY"}` | ✅ |

---

## MODULE 3 — Lấy Số (Ticket Creation)

| # | Test Case | Bước thực hiện | Kết quả mong đợi | Trạng thái |
|---|-----------|---------------|-----------------|-----------|
| 3.1 | Lấy số từ trang chủ (mobile) | Mở `/`, chọn Dịch vụ A, bấm Lấy số | Hiển thị số vé (A001, A002,...) | ✅ |
| 3.2 | Lấy số từ trang Get-ticket | Mở `/get-ticket`, chọn dịch vụ, điền thông tin, lấy số | Số vé được cấp, hiển thị xác nhận | ✅ |
| 3.3 | Lấy số từ Kiosk | Mở `/kiosk`, chọn dịch vụ | Số vé được cấp, hiển thị màn hình kiosk | ✅ |
| 3.4 | Ticket number tăng dần | Lấy 3 vé liên tiếp cùng dịch vụ | A001 → A002 → A003 | ✅ |
| 3.5 | **[FIXED]** Lấy số ngày mới không bị duplicate | Lấy số vào ngày hôm nay sau khi đã có vé ngày hôm qua | Không lỗi `duplicate key`, số vé hợp lệ | ✅ |
| 3.6 | POST thiếu serviceId | `POST /api/tickets` không có body | HTTP 400 với `code: MISSING_SERVICE_ID` | ✅ |
| 3.7 | POST với serviceId không tồn tại | `POST /api/tickets` với `serviceId` ngẫu nhiên | HTTP 400 với thông báo lỗi rõ ràng | ✅ |
| 3.8 | POST với dịch vụ không active | Tắt Dịch vụ B trong Admin, thử lấy số Dịch vụ B | Thông báo "Dịch vụ không hoạt động" | ✅ |
| 3.9 | **[VERIFIED] GET /api/tickets — danh sách theo service** | `GET /api/tickets?serviceId={id}` | Trả về danh sách vé của service đó, chỉ trong ngày | ✅ |
| 3.10 | **[VERIFIED] GET /api/tickets — filter theo status** | `GET /api/tickets?status=PENDING` | Chỉ trả về vé PENDING | ✅ |
| 3.11 | **[VERIFIED] GET /api/tickets — filter service + status** | `GET /api/tickets?serviceId={id}&status=CALLED` | Trả về vé CALLED của service đó | ✅ |
| 3.12 | **[VERIFIED] POST /api/tickets với customerName/phone** | `POST /api/tickets` với `{serviceId, customerName: "Nguyen Van A", phone: "0909999999"}` | Vé được tạo kèm thông tin khách hàng | ✅ |

---

## MODULE 4 — Hàng Đợi (Queue Management — Staff Panel)

| # | Test Case | Bước thực hiện | Kết quả mong đợi | Trạng thái |
|---|-----------|---------------|-----------------|-----------|
| 4.1 | Gọi số tiếp theo (Call Next) | Login staff, chọn dịch vụ A, bấm "Gọi số tiếp theo" | Vé `PENDING` có position nhỏ nhất chuyển sang `CALLED` | ✅ |
| 4.2 | Hoàn thành (Complete) | Sau khi gọi số, bấm "Hoàn tất" | Vé chuyển sang trạng thái `COMPLETED` | ✅ |
| 4.3 | Bỏ qua (Skip) lần 1 | Gọi số, bấm "Bỏ qua" | Vé chuyển `PENDING`, missCount = 1, position bị đẩy ra sau | ✅ |
| 4.4 | Bỏ qua (Skip) lần 2 | Skip vé đó thêm 1 lần | missCount = 2, position đẩy xa hơn | ✅ |
| 4.5 | Bỏ qua (Skip) đến MISSED | Skip đến khi missCount đạt giới hạn (theo skip_rules) | Vé chuyển `MISSED` | ✅ |
| 4.6 | Khôi phục (Restore) | Tìm vé `MISSED`, bấm "Khôi phục" | Vé về `PENDING`, position = min - 1 (ưu tiên đầu hàng đợi) | ✅ |
| 4.7 | Gọi số khi hàng trống | Hàng đợi dịch vụ A rỗng, bấm "Gọi số tiếp theo" | Toast/thông báo "Không còn số thứ tự" (HTTP 404) | ✅ |
| 4.8 | Thứ tự hàng đợi đúng | Tạo 5 vé, gọi liên tiếp | Gọi đúng thứ tự position 1→2→3→4→5 | ✅ |
| 4.9 | **[VERIFIED] Skip vé PENDING** | `PUT /api/queue/skip` với ticketId của vé `PENDING` | HTTP 400 — "Vé không ở trạng thái đang phục vụ để bỏ qua" | ✅ |
| 4.10 | **[VERIFIED] Complete vé COMPLETED** | `PUT /api/queue/complete` với ticketId của vé `COMPLETED` | HTTP 400 — "Vé không ở trạng thái đang phục vụ để hoàn thành" | ✅ |
| 4.11 | **[VERIFIED] Restore vé PENDING** | `PUT /api/queue/restore` với ticketId của vé `PENDING` | HTTP 400 — "Chỉ có thể khôi phục các vé ở trạng thái nhỡ lượt" | ✅ |
| 4.12 | **[VERIFIED] Restore nhiều vé PENDING** | Tạo 5 vé PENDING, skip 1 vé đến MISSED, restore | Vé restored có position = min-1 (ưu tiên trước tất cả) | ✅ |
| 4.13 | **[VERIFIED] Call-next với pos rỗng** | `POST /api/queue/call-next` với `{serviceId: "xxx", pos: ""}` | HTTP 400 `code: MISSING_FIELDS` | ✅ |

---

## MODULE 5 — SSE Real-time Updates

| # | Test Case | Bước thực hiện | Kết quả mong đợi | Trạng thái |
|---|-----------|---------------|-----------------|-----------|
| 5.1 | Cán bộ nhận cập nhật queue | Mở `/canbo` tab 1, tạo vé mới tab 2 | Danh sách hàng đợi tab 1 tự cập nhật | ✅ |
| 5.2 | Màn hình Display nhận gọi số | Mở `/display` tab 1, staff gọi số tab 2 | Màn hình hiển thị số vừa gọi ngay lập tức | ✅ |
| 5.3 | Track page nhận cập nhật | Mở `/track`, tra cứu vé đang PENDING, staff gọi vé đó | Trang track tự cập nhật trạng thái | ✅ |
| 5.4 | SSE reconnect sau khi mất mạng | Disconnect/reconnect mạng hoặc reload server | EventSource tự kết nối lại, không cần reload trang | ✅ |
| 5.5 | **[VERIFIED] SSE Queue filter theo serviceId** | Mở `GET /api/sse/queue?serviceId={id}` — tạo vé cho service khác | Client không nhận update cho service không được subscribe | ✅ |
| 5.6 | **[VERIFIED] SSE Queue update khi Complete** | Mở `/canbo` tab 1, staff complete vé tab 2 | Queue tự động cập nhật danh sách | ✅ |
| 5.7 | **[VERIFIED] SSE Queue update khi Skip** | Mở `/canbo` tab 1, staff skip vé tab 2 | Queue tự động cập nhật danh sách | ✅ |
| 5.8 | **[VERIFIED] SSE Queue update khi Restore** | Mở `/canbo` tab 1, staff restore vé tab 2 | Queue tự động cập nhật danh sách | ✅ |
| 5.9 | **[VERIFIED] SSE Display payload chính xác** | Staff gọi số, kiểm tra payload SSE display | Payload `{type: "DISPLAY_CALL", ticketNumber, pos}` chính xác | ✅ |

---

## MODULE 6 — Màn Hình Hiển Thị (Display Board)

| # | Test Case | Bước thực hiện | Kết quả mong đợi | Trạng thái |
|---|-----------|---------------|-----------------|-----------|
| 6.1 | Tải màn hình display | Mở `/display` | Hiển thị layout TV với danh sách chờ và ô số đang phục vụ | ✅ |
| 6.2 | Hiển thị số vừa gọi | Staff gọi số | Số vé và quầy hiển thị nổi bật trên màn hình | ✅ |
| 6.3 | TTS phát âm thanh | Staff gọi số, có loa | Giọng đọc Tiếng Việt "Mời số A001 đến Quầy số 5" | ✅ |
| 6.4 | TTS fallback | Tắt internet (Google TTS proxy fail) | Web Speech API fallback tự kích hoạt | ✅ |
| 6.5 | Highlight số hiện tại | Gọi nhiều số liên tiếp | Số mới nhất được highlight, các số cũ mờ đi | ✅ |
| 6.6 | **[VERIFIED] API /api/tts với text rỗng** | `GET /api/tts?text=` | HTTP 400 "Missing text parameter" | ✅ |
| 6.7 | **[VERIFIED] API /api/tts với text hợp lệ** | `GET /api/tts?text=Mời số A001 đến Quầy số 5` | HTTP 200, Content-Type: audio/mpeg | ✅ |

---

## MODULE 7 — Tra Cứu Vé (Track Page)

| # | Test Case | Bước thực hiện | Kết quả mong đợi | Trạng thái |
|---|-----------|---------------|-----------------|-----------|
| 7.1 | Tra cứu theo số vé | Mở `/track`, nhập `A001` | Hiển thị thông tin vé A001 | ✅ |
| 7.2 | Tra cứu theo SĐT | Nhập `0909999999` | Hiển thị vé khớp SĐT trong ngày | ✅ |
| 7.3 | Tra cứu không tìm thấy | Nhập `ZZZZZ` | Thông báo "Không tìm thấy vé" | ✅ |
| 7.4 | Tra cứu vé ngày hôm qua | Nhập ticketNumber của ngày hôm qua | Không tìm thấy (chỉ tra hôm nay) | ✅ |
| 7.5 | Màu sắc trạng thái | Tra vé PENDING / CALLED / COMPLETED / MISSED | Màu hiển thị khác nhau theo trạng thái | ✅ |
| 7.6 | **[VERIFIED] Track không có query param** | `GET /api/tickets/track` không có `?query=` | HTTP 400 `code: MISSING_QUERY_PARAM` | ✅ |

---

## MODULE 8 — Admin Panel

### 8A — Quản lý Dịch vụ

| # | Test Case | Bước thực hiện | Kết quả mong đợi | Trạng thái |
|---|-----------|---------------|-----------------|-----------|
| 8.1 | Xem danh sách dịch vụ | Login admin, vào `/admin` tab Dịch vụ | Hiển thị Dịch vụ A và B | ✅ |
| 8.2 | Thêm dịch vụ mới | Bấm Thêm, điền thông tin, lưu | Dịch vụ mới xuất hiện trong danh sách | ✅ |
| 8.3 | Sửa dịch vụ | Bấm Sửa dịch vụ A, đổi tên, lưu | Tên cập nhật ngay | ✅ |
| 8.4 | Bật/tắt dịch vụ | Toggle isActive của dịch vụ B | Dịch vụ B ẩn khỏi trang lấy số | ✅ |
| 8.5 | Xóa dịch vụ | Thêm dịch vụ test, xóa nó đi | Dịch vụ biến khỏi danh sách | ✅ |
| 8.16 | **[VERIFIED] POST /api/services — code đã tồn tại** | `POST /api/services` với code trùng | HTTP 409 `code: DUPLICATE_CODE` | ✅ |
| 8.17 | **[VERIFIED] POST /api/services — thiếu field** | `POST /api/services` chỉ gửi `{code: "X"}` | HTTP 400 `code: MISSING_FIELDS` | ✅ |
| 8.18 | **[VERIFIED] PUT /api/services — id không tồn tại** | `PUT /api/services` với id ngẫu nhiên | HTTP 404 `code: NOT_FOUND` (P2025) | ✅ |
| 8.19 | **[VERIFIED] DELETE /api/services — id không tồn tại** | `DELETE /api/services?id=xxx` với id ngẫu nhiên | HTTP 404 `code: NOT_FOUND` (P2025) | ✅ |
| 8.20 | **[VERIFIED] DELETE /api/services — soft-delete** | Xóa service đã có vé | Không xóa cứng, set `isActive = false` | ✅ |

### 8B — Quản lý Nhân viên

| # | Test Case | Bước thực hiện | Kết quả mong đợi | Trạng thái |
|---|-----------|---------------|-----------------|-----------|
| 8.6 | Xem danh sách nhân viên | Vào tab Nhân viên | Hiển thị admin, canbo1, staff2 | ✅ |
| 8.7 | Thêm nhân viên mới | Bấm Thêm, điền username/password/role | Nhân viên mới được tạo | ✅ |
| 8.8 | Sửa thông tin nhân viên | Sửa tên canbo1 | Tên cập nhật | ✅ |
| 8.9 | Xóa nhân viên | Xóa nhân viên test | Nhân viên biến khỏi danh sách | ✅ |
| 8.10 | Nhân viên mới đăng nhập được | Tạo staff3, logout, login với staff3 | Login thành công vào `/canbo` | ✅ |
| 8.21 | **[VERIFIED] POST /api/staff — thiếu field** | `POST /api/staff` thiếu `role` | HTTP 400 `code: MISSING_FIELDS` | ✅ |
| 8.22 | **[VERIFIED] POST /api/staff — role không hợp lệ** | `POST /api/staff` với `role: "MANAGER"` | HTTP 400 `code: INVALID_ROLE` | ✅ |
| 8.23 | **[VERIFIED] POST /api/staff — username trùng** | `POST /api/staff` với username `canbo1` | HTTP 409 `code: DUPLICATE_USERNAME` | ✅ |
| 8.24 | **[VERIFIED] PUT /api/staff — id không tồn tại** | `PUT /api/staff` với id ngẫu nhiên | HTTP 404 `code: NOT_FOUND` | ✅ |
| 8.25 | **[VERIFIED] DELETE /api/staff — id không tồn tại** | `DELETE /api/staff?id=xxx` với id ngẫu nhiên | HTTP 404 `code: NOT_FOUND` | ✅ |
| 8.26 | **[VERIFIED] PUT /api/staff — đổi mật khẩu** | `PUT /api/staff` với id canbo1, `{password: "newpass"}` | Mật khẩu được cập nhật, hash đúng | ✅ |

### 8C — Thống Kê (Stats)

| # | Test Case | Bước thực hiện | Kết quả mong đợi | Trạng thái |
|---|-----------|---------------|-----------------|-----------|
| 8.11 | Xem trang thống kê | Vào tab Thống kê | Hiển thị biểu đồ và số liệu (recharts) | ✅ |
| 8.12 | Số vé hôm nay | Tạo 3 vé, xem stats | Tổng vé hôm nay = 3 (hoặc cộng vào số hiện có) | ✅ |
| 8.13 | Tỉ lệ hoàn thành | Complete 2/3 vé, xem stats | Tỉ lệ hiển thị chính xác | ✅ |
| 8.27 | **[VERIFIED] Stats theo ngày cụ thể** | `GET /api/stats?date=2026-05-21` | Trả về thống kê của ngày 21/05/2026 | ✅ |
| 8.28 | **[VERIFIED] Stats — avgWaitTimeSeconds** | Tạo vé, complete sau 60s, xem stats | `avgWaitTimeSeconds` ≈ 60 (tính từ calledAt - createdAt) | ✅ |

### 8D — Cài Đặt (Settings)

| # | Test Case | Bước thực hiện | Kết quả mong đợi | Trạng thái |
|---|-----------|---------------|-----------------|-----------|
| 8.14 | Xem cài đặt | Vào tab Cài đặt | Hiển thị tên cơ quan và skip_rules | ✅ |
| 8.15 | Lưu tên cơ quan | Điền "Phòng Hành chính", lưu | `GET /api/settings?key=agency_name` trả về đúng | ✅ |
| 8.29 | **[VERIFIED] PUT /api/settings — thiếu key** | `PUT /api/settings` với body `{value: "test"}` | HTTP 400 `code: MISSING_PARAMS` | ✅ |
| 8.30 | **[VERIFIED] GET /api/settings — key không tồn tại** | `GET /api/settings?key=notexist` | Trả về `{key: "notexist", value: null}` | ✅ |
| 8.31 | **[VERIFIED] PUT /api/settings — cập nhật skip_rules** | `PUT /api/settings` với `{key: "skip_rules", value: "1,2,3,MISSED"}` | `GET /api/settings?key=skip_rules` trả về giá trị mới | ✅ |

---

## MODULE 9 — Demo & Kiosk

| # | Test Case | Bước thực hiện | Kết quả mong đợi | Trạng thái |
|---|-----------|---------------|-----------------|-----------|
| 9.1 | Trang Demo | Mở `/demo` | Hiển thị layout showcase đầy đủ | ✅ |
| 9.2 | Kiosk lấy số | Mở `/kiosk`, chọn dịch vụ | Số vé được cấp, hiển thị màn hình xác nhận | ✅ |
| 9.3 | Kiosk với `?kiosk=true` | Mở `/kiosk?kiosk=true` | Giao diện kiosk tablet đầy màn hình | ✅ |

---

## MODULE 10 — API Automation E2E

| # | Test Case | Bước thực hiện | Kết quả mong đợi | Trạng thái |
|---|-----------|---------------|-----------------|-----------|
| 10.1 | Chạy e2e-test.mjs | `node scratch/e2e-test.mjs` | Toàn bộ 8 bước PASS, không có lỗi | ✅ |
| 10.2 | Race condition call-next | Gọi đồng thời 5 request `call-next` | Mỗi request lấy 1 vé khác nhau, không có vé bị cấp 2 lần | ✅ |
| 10.3 | **[NEW] E2E — tạo vé → call-next → complete** | `node scratch/e2e-full.mjs` | Trạng thái cuối cùng là COMPLETED (script đã tạo) | 📄 |
| 10.4 | **[NEW] E2E — skip → MISSED** | Script tự động skip đến MISSED | Vé chuyển sang MISSED sau skip rules | 📄 |
| 10.5 | **[NEW] E2E — MISSED → restore → call-next** | Script restore vé MISSED và call-next | Vé restored được gọi trước các vé khác | 📄 |
| 10.6 | **[NEW] E2E — tạo nhiều vé, verify position** | Tạo 10 vé, kiểm tra position | position từ 1→10 theo đúng thứ tự tạo | 📄 |

> **📄 Ghi chú**: Script `scratch/e2e-full.mjs` đã được tạo. Cần chạy thực tế: `node scratch/e2e-full.mjs` (yêu cầu dev server đang chạy).

---

## MODULE 11 — Security & Authorization **[NEW]**

| # | Test Case | Bước thực hiện | Kết quả mong đợi | Trạng thái |
|---|-----------|---------------|-----------------|-----------|
| 11.1 | **[VERIFIED] POST /api/services — không có auth** | Gọi không kèm cookie/token | HTTP 401 `code: UNAUTHORIZED` (proxy.ts + requireRole) | ✅ |
| 11.2 | **[VERIFIED] POST /api/staff — không có auth** | Gọi không kèm cookie/token | HTTP 401 `code: UNAUTHORIZED` | ✅ |
| 11.3 | **[VERIFIED] PUT /api/settings — không có auth** | Gọi không kèm cookie/token | HTTP 401 `code: UNAUTHORIZED` | ✅ |
| 11.4 | **[VERIFIED] DELETE /api/services — không có auth** | Gọi không kèm cookie/token | HTTP 401 `code: UNAUTHORIZED` | ✅ |
| 11.5 | **[VERIFIED] DELETE /api/staff — không có auth** | Gọi không kèm cookie/token | HTTP 401 `code: UNAUTHORIZED` | ✅ |
| 11.6 | **[VERIFIED] Queue API — không có auth** | Gọi `POST /api/queue/call-next` không kèm cookie/token | HTTP 401 `code: UNAUTHORIZED` | ✅ |
| 11.7 | **[VERIFIED] GET /api/stats — không có auth** | Gọi không kèm cookie/token | HTTP 401 `code: UNAUTHORIZED` | ✅ |
| 11.8 | **[VERIFIED] Staff không được gọi API admin** | Login staff, thử `POST /api/services` | HTTP 403 `code: FORBIDDEN` (proxy.ts + requireRole ADMIN) | ✅ |
| 11.9 | **[VERIFIED] KIOSK role không được vào `/admin`** | Login KIOSK, thử mở `/admin` | Redirect về `/kiosk` (proxy.ts) | ✅ |
| 11.10 | **[VERIFIED] DISPLAY role không được vào `/admin`** | Login DISPLAY, thử mở `/admin` | Redirect về `/display` (proxy.ts) | ✅ |
| 11.11 | **[VERIFIED] httpOnly cookie** | Login, kiểm tra cookie `auth_token` | `httpOnly: true, secure: true (production), sameSite: lax` | ✅ |

---

## TỔNG KẾT

| Module | Tổng | ✅ Pass | ❌ Fail | 📄 Script (cần chạy) |
|--------|------|--------|--------|-------------------|
| 1. Health | 3 | 3 | 0 | 0 |
| 2. Auth | 16 | 16 | 0 | 0 |
| 3. Ticket | 12 | 12 | 0 | 0 |
| 4. Queue | 13 | 13 | 0 | 0 |
| 5. SSE | 9 | 9 | 0 | 0 |
| 6. Display | 7 | 7 | 0 | 0 |
| 7. Track | 6 | 6 | 0 | 0 |
| 8. Admin | 31 | 31 | 0 | 0 |
| 9. Demo/Kiosk | 3 | 3 | 0 | 0 |
| 10. E2E API | 6 | 2 | 0 | 4 |
| 11. Security | 11 | 11 | 0 | 0 |
| **TỔNG** | **117** | **113** | **0** | **4** |

---

## Ghi Chú Bug & Fix

| Bug | Mô tả | Trạng thái |
|-----|-------|-----------|
| Duplicate ticketNumber | `ticketNumber` có `@unique` constraint → lỗi khi lấy số ngày mới. Fix: bỏ `@unique` trong schema + `prisma db push`. | ✅ Đã fix |
| DB provider SQLite | `prisma/schema.prisma` dùng `provider = "sqlite"`, phù hợp cho dev/test. Postgres dùng cho production. | ✅ Nhất quán |
| Thiếu proxy/middleware | Các API không có kiểm tra JWT/cookie. Đã implement `requireRole()` + `proxy.ts` với role-based route protection. | ✅ Đã fix |
| Cập nhật proxy.ts | Nâng cấp từ middleware cũ sang Next.js 16 proxy convention. Thêm role-based redirect cho KIOSK/DISPLAY. | ✅ Đã fix |
| Thêm QR code | Thêm `QRCodeSVG` vào `WaitingTracker` — khách scan để theo dõi vé trên điện thoại. | ✅ Đã fix |
| E2E test script | Tạo `scratch/e2e-full.mjs` — test toàn diện 10+ modules. | 📄 Đã tạo |

---

## Hướng dẫn chạy E2E test

```bash
# Bước 1: Khởi động dev server
npm run dev

# Bước 2: Mở terminal khác, chạy E2E test
node scratch/e2e-full.mjs
```

Kết quả mong đợi: **113/117 test pass** (4 test E2E Module 10 cần chạy script thực tế).