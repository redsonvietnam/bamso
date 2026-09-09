# Workflow tổng hợp: Đa tài khoản Claude + Lưu trữ hội thoại

Tài liệu này gộp toàn bộ ý tưởng đã bàn thành quy trình dùng ngay. Đặt file
này ở gốc mỗi project để tự tra cứu.

---

## 1. Cấu trúc thư mục chuẩn (dùng chung cho mọi project)

```
project/
  HANDOFF.md              ← đọc BẮT BUỘC đầu mỗi phiên (trạng thái + việc tiếp theo)
  .opencode/
    command/
      handoff-init.md      ← sinh HANDOFF.md từ codebase (giai đoạn A)
      archive-compress.md  ← nén 1 file archive (giai đoạn D)
      context.md            ← đóng gói bug cho AI ngoài review (giai đoạn F)
  conversations/
    INDEX.md               ← mục lục nhẹ, có tag, đọc khi cần tra cứu chủ đề cũ
    archive/
      2026-08-06-topic-X.md   ← bản ghi đã nén của từng phiên/chủ đề
      2026-08-07-topic-Y.md
```

---

## 2. Có mấy "phiên/giai đoạn" và hoạt động ra sao

| # | Giai đoạn | Xảy ra khi nào | Việc chính | Máy nào chạy |
|---|---|---|---|---|
| A | **Khởi tạo project** | Lần đầu, chưa có HANDOFF.md | opencode khảo sát codebase → sinh `HANDOFF.md` (mục 0+1) | Máy local (opencode) |
| B | **Làm việc với Claude** | Mỗi phiên chat bình thường | Claude đọc HANDOFF.md đầu phiên → làm việc → cuối phiên cập nhật lại | Trên claude.ai (web/app) |
| C | **Đóng gói cuối phiên** | Sắp hết quota / đổi acc / hết chủ đề | Cập nhật HANDOFF.md + nén file thay đổi + (tuỳ) nén archive hội thoại | Claude làm ngay trong phiên đó |
| D | **Dọn dẹp/nén archive** | Định kỳ, hoặc khi archive quá dài | opencode nén nội dung archive cho gọn, cập nhật INDEX.md | Máy local (opencode) |
| E | **Chuyển acc / phiên mới** | Đổi tài khoản hoặc quay lại sau vài ngày | Upload zip + paste kickoff prompt → Claude đọc HANDOFF.md → làm tiếp | Trên claude.ai (acc mới) |
| F | **Đóng gói bug cho AI ngoài** | Cần một AI khác không có quyền đọc repo review/chẩn đoán 1 bug | opencode trace import graph từ file trung tâm, gửi ĐẦY ĐỮ file liên quan (không nén/lược) + môi trường + triệu chứng + commit hash | Máy local (opencode, lệnh `/context`) |

**Vòng lặp:** A → B → C → E → B → C → E ... (D chạy song song, không thường xuyên; F độc lập, chạy khi có bug cần review ngoài, không phụ thuộc A-E)

### Giai đoạn F khác A-E ở điểm nào

`/context` phục vụ **người/AI ngoài hệ thống**, không đọc được HANDOFF.md hay biết gì về project — nên phải gửi đủ, không nén như `conversations/archive/`. Có 2 nguyên tắc dùng chung với hệ thống A-E:
- **Chỉ gửi diff từ lần gửi thứ 2 trở đi** (kèm commit hash neo) — cùng nguyên lý "chỉ gửi phần thay đổi" như khi đóng gói zip ở giai đoạn C.
- **Ghi commit hash mỗi khi verify** — nên áp dụng ngược lại cho `HANDOFF.md`: khi tag một mục là "verified", kèm luôn commit hash lúc verify để phiên sau biết chắc trạng thái đó ứng với code nào.

Nếu AI ngoài đưa ra chẩn đoán/giải pháp đáng nhớ, có thể nén lại vào `conversations/archive/` qua `/archive-compress` sau đó — nhưng bản thân `/context` không phụ thuộc gì vào `HANDOFF.md` hay `conversations/`.

---

## 3. Máy nào — copy gì

### 🖥️ Trên máy local (chạy opencode)

**Lúc khởi tạo project (giai đoạn A):**
Copy prompt này vào opencode:

```
Hãy khảo sát toàn bộ codebase trong thư mục hiện tại và tạo file HANDOFF.md
ở gốc project, với nội dung sau (tự đọc code, package manifest, README,
config, git log — đừng hỏi lại tôi trừ khi thực sự không suy ra được):

## 0. Tổng quan dự án (LUÔN GHI ĐÈ — không append)
- Là gì / mục đích
- Stack / công nghệ chính
- Cấu trúc chính (routes, module, entry points)
- Model dữ liệu / concepts quan trọng, nếu có
- Phần logic dễ vỡ nhất / rủi ro nhất
- Cách chạy / build / test (lệnh cụ thể, copy chính xác)

## 1. Trạng thái hiện tại (LUÔN GHI ĐÈ)
- Việc gì ĐÃ xong và ĐÃ VERIFY thật
- Việc gì ĐÃ xong nhưng CHƯA verify
- Việc gì CẦN USER QUYẾT ĐỊNH

## 2. Việc cần làm tiếp theo, theo thứ tự ưu tiên
(để trống hoặc điền sơ bộ nếu đã biết)

## 3. Changelog theo phiên (APPEND-ONLY)
(để trống, phiên đầu tiên với Claude sẽ là entry #1)

Viết ngắn gọn, ưu tiên chính xác hơn đầy đủ. Nếu không chắc, ghi "chưa xác
minh" thay vì đoán.
```

**Định kỳ dọn archive (giai đoạn D):**

```
Nén file conversations/archive/<session>.md theo quy tắc:
- GIỮ: quyết định đã chốt, lý do đằng sau quyết định, số liệu/config cụ thể,
  lỗi đã gặp và cách đã fix
- BỎ: các bước thử-sai không dẫn đến kết quả cuối, hỏi-đáp trùng lặp
- Không tóm tắt quá tay đến mức mất tên biến/tên file/lệnh chính xác
Sau khi nén, cập nhật dòng tương ứng trong conversations/INDEX.md.
```

**Đóng gói bug cho AI ngoài review (giai đoạn F) — lệnh `/context`:**

Đã có sẵn dưới dạng file lệnh `.opencode/command/context.md`. Dùng khi cần một
AI khác (không đọc được repo) chẩn đoán bug: `/context <mô tả bug>`. Khác các
lệnh trên ở chỗ gửi ĐẦY ĐỮ file liên quan (trace theo import graph), không nén
— vì AI kia không có ngữ cảnh nền như Claude trong project của bạn. Từ lần
gửi thứ 2 trở đi (cùng luồng bug), chỉ cần kèm thêm git diff từ commit neo lần
trước, không gửi lại toàn bộ.

---

### 💬 Trên claude.ai (mỗi lần chat)

**Đầu phiên (nếu có HANDOFF.md từ trước) — paste kèm file:**

```
Đây là bàn giao từ phiên trước cho dự án <tên>. Đọc kỹ HANDOFF.md — bắt đầu
từ mục "Tổng quan dự án" — và toàn bộ file đính kèm trước khi làm gì khác.
Xác nhận ngắn gọn (1-2 câu) là đã hiểu bối cảnh, rồi làm luôn theo đúng thứ
tự ưu tiên ở mục "Việc cần làm tiếp theo" — không cần hỏi lại tôi trừ khi có
mục cần tôi quyết định sản phẩm. Nếu gần hết quota/context, hãy chủ động báo
và cập nhật lại HANDOFF.md trước khi dừng, đừng để tôi phải nhắc.
```

**Cuối phiên (khi sắp hết quota / đổi acc / xong việc) — chỉ cần nói:**

```
Sắp hết quota / cần dừng ở đây. Tổng hợp lại HANDOFF.md và đóng gói file cần
thiết trước khi dừng.
```

Claude sẽ tự động:
- Cập nhật `HANDOFF.md` (ghi đè mục 0-1, append mục 3, cập nhật mục 2)
- Đóng gói zip chỉ gồm **file mới/đã sửa** (không nén lại file gốc chưa đổi) + `HANDOFF.md`
- Nếu nội dung phiên đáng lưu lâu dài → thêm bản nén vào `conversations/archive/` + 1 dòng vào `INDEX.md`
- Tóm tắt ngắn gọn bằng lời (không đọc lại cả file)

---

## 4. Checklist nhanh — dùng option nào khi nào

| Tình huống | Đọc gì đầu phiên | Cập nhật gì cuối phiên |
|---|---|---|
| **Nhiều acc, đang code dở** | `HANDOFF.md` (bắt buộc) | `HANDOFF.md` + zip file thay đổi |
| **1 acc, chỉ muốn lưu trữ tra cứu** | `INDEX.md` (nếu cần tìm chủ đề cũ) | `archive/<ngày-chủ-đề>.md` + dòng mới trong `INDEX.md` |
| **Vừa code vừa muốn lưu lại lý do quyết định** | Cả hai | Cả hai — không loại trừ nhau |

---

## 5. Lưu ý quan trọng

- **Không** upload lại toàn bộ `conversations/archive/` mỗi phiên — chỉ đọc khi cần tra cứu cụ thể, nếu không sẽ tốn quota ngược lại.
- **Không** nén lại file gốc chưa thay đổi vào zip cuối phiên — chỉ file mới/sửa.
- Archive giữ **quyết định + lý do**, không giữ nguyên văn thử-sai qua lại.
- Nếu changelog trong `HANDOFF.md` dài quá ~3 phiên → gộp phần cũ nhất vào `HANDOFF-archive.md` riêng (khác với `conversations/archive/`).