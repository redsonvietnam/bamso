# BCA Portal — Assets

Nguồn: https://dichvucong.bocongan.gov.vn/ (Cổng DVC Bộ Công an)
Tải ngày: 2026-08-08 (thu HTML + CSS tham chiếu)

## Hình ảnh

| File | Kích thước | Vai trò |
|------|-----------|---------|
| `huy-hieu-cong-an-nhan.png` | 147 x 119 | Logo / favicon (huy hiệu CAND) |
| `bg-head-new.png` | 1440 x 133 | Nền header (viền đỏ trắng) |
| `bg-bca-footer-1.png` | 2500 x 375 | Nền footer (nền xanh + sông hạ họa tiết) |
| `sen.png` | 5307 x 1167 | Nền khối tìm kiếm (hoa sen) |
| `bannerdvc1722331100_1724376567.jpg` | 2500 x 375 | Banner top 1 |
| `bannnerbca1722331117_1724376522.jpg` | 2500 x 375 | Banner top 2 |
| `chim-hac.png` | 57 x 45 | Icon chim hạc (phần "Giới thiệu TTHC mới") |
| `icon-tt.png` | 14 x 17 | Icon thủ tục |
| `cccd.png` | 45 x 35 | Icon mặc định nhóm lĩnh vực |
| `dvc*.png` (10 ảnh) | ~26–45 px | Icon các nhóm lĩnh vực (đăng ký xe, xuất nhập cảnh, PCCC, cư trú, CCCD, ngành nghề KD, con dấu, vũ khí…) |

Ghi chú: 3 ảnh `bg.png`, `bg1.png`, `background-footer.png` được `style.css` tham chiếu qua `../img/` nhưng **404 trên server** (reference legacy) — không tải được.

## Phối màu

Trích từ `bca_style.css` + `style.css` (theo tần suất xuất hiện):

### Chủ đạo
| Hex | Vai trò |
|-----|---------|
| `#d71920` | Đỏ chủ đạo — header, button, tiêu đề (46 lần) |
| `#2b91dc` | Xanh dương sáng — link, hover, focus |
| `#046fce` / `#047ddc` | Xanh dương button/primary |
| `#0066bd` | Xanh dương đậm |
| `#1386e0` | Xanh dương nhạt (bán trong suốt `cf`) |
| `#256390` | Xanh biển trầm |

### Phụ trợ / trạng thái
| Hex | Vai trò |
|-----|---------|
| `#c4060f` / `#b30a10` / `#b50202` | Đỏ đậm hover |
| `#19b934` | Xanh lá success |
| `#ffee58` / `#f4b10f` | Vàng highlight |
| `#fe9000` | Cam cảnh báo |
| `#ec1b22` | Đỏ (bán trong suốt `9e`) |
| `#4d09b3` | Tím |

### Neutral / text
| Hex | Vai trò |
|-----|---------|
| `#1e2f41` | Xanh than — text tối |
| `#333` / `#555` / `#222` | Text |
| `#7f8fa4` / `#9ea0a2` | Text xám |
| `#fff` / `#ffffff` | Nền trắng |
| `#eee` / `#f6f6f6` / `#fafafa` | Nền xám nhạt |
| `#d7d7d7` / `#e5e5e5` / `#ddd` | Border |
| `#3c8dbc` | Admin/panel (bootstrap skin) |

## CSS nguồn
- `https://dichvucong.bocongan.gov.vn/apps/bocongan/resources/css/bca_style.css`
- `https://dichvucong.bocongan.gov.vn/apps/bocongan/resources/css/style.css`
- `https://dichvucong.bocongan.gov.vn/apps/bocongan/resources/css/combo-tree.css`
