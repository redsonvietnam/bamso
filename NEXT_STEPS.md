# BAMSO — Đã sửa gì & cần làm tiếp gì

Tài liệu này dành cho AI coding agent (Cline / Antigravity / opencode...) tiếp
tục làm việc trên repo này. Được viết bởi Claude sau khi audit bảo mật +
sửa trực tiếp một phần code. **Đọc hết phần "Việc cần làm ngay" trước khi
động vào bất kỳ file nào** — vài mục có phụ thuộc lẫn nhau.

---

## 1. Đã sửa xong trong đợt này (không cần làm lại)

| # | Vấn đề | File | Tóm tắt cách sửa |
|---|---|---|---|
| 1 | `/api/demo-token` cấp JWT ADMIN không cần đăng nhập (backdoor) | `src/app/api/demo-token/route.ts` | Chặn hoàn toàn trừ khi `DEMO_MODE_ENABLED=true`; **không bao giờ** cấp role ADMIN qua endpoint này nữa dù bật hay không; thêm rate limit |
| 2 | SSML injection trong TTS | `src/app/api/tts/route.ts` | Escape XML cho `text` trước khi build SSML (`escapeForSsml`); validate `voice` theo whitelist `EDGE_VOICE_IDS` |
| 3 | `/api/tts` là proxy mở, không giới hạn | `src/app/api/tts/route.ts` | Giới hạn `text` ≤ 500 ký tự; rate limit 30 req/phút/IP |
| 4 | Không có rate limit ở đâu cả | `src/lib/rate-limit.ts` (mới) | Module dùng chung, backed bởi Redis (INCR+EXPIRE), fail-open (không chặn app nếu Redis chết) có log lỗi. Đã áp vào `/api/tts`, `/api/tickets`, `/api/auth`, `/api/demo-token` |
| 5 | `ticketNumber` không unique → 2 khách cùng số | `prisma/schema.prisma`, `src/lib/ticket-service.ts` | Thêm field `dayKey` ("YYYY-MM-DD"), khôi phục `@@unique([serviceId, dayKey, ticketNumber])` đúng phạm vi + retry-on-conflict (bắt lỗi P2002, thử lại tối đa 5 lần) thay vì bỏ hẳn constraint |
| 6 | PBKDF2 chỉ 1000 vòng lặp | `src/lib/password.ts` | Nâng lên 210.000 vòng (khuyến nghị OWASP); lưu iteration count trong hash (`iterations:salt:hash`) để tương thích ngược; dùng `timingSafeEqual` |
| 7 | Hash mật khẩu cũ (1000 vòng) sẽ mãi yếu nếu không migrate | `src/app/api/auth/route.ts`, `src/lib/password.ts` (`needsRehash`) | Tự động rehash ngay khi user login thành công — không cần script migration riêng |
| 8 | JWT_SECRET có fallback cứng trong code | `src/lib/auth.ts` | Bỏ fallback, throw lỗi rõ ràng nếu thiếu env; bắt buộc ≥32 ký tự khi `NODE_ENV=production` |
| 9 | 2 bộ Redis client trùng lặp, bộ tốt hơn lại không được dùng | `src/lib/redis.ts` | Hợp nhất: giữ `redis.ts`/`sse-broker.ts` (đang dùng thật), thêm `retryStrategy` + `enableOfflineQueue:false` + log lỗi kết nối. Đã **xoá** `src/lib/redis-client.ts` và `src/lib/pub-sub.ts` (dead code, chỉ được import bởi test của chính nó) |
| 10 | Redis publish lỗi có thể làm treo/crash request | `src/lib/sse-broker.ts` | `broadcastQueueUpdate`/`broadcastDisplayCall` không còn `await` việc publish Redis trước khi phát local; lỗi publish được `.catch()` và log, không propagate; lỗi subscribe lúc init cũng được bắt (chạy chế độ single-instance nếu Redis chết) |
| 11 | Code trùng lặp | `src/lib/edge-tts-wrapper.js` | Đã **xoá** (bản sao y hệt logic đã có trong `api/tts/route.ts`, không nơi nào import) |
| 12 | `.env.example` thiếu hướng dẫn | `.env.example` | Thêm ghi chú cho `JWT_SECRET` (cách generate), `REDIS_*`, `DEMO_MODE_ENABLED` |

