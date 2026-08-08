# Design Tokens — Perspective

This file defines the active visual language for Bamso UI.

## Theme overview

- Brand color: **Primary navy** — trust-first, state/authority feel (Công an xã / dịch vụ công).
- Brand accents: **Red** for the state banner strip, **Gold** for highlights and numbers on navy.
- Backgrounds: soft neutral `#F8FAFC` and white surfaces.
- Text: high-contrast dark foreground with subtle muted text for secondary content.
- Shapes: gentle rounded corners and soft shadows.

## Color tokens

- `primary` (navy): `#142E6B` (`hsl(222 68% 25%)`)
- `primary-foreground`: `#FFFFFF`
- `brand-red`: `#C8102E` (state band, Công an red)
- `brand-gold`: `#C9A227` (highlights, stars, numbers on navy)
- `brand-navy`: `#142E6B` (alias of primary)
- `brand-navy-deep`: `#0B1C47` (display board background)
- `foreground`: `#111827`
- `muted-foreground`: `#6B7280`
- `background`: `#F8FAFC`
- `surface`: `#FFFFFF`
- `surface-muted`: `#F1F5F9`
- `border`: `#E2E8F0`
- `border-strong`: `#CBD5E1`
- `success`: `#22C55E`
- `danger`: `#EF4444`
- `warning`: `#F59E0B`

## Typography

- Body family: **Be Vietnam Pro** (`--font-sans`) — optimized for Vietnamese diacritics.
- Display family: **theo theme** — `chinh-quy` = **Oswald**, `doodle` = **Shantell Sans** (subset `vietnamese`). Runtime var `--font-display` đổi theo class theme (xem mục Multi-theme).
- Mono family: JetBrains Mono (`--font-mono`) for timestamps and data figures.
- Scale:
  - `display-xl`: very large uppercase hero headings
  - `heading-lg`: bold section headings
  - `body-lg`: large body text for emphasis
  - `body`: normal paragraph text
  - `muted`: smaller text for hints and captions

## Spacing

- Use a modular spacing scale: `4`, `8`, `12`, `16`, `24`, `32`, `40`, `48`.
- Apply consistent padding inside cards and sections.
- Keep horizontal layouts responsive; stack vertically on smaller screens.

## Elevation & surfaces

- Primary surfaces: `surface` with subtle shadow.
- Secondary surfaces: `surface-muted` or light gray backgrounds.
- Cards: rounded corners with a minimal ring or border.
- Display board: nền sáng theo theme (`bg-background`/`bg-card`/`text-foreground`), accent qua token `--display-*`.

## Components guidance

- **Agency header** (public/login, `src/components/ui/agency-header.tsx`) và header admin/canbo dùng chung chrome: nền `bg-white/80 backdrop-blur-sm` + viền trên `border-t-4 border-brand-red` (dải đỏ) + `border-b`, chữ tối, emblem `DongSonSun` vàng. Kiosk/test-mode dùng cùng ngôn ngữ: dải `h-1.5 bg-brand-red` + header trắng, accent theo theme token (`bg-primary`), không còn navy cứng.
- Buttons:
  - Primary: `primary` (navy) background, white text.
  - Secondary: neutral background, dark text.
  - Ghost: transparent background with border.
- Alerts:
  - Success: light green background with strong green accent.
  - Warning: light amber background with amber accent.
  - Danger: light red background with red accent.
- Status cues (queue): PENDING slate/amber, CALLED amber, IN_PROGRESS blue, COMPLETED green, MISSED orange.
- Forms:
  - Use clear labels and spacing.
  - Inputs should use `surface` background and `border`.

## Motif trống đồng

- Identity motif trống đồng Đông Sơn. Dùng **PNG tách nền** `public/brand/trong-dong-gold.png` (copy từ `downloads/trong_dong/TRONG_DONG_02.png`) làm watermark trang trí.
- Component `PageWatermark` (`src/components/ui/dong-son-motif.tsx`): layer `absolute`, `pointer-events-none`, `aria-hidden`, nằm sau content; chỉnh vị trí/kích thước/opacity qua `className`.
- `DongSonSun` (SVG vẽ tay) giữ làm **emblem** logo trong `agency-header`.
- Usage discipline (giữ contrast cho app khu vực công):
  - Trang nền sáng: watermark vàng opacity **5–6%**, lệch góc, không tiled phía sau chữ.
  - Bảng gọi số: opacity **10%** trên nền sáng.
  - Luôn `pointer-events-none` + `aria-hidden`; không che tương tác.

