"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";

const SIX_DIEU = [
  "Đối với tự mình, phải cần, kiệm, liêm, chính",
  "Đối với đồng sự, phải thân ái giúp đỡ",
  "Đối với Chính phủ, phải tuyệt đối trung thành",
  "Đối với nhân dân, phải kính trọng, lễ phép",
  "Đối với công việc, phải tận tụy",
  "Đối với địch, phải cương quyết, khôn khéo",
];

export function BcaSearchBlock() {
  const router = useRouter();
  const [keyword, setKeyword] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    router.push(`/track?q=${encodeURIComponent(keyword.trim())}`);
  };

  return (
    <section
      className="relative min-h-[300px] w-full overflow-hidden bg-cover bg-bottom"
      style={{ backgroundImage: "url(/brand/bca/sen.png)" }}
    >
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:px-6 lg:grid-cols-[1.05fr_1.15fr] lg:items-center">
        {/* 6 Điều Bác Hồ dạy CAND */}
        <div className="rounded-lg border border-bca-red/20 bg-white/90 p-5 shadow-lg backdrop-blur-sm">
          <h4 className="mb-3 text-sm font-bold uppercase tracking-widest text-bca-red">
            6 Điều Bác Hồ dạy Công an nhân dân
          </h4>
          <ul className="space-y-1.5 text-sm text-foreground">
            {SIX_DIEU.map((item) => (
              <li key={item} className="flex gap-2">
                <span className="mt-0.5 text-bca-red">•</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Search box — BCA red button */}
        <div>
          <form onSubmit={submit} className="flex items-stretch overflow-hidden rounded shadow-lg">
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="Nhập từ khóa tìm kiếm thủ tục..."
              aria-label="Tìm kiếm thủ tục"
              className="h-12 flex-1 bg-white px-4 text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
            <button
              type="submit"
              className="flex h-12 w-14 shrink-0 items-center justify-center bg-bca-red text-white transition hover:bg-bca-red-dark"
              aria-label="Tìm kiếm"
            >
              <Search className="h-5 w-5" />
            </button>
          </form>
          <p className="mt-3 text-right text-xs font-medium text-foreground/80">
            Tìm kiếm nâng cao →
          </p>
        </div>
      </div>
    </section>
  );
}
