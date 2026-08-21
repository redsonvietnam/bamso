BLUEPRINT.md — Queue Management System REBUILD v1.0

A. Stack & Công nghệ
LayerChọnLý doBỏ gì từ prototypeFrameworkNext.js 15 (App Router)Giữ — team quen, SSE support nativeTurbopack (unstable) → dùng WebpackLanguageTypeScript strict modeGiữ + bật strict—DatabaseSQLite (via Prisma) — PostgreSQL/Supabase là plan cũ, chưa triển khaiProduction ready, transaction supportSQLite + Prisma CLIORMPrisma (SQLite adapter)Giữ API quen thuộc, chỉ đổi datasourceBỏ Supabase JS client hoàn toànReal-timeSSE (native Next.js Route Handler)Đơn giản hơn WebSocket, đủ cho use case 1 chiều server→clientBỏ polling setIntervalAuthJose (JWT) + middleware Next.jsLightweight, không vendor lock-inBỏ Supabase Auth, localStorage session, backdoorUITailwind CSS + shadcn/uiGiữ — nhất quán với prototypeBỏ Google Material Symbols CDNStateZustandDùng thật — global store cho auth + queue stateBỏ prop drilling + useState rải rácChartsRechartsGiữ—TTSGoogle Translate proxy + Web Speech fallbackGiữ nguyên logic—FontBe Vietnam Pro onlyGiữ 1 font, bỏ conflictBỏ InterToastSonnerGiữ—

B. Cấu trúc thư mục
src/
├── app/
│   ├── (public)/               # Routes không cần auth
│   │   ├── page.tsx            # Trang chủ lấy số (mobile)
│   │   ├── get-ticket/
│   │   ├── track/
│   │   ├── kiosk/
│   │   ├── display/
│   │   └── demo/
│   ├── (auth)/
│   │   └── login/
│   ├── canbo/                  # Protected: STAFF
│   ├── admin/                  # Protected: ADMIN
│   └── api/
│       ├── auth/               # POST login → JWT
│       ├── tickets/            # POST create ticket
│       ├── queue/              # POST call-next, PUT complete/skip/restore
│       ├── services/           # CRUD đầy đủ
│       ├── staff/              # CRUD đầy đủ
│       ├── stats/              # GET real stats
│       ├── settings/           # GET/PUT key-value
│       ├── tts/                # Proxy Google TTS
│       └── sse/
│           ├── queue/          # SSE stream: queue events
│           └── display/        # SSE stream: display board events
├── components/
│   ├── ui/                     # shadcn primitives
│   ├── customer/               # LiveTracker, ServiceSelector
│   ├── staff/                  # QueuePanel, CallButton
│   ├── display/                # DisplayBoard, TTSTrigger
│   └── admin/                  # ServicesPanel, StaffPanel, StatsPanel, SettingsPanel
├── stores/
│   ├── auth.store.ts           # Zustand: user, token, role
│   └── queue.store.ts          # Zustand: currentTicket, queueSnapshot
├── lib/
│   ├── db.ts                   # Prisma client singleton
│   ├── auth.ts                 # signJWT, verifyJWT (jose)
│   ├── sse.ts                  # SSE helper: createStream, broadcast
│   ├── queue.ts                # Business logic: callNext (transaction), skip, restore
│   ├── ticket-number.ts        # generateTicketNumber với reset theo ngày
│   └── tts.ts                  # TTS proxy + fallback logic
├── middleware.ts               # Verify JWT cho tất cả protected routes
└── types/
    └── index.ts                # TicketStatus enum đầy đủ (gồm MISSED)

