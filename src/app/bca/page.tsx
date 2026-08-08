import { ArrowRight, Ticket, RefreshCw, Monitor } from "lucide-react";
import Link from "next/link";
import { BcaSearchBlock } from "@/components/bca/bca-search-block";
import { BcaCategoryGrid } from "@/components/bca/bca-category-grid";

const ANNOUNCEMENTS = [
  "Đăng ký xe lần đầu trực tuyến toàn trình đối với xe sản xuất, lắp ráp trong nước",
  "Cung cấp dịch vụ đăng ký xe trực tuyến toàn trình từ 01/01/2025",
  "Quy định về cấp, thu hồi chứng nhận đăng ký xe, biển số xe cơ giới",
  "Thủ tục hành chính mới trong lĩnh vực quản lý xuất nhập cảnh",
];

const QUICK_ACTIONS = [
  {
    title: "Lấy số trực tuyến",
    description: "Đặt chỗ trước, đến đúng giờ, không chờ đợi lâu",
    href: "/",
    icon: Ticket,
  },
  {
    title: "Tra cứu hồ sơ",
    description: "Theo dõi trạng thái hồ sơ theo thời gian thực",
    href: "/track",
    icon: RefreshCw,
  },
  {
    title: "Bảng hiển thị",
    description: "Màn hình công khai số đang phục vụ, hàng đợi",
    href: "/display",
    icon: Monitor,
  },
];

export default function BcaPortalPage() {
  return (
    <div className="flex min-h-screen flex-col bg-bca-paper">
      {/* Hero banner */}
      <section
        className="relative w-full overflow-hidden bg-cover bg-center"
        style={{ backgroundImage: "url(/brand/bca/bannerdvc1722331100_1724376567.jpg)" }}
      >
        <div className="mx-auto flex min-h-[220px] max-w-6xl flex-col items-start justify-center px-4 py-12 sm:px-6 md:min-h-[280px]">
          <span className="mb-3 inline-flex items-center rounded-full bg-bca-red px-3 py-1 text-xs font-semibold uppercase tracking-wider text-white shadow">
            Dịch vụ công trực tuyến
          </span>
          <h1 className="max-w-xl text-2xl font-bold uppercase leading-tight text-white drop-shadow-md sm:text-3xl md:text-4xl">
            Giải quyết thủ tục hành chính
            <span className="block text-bca-cream">nhanh — minh bạch — tiện lợi</span>
          </h1>
          <Link
            href="/"
            className="mt-6 inline-flex items-center gap-2 rounded bg-bca-red px-6 py-3 text-sm font-semibold text-white shadow-lg transition hover:bg-bca-red-dark"
          >
            Lấy số trực tuyến <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      {/* Announcements marquee */}
      <div className="border-b border-bca-red/20 bg-white">
        <div className="mx-auto flex max-w-6xl items-center gap-4 overflow-hidden px-4 py-2.5 sm:px-6">
          <span className="shrink-0 rounded bg-bca-red px-2 py-0.5 text-xs font-bold uppercase text-white">
            Thông báo
          </span>
          <div className="overflow-hidden">
            <ul className="flex flex-col gap-1">
              {ANNOUNCEMENTS.map((item) => (
                <li key={item} className="truncate text-sm text-foreground/90">
                  <a href="/bca" className="transition hover:text-bca-red">
                    {item}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <BcaSearchBlock />

      {/* Quick actions */}
      <section className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
        <div className="grid gap-5 md:grid-cols-3">
          {QUICK_ACTIONS.map((action) => {
            const Icon = action.icon;
            return (
              <a
                key={action.href}
                href={action.href}
                className="group flex items-start gap-4 rounded-lg border border-border bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-bca-red/50 hover:shadow-md"
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-bca-red/10 text-bca-red">
                  <Icon className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="font-bold text-foreground group-hover:text-bca-red">
                    {action.title}
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">{action.description}</p>
                </div>
              </a>
            );
          })}
        </div>
      </section>

      {/* Intro banner strip with chim-hac */}
      <section className="mx-auto flex w-full max-w-6xl items-center gap-3 px-4 sm:px-6">
        <div className="flex items-center gap-3 rounded-lg border border-bca-red/20 bg-white px-4 py-3 shadow-sm">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/bca/chim-hac.png"
            alt=""
            aria-hidden="true"
            className="h-9 w-9 object-contain"
          />
          <h2 className="text-base font-bold uppercase tracking-wide text-foreground">
            Giới thiệu thủ tục hành chính mới
          </h2>
        </div>
      </section>

      <BcaCategoryGrid />
    </div>
  );
}