## Hand-drawn (doodle) treatment — mức "nhẹ"

- Nguyên tắc: giữ trọn brand navy/gold/red + motif trống đồng; chỉ thêm nét viết tay **có chừng mực** (imperfection intentional). Không phủ doodle dày lên toàn app.
- **Typography**: display family đổi **Oswald → Shantell Sans** (`--font-display`, `weight 400–700`, subset `vietnamese` — Delius Swash Caps không có tiếng Việt nên loại). Quy tắc `h1, h2` tự dùng `--font-display`. Body giữ Be Vietnam Pro, mono giữ JetBrains Mono.
- **Utilities** (định nghĩa trong `globals.css`, unlayered để thắng Tailwind):
  - `.sketch-radius` — góc bo theo đường tay vẽ (`255px 15px 225px 15px / ...`), áp cho **card chính** (chọn dịch vụ, ticket, track, login) và **nút dịch vụ** kiosk/test-mode/canbo.
  - `.sticker` — nghiêng `-2deg` + offset shadow navy, áp cho **badge trạng thái / connection pill** (WaitingTracker, kiosk/test-mode, DisplayBoard).
- Không áp sketch cho: admin panel rộng chứa bảng, input, button (giữ sạch để không mất tính chính quy).
- Hệ quả khi theme `doodle`: số vé trên bảng gọi số (`text-[12rem]`/`text-7xl`) và `QueueStatusCard` (`text-6xl`) thành chữ viết tay — chấp nhận theo định hướng.

## Multi-theme (`next-themes`, class-based)

- Dùng `next-themes` với `attribute="class"`, 4 theme: **`doodle`** (hand-drawn, mặc định), **`chinh-quy`** (Oswald + không sketch), **`riso`** (risograph), **`glass`** (glassmorphism gradient). Lựa chọn persist `localStorage` theo thiết bị.
- Setup trong `src/app/layout.tsx`: `<ThemeProvider defaultTheme="doodle" themes={["doodle","chinh-quy","riso","glass"]} enableSystem={false} disableTransitionOnChange>`; `<html suppressHydrationWarning>`; cả 4 font display load song song (`--font-oswald`, `--font-shantell`, `--font-space-grotesk` + body `--font-sans`).
- **Font**: `:root { --font-display: var(--font-oswald) }`; `.doodle { --font-display: var(--font-shantell) }`; `.riso` và `.glass` dùng `--font-space-grotesk` (globals.css `@layer base`). Utility `font-display` (dùng ở DisplayBoard, QueueStatusCard) follow `var(--font-display)` nên đổi theo theme tự động.
- **Sketch/sticker**: `.sketch-radius` và `.sticker` chỉ có hiệu lực khi ở trong `.doodle` (selector `.doodle .sketch-radius`). Theme `chinh-quy` → 2 class này inert, card fallback về `rounded-*` gốc.
- **Display board theo theme**: `DisplayBoard` nền **sáng** như homepage (`bg-background`/`bg-card`/`text-foreground`/`text-muted-foreground`/`border-border` — tự theo theme, không còn nền navy riêng). Chỉ còn accent là token `--display-*` (globals.css `:root` + `.riso` + `.glass`): `--display-accent` (vàng cho chinh-quy/doodle, fluorescent pink cho riso, indigo cho glass), `--display-red` (dải đỏ Công an), `--display-accent-{10,15,20,30}` (alpha qua `color-mix`) dùng cho vạch/dot/viền card active/highlight, bell ring.
- **Switcher**: `ThemeSwitcher` (`src/components/theme/theme-switcher.tsx`) — pill nổi góc phải dưới, ẩn trên `/display`. Dùng `useTheme()`; nút active nền `bg-primary`. Muốn giấu trên màn hình khác thì thêm điều kiện `pathname`.

## Riso theme (risograph, hai màu)

