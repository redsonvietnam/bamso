# SETUP CONTEXT — đọc trước khi làm bất cứ việc gì khác

Đây là bản BAMSO đã được vá một loạt lỗi bảo mật + concurrency (xem
`NEXT_STEPS.md` để biết chi tiết đã sửa gì / còn gì phải làm). Tài liệu này
CHỈ nói về cách cài đặt & chạy được, không lặp lại nội dung `NEXT_STEPS.md`.

Hãy làm đúng thứ tự các bước dưới đây. Đừng bắt đầu sửa code trước khi chạy
được `npm run dev` thành công.

---

## Bước 0 — Yêu cầu môi trường

- Node.js ≥ 20 (khuyến nghị 22).
- Redis đang chạy (local hoặc Docker) — app dùng Redis cho: đồng bộ real-time
  giữa nhiều instance (SSE pub/sub) và rate limiting. **App vẫn khởi động
  được nếu không có Redis** (đã thiết kế fail-open/degrade), nhưng để test
  đúng hành vi thật (nhiều màn hình cập nhật đồng thời) thì nên có Redis
  chạy. Nếu chưa có, cách nhanh nhất: `docker run -d -p 6379:6379 redis`.
- Một database: SQLite (canonical — không cần cài gì thêm). PostgreSQL là plan cũ đã superseded (xem `decisions.md` #002).

## Bước 1 — Cài dependencies

```bash
npm install
```

**Nếu gặp lỗi `403 Forbidden` nhắc tới `registry.npmmirror.com`:** máy/tài
khoản npm của bạn có cấu hình registry mirror ở đâu đó (global `.npmrc`).
Cài lại bằng:

```bash
npm install --registry=https://registry.npmjs.org/
```

(Bản zip này đã xoá `package-lock.json` cũ — file cũ có các URL resolved
trỏ thẳng vào `registry.npmmirror.com`, đây chính là lỗi tôi gặp phải khi
thử cài trong sandbox của mình. `package-lock.json` mới sẽ được tạo lại khi
bạn chạy `npm install` lần đầu ở máy bạn.)

## Bước 2 — Database: SQLite (canonical)

`prisma/schema.prisma` dùng `provider = "sqlite"`. Đây là kiến trúc runtime
hiện tại, đã được xác nhận trong CR-3 (decisions.md #002 — PostgreSQL/Supabase
đánh dấu SUPERSEDED).

```bash
# .env
DATABASE_URL="file:./dev.db?socket_timeout=5&connection_limit=1"
```

Không cần sửa gì thêm trong `schema.prisma`.

> **Lịch sử:** Tài liệu này trước đây trình bày PostgreSQL như một lựa chọn
> актив. Điều đó không còn đúng — SQLite là canonical. PostgreSQL material
> dưới đây được giữ lại làm tài liệu lịch sử cho ai cần reference kiến trúc
> cũ.

## Bước 3 — Tạo file `.env`

```bash
cp .env.example .env
```

Rồi điền các giá trị **bắt buộc**:

```bash
# Bắt buộc — app sẽ từ chối khởi động nếu thiếu (đây là fix chủ đích, không
# phải bug). Generate bằng:
#   openssl rand -base64 48
# (Windows không có openssl sẵn: dùng PowerShell:
#   [Convert]::ToBase64String((1..48 | ForEach-Object { Get-Random -Maximum 256 })) )
JWT_SECRET="<dán chuỗi random ở đây, tối thiểu 32 ký tự>"

DATABASE_URL="file:./dev.db?socket_timeout=5&connection_limit=1"

REDIS_HOST="localhost"
REDIS_PORT="6379"
REDIS_PASSWORD=""

# Để "false" trừ khi bạn đang cố tình bật trang /demo để demo cho khách xem
# sản phẩm mà không cần đăng nhập. Route /api/demo-token sẽ trả về 403 nếu
# biến này không đúng bằng "true". Ngay cả khi bật, endpoint này KHÔNG BAO
# GIỜ cấp được role ADMIN nữa (đã sửa — xem NEXT_STEPS.md mục đã sửa #1).
DEMO_MODE_ENABLED="false"
```

## Bước 4 — Khởi tạo database

```bash
npx prisma generate
npx prisma db push
npx prisma db seed        # nếu muốn có tài khoản/dịch vụ mẫu để test
```

Tài khoản mẫu sau khi seed (xem `prisma/seed.ts` nếu cần đổi):
- `admin` / `admin@2026`
- `canbo1` / `canbo1@123`
- `staff2` / `staff2@2026`

> Lưu ý: `prisma generate` cần tải engine binary từ `binaries.prisma.sh`.
> Trong sandbox của Claude việc này bị chặn bởi whitelist mạng (đây là giới
> hạn riêng của môi trường Claude, không phải lỗi của bạn) nên tôi **chưa
> tự chạy được** lệnh này để verify 100%. Ở máy bạn với mạng bình thường,
> lệnh này chạy được ngay — nếu vẫn lỗi, đó mới là vấn đề thật cần xử lý
> (kiểm tra firewall/proxy công ty nếu có).

## Bước 5 — Chạy thử

```bash
npm run dev
```

Mở `http://localhost:3000`, thử luồng cơ bản:
1. Vào `/get-ticket`, chọn 1 dịch vụ, lấy số → phải ra vé mới, không lỗi.
2. Đăng nhập ở `/canbo` bằng tài khoản `canbo1` → vào được trang cán bộ,
   bấm "Gọi số tiếp theo" → phải gọi được vé vừa tạo.
3. Gọi thử `curl http://localhost:3000/api/demo-token?role=ADMIN` → phải
   nhận **403**, không phải token (đây là test xác nhận fix bảo mật #1 hoạt
   động đúng).

## Bước 6 — Verify code trước khi sửa tiếp

```bash
npx tsc --noEmit      # type-check
npm run lint
npm run test           # test hiện có (còn thiếu test cho queue-service.ts — xem NEXT_STEPS.md 3.1)
npm run build
```

Nếu `tsc --noEmit` báo lỗi `Module '"@prisma/client"' has no exported
member 'Service'/'Ticket'` hàng loạt → nghĩa là `npx prisma generate` chưa
chạy thành công (Bước 4). Chạy lại bước đó trước, đừng sửa code để "fix"
mấy lỗi này — chúng tự hết khi Prisma client được generate đúng.

---

## Sau khi xong tất cả các bước trên và app chạy ổn

Đọc `NEXT_STEPS.md`, làm theo đúng thứ tự ưu tiên P0 → P1 → P2 ghi trong
đó. Mục 2.3 (race condition trong `queue-service.ts`) **đã được Claude sửa
thêm** sau khi viết `NEXT_STEPS.md` lần đầu — cụ thể: `callNextTicket` giờ
dùng claim có điều kiện + retry (chống 2 quầy gọi trùng 1 khách),
`completeTicket` giờ atomic, `skipTicket`/`restoreTicket` có guard chống
ghi đè state đã đổi bởi request khác chen giữa. Phần **chưa** sửa (vẫn còn
mở) là việc dịch chuyển `position` hàng loạt trong `skipTicket` có thể bị
lệch thứ tự nhẹ nếu 2 request skip chạy đúng lúc cùng lúc cho cùng 1 dịch
vụ — mức độ ảnh hưởng thấp hơn nhiều so với bug đã sửa (không gây trùng số/
gọi nhầm khách, chỉ có thể lệch thứ tự hàng chờ tạm thời), nên để lại làm
sau.

Việc còn thiếu quan trọng nhất là **mục 3.1 — viết test cho
`queue-service.ts`**: tôi (Claude) không viết được vì sandbox của tôi không
generate được Prisma client nên không có cách nào tự chạy để verify test có
đúng không — viết mà không chạy được thì rủi ro tự tạo thêm bug trong chính
bộ test, nên tôi chủ động không làm. Đây là việc nên làm ngay sau khi Bước 6
ở trên chạy sạch.
