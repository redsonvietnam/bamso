# CLAUDE.md — Hướng dẫn Phát triển & Lệnh Vận hành

Tệp tin này đóng vai trò hướng dẫn nhanh về các lệnh vận hành cốt lõi và tiêu chuẩn lập trình dành cho các lập trình viên hoặc AI Coding Assistant tiếp theo làm việc trên repository này.

---

## 🛠️ Lệnh Vận Hành Cơ Bản

### 1. Khởi chạy & Phát triển
*   **Chạy môi trường cục bộ (Windows 1-Click):** Click chạy tệp `run-local.bat` ở thư mục gốc để tự động kích hoạt PostgreSQL (cổng 5433) và Next.js Dev Server (cổng 3000).
*   **Chạy thủ công:**
    *   **Postgres DB:** `& "C:\Program Files\PostgreSQL\18\bin\postgres.exe" -D d:\Bamso\pgdata`
    *   **Web Server:** `npm run dev`
*   **Biên dịch kiểm tra (Production Build):** `npm run build`

### 2. Thao tác Cơ sở dữ liệu (Prisma & Postgres)
*   **Đồng bộ cấu trúc bảng:** `npx prisma db push`
*   **Gieo dữ liệu hạt giống (Seed):** `npx prisma db seed`
*   **Xem dữ liệu trực quan qua Web:** `npx prisma studio`

### 3. Kiểm thử Tự động (Integration Test)
*   **Khởi chạy kịch bản E2E Test:** `node scratch/e2e-test.mjs`

---

## 📐 Quy Tắc & Chuẩn Lập Trình (Code Guidelines)

### 1. Quy ước Đặt tên (Naming Conventions)
*   **API Routes:** Sử dụng chữ thường viết nối bằng dấu gạch ngang (kebab-case). Ví dụ: `/api/queue/call-next`, `/api/queue/skip`.
*   **Components:** Viết hoa chữ cái đầu (PascalCase). Ví dụ: `QueuePanel.tsx`, `LiveTracker.tsx`.
*   **Stores & Hooks:** Viết thường chữ đầu (camelCase). Ví dụ: `auth.store.ts`, `useSpeech.ts`.
*   **Database Fields:** Prisma mặc định sử dụng camelCase để đồng bộ hóa cấu trúc TypeScript tốt nhất.

### 2. Thiết kế Kiến trúc & Xử lý Ngoại lệ
*   **Xác thực (Auth):** Bắt buộc sử dụng `jose` để ký và giải mã JWT. Token lưu trữ trong HttpOnly Cookie tên `auth_token`. Tuyệt đối không dùng localStorage cho thông tin bảo mật.
*   **Bảo vệ định tuyến:** Sử dụng tệp chặn điều hướng trung gian [src/proxy.ts](file:///d:/Bamso/src/proxy.ts) để kiểm tra phiên hoạt động và vai trò.
*   **Thứ tự hàng đợi (Queue Ordering):** Toàn bộ việc sắp xếp hàng đợi bắt buộc sử dụng trường số nguyên `position`. Tuyệt đối không dùng `createdAt` để sắp xếp.
*   **Giao dịch (Transactions):** Mọi thao tác gọi số (`callNextTicket`), bỏ qua (`skipTicket`) và khôi phục (`restoreTicket`) bắt buộc phải bọc trong `prisma.$transaction` để chống race-condition.
*   **SSE Broker:** Khi gọi các hàm của `sseBroker` (ví dụ: `broadcastQueueUpdate`), luôn sử dụng các hàm đã được liên kết tường minh `.bind(sseBroker)` để tránh mất ngữ cảnh `this`.
*   **Xử lý lỗi API:** Các API phải trả về định dạng chuẩn `{ error: string, code: string }` kèm HTTP Status Code chính xác (401, 403, 400, 404, 500).

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **bamso** (1303 symbols, 2824 relationships, 105 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> Index stale? Run `node .gitnexus/run.cjs analyze` from the project root — it auto-selects an available runner. No `.gitnexus/run.cjs` yet? `npx gitnexus analyze` (npm 11 crash → `npm i -g gitnexus`; #1939).

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows. For regression review, compare against the default branch: `detect_changes({scope: "compare", base_ref: "main"})`.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `rename` which understands the call graph.
- NEVER commit changes without running `detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/bamso/context` | Codebase overview, check index freshness |
| `gitnexus://repo/bamso/clusters` | All functional areas |
| `gitnexus://repo/bamso/processes` | All execution flows |
| `gitnexus://repo/bamso/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
