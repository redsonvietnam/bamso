# Tooling Roadmap — Bamso (nhánh `dev`)

Kế hoạch áp dụng công cụ AI **từng bước**, tránh thay đổi đột ngột và trùng lặp tài liệu.

**Nguyên tắc:**
- Mỗi phase = 1 thay đổi có thể verify độc lập
- Không ghi đè tài liệu hiện có — **trỏ tới** hoặc **bổ sung**
- `main` giữ ổn định; thử nghiệm trên `dev`
- Sau mỗi phase: chạy `node scratch/e2e-test.mjs` (khi server đang chạy)

---

## Trạng thái hiện tại

| Tài liệu / Tool | Vai trò | Trạng thái |
|---|---|---|
| `AGENTS.md` | Hành vi agent + Next.js + design system | ✅ Active |
| `CLAUDE.md` | Ops + quy ước Bamso | ✅ Active |
| `.cursor/rules/` | Cursor auto-load | ✅ Active |
| `docs/design-system/` | UI tokens (typeui.sh / Perspective) | ✅ Active |
| `workflow.md` V3.5 | 3-agent prompts (838 dòng) | 📦 Archive — tham khảo |
| `docs/workflow-v4.md` | Workflow mới, gọn | ✅ Active |
| CodeGraph | Index codebase cho agent | ✅ Phase 1 (init xong) |
| Spec Kit | SDD per-feature | ⏳ Phase 2 |
| Codebuff | CLI agent riêng | ⏳ Phase 3 (tùy chọn) |

---

## Phase 1 — CodeGraph (đã bắt đầu)

**Mục tiêu:** Agent hiểu cấu trúc code mà không sửa logic app.

**Thao tác:**
```bash
codegraph init .          # lần đầu
codegraph sync .          # sau khi đổi code nhiều
```

**Rủi ro:** Thấp — chỉ thêm `.codegraph/` (index local).

**Verify:** `codegraph` không ảnh hưởng build; e2e vẫn pass.

---

## Phase 2 — Spec Kit (light init)

**Khi nào:** Khi bắt đầu **feature mới** có scope rõ (v2.x).

**Mục tiêu:** `/speckit.specify` → `plan` → `tasks` → `implement` cho từng feature.

**Thao tác dự kiến:**
```bash
specify init . --ai cursor --ignore-agent-tools
```

**Quan trọng — không duplicate:**
- Constitution → trỏ `AGENTS.md` + `CLAUDE.md` (không viết lại)
- Plan → tham chiếu `blueprint.md`, `decisions.md`
- Implement → vẫn chạy e2e sau mỗi feature

**Rủi ro:** Trung bình — thêm `.specify/`, slash commands. Chỉ làm trên `dev`, merge `main` khi ổn.

---

## Phase 3 — Codebuff (tùy chọn)

**Khi nào:** Nếu bạn dùng Codebuff CLI thường xuyên, song song Cursor.

**Mục tiêu:** `.agents/` cho workflow terminal riêng.

**Rủi ro:** Trung bình — thêm config agent; có thể overlap Cursor. **Chỉ bật nếu thực sự dùng.**

---

## Phase 4 — Dọn tài liệu (cuối)

- Gộp `DESIGN.md` root → chỉ giữ `docs/design-system/`
- Rút gọn `workflow.md` V3.5 thành archive hoặc xóa phần trùng
- Cập nhật `README.md` mục “AI workflow”

---

## Luồng làm việc đề xuất (V4)

Xem [`docs/workflow-v4.md`](workflow-v4.md).

```
Feature mới?
  → /speckit.specify (Phase 2+) hoặc mô tả ngắn trong chat
  → codegraph sync (nếu codebase đổi nhiều)
  → Cursor implement trên nhánh dev
  → node scratch/e2e-test.mjs
  → merge dev → main
```

Bug nhỏ / UI tweak?
  → Đọc AGENTS.md + design-system
  → Sửa trực tiếp, không cần Spec Kit

---

## Nhánh Git

| Nhánh | Mục đích |
|---|---|
| `main` | Production-ready, merge có kiểm soát |
| `dev` | Thử tooling, feature, refactor |
| `agents/pull-latest-code-from-github` | Worktree cũ — có thể xóa khi không dùng |