- Nguồn: TypeUI design skill `riso`. Tinh thần: **paper + federal blue + fluorescent pink** — xanh cấu trúc, hồng tương tác, bóng in offset không blur (misregistration, không elevation mềm).
- **Paper**: `--background: 38 100% 96%` (#FFF8EC), card = `#FFFFFF` (object-surface); không đổi nền section thành trắng xám lạnh. **Body font giữ Be Vietnam Pro** (tiếng Việt chuẩn hơn); **display font = Space Grotesk** (`--font-space-grotesk`, subset vietnamese). Mono giữ JetBrains Mono.
- **Mapping token** (khối `.riso` trong `globals.css`):
  - `--primary` = federal blue `#2C40A7` (`230 58% 41%`) → header/button chính vẫn xanh tin cậy (gần navy brand).
  - `--accent` = pale pink `326 88% 92%` (highlight/hover); `--ring` = fluorescent pink `326 88% 58%` (focus ring — tín hiệu "chạm vào").
  - `--border`/`--input` = ink-blue `212 38% 80%`; `--radius` giảm `0.375rem` (góc sắc kiểu in).
  - `--brand-red`/`--brand-gold` giữ nguyên; `--display-*` cũng remap sang paper/ink (display board nền sáng, chỉ còn accent qua token).
- **Utilities** (chỉ tác dụng trong `.riso`):
  - `.riso-paper-card` — card in: viền 2px `--color-primary` + `box-shadow: 6px 6px 0 0` (offset shadow xanh, no blur). Áp cùng các vị trí đã có `sketch-radius` (card chính, nút dịch vụ kiosk/test-mode/canbo).
  - `.riso body` — halftone grain nhẹ (`radial-gradient` dots 7%, 16px grid) trên paper canvas, không giảm contrast.
- **Anti-pattern giữ nguyên theo spec**: không dùng hồng cho body text nhỏ, không soft shadow/glass/gradient, hồng chỉ cho interaction (focus/selected/emphasis), semantic colors (success/warning/danger) chỉ cho feedback thật.

## Glassmorphism Gradient theme (frosted glass)

- Tinh thần: **Liquid Glass kiểu iOS mới nhất** (web approximation qua `backdrop-filter` + viền lớp — không có CSS chính thức của Apple) — frosted blur mạnh + sheen gradient trắng + rim nhiều lớp + shadow tinted, đặt trên **mesh gradient pastel**.
- **Nền**: `.glass body` = mesh gradient cố định (indigo/cyan/rose nhạt — `radial-gradient` 5 lớp, `background-attachment: fixed`, không neon/AI-purple nặng). `--background: 226 60% 97% / 0.35` **translucent** nên gradient hiện xuyên qua mọi container `bg-background`.
- **Surface**: `--card/--muted/--secondary/--input` translucent trắng; `--border` = `0 0% 100% / 0.6` (viền trắng). **Liquid glass** qua rule unlayered: `.glass [class~="bg-card"]` → `blur(40px) saturate(1.8)` + sheen `linear-gradient(180deg, white/0.65 → white/0.12)` + tint indigo góc (`linear-gradient(135deg, indigo/0.1)`) + rim (inset top `white/0.8`, bottom `white/0.1`, hairline `0.5px`) + **inner glow `inset 0 0 12px 6px white/0.3`** + drop shadow `0 24px 60px indigo/0.2`. Header mờ (`bg-white/80`, `bg-white/90`) → `rgb(255 255 255 / 0.22)` + sheen + `blur(30px)`, rim trên/dưới.
- **Key cards** (class `glass-card` — áp tại 9 điểm đã dùng `sketch-radius riso-paper-card`: GetTicketFlow, QueueStatusCard, waiting/track/login, kiosk/test-mode/canbo service cards): full liquid-glass — `blur(32px) saturate(1.6)`, bg `white/0.2` + sheen, viền `1px white/0.35`, **inner glow `inset 0 0 12px 6px white/0.45`**, `position: relative; overflow: hidden`, kèm **đường sáng specular** `::before` (1px ngang đỉnh: `transparent → white/0.85 → transparent`) và `::after` (1px dọc trái: `white/0.8 → transparent → white/0.3`) — khúc xạ ánh sáng theo cạnh kính. Class `glass-card` inert ở 3 theme còn lại (scope `.glass`).
- **Button**: nút primary (`button/a[class~="bg-primary"]`) → gradient **indigo→violet** (`135deg hsl(243 78% 60%) → hsl(262 84% 58%)`) + inset highlight + shadow `0 12px 32px indigo/0.35`, hover `brightness(1.08)`. Nút outline (`button[class~="border-input"]`) → glass chip trắng mờ + viền trắng + `blur(20px)`.
- **Primary**: indigo `243 75% 55%` (nâng từ brand navy, giữ cảm giác nhà nước hiện đại). Giữ `--brand-red`/`--brand-gold`. `--radius: 1.25rem` (bo lớn, mềm). Display font = Space Grotesk. `--display-accent: #6366F1` (indigo).
- **A11y**: `--foreground` tối `226 45% 12%` đủ contrast trên nền mờ; `@media (prefers-reduced-transparency: reduce)` → surface về đục (không blur, không sheen gradient, `--card` solid trắng).
- **Ràng buộc**: chỉ thêm class `glass-card` (inert ngoài `.glass`) tại 9 điểm card chính đã có `sketch-radius riso-paper-card`; mọi surface khác tự frost qua theme token. Giữ camera `bg-black`, `text-white` trên `bg-primary`, semantic status.

## BCA theme (`cong-an` portal, lấy cảm hứng dichvucong.bocongan.gov.vn)

- Tinh thần: **federal red + cream paper + blue links** — đỏ Công an `#D71920` làm hành động chính, xanh `#046FCE` cho link/emblem, nền giấy kem `#FBF5E8`, text `#1E2F41`. Form chính quy, flat, không hand-drawn.
- **Token** (khối `.bca` trong `globals.css`): `--primary` = đỏ `358 79% 47%` (#D71920); `--accent` = xanh `208 96% 41%` (#046FCE); `--background` = giấy kem `45 100% 97%`; `--muted-foreground` ≈ `#7F8FA4`; `--radius 0.5rem`. Display font giữ **Be Vietnam Pro** (không đổi `--font-display`). `--display-accent` = đỏ #D71920.
- **Brand tokens** thêm vào `@theme inline`: `--color-bca-red` `#D71920`, `--color-bca-red-dark` `#B30A10`, `--color-bca-blue` `#046FCE`, `--color-bca-cream` `#ffeeaa`, `--color-bca-paper` `#FBF5E8` — dùng trong các thành phần showcase portal.
- **Treatment** (unlayered, scope `.bca`): nền canvas giấy kem; button `bg-primary` đỏ + shadow; card trắng viền mảnh; `AgencyHeader` dải đỏ trên đậm hơn (6px) và **đổi emblem DongSonSun → huy hiệu CAND** (`useTheme()` trong `agency-header.tsx`).
- **Assets** tại `public/brand/bca/` (copy từ `assets/bca-portal/`, nguồn dichvucong.bocongan.gov.vn): `bg-head-new.png` (banner đầu), `huy-hieu-cong-an-nhan.png` (logo), `sen.png` (nền khối tìm kiếm), `bg-bca-footer-1.png` (footer kem + họa tiết), 2 banner `.jpg`, `chim-hac.png`, 10 icon lĩnh vực.
- **Trang showcase**: `/bca` dựng layout portal (header banner + nav đỏ + khối tìm kiếm sen + grid danh mục + footer) bằng các component `src/components/bca/*`. Lưu ý ảnh nền portal đều nền **kem sáng** nên text đặt trên phải dùng màu tối (`text-foreground`).
- Anti-pattern: không nhồi doodle/sketch vào theme này (chính quy tuyệt đối); đỏ chỉ cho action/emblem chủ đạo, không cho body text nhỏ.

## How to use

- For any UI change, reference this file first.
- **Màu trung tính phải dùng theme token, không hardcode slate/white**: card/panel = `bg-card`, heading = `text-foreground`, phụ đề = `text-muted-foreground`, viền = `border-border`, nền nhạt = `bg-muted`, shadow màu = `shadow-border/N`. Toàn app đã sweep xong (2026) — giữ nguyên khi sửa mới. Ngoại lệ giữ cứng: `bg-brand-red`/`bg-brand-gold`, semantic status (amber/blue/emerald/rose), camera viewport `bg-black` + `text-white`, kính mờ `bg-white/80`, chữ trắng trên `bg-primary`.
- If a new token is needed, add it to `globals.css` `@theme inline` (e.g. `--color-brand-*`) and use it consistently across components.
- Keep the UI aligned with the navy / red / gold state-service brand rather than creating a new visual direction.