C. Danh sách module — thứ tự triển khai
#ModuleMô tảDependencyStory1DB Schema + SeedPrisma schema Postgres, seed demo users + services—All2Auth (JWT)Login API, verifyJWT, middleware, 4 rolesModule 1S83Ticket CreationPOST /api/tickets, generateTicketNumber với reset ngàyModule 1-2S1, S24Queue CorecallNext với transaction, complete, skip/restore với position fieldModule 3S55SSE Infrastructure/api/sse/queue + /api/sse/display, broadcast helperModule 4S3, S66LiveTracker UIComponent subscribe SSE, hiển thị status + màuModule 5S37Staff UIQueuePanel, gọi số, xác nhận, bỏ quaModule 5S58Display BoardLayout TV, SSE subscribe, trigger TTSModule 5S69TTSProxy route + useSpeech hook với fallbackModule 8S610Track PageTra cứu theo số phiếu / SĐT, SSE nếu chưa xongModule 5S411Admin CRUDServices/Staff CRUD đầy đủ (có PUT/DELETE), SettingsModule 2S712Stats RealavgWaitTime từ DB, biểu đồ theo giờ realModule 11S713Kiosk ModeLayout tablet, ?kiosk=true, role KIOSKModule 3S214Demo Showcase/demo với seed JWT demo, iframe layoutModule 2S9

D. Quy ước kỹ thuật
Naming:

API routes: kebab-case (call-next, skip-ticket)
Components: PascalCase
Stores/hooks: camelCase (auth.store.ts, useQueue.ts)
DB fields: snake_case (Prisma default)

Error handling:

API trả về { error: string, code: string } nhất quán
HTTP status đúng nghĩa: 401 (unauth), 403 (forbidden), 409 (conflict/race), 422 (validation)
Client: Sonner toast cho lỗi người dùng thấy được

Auth flow:

JWT payload: { userId, role, exp }
Token lưu httpOnly cookie — không localStorage
Middleware check cookie trước khi render bất kỳ protected page nào

SSE pattern:
GET /api/sse/queue?serviceId=xxx
→ text/event-stream
→ server broadcast khi có thay đổi queue
→ client EventSource tự reconnect khi drop
Queue ordering:

Ticket có field position (integer) — đây là nguồn sự thật thứ tự
createdAt chỉ để audit, KHÔNG dùng để sort
Skip: tăng position của ticket bị skip lên sau N ticket tiếp theo
Restore: set position = min(position) - 1 của hàng đợi hiện tại


E. Migration Notes
Port cẩn thận:

Logic TTS format "M-ờ-i s-ố A-0-0-1" (tách ký tự) — giữ nguyên
Màu status LiveTracker (4 màu) — giữ nguyên CSS value
Skip rule defaults (1, 3, 5, MISSED) — seed vào Settings table
Kiosk trigger bằng ?kiosk=true — giữ nguyên URL param

Viết lại hoàn toàn:

Queue ordering logic (position field thay createdAt hack)
Auth system (Jose JWT thay localStorage)
Real-time (SSE thay polling)
Stats calculation (real SQL thay mock)
Counters API (bỏ hẳn Supabase client)

Bỏ hoàn toàn, không port:

/print, /qr và Supabase JS client
Backdoor password "admin123"
Math.random() trong stats
Demo offline hardcode fallback


F. Rủi ro rebuild
Rủi roMức độXử lýRace condition callNext — khó test thủ công🔴 HighViết integration test riêng cho Module 4 trước khi lên prodSSE connection trên môi trường Vercel (timeout 10s)🟠 MedTest deploy sớm, cân nhắc Vercel Edge nếu cầnPosition field bị desync nếu có concurrent skip🟠 MedWrap toàn bộ skip/restore trong transactionSeed demo data cho /demo phải có JWT thật🟡 LowTạo script seed riêng cho demo users

G. Task Granularity Guideline
Giao thẳng Gemini Code Assist (Lean):

Tạo file, component UI không có logic phức tạp
CRUD API đơn giản (Services, Staff, Settings)
CSS / layout / shadcn wiring
Seed files

Qua Antigravity planning trước:

Queue core logic (callNext transaction, skip/restore với position)
SSE infrastructure (broadcast helper, multi-subscriber)
Auth middleware + JWT flow
Stats query phức tạp (avgWaitTime, group by hour)
Demo Showcase (JWT demo injection)