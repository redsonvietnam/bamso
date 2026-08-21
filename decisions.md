[DECISION #001]
Quyết định: Rebuild hoàn toàn thay vì refactor
Lý do: 3 critical bugs (createdAt hack, race condition, auth localStorage)
  đan xen vào nhau — fix 1 cái phá cái kia. Nhanh hơn khi viết lại sạch.
Đã cân nhắc: Refactor tại chỗ — bác vì technical debt quá sâu trong core logic
Ngày: 2026-05-19

[DECISION #002]
Quyết định: Dùng Supabase chỉ làm PostgreSQL host, không dùng Supabase SDK
Lý do: Prototype mix Prisma + Supabase client gây conflict và fail silently.
  Prisma làm tất cả, Supabase chỉ là connection string.
Đã cân nhắc: Supabase full (Auth + Realtime) — bác vì vendor lock-in,
  Supabase Realtime phức tạp hơn SSE cho use case này
Ngày: 2026-05-19
Trạng thái: SUPERSEDED — Rebuild v1.0 chạy trên SQLite (prisma/schema.prisma provider = "sqlite").
  PostgreSQL/Supabase là plan cũ chưa triển khai. Xem CR-3A reconciliation.

[DECISION #003]
Quyết định: SSE thay vì WebSocket
Lý do: Queue management là 1 chiều (server push to client).
  SSE đơn giản hơn, native Next.js Route Handler, EventSource tự reconnect.
Đã cân nhắc: WebSocket — bác vì cần server stateful riêng,
  phức tạp hơn với Next.js App Router
Ngày: 2026-05-19

[DECISION #004]
Quyết định: Jose JWT + httpOnly cookie thay localStorage
Lý do: localStorage không secure, không có expiry enforcement,
  API routes không thể verify. httpOnly cookie fix toàn bộ.
Đã cân nhắc: NextAuth — bác vì overkill cho 4 roles đơn giản,
  thêm dependency không cần thiết
Ngày: 2026-05-19

[DECISION #005]
Quyết định: position field riêng để sort hàng đợi
Lý do: Prototype hack createdAt để skip/restore gây sai báo cáo
  và race condition. Field position tách biệt rõ ràng "thứ tự xử lý"
  khỏi "thời gian tạo".
Đã cân nhắc: Giữ createdAt sort — bác vì không thể fix race condition
Ngày: 2026-05-19