**Cập nhật (lượt sửa thứ 2):** khác với bản đầu tiên của tài liệu này, lần
này tôi **đã cài được `npm install` thành công** trong sandbox (lần trước bị
ngắt giữa chừng do lỗi registry mirror, xem `SETUP_CONTEXT.md` Bước 1 để
biết chi tiết + cách né lỗi này) và đã chạy `eslint` sạch trên toàn bộ file
đã sửa. Tuy nhiên `npx prisma generate` **vẫn không chạy được trong sandbox
của tôi** vì cần tải engine binary từ `binaries.prisma.sh`, domain này không
nằm trong whitelist mạng của môi trường Claude — đây là giới hạn riêng của
sandbox, không phải lỗi thật của code. Vì vậy `tsc --noEmit` báo hàng loạt
lỗi kiểu `Module '"@prisma/client"' has no exported member 'Service'` — toàn
bộ là cascading từ việc thiếu Prisma client generated, **không phải bug thật**
(đã kiểm tra: các lỗi này xuất hiện ở cả những file tôi không hề đụng vào).
Việc đầu tiên bạn/agent cần làm ở máy thật là chạy đúng theo
**`SETUP_CONTEXT.md`** (file mới, đi kèm với file này) — nó sẽ giải quyết
toàn bộ các bước cài đặt/generate mà tôi không tự verify được ở đây.

Việc đầu tiên bạn nên làm là:

```bash
npm install
npx prisma generate
npx prisma db push        # tạo lại DB với field dayKey mới (xem mục 2.2)
npm run type-check         # hoặc: npx tsc --noEmit
npm run lint
npm run test
npm run build
```

Nếu có lỗi type/lint phát sinh từ các file tôi sửa (khác lỗi
`@prisma/client` kiểu trên), khả năng cao là lỗi nhỏ (thiếu import, sai tên
field) — sửa tại chỗ, không cần thiết kế lại.

---

## 2. Việc cần làm ngay (P0 — chưa sửa, quan trọng)

### 2.1. ⚠️ Xung đột SQLite vs PostgreSQL — cần chốt trước khi làm gì khác

`prisma/schema.prisma` khai báo `provider = "sqlite"` và `.env.example` có
`DATABASE_URL="file:./dev.db"`. Nhưng `CLAUDE.md` và `run-local.bat` lại mô
tả quy trình chạy local là khởi động **PostgreSQL thật** (`postgres.exe`,
cổng 5433). Hai thứ này không thể cùng đúng — Prisma không cho phép
`provider: sqlite` trỏ vào connection string Postgres.

**Cần làm:** xác nhận thực tế đang dùng DB nào (kiểm tra `.env` thật, không
phải `.env.example`), rồi:
- Nếu đang thật sự dùng Postgres → sửa `provider = "postgresql"` trong
  `schema.prisma`, cập nhật `.env.example` cho khớp, xoá phần SQLite khỏi
  `README.md`/`CLAUDE.md` nếu còn nhắc tới.
- Nếu vẫn đang dùng SQLite (Postgres chỉ là thử nghiệm dở dang) → cập nhật
  lại `CLAUDE.md`/`run-local.bat` cho khớp thực tế, tránh gây nhầm cho agent
  sau.

Việc này ảnh hưởng trực tiếp tới mục 2.2 bên dưới.

### 2.2. Áp dụng schema mới (field `dayKey`) vào database

Tôi đã sửa `schema.prisma` thêm field `dayKey` và khôi phục `@@unique`. Repo
này dùng `prisma db push` (không có thư mục `prisma/migrations`), nên:

```bash
npx prisma db push
```

- File `prisma/dev.db` cũ **đã bị xoá** khỏi bản zip này (vì nó không khớp
  schema mới, và không nên đóng gói DB dev vào source code). Chạy lệnh trên
  để tạo DB mới, rồi `npx prisma db seed` nếu cần dữ liệu mẫu.
- Nếu đây là môi trường **production đã có dữ liệu thật**: `dayKey` được đặt
  `@default("")` để tránh lỗi NOT NULL khi thêm cột vào bảng đã có dữ liệu,
  nhưng các vé cũ sẽ có `dayKey = ""` — cần viết một script backfill một lần
  để tính lại `dayKey` từ `createdAt` cho các row cũ trước khi tin tưởng vào
  `@@unique` constraint với dữ liệu lịch sử. Vé mới tạo sau khi deploy code
  này sẽ luôn có `dayKey` đúng (tính trong `ticket-service.ts`).

### 2.3. ✅ Đã sửa thêm (sau bản đầu tiên): race condition ở `callNextTicket`/`completeTicket`/`skipTicket`/`restoreTicket`

Cập nhật so với bản gốc của tài liệu này: tôi đã quay lại sửa tiếp phần này,
**không còn là việc "chưa làm" nữa**. Cụ thể trong `src/lib/queue-service.ts`:

- `callNextTicket`: trước đây `findFirst` rồi `update` không điều kiện — dưới
  PostgreSQL, 2 quầy gọi cùng lúc có thể cùng nhận được cùng 1 khách (cùng
  đọc thấy vé đó là "tiếp theo" trước khi bên kia commit). Giờ dùng
  `updateMany({ where: { id, status: PENDING } })` để "claim" có điều kiện;
  nếu `count === 0` (bị quầy khác giành mất), tự động thử lại với vé tiếp
  theo, tối đa 5 lần.
- `completeTicket`: gộp check-status + update thành 1 `updateMany` điều kiện
  duy nhất thay vì đọc-rồi-ghi tách rời hai bước.
- `skipTicket` / `restoreTicket`: bước ghi trạng thái cuối cùng giờ có điều
  kiện `status` khớp với lúc đọc đầu transaction; nếu lệch (bị request khác
  đổi state chen giữa) → throw lỗi rõ ràng để client biết cần thử lại, thay
  vì âm thầm ghi đè.

**Vẫn còn mở (chưa sửa, mức độ thấp hơn):** phần dịch chuyển hàng loạt
`position` trong `skipTicket` (đoạn `updateMany({ position: { increment: 1 } })`)
vẫn có thể bị lệch thứ tự nhẹ nếu 2 lệnh skip cho cùng dịch vụ chạy đúng lúc
cùng lúc dưới Postgres — khác với bug đã sửa ở trên, cái này **không** gây
trùng số/gọi nhầm khách hàng, chỉ có thể khiến thứ tự hàng chờ bị xê dịch
tạm thời (tự điều chỉnh lại ở lần skip/gọi tiếp theo). Nếu muốn xử lý triệt
để, cần điều kiện hoá luôn bước `updateMany` này (tương tự pattern ở trên)
hoặc chuyển sang `isolationLevel: 'Serializable'` cho toàn bộ transaction.

---

## 3. Việc nên làm sớm (P1)

### 3.1. Viết test cho `queue-service.ts`

Đây là file nghiệp vụ rủi ro cao nhất (transaction, skip-rules) nhưng
**chưa có test nào**. Thư mục `src/lib/__tests__/` hiện chỉ test các hàm
thuần (cccd-parser, tts-service, logger) — chưa test được gì có Prisma.
Gợi ý cách làm: dùng một SQLite file tạm cho test (`prisma db push` vào
`file:./test.db` trong `beforeAll`), gọi thẳng các hàm thật thay vì mock
Prisma, để test được luôn cả phần transaction/concurrency logic — đó mới là
phần dễ có bug nhất.

Ít nhất nên cover:
- `callNextTicket`: có vé pending → gọi đúng vé kế tiếp; không có vé pending
  → throw đúng lỗi; tự động complete vé đang gọi dở nếu có.
- `completeTicket`: happy path; gọi complete vé sai status → throw.
- `skipTicket`: đúng logic đẩy lùi vị trí theo `skip_rules` trong Settings;
  đúng ngưỡng chuyển sang MISSED.
- `createTicket` (đã sửa): 2 lần gọi liên tiếp không bao giờ trùng
  `ticketNumber` — viết test giả lập gọi song song (`Promise.all`) để xác
  nhận retry-on-conflict hoạt động.

### 3.2. `/api/settings` có 2 lớp bảo vệ không nhất quán

Route này nằm trong danh sách public path của middleware (`proxy.ts`, để
`GET` phục vụ trang khách hàng), nhưng `PUT` tự gọi `requireRole('ADMIN')`
bên trong handler — **hiện đang an toàn**, nhưng chỉ vì người viết route này
nhớ tự thêm check. Không có gì đảm bảo route mới thêm sau sẽ nhớ làm vậy.

**Đề xuất:** tách middleware để phân biệt theo method (không chỉ theo path),
hoặc quy ước bắt buộc: mọi route ghi dữ liệu (PUT/POST/DELETE) phải tự gọi
`requireRole()`/`requireAuth()` ở dòng đầu tiên của handler, và thêm việc
này vào checklist review code (có thể ghi thẳng vào `AGENTS.md`/`CLAUDE.md`
đã có sẵn trong repo, để agent sau tự nhớ).

### 3.3. Dọn tài liệu/schema linh tinh

- `parseFullCCCDData` trong `src/lib/cccd-parser.ts`: comment mô tả format
  (`ID_NUMBER|FULL_NAME|DATE_OF_BIRTH|...`) **không khớp** với code thực tế
  (code lấy `fullName` ở `parts[2]`, đúng theo format QR CCCD thật là
  `số CCCD|số CCCD cũ|họ tên|...`, nhưng comment không nhắc tới trường thứ 2
  này). Sửa lại comment cho đúng để agent sau không bị hiểu nhầm.
