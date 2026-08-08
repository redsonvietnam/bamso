import Link from "next/link";

const CATEGORIES = [
  { name: "Lý lịch tư pháp", icon: "/brand/bca/cccd.png" },
  { name: "Sát hạch, cấp giấy phép lái xe", icon: "/brand/bca/dvcDangKyXe_1741117612.png" },
  { name: "Đảm bảo an ninh hàng không", icon: "/brand/bca/dvcXuatNhapCanh_1741117622.png" },
  { name: "An toàn thông tin, an ninh mạng", icon: "/brand/bca/cccd.png" },
  { name: "Tổ chức cai nghiện ma túy", icon: "/brand/bca/cccd.png" },
  { name: "Đăng ký, quản lý phương tiện giao thông", icon: "/brand/bca/dvcDangKyXe_1741117612.png" },
  { name: "Quản lý xuất nhập cảnh", icon: "/brand/bca/dvcXuatNhapCanh_1741117622.png" },
  { name: "Bảo vệ dữ liệu cá nhân", icon: "/brand/bca/cccd.png" },
  { name: "Phòng cháy, chữa cháy", icon: "/brand/bca/dvcPCCC_1741117571.png" },
  { name: "Đăng ký, quản lý cư trú", icon: "/brand/bca/dvcCuTru_1741117639.png" },
  { name: "Cấp, quản lý căn cước", icon: "/brand/bca/dvccccd_1741117657.png" },
  { name: "Ngành nghề kinh doanh có điều kiện", icon: "/brand/bca/dvcdacdoanh_1741117819.png" },
  { name: "Đăng ký, quản lý con dấu", icon: "/brand/bca/dvcConDau_1741117717.png" },
  { name: "Vũ khí, vật liệu nổ, công cụ hỗ trợ", icon: "/brand/bca/dvcVuKhi_1741117834.png" },
];

export function BcaCategoryGrid() {
  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
      <div className="mb-6 flex items-center gap-2">
        <span className="h-6 w-1.5 rounded-full bg-bca-red" />
        <h2 className="text-lg font-bold uppercase tracking-wide text-foreground">
          Danh mục thủ tục hành chính
        </h2>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {CATEGORIES.map((cat) => (
          <Link
            key={cat.name}
            href="/"
            className="group flex h-full min-h-[104px] flex-col items-center justify-center gap-3 rounded-lg border border-border bg-white p-4 text-center shadow-sm transition hover:-translate-y-0.5 hover:border-bca-red/50 hover:shadow-md"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={cat.icon}
              alt=""
              aria-hidden="true"
              className="h-11 w-11 object-contain"
            />
            <p className="text-sm font-medium leading-snug text-foreground group-hover:text-bca-red">
              {cat.name}
            </p>
          </Link>
        ))}
      </div>
    </section>
  );
}
