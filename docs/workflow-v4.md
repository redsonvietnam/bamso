# AI Workflow V4 — Bamso

Workflow gọn cho repo **đã mature** (rebuild v1.0 xong). Thay thế dần `workflow.md` V3.5 (838 dòng, thiết kế cho greenfield 3-agent).

**Roadmap tooling:** [`tooling-roadmap.md`](tooling-roadmap.md)

---

## Trước khi code — agent đọc gì?

| Tình huống | Đọc |
|---|---|
| Mọi task | `AGENTS.md` |
| Chạy DB, auth, queue | `CLAUDE.md` |
| UI/UX | `docs/design-system/perspective/` |
| Kiến trúc / quyết định cũ | `blueprint.md`, `decisions.md` |
| Hiểu codebase | `codegraph sync .` rồi hỏi agent (Phase 1) |

---

## Luồng A — Bug fix / tweak nhỏ

1. Mô tả bug + file liên quan (nếu biết)
2. Agent sửa — tuân `AGENTS.md` (surgical changes)
3. Verify: `npm run lint`, `node scratch/e2e-test.mjs`

Không cần Spec Kit.

---

## Luồng B — Feature mới (v2.x)

1. **Specify** — mô tả what/why (chat hoặc `/speckit.specify` khi Phase 2 bật)
2. **Clarify** — agent hỏi tối đa 3 câu nếu mơ hồ
3. **Plan** — tham chiếu stack có sẵn (`CLAUDE.md`, `decisions.md`), không reinvent
4. **Implement** — trên nhánh `dev`, diff tối thiểu
5. **Verify** — e2e + kiểm tra UI thủ công các route chạm tới

### Gate trước merge `dev` → `main`

- [ ] `npm run build` pass
- [ ] `node scratch/e2e-test.mjs` pass
- [ ] Không secrets trong diff
- [ ] `codegraph sync .` nếu đổi nhiều file

---

## Luồng C — Chỉ design / token

1. Sửa `docs/design-system/perspective/DESIGN.md` (tokens)
2. Sửa `SKILL.md` nếu đổi quy tắc UX
3. Áp `globals.css` + components
4. Visual check: `/`, `/waiting`, `/admin`, `/display`

Có thể regenerate bằng `npx typeui.sh` nếu đổi theme lớn.

---

## So với V3.5

| V3.5 | V4 |
|---|---|
| Claude Web → Cursor 3-agent | Một agent chính (Cursor), tài liệu trong repo |
| Tạo SPEC + BLUEPRINT mỗi lần | Dùng `blueprint.md` + Spec Kit **per feature** |
| Copy prompt dài | `AGENTS.md` + rules tự load |
| Không index code | CodeGraph sync |

File `workflow.md` (V3.5) giữ làm **archive** — tham khảo prompt template khi cần.