- Field `date` trên model `Ticket` (`prisma/schema.prisma`) được set mặc
  định nhưng **không được đọc ở bất kỳ đâu** trong code (đã grep xác nhận).
  Cân nhắc xoá hẳn (cùng đợt migration ở mục 2.2) hoặc thực sự dùng nó thay
  vì tính `startOfDay`/`endOfDay` mỗi lần — nếu dùng, nên đổi toàn bộ các
  chỗ query theo `createdAt` range (`queue-service.ts`, `sse-broker.ts`,
  `api/stats`, `api/tickets`) sang so sánh bằng `dayKey` mới thêm, vừa đúng
  vừa nhanh hơn (equality index thay vì range scan).

### 3.4. Không có CI/CD

Không thấy GitHub Actions hay pipeline nào chạy `type-check`/`lint`/`test`
tự động. Với việc nhiều agent AI khác nhau cùng sửa code (Cline, opencode,
các model khác nhau theo bạn mô tả), rủi ro một agent merge code phá vỡ agent
khác đã làm là rất cao nếu không có gate tự động. Gợi ý tối thiểu: 1 workflow
chạy `npm ci && npm run type-check && npm run lint && npm run test` trên mỗi
lần có thay đổi, kể cả chỉ chạy local qua git hook (`husky` + `lint-staged`)
nếu chưa muốn setup CI cloud.

---

## 4. Việc có thể làm sau (P2 — không khẩn cấp)

- Rate limit hiện dùng Redis `INCR`+`EXPIRE` đơn giản (fixed window) — đủ
  dùng cho quy mô hiện tại nhưng có nhược điểm burst ở ranh giới window. Nếu
  cần chính xác hơn, cân nhắc sliding window hoặc token bucket.
- `src/lib/tts-service.ts` và các unofficial API (Google Translate TTS, MS
  Edge TTS) là rủi ro vận hành dài hạn — Microsoft/Google có thể chặn/đổi
  API bất kỳ lúc nào vì đây không phải API chính thức. Nên có phương án dự
  phòng (TTS engine khác, hoặc cache sẵn các câu thông báo cố định thành
  file audio thay vì gọi API mỗi lần).
- Cân nhắc thêm `Content-Security-Policy` header và các security header
  khác (hiện chưa thấy cấu hình trong `next.config.ts`).

---

## 5. Giai đoạn tiếp theo: Giao diện (UI)

Theo yêu cầu của chủ dự án: **chỉ bắt đầu phần UI sau khi các mục P0 ở trên
(mục 2) đã xong và đã verify build/test chạy được thật**, không làm song
song để tránh vừa sửa bug vừa đổi UI cùng lúc gây khó review. Khi tới lượt
UI, đọc thêm `frontend-design` guidance nếu agent đó có sẵn, và ưu tiên các
màn hình khách hàng thấy nhiều nhất trước: `DisplayBoard.tsx` (màn hình lớn
hiển thị số đang gọi), trang `get-ticket` (lấy số), và `WaitingTracker.tsx`
(theo dõi vị trí chờ).

---

## 6. Danh sách file đã đụng tới trong đợt sửa này (tra nhanh)

```
prisma/schema.prisma                         (Ticket: +dayKey, +@@unique, +@@index)
src/lib/rate-limit.ts                        (MỚI)
src/lib/ticket-service.ts                    (retry-on-conflict, dayKey)
src/lib/queue-service.ts                     (claim có điều kiện + retry cho callNextTicket; atomic completeTicket; guard skipTicket/restoreTicket)
src/lib/password.ts                          (210k iterations, needsRehash, timingSafeEqual)
src/lib/auth.ts                              (bỏ fallback JWT secret)
src/lib/redis.ts                             (retryStrategy, enableOfflineQueue:false)
src/lib/sse-broker.ts                        (publish best-effort, không throw)
src/app/api/demo-token/route.ts              (chặn ADMIN, cần DEMO_MODE_ENABLED)
src/app/api/tts/route.ts                     (escape SSML, whitelist voice, rate limit)
src/app/api/tickets/route.ts                 (validate input, rate limit)
src/app/api/auth/route.ts                    (rate limit, auto-rehash password cũ)
.env.example                                 (thêm hướng dẫn JWT_SECRET/REDIS/DEMO_MODE)

ĐÃ XOÁ:
src/lib/redis-client.ts                      (dead code, hợp nhất vào redis.ts)
src/lib/pub-sub.ts                           (dead code, hợp nhất vào sse-broker.ts)
src/lib/edge-tts-wrapper.js                  (dead code, trùng logic trong api/tts/route.ts)
src/lib/__tests__/pub-sub.test.ts            (test của module đã xoá)
```
